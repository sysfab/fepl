import type {
    Program,
    Stmt,
    Expr,
    TemplatePart,
    BlockStmt,
    EnumMember,
    DictEntry,
    LetStmt,
    BindingPattern,
    VarStmt,
} from "../ast/ast";
import { Backend, CodegenContext } from "./backend";

// ─── JS Backend ───────────────────────────────────────────────────────────────
//
// Translates a FEPL AST into plain JavaScript.  FEPL maps almost 1-to-1 onto
// JS, so most nodes are trivial.  The notable differences are:
//
//   • `let` declarations          → `let` (identical)
//   • `func name(p) { ... }`     → `function name(p) { ... }`
//   • `(p) => { ... }`           → `(p) => { ... }`  (identical)
//   • template literals           → identical backtick syntax
//   • `Group` node (parenthesised expr) → wrap in `( )`
//   • `IfStmt` alternate          → `else { ... }` block

export class JsBackend implements Backend {
    readonly id = "js";
    readonly fileExtension = ".js" as const;

    // ── Entry point ───────────────────────────────────────────────────────────

    generate(program: Program): string {
        const ctx = new CodegenContext();
        for (const stmt of program.stmts) {
            this.emitStmt(stmt, ctx);
        }
        return ctx.toString();
    }

    // ── Statements ────────────────────────────────────────────────────────────

    emitStmt(stmt: Stmt, ctx: CodegenContext): void {
        switch (stmt.kind) {
            case "ExprStmt":
                ctx.line(`${this.emitExpr(stmt.expr, ctx)};`);
                break;

            case "LetStmt":
                ctx.line(`let ${this.emitLetBinding(stmt)} = ${this.emitExpr(stmt.value, ctx)};`);
                break;

            case "VarStmt":
                ctx.line(`var ${this.emitLetBinding(stmt)} = ${this.emitExpr(stmt.value, ctx)};`);
                break;

            case "ReturnStmt":
                if (stmt.value === null) {
                    ctx.line("return;");
                } else {
                    ctx.line(`return ${this.emitExpr(stmt.value, ctx)};`);
                }
                break;

            case "CommentStmt": {
                const lines = stmt.value.split("\n");
                for (const line of lines) {
                    ctx.line(line);
                }
                break;
            }

            case "ImportStmt": {
                const clause = this.emitImportClause(stmt);
                const source = `"${stmt.source.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
                if (clause === "") {
                    ctx.line(`import ${source};`);
                } else {
                    ctx.line(`import ${clause} from ${source};`);
                }
                break;
            }

            case "FuncDecl":
                ctx.line(`function ${stmt.name}(${stmt.params.join(", ")}) {`);
                ctx.push();
                for (const s of stmt.body.stmts) {
                    this.emitStmt(s, ctx);
                }
                ctx.pop();
                ctx.line("}");
                break;

            case "IfStmt": {
                ctx.line(`if (${this.emitExpr(stmt.condition, ctx)}) {`);
                ctx.push();
                for (const s of stmt.consequent.stmts) {
                    this.emitStmt(s, ctx);
                }
                ctx.pop();
                if (stmt.alternate) {
                    ctx.line("} else {");
                    ctx.push();
                    for (const s of stmt.alternate.stmts) {
                        this.emitStmt(s, ctx);
                    }
                    ctx.pop();
                    ctx.line("}");
                } else {
                    ctx.line("}");
                }
                break;
            }

            case "WhileStmt": {
                ctx.line(`while (${this.emitExpr(stmt.condition, ctx)}) {`);
                ctx.push();
                for (const s of stmt.body.stmts) {
                    this.emitStmt(s, ctx);
                }
                ctx.pop();
                ctx.line("}");
                break;
            }

            case "ForInStmt": {
                ctx.line(`for (const ${stmt.iterator} of ${this.emitExpr(stmt.iterable, ctx)}) {`);
                ctx.push();
                for (const s of stmt.body.stmts) {
                    this.emitStmt(s, ctx);
                }
                ctx.pop();
                ctx.line("}");
                break;
            }

            case "ForStmt": {
                const init = this.emitForInit(stmt.init, ctx);
                const condition = stmt.condition ? this.emitExpr(stmt.condition, ctx) : "";
                const update = stmt.update ? this.emitExpr(stmt.update, ctx) : "";

                ctx.line(`for (${init}; ${condition}; ${update}) {`);
                ctx.push();
                for (const s of stmt.body.stmts) {
                    this.emitStmt(s, ctx);
                }
                ctx.pop();
                ctx.line("}");
                break;
            }

            case "Block":
                ctx.line("{");
                ctx.push();
                for (const s of stmt.stmts) {
                    this.emitStmt(s, ctx);
                }
                ctx.pop();
                ctx.line("}");
                break;


            case "EnumDecl": {
                // Emit as a frozen object — the idiomatic JS enum pattern:
                //   const Color = Object.freeze({ Red: 0, Green: 1, Blue: 2 });
                let counter = 0;
                const entries = stmt.members.map((m: EnumMember) => {
                    const val = m.value !== null
                        ? this.emitExpr(m.value, ctx)
                        : String(counter);
                    // Advance counter: if the member has an explicit numeric value,
                    // subsequent auto members continue from value + 1.
                    if (m.value !== null && typeof m.value === "object" && m.value.kind === "Number") {
                        counter = (m.value as { kind: "Number"; value: number }).value + 1;
                    } else {
                        counter++;
                    }
                    return `${m.name}: ${val}`;
                });
                ctx.line(`const ${stmt.name} = Object.freeze({ ${entries.join(", ")} });`);
                break;
            }

            default:
                throw new Error(`JsBackend: unhandled statement kind '${(stmt as Stmt).kind}'`);
        }
    }

    // ── Expressions ───────────────────────────────────────────────────────────

    emitExpr(expr: Expr, ctx: CodegenContext): string {
        switch (expr.kind) {
            case "Number":
                return String(expr.value);

            case "String":
                // Re-wrap in double quotes, escaping any double quotes in value
                return `"${expr.value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

            case "Ident":
                return expr.name;

            case "Template":
                return this.emitTemplate(expr.parts, ctx);

            case "Binary":
                return `${this.emitExpr(expr.left, ctx)} ${expr.op} ${this.emitExpr(expr.right, ctx)}`;

            case "Unary":
                return expr.prefix
                    ? `${this.emitPrefixUnary(expr.op)}${this.emitExpr(expr.operand, ctx)}`
                    : `${this.emitExpr(expr.operand, ctx)}${expr.op}`;

            case "Assign":
                return `${this.emitExpr(expr.target, ctx)} ${expr.op} ${this.emitExpr(expr.value, ctx)}`;

            case "Ternary":
                return (
                    `${this.emitExpr(expr.condition, ctx)} ? ` +
                    `${this.emitExpr(expr.consequent, ctx)} : ` +
                    `${this.emitExpr(expr.alternate, ctx)}`
                );

            case "Call": {
                const callee = this.emitExpr(expr.callee, ctx);
                const args   = expr.args.map(a => this.emitExpr(a, ctx)).join(", ");
                return `${callee}(${args})`;
            }

            case "Index":
                return `${this.emitExpr(expr.object, ctx)}[${this.emitExpr(expr.index, ctx)}]`;

            case "Member":
                return `${this.emitExpr(expr.object, ctx)}.${expr.property}`;

            case "Group":
                return `(${this.emitExpr(expr.inner, ctx)})`;

            case "ArrowFunc": {
                const params = expr.params.join(", ");
                const body   = this.emitBlockInline(expr.body, ctx);
                return `(${params}) => ${body}`;
            }


            case "List": {
                const els = expr.elements.map(e => this.emitExpr(e, ctx)).join(", ");
                return `[${els}]`;
            }

            case "Dict": {
                if (expr.entries.length === 0) return "{}";
                const pairs = expr.entries.map((e: DictEntry) => {
                    const key = e.key.kind === "Ident"
                        ? e.key.name                          // bare ident key → unquoted JS key
                        : `"${(e.key as { kind: "String"; value: string }).value}"`;
                    return `${key}: ${this.emitExpr(e.value, ctx)}`;
                });
                return `{ ${pairs.join(", ")} }`;
            }

            default:
                throw new Error(`JsBackend: unhandled expression kind '${(expr as Expr).kind}'`);
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Emit a template literal — parts map directly to JS backtick syntax. */
    private emitTemplate(parts: TemplatePart[], ctx: CodegenContext): string {
        const inner = parts
            .map(part => {
                if ("text" in part) {
                    // Escape backticks and backslashes inside the text span
                    return part.text.replace(/\\/g, "\\\\").replace(/`/g, "\\`");
                } else {
                    return `\${${this.emitExpr(part.expr, ctx)}}`;
                }
            })
            .join("");
        return `\`${inner}\``;
    }

    /**
     * Emit a block as an inline `{ ... }` string suitable for use inside an
     * arrow function expression.  Multi-statement bodies are indented.
     */
    private emitBlockInline(block: BlockStmt, ctx: CodegenContext): string {
        if (block.stmts.length === 0) return "{}";

        // Capture the current output length, emit into a scratch context at
        // the same depth, then extract only the new lines.
        const scratch = new CodegenContext();
        ctx.push();
        for (const s of block.stmts) {
            this.emitStmt(s, scratch);
        }
        ctx.pop();

        const inner = scratch.toString();

        if (block.stmts.length === 1) {
            // Single statement — keep on one line: { return x; }
            return `{ ${inner.trim()} }`;
        }

        // Multi-statement — emit indented block
        const indented = inner
            .split("\n")
            .map(l => `  ${l}`)
            .join("\n");
        return `{\n${indented}\n}`;
    }

    private emitForInit(init: LetStmt | VarStmt | Expr | null, ctx: CodegenContext): string {
        if (init === null) return "";
        if (init.kind === "LetStmt") {
            return `let ${this.emitLetBinding(init)} = ${this.emitExpr(init.value, ctx)}`;
        }
        if (init.kind === "VarStmt") {
            return `var ${this.emitLetBinding(init)} = ${this.emitExpr(init.value, ctx)}`;
        }
        return this.emitExpr(init, ctx);
    }

    private emitLetBinding(stmt: LetStmt | VarStmt): string {
        if ("name" in stmt) {
            return stmt.name;
        }
        return this.emitBindingPattern(stmt.pattern);
    }

    private emitBindingPattern(pattern: BindingPattern): string {
        switch (pattern.kind) {
            case "IdentPattern":
                return pattern.name;

            case "ListPattern":
                return `[${pattern.elements.map(e => this.emitBindingPattern(e)).join(", ")}]`;

            case "ObjectPattern": {
                const props = pattern.properties.map((prop) => {
                    if (prop.binding.kind === "IdentPattern" && prop.binding.name === prop.key) {
                        return prop.key;
                    }
                    return `${prop.key}: ${this.emitBindingPattern(prop.binding)}`;
                });
                return `{ ${props.join(", ")} }`;
            }
        }
    }

    private emitImportClause(stmt: Extract<Stmt, { kind: "ImportStmt" }>): string {
        const chunks: string[] = [];

        if (stmt.defaultImport !== null) {
            chunks.push(stmt.defaultImport);
        }

        if (stmt.namespaceImport !== null) {
            chunks.push(`* as ${stmt.namespaceImport}`);
        }

        if (stmt.namedImports.length > 0) {
            const named = stmt.namedImports
                .map(spec => (spec.imported === spec.local ? spec.imported : `${spec.imported} as ${spec.local}`))
                .join(", ");
            chunks.push(`{ ${named} }`);
        }

        return chunks.join(", ");
    }

    private emitPrefixUnary(op: string): string {
        return /[a-zA-Z]$/.test(op) ? `${op} ` : op;
    }
}

// ─── Convenience factory ──────────────────────────────────────────────────────

export const jsBackend = new JsBackend();

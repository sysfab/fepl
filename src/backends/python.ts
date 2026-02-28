import type {
    BindingPattern,
    BlockStmt,
    DictEntry,
    EnumMember,
    Expr,
    LetStmt,
    Program,
    Stmt,
    TemplatePart,
    VarStmt,
} from "../ast/ast";
import { Backend, CodegenContext } from "./backend";

export class PythonBackend implements Backend {
    readonly id = "python";
    readonly fileExtension = ".py" as const;

    private needsEnumImport = false;
    private tempVarCounter = 0;

    generate(program: Program): string {
        this.needsEnumImport = false;
        this.tempVarCounter = 0;

        const bodyCtx = new CodegenContext("    ");
        for (const stmt of program.stmts) {
            this.emitStmt(stmt, bodyCtx);
        }

        const header: string[] = [];
        if (this.needsEnumImport) {
            header.push("from enum import IntEnum");
        }

        const body = bodyCtx.toString();
        if (header.length > 0 && body.length > 0) {
            return `${header.join("\n")}\n\n${body}`;
        }
        if (header.length > 0) {
            return header.join("\n");
        }
        return body;
    }

    emitStmt(stmt: Stmt, ctx: CodegenContext): void {
        switch (stmt.kind) {
            case "ExprStmt": {
                if (this.emitMutationStmt(stmt.expr, ctx)) {
                    break;
                }
                ctx.line(this.emitExpr(stmt.expr, ctx));
                break;
            }

            case "LetStmt":
            case "VarStmt":
                this.emitVarLike(stmt, ctx);
                break;

            case "ReturnStmt":
                if (stmt.value === null) {
                    ctx.line("return");
                } else {
                    ctx.line(`return ${this.emitExpr(stmt.value, ctx)}`);
                }
                break;

            case "CommentStmt": {
                for (const line of this.commentLines(stmt.value)) {
                    ctx.line(line);
                }
                break;
            }

            case "ImportStmt": {
                const sourceLiteral = this.emitPyString(stmt.source);
                const moduleName = this.sourceToModule(stmt.source);

                if (stmt.defaultImport === null && stmt.namespaceImport === null && stmt.namedImports.length === 0) {
                    ctx.line(`__import__(${sourceLiteral})`);
                    break;
                }

                if (stmt.defaultImport !== null) {
                    ctx.line(`import ${moduleName} as ${stmt.defaultImport}`);
                }

                if (stmt.namespaceImport !== null) {
                    ctx.line(`import ${moduleName} as ${stmt.namespaceImport}`);
                }

                if (stmt.namedImports.length > 0) {
                    const imports = stmt.namedImports
                        .map(spec => (spec.imported === spec.local ? spec.imported : `${spec.imported} as ${spec.local}`))
                        .join(", ");
                    ctx.line(`from ${moduleName} import ${imports}`);
                }
                break;
            }

            case "FuncDecl":
                ctx.line(`def ${stmt.name}(${stmt.params.join(", ")}):`);
                this.emitBlock(stmt.body, ctx);
                break;

            case "IfStmt":
                ctx.line(`if ${this.emitExpr(stmt.condition, ctx)}:`);
                this.emitBlock(stmt.consequent, ctx);
                if (stmt.alternate !== null) {
                    ctx.line("else:");
                    this.emitBlock(stmt.alternate, ctx);
                }
                break;

            case "WhileStmt":
                ctx.line(`while ${this.emitExpr(stmt.condition, ctx)}:`);
                this.emitBlock(stmt.body, ctx);
                break;

            case "ForInStmt":
                ctx.line(`for ${stmt.iterator} in ${this.emitExpr(stmt.iterable, ctx)}:`);
                this.emitBlock(stmt.body, ctx);
                break;

            case "ForStmt":
                this.emitForStmt(stmt, ctx);
                break;

            case "Block":
                for (const s of stmt.stmts) {
                    this.emitStmt(s, ctx);
                }
                break;

            case "EnumDecl":
                this.emitEnumDecl(stmt.name, stmt.members, ctx);
                break;

            default:
                throw new Error(`PythonBackend: unhandled statement kind '${(stmt as Stmt).kind}'`);
        }
    }

    emitExpr(expr: Expr, ctx: CodegenContext): string {
        switch (expr.kind) {
            case "Number":
                return String(expr.value);

            case "String":
                return this.emitPyString(expr.value);

            case "Ident":
                return expr.name;

            case "Template":
                return this.emitTemplate(expr.parts, ctx);

            case "Binary": {
                const op = this.binaryOperator(expr.op);
                return `${this.emitExpr(expr.left, ctx)} ${op} ${this.emitExpr(expr.right, ctx)}`;
            }

            case "Unary":
                return this.emitUnaryExpr(expr, ctx);

            case "Assign":
                return `${this.emitExpr(expr.target, ctx)} ${expr.op} ${this.emitExpr(expr.value, ctx)}`;

            case "Ternary":
                return `${this.emitExpr(expr.consequent, ctx)} if ${this.emitExpr(expr.condition, ctx)} else ${this.emitExpr(expr.alternate, ctx)}`;

            case "Call": {
                const callee = this.emitExpr(expr.callee, ctx);
                const args = expr.args.map(arg => this.emitExpr(arg, ctx)).join(", ");
                return `${callee}(${args})`;
            }

            case "Index":
                return `${this.emitExpr(expr.object, ctx)}[${this.emitExpr(expr.index, ctx)}]`;

            case "Member":
                return `${this.emitExpr(expr.object, ctx)}.${expr.property}`;

            case "Group":
                return `(${this.emitExpr(expr.inner, ctx)})`;

            case "ArrowFunc":
                return this.emitArrowFunc(expr.body, expr.params, ctx);

            case "List":
                return `[${expr.elements.map(e => this.emitExpr(e, ctx)).join(", ")}]`;

            case "Dict": {
                if (expr.entries.length === 0) {
                    return "{}";
                }
                const pairs = expr.entries
                    .map((entry: DictEntry) => {
                        const key = entry.key.kind === "Ident"
                            ? this.emitPyString(entry.key.name)
                            : this.emitPyString((entry.key as { kind: "String"; value: string }).value);
                        return `${key}: ${this.emitExpr(entry.value, ctx)}`;
                    })
                    .join(", ");
                return `{ ${pairs} }`;
            }

            default:
                throw new Error(`PythonBackend: unhandled expression kind '${(expr as Expr).kind}'`);
        }
    }

    private emitBlock(block: BlockStmt, ctx: CodegenContext): void {
        ctx.push();
        if (block.stmts.length === 0) {
            ctx.line("pass");
            ctx.pop();
            return;
        }
        for (const stmt of block.stmts) {
            this.emitStmt(stmt, ctx);
        }
        ctx.pop();
    }

    private emitVarLike(stmt: LetStmt | VarStmt, ctx: CodegenContext): void {
        const value = this.emitExpr(stmt.value, ctx);
        if ("name" in stmt) {
            ctx.line(`${stmt.name} = ${value}`);
            return;
        }

        this.emitPatternAssign(stmt.pattern, value, ctx);
    }

    private emitPatternAssign(pattern: BindingPattern, valueExpr: string, ctx: CodegenContext): void {
        switch (pattern.kind) {
            case "IdentPattern":
                ctx.line(`${pattern.name} = ${valueExpr}`);
                return;
            case "ListPattern": {
                const lhs = pattern.elements.map(p => this.emitBindingPatternInline(p)).join(", ");
                ctx.line(`${lhs} = ${valueExpr}`);
                return;
            }
            case "ObjectPattern": {
                const tempName = this.nextTempName();
                ctx.line(`${tempName} = ${valueExpr}`);
                for (const prop of pattern.properties) {
                    const itemExpr = `${tempName}[${this.emitPyString(prop.key)}]`;
                    this.emitPatternAssign(prop.binding, itemExpr, ctx);
                }
                return;
            }
        }
    }

    private emitBindingPatternInline(pattern: BindingPattern): string {
        switch (pattern.kind) {
            case "IdentPattern":
                return pattern.name;
            case "ListPattern":
                return `[${pattern.elements.map(p => this.emitBindingPatternInline(p)).join(", ")}]`;
            case "ObjectPattern":
                throw new Error("PythonBackend: object destructuring is only supported in assignment statements");
        }
    }

    private emitMutationStmt(expr: Expr, ctx: CodegenContext): boolean {
        if (expr.kind === "Unary" && (expr.op === "++" || expr.op === "--")) {
            const target = this.emitExpr(expr.operand, ctx);
            const op = expr.op === "++" ? "+=" : "-=";
            ctx.line(`${target} ${op} 1`);
            return true;
        }

        if (expr.kind === "Unary" && expr.op === "delete" && expr.prefix) {
            ctx.line(`del ${this.emitExpr(expr.operand, ctx)}`);
            return true;
        }

        if (expr.kind === "Assign" && expr.op === "=" && (expr.target.kind === "List" || expr.target.kind === "Dict")) {
            this.emitDestructuringAssignExpr(expr.target, expr.value, ctx);
            return true;
        }

        return false;
    }

    private emitDestructuringAssignExpr(target: Extract<Expr, { kind: "List" | "Dict" }>, value: Expr, ctx: CodegenContext): void {
        const rhs = this.emitExpr(value, ctx);
        if (target.kind === "List") {
            const lhs = target.elements.map(el => this.emitExpr(el, ctx)).join(", ");
            ctx.line(`${lhs} = ${rhs}`);
            return;
        }

        const tempName = this.nextTempName();
        ctx.line(`${tempName} = ${rhs}`);
        for (const entry of target.entries) {
            if (entry.key.kind !== "Ident") {
                throw new Error("PythonBackend: destructuring assignment object keys must be identifiers");
            }
            const key = this.emitPyString(entry.key.name);
            const bindingExpr = `${tempName}[${key}]`;
            ctx.line(`${this.emitExpr(entry.value, ctx)} = ${bindingExpr}`);
        }
    }

    private emitForStmt(stmt: Extract<Stmt, { kind: "ForStmt" }>, ctx: CodegenContext): void {
        if (stmt.init !== null) {
            if (stmt.init.kind === "LetStmt" || stmt.init.kind === "VarStmt") {
                this.emitVarLike(stmt.init, ctx);
            } else if (this.emitMutationStmt(stmt.init, ctx) === false) {
                ctx.line(this.emitExpr(stmt.init, ctx));
            }
        }

        const condition = stmt.condition ? this.emitExpr(stmt.condition, ctx) : "True";
        ctx.line(`while ${condition}:`);
        ctx.push();

        const hasBody = stmt.body.stmts.length > 0;
        const hasUpdate = stmt.update !== null;

        if (!hasBody && !hasUpdate) {
            ctx.line("pass");
        } else {
            for (const s of stmt.body.stmts) {
                this.emitStmt(s, ctx);
            }
            if (stmt.update !== null) {
                if (this.emitMutationStmt(stmt.update, ctx) === false) {
                    ctx.line(this.emitExpr(stmt.update, ctx));
                }
            }
        }

        ctx.pop();
    }

    private emitEnumDecl(name: string, members: EnumMember[], ctx: CodegenContext): void {
        this.needsEnumImport = true;
        ctx.line(`class ${name}(IntEnum):`);
        ctx.push();
        if (members.length === 0) {
            ctx.line("pass");
            ctx.pop();
            return;
        }

        let counter = 0;
        for (const member of members) {
            if (member.value !== null) {
                const emitted = this.emitExpr(member.value, ctx);
                ctx.line(`${member.name} = ${emitted}`);
                if (member.value.kind === "Number") {
                    counter = member.value.value + 1;
                }
            } else {
                ctx.line(`${member.name} = ${counter}`);
                counter++;
            }
        }
        ctx.pop();
    }

    private emitArrowFunc(body: BlockStmt, params: string[], ctx: CodegenContext): string {
        if (body.stmts.length === 0) {
            return `lambda ${params.join(", ")}: None`;
        }

        if (body.stmts.length === 1) {
            const [only] = body.stmts;
            if (only.kind === "ExprStmt") {
                return `lambda ${params.join(", ")}: ${this.emitExpr(only.expr, ctx)}`;
            }
            if (only.kind === "ReturnStmt") {
                const returnExpr = only.value === null ? "None" : this.emitExpr(only.value, ctx);
                return `lambda ${params.join(", ")}: ${returnExpr}`;
            }
        }

        throw new Error("PythonBackend: arrow functions with multiple statements are not supported");
    }

    private emitUnaryExpr(expr: Extract<Expr, { kind: "Unary" }>, ctx: CodegenContext): string {
        if (expr.op === "++" || expr.op === "--") {
            throw new Error("PythonBackend: ++/-- are only supported as standalone statements");
        }

        if (expr.op === "delete") {
            throw new Error("PythonBackend: delete is only supported as a standalone statement");
        }

        const op = expr.op === "!" ? "not" : expr.op;
        if (expr.prefix) {
            return /[a-zA-Z]$/.test(op)
                ? `${op} ${this.emitExpr(expr.operand, ctx)}`
                : `${op}${this.emitExpr(expr.operand, ctx)}`;
        }

        throw new Error("PythonBackend: postfix operators are only supported as standalone statements");
    }

    private emitTemplate(parts: TemplatePart[], ctx: CodegenContext): string {
        const inner = parts
            .map(part => {
                if ("text" in part) {
                    return part.text
                        .replace(/\\/g, "\\\\")
                        .replace(/{/g, "{{")
                        .replace(/}/g, "}}");
                }
                return `{${this.emitExpr(part.expr, ctx)}}`;
            })
            .join("");
        return `f"${inner.replace(/"/g, '\\"')}"`;
    }

    private emitPyString(value: string): string {
        return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    }

    private commentLines(raw: string): string[] {
        if (raw.startsWith("//")) {
            const payload = raw.slice(2).trimStart();
            return [`# ${payload}`.trimEnd()];
        }

        if (raw.startsWith("/*") && raw.endsWith("*/")) {
            const inner = raw.slice(2, -2).split("\n");
            return inner.map(line => {
                const cleaned = line.replace(/^\s*\*?\s?/, "");
                return cleaned.length > 0 ? `# ${cleaned}` : "#";
            });
        }

        return [`# ${raw}`];
    }

    private sourceToModule(source: string): string {
        return source
            .replace(/^\.\//, "")
            .replace(/\.feph$/i, "")
            .replace(/\.fepl$/i, "")
            .replace(/\.py$/i, "")
            .replace(/[\\/]+/g, ".")
            .replace(/^\.+/, "") || source;
    }

    private binaryOperator(op: string): string {
        if (op === "||") return "or";
        if (op === "&&") return "and";
        if (op === ">>>") {
            throw new Error("PythonBackend: unsigned right shift (>>>) is not supported");
        }
        return op;
    }

    private nextTempName(): string {
        this.tempVarCounter += 1;
        return `_fepl_tmp_${this.tempVarCounter}`;
    }
}

export const pythonBackend = new PythonBackend();

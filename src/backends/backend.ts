import type { Program, Stmt, Expr } from "../ast/ast";

// ─── Code generation context ──────────────────────────────────────────────────
//
// Passed through every emit call so backends can manage indentation and
// accumulated output without global state.

export class CodegenContext {
    private lines: string[] = [];
    private depth: number = 0;
    private readonly indentStr: string;

    constructor(indentStr = "  ") {
        this.indentStr = indentStr;
    }

    /** Current indentation prefix. */
    indent(): string {
        return this.indentStr.repeat(this.depth);
    }

    /** Push one indentation level. */
    push(): void {
        this.depth++;
    }

    /** Pop one indentation level. */
    pop(): void {
        if (this.depth > 0) this.depth--;
    }

    /** Append a complete line (indentation is prepended automatically). */
    line(src: string): void {
        this.lines.push(this.indent() + src);
    }

    /** Return the full generated source as a string. */
    toString(): string {
        return this.lines.join("\n");
    }
}

// ─── Backend interface ────────────────────────────────────────────────────────
//
// A backend is responsible for translating a FEPL Program AST into a target
// language string.  The two required methods are intentionally separated:
//
//   emitExpr  — produces an *inline* string for an expression node (no newline)
//   emitStmt  — writes one or more complete lines into the CodegenContext
//
// This separation lets complex statements compose expressions freely without
// having to manage line buffering themselves.

export interface Backend {
    /** Stable backend identifier, used by config and CLI flags. */
    readonly id: string;

    /** Output file extension for generated files (including dot), e.g. ".js". */
    readonly fileExtension: `.${string}`;

    /** Translate a full program and return the emitted source string. */
    generate(program: Program): string;

    /** Translate a single expression to an inline string. */
    emitExpr(expr: Expr, ctx: CodegenContext): string;

    /** Write a single statement (possibly multiple lines) into ctx. */
    emitStmt(stmt: Stmt, ctx: CodegenContext): void;
}

export type BackendRegistry = Record<string, Backend>;

export function getBackend(registry: BackendRegistry, id: string): Backend {
    const backend = registry[id];
    if (!backend) {
        const available = Object.keys(registry).sort().join(", ");
        throw new Error(`Unknown backend '${id}'. Available backends: ${available}`);
    }
    return backend;
}

export function withOutputExtension(filePath: string, backend: Backend): string {
    if (/\.[^./\\]+$/.test(filePath)) {
        return filePath.replace(/\.[^./\\]+$/, backend.fileExtension);
    }
    return `${filePath}${backend.fileExtension}`;
}

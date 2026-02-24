import { Token, TokenKind, tokenKindToString } from "../lexer/tokens";
import { Tokenizer } from "../lexer/lexer";

// ─── AST Node Types ───────────────────────────────────────────────────────────

// Expressions
export type NumberExpr   = { kind: "Number";   value: number };
export type StringExpr   = { kind: "String";   value: string };
export type IdentExpr    = { kind: "Ident";    name: string };

// Template literal: `hello ${name}, you are ${age} years old`
// parts alternates between plain strings and interpolated expressions.
export type TemplatePart = { text: string } | { expr: Expr };
export type TemplateExpr = { kind: "Template"; parts: TemplatePart[] };

export type BinaryExpr = {
    kind:  "Binary";
    op:    string;
    left:  Expr;
    right: Expr;
};

export type UnaryExpr = {
    kind:    "Unary";
    op:      string;
    operand: Expr;
    prefix:  boolean;
};

export type AssignExpr = {
    kind:   "Assign";
    op:     string;
    target: Expr;
    value:  Expr;
};

export type TernaryExpr = {
    kind:       "Ternary";
    condition:  Expr;
    consequent: Expr;
    alternate:  Expr;
};

export type CallExpr = {
    kind:   "Call";
    callee: Expr;
    args:   Expr[];
};

export type IndexExpr = {
    kind:   "Index";
    object: Expr;
    index:  Expr;
};

export type MemberExpr = {
    kind:     "Member";
    object:   Expr;
    property: string;
};

export type GroupExpr = {
    kind:  "Group";
    inner: Expr;
};

// Arrow function expression: (a, b) => { stmts }
export type ArrowFuncExpr = {
    kind:   "ArrowFunc";
    params: string[];
    body:   BlockStmt;
};


// List literal: [1, 2, 3]
export type ListExpr = {
    kind:     "List";
    elements: Expr[];
};

// Dict literal: { "key": value, ident: value }
export type DictEntry = {
    key:   Expr;   // StringExpr or IdentExpr (bare key used as string key)
    value: Expr;
};

export type DictExpr = {
    kind:    "Dict";
    entries: DictEntry[];
};

export type IdentPattern = {
    kind: "IdentPattern";
    name: string;
};

export type ListPattern = {
    kind: "ListPattern";
    elements: BindingPattern[];
};

export type ObjectPatternProperty = {
    key: string;
    binding: BindingPattern;
};

export type ObjectPattern = {
    kind: "ObjectPattern";
    properties: ObjectPatternProperty[];
};

export type BindingPattern = IdentPattern | ListPattern | ObjectPattern;

export type Expr =
    | NumberExpr
    | StringExpr
    | IdentExpr
    | TemplateExpr
    | BinaryExpr
    | UnaryExpr
    | AssignExpr
    | TernaryExpr
    | CallExpr
    | IndexExpr
    | MemberExpr
    | GroupExpr
    | ArrowFuncExpr
    | ListExpr
    | DictExpr;

// Statements
export type ExprStmt = {
    kind: "ExprStmt";
    expr: Expr;
};

export type LetStmt =
    | {
        kind:  "LetStmt";
        name:  string;
        value: Expr;
    }
    | {
        kind: "LetStmt";
        pattern: BindingPattern;
        value: Expr;
    };

export type VarStmt =
    | {
        kind:  "VarStmt";
        name:  string;
        value: Expr;
    }
    | {
        kind: "VarStmt";
        pattern: BindingPattern;
        value: Expr;
    };

export type ReturnStmt = {
    kind:  "ReturnStmt";
    value: Expr | null;
};

export type CommentStmt = {
    kind: "CommentStmt";
    value: string;
};

export type ImportSpecifier = {
    imported: string;
    local: string;
};

export type ImportStmt = {
    kind: "ImportStmt";
    source: string;
    defaultImport: string | null;
    namespaceImport: string | null;
    namedImports: ImportSpecifier[];
};

export type FuncDeclStmt = {
    kind:   "FuncDecl";
    name:   string;
    params: string[];
    body:   BlockStmt;
};

export type BlockStmt = {
    kind:  "Block";
    stmts: Stmt[];
};

export type IfStmt = {
    kind:       "IfStmt";
    condition:  Expr;
    consequent: BlockStmt;
    alternate:  BlockStmt | null;
};

export type WhileStmt = {
    kind: "WhileStmt";
    condition: Expr;
    body: BlockStmt;
};

export type ForInStmt = {
    kind: "ForInStmt";
    iterator: string;
    iterable: Expr;
    body: BlockStmt;
};

export type ForStmt = {
    kind: "ForStmt";
    init: LetStmt | VarStmt | Expr | null;
    condition: Expr | null;
    update: Expr | null;
    body: BlockStmt;
};


export type EnumMember = {
    name:  string;
    value: Expr | null;   // null = auto-assigned (0, 1, 2, ...)
};

export type EnumDeclStmt = {
    kind:    "EnumDecl";
    name:    string;
    members: EnumMember[];
};

export type Stmt =
    | ExprStmt
    | LetStmt
    | VarStmt
    | ReturnStmt
    | CommentStmt
    | ImportStmt
    | FuncDeclStmt
    | BlockStmt
    | IfStmt
    | WhileStmt
    | ForInStmt
    | ForStmt
    | EnumDeclStmt;

export type Program = {
    kind:  "Program";
    stmts: Stmt[];
};

// ─── Binding Powers ───────────────────────────────────────────────────────────

export const BP = {
    None:            0,
    Assignment:      2,
    AssignmentRight: 1,
    Ternary:         4,
    TernaryRight:    3,
    LogicalOr:       6,
    LogicalAnd:      8,
    Equality:        10,
    Relational:      12,
    Bitwise:         13,
    Additive:        14,
    Multiplicative:  16,
    Unary:           18,
    Postfix:         20,
    Call:            22,
    Member:          24,
} as const;

export type BindingPower = (typeof BP)[keyof typeof BP];

export type NudHandler = (parser: Parser) => Expr;
export type LedHandler = (parser: Parser, left: Expr, bp: BindingPower) => Expr;

// ─── Template literal parser ──────────────────────────────────────────────────
//
// Given a raw token value like: `hello ${name}, age ${a + 1}`
// Returns a TemplatePart[] ready to embed in a TemplateExpr.

function parseTemplateParts(raw: string): TemplatePart[] {
    // Strip surrounding backticks
    const inner = raw.slice(1, -1);
    const parts: TemplatePart[] = [];
    let i = 0;
    let text = "";

    while (i < inner.length) {
        if (inner[i] === "$" && inner[i + 1] === "{") {
            if (text) {
                parts.push({ text });
                text = "";
            }
            // Find the matching closing brace (simple non-nested scan)
            const start = i + 2;
            let depth = 1;
            let j = start;
            while (j < inner.length && depth > 0) {
                if (inner[j] === "{") depth++;
                else if (inner[j] === "}") depth--;
                j++;
            }
            const exprSrc = inner.slice(start, j - 1);
            const exprTokens = new Tokenizer(exprSrc).tokenize();
            const exprParser = new Parser(exprTokens);
            parts.push({ expr: exprParser.parseExpr() });
            i = j;
        } else if (inner[i] === "\\" && i + 1 < inner.length) {
            text += inner[i + 1];
            i += 2;
        } else {
            text += inner[i];
            i++;
        }
    }

    if (text) parts.push({ text });
    return parts;
}

// ─── Parser ───────────────────────────────────────────────────────────────────

export class Parser {
    private tokens: Token[];
    private pos: number = 0;

    private nudMap = new Map<TokenKind, NudHandler>();
    private ledMap = new Map<TokenKind, { bp: BindingPower; handler: LedHandler }>();

    constructor(tokens: Token[]) {
        this.tokens = tokens;
        this.registerDefaults();
    }

    // ── Token navigation ──────────────────────────────────────────────────────

    current(): Token {
        return this.tokens[this.pos];
    }

    peek(offset = 1): Token {
        const i = this.pos + offset;
        return i < this.tokens.length ? this.tokens[i] : this.tokens[this.tokens.length - 1];
    }

    advance(): Token {
        const t = this.current();
        if (t.kind !== TokenKind.EOF) this.pos++;
        return t;
    }

    expect(kind: TokenKind): Token {
        const t = this.current();
        if (t.kind !== kind) {
            throw new Error(
                `Expected ${tokenKindToString(kind)} but got ${tokenKindToString(t.kind)} ('${t.value}')`
            );
        }
        return this.advance();
    }

    check(kind: TokenKind): boolean {
        return this.current().kind === kind;
    }

    match(...kinds: TokenKind[]): boolean {
        if (kinds.includes(this.current().kind)) {
            this.advance();
            return true;
        }
        return false;
    }

    atEnd(): boolean {
        return this.current().kind === TokenKind.EOF;
    }

    /** Skip any statement separators (newlines or semicolons). */
    private skipSeparators(): void {
        while (
            this.current().kind === TokenKind.Newline ||
            this.current().kind === TokenKind.Semicolon
        ) {
            this.advance();
        }
    }

    /** Consume exactly one statement separator (newline or semicolon) if present. */
    private eatSeparator(): void {
        if (
            this.current().kind === TokenKind.Newline ||
            this.current().kind === TokenKind.Semicolon
        ) {
            this.advance();
        }
    }

    private isCommentToken(kind: TokenKind): boolean {
        return kind === TokenKind.LineComment || kind === TokenKind.BlockComment;
    }

    // ── Handler registration ──────────────────────────────────────────────────

    registerNud(kind: TokenKind, handler: NudHandler): this {
        this.nudMap.set(kind, handler);
        return this;
    }

    registerLed(kind: TokenKind, bp: BindingPower, handler: LedHandler): this {
        this.ledMap.set(kind, { bp, handler });
        return this;
    }

    // ── Core Pratt loop ───────────────────────────────────────────────────────

    parseExpr(minBP: BindingPower = BP.None): Expr {
        while (this.isCommentToken(this.current().kind)) {
            this.advance();
        }

        const token = this.current();
        const nud = this.nudMap.get(token.kind);

        if (!nud) {
            throw new Error(
                `Unexpected token in expression: ${tokenKindToString(token.kind)} ('${token.value}')`
            );
        }

        this.advance();
        let left = nud(this);

        while (true) {
            const cur = this.current();
            if (this.isCommentToken(cur.kind)) {
                this.advance();
                continue;
            }
            // Newlines terminate expressions at statement level
            if (cur.kind === TokenKind.Newline || cur.kind === TokenKind.Semicolon) break;
            if (cur.kind === TokenKind.EOF) break;

            const led = this.ledMap.get(cur.kind);
            if (!led || led.bp <= minBP) break;
            this.advance();
            left = led.handler(this, left, led.bp);
        }

        return left;
    }

    // ── Statement parsers ─────────────────────────────────────────────────────

    parseStmt(): Stmt {
        this.skipSeparators();
        const t = this.current();

        switch (t.kind) {
            case TokenKind.Import: return this.parseImportStmt();
            case TokenKind.Let:    return this.parseLetStmt();
            case TokenKind.Var:    return this.parseVarStmt();
            case TokenKind.Func:   return this.parseFuncDecl();
            case TokenKind.Return: return this.parseReturnStmt();
            case TokenKind.LineComment:
            case TokenKind.BlockComment:
                return this.parseCommentStmt();
            case TokenKind.If:     return this.parseIfStmt();
            case TokenKind.While:  return this.parseWhileStmt();
            case TokenKind.For:    return this.parseForStmt();
            case TokenKind.Enum:   return this.parseEnumDecl();
            case TokenKind.OpenCurly: return this.parseBlock();
            default:               return this.parseExprStmt();
        }
    }

    private parseLetStmt(): LetStmt {
        this.expect(TokenKind.Let);
        const stmt = this.parseVariableInit("LetStmt");
        this.eatSeparator();
        return stmt;
    }

    private parseVarStmt(): VarStmt {
        this.expect(TokenKind.Var);
        const stmt = this.parseVariableInit("VarStmt");
        this.eatSeparator();
        return stmt;
    }

    private parseImportStmt(): ImportStmt {
        this.expect(TokenKind.Import);

        // Side-effect import: import "module"
        if (this.check(TokenKind.String)) {
            const source = this.readStringLiteral();
            this.eatSeparator();
            return {
                kind: "ImportStmt",
                source,
                defaultImport: null,
                namespaceImport: null,
                namedImports: [],
            };
        }

        let defaultImport: string | null = null;
        let namespaceImport: string | null = null;
        let namedImports: ImportSpecifier[] = [];

        if (this.check(TokenKind.Identifier)) {
            defaultImport = this.advance().value;
            if (this.match(TokenKind.Comma)) {
                if (this.check(TokenKind.Star)) {
                    namespaceImport = this.parseNamespaceImport();
                } else if (this.check(TokenKind.OpenCurly)) {
                    namedImports = this.parseNamedImports();
                } else {
                    throw new Error("Expected '*' or '{' after default import and comma");
                }
            }
        } else if (this.check(TokenKind.Star)) {
            namespaceImport = this.parseNamespaceImport();
        } else if (this.check(TokenKind.OpenCurly)) {
            namedImports = this.parseNamedImports();
        } else {
            throw new Error("Invalid import statement");
        }

        this.expect(TokenKind.From);
        const source = this.readStringLiteral();
        this.eatSeparator();

        return {
            kind: "ImportStmt",
            source,
            defaultImport,
            namespaceImport,
            namedImports,
        };
    }

    private parseFuncDecl(): FuncDeclStmt {
        this.expect(TokenKind.Func);
        const name   = this.expect(TokenKind.Identifier).value;
        const params = this.parseParamList();
        this.skipSeparators();
        const body   = this.parseBlock();
        return { kind: "FuncDecl", name, params, body };
    }

    private parseReturnStmt(): ReturnStmt {
        this.expect(TokenKind.Return);
        // No value if immediately followed by a separator or end of block
        const noValue =
            this.check(TokenKind.Newline) ||
            this.check(TokenKind.Semicolon) ||
            this.check(TokenKind.CloseCurly) ||
            this.atEnd();

        const value = noValue ? null : this.parseExpr();
        this.eatSeparator();
        return { kind: "ReturnStmt", value };
    }

    private parseCommentStmt(): CommentStmt {
        const token = this.advance();
        return { kind: "CommentStmt", value: token.value };
    }

    private parseIfStmt(): IfStmt {
        this.expect(TokenKind.If);
        this.expect(TokenKind.OpenParen);
        const condition = this.parseExpr();
        this.expect(TokenKind.CloseParen);
        this.skipSeparators();
        const consequent = this.parseBlock();
        let alternate: BlockStmt | null = null;
        this.skipSeparators();
        if (this.check(TokenKind.Else)) {
            this.advance();
            this.skipSeparators();
            alternate = this.parseBlock();
        }
        return { kind: "IfStmt", condition, consequent, alternate };
    }

    private parseWhileStmt(): WhileStmt {
        this.expect(TokenKind.While);
        this.expect(TokenKind.OpenParen);
        const condition = this.parseExpr();
        this.expect(TokenKind.CloseParen);
        this.skipSeparators();
        const body = this.parseBlock();
        return { kind: "WhileStmt", condition, body };
    }

    private parseForStmt(): ForInStmt | ForStmt {
        this.expect(TokenKind.For);
        this.expect(TokenKind.OpenParen);

        // for-in syntax: for (item in items) { ... }
        if (this.check(TokenKind.Identifier) && this.peek().kind === TokenKind.In) {
            const iterator = this.advance().value;
            this.expect(TokenKind.In);
            const iterable = this.parseExpr();
            this.expect(TokenKind.CloseParen);
            this.skipSeparators();
            const body = this.parseBlock();
            return { kind: "ForInStmt", iterator, iterable, body };
        }

        // classic for syntax: for (init; condition; update) { ... }
        let init: LetStmt | VarStmt | Expr | null = null;
        if (!this.check(TokenKind.Semicolon)) {
            if (this.check(TokenKind.Let)) {
                init = this.parseForInitLet();
            } else if (this.check(TokenKind.Var)) {
                init = this.parseForInitVar();
            } else {
                init = this.parseExpr();
            }
        }
        this.expect(TokenKind.Semicolon);

        let condition: Expr | null = null;
        if (!this.check(TokenKind.Semicolon)) {
            condition = this.parseExpr();
        }
        this.expect(TokenKind.Semicolon);

        let update: Expr | null = null;
        if (!this.check(TokenKind.CloseParen)) {
            update = this.parseExpr();
        }
        this.expect(TokenKind.CloseParen);

        this.skipSeparators();
        const body = this.parseBlock();
        return { kind: "ForStmt", init, condition, update, body };
    }

    private parseForInitLet(): LetStmt {
        this.expect(TokenKind.Let);

        return this.parseVariableInit("LetStmt");
    }

    private parseForInitVar(): VarStmt {
        this.expect(TokenKind.Var);

        return this.parseVariableInit("VarStmt");
    }

    private parseVariableInit(kind: "LetStmt"): LetStmt;
    private parseVariableInit(kind: "VarStmt"): VarStmt;
    private parseVariableInit(kind: "LetStmt" | "VarStmt"): LetStmt | VarStmt {
        if (this.check(TokenKind.Identifier)) {
            const name = this.advance().value;
            this.expect(TokenKind.Assignment);
            const value = this.parseExpr();
            if (kind === "LetStmt") {
                return { kind: "LetStmt", name, value };
            }
            return { kind: "VarStmt", name, value };
        }

        const pattern = this.parseBindingPattern();
        this.expect(TokenKind.Assignment);
        const value = this.parseExpr();
        if (kind === "LetStmt") {
            return { kind: "LetStmt", pattern, value };
        }
        return { kind: "VarStmt", pattern, value };
    }

    private parseBindingPattern(): BindingPattern {
        if (this.check(TokenKind.Identifier)) {
            return { kind: "IdentPattern", name: this.advance().value };
        }

        if (this.check(TokenKind.OpenBracket)) {
            return this.parseListPattern();
        }

        if (this.check(TokenKind.OpenCurly)) {
            return this.parseObjectPattern();
        }

        const t = this.current();
        throw new Error(
            `Expected binding pattern but got ${tokenKindToString(t.kind)} ('${t.value}')`
        );
    }

    private parseListPattern(): ListPattern {
        this.expect(TokenKind.OpenBracket);
        const elements: BindingPattern[] = [];

        while (!this.check(TokenKind.CloseBracket) && !this.atEnd()) {
            elements.push(this.parseBindingPattern());
            if (!this.match(TokenKind.Comma)) break;
        }

        this.expect(TokenKind.CloseBracket);
        return { kind: "ListPattern", elements };
    }

    private parseObjectPattern(): ObjectPattern {
        this.expect(TokenKind.OpenCurly);
        const properties: ObjectPatternProperty[] = [];

        while (!this.check(TokenKind.CloseCurly) && !this.atEnd()) {
            const key = this.expect(TokenKind.Identifier).value;
            let binding: BindingPattern;

            if (this.match(TokenKind.Colon)) {
                binding = this.parseBindingPattern();
            } else {
                binding = { kind: "IdentPattern", name: key };
            }

            properties.push({ key, binding });
            if (!this.match(TokenKind.Comma)) break;
        }

        this.expect(TokenKind.CloseCurly);
        return { kind: "ObjectPattern", properties };
    }

    private parseNamespaceImport(): string {
        this.expect(TokenKind.Star);
        this.expect(TokenKind.As);
        return this.expect(TokenKind.Identifier).value;
    }

    private parseNamedImports(): ImportSpecifier[] {
        this.expect(TokenKind.OpenCurly);
        const specifiers: ImportSpecifier[] = [];

        while (!this.check(TokenKind.CloseCurly) && !this.atEnd()) {
            const imported = this.expect(TokenKind.Identifier).value;
            let local = imported;

            if (this.match(TokenKind.As)) {
                local = this.expect(TokenKind.Identifier).value;
            }

            specifiers.push({ imported, local });

            if (!this.match(TokenKind.Comma)) break;
        }

        this.expect(TokenKind.CloseCurly);
        return specifiers;
    }

    private readStringLiteral(): string {
        const raw = this.expect(TokenKind.String).value;
        return raw.slice(1, -1);
    }

    parseBlock(): BlockStmt {
        this.expect(TokenKind.OpenCurly);
        const stmts: Stmt[] = [];
        this.skipSeparators();
        while (!this.check(TokenKind.CloseCurly) && !this.atEnd()) {
            stmts.push(this.parseStmt());
            this.skipSeparators();
        }
        this.expect(TokenKind.CloseCurly);
        return { kind: "Block", stmts };
    }

    private parseExprStmt(): ExprStmt {
        const expr = this.parseExpr();
        this.eatSeparator();
        return { kind: "ExprStmt", expr };
    }

    /** Parse a comma-separated parameter list: (a, b, c) */
    private parseParamList(): string[] {
        this.expect(TokenKind.OpenParen);
        const params: string[] = [];
        while (!this.check(TokenKind.CloseParen) && !this.atEnd()) {
            params.push(this.expect(TokenKind.Identifier).value);
            if (!this.match(TokenKind.Comma)) break;
        }
        this.expect(TokenKind.CloseParen);
        return params;
    }

    /** Parse a full program (top-level statement list). */
    parseProgram(): Program {
        const stmts: Stmt[] = [];
        this.skipSeparators();
        while (!this.atEnd()) {
            stmts.push(this.parseStmt());
            this.skipSeparators();
        }
        return { kind: "Program", stmts };
    }

    // ── Default handler registration ──────────────────────────────────────────

    private registerDefaults(): void {
        // Literals
        this.registerNud(TokenKind.Number, () => ({
            kind: "Number",
            value: parseFloat(this.tokens[this.pos - 1].value),
        }));

        this.registerNud(TokenKind.String, () => {
            const raw = this.tokens[this.pos - 1].value;
            return { kind: "String", value: raw.slice(1, -1) };
        });

        this.registerNud(TokenKind.TemplateLiteral, () => {
            const raw = this.tokens[this.pos - 1].value;
            return { kind: "Template", parts: parseTemplateParts(raw) };
        });

        this.registerNud(TokenKind.Identifier, () => ({
            kind: "Ident",
            name: this.tokens[this.pos - 1].value,
        }));

        // Grouped expression or arrow function: ( ... )
        this.registerNud(TokenKind.OpenParen, () => {
            // Look-ahead: is this an arrow function parameter list?
            // Heuristic: if we see  (ident, ident, ...) =>  then it's an arrow.
            if (this.isArrowFunc()) {
                return this.finishArrowFunc();
            }
            const inner = this.parseExpr(BP.None);
            this.expect(TokenKind.CloseParen);
            return { kind: "Group", inner };
        });


        // List literal: [expr, expr, ...]
        this.registerNud(TokenKind.OpenBracket, () => {
            const elements: Expr[] = [];
            this.skipSeparators();
            while (!this.check(TokenKind.CloseBracket) && !this.atEnd()) {
                elements.push(this.parseExpr(BP.None));
                this.skipSeparators();
                if (!this.match(TokenKind.Comma)) break;
                this.skipSeparators();
            }
            this.expect(TokenKind.CloseBracket);
            return { kind: "List", elements };
        });

        // Dict literal: { key: expr, key: expr, ... }
        // Keys can be identifiers (with optional shorthand) or string literals.
        this.registerNud(TokenKind.OpenCurly, () => {
            const entries: DictEntry[] = [];
            this.skipSeparators();
            while (!this.check(TokenKind.CloseCurly) && !this.atEnd()) {
                let key: Expr;
                let defaultValue: Expr | null = null;
                if (this.check(TokenKind.String)) {
                    const raw = this.advance().value;
                    key = { kind: "String", value: raw.slice(1, -1) };
                } else {
                    // Bare identifier key — e.g.  { name: "Alice" }
                    const name = this.expect(TokenKind.Identifier).value;
                    key = { kind: "Ident", name };
                    defaultValue = { kind: "Ident", name };
                }

                let value: Expr;
                if (this.match(TokenKind.Colon)) {
                    value = this.parseExpr(BP.None);
                } else if (defaultValue !== null) {
                    // Object shorthand property — e.g. { x }
                    value = defaultValue;
                } else {
                    throw new Error("Expected ':' after string key in object literal");
                }

                entries.push({ key, value });
                this.skipSeparators();
                if (!this.match(TokenKind.Comma)) break;
                this.skipSeparators();
            }
            this.expect(TokenKind.CloseCurly);
            return { kind: "Dict", entries };
        });

        // Prefix unary
        const prefixUnary = (op: string): NudHandler => () => ({
            kind: "Unary", op, prefix: true,
            operand: this.parseExpr(BP.Unary),
        });

        this.registerNud(TokenKind.Minus,      prefixUnary("-"));
        this.registerNud(TokenKind.Not,        prefixUnary("!"));
        this.registerNud(TokenKind.Delete,     prefixUnary("delete"));
        this.registerNud(TokenKind.PlusPlus,   prefixUnary("++"));
        this.registerNud(TokenKind.MinusMinus, prefixUnary("--"));
        this.registerNud(TokenKind.Tilde,      prefixUnary("~"));

        // Binary — left-associative
        const binary = (op: string, bp: BindingPower): [BindingPower, LedHandler] =>
            [bp, (_p, left) => ({
                kind: "Binary", op, left,
                right: this.parseExpr(bp),
            })];

        this.registerLed(TokenKind.Plus,          ...binary("+",  BP.Additive));
        this.registerLed(TokenKind.Minus,         ...binary("-",  BP.Additive));
        this.registerLed(TokenKind.Star,          ...binary("*",  BP.Multiplicative));
        this.registerLed(TokenKind.Slash,         ...binary("/",  BP.Multiplicative));
        this.registerLed(TokenKind.Percent,       ...binary("%",  BP.Multiplicative));
        this.registerLed(TokenKind.Equals,        ...binary("==", BP.Equality));
        this.registerLed(TokenKind.NotEquals,     ...binary("!=", BP.Equality));
        this.registerLed(TokenKind.Less,          ...binary("<",  BP.Relational));
        this.registerLed(TokenKind.LessEquals,    ...binary("<=", BP.Relational));
        this.registerLed(TokenKind.Greater,       ...binary(">",  BP.Relational));
        this.registerLed(TokenKind.GreaterEquals, ...binary(">=", BP.Relational));
        this.registerLed(TokenKind.LogicalOr,     ...binary("||", BP.LogicalOr));
        this.registerLed(TokenKind.LogicalAnd,    ...binary("&&", BP.LogicalAnd));
        this.registerLed(TokenKind.Ampersand,      ...binary("&",  BP.Bitwise));
        this.registerLed(TokenKind.Pipe,           ...binary("|",  BP.Bitwise));
        this.registerLed(TokenKind.Caret,          ...binary("^",  BP.Bitwise));
        this.registerLed(TokenKind.LeftShift,        ...binary("<<", BP.Additive));
        this.registerLed(TokenKind.RightShift,       ...binary(">>", BP.Additive));
        this.registerLed(TokenKind.UnsignedRightShift, ...binary(">>>", BP.Additive));

        // Assignment — right-associative
        const assignment = (op: string): LedHandler => (_p, left) => ({
            kind: "Assign", op, target: left,
            value: this.parseExpr(BP.AssignmentRight),
        });

        this.registerLed(TokenKind.Assignment,  BP.Assignment, assignment("="));
        this.registerLed(TokenKind.PlusEquals,  BP.Assignment, assignment("+="));
        this.registerLed(TokenKind.MinusEquals, BP.Assignment, assignment("-="));
        this.registerLed(TokenKind.AmpersandEquals,      BP.Assignment, assignment("&="));
        this.registerLed(TokenKind.PipeEquals,           BP.Assignment, assignment("|="));
        this.registerLed(TokenKind.CaretEquals,          BP.Assignment, assignment("^="));
        this.registerLed(TokenKind.LeftShiftEquals,      BP.Assignment, assignment("<<="));
        this.registerLed(TokenKind.RightShiftEquals,     BP.Assignment, assignment(">>="));
        this.registerLed(TokenKind.UnsignedRightShiftEquals, BP.Assignment, assignment(">>>="));

        // Ternary — right-associative
        this.registerLed(TokenKind.Question, BP.Ternary, (_p, left) => {
            const consequent = this.parseExpr(BP.None);
            this.expect(TokenKind.Colon);
            const alternate = this.parseExpr(BP.TernaryRight);
            return { kind: "Ternary", condition: left, consequent, alternate };
        });

        // Postfix ++ / --
        const postfix = (op: string): LedHandler => (_p, left) =>
            ({ kind: "Unary", op, prefix: false, operand: left });

        this.registerLed(TokenKind.PlusPlus,   BP.Postfix, postfix("++"));
        this.registerLed(TokenKind.MinusMinus, BP.Postfix, postfix("--"));

        // Call: callee(args)
        this.registerLed(TokenKind.OpenParen, BP.Call, (_p, left) => {
            const args: Expr[] = [];
            while (!this.check(TokenKind.CloseParen) && !this.atEnd()) {
                args.push(this.parseExpr(BP.None));
                if (!this.match(TokenKind.Comma)) break;
            }
            this.expect(TokenKind.CloseParen);
            return { kind: "Call", callee: left, args };
        });

        // Index: object[index]
        this.registerLed(TokenKind.OpenBracket, BP.Member, (_p, left) => {
            const index = this.parseExpr(BP.None);
            this.expect(TokenKind.CloseBracket);
            return { kind: "Index", object: left, index };
        });

        // Member: object.property
        this.registerLed(TokenKind.Dot, BP.Member, (_p, left) => {
            const prop = this.expect(TokenKind.Identifier);
            return { kind: "Member", object: left, property: prop.value };
        });
    }


    private parseEnumDecl(): EnumDeclStmt {
        this.expect(TokenKind.Enum);
        const name = this.expect(TokenKind.Identifier).value;
        this.expect(TokenKind.OpenCurly);
        this.skipSeparators();

        const members: EnumMember[] = [];

        while (!this.check(TokenKind.CloseCurly) && !this.atEnd()) {
            const memberName = this.expect(TokenKind.Identifier).value;

            let value: Expr | null = null;
            if (this.match(TokenKind.Colon)) {
                value = this.parseExpr();
            }

            // Trailing comma is optional; consume it if present
            this.match(TokenKind.Comma);
            this.skipSeparators();

            members.push({ name: memberName, value });
        }

        this.expect(TokenKind.CloseCurly);
        return { kind: "EnumDecl", name, members };
    }

    // ── Arrow function helpers ────────────────────────────────────────────────

    /**
     * Peek ahead from the current position (just after `(` was consumed) to
     * decide whether this is an arrow function.  Looks for the pattern:
     *   [Identifier (Comma Identifier)*] CloseParen Arrow
     */
    private isArrowFunc(): boolean {
        let i = this.pos; // pos is already past the `(`

        // Empty param list: () =>
        if (this.tokens[i]?.kind === TokenKind.CloseParen &&
            this.tokens[i + 1]?.kind === TokenKind.Arrow) {
            return true;
        }

        // One or more ident params
        while (this.tokens[i]?.kind === TokenKind.Identifier) {
            i++;
            if (this.tokens[i]?.kind === TokenKind.Comma) {
                i++;
            } else {
                break;
            }
        }

        return (
            this.tokens[i]?.kind === TokenKind.CloseParen &&
            this.tokens[i + 1]?.kind === TokenKind.Arrow
        );
    }

    /**
     * Parse the body of an arrow function, having already identified that `(`
     * was consumed and this is indeed an arrow function.
     */
    private finishArrowFunc(): ArrowFuncExpr {
        const params: string[] = [];
        while (!this.check(TokenKind.CloseParen) && !this.atEnd()) {
            params.push(this.expect(TokenKind.Identifier).value);
            if (!this.match(TokenKind.Comma)) break;
        }
        this.expect(TokenKind.CloseParen);
        this.expect(TokenKind.Arrow);
        this.skipSeparators();
        const body = this.parseBlock();
        return { kind: "ArrowFunc", params, body };
    }
}

// ─── Convenience factories ────────────────────────────────────────────────────

export function createParser(source: string): Parser {
    const tokens = new Tokenizer(source).tokenize();
    return new Parser(tokens);
}

export function parseProgram(source: string): Program {
    return createParser(source).parseProgram();
}

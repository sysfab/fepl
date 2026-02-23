import { readFile as defaultReadFile } from "node:fs/promises";
import * as path from "node:path";
import { Tokenizer } from "../lexer/lexer";
import { Token, TokenKind } from "../lexer/tokens";

export type IncludeDirective = {
    kind: "include";
    source: string;
};

export type DefineDirective = {
    kind: "define";
    name: string;
    value: string;
};

export type UndefineDirective = {
    kind: "undefine";
    name: string;
};

export type IfDirective = {
    kind: "if";
    condition: string;
};

export type ElifDirective = {
    kind: "elif";
    condition: string;
};

export type ElseDirective = {
    kind: "else";
};

export type PreprocessorDirective =
    | IncludeDirective
    | DefineDirective
    | UndefineDirective
    | IfDirective
    | ElifDirective
    | ElseDirective;

type ParsedDirective = PreprocessorDirective | { kind: "ifEnd" };

type MacroMap = Map<string, Token[]>;

type PreprocessOptions = {
    baseDir: string;
    readFile?: (filePath: string, encoding: BufferEncoding) => Promise<string>;
    globalConstants?: Record<string, string>;
};

export type PreprocessResult = {
    tokens: Token[];
    directives: PreprocessorDirective[];
    defines: Record<string, string>;
};

export async function preprocessTokens(tokens: Token[], options: PreprocessOptions): Promise<PreprocessResult> {
    const readFile = options.readFile ?? defaultReadFile;
    const eof = tokens[tokens.length - 1] ?? { kind: TokenKind.EOF, value: "" };
    const body = tokens.slice(0, -1);

    const macros = buildInitialMacros(options.globalConstants ?? {});
    const directives: PreprocessorDirective[] = [];
    const output: Token[] = [];

    await processTokenStream(body, {
        baseDir: options.baseDir,
        readFile,
        includeStack: [],
        macros,
        directives,
        output,
        emitOutput: true,
    });

    return {
        tokens: [...output, eof],
        directives,
        defines: Object.fromEntries(
            [...macros.entries()].map(([name, valueTokens]) => [name, valueTokens.map(t => t.value).join(" ").trim()])
        ),
    };
}

type ProcessContext = {
    baseDir: string;
    readFile: (filePath: string, encoding: BufferEncoding) => Promise<string>;
    includeStack: string[];
    macros: MacroMap;
    directives: PreprocessorDirective[];
    output: Token[];
    emitOutput: boolean;
};

async function processTokenStream(tokens: Token[], ctx: ProcessContext): Promise<void> {
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        if (token.kind === TokenKind.Preprocessor) {
            const directive = parseDirectiveToken(token);

            if (directive.kind === "ifEnd") {
                throw new Error("Unexpected '$fi' without matching '$if'.");
            }

            if (directive.kind === "if") {
                const { branches, endIndex } = collectIfChain(tokens, i + 1, directive);

                for (const branch of branches) {
                    ctx.directives.push(branch.directive);
                }

                const chosenBranch = branches.find((branch) => {
                    if (branch.directive.kind === "else") {
                        return true;
                    }

                    return evaluateIfCondition(branch.directive.condition, ctx.macros);
                });

                if (chosenBranch) {
                    await processTokenStream(chosenBranch.bodyTokens, ctx);
                }

                i = endIndex;
                continue;
            }

            if (directive.kind === "elif" || directive.kind === "else") {
                throw new Error(`Unexpected '$${directive.kind}' without matching '$if'.`);
            }

            ctx.directives.push(directive);

            if (directive.kind === "define") {
                ctx.macros.set(directive.name, tokenizeMacroValue(directive.value));
                continue;
            }

            if (directive.kind === "undefine") {
                ctx.macros.delete(directive.name);
                continue;
            }

            const includePath = path.resolve(ctx.baseDir, directive.source);
            if (ctx.includeStack.includes(includePath)) {
                throw new Error(`Circular $include detected for '${directive.source}'.`);
            }

            const includeSource = await ctx.readFile(includePath, "utf8");
            const includeTokens = new Tokenizer(includeSource).tokenize().slice(0, -1);

            assertDirectiveOnlyHeader(includeTokens, includePath);

            await processTokenStream(includeTokens, {
                ...ctx,
                baseDir: path.dirname(includePath),
                includeStack: [...ctx.includeStack, includePath],
                emitOutput: false,
            });
            continue;
        }

        if (!ctx.emitOutput) {
            continue;
        }

        const expanded = expandToken(token, ctx.macros, 0);
        ctx.output.push(...expanded);
    }
}

type IfBranch = {
    directive: IfDirective | ElifDirective | ElseDirective;
    bodyTokens: Token[];
};

function collectIfChain(tokens: Token[], startIndex: number, rootIf: IfDirective): { branches: IfBranch[]; endIndex: number } {
    const branches: IfBranch[] = [];
    let currentDirective: IfDirective | ElifDirective | ElseDirective = rootIf;
    let currentBody: Token[] = [];
    let nestedIfDepth = 0;
    let seenElse = false;

    for (let i = startIndex; i < tokens.length; i++) {
        const token = tokens[i];

        if (nestedIfDepth === 0 && token.kind === TokenKind.CloseCurly) {
            const nextDirectiveIndex = nextNonTriviaIndex(tokens, i + 1);
            if (nextDirectiveIndex !== -1 && tokens[nextDirectiveIndex].kind === TokenKind.Preprocessor) {
                const nextDirective = parseDirectiveToken(tokens[nextDirectiveIndex]);
                if (
                    nextDirective.kind === "elif" ||
                    nextDirective.kind === "else" ||
                    nextDirective.kind === "ifEnd"
                ) {
                    branches.push({ directive: currentDirective, bodyTokens: currentBody });

                    if (nextDirective.kind === "ifEnd") {
                        return { branches, endIndex: nextDirectiveIndex };
                    }

                    if (seenElse) {
                        throw new Error("'$elif' cannot appear after '$else'.");
                    }

                    currentDirective = nextDirective;
                    currentBody = [];

                    if (nextDirective.kind === "else") {
                        seenElse = true;
                    }

                    i = nextDirectiveIndex;
                    continue;
                }
            }
        }

        if (token.kind !== TokenKind.Preprocessor) {
            currentBody.push(token);
            continue;
        }

        const directive = parseDirectiveToken(token);
        if (directive.kind === "if") {
            nestedIfDepth++;
            currentBody.push(token);
            continue;
        }

        if (directive.kind === "ifEnd") {
            if (nestedIfDepth === 0) {
                throw new Error("'$fi' encountered before closing '}' for '$if' branch.");
            }

            nestedIfDepth--;
            currentBody.push(token);
            continue;
        }

        currentBody.push(token);
    }

    throw new Error("Missing '$fi' for '$if' block.");
}

function nextNonTriviaIndex(tokens: Token[], from: number): number {
    for (let i = from; i < tokens.length; i++) {
        if (!isTrivia(tokens[i].kind)) {
            return i;
        }
    }
    return -1;
}

function evaluateIfCondition(condition: string, macros: MacroMap): boolean {
    const tokens = tokenizeMacroValue(condition)
        .flatMap(token => expandToken(token, macros, 0))
        .filter(token => !isTrivia(token.kind));

    if (tokens.length === 0) {
        return false;
    }

    const eqIndex = tokens.findIndex(t => t.kind === TokenKind.Equals || t.kind === TokenKind.NotEquals);
    if (eqIndex > 0 && eqIndex < tokens.length - 1) {
        const left = stringifyTokens(tokens.slice(0, eqIndex));
        const right = stringifyTokens(tokens.slice(eqIndex + 1));
        return tokens[eqIndex].kind === TokenKind.Equals ? left === right : left !== right;
    }

    if (tokens.length === 1 && tokens[0].kind === TokenKind.Identifier) {
        const name = tokens[0].value;
        if (name === "true") return true;
        if (name === "false") return false;
        return macros.has(name);
    }

    const text = stringifyTokens(tokens).toLowerCase();
    return !(text === "" || text === "0" || text === "false" || text === "null" || text === "undefined");
}

function stringifyTokens(tokens: Token[]): string {
    return tokens.map(t => t.value).join("").trim();
}

function assertDirectiveOnlyHeader(tokens: Token[], includePath: string): void {
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];

        if (token.kind === TokenKind.Preprocessor || isTrivia(token.kind)) {
            continue;
        }

        if (token.kind === TokenKind.CloseCurly) {
            const nextIndex = nextNonTriviaIndex(tokens, i + 1);
            if (nextIndex !== -1 && tokens[nextIndex].kind === TokenKind.Preprocessor) {
                const nextDirective = parseDirectiveToken(tokens[nextIndex]);
                if (
                    nextDirective.kind === "elif" ||
                    nextDirective.kind === "else" ||
                    nextDirective.kind === "ifEnd"
                ) {
                    continue;
                }
            }
        }

        throw new Error(`Included header '${includePath}' can only contain preprocessor directives.`);
    }
}

function buildInitialMacros(constants: Record<string, string>): MacroMap {
    const macros: MacroMap = new Map();

    for (const [name, value] of Object.entries(constants)) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
            throw new Error(`Invalid global constant name '${name}'.`);
        }
        macros.set(name, tokenizeMacroValue(value));
    }

    return macros;
}

function parseDirectiveToken(token: Token): ParsedDirective {
    const raw = token.value.trim();

    if (raw === "$fi") {
        return { kind: "ifEnd" };
    }

    const ifMatch = raw.match(/^\$if\s*(.*?)\s*\$\{\s*$/);
    if (ifMatch) {
        const condition = ifMatch[1].trim();
        if (!condition) {
            throw new Error("$if requires a condition before '${'.");
        }
        return { kind: "if", condition };
    }

    const elifMatch = raw.match(/^\$elif\s*(.*?)\s*\$\{\s*$/);
    if (elifMatch) {
        const condition = elifMatch[1].trim();
        if (!condition) {
            throw new Error("$elif requires a condition before '${'.");
        }
        return { kind: "elif", condition };
    }

    if (/^\$else\s+\$\{\s*$/.test(raw)) {
        return { kind: "else" };
    }

    const match = raw.match(/^\$(\w+)(?:\s+(.+))?$/);
    if (!match) {
        throw new Error(`Invalid preprocessor directive '${raw}'.`);
    }

    const [, name, tail = ""] = match;
    const arg = tail.trim();

    if (name === "include") {
        if (arg.length === 0) {
            throw new Error("$include requires a file path.");
        }
        return { kind: "include", source: arg };
    }

    if (name === "define") {
        const parts = arg.split(/\s+/, 2);
        const macroName = parts[0] ?? "";
        const macroValue = arg.slice(macroName.length).trim();

        if (!macroName || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(macroName)) {
            throw new Error(`$define requires a valid macro name, got '${macroName || arg}'.`);
        }
        if (macroValue.length === 0) {
            throw new Error(`$define '${macroName}' requires a value.`);
        }

        return { kind: "define", name: macroName, value: macroValue };
    }

    if (name === "undefine") {
        if (!arg || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(arg)) {
            throw new Error(`$undefine requires a valid macro name, got '${arg || ""}'.`);
        }
        return { kind: "undefine", name: arg };
    }

    throw new Error(`Unknown preprocessor directive '$${name}'.`);
}

function tokenizeMacroValue(value: string): Token[] {
    const tokens = new Tokenizer(value).tokenize().slice(0, -1);
    return tokens.filter(t => t.kind !== TokenKind.Newline && t.kind !== TokenKind.Preprocessor);
}

function expandToken(token: Token, macros: MacroMap, depth: number): Token[] {
    if (depth > 24) {
        throw new Error("Macro expansion exceeded maximum depth.");
    }

    if (token.kind !== TokenKind.Identifier) {
        return [token];
    }

    const replacement = macros.get(token.value);
    if (!replacement) {
        return [token];
    }

    return replacement.flatMap(next => expandToken(next, macros, depth + 1));
}

function isTrivia(kind: TokenKind): boolean {
    return (
        kind === TokenKind.Newline ||
        kind === TokenKind.LineComment ||
        kind === TokenKind.BlockComment
    );
}

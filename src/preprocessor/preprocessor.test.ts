import { describe, expect, it } from "vitest";
import { Tokenizer } from "../lexer/lexer";
import { TokenKind } from "../lexer/tokens";
import { preprocessTokens } from "./preprocessor";

const fakeFs: Record<string, string> = {
    "/project/defs.feph": "$define TEN 10\n$define GREETING \"hi\"",
    "/project/nested.feph": "$include defs.feph\n$define TWENTY TEN + TEN",
    "/project/undef.feph": "$define X 10\n$undefine X\n$define X 20",
    "/project/with-code.feph": "$define A 1\nlet nope = 2",
    "/project/if-header.feph": "$if FLAG ${\n$define FROM_HEADER 1\n}\n$fi\n",
};

function readFileMock(filePath: string): Promise<string> {
    const content = fakeFs[filePath];
    if (content === undefined) {
        return Promise.reject(new Error(`ENOENT: ${filePath}`));
    }
    return Promise.resolve(content);
}

describe("preprocessTokens", () => {
    it("expands top-level define macros in code tokens", async () => {
        const tokens = new Tokenizer("$define TEN 10\nlet a = TEN").tokenize();
        const result = await preprocessTokens(tokens, { baseDir: "/project", readFile: readFileMock });

        expect(result.directives).toEqual([{ kind: "define", name: "TEN", value: "10" }]);
        expect(result.tokens.map(t => t.kind)).toEqual([
            TokenKind.Let,
            TokenKind.Identifier,
            TokenKind.Assignment,
            TokenKind.Number,
            TokenKind.EOF,
        ]);
    });

    it("applies include directives to load more preprocessor directives only", async () => {
        const tokens = new Tokenizer("$include defs.feph\nlet n = TEN").tokenize();
        const result = await preprocessTokens(tokens, { baseDir: "/project", readFile: readFileMock });

        expect(result.directives).toEqual([
            { kind: "include", source: "defs.feph" },
            { kind: "define", name: "TEN", value: "10" },
            { kind: "define", name: "GREETING", value: '"hi"' },
        ]);

        // include does not emit/insert code; only macro expansion changes tokens.
        expect(result.tokens.map(t => t.value)).toContain("10");
        expect(result.tokens.map(t => t.value)).not.toContain("defs.feph");
    });

    it("supports nested includes and recursive macro expansion", async () => {
        const tokens = new Tokenizer("$include nested.feph\nlet x = TWENTY").tokenize();
        const result = await preprocessTokens(tokens, { baseDir: "/project", readFile: readFileMock });

        expect(result.tokens.map(t => t.value)).toEqual([
            "let",
            "x",
            "=",
            "10",
            "+",
            "10",
            "",
        ]);
    });

    it("supports $undefine and executes included instructions in order", async () => {
        const tokens = new Tokenizer("$include undef.feph\nlet x = X").tokenize();
        const result = await preprocessTokens(tokens, { baseDir: "/project", readFile: readFileMock });

        expect(result.directives).toEqual([
            { kind: "include", source: "undef.feph" },
            { kind: "define", name: "X", value: "10" },
            { kind: "undefine", name: "X" },
            { kind: "define", name: "X", value: "20" },
        ]);

        expect(result.tokens.map(t => t.value)).toEqual(["let", "x", "=", "20", ""]);
        expect(result.defines.X).toBe("20");
    });

    it("expands global constants", async () => {
        const tokens = new Tokenizer("let backend = __BACKEND__").tokenize();
        const result = await preprocessTokens(tokens, {
            baseDir: "/project",
            readFile: readFileMock,
            globalConstants: {
                __BACKEND__: '"js"',
            },
        });

        expect(result.tokens.map(t => t.value)).toEqual(["let", "backend", "=", '"js"', ""]);
        expect(result.defines.__BACKEND__).toBe('"js"');
    });

    it("rejects included headers that contain code", async () => {
        const tokens = new Tokenizer("$include with-code.feph\nlet a = 1").tokenize();
        await expect(preprocessTokens(tokens, { baseDir: "/project", readFile: readFileMock }))
            .rejects.toThrow("Included header '/project/with-code.feph' can only contain preprocessor directives.");
    });

    it("allows directives anywhere and applies them from that point onward", async () => {
        const tokens = new Tokenizer("let a = X\n$define X 2\nlet b = X").tokenize();
        const result = await preprocessTokens(tokens, { baseDir: "/project", readFile: readFileMock });

        expect(result.tokens.map(t => t.kind)).toEqual([
            TokenKind.Let,
            TokenKind.Identifier,
            TokenKind.Assignment,
            TokenKind.Identifier,
            TokenKind.Newline,
            TokenKind.Let,
            TokenKind.Identifier,
            TokenKind.Assignment,
            TokenKind.Number,
            TokenKind.EOF,
        ]);
    });

    it("supports undefine after code", async () => {
        const tokens = new Tokenizer("$define X 2\nlet a = X\n$undefine X\nlet b = X").tokenize();
        const result = await preprocessTokens(tokens, { baseDir: "/project", readFile: readFileMock });

        expect(result.tokens.map(t => t.kind)).toEqual([
            TokenKind.Let,
            TokenKind.Identifier,
            TokenKind.Assignment,
            TokenKind.Number,
            TokenKind.Newline,
            TokenKind.Let,
            TokenKind.Identifier,
            TokenKind.Assignment,
            TokenKind.Identifier,
            TokenKind.EOF,
        ]);
    });

    it("supports compile-time if blocks with $if $(...) ${ ... $}", async () => {
        const src = "$define FLAG 1\n$if FLAG ${\nlet a = 1\n}\n$fi\n$if 0 ${\nlet b = 2\n}\n$fi\nlet c = 3";
        const tokens = new Tokenizer(src).tokenize();
        const result = await preprocessTokens(tokens, { baseDir: "/project", readFile: readFileMock });

        expect(result.tokens.map(t => t.value)).toEqual([
            "let", "a", "=", "1", "\n",
            "let", "c", "=", "3", "",
        ]);
    });

    it("supports nested compile-time if blocks", async () => {
        const src = "$define A 1\n$define B 1\n$if A ${\n$if B ${\nlet x = 1\n}\n$fi\n}\n$fi\nlet y = 2";
        const tokens = new Tokenizer(src).tokenize();
        const result = await preprocessTokens(tokens, { baseDir: "/project", readFile: readFileMock });

        expect(result.tokens.map(t => t.value)).toEqual([
            "let", "x", "=", "1", "\n",
            "let", "y", "=", "2", "",
        ]);
    });

    it("supports $elif and $else branches", async () => {
        const src = "$define MODE test\n$if MODE == prod ${\nlet env = 1\n}\n$elif MODE == test ${\nlet env = 2\n}\n$else ${\nlet env = 3\n}\n$fi";
        const tokens = new Tokenizer(src).tokenize();
        const result = await preprocessTokens(tokens, { baseDir: "/project", readFile: readFileMock });

        expect(result.tokens.map(t => t.value)).toEqual(["let", "env", "=", "2", "\n", ""]);
    });

    it("uses $else when all prior conditions are false", async () => {
        const src = "$if 0 ${\nlet x = 1\n}\n$elif false ${\nlet x = 2\n}\n$else ${\nlet x = 3\n}\n$fi";
        const tokens = new Tokenizer(src).tokenize();
        const result = await preprocessTokens(tokens, { baseDir: "/project", readFile: readFileMock });

        expect(result.tokens.map(t => t.value)).toEqual(["let", "x", "=", "3", "\n", ""]);
    });

    it("evaluates $if in included headers", async () => {
        const src = "$define FLAG 1\n$include if-header.feph\nlet z = FROM_HEADER";
        const tokens = new Tokenizer(src).tokenize();
        const result = await preprocessTokens(tokens, { baseDir: "/project", readFile: readFileMock });

        expect(result.tokens.map(t => t.value)).toEqual(["let", "z", "=", "1", ""]);
    });
});

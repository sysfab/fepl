import { describe, expect, it } from "vitest";
import * as path from "node:path";
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

const stdHeaderPath = path.resolve(__dirname, "../..", "std.feph");

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

    it("supports function-like macros with arguments", async () => {
        const tokens = new Tokenizer("$define ADD(a, b) a + b\nlet sum = ADD(2, 3)").tokenize();
        const result = await preprocessTokens(tokens, { baseDir: "/project", readFile: readFileMock });

        expect(result.tokens.map(t => t.value)).toEqual(["let", "sum", "=", "2", "+", "3", ""]);
    });

    it("supports nested function-like macro calls", async () => {
        const src = "$define ADD(a, b) a + b\n$define DOUBLE(x) ADD(x, x)\nlet out = DOUBLE(5)";
        const tokens = new Tokenizer(src).tokenize();
        const result = await preprocessTokens(tokens, { baseDir: "/project", readFile: readFileMock });

        expect(result.tokens.map(t => t.value)).toEqual(["let", "out", "=", "5", "+", "5", ""]);
    });

    it("supports commas inside function-like macro arguments", async () => {
        const src = "$define FIRST(x, y) x\nlet v = FIRST([1, 2], 3)";
        const tokens = new Tokenizer(src).tokenize();
        const result = await preprocessTokens(tokens, { baseDir: "/project", readFile: readFileMock });

        expect(result.tokens.map(t => t.value)).toEqual(["let", "v", "=", "[", "1", ",", "2", "]", ""]);
    });

    it("throws when function-like macro argument count is incorrect", async () => {
        const tokens = new Tokenizer("$define ADD(a, b) a + b\nlet bad = ADD(1)").tokenize();

        await expect(preprocessTokens(tokens, { baseDir: "/project", readFile: readFileMock }))
            .rejects.toThrow("Macro 'ADD' expects 2 argument(s), got 1.");
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

    it("treats self-referential macro aliases as no-op", async () => {
        const tokens = new Tokenizer("$define true true\nlet x = true").tokenize();
        const result = await preprocessTokens(tokens, { baseDir: "/project", readFile: readFileMock });

        expect(result.tokens.map(t => t.value)).toEqual(["let", "x", "=", "true", ""]);
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

    it("maps std true/false/none macros for js backend", async () => {
        const src = `$include ${stdHeaderPath}\nlet t = true\nlet f = false\nlet n = none`;
        const tokens = new Tokenizer(src).tokenize();
        const result = await preprocessTokens(tokens, {
            baseDir: "/project",
            globalConstants: {
                __BACKEND__: '"js"',
            },
        });

        const values = result.tokens
            .filter(t => t.kind !== TokenKind.Newline && t.kind !== TokenKind.EOF)
            .map(t => t.value);

        expect(values).toEqual(["let", "t", "=", "true", "let", "f", "=", "false", "let", "n", "=", "null"]);
        expect(result.defines.true).toBe("true");
        expect(result.defines.false).toBe("false");
        expect(result.defines.none).toBe("null");
    });

    it("expands std I/O helper macros for js backend", async () => {
        const src = `$include ${stdHeaderPath}\nprint("hi")\nlet q = input()`;
        const tokens = new Tokenizer(src).tokenize();
        const result = await preprocessTokens(tokens, {
            baseDir: "/project",
            globalConstants: {
                __BACKEND__: '"js"',
            },
        });

        const values = result.tokens
            .filter(t => t.kind !== TokenKind.Newline && t.kind !== TokenKind.EOF)
            .map(t => t.value);

        expect(values).toEqual([
            "console", ".", "log", "(", '"hi"', ")",
            "let", "q", "=", "prompt", "(", ")",
        ]);
    });

    it("expands std conversion, math, and collection helpers for js backend", async () => {
        const src = `$include ${stdHeaderPath}\nlet a = str(5)\nlet b = int("7")\nlet c = float("3.14")\nlet d = bool(1)\nlet l = len(items)\nlet ab = abs(value)\nlet rd = round(3.6)\nlet mn = min(left, right)\nlet mx = max(left, right)\nlet pw = pow(2, 3)\nlet sq = sqrt(size)\nlet has = contains(items, needle)\nlet r = range(1, 5, 2)\nlet ks = keys(user)\nlet vs = values(user)`;
        const tokens = new Tokenizer(src).tokenize();
        const result = await preprocessTokens(tokens, {
            baseDir: "/project",
            globalConstants: {
                __BACKEND__: '"js"',
            },
        });

        const values = result.tokens
            .filter(t => t.kind !== TokenKind.Newline && t.kind !== TokenKind.EOF)
            .map(t => t.value);

        expect(values).toEqual([
            "let", "a", "=", "String", "(", "5", ")",
            "let", "b", "=", "Number", ".", "parseInt", "(", '"7"', ",", "10", ")",
            "let", "c", "=", "Number", ".", "parseFloat", "(", '"3.14"', ")",
            "let", "d", "=", "Boolean", "(", "1", ")",
            "let", "l", "=", "items", ".", "length",
            "let", "ab", "=", "Math", "[", '"abs"', "]", "(", "value", ")",
            "let", "rd", "=", "Math", "[", '"round"', "]", "(", "3.6", ")",
            "let", "mn", "=", "Math", "[", '"min"', "]", "(", "left", ",", "right", ")",
            "let", "mx", "=", "Math", "[", '"max"', "]", "(", "left", ",", "right", ")",
            "let", "pw", "=", "Math", "[", '"pow"', "]", "(", "2", ",", "3", ")",
            "let", "sq", "=", "Math", "[", '"sqrt"', "]", "(", "size", ")",
            "let", "has", "=", "items", ".", "includes", "(", "needle", ")",
            "let", "r", "=", "Array", ".", "from", "(", "{", "length", ":", "Math", "[", '"max"', "]", "(", "0", ",", "Math", "[", '"ceil"', "]", "(", "(", "5", "-", "1", ")", "/", "2", ")", ")", "}", ",", "(", "_", ",", "i", ")", "=>", "i", "*", "2", "+", "1", ")",
            "let", "ks", "=", "Object", "[", '"keys"', "]", "(", "user", ")",
            "let", "vs", "=", "Object", "[", '"values"', "]", "(", "user", ")",
        ]);
    });

    it("maps std true/false/none macros for python backend", async () => {
        const src = `$include ${stdHeaderPath}\nlet t = true\nlet f = false\nlet n = none`;
        const tokens = new Tokenizer(src).tokenize();
        const result = await preprocessTokens(tokens, {
            baseDir: "/project",
            globalConstants: {
                __BACKEND__: '"python"',
            },
        });

        const values = result.tokens
            .filter(t => t.kind !== TokenKind.Newline && t.kind !== TokenKind.EOF)
            .map(t => t.value);

        expect(values).toEqual(["let", "t", "=", "True", "let", "f", "=", "False", "let", "n", "=", "None"]);
        expect(result.defines.true).toBe("True");
        expect(result.defines.false).toBe("False");
        expect(result.defines.none).toBe("None");
    });

    it("expands std conversion, math, and collection helpers for python backend", async () => {
        const src = `$include ${stdHeaderPath}\nlet a = str(5)\nlet b = int("7")\nlet c = float("3.14")\nlet d = bool(1)\nlet l = len(items)\nlet ab = abs(value)\nlet rd = round(3.6)\nlet mn = min(left, right)\nlet mx = max(left, right)\nlet pw = pow(2, 3)\nlet sq = sqrt(size)\nlet has = contains(items, needle)\nlet r = range(1, 5, 2)\nlet ks = keys(user)\nlet vs = values(user)`;
        const tokens = new Tokenizer(src).tokenize();
        const result = await preprocessTokens(tokens, {
            baseDir: "/project",
            globalConstants: {
                __BACKEND__: '"python"',
            },
        });

        const values = result.tokens
            .filter(t => t.kind !== TokenKind.Newline && t.kind !== TokenKind.EOF)
            .map(t => t.value);

        expect(values).toEqual([
            "let", "a", "=", "getattr", "(", "__import__", "(", '"builtins"', ")", ",", '"str"', ")", "(", "5", ")",
            "let", "b", "=", "getattr", "(", "__import__", "(", '"builtins"', ")", ",", '"int"', ")", "(", '"7"', ")",
            "let", "c", "=", "getattr", "(", "__import__", "(", '"builtins"', ")", ",", '"float"', ")", "(", '"3.14"', ")",
            "let", "d", "=", "getattr", "(", "__import__", "(", '"builtins"', ")", ",", '"bool"', ")", "(", "1", ")",
            "let", "l", "=", "getattr", "(", "__import__", "(", '"builtins"', ")", ",", '"len"', ")", "(", "items", ")",
            "let", "ab", "=", "getattr", "(", "__import__", "(", '"builtins"', ")", ",", '"abs"', ")", "(", "value", ")",
            "let", "rd", "=", "getattr", "(", "__import__", "(", '"builtins"', ")", ",", '"round"', ")", "(", "3.6", ")",
            "let", "mn", "=", "getattr", "(", "__import__", "(", '"builtins"', ")", ",", '"min"', ")", "(", "left", ",", "right", ")",
            "let", "mx", "=", "getattr", "(", "__import__", "(", '"builtins"', ")", ",", '"max"', ")", "(", "left", ",", "right", ")",
            "let", "pw", "=", "getattr", "(", "__import__", "(", '"builtins"', ")", ",", '"pow"', ")", "(", "2", ",", "3", ")",
            "let", "sq", "=", "getattr", "(", "__import__", "(", '"math"', ")", ",", '"sqrt"', ")", "(", "size", ")",
            "let", "has", "=", "getattr", "(", "items", ",", '"__contains__"', ")", "(", "needle", ")",
            "let", "r", "=", "getattr", "(", "__import__", "(", '"builtins"', ")", ",", '"range"', ")", "(", "1", ",", "5", ",", "2", ")",
            "let", "ks", "=", "list", "(", "getattr", "(", "user", ",", '"keys"', ")", "(", ")", ")",
            "let", "vs", "=", "list", "(", "getattr", "(", "user", ",", '"values"', ")", "(", ")", ")",
        ]);
    });
});

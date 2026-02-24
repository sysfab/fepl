import { describe, it, expect } from "vitest";
import { Tokenizer } from "./lexer";
import { TokenKind } from "./tokens";

// Returns just the token kinds — good for most assertions
function lex(src: string): TokenKind[] {
    return new Tokenizer(src).tokenize().map(t => t.kind);
}

// Returns [kind, value] tuples — use when value matters
function lexFull(src: string): [TokenKind, string][] {
    return new Tokenizer(src).tokenize().map(t => [t.kind, t.value]);
}

// ─── Whitespace & comments ────────────────────────────────────────────────────

describe("whitespace and comments", () => {
    it("skips spaces and tabs", () => {
        expect(lex("   \t  ")).toEqual([TokenKind.EOF]);
    });

    it("tokenizes line comments", () => {
        expect(lex("// this is a comment")).toEqual([TokenKind.LineComment, TokenKind.EOF]);
    });

    it("tokenizes comments and still lexes the next line", () => {
        expect(lex("// comment\nlet")).toEqual([
            TokenKind.LineComment,
            TokenKind.Let,
            TokenKind.EOF,
        ]);
    });

    it("tokenizes block comments", () => {
        expect(lex("/* this is a comment */")).toEqual([TokenKind.BlockComment, TokenKind.EOF]);
    });

    it("tokenizes multiline block comments and continues lexing", () => {
        expect(lex("let a = 1 /* comment\nline two */ let b = 2")).toEqual([
            TokenKind.Let,
            TokenKind.Identifier,
            TokenKind.Assignment,
            TokenKind.Number,
            TokenKind.BlockComment,
            TokenKind.Let,
            TokenKind.Identifier,
            TokenKind.Assignment,
            TokenKind.Number,
            TokenKind.EOF,
        ]);
    });

    it("tokenizes preprocessor directives", () => {
        expect(lex("$include defs.feph\nlet a = 1")).toEqual([
            TokenKind.Preprocessor,
            TokenKind.Let,
            TokenKind.Identifier,
            TokenKind.Assignment,
            TokenKind.Number,
            TokenKind.EOF,
        ]);
    });
});

// ─── Newline / ASI ───────────────────────────────────────────────────────────

describe("newline (ASI)", () => {
    it("emits Newline after an identifier", () => {
        expect(lex("foo\n")).toEqual([TokenKind.Identifier, TokenKind.Newline, TokenKind.EOF]);
    });

    it("emits Newline after a number", () => {
        expect(lex("42\n")).toEqual([TokenKind.Number, TokenKind.Newline, TokenKind.EOF]);
    });

    it("emits Newline after a string", () => {
        expect(lex('"hi"\n')).toEqual([TokenKind.String, TokenKind.Newline, TokenKind.EOF]);
    });

    it("emits Newline after CloseParen", () => {
        expect(lex("foo()\n")).toEqual([
            TokenKind.Identifier, TokenKind.OpenParen, TokenKind.CloseParen,
            TokenKind.Newline, TokenKind.EOF,
        ]);
    });

    it("emits Newline after CloseCurly", () => {
        expect(lex("}\n")).toEqual([TokenKind.CloseCurly, TokenKind.Newline, TokenKind.EOF]);
    });

    it("does NOT emit Newline after an operator (not a stmt ender)", () => {
        expect(lex("+\n")).toEqual([TokenKind.Plus, TokenKind.EOF]);
    });

    it("does NOT emit Newline after a comma", () => {
        expect(lex(",\n")).toEqual([TokenKind.Comma, TokenKind.EOF]);
    });

    it("collapses multiple blank lines into a single Newline", () => {
        expect(lex("a\n\n\nb")).toEqual([
            TokenKind.Identifier, TokenKind.Newline, TokenKind.Identifier, TokenKind.EOF,
        ]);
    });

    it("does not emit a leading Newline at start of file", () => {
        expect(lex("\nlet")).toEqual([TokenKind.Let, TokenKind.EOF]);
    });
});

// ─── Literals ─────────────────────────────────────────────────────────────────

describe("number literals", () => {
    it("lexes an integer", () => {
        expect(lexFull("42")).toEqual([[TokenKind.Number, "42"], [TokenKind.EOF, ""]]);
    });

    it("lexes a float", () => {
        expect(lexFull("3.14")).toEqual([[TokenKind.Number, "3.14"], [TokenKind.EOF, ""]]);
    });
});

describe("string literals", () => {
    it("lexes a double-quoted string", () => {
        expect(lexFull('"hello"')).toEqual([[TokenKind.String, '"hello"'], [TokenKind.EOF, ""]]);
    });

    it("lexes a single-quoted string", () => {
        expect(lexFull("'world'")).toEqual([[TokenKind.String, "'world'"], [TokenKind.EOF, ""]]);
    });

    it("lexes an empty string", () => {
        expect(lexFull('""')).toEqual([[TokenKind.String, '""'], [TokenKind.EOF, ""]]);
    });
});

describe("template literals", () => {
    it("lexes a plain template", () => {
        expect(lex("`hello`")).toEqual([TokenKind.TemplateLiteral, TokenKind.EOF]);
    });

    it("stores the raw value including backticks", () => {
        expect(lexFull("`hello`")).toEqual([
            [TokenKind.TemplateLiteral, "`hello`"],
            [TokenKind.EOF, ""],
        ]);
    });

    it("lexes a template with an interpolation", () => {
        expect(lex("`a is ${a}`")).toEqual([TokenKind.TemplateLiteral, TokenKind.EOF]);
    });

    it("stores the full raw value of a template with interpolation", () => {
        expect(lexFull("`hi ${name}!`")).toEqual([
            [TokenKind.TemplateLiteral, "`hi ${name}!`"],
            [TokenKind.EOF, ""],
        ]);
    });

    it("emits Newline after a template literal", () => {
        expect(lex("`hi`\n")).toEqual([
            TokenKind.TemplateLiteral, TokenKind.Newline, TokenKind.EOF,
        ]);
    });
});

// ─── Keywords vs identifiers ──────────────────────────────────────────────────

describe("keywords", () => {
    const cases: [string, TokenKind][] = [
        ["enum",   TokenKind.Enum],
        ["import", TokenKind.Import],
        ["from",   TokenKind.From],
        ["as",     TokenKind.As],
        ["var",    TokenKind.Var],
        ["delete", TokenKind.Delete],
        ["let",    TokenKind.Let],
        ["func",   TokenKind.Func],
        ["return", TokenKind.Return],
        ["if",     TokenKind.If],
        ["else",   TokenKind.Else],
        ["for",    TokenKind.For],
        ["while",  TokenKind.While],
        ["in",     TokenKind.In],
    ];

    for (const [src, kind] of cases) {
        it(`lexes '${src}' as a keyword`, () => {
            expect(lex(src)).toEqual([kind, TokenKind.EOF]);
        });
    }
});

describe("identifiers", () => {
    it("lexes a plain identifier", () => {
        expect(lex("foo")).toEqual([TokenKind.Identifier, TokenKind.EOF]);
    });

    it("does not confuse 'letter' with 'let'", () => {
        expect(lex("letter")).toEqual([TokenKind.Identifier, TokenKind.EOF]);
    });

    it("does not confuse 'forEach' with 'for'", () => {
        expect(lex("forEach")).toEqual([TokenKind.Identifier, TokenKind.EOF]);
    });

    it("does not confuse 'returning' with 'return'", () => {
        expect(lex("returning")).toEqual([TokenKind.Identifier, TokenKind.EOF]);
    });

    it("does not confuse 'enumerate' with 'enum'", () => {
        expect(lex("enumerate")).toEqual([TokenKind.Identifier, TokenKind.EOF]);
    });

    it("lexes identifiers with underscores and digits", () => {
        expect(lex("my_var2")).toEqual([TokenKind.Identifier, TokenKind.EOF]);
    });
});

// ─── Operator disambiguation ──────────────────────────────────────────────────

describe("operator disambiguation", () => {
    const cases: [string, TokenKind][] = [
        ["=>", TokenKind.Arrow],
        ["++", TokenKind.PlusPlus],
        ["--", TokenKind.MinusMinus],
        ["+=", TokenKind.PlusEquals],
        ["-=", TokenKind.MinusEquals],
        ["==", TokenKind.Equals],
        ["!=", TokenKind.NotEquals],
        ["<=", TokenKind.LessEquals],
        [">=", TokenKind.GreaterEquals],
        ["&=", TokenKind.AmpersandEquals],
        ["|=", TokenKind.PipeEquals],
        ["^=", TokenKind.CaretEquals],
        ["<<=", TokenKind.LeftShiftEquals],
        [">>=", TokenKind.RightShiftEquals],
        [">>>=", TokenKind.UnsignedRightShiftEquals],
        ["||", TokenKind.LogicalOr],
        ["&&", TokenKind.LogicalAnd],
        ["+",  TokenKind.Plus],
        ["-",  TokenKind.Minus],
        ["&",  TokenKind.Ampersand],
        ["|",  TokenKind.Pipe],
        ["^",  TokenKind.Caret],
        ["~",  TokenKind.Tilde],
        ["<<", TokenKind.LeftShift],
        [">>", TokenKind.RightShift],
        [">>>", TokenKind.UnsignedRightShift],
        ["=",  TokenKind.Assignment],
        ["!",  TokenKind.Not],
        ["<",  TokenKind.Less],
        [">",  TokenKind.Greater],
        
    ];

    for (const [src, kind] of cases) {
        it(`lexes '${src}' correctly`, () => {
            expect(lex(src)).toEqual([kind, TokenKind.EOF]);
        });
    }

    it("lexes => and does not confuse it with = followed by >", () => {
        // "=>" must be a single Arrow token, not Assignment + Greater
        expect(lex("=>")).toEqual([TokenKind.Arrow, TokenKind.EOF]);
        expect(lex("= >")).toEqual([TokenKind.Assignment, TokenKind.Greater, TokenKind.EOF]);
    });
});

// ─── Delimiters & punctuation ─────────────────────────────────────────────────

describe("delimiters", () => {
    it("lexes all bracket types", () => {
        expect(lex("[]{}()")).toEqual([
            TokenKind.OpenBracket, TokenKind.CloseBracket,
            TokenKind.OpenCurly,   TokenKind.CloseCurly,
            TokenKind.OpenParen,   TokenKind.CloseParen,
            TokenKind.EOF,
        ]);
    });

    it("lexes punctuation", () => {
        expect(lex(".;:?,")).toEqual([
            TokenKind.Dot, TokenKind.Semicolon, TokenKind.Colon,
            TokenKind.Question, TokenKind.Comma,
            TokenKind.EOF,
        ]);
    });
});

// ─── Multi-token expressions ──────────────────────────────────────────────────

describe("multi-token expressions", () => {
    it("lexes a variable declaration", () => {
        expect(lex("let x = 42;")).toEqual([
            TokenKind.Let, TokenKind.Identifier, TokenKind.Assignment,
            TokenKind.Number, TokenKind.Semicolon, TokenKind.EOF,
        ]);
    });

    it("lexes an if condition", () => {
        expect(lex("if (x >= 10)")).toEqual([
            TokenKind.If, TokenKind.OpenParen, TokenKind.Identifier,
            TokenKind.GreaterEquals, TokenKind.Number, TokenKind.CloseParen,
            TokenKind.EOF,
        ]);
    });

    it("lexes a for-in loop header", () => {
        expect(lex("for x in items")).toEqual([
            TokenKind.For, TokenKind.Identifier, TokenKind.In,
            TokenKind.Identifier, TokenKind.EOF,
        ]);
    });

    it("lexes a function call", () => {
        expect(lex("foo(a, b)")).toEqual([
            TokenKind.Identifier, TokenKind.OpenParen, TokenKind.Identifier,
            TokenKind.Comma, TokenKind.Identifier, TokenKind.CloseParen,
            TokenKind.EOF,
        ]);
    });

    it("lexes a func declaration header", () => {
        expect(lex("func add(a, b)")).toEqual([
            TokenKind.Func, TokenKind.Identifier, TokenKind.OpenParen,
            TokenKind.Identifier, TokenKind.Comma, TokenKind.Identifier,
            TokenKind.CloseParen, TokenKind.EOF,
        ]);
    });

    it("lexes an arrow function", () => {
        expect(lex("(a, b) => {a + b}")).toEqual([
            TokenKind.OpenParen, TokenKind.Identifier, TokenKind.Comma,
            TokenKind.Identifier, TokenKind.CloseParen, TokenKind.Arrow,
            TokenKind.OpenCurly, TokenKind.Identifier, TokenKind.Plus,
            TokenKind.Identifier, TokenKind.CloseCurly, TokenKind.EOF,
        ]);
    });

    it("lexes a return statement", () => {
        expect(lex("return a + b")).toEqual([
            TokenKind.Return, TokenKind.Identifier, TokenKind.Plus,
            TokenKind.Identifier, TokenKind.EOF,
        ]);
    });

    it("lexes newline-separated statements (ASI)", () => {
        expect(lex("print(1)\nprint(2)")).toEqual([
            TokenKind.Identifier, TokenKind.OpenParen, TokenKind.Number, TokenKind.CloseParen,
            TokenKind.Newline,
            TokenKind.Identifier, TokenKind.OpenParen, TokenKind.Number, TokenKind.CloseParen,
            TokenKind.EOF,
        ]);
    });
});


    it("lexes an enum declaration header", () => {
        expect(lex("enum Color {")).toEqual([
            TokenKind.Enum, TokenKind.Identifier, TokenKind.OpenCurly, TokenKind.EOF,
        ]);
    });

    it("lexes an enum member with a value", () => {
        expect(lex("Delivered: 1,")).toEqual([
            TokenKind.Identifier, TokenKind.Colon, TokenKind.Number, TokenKind.Comma, TokenKind.EOF,
        ]);
    });

// ─── Error handling ───────────────────────────────────────────────────────────

describe("errors", () => {
    it("throws on an unrecognised character", () => {
        expect(() => lex("@")).toThrow("Unexpected character '@'");
    });

    it("throws on a hash character", () => {
        expect(() => lex("#define")).toThrow("Unexpected character '#'");
    });
});

import { describe, it, expect } from "vitest";
import { JsBackend, jsBackend } from "./js";
import { CodegenContext } from "./backend";
import { parseProgram, createParser } from "../ast/ast";
import type { Expr, Stmt } from "../ast/ast";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ctx = () => new CodegenContext();

/** Parse and emit a single expression. */
function emitExpr(src: string): string {
    const expr = createParser(src).parseExpr();
    return jsBackend.emitExpr(expr, ctx());
}

/** Parse and emit a single statement (returns trimmed output lines joined). */
function emitStmt(src: string): string {
    const stmt = createParser(src).parseStmt();
    const c = ctx();
    jsBackend.emitStmt(stmt, c);
    return c.toString();
}

/** Parse a full program and generate JS. */
function gen(src: string): string {
    return jsBackend.generate(parseProgram(src));
}

// ─── Expressions ─────────────────────────────────────────────────────────────

describe("number expressions", () => {
    it("emits an integer", () => {
        expect(emitExpr("42")).toBe("42");
    });

    it("emits a float", () => {
        expect(emitExpr("3.14")).toBe("3.14");
    });
});

describe("string expressions", () => {
    it("wraps value in double quotes", () => {
        expect(emitExpr("'hello'")).toBe('"hello"');
    });

    it("wraps double-quoted source in double quotes", () => {
        expect(emitExpr('"world"')).toBe('"world"');
    });

    it("escapes double quotes inside the value", () => {
        // FEPL source: 'say "hi"'  →  JS: "say \"hi\""
        expect(emitExpr(`'say "hi"'`)).toBe(`"say \\"hi\\""`);
    });
});

describe("template literals", () => {
    it("emits a plain template", () => {
        expect(emitExpr("`hello world`")).toBe("`hello world`");
    });

    it("emits a template with an interpolated identifier", () => {
        expect(emitExpr("`a is ${a}`")).toBe("`a is ${a}`");
    });

    it("emits a template with an interpolated expression", () => {
        expect(emitExpr("`result: ${a + 1}`")).toBe("`result: ${a + 1}`");
    });

    it("emits a template with multiple interpolations", () => {
        expect(emitExpr("`${x} and ${y}`")).toBe("`${x} and ${y}`");
    });
});

describe("identifier expressions", () => {
    it("emits the name as-is", () => {
        expect(emitExpr("foo")).toBe("foo");
    });
});

describe("binary expressions", () => {
    const cases: [string, string][] = [
        ["1 + 2",   "1 + 2"],
        ["1 - 2",   "1 - 2"],
        ["1 * 2",   "1 * 2"],
        ["1 / 2",   "1 / 2"],
        ["1 % 2",   "1 % 2"],
        ["a == b",  "a == b"],
        ["a != b",  "a != b"],
        ["a < b",   "a < b"],
        ["a <= b",  "a <= b"],
        ["a > b",   "a > b"],
        ["a >= b",  "a >= b"],
        ["a || b",  "a || b"],
        ["a && b",  "a && b"],
    ];

    for (const [src, expected] of cases) {
        it(`emits '${src}'`, () => {
            expect(emitExpr(src)).toBe(expected);
        });
    }

    it("nested binary preserves structure without extra parens", () => {
        // The AST encodes precedence via nesting; the emitter doesn't add parens
        expect(emitExpr("1 + 2 * 3")).toBe("1 + 2 * 3");
    });
});

describe("unary expressions", () => {
    it("emits prefix -", () => {
        expect(emitExpr("-x")).toBe("-x");
    });

    it("emits prefix !", () => {
        expect(emitExpr("!flag")).toBe("!flag");
    });

    it("emits prefix ++", () => {
        expect(emitExpr("++i")).toBe("++i");
    });

    it("emits prefix --", () => {
        expect(emitExpr("--i")).toBe("--i");
    });

    it("emits delete unary with spacing", () => {
        expect(emitExpr("delete obj.x")).toBe("delete obj.x");
    });

    it("emits postfix ++", () => {
        expect(emitExpr("i++")).toBe("i++");
    });

    it("emits postfix --", () => {
        expect(emitExpr("i--")).toBe("i--");
    });
});

describe("assignment expressions", () => {
    it("emits =", () => {
        expect(emitExpr("x = 1")).toBe("x = 1");
    });

    it("emits +=", () => {
        expect(emitExpr("x += 1")).toBe("x += 1");
    });

    it("emits -=", () => {
        expect(emitExpr("x -= 1")).toBe("x -= 1");
    });

    it("emits array destructuring assignment", () => {
        expect(emitExpr("[a, b] = values")).toBe("[a, b] = values");
    });

    it("emits object destructuring assignment", () => {
        expect(emitExpr("({x, y: z} = point)")).toBe("({ x: x, y: z } = point)");
    });
});

describe("ternary expressions", () => {
    it("emits a simple ternary", () => {
        expect(emitExpr("a ? 1 : 2")).toBe("a ? 1 : 2");
    });

    it("emits a nested ternary", () => {
        expect(emitExpr("a ? b : c ? d : e")).toBe("a ? b : c ? d : e");
    });
});

describe("call expressions", () => {
    it("emits a call with no args", () => {
        expect(emitExpr("foo()")).toBe("foo()");
    });

    it("emits a call with args", () => {
        expect(emitExpr("foo(1, 2, 3)")).toBe("foo(1, 2, 3)");
    });

    it("emits a call with expression args", () => {
        expect(emitExpr("foo(a + b, c)")).toBe("foo(a + b, c)");
    });

    it("emits chained calls", () => {
        expect(emitExpr("f()()")).toBe("f()()");
    });
});

describe("index expressions", () => {
    it("emits index access", () => {
        expect(emitExpr("arr[0]")).toBe("arr[0]");
    });

    it("emits index with expression", () => {
        expect(emitExpr("arr[i + 1]")).toBe("arr[i + 1]");
    });
});

describe("member expressions", () => {
    it("emits dot access", () => {
        expect(emitExpr("obj.x")).toBe("obj.x");
    });

    it("emits chained dot access", () => {
        expect(emitExpr("a.b.c")).toBe("a.b.c");
    });

    it("emits method call", () => {
        expect(emitExpr("obj.foo()")).toBe("obj.foo()");
    });
});

describe("group expressions", () => {
    it("wraps inner expression in parens", () => {
        expect(emitExpr("(1 + 2)")).toBe("(1 + 2)");
    });

    it("preserves explicit grouping even when not needed for precedence", () => {
        expect(emitExpr("(a + b) * c")).toBe("(a + b) * c");
    });
});

describe("arrow function expressions", () => {
    it("emits an arrow with no params and empty body", () => {
        expect(emitExpr("() => {}")).toBe("() => {}");
    });

    it("emits an arrow with params and a single-stmt body", () => {
        expect(emitExpr("(a, b) => {a + b}")).toBe("(a, b) => { a + b; }");
    });

    it("emits an arrow assigned to a variable", () => {
        expect(emitExpr("(x) => {x}")).toBe("(x) => { x; }");
    });
});

// ─── Statements ───────────────────────────────────────────────────────────────

describe("ExprStmt", () => {
    it("emits an expression statement with semicolon", () => {
        expect(emitStmt("foo()")).toBe("foo();");
    });

    it("emits a print call", () => {
        expect(emitStmt("print('hello')")).toBe(`print("hello");`);
    });
});

describe("LetStmt", () => {
    it("emits a let declaration", () => {
        expect(emitStmt("let a = 10")).toBe("let a = 10;");
    });

    it("emits let with a string value", () => {
        expect(emitStmt(`let s = "hi"`)).toBe(`let s = "hi";`);
    });

    it("emits let with an expression value", () => {
        expect(emitStmt("let x = a + b")).toBe("let x = a + b;");
    });

    it("emits let with an arrow function", () => {
        expect(emitStmt("let add = (a, b) => {a + b}")).toBe(
            "let add = (a, b) => { a + b; };"
        );
    });

    it("emits list destructuring let", () => {
        expect(emitStmt("let [a, b] = values")).toBe("let [a, b] = values;");
    });

    it("emits object destructuring let", () => {
        expect(emitStmt("let {x, y: z} = point")).toBe("let { x, y: z } = point;");
    });
});

describe("VarStmt", () => {
    it("emits a var declaration", () => {
        expect(emitStmt("var a = 10")).toBe("var a = 10;");
    });

    it("emits object destructuring var", () => {
        expect(emitStmt("var {x, y: z} = point")).toBe("var { x, y: z } = point;");
    });
});

describe("ReturnStmt", () => {
    it("emits return with a value", () => {
        expect(emitStmt("return 42")).toBe("return 42;");
    });

    it("emits bare return", () => {
        expect(emitStmt("return\n")).toBe("return;");
    });

    it("emits return with an expression", () => {
        expect(emitStmt("return a + b")).toBe("return a + b;");
    });
});

describe("CommentStmt", () => {
    it("emits line comments", () => {
        expect(emitStmt("// hello")).toBe("// hello");
    });

    it("emits block comments", () => {
        expect(emitStmt("/* hello */")).toBe("/* hello */");
    });
});

describe("ImportStmt", () => {
    it("emits side-effect import", () => {
        expect(emitStmt('import "./polyfills.feph"')).toBe('import "./polyfills.feph";');
    });

    it("emits default import", () => {
        expect(emitStmt('import React from "react.feph"')).toBe('import React from "react.feph";');
    });

    it("emits namespace import", () => {
        expect(emitStmt('import * as fs from "fs.feph"')).toBe('import * as fs from "fs.feph";');
    });

    it("emits named imports with alias", () => {
        expect(emitStmt('import { readFile, writeFile as write } from "fs.feph"'))
            .toBe('import { readFile, writeFile as write } from "fs.feph";');
    });

    it("emits default + named import", () => {
        expect(emitStmt('import React, { useState } from "react.feph"'))
            .toBe('import React, { useState } from "react.feph";');
    });
});

describe("FuncDecl", () => {
    it("emits function keyword (not func)", () => {
        expect(emitStmt("func greet() {}")).toBe("function greet() {\n}");
    });

    it("emits params correctly", () => {
        expect(emitStmt("func add(a, b) { return a + b }")).toBe(
            "function add(a, b) {\n  return a + b;\n}"
        );
    });

    it("indents the body", () => {
        const out = emitStmt("func add(a, b) { return a + b }");
        const lines = out.split("\n");
        expect(lines[0]).toBe("function add(a, b) {");
        expect(lines[1]).toBe("  return a + b;");
        expect(lines[2]).toBe("}");
    });

    it("emits a function with no params", () => {
        expect(emitStmt("func noop() {}")).toBe("function noop() {\n}");
    });
});

describe("IfStmt", () => {
    it("emits an if with no else", () => {
        expect(emitStmt("if (x) { y }")).toBe("if (x) {\n  y;\n}");
    });

    it("emits an if-else", () => {
        expect(emitStmt("if (x) { 1 } else { 2 }")).toBe(
            "if (x) {\n  1;\n} else {\n  2;\n}"
        );
    });

    it("indents both branches correctly", () => {
        const out = emitStmt("if (ok) { a } else { b }");
        const lines = out.split("\n");
        expect(lines[0]).toBe("if (ok) {");
        expect(lines[1]).toBe("  a;");
        expect(lines[2]).toBe("} else {");
        expect(lines[3]).toBe("  b;");
        expect(lines[4]).toBe("}");
    });
});

describe("loop statements", () => {
    it("emits a while loop", () => {
        expect(emitStmt("while (x < 10) { x += 1 }"))
            .toBe("while (x < 10) {\n  x += 1;\n}");
    });

    it("emits a for-in loop as JS for-of", () => {
        expect(emitStmt("for (item in items) { print(item) }"))
            .toBe("for (const item of items) {\n  print(item);\n}");
    });

    it("emits a classic for loop", () => {
        expect(emitStmt("for (let i = 0; i < 5; i--) { print(i) }"))
            .toBe("for (let i = 0; i < 5; i--) {\n  print(i);\n}");
    });

    it("emits a classic for loop with var init", () => {
        expect(emitStmt("for (var i = 0; i < 5; i--) { print(i) }"))
            .toBe("for (var i = 0; i < 5; i--) {\n  print(i);\n}");
    });
});

// ─── List expressions ────────────────────────────────────────────────────────

describe("List expressions", () => {
    it("emits an empty list", () => {
        expect(emitExpr("[]")).toBe("[]");
    });

    it("emits a list with one element", () => {
        expect(emitExpr("[1]")).toBe("[1]");
    });

    it("emits a list with multiple elements", () => {
        expect(emitExpr("[1, 2, 3]")).toBe("[1, 2, 3]");
    });

    it("emits a list with mixed types", () => {
        expect(emitExpr(`["hello", 42, x]`)).toBe(`["hello", 42, x]`);
    });

    it("emits a list with expression elements", () => {
        expect(emitExpr("[a + b, c * d]")).toBe("[a + b, c * d]");
    });

    it("emits a nested list", () => {
        expect(emitExpr("[[1, 2], [3]]")).toBe("[[1, 2], [3]]");
    });

    it("emits let with a list value", () => {
        expect(emitStmt("let xs = [1, 2, 3]")).toBe("let xs = [1, 2, 3];");
    });

    it("emits index access on a list", () => {
        expect(emitExpr("[1, 2, 3][0]")).toBe("[1, 2, 3][0]");
    });
});

// ─── Dict expressions ─────────────────────────────────────────────────────────

describe("Dict expressions", () => {
    it("emits an empty dict", () => {
        expect(emitExpr("{}")).toBe("{}");
    });

    it("emits a dict with an identifier key (unquoted in JS)", () => {
        expect(emitExpr(`{ name: "Alice" }`)).toBe(`{ name: "Alice" }`);
    });

    it("emits shorthand dict properties as explicit pairs", () => {
        expect(emitExpr("{ x, y }")).toBe("{ x: x, y: y }");
    });

    it("emits a dict with a string key (quoted in JS)", () => {
        expect(emitExpr(`{ "name": "Alice" }`)).toBe(`{ "name": "Alice" }`);
    });

    it("emits a dict with multiple entries", () => {
        expect(emitExpr("{ x: 1, y: 2 }")).toBe("{ x: 1, y: 2 }");
    });

    it("emits a dict with expression values", () => {
        expect(emitExpr("{ total: a + b }")).toBe("{ total: a + b }");
    });

    it("emits a nested dict", () => {
        expect(emitExpr("{ inner: { x: 1 } }")).toBe("{ inner: { x: 1 } }");
    });

    it("emits a dict with a list value", () => {
        expect(emitExpr("{ items: [1, 2] }")).toBe("{ items: [1, 2] }");
    });

    it("emits let with a dict value", () => {
        expect(emitStmt("let p = { x: 1, y: 2 }")).toBe("let p = { x: 1, y: 2 };");
    });

    it("emits member access on a dict", () => {
        expect(emitExpr("{ x: 1 }.x")).toBe("{ x: 1 }.x");
    });
});

// ─── EnumDecl ─────────────────────────────────────────────────────────────────

describe("EnumDecl", () => {
    it("emits an auto-numbered enum as Object.freeze", () => {
        expect(emitStmt("enum Color { Red, Green, Blue }")).toBe(
            "const Color = Object.freeze({ Red: 0, Green: 1, Blue: 2 });"
        );
    });

    it("emits an enum with explicit values", () => {
        expect(emitStmt("enum State { Delivered: 1, Lost: 2 }")).toBe(
            "const State = Object.freeze({ Delivered: 1, Lost: 2 });"
        );
    });

    it("emits an enum with a single member", () => {
        expect(emitStmt("enum Unit { Only }")).toBe(
            "const Unit = Object.freeze({ Only: 0 });"
        );
    });

    it("auto-numbering continues after an explicit value", () => {
        // A: 0 (auto), B: 10 (explicit), C: 11 (auto, continues from 10+1)
        expect(emitStmt("enum Mixed { A, B: 10, C }")).toBe(
            "const Mixed = Object.freeze({ A: 0, B: 10, C: 11 });"
        );
    });

    it("emits a multiline enum correctly", () => {
        const src = `enum Color {
    Red,
    Green,
    Blue,
}`;
        expect(emitStmt(src)).toBe(
            "const Color = Object.freeze({ Red: 0, Green: 1, Blue: 2 });"
        );
    });

    it("member access on an emitted enum works as a member expression", () => {
        expect(emitExpr("State.Delivered")).toBe("State.Delivered");
    });
});

// ─── Indentation ─────────────────────────────────────────────────────────────

describe("indentation", () => {
    it("nested functions are indented correctly", () => {
        const src = `
func outer() {
    func inner() {
        return 1
    }
    return inner()
}`.trim();
        const out = gen(src);
        const lines = out.split("\n");
        expect(lines[0]).toBe("function outer() {");
        expect(lines[1]).toBe("  function inner() {");
        expect(lines[2]).toBe("    return 1;");
        expect(lines[3]).toBe("  }");
        expect(lines[4]).toBe("  return inner();");
        expect(lines[5]).toBe("}");
    });

    it("if inside function is indented correctly", () => {
        const src = `func check(x) { if (x) { return 1 } else { return 0 } }`;
        const out = gen(src);
        const lines = out.split("\n");
        expect(lines[0]).toBe("function check(x) {");
        expect(lines[1]).toBe("  if (x) {");
        expect(lines[2]).toBe("    return 1;");
        expect(lines[3]).toBe("  } else {");
        expect(lines[4]).toBe("    return 0;");
        expect(lines[5]).toBe("  }");
        expect(lines[6]).toBe("}");
    });
});

// ─── Full program (end-to-end) ────────────────────────────────────────────────

describe("full program generation", () => {
    it("generates the FEPL enum sample as valid JS", () => {
        const src = `
print("Enums!")
enum Color { Red, Green, Blue }
enum State { Delivered: 1, Lost: 2 }
print(State.Delivered)`.trim();

        const out = gen(src);
        expect(out).toContain(`print("Enums!");`);
        expect(out).toContain("const Color = Object.freeze({ Red: 0, Green: 1, Blue: 2 });");
        expect(out).toContain("const State = Object.freeze({ Delivered: 1, Lost: 2 });");
        expect(out).toContain("print(State.Delivered);");
    });

    it("generates the original FEPL sample as valid JS", () => {
        const src = `
print('Hello from FEPL!')
let a = 10
print(\`a is \${a}\`)
a = 5
func add(a, b) {
    return a + b
}
let add2 = (a, b) => {a + b}
print(1); print(2); print(3)
        `.trim();

        const out = gen(src);

        expect(out).toContain(`print("Hello from FEPL!");`);
        expect(out).toContain("let a = 10;");
        expect(out).toContain("`a is ${a}`");
        expect(out).toContain("a = 5;");
        expect(out).toContain("function add(a, b) {");
        expect(out).toContain("  return a + b;");
        expect(out).toContain("let add2 = (a, b) => { a + b; };");
        expect(out).toContain("print(1);");
        expect(out).toContain("print(2);");
        expect(out).toContain("print(3);");
    });

    it("emits multiple top-level statements each on their own line", () => {
        const out = gen("let a = 1\nlet b = 2\nlet c = 3");
        expect(out).toBe("let a = 1;\nlet b = 2;\nlet c = 3;");
    });

    it("emits an empty program as an empty string", () => {
        expect(gen("")).toBe("");
    });
});

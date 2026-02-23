import { describe, it, expect } from "vitest";
import { createParser, parseProgram, Expr, Stmt } from "./ast";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseExpr(src: string): Expr {
    return createParser(src).parseExpr();
}

function parseStmt(src: string): Stmt {
    return createParser(src).parseStmt();
}

// ─── Literals ─────────────────────────────────────────────────────────────────

describe("literals", () => {
    it("parses an integer", () => {
        expect(parseExpr("42")).toEqual({ kind: "Number", value: 42 });
    });

    it("parses a float", () => {
        expect(parseExpr("3.14")).toEqual({ kind: "Number", value: 3.14 });
    });

    it("parses a double-quoted string (strips quotes)", () => {
        expect(parseExpr('"hello"')).toEqual({ kind: "String", value: "hello" });
    });

    it("parses a single-quoted string (strips quotes)", () => {
        expect(parseExpr("'world'")).toEqual({ kind: "String", value: "world" });
    });

    it("parses an identifier", () => {
        expect(parseExpr("foo")).toEqual({ kind: "Ident", name: "foo" });
    });
});

// ─── Template literals ────────────────────────────────────────────────────────

describe("template literals", () => {
    it("parses a plain template (no interpolation)", () => {
        expect(parseExpr("`hello world`")).toEqual({
            kind: "Template",
            parts: [{ text: "hello world" }],
        });
    });

    it("parses a template with a single interpolation", () => {
        expect(parseExpr("`a is ${a}`")).toEqual({
            kind: "Template",
            parts: [
                { text: "a is " },
                { expr: { kind: "Ident", name: "a" } },
            ],
        });
    });

    it("parses a template with text after the interpolation", () => {
        expect(parseExpr("`hello ${name}!`")).toEqual({
            kind: "Template",
            parts: [
                { text: "hello " },
                { expr: { kind: "Ident", name: "name" } },
                { text: "!" },
            ],
        });
    });

    it("parses a template with an expression interpolation", () => {
        expect(parseExpr("`result: ${a + 1}`")).toEqual({
            kind: "Template",
            parts: [
                { text: "result: " },
                {
                    expr: {
                        kind: "Binary", op: "+",
                        left:  { kind: "Ident", name: "a" },
                        right: { kind: "Number", value: 1 },
                    },
                },
            ],
        });
    });

    it("parses a template with multiple interpolations", () => {
        expect(parseExpr("`${x} and ${y}`")).toEqual({
            kind: "Template",
            parts: [
                { expr: { kind: "Ident", name: "x" } },
                { text: " and " },
                { expr: { kind: "Ident", name: "y" } },
            ],
        });
    });
});

// ─── Grouped expressions ──────────────────────────────────────────────────────

describe("grouped expressions", () => {
    it("parses a grouped literal", () => {
        expect(parseExpr("(42)")).toEqual({
            kind: "Group",
            inner: { kind: "Number", value: 42 },
        });
    });

    it("parses a grouped binary expression", () => {
        expect(parseExpr("(1 + 2)")).toEqual({
            kind: "Group",
            inner: {
                kind: "Binary", op: "+",
                left:  { kind: "Number", value: 1 },
                right: { kind: "Number", value: 2 },
            },
        });
    });
});

// ─── Unary expressions ────────────────────────────────────────────────────────

describe("prefix unary", () => {
    it("parses unary minus", () => {
        expect(parseExpr("-x")).toEqual({
            kind: "Unary", op: "-", prefix: true,
            operand: { kind: "Ident", name: "x" },
        });
    });

    it("parses logical not", () => {
        expect(parseExpr("!flag")).toEqual({
            kind: "Unary", op: "!", prefix: true,
            operand: { kind: "Ident", name: "flag" },
        });
    });

    it("parses prefix ++", () => {
        expect(parseExpr("++i")).toEqual({
            kind: "Unary", op: "++", prefix: true,
            operand: { kind: "Ident", name: "i" },
        });
    });

    it("parses prefix --", () => {
        expect(parseExpr("--i")).toEqual({
            kind: "Unary", op: "--", prefix: true,
            operand: { kind: "Ident", name: "i" },
        });
    });

    it("parses delete unary", () => {
        expect(parseExpr("delete obj.x")).toEqual({
            kind: "Unary",
            op: "delete",
            prefix: true,
            operand: {
                kind: "Member",
                object: { kind: "Ident", name: "obj" },
                property: "x",
            },
        });
    });
});

describe("postfix unary", () => {
    it("parses postfix ++", () => {
        expect(parseExpr("i++")).toEqual({
            kind: "Unary", op: "++", prefix: false,
            operand: { kind: "Ident", name: "i" },
        });
    });

    it("parses postfix --", () => {
        expect(parseExpr("i--")).toEqual({
            kind: "Unary", op: "--", prefix: false,
            operand: { kind: "Ident", name: "i" },
        });
    });
});

// ─── Binary expressions ───────────────────────────────────────────────────────

describe("binary arithmetic", () => {
    const cases: [string, string][] = [
        ["1 + 2", "+"],
        ["1 - 2", "-"],
        ["1 * 2", "*"],
        ["1 / 2", "/"],
        ["1 % 2", "%"],
    ];

    for (const [src, op] of cases) {
        it(`parses '${src}'`, () => {
            expect(parseExpr(src)).toEqual({
                kind: "Binary", op,
                left:  { kind: "Number", value: 1 },
                right: { kind: "Number", value: 2 },
            });
        });
    }
});

describe("binary comparison", () => {
    const cases: [string, string][] = [
        ["a == b",  "=="],
        ["a != b",  "!="],
        ["a < b",   "<"],
        ["a <= b",  "<="],
        ["a > b",   ">"],
        ["a >= b",  ">="],
        ["a || b",  "||"],
        ["a && b",  "&&"],
    ];

    for (const [src, op] of cases) {
        it(`parses '${src}'`, () => {
            expect(parseExpr(src)).toEqual({
                kind: "Binary", op,
                left:  { kind: "Ident", name: "a" },
                right: { kind: "Ident", name: "b" },
            });
        });
    }
});

// ─── Precedence & associativity ───────────────────────────────────────────────

describe("precedence", () => {
    it("* binds tighter than +  →  1 + 2 * 3  parses as  1 + (2 * 3)", () => {
        expect(parseExpr("1 + 2 * 3")).toEqual({
            kind: "Binary", op: "+",
            left: { kind: "Number", value: 1 },
            right: {
                kind: "Binary", op: "*",
                left:  { kind: "Number", value: 2 },
                right: { kind: "Number", value: 3 },
            },
        });
    });

    it("parens override precedence  →  (1 + 2) * 3", () => {
        expect(parseExpr("(1 + 2) * 3")).toEqual({
            kind: "Binary", op: "*",
            left: {
                kind: "Group",
                inner: {
                    kind: "Binary", op: "+",
                    left:  { kind: "Number", value: 1 },
                    right: { kind: "Number", value: 2 },
                },
            },
            right: { kind: "Number", value: 3 },
        });
    });

    it("&& binds tighter than ||", () => {
        expect(parseExpr("a || b && c")).toEqual({
            kind: "Binary", op: "||",
            left: { kind: "Ident", name: "a" },
            right: {
                kind: "Binary", op: "&&",
                left:  { kind: "Ident", name: "b" },
                right: { kind: "Ident", name: "c" },
            },
        });
    });

    it("arithmetic binds tighter than comparison", () => {
        expect(parseExpr("a + 1 == b + 2")).toEqual({
            kind: "Binary", op: "==",
            left: {
                kind: "Binary", op: "+",
                left:  { kind: "Ident", name: "a" },
                right: { kind: "Number", value: 1 },
            },
            right: {
                kind: "Binary", op: "+",
                left:  { kind: "Ident", name: "b" },
                right: { kind: "Number", value: 2 },
            },
        });
    });
});

describe("left-associativity", () => {
    it("1 - 2 - 3  parses as  (1 - 2) - 3", () => {
        expect(parseExpr("1 - 2 - 3")).toEqual({
            kind: "Binary", op: "-",
            left: {
                kind: "Binary", op: "-",
                left:  { kind: "Number", value: 1 },
                right: { kind: "Number", value: 2 },
            },
            right: { kind: "Number", value: 3 },
        });
    });

    it("1 / 2 / 3  parses as  (1 / 2) / 3", () => {
        expect(parseExpr("1 / 2 / 3")).toEqual({
            kind: "Binary", op: "/",
            left: {
                kind: "Binary", op: "/",
                left:  { kind: "Number", value: 1 },
                right: { kind: "Number", value: 2 },
            },
            right: { kind: "Number", value: 3 },
        });
    });
});

// ─── Assignment ───────────────────────────────────────────────────────────────

describe("assignment expressions", () => {
    it("parses simple assignment", () => {
        expect(parseExpr("x = 1")).toEqual({
            kind: "Assign", op: "=",
            target: { kind: "Ident", name: "x" },
            value:  { kind: "Number", value: 1 },
        });
    });

    it("parses +=", () => {
        expect(parseExpr("x += 1")).toEqual({
            kind: "Assign", op: "+=",
            target: { kind: "Ident", name: "x" },
            value:  { kind: "Number", value: 1 },
        });
    });

    it("parses -=", () => {
        expect(parseExpr("x -= 1")).toEqual({
            kind: "Assign", op: "-=",
            target: { kind: "Ident", name: "x" },
            value:  { kind: "Number", value: 1 },
        });
    });

    it("is right-associative  →  a = b = 1  parses as  a = (b = 1)", () => {
        expect(parseExpr("a = b = 1")).toEqual({
            kind: "Assign", op: "=",
            target: { kind: "Ident", name: "a" },
            value: {
                kind: "Assign", op: "=",
                target: { kind: "Ident", name: "b" },
                value:  { kind: "Number", value: 1 },
            },
        });
    });

    it("parses array destructuring assignment", () => {
        expect(parseExpr("[a, b] = values")).toEqual({
            kind: "Assign",
            op: "=",
            target: {
                kind: "List",
                elements: [
                    { kind: "Ident", name: "a" },
                    { kind: "Ident", name: "b" },
                ],
            },
            value: { kind: "Ident", name: "values" },
        });
    });

    it("parses object destructuring assignment", () => {
        expect(parseExpr("({x, y: z} = point)")).toEqual({
            kind: "Group",
            inner: {
                kind: "Assign",
                op: "=",
                target: {
                    kind: "Dict",
                    entries: [
                        {
                            key: { kind: "Ident", name: "x" },
                            value: { kind: "Ident", name: "x" },
                        },
                        {
                            key: { kind: "Ident", name: "y" },
                            value: { kind: "Ident", name: "z" },
                        },
                    ],
                },
                value: { kind: "Ident", name: "point" },
            },
        });
    });
});

// ─── Ternary ──────────────────────────────────────────────────────────────────

describe("ternary", () => {
    it("parses a simple ternary", () => {
        expect(parseExpr("a ? 1 : 2")).toEqual({
            kind: "Ternary",
            condition:  { kind: "Ident", name: "a" },
            consequent: { kind: "Number", value: 1 },
            alternate:  { kind: "Number", value: 2 },
        });
    });

    it("is right-associative  →  a ? b : c ? d : e  parses as  a ? b : (c ? d : e)", () => {
        expect(parseExpr("a ? b : c ? d : e")).toEqual({
            kind: "Ternary",
            condition:  { kind: "Ident", name: "a" },
            consequent: { kind: "Ident", name: "b" },
            alternate: {
                kind: "Ternary",
                condition:  { kind: "Ident", name: "c" },
                consequent: { kind: "Ident", name: "d" },
                alternate:  { kind: "Ident", name: "e" },
            },
        });
    });
});

// ─── Call expressions ─────────────────────────────────────────────────────────

describe("call expressions", () => {
    it("parses a call with no args", () => {
        expect(parseExpr("foo()")).toEqual({
            kind: "Call",
            callee: { kind: "Ident", name: "foo" },
            args: [],
        });
    });

    it("parses a call with one arg", () => {
        expect(parseExpr("foo(1)")).toEqual({
            kind: "Call",
            callee: { kind: "Ident", name: "foo" },
            args: [{ kind: "Number", value: 1 }],
        });
    });

    it("parses a call with multiple args", () => {
        expect(parseExpr("foo(1, 2, 3)")).toEqual({
            kind: "Call",
            callee: { kind: "Ident", name: "foo" },
            args: [
                { kind: "Number", value: 1 },
                { kind: "Number", value: 2 },
                { kind: "Number", value: 3 },
            ],
        });
    });

    it("parses a call with an expression arg", () => {
        expect(parseExpr("foo(a + b)")).toEqual({
            kind: "Call",
            callee: { kind: "Ident", name: "foo" },
            args: [{
                kind: "Binary", op: "+",
                left:  { kind: "Ident", name: "a" },
                right: { kind: "Ident", name: "b" },
            }],
        });
    });

    it("parses chained calls", () => {
        expect(parseExpr("f()()")).toEqual({
            kind: "Call",
            callee: {
                kind: "Call",
                callee: { kind: "Ident", name: "f" },
                args: [],
            },
            args: [],
        });
    });
});

// ─── Index & member expressions ───────────────────────────────────────────────

describe("index expressions", () => {
    it("parses simple index access", () => {
        expect(parseExpr("arr[0]")).toEqual({
            kind: "Index",
            object: { kind: "Ident", name: "arr" },
            index:  { kind: "Number", value: 0 },
        });
    });

    it("parses index with expression", () => {
        expect(parseExpr("arr[i + 1]")).toEqual({
            kind: "Index",
            object: { kind: "Ident", name: "arr" },
            index: {
                kind: "Binary", op: "+",
                left:  { kind: "Ident", name: "i" },
                right: { kind: "Number", value: 1 },
            },
        });
    });
});

describe("member expressions", () => {
    it("parses dot access", () => {
        expect(parseExpr("obj.x")).toEqual({
            kind: "Member",
            object:   { kind: "Ident", name: "obj" },
            property: "x",
        });
    });

    it("parses chained dot access", () => {
        expect(parseExpr("a.b.c")).toEqual({
            kind: "Member",
            object: {
                kind: "Member",
                object:   { kind: "Ident", name: "a" },
                property: "b",
            },
            property: "c",
        });
    });

    it("parses method call", () => {
        expect(parseExpr("obj.foo()")).toEqual({
            kind: "Call",
            callee: {
                kind: "Member",
                object:   { kind: "Ident", name: "obj" },
                property: "foo",
            },
            args: [],
        });
    });
});

// ─── Combined expressions ─────────────────────────────────────────────────────

describe("combined expressions", () => {
    it("call result can be indexed", () => {
        expect(parseExpr("foo()[0]")).toEqual({
            kind: "Index",
            object: {
                kind: "Call",
                callee: { kind: "Ident", name: "foo" },
                args: [],
            },
            index: { kind: "Number", value: 0 },
        });
    });

    it("postfix ++ binds tighter than binary +", () => {
        expect(parseExpr("i++ + 1")).toEqual({
            kind: "Binary", op: "+",
            left: {
                kind: "Unary", op: "++", prefix: false,
                operand: { kind: "Ident", name: "i" },
            },
            right: { kind: "Number", value: 1 },
        });
    });

    it("unary minus on a grouped expression", () => {
        expect(parseExpr("-(a + b)")).toEqual({
            kind: "Unary", op: "-", prefix: true,
            operand: {
                kind: "Group",
                inner: {
                    kind: "Binary", op: "+",
                    left:  { kind: "Ident", name: "a" },
                    right: { kind: "Ident", name: "b" },
                },
            },
        });
    });
});

// ─── Arrow functions ──────────────────────────────────────────────────────────

describe("arrow functions", () => {
    it("parses an arrow function with no params", () => {
        expect(parseExpr("() => {x}")).toEqual({
            kind: "ArrowFunc",
            params: [],
            body: {
                kind: "Block",
                stmts: [{ kind: "ExprStmt", expr: { kind: "Ident", name: "x" } }],
            },
        });
    });

    it("parses an arrow function with one param", () => {
        expect(parseExpr("(x) => {x}")).toEqual({
            kind: "ArrowFunc",
            params: ["x"],
            body: {
                kind: "Block",
                stmts: [{ kind: "ExprStmt", expr: { kind: "Ident", name: "x" } }],
            },
        });
    });

    it("parses an arrow function with multiple params", () => {
        expect(parseExpr("(a, b) => {a + b}")).toEqual({
            kind: "ArrowFunc",
            params: ["a", "b"],
            body: {
                kind: "Block",
                stmts: [{
                    kind: "ExprStmt",
                    expr: {
                        kind: "Binary", op: "+",
                        left:  { kind: "Ident", name: "a" },
                        right: { kind: "Ident", name: "b" },
                    },
                }],
            },
        });
    });

    it("(x) is NOT parsed as an arrow when no => follows", () => {
        expect(parseExpr("(x)")).toEqual({
            kind: "Group",
            inner: { kind: "Ident", name: "x" },
        });
    });
});

// ─── let statement ────────────────────────────────────────────────────────────

describe("let statement", () => {
    it("parses a basic let binding", () => {
        expect(parseStmt("let a = 10")).toEqual({
            kind: "LetStmt",
            name: "a",
            value: { kind: "Number", value: 10 },
        });
    });

    it("parses let with a semicolon terminator", () => {
        expect(parseStmt("let a = 10;")).toEqual({
            kind: "LetStmt",
            name: "a",
            value: { kind: "Number", value: 10 },
        });
    });

    it("parses let with an expression value", () => {
        expect(parseStmt("let x = a + b")).toEqual({
            kind: "LetStmt",
            name: "x",
            value: {
                kind: "Binary", op: "+",
                left:  { kind: "Ident", name: "a" },
                right: { kind: "Ident", name: "b" },
            },
        });
    });

    it("parses let with an arrow function value", () => {
        expect(parseStmt("let add = (a, b) => {a + b}")).toEqual({
            kind: "LetStmt",
            name: "add",
            value: {
                kind: "ArrowFunc",
                params: ["a", "b"],
                body: {
                    kind: "Block",
                    stmts: [{
                        kind: "ExprStmt",
                        expr: {
                            kind: "Binary", op: "+",
                            left:  { kind: "Ident", name: "a" },
                            right: { kind: "Ident", name: "b" },
                        },
                    }],
                },
            },
        });
    });

    it("parses list destructuring let", () => {
        expect(parseStmt("let [a, b] = values")).toEqual({
            kind: "LetStmt",
            pattern: {
                kind: "ListPattern",
                elements: [
                    { kind: "IdentPattern", name: "a" },
                    { kind: "IdentPattern", name: "b" },
                ],
            },
            value: { kind: "Ident", name: "values" },
        });
    });

    it("parses object destructuring let", () => {
        expect(parseStmt("let {x, y: z} = point")).toEqual({
            kind: "LetStmt",
            pattern: {
                kind: "ObjectPattern",
                properties: [
                    {
                        key: "x",
                        binding: { kind: "IdentPattern", name: "x" },
                    },
                    {
                        key: "y",
                        binding: { kind: "IdentPattern", name: "z" },
                    },
                ],
            },
            value: { kind: "Ident", name: "point" },
        });
    });
});

describe("var statement", () => {
    it("parses a basic var binding", () => {
        expect(parseStmt("var a = 10")).toEqual({
            kind: "VarStmt",
            name: "a",
            value: { kind: "Number", value: 10 },
        });
    });

    it("parses destructuring var", () => {
        expect(parseStmt("var {x, y: z} = point")).toEqual({
            kind: "VarStmt",
            pattern: {
                kind: "ObjectPattern",
                properties: [
                    { key: "x", binding: { kind: "IdentPattern", name: "x" } },
                    { key: "y", binding: { kind: "IdentPattern", name: "z" } },
                ],
            },
            value: { kind: "Ident", name: "point" },
        });
    });
});

// ─── func declaration ─────────────────────────────────────────────────────────

describe("func declaration", () => {
    it("parses a function with no params and an empty body", () => {
        expect(parseStmt("func greet() {}")).toEqual({
            kind: "FuncDecl",
            name: "greet",
            params: [],
            body: { kind: "Block", stmts: [] },
        });
    });

    it("parses a function with params and a body", () => {
        expect(parseStmt("func add(a, b) { return a + b }")).toEqual({
            kind: "FuncDecl",
            name: "add",
            params: ["a", "b"],
            body: {
                kind: "Block",
                stmts: [{
                    kind: "ReturnStmt",
                    value: {
                        kind: "Binary", op: "+",
                        left:  { kind: "Ident", name: "a" },
                        right: { kind: "Ident", name: "b" },
                    },
                }],
            },
        });
    });
});

// ─── return statement ─────────────────────────────────────────────────────────

describe("return statement", () => {
    it("parses return with a value", () => {
        expect(parseStmt("return 42")).toEqual({
            kind: "ReturnStmt",
            value: { kind: "Number", value: 42 },
        });
    });

    it("parses bare return (no value)", () => {
        expect(parseStmt("return\n")).toEqual({
            kind: "ReturnStmt",
            value: null,
        });
    });
});

describe("comment statements", () => {
    it("parses a line comment as a statement", () => {
        expect(parseStmt("// hello")).toEqual({
            kind: "CommentStmt",
            value: "// hello",
        });
    });

    it("parses a block comment as a statement", () => {
        expect(parseStmt("/* hello */")).toEqual({
            kind: "CommentStmt",
            value: "/* hello */",
        });
    });

    it("keeps comments in a full program", () => {
        const program = parseProgram("let a = 1\n// note\nlet b = 2");
        expect(program.stmts).toHaveLength(3);
        expect(program.stmts[1]).toEqual({ kind: "CommentStmt", value: "// note" });
    });
});

describe("import statements", () => {
    it("parses side-effect import", () => {
        expect(parseStmt('import "./polyfills"')).toEqual({
            kind: "ImportStmt",
            source: "./polyfills",
            defaultImport: null,
            namespaceImport: null,
            namedImports: [],
        });
    });

    it("parses default import", () => {
        expect(parseStmt('import React from "react"')).toEqual({
            kind: "ImportStmt",
            source: "react",
            defaultImport: "React",
            namespaceImport: null,
            namedImports: [],
        });
    });

    it("parses namespace import", () => {
        expect(parseStmt('import * as fs from "fs"')).toEqual({
            kind: "ImportStmt",
            source: "fs",
            defaultImport: null,
            namespaceImport: "fs",
            namedImports: [],
        });
    });

    it("parses named imports with alias", () => {
        expect(parseStmt('import { readFile, writeFile as write } from "fs"')).toEqual({
            kind: "ImportStmt",
            source: "fs",
            defaultImport: null,
            namespaceImport: null,
            namedImports: [
                { imported: "readFile", local: "readFile" },
                { imported: "writeFile", local: "write" },
            ],
        });
    });

    it("parses default + named import", () => {
        expect(parseStmt('import React, { useState } from "react"')).toEqual({
            kind: "ImportStmt",
            source: "react",
            defaultImport: "React",
            namespaceImport: null,
            namedImports: [{ imported: "useState", local: "useState" }],
        });
    });
});

// ─── if statement ─────────────────────────────────────────────────────────────

describe("if statement", () => {
    it("parses an if with no else", () => {
        expect(parseStmt("if (x) { y }")).toEqual({
            kind: "IfStmt",
            condition: { kind: "Ident", name: "x" },
            consequent: {
                kind: "Block",
                stmts: [{ kind: "ExprStmt", expr: { kind: "Ident", name: "y" } }],
            },
            alternate: null,
        });
    });

    it("parses an if-else", () => {
        expect(parseStmt("if (x) { 1 } else { 2 }")).toEqual({
            kind: "IfStmt",
            condition: { kind: "Ident", name: "x" },
            consequent: {
                kind: "Block",
                stmts: [{ kind: "ExprStmt", expr: { kind: "Number", value: 1 } }],
            },
            alternate: {
                kind: "Block",
                stmts: [{ kind: "ExprStmt", expr: { kind: "Number", value: 2 } }],
            },
        });
    });
});

// ─── loops ────────────────────────────────────────────────────────────────────

describe("loop statements", () => {
    it("parses a while loop", () => {
        expect(parseStmt("while (x < 10) { x += 1 }")).toEqual({
            kind: "WhileStmt",
            condition: {
                kind: "Binary",
                op: "<",
                left: { kind: "Ident", name: "x" },
                right: { kind: "Number", value: 10 },
            },
            body: {
                kind: "Block",
                stmts: [{
                    kind: "ExprStmt",
                    expr: {
                        kind: "Assign",
                        op: "+=",
                        target: { kind: "Ident", name: "x" },
                        value: { kind: "Number", value: 1 },
                    },
                }],
            },
        });
    });

    it("parses a for-in loop", () => {
        expect(parseStmt("for (item in items) { print(item) }")).toEqual({
            kind: "ForInStmt",
            iterator: "item",
            iterable: { kind: "Ident", name: "items" },
            body: {
                kind: "Block",
                stmts: [{
                    kind: "ExprStmt",
                    expr: {
                        kind: "Call",
                        callee: { kind: "Ident", name: "print" },
                        args: [{ kind: "Ident", name: "item" }],
                    },
                }],
            },
        });
    });

    it("parses a classic for loop", () => {
        expect(parseStmt("for (let i = 0; i < 5; i--) { print(i) }")).toEqual({
            kind: "ForStmt",
            init: {
                kind: "LetStmt",
                name: "i",
                value: { kind: "Number", value: 0 },
            },
            condition: {
                kind: "Binary",
                op: "<",
                left: { kind: "Ident", name: "i" },
                right: { kind: "Number", value: 5 },
            },
            update: {
                kind: "Unary",
                op: "--",
                prefix: false,
                operand: { kind: "Ident", name: "i" },
            },
            body: {
                kind: "Block",
                stmts: [{
                    kind: "ExprStmt",
                    expr: {
                        kind: "Call",
                        callee: { kind: "Ident", name: "print" },
                        args: [{ kind: "Ident", name: "i" }],
                    },
                }],
            },
        });
    });

    it("parses a classic for loop with var init", () => {
        expect(parseStmt("for (var i = 0; i < 5; i--) { print(i) }")).toEqual({
            kind: "ForStmt",
            init: {
                kind: "VarStmt",
                name: "i",
                value: { kind: "Number", value: 0 },
            },
            condition: {
                kind: "Binary",
                op: "<",
                left: { kind: "Ident", name: "i" },
                right: { kind: "Number", value: 5 },
            },
            update: {
                kind: "Unary",
                op: "--",
                prefix: false,
                operand: { kind: "Ident", name: "i" },
            },
            body: {
                kind: "Block",
                stmts: [{
                    kind: "ExprStmt",
                    expr: {
                        kind: "Call",
                        callee: { kind: "Ident", name: "print" },
                        args: [{ kind: "Ident", name: "i" }],
                    },
                }],
            },
        });
    });
});

// ─── optional semicolons / newlines ───────────────────────────────────────────

describe("optional semicolons", () => {
    it("parses two statements separated by a newline", () => {
        expect(parseProgram("print(1)\nprint(2)")).toEqual({
            kind: "Program",
            stmts: [
                { kind: "ExprStmt", expr: { kind: "Call", callee: { kind: "Ident", name: "print" }, args: [{ kind: "Number", value: 1 }] } },
                { kind: "ExprStmt", expr: { kind: "Call", callee: { kind: "Ident", name: "print" }, args: [{ kind: "Number", value: 2 }] } },
            ],
        });
    });

    it("parses multiple statements separated by semicolons on one line", () => {
        expect(parseProgram("print(1); print(2); print(3);")).toEqual({
            kind: "Program",
            stmts: [
                { kind: "ExprStmt", expr: { kind: "Call", callee: { kind: "Ident", name: "print" }, args: [{ kind: "Number", value: 1 }] } },
                { kind: "ExprStmt", expr: { kind: "Call", callee: { kind: "Ident", name: "print" }, args: [{ kind: "Number", value: 2 }] } },
                { kind: "ExprStmt", expr: { kind: "Call", callee: { kind: "Ident", name: "print" }, args: [{ kind: "Number", value: 3 }] } },
            ],
        });
    });

    it("tolerates blank lines between statements", () => {
        const prog = parseProgram("let a = 1\n\nlet b = 2");
        expect(prog.stmts).toHaveLength(2);
        expect(prog.stmts[0]).toMatchObject({ kind: "LetStmt", name: "a" });
        expect(prog.stmts[1]).toMatchObject({ kind: "LetStmt", name: "b" });
    });
});

// ─── full program ─────────────────────────────────────────────────────────────

describe("full program", () => {
    it("parses the FEPL sample snippet", () => {
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

        const prog = parseProgram(src);
        expect(prog.kind).toBe("Program");
        expect(prog.stmts).toHaveLength(9);
        expect(prog.stmts[0]).toMatchObject({ kind: "ExprStmt" });           // print('Hello from FEPL!')
        expect(prog.stmts[1]).toMatchObject({ kind: "LetStmt", name: "a" }); // let a = 10
        expect(prog.stmts[2]).toMatchObject({ kind: "ExprStmt" });           // print(`a is ${a}`)
        expect(prog.stmts[3]).toMatchObject({ kind: "ExprStmt" });           // a = 5
        expect(prog.stmts[4]).toMatchObject({ kind: "FuncDecl", name: "add", params: ["a", "b"] });
        expect(prog.stmts[5]).toMatchObject({ kind: "LetStmt", name: "add2" });
        expect(prog.stmts[6]).toMatchObject({ kind: "ExprStmt" });           // print(1)
        expect(prog.stmts[7]).toMatchObject({ kind: "ExprStmt" });           // print(2)
        expect(prog.stmts[8]).toMatchObject({ kind: "ExprStmt" });           // print(3)
    });
});

// ─── list literals ───────────────────────────────────────────────────────────

describe("list literals", () => {
    it("parses an empty list", () => {
        expect(parseExpr("[]")).toEqual({ kind: "List", elements: [] });
    });

    it("parses a list with one element", () => {
        expect(parseExpr("[1]")).toEqual({
            kind: "List",
            elements: [{ kind: "Number", value: 1 }],
        });
    });

    it("parses a list with multiple elements", () => {
        expect(parseExpr("[1, 2, 3]")).toEqual({
            kind: "List",
            elements: [
                { kind: "Number", value: 1 },
                { kind: "Number", value: 2 },
                { kind: "Number", value: 3 },
            ],
        });
    });

    it("parses a list with mixed element types", () => {
        expect(parseExpr(`["hello", 42, x]`)).toEqual({
            kind: "List",
            elements: [
                { kind: "String", value: "hello" },
                { kind: "Number", value: 42 },
                { kind: "Ident",  name: "x" },
            ],
        });
    });

    it("parses a list with expression elements", () => {
        expect(parseExpr("[a + b, c * d]")).toEqual({
            kind: "List",
            elements: [
                { kind: "Binary", op: "+", left: { kind: "Ident", name: "a" }, right: { kind: "Ident", name: "b" } },
                { kind: "Binary", op: "*", left: { kind: "Ident", name: "c" }, right: { kind: "Ident", name: "d" } },
            ],
        });
    });

    it("parses a nested list", () => {
        expect(parseExpr("[[1, 2], [3, 4]]")).toEqual({
            kind: "List",
            elements: [
                { kind: "List", elements: [{ kind: "Number", value: 1 }, { kind: "Number", value: 2 }] },
                { kind: "List", elements: [{ kind: "Number", value: 3 }, { kind: "Number", value: 4 }] },
            ],
        });
    });

    it("parses index access on a list literal", () => {
        expect(parseExpr("[1, 2, 3][0]")).toEqual({
            kind: "Index",
            object: { kind: "List", elements: [{ kind: "Number", value: 1 }, { kind: "Number", value: 2 }, { kind: "Number", value: 3 }] },
            index: { kind: "Number", value: 0 },
        });
    });

    it("parses a list as a let value", () => {
        expect(parseStmt("let xs = [1, 2, 3]")).toEqual({
            kind: "LetStmt",
            name: "xs",
            value: {
                kind: "List",
                elements: [
                    { kind: "Number", value: 1 },
                    { kind: "Number", value: 2 },
                    { kind: "Number", value: 3 },
                ],
            },
        });
    });
});

// ─── dict literals ────────────────────────────────────────────────────────────

describe("dict literals", () => {
    it("parses an empty dict", () => {
        expect(parseExpr("{}")).toEqual({ kind: "Dict", entries: [] });
    });

    it("parses a dict with an identifier key", () => {
        expect(parseExpr(`{ name: "Alice" }`)).toEqual({
            kind: "Dict",
            entries: [{
                key:   { kind: "Ident", name: "name" },
                value: { kind: "String", value: "Alice" },
            }],
        });
    });

    it("parses dict shorthand properties", () => {
        expect(parseExpr("{ x, y }")).toEqual({
            kind: "Dict",
            entries: [
                {
                    key: { kind: "Ident", name: "x" },
                    value: { kind: "Ident", name: "x" },
                },
                {
                    key: { kind: "Ident", name: "y" },
                    value: { kind: "Ident", name: "y" },
                },
            ],
        });
    });

    it("parses a dict with a string key", () => {
        expect(parseExpr(`{ "name": "Alice" }`)).toEqual({
            kind: "Dict",
            entries: [{
                key:   { kind: "String", value: "name" },
                value: { kind: "String", value: "Alice" },
            }],
        });
    });

    it("parses a dict with multiple entries", () => {
        expect(parseExpr("{ x: 1, y: 2 }")).toEqual({
            kind: "Dict",
            entries: [
                { key: { kind: "Ident", name: "x" }, value: { kind: "Number", value: 1 } },
                { key: { kind: "Ident", name: "y" }, value: { kind: "Number", value: 2 } },
            ],
        });
    });

    it("parses a dict with expression values", () => {
        expect(parseExpr("{ total: a + b }")).toEqual({
            kind: "Dict",
            entries: [{
                key: { kind: "Ident", name: "total" },
                value: {
                    kind: "Binary", op: "+",
                    left:  { kind: "Ident", name: "a" },
                    right: { kind: "Ident", name: "b" },
                },
            }],
        });
    });

    it("parses a nested dict", () => {
        expect(parseExpr("{ inner: { x: 1 } }")).toEqual({
            kind: "Dict",
            entries: [{
                key: { kind: "Ident", name: "inner" },
                value: {
                    kind: "Dict",
                    entries: [{ key: { kind: "Ident", name: "x" }, value: { kind: "Number", value: 1 } }],
                },
            }],
        });
    });

    it("parses a dict with a list value", () => {
        expect(parseExpr("{ items: [1, 2] }")).toEqual({
            kind: "Dict",
            entries: [{
                key: { kind: "Ident", name: "items" },
                value: {
                    kind: "List",
                    elements: [{ kind: "Number", value: 1 }, { kind: "Number", value: 2 }],
                },
            }],
        });
    });

    it("parses a dict as a let value", () => {
        expect(parseStmt(`let p = { x: 1, y: 2 }`)).toEqual({
            kind: "LetStmt",
            name: "p",
            value: {
                kind: "Dict",
                entries: [
                    { key: { kind: "Ident", name: "x" }, value: { kind: "Number", value: 1 } },
                    { key: { kind: "Ident", name: "y" }, value: { kind: "Number", value: 2 } },
                ],
            },
        });
    });

    it("parses member access on a dict literal", () => {
        expect(parseExpr("{ x: 1 }.x")).toEqual({
            kind: "Member",
            object: {
                kind: "Dict",
                entries: [{ key: { kind: "Ident", name: "x" }, value: { kind: "Number", value: 1 } }],
            },
            property: "x",
        });
    });
});

// ─── enum declaration ────────────────────────────────────────────────────────

describe("enum declaration", () => {
    it("parses an enum with auto-numbered members", () => {
        expect(parseStmt("enum Color { Red, Green, Blue }")).toEqual({
            kind: "EnumDecl",
            name: "Color",
            members: [
                { name: "Red",   value: null },
                { name: "Green", value: null },
                { name: "Blue",  value: null },
            ],
        });
    });

    it("parses an enum with explicit values", () => {
        expect(parseStmt("enum State { Delivered: 1, Lost: 2 }")).toEqual({
            kind: "EnumDecl",
            name: "State",
            members: [
                { name: "Delivered", value: { kind: "Number", value: 1 } },
                { name: "Lost",      value: { kind: "Number", value: 2 } },
            ],
        });
    });

    it("parses an enum with a trailing comma", () => {
        const result = parseStmt("enum Color { Red, Green, Blue, }");
        expect(result).toMatchObject({ kind: "EnumDecl", name: "Color" });
        expect((result as any).members).toHaveLength(3);
    });

    it("parses an enum with mixed auto and explicit values", () => {
        expect(parseStmt("enum Mixed { A, B: 10, C }")).toEqual({
            kind: "EnumDecl",
            name: "Mixed",
            members: [
                { name: "A", value: null },
                { name: "B", value: { kind: "Number", value: 10 } },
                { name: "C", value: null },
            ],
        });
    });

    it("parses a multiline enum", () => {
        const src = `enum Color {
    Red,
    Green,
    Blue,
}`;
        const result = parseStmt(src);
        expect(result).toMatchObject({ kind: "EnumDecl", name: "Color" });
        expect((result as any).members).toHaveLength(3);
        expect((result as any).members[0]).toEqual({ name: "Red",   value: null });
        expect((result as any).members[1]).toEqual({ name: "Green", value: null });
        expect((result as any).members[2]).toEqual({ name: "Blue",  value: null });
    });

    it("parses a multiline enum with explicit values", () => {
        const src = `enum State {
    Delivered: 1,
    Lost: 2,
}`;
        const result = parseStmt(src);
        expect(result).toMatchObject({ kind: "EnumDecl", name: "State" });
        expect((result as any).members[0]).toEqual({ name: "Delivered", value: { kind: "Number", value: 1 } });
        expect((result as any).members[1]).toEqual({ name: "Lost",      value: { kind: "Number", value: 2 } });
    });
});

// ─── parse errors ─────────────────────────────────────────────────────────────

describe("parse errors", () => {
    it("throws on an empty input", () => {
        expect(() => parseExpr("")).toThrow("Unexpected token in expression");
    });

    it("throws when ternary is missing its colon", () => {
        expect(() => parseExpr("a ? b")).toThrow("Expected Colon");
    });

    it("throws when a closing paren is missing", () => {
        expect(() => parseExpr("(1 + 2")).toThrow("Expected CloseParen");
    });

    it("throws when a closing bracket is missing", () => {
        expect(() => parseExpr("arr[0")).toThrow("Expected CloseBracket");
    });

    it("throws when func body brace is missing", () => {
        expect(() => parseStmt("func f() ")).toThrow("Expected OpenCurly");
    });
});

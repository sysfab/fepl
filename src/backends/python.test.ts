import { describe, expect, it } from "vitest";
import { createParser, parseProgram } from "../ast/ast";
import { pythonBackend } from "./python";
import { CodegenContext } from "./backend";

const ctx = () => new CodegenContext("    ");

function emitStmt(src: string): string {
    const stmt = createParser(src).parseStmt();
    const codegen = ctx();
    pythonBackend.emitStmt(stmt, codegen);
    return codegen.toString();
}

function gen(src: string): string {
    return pythonBackend.generate(parseProgram(src));
}

describe("Python backend", () => {
    it("emits variable declarations as assignments", () => {
        expect(emitStmt("let count = 10")).toBe("count = 10");
        expect(emitStmt("var total = 42")).toBe("total = 42");
    });

    it("emits function declarations with colon blocks", () => {
        expect(emitStmt("func add(a, b) { return a + b }")).toBe(
            "def add(a, b):\n    return a + b"
        );
    });

    it("emits if/else blocks in python syntax", () => {
        expect(emitStmt("if (ok) { 1 } else { 2 }")).toBe(
            "if ok:\n    1\nelse:\n    2"
        );
    });

    it("emits for-in loops as python for loops", () => {
        expect(emitStmt("for (item in items) { print(item) }")).toBe(
            "for item in items:\n    print(item)"
        );
    });

    it("emits enum declarations as IntEnum classes", () => {
        expect(gen("enum State { Open, Closed }")).toBe(
            "from enum import IntEnum\n\nclass State(IntEnum):\n    Open = 0\n    Closed = 1"
        );
    });

    it("supports python target in preprocessor constant", () => {
        const out = gen("let target = __BACKEND__");
        expect(out).toBe("target = __BACKEND__");
    });
});

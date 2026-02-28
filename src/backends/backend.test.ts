import { describe, expect, it } from "vitest";
import { getBackend, withOutputExtension } from "./backend";
import { backends, resolveBackend } from "./index";

describe("backend registry", () => {
    it("resolves js backend by id", () => {
        const backend = resolveBackend("js");
        expect(backend.id).toBe("js");
        expect(backend.fileExtension).toBe(".js");
    });

    it("resolves python backend by id", () => {
        const backend = resolveBackend("python");
        expect(backend.id).toBe("python");
        expect(backend.fileExtension).toBe(".py");
    });

    it("throws a helpful error for unknown backend", () => {
        expect(() => getBackend(backends, "ruby")).toThrowError(
            "Unknown backend 'ruby'. Available backends: js, python"
        );
    });
});

describe("output path helpers", () => {
    it("replaces an existing extension", () => {
        const backend = resolveBackend("js");
        expect(withOutputExtension("src/main.fepl", backend)).toBe("src/main.js");
    });

    it("appends extension when file has none", () => {
        const backend = resolveBackend("js");
        expect(withOutputExtension("src/main", backend)).toBe("src/main.js");
    });

    it("uses python file extension when python backend selected", () => {
        const backend = resolveBackend("python");
        expect(withOutputExtension("src/main.fepl", backend)).toBe("src/main.py");
    });
});

import { describe, expect, it } from "vitest";
import { getBackend, withOutputExtension } from "./backend";
import { backends, resolveBackend } from "./index";

describe("backend registry", () => {
    it("resolves js backend by id", () => {
        const backend = resolveBackend("js");
        expect(backend.id).toBe("js");
        expect(backend.fileExtension).toBe(".js");
    });

    it("throws a helpful error for unknown backend", () => {
        expect(() => getBackend(backends, "python")).toThrowError(
            "Unknown backend 'python'. Available backends: js"
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
});

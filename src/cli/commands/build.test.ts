import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildCommand } from "./build";

const tempDirs: string[] = [];

async function makeProject(source: string): Promise<string> {
    const cwd = await mkdtemp(path.join(tmpdir(), "fepl-build-"));
    tempDirs.push(cwd);

    await mkdir(path.join(cwd, "src"), { recursive: true });
    await writeFile(
        path.join(cwd, "fepl.json"),
        JSON.stringify({ target: "js", src: "src", dist: "dist" }, null, 2),
        "utf8"
    );
    await writeFile(path.join(cwd, "src", "main.fepl"), source, "utf8");

    return cwd;
}

afterEach(async () => {
    while (tempDirs.length > 0) {
        const dir = tempDirs.pop();
        if (dir) {
            await rm(dir, { recursive: true, force: true });
        }
    }
});

describe("buildCommand std.feph", () => {
    it("resolves $include std.feph from bundled stdlib for js", async () => {
        const cwd = await makeProject("$include std.feph\nlet t = true\nlet f = false\nlet n = none\n");

        await buildCommand(cwd, { target: "js" });

        const output = await readFile(path.join(cwd, "dist", "main.js"), "utf8");
        expect(output).toContain("let t = true;");
        expect(output).toContain("let f = false;");
        expect(output).toContain("let n = null;");
    });

    it("resolves $include std.feph from bundled stdlib for python", async () => {
        const cwd = await makeProject("$include std.feph\nlet t = true\nlet f = false\nlet n = none\n");

        await buildCommand(cwd, { target: "python" });

        const output = await readFile(path.join(cwd, "dist", "main.py"), "utf8");
        expect(output).toContain("t = True");
        expect(output).toContain("f = False");
        expect(output).toContain("n = None");
    });
});

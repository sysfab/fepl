import { readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { Parser } from "../../ast/ast";
import { resolveBackend } from "../../backends";
import { withOutputExtension } from "../../backends/backend";
import { Tokenizer } from "../../lexer/lexer";
import { preprocessTokens } from "../../preprocessor/preprocessor";
import { readConfig } from "../config";
import { ensureDir, pathExists, walkFeplFiles } from "../fs";

export type BuildCommandOptions = {
    target?: string;
};

export async function buildCommand(cwd: string, options: BuildCommandOptions = {}): Promise<void> {
    const config = await readConfig(cwd);
    const target = options.target?.trim() || config.target;
    const backend = resolveBackend(target);

    const srcDir = path.resolve(cwd, config.src);
    const distDir = path.resolve(cwd, config.dist);

    await ensureDir(distDir);

    if (!(await pathExists(srcDir))) {
        throw new Error(`Source directory '${config.src}' not found.`);
    }

    const feplFiles = await walkFeplFiles(srcDir);
    if (feplFiles.length === 0) {
        console.log(`No .fepl files found under '${config.src}'.`);
        return;
    }

    let generatedCount = 0;

    for (const sourcePath of feplFiles) {
        const relativePath = path.relative(srcDir, sourcePath);
        const outRelativePath = withOutputExtension(relativePath, backend);

        const distOutPath = path.join(distDir, outRelativePath);

        const source = await readFile(sourcePath, "utf8");
        const tokens = new Tokenizer(source).tokenize();
        const preprocessed = await preprocessTokens(tokens, {
            baseDir: path.dirname(sourcePath),
            globalConstants: {
                __BACKEND__: JSON.stringify(backend.id),
            },
        });
        const generated = backend.generate(new Parser(preprocessed.tokens).parseProgram());

        await ensureDir(path.dirname(distOutPath));

        await writeFile(distOutPath, `${generated}\n`, "utf8");
        generatedCount++;
    }

    console.log(
        `Built ${generatedCount} file(s) with '${backend.id}' backend (${backend.fileExtension}) into '${config.dist}'.`
    );
}

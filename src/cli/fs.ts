import { mkdir, readdir, stat } from "node:fs/promises";
import * as path from "node:path";

export async function pathExists(filePath: string): Promise<boolean> {
    try {
        await stat(filePath);
        return true;
    } catch {
        return false;
    }
}

export async function ensureDir(dirPath: string): Promise<void> {
    await mkdir(dirPath, { recursive: true });
}

export async function walkFeplFiles(rootDir: string): Promise<string[]> {
    const files: string[] = [];
    const stack = [rootDir];

    while (stack.length > 0) {
        const currentDir = stack.pop()!;
        const entries = await readdir(currentDir, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                stack.push(fullPath);
            } else if (entry.isFile() && entry.name.endsWith(".fepl")) {
                files.push(fullPath);
            }
        }
    }

    return files;
}

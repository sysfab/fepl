import { writeFile } from "node:fs/promises";
import * as path from "node:path";
import { CONFIG_FILE, DEFAULT_CONFIG } from "../config";
import { ensureDir, pathExists } from "../fs";

export async function initCommand(cwd: string): Promise<void> {
    const configPath = path.join(cwd, CONFIG_FILE);
    const configExists = await pathExists(configPath);

    if (!configExists) {
        await writeFile(configPath, `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`, "utf8");
        console.log(`Created ${CONFIG_FILE}`);
    } else {
        console.log(`Kept existing ${CONFIG_FILE}`);
    }

    await ensureDir(path.join(cwd, DEFAULT_CONFIG.src));
    await ensureDir(path.join(cwd, DEFAULT_CONFIG.backend));
    await ensureDir(path.join(cwd, DEFAULT_CONFIG.dist));

    console.log(`Ensured '${DEFAULT_CONFIG.src}/', '${DEFAULT_CONFIG.backend}/', '${DEFAULT_CONFIG.dist}/'`);
}

import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { pathExists } from "./fs";

export type FeplConfig = {
    target: string;
    src: string;
    dist: string;
};

export const CONFIG_FILE = "fepl.json";

export const DEFAULT_CONFIG: FeplConfig = {
    target: "js",
    src: "src",
    dist: "dist",
};

export async function readConfig(cwd: string): Promise<FeplConfig> {
    const configPath = path.join(cwd, CONFIG_FILE);
    if (!(await pathExists(configPath))) {
        throw new Error(`Missing ${CONFIG_FILE}. Run 'fepl init' first.`);
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(await readFile(configPath, "utf8"));
    } catch {
        throw new Error(`Invalid ${CONFIG_FILE}. Ensure it contains valid JSON.`);
    }

    if (!parsed || typeof parsed !== "object") {
        throw new Error(`Invalid ${CONFIG_FILE}. Expected an object.`);
    }

    const cfg = parsed as Partial<FeplConfig>;
    for (const key of ["target", "src", "dist"] as const) {
        if (typeof cfg[key] !== "string" || cfg[key]!.trim() === "") {
            throw new Error(`Invalid ${CONFIG_FILE}. '${key}' must be a non-empty string.`);
        }
    }

    return {
        target: cfg.target!,
        src: cfg.src!,
        dist: cfg.dist!,
    };
}

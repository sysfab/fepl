#!/usr/bin/env node

import { Command } from "commander";
import * as path from "node:path";
import { buildCommand } from "./commands/build";
import { initCommand } from "./commands/init";

const VERSION = "1.0.0";

function createProgram(): Command {
    const program = new Command();

    program
        .name("fepl")
        .description("FEPL CLI")
        .helpOption("-h, --help", "Show help")
        .showHelpAfterError()
        .version(VERSION, "-v, --version", "Show version");

    program
        .command("init")
        .description("Create fepl.json and project folders")
        .option("--cwd <path>", "Project directory", ".")
        .action(async (options: { cwd: string }) => {
            const cwd = path.resolve(process.cwd(), options.cwd);
            await initCommand(cwd);
        });

    program
        .command("build")
        .description("Transpile .fepl files using configured backend")
        .option("--cwd <path>", "Project directory", ".")
        .option("--target <backend>", "Override backend target from fepl.json")
        .action(async (options: { cwd: string; target?: string }) => {
            const cwd = path.resolve(process.cwd(), options.cwd);
            await buildCommand(cwd, { target: options.target });
        });

    return program;
}

async function main(): Promise<void> {
    const program = createProgram();
    await program.parseAsync(process.argv);
}

main().catch((error: unknown) => {
    if (error instanceof Error) {
        console.error(`fepl: ${error.message}`);
    } else {
        console.error("fepl: unknown error");
    }
    process.exitCode = 1;
});

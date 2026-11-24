#!/usr/bin/env node
// `hey ray` → opens ray-cli's full-screen UI in the folder you are in.
// `hey ray <command> …` → any other ray-cli command (chat, talk, stats, runs, sessions…).
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const [name, ...rest] = process.argv.slice(2);

if (name !== "ray") {
  console.error('Say "hey ray" to start ray-cli (or "hey ray --help").');
  process.exit(1);
}

// Always ray's own .env for the API key, never the .env of the project you're in.
const env = { ...process.env, DOTENV_CONFIG_PATH: join(root, ".env") };

const tsx = join(root, "node_modules", ".bin", "tsx");
if (!existsSync(tsx)) {
  console.error(`ray-cli is not installed yet. Run: cd ${root} && pnpm install`);
  process.exit(1);
}

const args = rest.length > 0 ? rest : ["ui"]; // plain "hey ray" = the full-screen UI
// --tsconfig: always ray's own TypeScript settings. Without it, tsx looks for a
// tsconfig.json in the folder you're in, and the full-screen UI (JSX) breaks there.
const tsconfig = join(root, "tsconfig.json");
const child = spawn(tsx, ["--tsconfig", tsconfig, join(root, "src", "index.ts"), ...args], { stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 0));

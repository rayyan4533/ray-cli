import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { execa } from "execa";
import { fmt, truncate } from "../ui/format.js";

export type CheckStatus = "pass" | "fail" | "skip";

export type CheckResult = {
  name: string;
  status: CheckStatus;
  detail?: string;
};

const TIMEOUT_MS = 120_000;

// npm init puts this placeholder in package.json; it is not a real test script.
const NPM_PLACEHOLDER_TEST = /no test specified/;

// Things that should never end up in a file the agent wrote.
const SECRET_PATTERNS: { label: string; pattern: RegExp }[] = [
  { label: "Anthropic API key", pattern: /sk-ant-[A-Za-z0-9_-]{20,}/ },
  { label: "OpenAI API key", pattern: /sk-(proj-)?[A-Za-z0-9]{32,}/ },
  { label: "AWS access key", pattern: /AKIA[0-9A-Z]{16}/ },
  { label: "GitHub token", pattern: /gh[pousr]_[A-Za-z0-9]{36,}/ },
  { label: "private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
];

// First useful line of a command's output, for a one-line reason.
function firstLine(text: string): string {
  const line = text.split("\n").map((l) => l.trim()).find(Boolean) ?? "";
  return truncate(line, 120);
}

function readScripts(cwd: string): Record<string, string> {
  try {
    const pkg = JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"));
    return pkg.scripts ?? {};
  } catch {
    return {};
  }
}

async function runCommand(name: string, file: string, args: string[], cwd: string): Promise<CheckResult> {
  const result = await execa(file, args, { cwd, reject: false, all: true, timeout: TIMEOUT_MS });
  if (result.timedOut) return { name, status: "fail", detail: "timed out" };
  if (result.exitCode === 0) return { name, status: "pass" };
  return { name, status: "fail", detail: firstLine(String(result.all ?? "")) };
}

async function checkTypes(cwd: string): Promise<CheckResult> {
  if (!existsSync(join(cwd, "tsconfig.json"))) return { name: "types", status: "skip" };
  return runCommand("types", "pnpm", ["exec", "tsc", "--noEmit"], cwd);
}

async function checkScript(name: string, cwd: string): Promise<CheckResult> {
  const script = readScripts(cwd)[name];
  if (!script || NPM_PLACEHOLDER_TEST.test(script)) return { name, status: "skip" };
  return runCommand(name, "pnpm", ["run", name], cwd);
}

function checkSecrets(files: string[]): CheckResult {
  for (const file of files) {
    if (/^\.env(\..+)?$/.test(basename(file)) && basename(file) !== ".env.example") {
      return { name: "secrets", status: "fail", detail: `wrote ${basename(file)}` };
    }
    if (!existsSync(file) || statSync(file).size > 1_000_000) continue;
    const text = readFileSync(file, "utf8");
    for (const { label, pattern } of SECRET_PATTERNS) {
      if (pattern.test(text)) return { name: "secrets", status: "fail", detail: `${label} in ${basename(file)}` };
    }
  }
  return { name: "secrets", status: files.length ? "pass" : "skip" };
}

// Files changed in the working tree, for /checks (no agent turn to tell us).
export async function gitChangedFiles(cwd = process.cwd()): Promise<string[]> {
  const result = await execa("git", ["status", "--porcelain"], { cwd, reject: false });
  if (result.exitCode !== 0) return [];
  return String(result.stdout)
    .split("\n")
    .filter(Boolean)
    .map((line) => join(cwd, line.slice(3).replace(/^"|"$/g, "")));
}

// The four free checks. They run one after another so their output never mixes.
export async function runChecks(changedFiles: string[], cwd = process.cwd()): Promise<CheckResult[]> {
  return [
    await checkTypes(cwd),
    await checkScript("test", cwd),
    await checkScript("lint", cwd),
    checkSecrets(changedFiles),
  ];
}

const ICONS: Record<CheckStatus, string> = { pass: "✓", fail: "✗", skip: "–" };

export function formatChecks(results: CheckResult[]): string[] {
  const row = results
    .map((r) => {
      const text = `${ICONS[r.status]} ${r.name}`;
      return r.status === "pass" ? fmt.success(text) : r.status === "fail" ? fmt.error(text) : fmt.dim(text);
    })
    .join("  ");
  const lines = [`Checks: ${row}`];
  for (const r of results) {
    if (r.status === "fail" && r.detail) lines.push(fmt.error(`  ${r.name}: ${r.detail}`));
  }
  return lines;
}

// null when nothing ran (all skipped), otherwise true only if no check failed.
export function allPassed(results: CheckResult[]): boolean | null {
  const ran = results.filter((r) => r.status !== "skip");
  if (ran.length === 0) return null;
  return ran.every((r) => r.status === "pass");
}

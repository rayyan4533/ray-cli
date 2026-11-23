import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export type MemoryScope = "project" | "personal";

export type MemoryItem = { scope: MemoryScope; text: string };

// Project memory lives with the code (you can choose to commit it).
// Personal memory follows you across every project and never goes in git.
export const MEMORY_FILES: Record<MemoryScope, string> = {
  project: join(process.cwd(), "RAY.md"),
  personal: join(homedir(), ".ray-cli", "memory.md"),
};

const HEADERS: Record<MemoryScope, string> = {
  project: "# RAY.md — project memory for ray-cli\n",
  personal: "# ray-cli — personal memory\n",
};

// Each memory is one markdown bullet: "- text". Everything else is ignored.
function readScope(scope: MemoryScope): string[] {
  const file = MEMORY_FILES[scope];
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
}

function writeScope(scope: MemoryScope, items: string[]): void {
  const file = MEMORY_FILES[scope];
  mkdirSync(dirname(file), { recursive: true });
  const body = items.map((text) => `- ${text}`).join("\n");
  writeFileSync(file, `${HEADERS[scope]}\n${body}${body ? "\n" : ""}`);
}

// Project first, then personal. The position in this list is the number /forget uses.
export function listMemory(): MemoryItem[] {
  return [
    ...readScope("project").map((text) => ({ scope: "project" as const, text })),
    ...readScope("personal").map((text) => ({ scope: "personal" as const, text })),
  ];
}

export function addMemory(text: string, scope: MemoryScope): void {
  const clean = text.replace(/\s+/g, " ").trim();
  writeScope(scope, [...readScope(scope), clean]);
}

// Removes memory number n (1-based, as shown by /memory). Returns what was removed.
export function forgetMemory(n: number): MemoryItem | null {
  const item = listMemory()[n - 1];
  if (!item) return null;
  const remaining = readScope(item.scope);
  remaining.splice(remaining.indexOf(item.text), 1);
  writeScope(item.scope, remaining);
  return item;
}

// The text added to the system prompt at session start.
export function buildSystemPrompt(): string {
  const intro =
    "You are ray-cli, a coding assistant running in the user's terminal. " +
    "Be concise. Use the tools to read the project before answering questions about it.";

  const items = listMemory();
  if (items.length === 0) return intro;

  const section = (scope: MemoryScope, title: string) => {
    const lines = items.filter((m) => m.scope === scope).map((m) => `- ${m.text}`);
    return lines.length ? `\n\n${title}:\n${lines.join("\n")}` : "";
  };

  return (
    intro +
    "\n\nThings the user asked you to remember. Follow them unless the user says otherwise." +
    section("project", "About this project") +
    section("personal", "About the user")
  );
}

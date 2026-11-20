import {
  getSessionMessages,
  listSessions,
  renameSession,
  type SDKSessionInfo,
} from "@anthropic-ai/claude-agent-sdk";
import { fmt } from "../ui/format.js";
import { getText } from "./message-handler.js";

const PROJECT_DIR = process.cwd();

export function sessionTitle(session: SDKSessionInfo): string {
  return session.customTitle ?? session.summary;
}

export function timeAgo(ms: number): string {
  const minutes = Math.floor((Date.now() - ms) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export async function listProjectSessions(limit = 10): Promise<SDKSessionInfo[]> {
  return listSessions({ dir: PROJECT_DIR, limit });
}

export async function findSession(idOrPrefix: string): Promise<SDKSessionInfo | null> {
  const all = await listSessions({ dir: PROJECT_DIR });
  const matches = all.filter((s) => s.sessionId.startsWith(idOrPrefix));
  if (matches.length > 1) {
    throw new Error(`"${idOrPrefix}" matches ${matches.length} sessions. Type more characters.`);
  }
  return matches[0] ?? null;
}

export async function renameProjectSession(id: string, title: string): Promise<void> {
  await renameSession(id, title, { dir: PROJECT_DIR });
}

export async function loadHistory(id: string, limit = 20): Promise<string[]> {
  const messages = await getSessionMessages(id, { dir: PROJECT_DIR });
  const lines: string[] = [];
  for (const m of messages.slice(-limit)) {
    const content = (m.message as { content?: unknown } | null)?.content;
    const text = getText(content).trim();
    if (!text) continue; // tool calls and tool results have no plain text
    lines.push(m.type === "user" ? fmt.label(`You: ${text}`) : fmt.assistant(text));
  }
  return lines;
}

export function printSessions(sessions: SDKSessionInfo[]): void {
  if (sessions.length === 0) {
    console.log(fmt.dim("No sessions yet in this folder."));
    return;
  }
  console.log(fmt.label("\nSessions (newest first):"));
  for (const s of sessions) {
    const id = s.sessionId.slice(0, 8);
    const when = timeAgo(s.lastModified).padEnd(9);
    console.log(`  ${fmt.system(id)}  ${fmt.dim(when)}  ${sessionTitle(s)}`);
  }
  console.log(fmt.dim("\nResume with: pnpm dev chat --resume <id>\n"));
}

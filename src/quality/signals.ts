import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

// Tools that change files on disk. Their input has a file path.
const EDIT_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

// Everything we learned about one turn (one prompt → one result).
export type RunSummary = {
  sessionId: string;
  turns: number;
  costUsd: number;
  outcome: string; // "success", "error_max_turns", "error_during_execution", ...
  hitMaxTurns: boolean;
  toolErrors: number;
  denials: number;
  changedFiles: string[];
};

type Block = { type?: string; [key: string]: unknown };

function blocks(content: unknown): Block[] {
  return Array.isArray(content) ? (content as Block[]) : [];
}

// Watches the message stream. Call observe() on every message; when the turn
// ends (a "result" message) it returns the summary and starts fresh.
export class RunTracker {
  private changedFiles = new Set<string>();
  private toolErrors = 0;

  observe(message: SDKMessage): RunSummary | null {
    if (message.type === "assistant") {
      for (const block of blocks(message.message.content)) {
        if (block.type !== "tool_use" || !EDIT_TOOLS.has(String(block.name))) continue;
        const input = (block.input ?? {}) as { file_path?: unknown; notebook_path?: unknown };
        const path = input.file_path ?? input.notebook_path;
        if (typeof path === "string") this.changedFiles.add(path);
      }
    }

    if (message.type === "user") {
      for (const block of blocks(message.message.content)) {
        if (block.type === "tool_result" && block.is_error === true) this.toolErrors++;
      }
    }

    if (message.type !== "result") return null;

    const summary: RunSummary = {
      sessionId: message.session_id,
      turns: message.num_turns,
      costUsd: message.total_cost_usd,
      outcome: message.subtype,
      hitMaxTurns: message.subtype === "error_max_turns",
      toolErrors: this.toolErrors,
      denials: message.permission_denials.length,
      changedFiles: [...this.changedFiles],
    };

    this.changedFiles.clear();
    this.toolErrors = 0;
    return summary;
  }
}

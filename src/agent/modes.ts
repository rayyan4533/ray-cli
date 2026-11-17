import type { Options, PermissionMode } from "@anthropic-ai/claude-agent-sdk";
import { promptBeforeToolUse } from "./permissions.js";

export type CliMode = "agent" | "ask" | "plan";

const READ_TOOLS = ["Read", "Glob", "Grep", "WebSearch", "WebFetch"];
const EDIT_TOOLS = ["Read", "Edit", "Write", "Glob", "Grep"];
const BLOCKED_WRITE_TOOLS = ["Edit", "Write", "Bash"];

const BASE_OPTIONS: Options = {
  maxTurns: 10,
  maxBudgetUsd: 0.5,
};

export function parseCliMode(value: string): CliMode | null {
  if (value === "agent" || value === "ask" || value === "plan") {
    return value;
  }
  return null;
}

export function cliModeToPermissionMode(mode: CliMode): PermissionMode {
  switch (mode) {
    case "agent":
      return "acceptEdits";
    case "ask":
      return "dontAsk";
    case "plan":
      return "plan";
  }
}

export function buildModeOptions(mode: CliMode): Options {
  switch (mode) {
    case "agent":
      return {
        ...BASE_OPTIONS,
        permissionMode: "acceptEdits",
        allowedTools: EDIT_TOOLS,
        canUseTool: promptBeforeToolUse,
      };
    case "ask":
      return {
        ...BASE_OPTIONS,
        permissionMode: "dontAsk",
        allowedTools: READ_TOOLS,
        disallowedTools: BLOCKED_WRITE_TOOLS,
      };
    case "plan":
      return {
        ...BASE_OPTIONS,
        permissionMode: "plan",
        allowedTools: READ_TOOLS,
        disallowedTools: BLOCKED_WRITE_TOOLS,
      };
  }
}
import type { Options, PermissionMode } from "@anthropic-ai/claude-agent-sdk";
import { createPermissionHandler } from "./permissions.js";

export type CliMode = "agent" | "ask" | "plan";

const READ_TOOLS = ["Read", "Glob", "Grep", "WebSearch", "WebFetch"];

const MODEL = "claude-haiku-5-5";

const BASE_OPTIONS: Options = {
  model: MODEL,
  maxTurns: 10,
  maxBudgetUsd: 0.5,
  allowedTools: READ_TOOLS,
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

export function buildModeOptions(
  mode: CliMode,
  getMode: () => CliMode = () => mode
): Options {
  return {
    ...BASE_OPTIONS,
    permissionMode: cliModeToPermissionMode(mode),
    canUseTool: createPermissionHandler(getMode),
  };
}
import type { Options, PermissionMode } from "@anthropic-ai/claude-agent-sdk";
import { createPermissionHandler, type AskApproval } from "./permissions.js";
import { DEFAULT_MODEL, type ModelId } from "../config/models.js";
import { buildSystemPrompt } from "./memory.js";

export type CliMode = "agent" | "ask" | "plan";

const READ_TOOLS = ["Read", "Glob", "Grep", "WebSearch", "WebFetch"];

const BASE_OPTIONS: Options = {
  maxTurns: 10,
  maxBudgetUsd: 0.5,
  allowedTools: READ_TOOLS,
};

export type ModeSettings = {
  mode: CliMode;
  model?: ModelId;
  getMode?: () => CliMode;
  resume?: string;
  continueLast?: boolean;
  ask?: AskApproval;
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

export function buildModeOptions({
  mode,
  model = DEFAULT_MODEL,
  getMode = () => mode,
  resume,
  continueLast = false,
  ask,
}: ModeSettings): Options {
  return {
    ...BASE_OPTIONS,
    systemPrompt: buildSystemPrompt(),
    model,
    permissionMode: cliModeToPermissionMode(mode),
    canUseTool: createPermissionHandler(getMode, ask),
    resume,
    continue: continueLast,
  };
}
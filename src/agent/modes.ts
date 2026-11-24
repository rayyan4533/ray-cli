import type { Options, PermissionMode } from "@anthropic-ai/claude-agent-sdk";
import { createPermissionHandler, type ApprovalLevel, type AskApproval } from "./permissions.js";
import { DEFAULT_MODEL, type ModelId } from "../config/models.js";
import { buildSystemPrompt } from "./memory.js";
import { confirm } from "@inquirer/prompts";
import { stopSpinner } from "../ui/spinner.js";
import { SANDBOX, createGuardrailHook, type AskYesNo } from "./guardrails.js";
import { saveGuardrailEvent } from "../quality/db.js";

export type CliMode = "agent" | "ask" | "plan";

const READ_TOOLS = ["Read", "Glob", "Grep", "WebSearch", "WebFetch"];

export const MAX_TURNS = 10;

// Safety brake for a whole chat session (it must be above the $1.00 per-task cap).
const BASE_OPTIONS: Options = {
  maxTurns: MAX_TURNS,
  maxBudgetUsd: 2,
  allowedTools: READ_TOOLS,
};

export type ModeSettings = {
  mode: CliMode;
  model?: ModelId;
  getMode?: () => CliMode;
  resume?: string;
  continueLast?: boolean;
  ask?: AskApproval;
  getApprovals?: () => ApprovalLevel;
  askYesNo?: AskYesNo; // for guardrail questions
};

// In plain chat and talk, guardrail questions use a terminal prompt.
const askInTerminal: AskYesNo = (question) => {
  stopSpinner();
  return confirm({ message: question, default: false });
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
  getApprovals,
  askYesNo = askInTerminal,
}: ModeSettings): Options {
  return {
    ...BASE_OPTIONS,
    systemPrompt: buildSystemPrompt(),
    model,
    permissionMode: cliModeToPermissionMode(mode),
    canUseTool: createPermissionHandler(getMode, ask, getApprovals),
    resume,
    continue: continueLast,
    // Guardrails: hard rules checked before EVERY tool, in every mode (Chapter 16).
    hooks: {
      PreToolUse: [
        {
          hooks: [
            createGuardrailHook(process.cwd(), askYesNo, (event) => {
              try {
                saveGuardrailEvent(process.cwd(), event);
              } catch {
                // logging must never break a tool call
              }
            }),
          ],
        },
      ],
    },
    // Only ray's own setup: none of your personal ~/.claude settings, plugins or memory.
    settingSources: [],
    // The OS sandbox: commands can only write inside the project and reach package registries.
    sandbox: SANDBOX,
  };
}
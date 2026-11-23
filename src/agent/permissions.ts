import { confirm } from "@inquirer/prompts";
import type { CanUseTool } from "@anthropic-ai/claude-agent-sdk";
import type { CliMode } from "./modes.js";
import { stopSpinner } from "../ui/spinner.js";
import { truncate } from "../ui/format.js";

export type AskApproval = (toolName: string, preview: string) => Promise<boolean>;

// How much the agent may do without asking you (in agent mode).
//   manual: ask before every edit and every command
//   edits:  file edits happen automatically, commands still ask (the normal setting)
//   all:    nothing asks: ray does the task end to end
export type ApprovalLevel = "manual" | "edits" | "all";

const EDIT_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

export const APPROVAL_CHOICES: { level: ApprovalLevel; label: string }[] = [
  { level: "manual", label: "Approve every step manually (edits and commands)" },
  { level: "edits", label: "Auto mode: edits automatically, commands ask me" },
  { level: "all", label: "Let ray do it end to end (nothing asks)" },
];

const askInTerminal: AskApproval = async (toolName, preview) => {
  stopSpinner();
  return confirm({ message: `Allow tool "${toolName}"?\n${preview}`, default: false });
};

// Tools the agent may try that ray-cli has no screen for. Refused with a hint instead.
const ALWAYS_REFUSED: Record<string, string> = {
  AskUserQuestion: "ray-cli cannot show question forms. Ask your question in your reply instead.",
  ExitPlanMode: "Do not call ExitPlanMode. Reply with the plan as plain text; ray-cli asks the user to approve it.",
};

export function createPermissionHandler(
  getMode: () => CliMode,
  ask: AskApproval = askInTerminal,
  getApprovals: () => ApprovalLevel = () => "edits"
): CanUseTool {
  return async (toolName, input) => {
    const refusal = ALWAYS_REFUSED[toolName];
    if (refusal) return { behavior: "deny", message: refusal };

    const mode = getMode();
    if (mode !== "agent") {
      return { behavior: "deny", message: `Not allowed in ${mode} mode` };
    }

    const level = getApprovals();
    if (level === "all" || (level === "edits" && EDIT_TOOLS.has(toolName))) {
      return { behavior: "allow", updatedInput: input };
    }

    const preview = truncate(JSON.stringify(input, null, 2), 300);
    if (await ask(toolName, preview)) {
      return { behavior: "allow", updatedInput: input };
    }
    return { behavior: "deny", message: "User denied tool use" };
  };
}

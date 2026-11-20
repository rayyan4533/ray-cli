import { confirm } from "@inquirer/prompts";
import type { CanUseTool } from "@anthropic-ai/claude-agent-sdk";
import type { CliMode } from "./modes.js";
import { stopSpinner } from "../ui/spinner.js";
import { truncate } from "../ui/format.js";

export type AskApproval = (toolName: string, preview: string) => Promise<boolean>;

const askInTerminal: AskApproval = async (toolName, preview) => {
  stopSpinner();
  return confirm({ message: `Allow tool "${toolName}"?\n${preview}`, default: false });
};

export function createPermissionHandler(
  getMode: () => CliMode,
  ask: AskApproval = askInTerminal
): CanUseTool {
  return async (toolName, input) => {
    const mode = getMode();
    if (mode !== "agent") {
      return { behavior: "deny", message: `Not allowed in ${mode} mode` };
    }

    const preview = truncate(JSON.stringify(input, null, 2), 300);
    if (await ask(toolName, preview)) {
      return { behavior: "allow", updatedInput: input };
    }
    return { behavior: "deny", message: "User denied tool use" };
  };
}

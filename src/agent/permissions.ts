import { confirm } from "@inquirer/prompts";
import type { CanUseTool } from "@anthropic-ai/claude-agent-sdk";
import type { CliMode } from "./modes.js";
import { stopSpinner } from "../ui/spinner.js";
import { truncate } from "../ui/format.js";

export function createPermissionHandler(getMode: () => CliMode): CanUseTool {
  return async (toolName, input) => {
    const mode = getMode();
    if (mode !== "agent") {
      return { behavior: "deny", message: `Not allowed in ${mode} mode` };
    }

    stopSpinner();
    const preview = truncate(JSON.stringify(input, null, 2), 300);
    const approved = await confirm({
      message: `Allow tool "${toolName}"?\n${preview}`,
      default: false,
    });

    if (approved) {
      return { behavior: "allow", updatedInput: input };
    }
    return { behavior: "deny", message: "User denied tool use" };
  };
}
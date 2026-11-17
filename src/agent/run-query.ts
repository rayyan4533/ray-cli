import { query } from "@anthropic-ai/claude-agent-sdk";
import { fmt } from "../ui/format.js";
import { handleMessage } from "./message-handler.js";
import { startSpinner, stopSpinner } from "../ui/spinner.js";
import { buildModeOptions, type CliMode } from "./modes.js";

export type RunQueryOptions = {
  mode?: CliMode;
  verbose?: boolean;
};

export async function runQuery(
  prompt: string,
  options: RunQueryOptions = {}
): Promise<void> {
  const { verbose = false, mode = "agent" } = options;

    try {
    startSpinner("Agent working…");
       for await (const message of query({
      prompt,
      options: buildModeOptions(mode),
    })) {
      handleMessage(message, { verbose });
      if (message.type !== "result") startSpinner("Agent working…");
    }
  } catch (error) {
    stopSpinner();
    console.error(
      fmt.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    );
  }
}
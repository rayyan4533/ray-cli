import { query } from "@anthropic-ai/claude-agent-sdk";
import { fmt } from "../ui/format.js";
import { handleMessage } from "./message-handler.js";
import { startSpinner, stopSpinner } from "../ui/spinner.js";
export type RunQueryOptions = {
  verbose?: boolean;
};

export async function runQuery(
  prompt: string,
  options: RunQueryOptions = {}
): Promise<void> {
  const { verbose = false } = options;

    try {
    startSpinner("Agent working…");
    for await (const message of query({
      prompt,
      options: {
        maxTurns: 5,
        maxBudgetUsd: 0.5,
        allowedTools: ["Read", "Glob", "Grep"],
      },
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
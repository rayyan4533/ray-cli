import { query } from "@anthropic-ai/claude-agent-sdk";
import { fmt } from "../ui/format.js";

export type RunQueryOptions = {
  verbose?: boolean;
};

export async function runQuery(
  prompt: string,
  options: RunQueryOptions = {}
): Promise<void> {
  const { verbose = false } = options;

  try {
    for await (const message of query({
      prompt,
      options: {
        maxTurns: 5,
        maxBudgetUsd: 1.0,
        allowedTools: ["Read", "Glob", "Grep"],
      },
    })) {
      if (verbose) {
        console.log(fmt.dim(JSON.stringify(message, null, 2)));
      } else {
        console.log(fmt.system(`[${message.type}]`));
      }
    }
  } catch (error) {
    console.error(
      fmt.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    );
  }
}
import { query } from "@anthropic-ai/claude-agent-sdk";
import { fmt } from "../ui/format.js";
import { handleMessage } from "./message-handler.js";
import { startSpinner, stopSpinner } from "../ui/spinner.js";
import { buildModeOptions, type CliMode } from "./modes.js";
import { DEFAULT_MODEL, type ModelId } from "../config/models.js";
import { RunTracker } from "../quality/signals.js";
import { finishRun } from "../quality/report.js";

export type RunQueryOptions = {
  mode?: CliMode;
  model?: ModelId;
  verbose?: boolean;
};

export async function runQuery(
  prompt: string,
  options: RunQueryOptions = {}
): Promise<void> {
  const { verbose = false, mode = "agent", model = DEFAULT_MODEL } = options;

  const tracker = new RunTracker();

  try {
    startSpinner("Agent working…");
    for await (const message of query({
      prompt,
      options: buildModeOptions({ mode, model }),
    })) {
      handleMessage(message, { verbose, model });
      const summary = tracker.observe(message);
      if (summary) await finishRun(summary, { mode, model }, console.log);
      if (message.type !== "result") startSpinner("Agent working…");
    }
  } catch (error) {
    stopSpinner();
    console.error(
      fmt.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    );
  }
}

import { query } from "@anthropic-ai/claude-agent-sdk";
import { fmt } from "../ui/format.js";
import { handleMessage } from "./message-handler.js";
import { startSpinner, stopSpinner } from "../ui/spinner.js";
import { MAX_TURNS, buildModeOptions, type CliMode } from "./modes.js";
import { DEFAULT_CHOICE, OPTIMIZED, type ModelChoice, type ModelId } from "../config/models.js";
import { BUILDER, escalationReason, nextStep } from "./routing.js";
import { RunTracker } from "../quality/signals.js";
import { finishRun } from "../quality/report.js";

export type RunQueryOptions = {
  mode?: CliMode;
  model?: ModelChoice;
  verbose?: boolean;
};

// One-shot `talk`. A one-shot query can't switch models mid-way, so escalation
// starts a new query that resumes the same session with a stronger model.
export async function runQuery(prompt: string, options: RunQueryOptions = {}): Promise<void> {
  const { verbose = false, mode = "agent", model: choice = DEFAULT_CHOICE } = options;

  // One tracker for every attempt: a resumed session reports a running cost total.
  const tracker = new RunTracker();
  let model: ModelId = choice === OPTIMIZED ? BUILDER : choice;
  let resume: string | undefined;
  let escalations = 0;
  let spent = 0;

  try {
    while (true) {
      let next: { model: ModelId; prompt: string } | null = null;

      startSpinner("Agent working…");
      for await (const message of query({ prompt, options: buildModeOptions({ mode, model, resume }) })) {
        handleMessage(message, { verbose, model });
        const summary = tracker.observe(message);
        if (summary) {
          const checks = await finishRun(summary, { mode, model }, console.log);
          spent += summary.costUsd;
          resume = summary.sessionId;

          const reason = choice === OPTIMIZED ? escalationReason(summary, checks, MAX_TURNS) : null;
          if (reason) {
            const step = nextStep(model, reason, checks, escalations, spent);
            console.log(step.line);
            if (step.kind === "escalate") next = { model: step.model, prompt: step.prompt };
          } else if (escalations > 0) {
            console.log(fmt.success(`✓ Fixed after ${escalations} escalation(s) · task cost $${spent.toFixed(2)}`));
          }
        }
        if (message.type !== "result") startSpinner("Agent working…");
      }

      if (!next) break;
      escalations++;
      model = next.model;
      prompt = next.prompt;
    }
  } catch (error) {
    stopSpinner();
    console.error(fmt.error(`Error: ${error instanceof Error ? error.message : String(error)}`));
  }
}

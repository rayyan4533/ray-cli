import type { ModelId } from "../config/models.js";
import type { CheckResult } from "../quality/checks.js";
import type { RunSummary } from "../quality/signals.js";
import { fmt } from "../ui/format.js";

// Who does what in "optimized" mode.
export const BUILDER: ModelId = "claude-haiku-5-5"; // writes the code first
export const PLANNER: ModelId = "claude-opus-5-5"; // default for /plan
export const LADDER: ModelId[] = ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"];

// The rules you chose.
export const SOFT_CUTOFF = 2; // soft points needed to escalate
export const MAX_ESCALATIONS = 2; // haiku -> sonnet -> opus, then stop
export const TASK_COST_CAP = 1.0; // dollars per task, all attempts together
const BUSY_TURNS_SHARE = 0.8; // using 80%+ of the turn limit is a soft sign

// Why the last attempt should be redone by a stronger model, or null if it was fine.
export function escalationReason(summary: RunSummary, checks: CheckResult[], maxTurns: number): string | null {
  // Out of money: a stronger (pricier) model can't help.
  if (summary.outcome === "error_max_budget_usd") return null;

  // Hard triggers: any one of these is enough.
  const failed = checks.filter((c) => c.status === "fail").map((c) => c.name);
  if (failed.length) return `checks failed: ${failed.join(", ")}`;
  if (summary.hitMaxTurns) return "hit the turn limit";
  if (summary.outcome !== "success") return `ended with ${summary.outcome}`;

  // Nothing changed and nothing failed: it was a question, nothing to fix.
  if (summary.changedFiles.length === 0) return null;

  // Soft signs: one point each, escalate at SOFT_CUTOFF.
  const points =
    summary.toolErrors +
    (summary.denials > 0 ? 1 : 0) +
    (summary.turns >= Math.ceil(maxTurns * BUSY_TURNS_SHARE) ? 1 : 0);
  return points >= SOFT_CUTOFF ? `warning signs (${points} points)` : null;
}

export type EscalationStep =
  | { kind: "escalate"; model: ModelId; line: string; prompt: string }
  | { kind: "stop"; line: string };

// Given why it failed, decide the next model, or stop and explain why.
export function nextStep(
  current: ModelId,
  reason: string,
  checks: CheckResult[],
  escalations: number,
  spent: number
): EscalationStep {
  const next = LADDER[LADDER.indexOf(current) + 1];
  const money = `spent $${spent.toFixed(2)} of $${TASK_COST_CAP.toFixed(2)}`;

  if (!next || escalations >= MAX_ESCALATIONS) {
    return { kind: "stop", line: fmt.error(`✗ Still not right (${reason}) and no stronger model is left · ${money}. Over to you.`) };
  }
  if (spent >= TASK_COST_CAP) {
    return { kind: "stop", line: fmt.error(`✗ Not escalating (${reason}): task cost cap reached · ${money}.`) };
  }

  const details = checks
    .filter((c) => c.status === "fail")
    .map((c) => `- ${c.name}: ${c.detail ?? "failed"}`)
    .join("\n");

  return {
    kind: "escalate",
    model: next,
    line: fmt.tool(`↑ Escalating to ${next} (${reason}) · ${money}`),
    prompt:
      `The previous attempt at this task was not good enough (${reason}).\n` +
      (details ? `Failing checks:\n${details}\n` : "") +
      "Look at what was changed, fix the problems, and make sure the code compiles. " +
      "Keep the changes as small as possible.",
  };
}

// "/plan sonnet add a stats command" -> { planner: sonnet, task: "add a stats command" }
export function parsePlanCommand(
  line: string,
  find: (word: string) => ModelId | null
): { planner: ModelId; task: string } | { error: string } {
  const words = line.trim().split(/\s+/).slice(1); // drop "/plan"
  const named = words[0] ? find(words[0]) : null;
  const planner = named ?? PLANNER;
  const task = (named ? words.slice(1) : words).join(" ").trim();
  if (!task) return { error: "Usage: /plan [model] <task>   e.g. /plan add a stats command" };
  return { planner, task };
}

export function planPrompt(task: string): string {
  return (
    "Make a short, numbered, step-by-step plan for this task. Read only the files you need " +
    "(at most a few). Do not change, create or run anything, do not write a plan file, and do not " +
    "call ExitPlanMode or AskUserQuestion. Reply with the plan as plain text and name the files you " +
    "will touch. If something is unclear, say so in the plan.\n\n" +
    `Task: ${task}`
  );
}

export const BUILD_PROMPT = "The plan above is approved. Implement it now, step by step.";

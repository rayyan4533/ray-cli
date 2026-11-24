import { query } from "@anthropic-ai/claude-agent-sdk";
import { badRuns, type BadRun } from "./db.js";
import { listMemory } from "../agent/memory.js";

// Which model reads your 👎 runs and suggests rules. Sonnet: good at spotting
// patterns, much cheaper than Opus. One turn, no tools, so it costs a few cents.
const IMPROVE_MODEL = "claude-sonnet-5-5";

function describe(run: BadRun, i: number): string {
  let failed = "";
  try {
    const checks = JSON.parse(run.checks ?? "[]") as { name: string; status: string; detail?: string }[];
    failed = checks.filter((c) => c.status === "fail").map((c) => `${c.name}: ${c.detail ?? "failed"}`).join("; ");
  } catch {
    // old or empty check data: leave it out
  }
  return [
    `${i + 1}. task: ${run.task ?? "(not recorded)"}`,
    `   model: ${run.model}${run.attempt ? ` (escalation ${run.attempt})` : ""}`,
    `   why it was bad: ${run.note ?? run.reason ?? "no reason given"}`,
    failed ? `   failing checks: ${failed}` : "   checks: passed or not run",
  ].join("\n");
}

// Ask Claude what rules would have prevented these failures. Nothing is saved
// here: the caller shows each rule and you approve it first.
export async function suggestRules(): Promise<{ rules: string[]; costUsd: number; looked: number }> {
  const runs = badRuns(30);
  if (runs.length === 0) return { rules: [], costUsd: 0, looked: 0 };

  const existing = listMemory()
    .map((m) => `- ${m.text}`)
    .join("\n");

  const prompt =
    "Below are coding-agent runs the user rated as bad, with their own reasons.\n" +
    "Suggest at most 5 short, concrete rules for the agent's project memory that would have prevented " +
    "these failures. Only suggest a rule if it is supported by at least one run. Do not repeat a rule " +
    "that already exists. Reply with one rule per line, each starting with '- ', and nothing else. " +
    "If no rule is justified, reply with exactly: NONE\n\n" +
    `Existing rules:\n${existing || "(none)"}\n\nBad runs:\n${runs.map(describe).join("\n\n")}`;

  let text = "";
  let costUsd = 0;
  for await (const message of query({
    prompt,
    options: {
      model: IMPROVE_MODEL,
      maxTurns: 1,
      allowedTools: [],
      canUseTool: async () => ({ behavior: "deny", message: "No tools needed: just reply with rules." }),
      systemPrompt: "You review failed coding-agent runs and write short project rules. Reply only with the rules.",
      persistSession: false,
      settingSources: [],
    },
  })) {
    if (message.type === "result") {
      costUsd = message.total_cost_usd;
      if (message.subtype === "success") text = message.result;
    }
  }

  const rules = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter(Boolean)
    .slice(0, 5);
  return { rules, costUsd, looked: runs.length };
}

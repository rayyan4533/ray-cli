import { allPassed, formatChecks, runChecks, type CheckResult } from "./checks.js";
import { recentRuns, saveRun, type RunRow } from "./db.js";
import type { RunSummary } from "./signals.js";
import { fmt } from "../ui/format.js";

type Print = (line: string) => void;

export type RunContext = { mode: string; model: string };

// Warning signs from the run itself, as one line (or nothing if all is well).
function signalsLine(summary: RunSummary): string | null {
  const warnings: string[] = [];
  if (summary.hitMaxTurns) warnings.push("hit the turn limit");
  if (summary.toolErrors) warnings.push(`${summary.toolErrors} tool error${summary.toolErrors > 1 ? "s" : ""}`);
  if (summary.denials) warnings.push(`${summary.denials} denied`);
  return warnings.length ? fmt.tool(`⚠ ${warnings.join(" · ")}`) : null;
}

// After every turn: run checks if files changed, print what we found, log it.
// Never throws: a broken check or log must not break the chat.
export async function finishRun(summary: RunSummary, context: RunContext, print: Print): Promise<CheckResult[]> {
  let checks: CheckResult[] = [];
  try {
    if (summary.changedFiles.length > 0) {
      print(fmt.dim(`Running checks on ${summary.changedFiles.length} changed file(s)…`));
      checks = await runChecks(summary.changedFiles);
      for (const line of formatChecks(checks)) print(line);
    }
  } catch (error) {
    print(fmt.error(`Checks failed to run: ${error instanceof Error ? error.message : String(error)}`));
  }

  const signals = signalsLine(summary);
  if (signals) print(signals);

  try {
    saveRun({
      project: process.cwd(),
      sessionId: summary.sessionId,
      model: context.model,
      mode: context.mode,
      turns: summary.turns,
      costUsd: summary.costUsd,
      outcome: summary.outcome,
      hitMaxTurns: summary.hitMaxTurns,
      toolErrors: summary.toolErrors,
      denials: summary.denials,
      filesChanged: summary.changedFiles.length,
      checks,
      checksPassed: allPassed(checks),
    });
  } catch (error) {
    print(fmt.dim(`(run not logged: ${error instanceof Error ? error.message : String(error)})`));
  }
  return checks;
}

const CHECK_ICON = (passed: number | null) => (passed === null ? fmt.dim("–") : passed ? fmt.success("✓") : fmt.error("✗"));

export function printRuns(rows: RunRow[], showProject: boolean): void {
  if (rows.length === 0) {
    console.log(fmt.dim("No runs logged yet."));
    return;
  }
  console.log(fmt.label("\nRecent runs (newest first):"));
  for (const r of rows) {
    const when = r.created_at.slice(5, 16); // "11-23 10:42" (UTC)
    const project = showProject ? `${r.project.padEnd(14).slice(0, 14)} ` : "";
    const model = r.model.replace(/^claude-/, "").padEnd(10);
    const flags = [
      r.outcome !== "success" ? fmt.error(r.outcome) : "",
      r.tool_errors ? fmt.tool(`${r.tool_errors} err`) : "",
      r.denials ? fmt.tool(`${r.denials} denied`) : "",
    ]
      .filter(Boolean)
      .join(" ");
    console.log(
      `  ${fmt.dim(when)}  ${project}${model} ${r.mode.padEnd(5)} ${String(r.turns).padStart(2)} turns  ` +
        `$${r.cost_usd.toFixed(4)}  files ${r.files_changed}  checks ${CHECK_ICON(r.checks_passed)}  ${flags}`
    );
  }
  console.log();
}

export function showRuns(limit: number, allProjects: boolean): void {
  printRuns(recentRuns(limit, allProjects), allProjects);
}

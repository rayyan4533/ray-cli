import { reasonCounts, statsByModel, statsBySkill, type ModelStats, type ReasonCount } from "./db.js";
import { readScripts } from "./checks.js";
import { fmt } from "../ui/format.js";

const pct = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : "–");

// Simple rules that turn the numbers into "try this" suggestions.
function hints(models: ModelStats[], reasons: ReasonCount[], allProjects: boolean): string[] {
  const out: string[] = [];
  const count = (reason: string) => reasons.find((r) => r.score === "bad" && r.reason === reason);

  const wrong = count("wrong result");
  if (wrong && wrong.checks_ok >= 3) {
    const hasTests = !allProjects && Boolean(readScripts(process.cwd()).test);
    out.push(
      `${wrong.checks_ok} runs were "wrong result" but passed every check — the checks are too weak here.` +
        (hasTests ? " Add tests for the cases that broke." : " This project has no test script: add tests.")
    );
  }

  const ignored = count("ignored my instructions");
  if (ignored && ignored.count >= 3) {
    out.push(`${ignored.count} runs "ignored my instructions" — run /improve to turn them into RAY.md rules.`);
  }

  for (const m of models) {
    const rated = m.good + m.bad;
    if (rated >= 5 && m.bad / rated >= 0.5) {
      out.push(`${m.model} was 👎 on ${pct(m.bad, rated)} of rated runs — try a stronger model to start with.`);
    }
  }

  const expensive = count("too expensive");
  if (expensive && expensive.count >= 3) {
    out.push(`${expensive.count} runs were "too expensive" — use /plan haiku for small tasks, or a cheaper model.`);
  }

  const totalRated = models.reduce((sum, m) => sum + m.good + m.bad, 0);
  if (totalRated < 10) out.push(`Only ${totalRated} rated run(s) so far — rate more (🙂 or /rate) for better hints.`);

  return out.map((h) => fmt.tool(`💡 ${h}`));
}

// The /stats report: one table per model, top reasons, then hints.
export function statsReport(allProjects = false, days = 30): string[] {
  const models = statsByModel(allProjects, days);
  const reasons = reasonCounts(allProjects, days);
  const where = allProjects ? "all projects" : "this project";

  const lines = [fmt.label(`\nray stats · ${where} · last ${days} days`)];
  if (models.length === 0) return [...lines, fmt.dim("No runs logged yet."), ""];

  lines.push(fmt.dim("  model               runs  checks ✓  avg cost   total  called in  👍 / 👎"));
  for (const m of models) {
    lines.push(
      `  ${m.model.padEnd(18)} ${String(m.runs).padStart(5)}  ${pct(m.passed, m.checked).padStart(8)}  ` +
        `${`$${m.avg_cost.toFixed(3)}`.padStart(8)}  ${`$${m.total_cost.toFixed(2)}`.padStart(6)}  ` +
        `${String(m.called_in || "–").padStart(9)}  ${m.good} / ${m.bad}`
    );
  }

  const skills = statsBySkill(allProjects, days);
  if (skills.some((s) => s.skill !== "none")) {
    lines.push(fmt.dim("\n  skill               runs  checks ✓  👍 / 👎"));
    for (const s of skills) {
      lines.push(
        `  ${s.skill.padEnd(18)} ${String(s.runs).padStart(5)}  ${pct(s.passed, s.checked).padStart(8)}  ${s.good} / ${s.bad}`
      );
    }
  }

  const bad = reasons.filter((r) => r.score === "bad");
  if (bad.length) {
    lines.push(fmt.dim(`  top 👎 reasons: ${bad.slice(0, 4).map((r) => `${r.reason} (${r.count})`).join(" · ")}`));
  }
  lines.push(...hints(models, reasons, allProjects), "");
  return lines;
}

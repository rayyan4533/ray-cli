import { saveRating, type Score } from "./db.js";
import { getLastRunId } from "./report.js";
import { fmt } from "../ui/format.js";

// The fixed reasons. "Other" lets you type your own; skipping saves no reason.
export const REASONS: Record<Score, string[]> = {
  good: ["correct first try", "fast", "clear explanation"],
  bad: ["wrong result", "broke something", "ignored my instructions", "too slow", "too expensive"],
};

export const OTHER = "other";

// Save a rating for the last run. Returns the line to show the user.
export function rateLastRun(score: Score, reason: string | null, note: string | null): string {
  const runId = getLastRunId();
  if (runId === null) return fmt.error("Nothing to rate yet: run a task first.");
  saveRating(runId, score, reason, note);
  const why = note ? ` · "${note}"` : reason ? ` · ${reason}` : "";
  return fmt.success(`${score === "good" ? "👍" : "👎"} Thanks, rated${why}`);
}

// "/rate bad"  "/rate good fast"  "/rate bad 1"  "/rate bad it used npm"
export function parseRate(args: string[]): { score: Score; reason: string | null; note: string | null } | null {
  const [first, ...rest] = args;
  const score = first === "good" || first === "bad" ? first : null;
  if (!score) return null;

  const text = rest.join(" ").trim();
  if (!text) return { score, reason: null, note: null };

  const list = REASONS[score];
  const byNumber = list[Number(text) - 1];
  if (byNumber) return { score, reason: byNumber, note: null };
  const byName = list.find((r) => r === text.toLowerCase());
  if (byName) return { score, reason: byName, note: null };
  return { score, reason: OTHER, note: text.replace(/^other:?\s*/i, "") };
}

export function rateUsage(): string[] {
  return [
    fmt.error("Usage: /rate good|bad [reason number, reason, or your own words]"),
    fmt.dim(`  good: ${REASONS.good.map((r, i) => `${i + 1} ${r}`).join(" · ")}`),
    fmt.dim(`  bad:  ${REASONS.bad.map((r, i) => `${i + 1} ${r}`).join(" · ")}`),
  ];
}

# Chapter 14 — Ratings, /stats and /improve

## Why
Checks only see what a program can test (compiles? tests pass? leaked keys?).
They can't see "it built the wrong thing". Your 👍/👎 fills that gap, `/stats`
shows where checks and your opinion disagree, and `/improve` turns repeated
complaints into rules the agent reads.

## How the agent "learns" (important)
The model itself never changes — its trained weights are fixed. It changes
behaviour only through what it reads at session start: `buildSystemPrompt()`
puts every `RAY.md` line on the desk.

```
your 👎 + reason ──► ray.db (ratings)       ← the agent never reads this
                         │
                     /improve  (Sonnet suggests rules, you approve each)
                         │
                      RAY.md  ──► system prompt of every new session ──► fewer repeats
```
Three levers: rules in `RAY.md` (what it knows), checks/tests (what ray can
catch), routing settings (which model starts, how fast it escalates).
Automatic "lessons learned" and automatic routing were discussed and left out:
you stay in control of what the agent is told.

## db.ts — a second table + a migration
- `ratings(run_id → runs.id, score CHECK good|bad, reason, note)`: new table,
  so `CREATE TABLE IF NOT EXISTS` is enough.
- New columns in `runs`: `task` (first 200 chars of what you asked) and
  `attempt` (0 first try, 1–2 escalations). The table already exists, so
  `IF NOT EXISTS` would skip it → **migration**: `PRAGMA table_info(runs)`,
  then `ALTER TABLE runs ADD COLUMN …` only for what's missing. Old rows stay;
  safe to run on every start.
- `saveRun` returns `lastInsertRowid` → `report.ts` remembers the last run → 🙂 rates it.
- `/stats` SQL: `LEFT JOIN ratings` (keep unrated runs), `CASE WHEN … THEN 1
  ELSE 0 END` + `SUM` to count, `GROUP BY model`.

## stats.ts — numbers → advice
Table per model: runs, checks ✓ (of runs where checks ran), avg/total cost,
"called in" (escalations), 👍/👎, top 👎 reasons. 💡 hints are plain if-rules
with minimum evidence (3, 5, 10) so they don't over-react:
"wrong result" that **passed** checks → add tests · repeated "ignored my
instructions" → /improve · model 👎 ≥ 50% of ≥ 5 rated → start stronger ·
"too expensive" → /plan haiku · < 10 rated → rate more. Hints only advise.

## Rating — a small state machine
`score → reason → (other: type) → save`, Esc cancels or goes back. Each step
listens only for its own keys; the bottom area resizes to fit the list.
Reasons — good: correct first try / fast / clear explanation; bad: wrong
result / broke something / ignored my instructions / too slow / too expensive;
plus **o** other (your words) and **s** skip. Chat: `/rate bad 1`,
`/rate bad it used npm`.

## improve.ts
Newest 30 👎 runs (task, model, your reason, failing checks) + existing rules
→ one Sonnet turn, no tools, `persistSession: false` (not one of your
sessions) → keep only `- ` lines (max 5) → you approve each → `RAY.md`.
`handleSlashCommand` takes an `askYesNo` function so chat and UI both ask.

## Commands
```
🙂 rate (UI, bottom right) · /rate good|bad [reason]
/stats [--all] · pnpm dev stats [--all] [--days 7]
/improve
```

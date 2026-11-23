# Chapter 12 — Quality checks + run log

## The problem
After the agent edits files you only *hope* it worked. And you forget how runs
went, so you can't tell later whether Haiku was good enough.

## The flow
```
turn ends → watcher (signals.ts) hands in a summary
                 │
            finishRun (report.ts)
                 │
   1. files changed? ── yes ──► checks (checks.ts) ──► "Checks: ✓ types – test – lint ✓ secrets"
   2. warning signs? ── yes ──► "⚠ hit the turn limit · 1 tool error · 1 denied"
   3. always        ──────────► saveRun (db.ts) → one row in ~/.ray-cli/ray.db
```

## signals.ts — the watcher
- `RunTracker.observe(message)` on every message; returns a summary only on
  the `result` message, then clears itself for the next turn.
- `Write`/`Edit`/`MultiEdit`/`NotebookEdit` → file path added to a **Set**
  (no duplicates). `Read` doesn't count: reading changes nothing.
- `tool_result` with `is_error: true` → tool error.
- From `result`: turns, cost, `error_max_turns`, `permission_denials`.
- A class because it must remember between messages.

## checks.ts — the answer key (free, no AI)
Every program leaves an **exit code**: `0` = worked, anything else = failed
(`tsc` through `pnpm` gives `1`). Checks 1–3 just run a command and look at it:

| Check | Command | Skipped when |
|---|---|---|
| types | `pnpm exec tsc --noEmit` | no `tsconfig.json` |
| test | `pnpm run test` | no `test` script (or npm's placeholder) |
| lint | `pnpm run lint` | no `lint` script |
| secrets | regex search in changed files | no files changed |

- `execa(..., { reject: false, all: true })`: failing is normal, don't crash;
  capture all output, keep the first line as the reason.
- Run one after another so they don't fight for CPU or mix output.
- Secrets: patterns like `sk-ant-` + 20 chars, private keys, writing `.env`.

## db.ts — the logbook
- A database = a spreadsheet in a file: table `runs`, fixed columns, one row per run.
- `node:sqlite` is built into Node. Three SQL sentences: `CREATE TABLE IF NOT
  EXISTS`, `INSERT`, `SELECT ... ORDER BY id DESC LIMIT n`.
- `?` blanks keep values apart from the SQL text (safe with quotes).
- true/false stored as 1/0; "no checks ran" as NULL; checks list as JSON text.
- One shared file for all projects, `project` column tells them apart.
- Look inside: `sqlite3 -header -column ~/.ray-cli/ray.db "SELECT * FROM runs"`

### Why SQLite
Needs: tiny writes, answer questions later (Ch 13/14), zero setup, safe with
two windows. JSON file: rewrites + clobbering. JSONL: great log, weak for
stats. Postgres/MySQL: need a server. DuckDB: big-analytics overkill. SQLite is
the only one that's zero-setup *and* answers questions in one SQL line.
Downsides: not readable in an editor, new columns need a migration
(`ALTER TABLE`), one writer at a time (fine for us).

## report.ts — the glue
- `finishRun` does steps 1–3 above. Logs every run, good or bad (Ch 13 needs both).
- `allPassed`: all ✓ → 1, any ✗ → 0, nothing ran → NULL.
- Never crashes the chat: checks and saving are in `try/catch`.
- Takes a `print` function, so chat (`console.log`) and the UI share it.

## Commands
```
/checks                    run checks now on git's changed files
pnpm dev runs [-n 10]      this project's log
pnpm dev runs --all        every project
```

## vs Claude Code
Claude Code has modes, /model, sessions, /context, compaction and CLAUDE.md
memory built in. Checks after edits need its **hooks**; there is no built-in
quality log, and no automatic escalation between models. From here on ray-cli
builds its own features on top of this log.

# Chapter 13 — Optimized mode: plan, build, escalate

## The idea
Picking a model is a guess. Haiku is cheap but sometimes wrong; Opus is good
but expensive. ray-cli now chooses like a team lead: the cheap model does the
work, the checks from Chapter 12 judge it, and a stronger model is called in
only when needed.

| Choice | What happens |
|---|---|
| **⚡ optimized** (default) | Haiku builds → checks → escalate to Sonnet, then Opus if needed |
| a specific model | exactly that model, no escalation (checks still run and log) |
| `/plan [model] <task>` | planner (Opus unless named) plans read-only → you choose how to build |

## routing.ts — the rulebook
- Settings: `BUILDER` haiku, `PLANNER` opus, `LADDER` haiku → sonnet → opus,
  `SOFT_CUTOFF` 2, `MAX_ESCALATIONS` 2, `TASK_COST_CAP` $1.00.
- `escalationReason` asks in order, first "yes" wins:
  out of budget → null · check ✗ / turn limit / error → **hard trigger** ·
  no files changed → null · soft points (tool error +1 each, any denial +1,
  ≥ 80% of turns +1) ≥ 2 → escalate.
- `nextStep`: next model on the ladder, unless no model is left, 2 steps were
  used, or the cap is reached. The fix-it message includes the failing check's
  first error line — the clue for the stronger model.
- `parsePlanCommand`: `/plan sonnet add stats` → planner sonnet. `findModel`
  matches the one id containing the word (no nicknames stored).

## task-controller.ts — the manager
- A **task** = your message until ray-cli is fully done: maybe a plan, a
  build, up to two escalations. `observe(message)` returns true only then.
- Doors in: `send`, `plan`, `setChoice`. Memory: phase, planner, escalations,
  spent (reset per task).
- `afterPlan`: unlock, back to your mode → failed / plan-only (ask mode) /
  discarded / build with the chosen approval level.
- `endTask` always tidies up: approval level back to normal, your mode back.
- Chat and UI both call the same controller, so the rules live in one place.

## permissions.ts — who may do what (first match wins)
1. Always refused, with a hint for the model: `AskUserQuestion`, `ExitPlanMode`.
2. Mode ask/plan → refused. **Planning lock**: `getMode` returns "plan" while
   `/plan` runs (this fixed Opus building during planning).
3. Approval level: `all` → allow; `edits` + edit tool → allow.
4. Otherwise ask you.

| After a plan you pick | Edits | Commands |
|---|---|---|
| 1 manual (SDK switched to `default`) | ask | ask |
| 2 auto (normal) | automatic | ask |
| 3 end to end | automatic | automatic |
| 4 don't build | — | — |

## UI
- Header: avatar, `ray`, and one line of labels; no border. `mode ▾` and
  `model ▾` are dropdowns (`Dropdown.tsx`, reused for both). Click targets are
  found with `measureElement` on refs — works at any width.
- Plan choice bar uses the "hand over a ticket" Promise trick; the bottom grows
  to 7 rows, so the middle shrinks.
- `fit-rows.ts`: split messages into lines, count wrapped rows (colour codes
  measured out), skip `scroll` lines from the bottom. Wheel / PageUp / PageDown
  scroll; sending a message jumps back down.

## Fixes found along the way
- The SDK's `total_cost_usd` is a **running total** in a chat → the watcher now
  keeps only each turn's share (Chapter 12's log had growing totals).
- Session budget $0.50 → $2.00, so the $1.00 task cap can matter.
- `Read` is allowed for any path on the laptop (it read a file outside the
  project during a test) → a job for the Chapter 16 guardrails.

## Commands
```
--model optimized | claude-haiku-5-5 | ...     (talk, chat, ui; also "sonnet")
/model [optimized|id]     /mode [agent|ask|plan]     (no argument in ui = dropdown)
/plan [model] <task>
```

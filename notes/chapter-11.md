# Chapter 11 — Context meter + memory

## Idea 1: the model has a limited "desk"
Everything the model needs for a reply must be on its desk (the
**context window**, ~200k tokens; 1 token ≈ ¾ word):

```
┌──────────────── the desk (context window) ───────────────┐
│ instructions at the start   ("you are ray-cli…" + memory)│
│ tool list                   (Read, Grep, …)               │
│ the whole chat so far       + files the agent read        │
│ ░░░░░░░░░░░░ empty space ░░░░░░░░░░░░                     │
└───────────────────────────────────────────────────────────┘
```
When it is nearly full the SDK **compacts**: old chat → short summary.

**Context meter** (`src/agent/context.ts`): after every reply,
`session.query.getContextUsage()` → `Context 12% · 24.1k / 200k tokens`.
Green < 50%, yellow < 80%, red above. Also in the `ui` header.
`/context` shows a bar and what uses the space (rows with `kind: "used"`).
Compaction now prints `⟳ Context compacted (auto|manual) · 180k → 12k tokens`.

## Idea 2: a new chat starts with an empty desk → a notebook
```
/remember use pnpm            → ./RAY.md               (this project)
/remember personal my name…   → ~/.ray-cli/memory.md   (you, every project)
        │
new chat starts → buildSystemPrompt() reads both → options.systemPrompt
        │
model reads it before your first message
```
| Command | Does |
|---|---|
| `/remember [personal] <text>` | add a note |
| `/memory` | list notes, numbered (project first) |
| `/forget <n>` | delete note n |

`src/agent/memory.ts`:
- Each note is a markdown bullet `- text`; other lines are ignored, so the file
  is easy to edit by hand.
- Sync file functions (`readFileSync`/`writeFileSync`) — tiny files, simpler
  than `await`.
- `mkdirSync(dir, { recursive: true })` creates `~/.ray-cli/` once.

## Catches
- The notebook is put on the desk only when a session **starts**: a
  `/remember` mid-chat applies from the next chat.
- Setting `systemPrompt` replaces the SDK default prompt with our own
  "You are ray-cli…" intro.
- `buildSystemPrompt()` runs inside `buildModeOptions`, so it re-reads the
  files for every new session (including switching sessions in the UI).

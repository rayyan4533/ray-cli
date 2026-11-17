# Chapter 6 — Three modes (agent / ask / plan)

## The one idea
The agent has powerful tools: reading files, editing files, running shell
commands. A *mode* is a preset for which tools it may use silently, which it
must ask you about, and which are blocked.

| Mode | Read | Edit files | Run `Bash` | Use it for |
|---|---|---|---|---|
| `ask` | yes | blocked | blocked | questions about the code |
| `plan` | yes | blocked | blocked | "how would you do X?" — a proposal only |
| `agent` | yes | yes, automatically | only if you say yes | real changes |

Safety choice: `Bash` is deliberately **not** in agent mode's pre-approved list,
so every shell command stops and asks first.

```
agent wants to use a tool
          |
   in allowedTools? --yes--> runs silently  (Read, Edit, Write, Glob, Grep)
          |no
   permissionMode says?
     acceptEdits --> not a file edit --> canUseTool --> YOU answer y/n
     dontAsk     --> denied, no question (ask mode)
     plan        --> no edits, agent only proposes
```

## The package
`@inquirer/prompts` asks questions in the terminal (yes/no confirms, menus,
text input) so we do not hand-write raw keystroke handling. Used today:
`confirm`. Coming later: `input` (Chapter 7) and `select` (Chapter 8).

Note: `figlet` now ships its own types, so `@types/figlet` from Chapter 2 is
reported as deprecated and is no longer needed.

## Files
- `src/agent/permissions.ts` — `promptBeforeToolUse`: stops the spinner, shows
  the tool name and a 300-character preview of its input, asks yes/no.
  `default: false` means plain Enter = no.
- `src/agent/modes.ts` — `CliMode` type, `parseCliMode`,
  `cliModeToPermissionMode`, and `buildModeOptions(mode)` which returns the full
  SDK options for each mode (shared base: `maxTurns: 10`, `maxBudgetUsd: 0.5`).
- `src/agent/run-query.ts` — now calls `buildModeOptions(mode)` instead of an
  inline options object; accepts `mode` (default `agent`).
- `src/cli.ts` — `talk` gets `-m, --mode <mode>` plus a `parseMode` helper that
  throws a clear error for anything other than agent / ask / plan.

## Methods and ideas worth remembering
- `type CliMode = "agent" | "ask" | "plan"` — a closed set of strings; a typo
  such as `"agnet"` becomes a compile error.
- `allowedTools` — pre-approved, run silently. `disallowedTools` — blocked.
- `permissionMode`: `acceptEdits` (auto-approve file edits, ask for the rest),
  `dontAsk` (deny anything not pre-approved, never ask), `plan` (propose only).
- `canUseTool` — a callback the SDK calls when a tool needs approval. It returns
  `{ behavior: "allow", updatedInput }` or `{ behavior: "deny", message }`.
- `{ ...BASE_OPTIONS, permissionMode: ... }` — object spread: copy the shared
  settings, then add or override fields.
- `.option("-m, --mode <mode>", desc, "agent")` — `<mode>` means the flag takes a
  value; the last argument is the default.
- Parse raw strings at the edge (`parseMode`) so the rest of the code only ever
  sees a valid `CliMode`.
- Spinner and a prompt cannot share the screen, so `stopSpinner()` runs first.

## Gotcha learned: all modes behaved the same
First test run: ask, plan and agent produced identical output. Cause:
`run-query.ts` still held the old inline options (`allowedTools: Read, Glob,
Grep`), so `buildModeOptions` was never called. Symptom to remember: if
different settings give identical behavior, check that the new code is actually
wired in. After switching `query(...)` to `options: buildModeOptions(mode)`:
- `ask` / `plan`: nothing is created.
- `agent`: file edits happen silently; `Bash` shows a yes/no prompt.

Also seen: when one route was blocked, the agent tried another (Bash, then
Write). Layered limits matter because a stuck agent looks for other routes.
Every run costs money even when blocked (about $0.02–0.10 here).

## Try it
```
pnpm dev talk "Create sample/hello.txt containing the word hi" --mode ask
pnpm dev talk "Create sample/hello.txt containing the word hi" --mode plan
pnpm dev talk "Create sample/hello.txt containing the word hi" --mode agent
pnpm dev talk "Run ls on the src folder" --mode agent
pnpm dev talk "hi" --mode banana
```

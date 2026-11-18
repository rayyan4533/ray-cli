# Chapter 8 — Wake-up command (one front door)

## The one idea
Until now you started things with separate commands (`doctor`, `banner`,
`chat -m ask`). `wakeup` chains them into one guided start, like a game's
title screen.

```
pnpm dev wakeup
      |
      v
 banner (big ray-cli letters)
      |
      v
 checkEnvironment()  -- fails? --> clean red message, exit 1
      | ok
      v
 three colored panels: AGENT (green)  ASK (blue)  PLAN (yellow)
      |
      v
 arrow-key menu: "Choose a mode to start:"
      |
      v
 startChat({ mode })      <- the whole Chapter 7 chat
```

No new packages: `boxen`, `chalk`, `select` from `@inquirer/prompts` and
`startChat` already existed. This chapter is wiring plus one cleanup.

## The cleanup: no more raw stack traces
Problem (known since Chapter 3): a missing API key printed a long Node crash.
Cause: `createCli().parse(process.argv)` does not wait for async actions, so a
thrown error had no handler.

Fix in `src/index.ts`: use `parseAsync` (returns a Promise) and attach one
`.catch` that prints a single red line and exits with code 1. That one handler
covers every command (`doctor`, `talk`, `chat`, `wakeup`).

- Exit code `1` = ended with an error; `0` = success (scripts and CI can tell).
- Ctrl+C at a menu throws `ExitPromptError` from `@inquirer/prompts`; that is
  not a failure, so the handler exits quietly with `0`.
- Because the handler is global, `wakeUp()` needs no `try/catch` of its own.
- The extra `[ELIFECYCLE]` line in the terminal comes from pnpm, not our code.

Verified without any API call:
```
ANTHROPIC_API_KEY= pnpm dev doctor
  -> Missing ANTHROPIC_API_KEY. Copy .env.example to .env and add your key.
pnpm dev talk "hi" --mode banana
  -> Invalid mode "banana". Use agent, ask, or plan.
```

## Files
- `src/index.ts` — `parseAsync` + global error handler.
- `src/config/constants.ts` — now holds `SLASH_COMMANDS`, `CLI_MODES` and
  `MODE_DESCRIPTIONS`.
- `src/commands/wake-up.ts` — `printModePanels()` and `wakeUp()`.
- `src/cli.ts` — new `wakeup` command.

## Methods and ideas worth remembering
- `Record<CliMode, string>` — an object with exactly one string per mode;
  TypeScript complains if one is missing.
- `MODE_COLORS = { agent: "green", ... } as const` — a lookup table from mode to
  border color; `as const` keeps the values as exact words, not loose strings.
- `CLI_MODES.map((value) => ({ name, value }))` — `map` turns a list into a new
  list; here, three menu items (`name` = text shown, `value` = what `select`
  returns).
- `select<CliMode>({ choices, default })` — arrow-key menu; the `<CliMode>` says
  the answer is one of the three modes, so `startChat({ mode })` type-checks.
- `parse` vs `parseAsync` — use `parseAsync` whenever any command action is
  `async`, or errors escape uncaught.
- Handle failures in one place (the top) instead of repeating try/catch in every
  command.

## Gotcha learned
When told to "add to" a file, add to it: replacing `constants.ts` outright
dropped `SLASH_COMMANDS`, and the compiler reported
`has no exported member 'SLASH_COMMANDS'` in `chat.ts`. A missing-export error
usually means a file was overwritten or an export was removed.

## Try it
```
pnpm dev wakeup
```
Expected: banner, two green checkmarks, three colored panels, the menu. Pick
`ask` and you land in the chat in ask mode. Ctrl+C at the menu leaves quietly.

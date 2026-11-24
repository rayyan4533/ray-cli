# Chapter 16 — Guardrails

## Why
Safety so far depended on modes and on your y/n, and it had holes we found
ourselves: `Read`/`Glob`/`Grep` were auto-allowed for **any** path (a planning
run read a file in `~/.claude`), "end to end" ran any command, nothing stopped
`.env`, and the SDK quietly loaded your personal `~/.claude` setup.

A **guardrail** is a hard rule that holds in every mode and approval level.

## Where it runs: the PreToolUse hook
```
agent wants a tool
1. PreToolUse hook   ← guardrails; sees EVERY call   deny → stop · allow → run · {} → carry on
2. allowedTools      ← Read/Glob/Grep…: auto-yes, skips 3
3. canUseTool        ← modes, planning lock, approval levels, your y/n
```
Read tools never reached our handler (step 3) — only a hook (step 1) sees them.
`checkTool()` holds the rules (testable without the SDK); `createGuardrailHook()`
wraps it. "allow" after you approve a dangerous command avoids being asked twice;
an approved outside read returns "no opinion" so normal rules still apply.

## The rules (your choices)
| Case | Result |
|---|---|
| secret file (`.env` but not `.env.example`, `id_rsa`, `*.pem/key`, `.npmrc`, `credentials`) | **always blocked** — what the agent reads goes to the model |
| command touching a secret (`cat .env`) | always blocked |
| read outside the project | **asks**: "Read outside the project: /full/path ?" |
| write outside the project | blocked |
| dangerous command (`rm -rf`, `git push --force`, `git reset --hard`, `git clean -f`, `sudo`, `curl … \| sh`, `mkfs`/`dd`, `chmod 777`) | **asks y/n** with what it does, even in end to end |

Paths: `resolve` (collapses `..`) → walk up to an existing folder (new files) →
`realpathSync` (follows symlinks; `/etc` is really `/private/etc`) → `relative`
from the project must not start with `..`. Never `startsWith` on the text.

Commands: regex patterns on the text — good for honest mistakes, beatable by
tricks (`x=rm; $x -rf`). Hence the second wall below (**defence in depth**).

## Only ray's own setup
`settingSources: []`: no `~/.claude` settings, plugins, CLAUDE.md or skills, and
no `.claude/settings.json` from a downloaded project. ray runs on `RAY.md`, its
own skills, permissions and guardrails. Also set for `/improve` and the classifier.

## OS sandbox (on)
macOS enforces: agent commands write only inside the project; network only to
npm/yarn registries and GitHub. `autoAllowBashIfSandboxed: false` (approvals
stay — the sandbox is a second wall, not a reason to drop the first),
`allowUnsandboxedCommands: false`, `failIfUnavailable: false`. ray's own checks
(tsc/tests/lint via execa) are not the agent's tools and aren't sandboxed.

## Logging
New table `guardrail_events(project, tool, rule, target ≤300 chars, decision
CHECK blocked|allowed|refused)`; logging in try/catch. `/stats` adds
`🛡 guardrails: …`. A climbing "secret file blocked" → add a RAY.md rule.

## Questions show up
UI: the yellow y/n bar. Chat/talk: a terminal prompt that defaults to **no**.

## Bonus: `hey ray`
`bin/hey.mjs` is registered as the `hey` command (`"bin"` in package.json) and
linked onto the PATH with a symlink in `~/.local/bin` (pnpm 12 has no
`link --global`; `~/.local/bin` is on the PATH via `~/.bash_profile`, which
every new macOS Terminal window reads). `hey ray` = the full-screen UI in **whatever folder you're
in**; `hey ray chat`, `hey ray stats` … = the other commands. It always loads
ray's own `.env` (`DOTENV_CONFIG_PATH`), never the current project's.
Undo: `rm ~/.local/bin/hey`.

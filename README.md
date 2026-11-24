# ray

A coding agent for your terminal, built on the Claude Agent SDK.

Open any folder, say `hey ray`, and ask it to fix, build, refactor or explain code.

## Features

- **Optimized mode:** Haiku builds first and steps up to Sonnet, then Opus, only when a task struggles.
- **Planning:** `/plan` has Opus plan the task. You approve the plan, then Haiku builds it.
- **Three modes:** `agent` (makes changes), `ask` (read-only answers), `plan` (plans only).
- **Sessions:** resume a conversation later, rename it, or browse sessions in a side panel.
- **Memory:** project rules live in `RAY.md`; personal rules are added with `/remember`.
- **Skills:** a playbook for bugfix, feature, refactor or explain is picked for each task.
- **Quality checks:** types, tests, lint and a secrets scan run after each task. Every run is logged to SQLite.
- **Ratings and stats:** rate runs 👍/👎, see what works in `/stats`, and get rule suggestions from `/improve`.
- **Guardrails:**
  - Secrets are never read.
  - Writing outside the project is blocked.
  - Dangerous commands always ask first.
  - An OS sandbox limits what commands can do.

## Setup

Needs Node 22+ and pnpm.

```bash
pnpm install
cp .env.example .env   # then add your ANTHROPIC_API_KEY
ln -s "$PWD/bin/hey.mjs" ~/.local/bin/hey
```

## Usage

```bash
hey ray              # full-screen UI in the current folder
hey ray chat         # plain terminal chat
hey ray talk "..."   # one-off question
hey ray stats        # how runs went, per model and skill
hey ray --help       # every command
```

Options: `--mode agent|ask|plan`, `--model optimized|<model id>`, `--resume <id>`, `--continue`.

In-chat commands: `/help` lists all of them, including `/plan`, `/model`, `/mode`, `/skill`, `/remember`, `/sessions`, `/rate`, `/stats` and `/improve`.

## Project layout

```
bin/hey.mjs     launcher for `hey ray`
src/agent/      sessions, modes, routing, guardrails
src/quality/    checks, run log (SQLite), ratings, stats
src/skills/     built-in skills and the task classifier
src/ui/         full-screen Ink UI
notes/          one note per chapter of the build
```

Data lives in `~/.ray-cli/` (the run log `ray.db`, personal memory and personal skills).

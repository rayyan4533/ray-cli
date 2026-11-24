# ray

**A coding agent for your terminal that measures how well it works and learns from it.**

Open any project, say `hey ray`, and ask it to fix, build, refactor or explain code. ray picks the cheapest model that can do the job, checks the result, logs every run, and turns your feedback into project rules.

---

## Why ray

| | |
|---|---|
| ⚡ **Optimized mode** | Haiku builds first. Tool errors, denials or running out of turns move it up to Sonnet, then Opus. Each task has a $1 cap. |
| 🧭 **Plan, then build** | `/plan <task>` has Opus plan read-only. You approve the plan and choose manual, auto-edits or end-to-end, then Haiku builds it. |
| ✅ **Quality checks** | Types, tests, lint and a secrets scan run on their own after every task. |
| 📊 **Run log and stats** | Every run is saved to SQLite. `/stats` shows the success rate per model and skill, with hints. |
| 👍 **Ratings and `/improve`** | Rate a run with a reason. `/improve` reads the bad runs and suggests `RAY.md` rules for you to approve. |
| 🧩 **Skills** | Bugfix, feature, refactor and explain playbooks are picked for each task. You can add your own. |
| 🛡 **Guardrails** | Secrets are never read. Writing outside the project is blocked. Dangerous commands always ask. An OS sandbox limits network access and writes. |
| 💬 **Sessions and memory** | Resume and rename sessions, browse them in a side panel, and keep project and personal memory. |

---

## Quick start

Needs **Node 22.5+** (for the built-in SQLite) and **pnpm**.

```bash
git clone https://github.com/rayyan4533/ray-cli-coding-tool.git && cd ray-cli-coding-tool
pnpm install
cp .env.example .env                       # add your ANTHROPIC_API_KEY
ln -s "$PWD/bin/hey.mjs" ~/.local/bin/hey  # make `hey` available everywhere
```

Then go to any project folder and run:

```bash
hey ray
```

## Commands

```bash
hey ray                  # full-screen UI in the current folder
hey ray chat             # plain terminal chat
hey ray talk "question"  # one-off question
hey ray sessions         # list past sessions
hey ray runs             # recent runs from the log
hey ray stats            # success rates per model and skill
hey ray doctor           # check your setup
hey ray --help           # everything else
```

**Options:** `--mode agent|ask|plan`, `--model optimized|<model id>`, `--resume <id>`, `--continue`

**Inside a chat:**

| Command | What it does |
|---|---|
| `/plan [model] <task>` | plan first, then build |
| `/model`, `/mode` | switch model or mode |
| `/skill <name>` | force a skill for the next task |
| `/remember [personal] <rule>` | save a rule to `RAY.md` or your personal memory |
| `/sessions`, `/rename` | manage sessions |
| `/checks`, `/rate`, `/stats`, `/improve` | quality loop |
| `/context` | how full the context window is |
| `/help` | all commands |

## Modes

- **agent:** reads and changes code, with approvals.
- **ask:** read-only answers.
- **plan:** plans only, changes nothing.

---

## Packages

**Runtime**

| Package | What ray uses it for |
|---|---|
| [`@anthropic-ai/claude-agent-sdk`](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) | The agent engine: runs Claude with tools, sessions, hooks, permissions and the sandbox. |
| [`commander`](https://www.npmjs.com/package/commander) | Parses `hey ray <command> --options` into commands. |
| [`ink`](https://www.npmjs.com/package/ink) | React for the terminal; draws the full-screen UI. |
| [`react`](https://www.npmjs.com/package/react) | The component model Ink renders: header, dropdowns, panels. |
| [`ink-text-input`](https://www.npmjs.com/package/ink-text-input) | The text box you type into in the UI. |
| [`@inquirer/prompts`](https://www.npmjs.com/package/@inquirer/prompts) | Interactive prompts in chat mode: y/n approvals, pick-from-a-list, text input. |
| [`chalk`](https://www.npmjs.com/package/chalk) | Colours terminal text. |
| [`boxen`](https://www.npmjs.com/package/boxen) | Draws boxes around terminal output, like the welcome card. |
| [`figlet`](https://www.npmjs.com/package/figlet) | Turns text into large ASCII-art letters for the banner. |
| [`ora`](https://www.npmjs.com/package/ora) | The spinner shown while the agent is thinking. |
| [`execa`](https://www.npmjs.com/package/execa) | Runs the quality checks and other shell commands, and reports exit codes. |
| [`dotenv`](https://www.npmjs.com/package/dotenv) | Loads `ANTHROPIC_API_KEY` from ray's own `.env`. |
| `node:sqlite` | Node's built-in SQLite, the run log at `~/.ray-cli/ray.db`. No install needed. |

**Development**

| Package | What it's for |
|---|---|
| [`typescript`](https://www.npmjs.com/package/typescript) | Type-checks the code. |
| [`tsx`](https://www.npmjs.com/package/tsx) | Runs TypeScript directly, with no build step. `hey ray` uses it. |
| [`@types/node`](https://www.npmjs.com/package/@types/node) | Types for Node's built-in modules. |
| [`@types/react`](https://www.npmjs.com/package/@types/react) | Types for React and JSX. |
| [`@types/figlet`](https://www.npmjs.com/package/@types/figlet) | Types for figlet. |

---

## Project layout

```
bin/hey.mjs      the `hey ray` launcher
src/cli.ts       command definitions
src/agent/       sessions, modes, routing and escalation, guardrails
src/quality/     checks, SQLite run log, ratings, stats, /improve
src/skills/      built-in skills and the task classifier
src/ui/          full-screen Ink UI (avatar, dropdowns, sessions panel)
src/config/      model list and environment
notes/           one note per chapter of the build
```

## Your data

Everything stays on your machine:

| Path | What's there |
|---|---|
| `~/.ray-cli/ray.db` | run log, ratings, guardrail events |
| `~/.ray-cli/memory.md` | personal memory |
| `~/.ray-cli/skills/` | your personal skills |
| `<project>/RAY.md` | project rules |
| `<project>/.ray/skills/` | project skills |

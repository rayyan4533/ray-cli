# Chapter 15 — Skills routed by task type

## The idea
Different tasks need different habits: a bug fix starts by finding the cause,
a refactor must not change behaviour, a question must not edit files. A
**skill** is a short playbook for one kind of task, attached only when it fits.

```
"the login crashes on empty email"
   → classify in code → bugfix
   → message sent with the bugfix playbook attached
   → run logged with skill = bugfix → /stats shows how bugfix runs are rated
```

## Skill files (skills.ts, builtin.ts)
Markdown with a header ("frontmatter") and a body (the playbook):
```
---
name: bugfix
description: Fix something that is broken…      ← Haiku reads this
keywords: bug, crash, error, fail, …           ← the free classifier reads this
---
1. Reproduce… 2. Find the root cause… 3. Smallest fix…
```
Three places, later wins (a Map keyed by name):
built-in → `~/.ray-cli/skills/` (personal) → `.ray/skills/` (project).
Read fresh for every message, so edits apply immediately. Built-ins:
**bugfix, feature, refactor, explain**.

## Picking a skill (classify.ts)
1. **Keywords (free):** count each skill's keyword hits; a clear winner (more
   hits than any other) is used. Whole words only (`add` ≠ "address"), simple
   endings allowed (`crash` → crashes/crashed/crashing).
2. **Haiku (~$0.001):** only when nothing matched or it's a tie. One turn, no
   tools, not saved; the answer must be a real skill name, else no skill.

## Reaching the agent
`withSkill()` appends the playbook after your message. Per message, not in the
system prompt (fixed per session) and not the SDK's `skills` option (also fixed
per session). Normal messages, `/skill`, the build step after `/plan`, and
`talk` get a skill; escalation fix-it messages don't (same session, already
seen). Haiku's cost counts toward the task cap.

## Override
`/skill` lists skills and their source · `/skill <name> <task>` forces one ·
`/skill off <task>` sends with none.

## Measuring
Migration #2: `runs.skill` (old rows → "none"). `/stats` adds a per-skill
table (runs, checks ✓, 👍/👎). Rules in `RAY.md` are for **always**; skills
are for **this kind of task** — use the ratings to rewrite a weak playbook.

## Found for Chapter 16
The SDK loads your personal `~/.claude` settings by default (`settingSources`
unset) — to be switched off so ray-cli uses only its own setup.

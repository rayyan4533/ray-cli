# Chapter 10 — Sessions (list, resume, rename)

## The one idea
Every chat is already saved by the SDK to
`~/.claude/projects/<your-folder>/<session-id>.jsonl` (one line per message).
This chapter lets you list those chats, resume one (the agent remembers it),
and rename one so the list is readable.

```
pnpm dev sessions                       pnpm dev chat --resume 3f2a91c0
      |                                          |
listSessions({ dir: cwd })              findSession("3f2a91c0")  -- prefix match
      |                                          |
3f2a91c0  2h ago  Fix the login bug     query({ options: { resume: full-id } })
a81bd004  1d ago  Explain generators             |
                                        SDK reloads the .jsonl, agent remembers
```

## What the SDK gives us
| Function / option | What it does |
|---|---|
| `listSessions({ dir, limit })` | sessions for a folder, newest first |
| `renameSession(id, title, { dir })` | sets `customTitle` |
| option `resume: id` | continue that exact session |
| option `continue: true` | continue the most recent session in this folder |

## `src/agent/sessions.ts`
- `dir: process.cwd()`: only this folder's chats, not every project.
- `findSession(prefix)`: type the first 8 characters; two matches → clear error.
- Title = `customTitle ?? summary` (your name wins over the auto summary).

## Where the session id comes from
A new chat has no id until its first turn. The SDK announces it in the
`system`/`init` message (`message.session_id`); chat stores it on
`session.id` so `/rename` knows what to rename. When resuming, the id is known
from the start.

## Small details
- `continueLast` instead of `continue`: `continue` is a JS keyword, so it
  can't be a variable name (a property like `opts.continue` is fine).
- `/rename my new title` keeps spaces: `[command, ...rest]` then
  `rest.join(" ")`.
- Sessions from other tools running in the same folder also show in the list,
  because they are stored in the same place.

## Commands
```
pnpm dev sessions [-n 10]
pnpm dev chat --resume <id>     # or -r
pnpm dev chat -c                # continue last
/sessions   /rename <title>     # inside chat
```

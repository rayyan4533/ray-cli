# Chapter 7 — Chat loop (a conversation that remembers)

## The one idea
`talk` starts a brand-new agent every run, so it forgets everything. `chat`
starts **one** agent that stays alive and receives your messages one at a time,
so it remembers the whole conversation.

Words to keep straight:
- **turn** = you send one message and the agent finishes replying.
- **session** = the whole conversation, from starting `chat` until `/exit`.

```
SESSION (one running agent, one memory, from start to /exit)
 |- turn 1: "my name is Rayyan"  -> reply
 |- turn 2: "what is my name?"   -> "Rayyan"  (it remembers)
 |- /mode ask                    -> handled by us, not a turn
 '- /exit                        -> agent closed, memory gone
```

## Three jobs
Analogy: you are a customer, the agent is a chef who cooks one dish at a time.

1. **Ticket window (`InputQueue`)** — holds your messages until the agent asks
   for the next one.
2. **Chef (`createSession` / `query`)** — keeps asking for the next ticket.
3. **Turn gate** — stops the `You:` prompt from appearing while the agent is
   still answering.

### The ticket window
```
you drop a ticket (push)
   chef asleep, waiting?  YES -> wake chef, hand over the ticket
                          NO  -> chef busy: put it on the spike (pending list)

chef asks "next ticket?" (waitForMessage)
   anything on the spike? YES -> take the oldest
                          NO  -> fall asleep until someone drops one
```
The "sleep" is a Promise whose `resolve` function is stored in `this.resolver`.
`push()` later calls it, which wakes the waiting `await`.

### Generators (the key new idea)
- A normal function returns once.
- A generator function (`function*`) can hand back many values, pausing at each
  `yield`. Calling it returns a "remote control" (an iterator); it runs nothing
  until `.next()` is pressed. Each press runs to the next `yield` and returns
  `{ value, done }`.
- `for...of` presses `.next()` for you.
- An **async generator** (`async function*`) lets each value arrive later; you
  loop with `for await`. `query()` returns one (the agent's messages), and
  `InputQueue.generator()` is one (your typed messages).

### The two loops in `startChat`
```
LOOP A (processing)                  LOOP B (main while loop)
read and print agent messages        ask what you want
 for await (message of query)        wait for gate to open
   print it                          show "You:" and read the line
   if "result" -> open gate  <-----  push the line (gate closed by begin())
```
They only share the turn gate.

### Where the memory lives
The model itself has no memory. The SDK keeps the conversation history and
resends the whole history to the model every turn. Consequences: cost grows
each turn; there is a size limit (`/context` shows usage; old history is
summarized, which prints the `compact_boundary` message); the SDK also saves
transcripts on disk by default.

## Files
- `src/config/constants.ts` — `SLASH_COMMANDS` list.
- `src/agent/input-queue.ts` — `InputQueue` (`push`, `close`, `waitForMessage`,
  `generator`).
- `src/agent/create-session.ts` — builds the queue, starts `query` with the
  queue's generator as the prompt, returns the `session` bundle
  `{ query, inputQueue, mode }`.
- `src/commands/chat.ts` — slash commands, turn gate, both loops, `startChat`.
- `src/cli.ts` — new `chat` command (`-m`, `-v`).
- `src/agent/modes.ts` and `src/agent/permissions.ts` — refactored (see below).

## Design fix: `/mode` must switch everything
Chapter 6 gave each mode its own tool lists, but `setPermissionMode` only
changes the permission setting. After `agent` then `/mode ask`, the edit tools
would still have been pre-approved. Fix:
- All modes share one pre-approved list (read-only tools).
- Modes differ only by `permissionMode` (`acceptEdits`, `dontAsk`, `plan`).
- `createPermissionHandler(getMode)` is mode-aware: outside `agent` it denies;
  in `agent` it asks yes/no before running a tool such as `Bash`.
- `getMode` is a function (`() => session.mode`) so the handler reads the
  *current* mode each time, not the one from startup.

## Other details worth remembering
- `/exit` is handled in exactly one place (the handler returns `"exit"`).
- Unknown slash commands print an error instead of being sent to the agent.
- Ctrl+C at the prompt throws; we catch it and exit cleanly.
- `get active()` — a getter, read like a property (`turnGate.active`).
- `private` class fields can only be touched inside the class.
- `as const` freezes a list so TypeScript treats it as fixed.
- Model is set once in `BASE_OPTIONS` (`claude-haiku-5-5`), so `talk` and `chat`
  both use it; without it the SDK default (a larger, costlier model) was used.
- `maxTurns` / `maxBudgetUsd` may apply to the whole session, not per message.

## Try it
```
pnpm dev chat
```
Then: tell it your name, ask for it back, `/mode ask` + try creating a file
(refused), `/mode agent` + create it (works), ask it to run `ls` (yes/no prompt),
`/context`, `/foo`, `/exit`.

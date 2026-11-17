# Chapter 5 — Message handler (making the agent loop visible)

## The one idea
The stream from `query()` mixes several kinds of messages. A message handler
looks at each message's `type` and decides how to show it, like a mail room
sorting by label.

```
message arrives
      |
  handleMessage()
      |
  stop spinner  (printing while it animates garbles the screen)
      |
  switch on message.type
      |
  +-----------+--------------+----------------+-------------------+
  system     assistant       user             result
  "Session   cyan text       "  <- file       green final answer
  started"   + "-> Read"     contents..."     + turns + cost
             (tool calls)    (tool results)
```

No new package this chapter; the colors and spinner from Chapter 2 finally get used.

## Files
- `src/agent/message-handler.ts` — `handleMessage(message, { verbose })` plus
  two helpers, `getBlocks` and `getText`.
- `src/agent/run-query.ts` — now starts the spinner, calls `handleMessage` for
  every message, restarts the spinner after each non-final message, and stops it
  in `catch`.

## How each message type is shown
- `system` (`init`): model name and first 8 characters of the session id.
  `compact_boundary` says older history was summarized.
- `assistant`: text in cyan; each `tool_use` block as `-> ToolName {input}`
  (input cut to 80 chars with `truncate`).
- `user`: when the agent calls a tool, the result comes back as a user message
  holding `tool_result` blocks; shown as `<- ...` (cut to 120 chars).
- `result`: final answer in green if `subtype === "success"`, otherwise
  `Stopped: <subtype>` in red; then `Done · N turns · $cost`.

## Methods and ideas worth remembering
- A message's `content` is not always a string; it is often a list of *blocks*
  such as `{type:"text", text}` and `{type:"tool_use", name, input}`.
- `type Block = { type: string; [key: string]: unknown }` — "an object with a
  `type` string plus other fields of unknown type" (the index signature).
- `(b): b is Block => ...` — a *type guard*: a filter function that also tells
  TypeScript the surviving items are `Block`.
- `switch (message.type)` — inside `case "assistant":` TypeScript knows the
  exact message shape. End each `case` with `break`.
- Text and tool calls are read separately (`getText` only takes `text` blocks)
  so a tool call is never printed twice.
- Tool results arrive as `user` messages with `tool_result` blocks, so they are
  detected by block type, not by any parent id.
- `.toFixed(4)` — four decimals; costs are tiny.
- Spinner rule: stop before printing, restart after, except after the final
  `result`.
- `--verbose` now adds a `[type]` tag before each formatted message.

## Turns and limits
A *turn* is one model reply. Reading a file and then answering takes at least
two turns (one to call the tool, one to answer), so `maxTurns: 1` cannot answer
anything that needs a tool.

Experiment: with `maxTurns: 1` the run printed `Stopped: error_max_turns`.
Observations:
- the count shows `2 turns` against a limit of 1: the stop fires when the agent
  tries to go past the cap;
- a stopped run still costs money;
- the failure is reported twice: once by our handler (`Stopped: ...`) and once
  by the SDK throwing, which our `catch` prints. Harmless; can be tidied later.

`maxTurns: 5` is a sensible cap: room for a few tool calls, still stops runaways.

## Try it
```
pnpm dev talk "Say hello in five words"
pnpm dev talk "Read src/cli.ts and tell me how many commands it defines" --verbose
```

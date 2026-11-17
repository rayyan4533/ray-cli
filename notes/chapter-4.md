# Chapter 4 — First SDK call (query)

## The one idea
Until now ray-cli only talked to the terminal. Now it talks to Claude: hand over
a prompt, and a *stream of messages* comes back while the agent thinks, uses
tools and answers.

```
pnpm dev talk "what files are in src?"
        |
        v
  requireApiKey()  --- missing? --> stop with a clear error (Chapter 3)
        |
        v
  query({ prompt, options })         <- one call, returns a stream
        |
        v
  for await (message of stream)      <- messages arrive one by one
        |        |         |
     system   assistant   result
     (init)   (text, tool  (final: cost,
              calls)        turns used)
```

## The package and why it exists
`@anthropic-ai/claude-agent-sdk` is the agent engine behind Claude Code,
packaged as a library. With the plain API you would write the loop yourself:
send a prompt, get "run this tool", run it, send the result back, repeat. The
SDK runs that loop for you and already knows tools like `Read`, `Glob`, `Grep`,
`Edit` and `Bash`.

It costs real money per call, so we set two safety nets:
- `maxTurns` — maximum rounds of "think, use a tool, think again".
- `maxBudgetUsd` — hard dollar cap; the run stops when it is reached.

## Files
- `src/agent/run-query.ts` — `runQuery(prompt, { verbose })`: calls `query`,
  loops over the stream, prints `[type]` for each message (full JSON with
  `--verbose`). Errors are caught and printed in red.
- `src/cli.ts` — added `talk <prompt> [-v]`, which checks the API key then
  calls `runQuery`.

## Methods and ideas worth remembering
- `for await (const m of stream)` — like `for...of`, but waits for each item.
  An array is a box that is already full; a stream is a conveyor belt.
- `query()` returns an *async generator* (a stream), not one answer.
- `const { verbose = false } = options` — destructuring with a default;
  same as `options.verbose ?? false`.
- `options: RunQueryOptions = {}` — default parameter, so `runQuery("hi")` works.
- `Promise<void>` — an async function that returns nothing.
- `error instanceof Error ? error.message : String(error)` — anything can be
  thrown in JS, so check it is a real `Error` before reading `.message`.
- `JSON.stringify(obj, null, 2)` — object to readable text, 2-space indent.
- commander: `.argument("<prompt>")` is a required value (quote it in the
  terminal); `.option("-v, --verbose", desc, false)` is an optional flag; the
  action receives `(argument, options)` in that order.
- `allowedTools: ["Read", "Glob", "Grep"]` — this first version can only look
  at files, never change them. Proper modes come later.

## Reading the raw stream
Every message has a `type`:
- `system` — session start (model, session id).
- `assistant` — the model's text and tool calls.
- `user` — tool results coming back to the model.
- `result` — final message: success or not, turns used, `total_cost_usd`.

## Try it
```
pnpm dev talk "Say hello in five words"
pnpm dev talk "Say hello in five words" --verbose
pnpm dev talk "List the files inside the src folder and tell me what each one does"
```

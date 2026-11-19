# Chapter 9 — Model choice

## The one idea
Before, `modes.ts` hard-coded Haiku. Now the model is a choice that travels
from your command down to the SDK, and in chat you can change it between turns.

```
pnpm dev talk "hi" --model claude-sonnet-5-5      You: /model claude-opus-5-5
        |                                                |
  parseModel()  -- unknown id? --> red error, exit 1     parseModelId()
        |                                                |
  runQuery / startChat({ model })                  session.query.setModel(id)
        |                                                |
  buildModeOptions({ mode, model })                next turn uses Opus
        |
  options.model = "claude-sonnet-5-5"  -->  SDK
```

No new packages.

## `src/config/models.ts`: one list of models
```ts
{ id: "claude-sonnet-5-5", provider: "anthropic", note: "balanced speed, cost and quality" }
```
- **Real ids, no nicknames.** Later we add OpenAI or Gemini models: a nickname
  like `sonnet` means nothing next to `gpt-…`. The real id is unambiguous.
- **`provider` field.** Today it is only `"anthropic"`. Later, the code will
  look at it to pick which runner to use, because the Claude Agent SDK only runs
  Claude models.
- **`ModelId` type** is built from the list: `(typeof MODELS)[number]["id"]`.
  Add an entry and the type grows by itself.
- **`as const satisfies readonly ModelInfo[]`**: `as const` keeps the exact
  strings, so the type knows the real ids and not just `string`. `satisfies`
  checks every entry has `id`, `provider` and `note`.
- `parseModelId(value)` returns the id, or `null` if it isn't in the list.

## Where the model flows
| File | Change |
|------|--------|
| `agent/modes.ts` | `buildModeOptions({ mode, model, getMode })`: one object, labelled inputs |
| `agent/run-query.ts` | takes `model`, passes it to the options and the handler |
| `agent/create-session.ts` | the session remembers `model`, like it remembers `mode` |
| `agent/message-handler.ts` | `Done · <model> · N turns · $x` |
| `commands/chat.ts` | `/model` shows the current model; `/model <id>` switches it |
| `cli.ts` | `--model <id>` on `talk` and `chat` (no `-m`: that is `--mode`) |
| `commands/wake-up.ts` | model picker after the mode picker |

## `/model` mid-chat
`session.query.setModel(id)` only works in streaming-input sessions (chat),
not one-shot `talk`. The final line reads `session.model` (not the starting
model), so after a switch it shows the new one.

## Mistakes fixed this chapter
- The file was saved as `config/modes.ts` instead of `config/models.ts`.
- In `run-query.ts`, the `for await` loop got lost while pasting.
- In `message-handler.ts`, `const { verbose, model } = options` was placed
  outside the function, where `options` doesn't exist.

## Try it
```
pnpm dev talk "say hi in 3 words" --model claude-sonnet-5-5
pnpm dev talk "hi" --model gpt4        # clean error, no API call
pnpm dev chat                          # then /model, /model claude-opus-5-5
pnpm dev wakeup                        # mode picker, then model picker
```

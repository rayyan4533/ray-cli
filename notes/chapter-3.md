# Chapter 3 — Environment and preflight

## The one idea
Check that the program can run *before* it runs. A missing API key or an old
Node should produce a clear message at the start, not a confusing crash halfway
through. Same idea as a pilot's pre-takeoff checklist.

```
ray-cli doctor
      |
      v
 run `node -v`  --> version < 18? --yes--> stop: "Node.js 18+ required"
      |no
      v
 read ANTHROPIC_API_KEY --> missing? --yes--> stop: "Missing ANTHROPIC_API_KEY"
      |present
      v
 print green checkmarks
```

## Packages and why they exist
| Package | Job | Example |
|---|---|---|
| dotenv | reads `.env` and copies its lines into `process.env`, so you don't have to export the key in every new terminal | `.env` has `ANTHROPIC_API_KEY=sk-...`; then `process.env.ANTHROPIC_API_KEY` works |
| execa | runs another program from your code and returns its output; friendlier than Node's built-in `child_process` | `await execa("node", ["-v"])` gives `v26.12.0` |

## Secrets and git
- `.env` holds the real key. It is in `.gitignore`, so it never reaches GitHub.
- `.env.example` holds a placeholder (`your-key-here`). It *is* committed, so
  anyone cloning the repo knows what to fill in. `.gitignore` has `!.env.example`
  to let it through.
- Never put a key in code, in a commit, or in a chat.

## Files
- `src/config/env.ts`
  - `requireApiKey()` returns the key or throws a clear error.
  - `checkEnvironment()` checks Node >= 18 via `execa`, then the key, then prints checkmarks.
- `src/cli.ts` — added `doctor` (calls `checkEnvironment`) and `whoami`
  (prints only the last 4 characters of the key).
- `.env.example` — committed template.

## Methods worth remembering
- `import "dotenv/config"` — no names imported; loading the package is enough,
  it reads `.env` as a side effect.
- `const { stdout } = await execa(...)` — destructuring: pull one field out of
  the returned object.
- `x ?? "0"` — use `"0"` only if `x` is `undefined`/`null`. `split(".")[0]` can
  be `undefined` as far as TypeScript knows, and `strict` makes us handle it.
- `/^v/` — regex for "a `v` at the start"; `.replace(/^v/, "")` turns `v26.12.0`
  into `26.12.0`.
- `key.slice(-4)` — negative index counts from the end: last 4 characters.
- dotenv never overrides a variable that is already set, so
  `ANTHROPIC_API_KEY= pnpm dev doctor` safely tests the "missing key" path
  without touching `.env`.

## Pitfalls avoided
- `Number(stdout.slice(1)) < 18` looks like a version check but is broken:
  `"26.12.0"` is not a number, so `Number(...)` is `NaN`, and `NaN < 18` is
  always false, so the check could never fail. We parse the major version
  properly and keep all checks in one place (`checkEnvironment`) instead of
  duplicating them in `cli.ts`.
- An error message that says "copy `.env.example`" is only useful if that file
  really is in the repo. We committed it.

## Known rough edge
A missing key still prints a Node stack trace, because nothing catches the
thrown `Error`. The `wakeup` command (Chapter 8) will catch it and print a
clean message.

## Try it
```
pnpm dev doctor
pnpm dev whoami
ANTHROPIC_API_KEY= pnpm dev doctor     # failure path
```

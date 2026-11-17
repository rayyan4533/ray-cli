# Chapter 2 — Terminal UI (chalk, boxen, figlet, ora)

## The one idea
A terminal only understands text. Colors, boxes and spinners are plain text with
invisible control characters mixed in. These packages hide that mess.

```
console.log("hi")             console.log(chalk.red("hi"))
      |                              |
   "hi"                     "\x1b[31m hi \x1b[39m"
      |                              |
  plain text               terminal sees the invisible
                           "turn red" / "back to normal"
                           codes and paints it red
```

Pattern used everywhere in the UI files: **build strings, then print them.**
`chalk`, `boxen` and `figlet` only return strings; `console.log` prints.

## Packages and why they exist
| Package | Job | Example |
|---|---|---|
| chalk | wraps text in color codes | `chalk.red("error")` |
| boxen | draws a border around text | mode panels, banner box |
| figlet | turns text into big ASCII art | the `ray-cli` banner |
| ora | animated spinner (redraws one line on a timer) | "Thinking…" while the agent works |
| @types/figlet | type info for figlet (dev dependency only) | |

`@types/figlet` is a dev dependency (types are only needed while coding), not a
regular dependency.

## Files
- `src/ui/format.ts` — `fmt`: an object of small functions named by meaning
  (`fmt.error`, `fmt.success`, ...) plus `truncate(text, max = 200)`.
- `src/ui/banner.ts` — `printBanner()`: `figlet.textSync` for big letters,
  `boxen` for the box, then `console.log` both.
- `src/ui/spinner.ts` — one shared spinner (`active: Ora | null`) with
  `startSpinner`, `updateSpinner`, `stopSpinner`.
- `src/cli.ts` — added `banner` command and a temporary `spin` demo command.

## Methods worth remembering
- `chalk.dim.green(x)` — chaining stacks styles (dim + green).
- Arrow function `(text: string) => chalk.red(text)` — one expression, `return` implied.
- `text.slice(0, max)` — first `max` characters; template literal `` `${x}…` `` embeds values.
- `figlet.textSync(text, { font })` — returns ASCII art string immediately.
- `boxen(text, { padding, borderColor })` — returns the boxed string.
- `ora({ text, color }).start()` — starts animating, returns the spinner.
- `active?.stop()` — optional call: does nothing if `active` is `null`.
- `import ora, { type Ora }` — `type` imports vanish at runtime, used only by TypeScript.

## Gotcha learned
`await` only makes sense on something that returns a Promise. A Promise finishes
only when `resolve()` is called. `await new Promise((resolve) => stopSpinner())`
never calls `resolve`, so it hangs forever and the next line never runs.
Call plain functions like `stopSpinner()` directly, with no `await`.
(An editor auto-import of `resolve` from `node:dns` was also removed.)

## Try it
```
pnpm dev banner
pnpm dev spin
```

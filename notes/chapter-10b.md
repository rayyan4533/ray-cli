# Chapter 10b — Full-screen UI (Ink), Sessions panel, mouse

## The one idea
Before, ray-cli printed lines that scrolled away (`console.log`). A full-screen
app is like a web page: you describe what the screen looks like from your data
(state), and the library redraws it when the data changes.

```
pnpm dev ui
   |
render(<App/>, { alternateScreen: true })    <- blank second screen, like vim
   |
┌ header: ray-cli          agent · model · id · ☰ sessions ┐
│ transcript (newest lines that fit)   │ Sessions panel     │
└ input box  (or yellow "Allow X? y/n" bar)                 ┘
```

## Packages
| Package | Why |
|---|---|
| `react` | rebuilds the screen from state |
| `ink` | React for terminals: `<Box>` ≈ div (flexbox), `<Text>` ≈ span |
| `ink-text-input` | ready-made text box |
| `@types/react` | types for JSX; `tsconfig` gets `"jsx": "react-jsx"` |

## Part 1 — refactors so two screens share one brain
- `formatMessage()` returns lines; `handleMessage()` just prints them.
  The UI pushes the same lines into state instead.
- Permissions take an `ask` function. Chat: inquirer `confirm`. UI: a Promise
  whose `resolve` is stored in state → yellow bar → `y` calls `resolve(true)`.
- `handleSlashCommand(line, session, print = console.log)`: the UI passes its
  own `print`, so slash commands aren't duplicated.

## React hooks used
| Hook | Plain meaning |
|---|---|
| `useState` | a variable that redraws when changed |
| `useRef` | a variable that does not redraw (session object, settings) |
| `useEffect(fn, [deps])` | run when deps change; returned function = cleanup |
| `useInput(fn, { isActive })` | key presses; only one listener active at a time |
| `useWindowSize` | rows/columns, redraws on resize |

## Part 2 — Sessions panel
- Tab (or `/sessions`) opens it; ↑↓ move, Enter resume, `r` inline rename, Esc close.
- Switching = changing `resumeId` state. `useEffect([resumeId])` cleans up the
  old session (close query, answer "no" to any pending approval) and starts the
  new one with `resume`.
- `cancelled` flag: drops late messages from the old loop.
- `loadHistory()` reads the saved `.jsonl` via `getSessionMessages` so you see
  the old chat (resume only makes the *agent* remember).
- No switching while the agent is busy.

## Part 3 — mouse
Terminals send clicks as hidden codes once asked:
```
ESC[?1000h ESC[?1006h          turn on (off = ...l)
click → ESC [ < 0 ; 70 ; 6 M   button ; column ; row ; M press / m release
```
- `useMouse` hook: writes on/off codes, listens to stdin `"data"` next to Ink
  (Ink's `read()` also feeds `data` listeners; Ink drops mouse codes from
  `useInput`), turns off on unmount and on process exit.
- Hit-testing by layout maths: header 3 rows, panel list starts 2 rows lower,
  panel = last `PANEL_WIDTH` columns. `panelWindow()` is shared by drawing and
  clicking so they agree.
- Panel state (index, rename draft) lifted up into App ("lifting state up").
- Click once = select, again = resume. Ignored during approvals and renames.
- Side effect: drag-to-select needs Option/Shift while mouse mode is on.

## Commands
```
pnpm dev ui [-m ask] [--model claude-sonnet-5-5] [-r <id>]
```

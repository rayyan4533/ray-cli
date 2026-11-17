# Chapter 1 — Project skeleton and first command

## The one idea
A CLI is a Node program that reads what you typed after its name (`ray-cli hello`)
and decides which function to run. Chapter 1 builds only that routing.

```
you type:  pnpm dev hello
              |
              v
   tsx runs  src/index.ts          (entry point: "start here")
              |
              v
   createCli().parse(process.argv) (commander reads ["hello"])
              |
      +-------+--------+
 matches "hello"?   no match / nothing typed
      |                  |
      v                  v
 runs its action     prints the help screen
```

## Packages and why they exist
| Package | What it is | Why we need it |
|---|---|---|
| Node | runs JavaScript outside the browser | the runtime |
| pnpm | package manager (like npm) | one shared store, fast installs |
| TypeScript | JS with types checked before running | catches `undefined` bugs at edit time; the Agent SDK has great types |
| tsx | runs `.ts` files directly | `node file.ts` can't do it alone; no build step for `pnpm dev` |
| @types/node | type definitions for `process`, `fs`, ... | otherwise TS doesn't know what `process.argv` is |
| commander | parses `argv` into commands, options, arguments | avoids hand-written `if (process.argv[2] === ...)` and gives `--help` for free |

`pnpm-workspace.yaml` has `allowBuilds: esbuild: true` because tsx uses esbuild,
which needs a post-install script, and pnpm blocks those by default.

## Files created
- `package.json` — name, `"type": "module"` (use `import`/`export`), `dev` script.
- `tsconfig.json` — `module: NodeNext` (follow Node's real rules), `strict: true`
  (be pedantic from day one), `rootDir: src`, `outDir: dist`.
- `src/index.ts` — entry point, calls `createCli().parse(process.argv)`.
- `src/cli.ts` — builds the commander program: `hello`, `goodbye`, and a
  fallback that shows help.

## Things worth remembering
- Imports use the `.js` extension (`./cli.js`) even though the file is `.ts`.
  Node ESM needs the extension and TypeScript never rewrites import paths.
- `process.argv` is everything typed: `["node", "index.ts", "hello"]`.
- `.command(name).description(...).action(fn)` registers a command.
- `program.action(...)` is the fallback when no command is typed.
- The program is named `ray-cli` everywhere: one consistent name in `.name(...)`,
  the help screen and the banner.
- `build` and `start` scripts were deliberately left out for now.

## Try it
```
pnpm dev hello
pnpm dev goodbye
pnpm dev --help
pnpm dev --version
```

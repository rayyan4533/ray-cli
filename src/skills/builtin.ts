// ray-cli's own skills. Same format as a skill file on disk, so you can copy one
// into .ray/skills/ (project) or ~/.ray-cli/skills/ (personal) and change it.
// A file with the same name overrides the built-in one.
export const BUILTIN_SKILLS: Record<string, string> = {
  bugfix: `---
name: bugfix
description: Fix something that is broken, crashing or giving a wrong result
keywords: bug, crash, crashes, error, errors, broken, fail, fails, failing, exception, fix, wrong, doesn't work, not working, undefined, null
---
1. Reproduce or pin down the bug first: find the exact input and the exact wrong behaviour.
2. Find the root cause, not just the place where it shows up. Say what the cause is.
3. Make the smallest change that fixes the cause. Do not refactor or tidy unrelated code.
4. Check nearby code for the same mistake.
5. Explain in one or two sentences what was wrong and why the fix works.`,

  feature: `---
name: feature
description: Add new behaviour, a new function, command, option or file
keywords: add, create, implement, new, build, support, introduce, make a, write a
---
1. Read the code around where the feature belongs, and follow its style and naming.
2. Build only what was asked. No extra options, no speculative features.
3. Reuse existing helpers instead of writing new copies.
4. Handle obvious edge cases (empty input, missing values) for the new code.
5. Say which files you changed and how to try the feature.`,

  refactor: `---
name: refactor
description: Restructure, rename or clean up code without changing what it does
keywords: refactor, clean up, cleanup, rename, restructure, simplify, reorganize, extract, move, tidy, deduplicate
---
1. Behaviour must not change: same inputs, same outputs, same errors.
2. Work in small steps; keep the code compiling after each step.
3. Update every caller when you rename or move something.
4. Do not mix in bug fixes or new features; mention them instead.
5. Summarise what moved or was renamed.`,

  explain: `---
name: explain
description: Answer a question or explain code, without changing anything
keywords: what, why, how, explain, describe, where, which, understand, meaning, difference, ?
---
1. Do not edit any files. Read what you need to answer.
2. Answer in plain words first, then point to the exact files and functions.
3. Use a short example when it helps.
4. If you are unsure, say so instead of guessing.`,
};

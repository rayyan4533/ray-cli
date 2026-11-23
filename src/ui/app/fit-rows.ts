import { stripVTControlCharacters } from "node:util";

export type Fitted = {
  lines: string[]; // what to draw
  newerBelow: number; // lines hidden below because you scrolled up
  maxScroll: number; // how far up you can scroll
};

// The transcript keeps whole messages, but the screen has rows. One message can be
// many rows: it may contain "\n", and a long line wraps onto the next row.
// `scroll` = how many lines up from the bottom you have scrolled (0 = newest).
export function fitRows(messages: string[], rows: number, width: number, scroll = 0): Fitted {
  const all = messages.flatMap((m) => m.split("\n"));
  const usableWidth = Math.max(width, 10);
  // Colour codes take no space on screen, so measure the plain text.
  const height = (line: string) =>
    Math.max(1, Math.ceil(stripVTControlCharacters(line).length / usableWidth));

  const maxScroll = Math.max(0, all.length - 1);
  const offset = Math.min(Math.max(scroll, 0), maxScroll);
  const end = all.length - offset; // draw lines before this index

  const shown: string[] = [];
  let used = 0;
  for (let i = end - 1; i >= 0; i--) {
    const needed = height(all[i]!);
    if (used + needed > rows) break;
    shown.unshift(all[i]!);
    used += needed;
  }
  return { lines: shown, newerBelow: offset, maxScroll };
}

import { useEffect, useRef } from "react";
import { useStdin, useStdout } from "ink";

export type MouseButton = "left" | "wheel-up" | "wheel-down" | "other";

export type MouseEvent = {
  x: number; // 0-based column
  y: number; // 0-based row
  button: MouseButton;
};

// Turn on mouse reporting (1000) in SGR format (1006), and back off.
const MOUSE_ON = "\x1b[?1000h\x1b[?1006h";
const MOUSE_OFF = "\x1b[?1006l\x1b[?1000l";

// SGR mouse report: ESC [ < button ; column ; row  then M (press) or m (release)
const SGR_MOUSE = /\x1b\[<(\d+);(\d+);(\d+)([Mm])/g;

function toButton(code: number): MouseButton {
  if (code === 0) return "left";
  if (code === 64) return "wheel-up";
  if (code === 65) return "wheel-down";
  return "other";
}

export function useMouse(onEvent: (event: MouseEvent) => void): void {
  const { stdin } = useStdin();
  const { stdout } = useStdout();

  // Always call the latest handler without re-subscribing on every render.
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    const turnOff = () => stdout.write(MOUSE_OFF);
    stdout.write(MOUSE_ON);
    // If the process dies without unmounting, still give the terminal its mouse back.
    process.once("exit", turnOff);

    const onData = (data: Buffer | string) => {
      for (const match of String(data).matchAll(SGR_MOUSE)) {
        if (match[4] === "m") continue; // ignore button releases
        handlerRef.current({
          x: Number(match[2]) - 1,
          y: Number(match[3]) - 1,
          button: toButton(Number(match[1])),
        });
      }
    };

    stdin.on("data", onData);
    return () => {
      stdin.removeListener("data", onData);
      process.removeListener("exit", turnOff);
      turnOff();
    };
  }, [stdin, stdout]);
}

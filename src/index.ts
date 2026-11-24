import { createCli } from "./cli.js";
import { fmt } from "./ui/format.js";

// The SDK warns that auto-allowed tools (Read, Glob, …) skip canUseTool and advises a
// PreToolUse hook. ray already has one (the guardrails, Chapter 16), so that one warning
// is only noise, and printed mid-screen it breaks the full-screen UI. Others still show.
const HANDLED_WARNINGS = new Set(["CLAUDE_SDK_CAN_USE_TOOL_SHADOWED"]);
process.removeAllListeners("warning");
process.on("warning", (warning: Error & { code?: string }) => {
  if (warning.code && HANDLED_WARNINGS.has(warning.code)) return;
  console.error(`${warning.name}: ${warning.message}`);
});

createCli()
  .parseAsync(process.argv)
  .catch((error: unknown) => {
    if (error instanceof Error && error.name === "ExitPromptError") {
      process.exit(0); // Ctrl+C at a prompt: leave quietly
    }
    console.error(fmt.error(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  });
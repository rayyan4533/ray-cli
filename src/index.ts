import { createCli } from "./cli.js";
import { fmt } from "./ui/format.js";

createCli()
  .parseAsync(process.argv)
  .catch((error: unknown) => {
    if (error instanceof Error && error.name === "ExitPromptError") {
      process.exit(0); // Ctrl+C at a prompt: leave quietly
    }
    console.error(fmt.error(error instanceof Error ? error.message : String(error)));
    process.exit(1);
  });
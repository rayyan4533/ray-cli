import { Command } from "commander";
import { printBanner } from "./ui/banner.js";
import { startSpinner, stopSpinner } from "./ui/spinner.js";
import { fmt } from "./ui/format.js";
import { checkEnvironment, requireApiKey } from "./config/env.js";
import { runQuery } from "./agent/run-query.js";
import { parseCliMode, type CliMode } from "./agent/modes.js";
import { startChat } from "./commands/chat.js";


function parseMode(value: string): CliMode {
  const mode = parseCliMode(value);
  if (!mode) {
    throw new Error(`Invalid mode "${value}". Use agent, ask, or plan.`);
  }
  return mode;
}



export function createCli() {
  const program = new Command()
    .name("ray-cli")
    .description("Learn the Claude Agent SDK through a Cursor-like CLI")
    .version("0.1.0");

  program
    .command("hello")
    .description("Print a greeting")
    .action(() => {
      console.log("Hello Rayyan");
    });


  program
    .command("goodbye")
    .description("prints a goodbye username")
    .action(() => {
      console.log("goodbye Rayyan")
    })

     program
    .command("talk")
    .description("Send one prompt to the agent")
    .argument("<prompt>", "The prompt to send to the agent")
    .option("-m, --mode <mode>", "agent | ask | plan", "agent")
    .option("-v, --verbose", "Show full raw messages", false)
    .action(async (prompt: string, opts: { mode: string; verbose: boolean }) => {
      requireApiKey();
      await runQuery(prompt, { mode: parseMode(opts.mode), verbose: opts.verbose });
    });

  program
    .command("banner")
    .description("Show the welcome banner")
    .action(() => {
      printBanner();
    });

  program.action(() => {
    program.help();
  });

    program
    .command("chat")
    .description("Interactive chat session")
    .option("-m, --mode <mode>", "agent | ask | plan", "agent")
    .option("-v, --verbose", "Show message types", false)
    .action(async (opts: { mode: string; verbose: boolean }) => {
      requireApiKey();
      await startChat({ mode: parseMode(opts.mode), verbose: opts.verbose });
    });

  program
    .command("spin")
    .description("Spinner demo")
    .action(async () => {
      startSpinner("Thinking…");
      await new Promise((resolve) => setTimeout(resolve, 2000));
      stopSpinner();
      console.log(fmt.success("Done"));
    });

  program
    .command("doctor")
    .description("Check environment is ready")
    .action(async () => {
      await checkEnvironment();
    });

  program
    .command("whoami")
    .description("Show the end of your API key")
    .action(() => {
      const key = requireApiKey();
      console.log(`API key ends with ...${key.slice(-4)}`);
    });

  return program;
}

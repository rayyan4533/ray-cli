import { input } from "@inquirer/prompts";
import { createSession, type AgentSession } from "../agent/create-session.js";
import { handleMessage } from "../agent/message-handler.js";
import {
  cliModeToPermissionMode,
  parseCliMode,
  type CliMode,
} from "../agent/modes.js";
import { SLASH_COMMANDS } from "../config/constants.js";
import { fmt } from "../ui/format.js";
import { startSpinner, stopSpinner } from "../ui/spinner.js";

export type ChatOptions = {
  mode?: CliMode;
  verbose?: boolean;
};

type SlashResult = "not-slash" | "handled" | "exit";

function printSlashHelp(): void {
  console.log(fmt.label("\nSlash commands:"));
  for (const { command, description } of SLASH_COMMANDS) {
    console.log(fmt.dim(`  ${command.padEnd(22)} ${description}`));
  }
  console.log();
}

async function handleSlashCommand(
  line: string,
  session: AgentSession
): Promise<SlashResult> {
  if (!line.startsWith("/")) return "not-slash";
  const [command, arg] = line.split(/\s+/);

  switch (command) {
    case "/help":
      printSlashHelp();
      return "handled";

    case "/exit":
      return "exit";

    case "/context": {
      try {
        const usage = await session.query.getContextUsage();
        console.log(fmt.system(JSON.stringify(usage, null, 2)));
      } catch {
        console.log(fmt.error("Context usage not available for this session."));
      }
      return "handled";
    }

    case "/mode": {
      const newMode = arg ? parseCliMode(arg) : null;
      if (!newMode) {
        console.log(fmt.error("Usage: /mode agent|ask|plan"));
        return "handled";
      }
      await session.query.setPermissionMode(cliModeToPermissionMode(newMode));
      session.mode = newMode;
      console.log(fmt.mode(`Mode switched to ${newMode}`));
      return "handled";
    }

    default:
      console.log(fmt.error(`Unknown command: ${command}. Type /help.`));
      return "handled";
  }
}

function createTurnGate() {
  let pending: Promise<void> | null = null;
  let resolvePending: (() => void) | null = null;

  return {
    get active(): boolean {
      return pending !== null;
    },
    begin(): void {
      if (pending) return;
      pending = new Promise<void>((resolve) => {
        resolvePending = resolve;
      });
    },
    finish(): void {
      resolvePending?.();
      resolvePending = null;
      pending = null;
    },
    async wait(): Promise<void> {
      if (pending) await pending;
    },
  };
}

export async function startChat(options: ChatOptions = {}): Promise<void> {
  const { mode: initialMode = "agent", verbose = false } = options;
  const session = createSession(initialMode);
  const turnGate = createTurnGate();
  let ended = false;

  console.log(fmt.mode(`Chat started in ${initialMode} mode`));
  printSlashHelp();

  const processing = (async () => {
    try {
      for await (const message of session.query) {
        handleMessage(message, { verbose });
        if (message.type === "result") {
          turnGate.finish();
        } else if (turnGate.active) {
          startSpinner("Agent working…");
        }
      }
    } catch (error) {
      stopSpinner();
      console.error(
        fmt.error(`Session error: ${error instanceof Error ? error.message : String(error)}`)
      );
    } finally {
      ended = true;
      turnGate.finish();
    }
  })();

  while (!ended) {
    await turnGate.wait();
    stopSpinner();
    if (ended) break;

    let line: string;
    try {
      line = (await input({ message: fmt.label("You:") })).trim();
    } catch {
      break; // Ctrl+C
    }
    if (!line) continue;

    const slash = await handleSlashCommand(line, session);
    if (slash === "exit") break;
    if (slash === "handled") continue;

    turnGate.begin();
    startSpinner("Agent working…");
    session.inputQueue.push(line);
  }

  session.inputQueue.close();
  session.query.close();
  await processing;
  stopSpinner();
  console.log(fmt.dim("Session ended."));
}
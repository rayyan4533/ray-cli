import { input } from "@inquirer/prompts";
import { createSession, type AgentSession } from "../agent/create-session.js";
import { handleMessage } from "../agent/message-handler.js";
import {
  cliModeToPermissionMode,
  parseCliMode,
  type CliMode,
} from "../agent/modes.js";
import { SLASH_COMMANDS } from "../config/constants.js";
import { DEFAULT_MODEL, MODEL_IDS, parseModelId, type ModelId } from "../config/models.js";
import { fmt } from "../ui/format.js";
import { startSpinner, stopSpinner } from "../ui/spinner.js";

import { listProjectSessions, printSessions, renameProjectSession } from "../agent/sessions.js";

export type ChatOptions = {
  mode?: CliMode;
  model?: ModelId;
  verbose?: boolean;
  resume?: string;
  continueLast?: boolean;
};

export type SlashResult = "not-slash" | "handled" | "exit";

type Print = (line: string) => void;

function printSlashHelp(print: Print): void {
  print(fmt.label("\nSlash commands:"));
  for (const { command, description } of SLASH_COMMANDS) {
    print(fmt.dim(`  ${command.padEnd(22)} ${description}`));
  }
  print("");
}

export async function handleSlashCommand(
  line: string,
  session: AgentSession,
  print: Print = console.log
): Promise<SlashResult> {
  if (!line.startsWith("/")) return "not-slash";
  const [command, ...rest] = line.split(/\s+/);
  const arg = rest.join(" ");

  switch (command) {
    case "/help":
      printSlashHelp(print);
      return "handled";

    case "/exit":
      return "exit";

    case "/context": {
      try {
        const usage = await session.query.getContextUsage();
        print(fmt.system(JSON.stringify(usage, null, 2)));
      } catch {
        print(fmt.error("Context usage not available for this session."));
      }
      return "handled";
    }

    case "/mode": {
      const newMode = arg ? parseCliMode(arg) : null;
      if (!newMode) {
        print(fmt.error("Usage: /mode agent|ask|plan"));
        return "handled";
      }
      await session.query.setPermissionMode(cliModeToPermissionMode(newMode));
      session.mode = newMode;
      print(fmt.mode(`Mode switched to ${newMode}`));
      return "handled";
    }

    case "/model": {
      if (!arg) {
        print(fmt.mode(`Current model: ${session.model}`));
        print(fmt.dim(`Choices: ${MODEL_IDS.join(", ")}`));
        return "handled";
      }
      const newModel = parseModelId(arg);
      if (!newModel) {
        print(fmt.error(`Unknown model "${arg}". Choices: ${MODEL_IDS.join(", ")}`));
        return "handled";
      }
      await session.query.setModel(newModel);
      session.model = newModel;
      print(fmt.mode(`Model switched to ${newModel}`));
      return "handled";
    }

    case "/sessions": {
      printSessions(await listProjectSessions());
      return "handled";
    }

    case "/rename": {
      if (!session.id) {
        print(fmt.error("Send a message first. The session is saved after the first turn."));
        return "handled";
      }
      if (!arg) {
        print(fmt.error("Usage: /rename <title>"));
        return "handled";
      }
      await renameProjectSession(session.id, arg);
      print(fmt.mode(`Session renamed to "${arg}"`));
      return "handled";
    }

    default:
      print(fmt.error(`Unknown command: ${command}. Type /help.`));
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
  const {
    mode: initialMode = "agent",
    model = DEFAULT_MODEL,
    verbose = false,
    resume,
    continueLast = false,
  } = options;
  const session = createSession(initialMode, model, { resume, continueLast });
  const turnGate = createTurnGate();
  let ended = false;

  const resuming = resume ? ` · resuming ${resume.slice(0, 8)}` : continueLast ? " · continuing last" : "";
  console.log(fmt.mode(`Chat started in ${initialMode} mode · ${model}${resuming}`));
  printSlashHelp(console.log);

  const processing = (async () => {
    try {
      for await (const message of session.query) {
        if (message.type === "system" && message.subtype === "init") {
          session.id = message.session_id;
        }
        handleMessage(message, { verbose, model: session.model });
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
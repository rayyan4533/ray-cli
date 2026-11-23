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
import { contextDetails, contextSummary } from "../agent/context.js";
import { MEMORY_FILES, addMemory, forgetMemory, listMemory } from "../agent/memory.js";
import { RunTracker } from "../quality/signals.js";
import { formatChecks, gitChangedFiles, runChecks } from "../quality/checks.js";
import { finishRun } from "../quality/report.js";

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
    print(fmt.dim(`  ${command.padEnd(28)} ${description}`));
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
        for (const line of contextDetails(usage)) print(line);
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

    case "/remember": {
      const personal = rest[0] === "personal";
      const text = (personal ? rest.slice(1) : rest).join(" ").trim();
      if (!text) {
        print(fmt.error("Usage: /remember [personal] <text>"));
        return "handled";
      }
      const scope = personal ? "personal" : "project";
      addMemory(text, scope);
      print(fmt.mode(`Remembered (${scope}): ${text}`));
      print(fmt.dim(`  Saved to ${MEMORY_FILES[scope]} · used from the next session`));
      return "handled";
    }

    case "/memory": {
      const items = listMemory();
      if (items.length === 0) {
        print(fmt.dim("No memories yet. Add one with /remember <text>."));
        return "handled";
      }
      print(fmt.label("\nMemory:"));
      items.forEach((m, i) => print(`  ${fmt.system(String(i + 1).padStart(2))}. ${fmt.dim(`[${m.scope}]`)} ${m.text}`));
      print(fmt.dim("  Remove one with /forget <number>\n"));
      return "handled";
    }

    case "/forget": {
      const n = Number(arg);
      const removed = Number.isInteger(n) && n > 0 ? forgetMemory(n) : null;
      print(removed ? fmt.mode(`Forgot (${removed.scope}): ${removed.text}`) : fmt.error("Usage: /forget <number from /memory>"));
      return "handled";
    }

    case "/checks": {
      const files = await gitChangedFiles();
      print(fmt.dim(`Running checks (${files.length} changed file(s) in git)…`));
      for (const line of formatChecks(await runChecks(files))) print(line);
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
  const tracker = new RunTracker();
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
        const summary = tracker.observe(message);
        if (summary) {
          await finishRun(summary, { mode: session.mode, model: session.model }, console.log);
        }
        if (message.type === "result") {
          try {
            console.log(contextSummary(await session.query.getContextUsage()));
          } catch {
            // context usage is a nice-to-have; never break the chat over it
          }
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
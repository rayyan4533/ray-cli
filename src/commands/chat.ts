import { confirm, input, select } from "@inquirer/prompts";
import { createSession, type AgentSession } from "../agent/create-session.js";
import { handleMessage } from "../agent/message-handler.js";
import {
  cliModeToPermissionMode,
  parseCliMode,
  type CliMode,
} from "../agent/modes.js";
import { SLASH_COMMANDS } from "../config/constants.js";
import {
  DEFAULT_CHOICE,
  MODEL_CHOICES,
  choiceLabel,
  findModel,
  parseModelChoice,
  type ModelChoice,
} from "../config/models.js";
import { fmt } from "../ui/format.js";
import { startSpinner, stopSpinner } from "../ui/spinner.js";

import { listProjectSessions, printSessions, renameProjectSession } from "../agent/sessions.js";
import { contextDetails, contextSummary } from "../agent/context.js";
import { MEMORY_FILES, addMemory, forgetMemory, listMemory } from "../agent/memory.js";
import { formatChecks, gitChangedFiles, runChecks } from "../quality/checks.js";
import { TaskController, applyModelChoice } from "../agent/task-controller.js";
import { parsePlanCommand } from "../agent/routing.js";
import { APPROVAL_CHOICES, type ApprovalLevel } from "../agent/permissions.js";
import { parseRate, rateLastRun, rateUsage } from "../quality/rating.js";
import { statsReport } from "../quality/stats.js";
import { suggestRules } from "../quality/improve.js";

export type ChatOptions = {
  mode?: CliMode;
  model?: ModelChoice;
  verbose?: boolean;
  resume?: string;
  continueLast?: boolean;
};

export type SlashResult = "not-slash" | "handled" | "exit";

type Print = (line: string) => void;
// Ask the user a yes/no question (inquirer in chat, the y/n bar in the UI).
export type AskYesNo = (question: string) => Promise<boolean>;

const askInTerminal: AskYesNo = (question) => confirm({ message: question, default: true });

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
  print: Print = console.log,
  askYesNo: AskYesNo = askInTerminal
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
        print(fmt.mode(`Current model: ${choiceLabel(session.choice)} (running ${session.model})`));
        print(fmt.dim(`Choices: ${MODEL_CHOICES.join(", ")}`));
        return "handled";
      }
      const choice = parseModelChoice(arg) ?? findModel(arg);
      if (!choice) {
        print(fmt.error(`Unknown model "${arg}". Choices: ${MODEL_CHOICES.join(", ")}`));
        return "handled";
      }
      await applyModelChoice(session, choice);
      print(fmt.mode(`Model set to ${choiceLabel(choice)}`));
      if (choice !== "optimized") print(fmt.dim("  Escalation is off while you pick a model yourself."));
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

    case "/rate": {
      const parsed = parseRate(rest);
      if (!parsed) {
        for (const l of rateUsage()) print(l);
        return "handled";
      }
      print(rateLastRun(parsed.score, parsed.reason, parsed.note));
      return "handled";
    }

    case "/stats": {
      for (const l of statsReport(rest.includes("--all"))) print(l);
      return "handled";
    }

    case "/improve": {
      print(fmt.dim("Reading your 👎 runs and asking claude-sonnet-5-5 for rules…"));
      const { rules, costUsd, looked } = await suggestRules();
      if (looked === 0) {
        print(fmt.dim("No 👎 runs in this project yet. Rate some runs first (🙂 or /rate bad …)."));
        return "handled";
      }
      print(fmt.dim(`Looked at ${looked} 👎 run(s) · $${costUsd.toFixed(3)}`));
      if (rules.length === 0) {
        print(fmt.dim("No rule is clearly supported by those runs yet."));
        return "handled";
      }
      let added = 0;
      for (const rule of rules) {
        if (await askYesNo(`Add to RAY.md: "${rule}"?`)) {
          addMemory(rule, "project");
          added++;
        }
      }
      print(fmt.mode(`Added ${added} rule(s) to RAY.md · used from the next session`));
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
    model = DEFAULT_CHOICE,
    verbose = false,
    resume,
    continueLast = false,
  } = options;
  const session = createSession(initialMode, model, { resume, continueLast });
  const turnGate = createTurnGate();
  const controller = new TaskController(session, {
    print: console.log,
    choosePlanRun: () => {
      stopSpinner();
      return select<ApprovalLevel | null>({
        message: "Approve this plan? How should ray build it?",
        choices: [
          ...APPROVAL_CHOICES.map((c) => ({ name: c.label, value: c.level })),
          { name: "Don't build (discard the plan)", value: null },
        ],
        default: "edits",
      });
    },
  });
  let ended = false;

  const resuming = resume ? ` · resuming ${resume.slice(0, 8)}` : continueLast ? " · continuing last" : "";
  console.log(fmt.mode(`Chat started in ${initialMode} mode · ${choiceLabel(model)}${resuming}`));
  printSlashHelp(console.log);

  const processing = (async () => {
    try {
      for await (const message of session.query) {
        if (message.type === "system" && message.subtype === "init") {
          session.id = message.session_id;
        }
        handleMessage(message, { verbose, model: session.model });
        const taskDone = await controller.observe(message);
        if (taskDone) {
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

    if (line === "/plan" || line.startsWith("/plan ")) {
      const parsed = parsePlanCommand(line, findModel);
      if ("error" in parsed) {
        console.log(fmt.error(parsed.error));
        continue;
      }
      turnGate.begin();
      await controller.plan(parsed.task, parsed.planner);
      startSpinner("Planning…");
      continue;
    }

    const slash = await handleSlashCommand(line, session);
    if (slash === "exit") break;
    if (slash === "handled") continue;

    turnGate.begin();
    startSpinner("Agent working…");
    await controller.send(line);
  }

  session.inputQueue.close();
  session.query.close();
  await processing;
  stopSpinner();
  console.log(fmt.dim("Session ended."));
}
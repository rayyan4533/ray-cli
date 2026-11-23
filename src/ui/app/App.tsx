import { useEffect, useRef, useState, type RefObject } from "react";
import { Box, Text, measureElement, useApp, useInput, useWindowSize, type DOMElement } from "ink";
import TextInput from "ink-text-input";
import type { SDKSessionInfo } from "@anthropic-ai/claude-agent-sdk";
import { createSession, type AgentSession } from "../../agent/create-session.js";
import { formatMessage } from "../../agent/message-handler.js";
import { cliModeToPermissionMode, type CliMode } from "../../agent/modes.js";
import { listProjectSessions, loadHistory, renameProjectSession } from "../../agent/sessions.js";
import { MODELS, MODEL_CHOICES, OPTIMIZED, choiceLabel, findModel, type ModelChoice } from "../../config/models.js";
import { CLI_MODES, MODE_DESCRIPTIONS } from "../../config/constants.js";
import { handleSlashCommand } from "../../commands/chat.js";
import { fmt } from "../format.js";
import { contextSummary } from "../../agent/context.js";
import { TaskController, headerModel } from "../../agent/task-controller.js";
import { parsePlanCommand } from "../../agent/routing.js";
import { DROPDOWN_LIST_OFFSET, Dropdown, type DropdownItem } from "./Dropdown.js";
import { APPROVAL_CHOICES, type ApprovalLevel } from "../../agent/permissions.js";
import { PANEL_LIST_OFFSET, PANEL_WIDTH, SessionsPanel, panelWindow } from "./SessionsPanel.js";
import { useMouse } from "./use-mouse.js";
import { AVATAR_ROWS, Avatar } from "./Avatar.js";
import { fitRows } from "./fit-rows.js";

// A yes/no question waiting at the bottom: a tool approval or "approve this plan?".
type Approval = {
  question: string;
  yes: string; // printed after y
  no: string; // printed after n
  resolve: (approved: boolean) => void;
};

// After a plan: pick 1-3 for how to build, or 4 / n to discard.
type PlanChoice = { resolve: (level: ApprovalLevel | null) => void };

// The two header dropdowns.
type MenuKind = "mode" | "model";

const MODE_ITEMS: DropdownItem<CliMode>[] = CLI_MODES.map((m) => ({
  value: m,
  label: m,
  note: MODE_DESCRIPTIONS[m],
}));

const MODEL_ITEMS: DropdownItem<ModelChoice>[] = MODEL_CHOICES.map((c) => ({
  value: c,
  label: choiceLabel(c),
  note: c === OPTIMIZED ? "Haiku first, stronger only when checks fail" : (MODELS.find((m) => m.id === c)?.note ?? ""),
}));

const MENU_WIDTH: Record<MenuKind, number> = { mode: 60, model: 72 };

type Status = { mode: CliMode; model: string; id: string | null };

export type AppProps = {
  mode: CliMode;
  model: ModelChoice;
  resume?: string;
};

export function App({ mode, model, resume }: AppProps) {
  const { exit } = useApp();
  const { rows, columns } = useWindowSize();

  const [lines, setLines] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [approval, setApproval] = useState<Approval | null>(null);
  const [planChoice, setPlanChoice] = useState<PlanChoice | null>(null);
  // How many lines up from the newest you have scrolled (0 = following the newest).
  const [scroll, setScroll] = useState(0);
  const maxScrollRef = useRef(0);
  const [status, setStatus] = useState<Status>({ mode, model: "", id: resume ?? null });
  const [menu, setMenu] = useState<MenuKind | null>(null); // which dropdown is open
  const [menuIndex, setMenuIndex] = useState(0);
  const [menuLeft, setMenuLeft] = useState(0); // column where the open dropdown starts
  const [panelOpen, setPanelOpen] = useState(false);
  const [sessions, setSessions] = useState<SDKSessionInfo[]>([]);
  const [panelIndex, setPanelIndex] = useState(0);
  const [renameDraft, setRenameDraft] = useState<string | null>(null);
  // Changing this closes the current agent session and opens the chosen one.
  const [contextLine, setContextLine] = useState<string | null>(null);
  const [resumeId, setResumeId] = useState<string | undefined>(resume);

  const sessionRef = useRef<AgentSession | null>(null);
  const controllerRef = useRef<TaskController | null>(null);
  // Header pieces you can click; measured when a click arrives.
  const modeLabelRef = useRef<DOMElement>(null);
  const modelLabelRef = useRef<DOMElement>(null);
  const sessionsLabelRef = useRef<DOMElement>(null);
  // Mode and model choice carry over when you switch sessions.
  const settingsRef = useRef({ mode, choice: model });

  const print = (line: string) => setLines((prev) => [...prev, line]);

  const syncStatus = (session: AgentSession) => {
    settingsRef.current = { mode: session.mode, choice: session.choice };
    setStatus({
      mode: session.mode,
      model: headerModel(session, controllerRef.current),
      id: session.id,
    });
  };

  const ask = (question: string, yes: string, no: string) =>
    new Promise<boolean>((resolve) => setApproval({ question, yes, no, resolve }));

  // One agent session per resumeId. Runs again whenever resumeId changes.
  useEffect(() => {
    let cancelled = false;
    const { mode, choice } = settingsRef.current;

    setLines([]);
    setScroll(0);
    setBusy(false);
    setContextLine(null);

    const session = createSession(mode, choice, {
      resume: resumeId,
      ask: (toolName, preview) =>
        ask(
          `Allow ${toolName}? ${fmt.dim(preview.replace(/\s+/g, " ").slice(0, 60))}`,
          `  Allowed ${toolName}`,
          `  Denied ${toolName}`
        ),
    });
    const controller = new TaskController(session, {
      print: (line) => !cancelled && print(line),
      choosePlanRun: () => new Promise((resolve) => setPlanChoice({ resolve })),
      onChange: () => !cancelled && syncStatus(session),
    });
    sessionRef.current = session;
    controllerRef.current = controller;
    syncStatus(session);

    if (resumeId) {
      loadHistory(resumeId)
        .then((history) => {
          if (cancelled) return;
          const divider = fmt.dim(`── resumed ${resumeId.slice(0, 8)} ──`);
          setLines((prev) => [...history, divider, ...prev]);
        })
        .catch(() => print(fmt.error("Could not load this session's history.")));
    }

    (async () => {
      try {
        for await (const message of session.query) {
          if (cancelled) return;
          if (message.type === "system" && message.subtype === "init") {
            session.id = message.session_id;
            syncStatus(session);
          }
          for (const line of formatMessage(message, { model: session.model })) print(line);
          const taskDone = await controller.observe(message);
          if (taskDone && !cancelled) {
            setBusy(false);
            session.query
              .getContextUsage()
              .then((usage) => !cancelled && setContextLine(contextSummary(usage)))
              .catch(() => {});
          }
        }
      } catch (error) {
        if (!cancelled) {
          print(fmt.error(`Session error: ${error instanceof Error ? error.message : String(error)}`));
        }
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.close();
      // A tool approval from the old session must not hang forever.
      setApproval((pending) => {
        pending?.resolve(false);
        return null;
      });
      setPlanChoice((pending) => {
        pending?.resolve(null);
        return null;
      });
      session.inputQueue.close();
      session.query.close();
    };
  }, [resumeId]);

  async function openPanel() {
    try {
      setSessions(await listProjectSessions(30));
      setPanelIndex(0);
      setRenameDraft(null);
      setPanelOpen(true);
    } catch {
      print(fmt.error("Could not list sessions."));
    }
  }

  function resumeSession(id: string) {
    setPanelOpen(false);
    if (busy) return print(fmt.error("Wait for the agent to finish before switching sessions."));
    if (id === status.id) return;
    setResumeId(id);
  }

  async function renameSession(id: string, title: string) {
    try {
      await renameProjectSession(id, title);
      setSessions(await listProjectSessions(30));
      print(fmt.mode(`Renamed to "${title}"`));
    } catch {
      print(fmt.error("Rename failed."));
    }
  }

  // Tab opens and closes the sessions panel.
  useInput(
    (_input, key) => {
      if (key.tab && !menu) togglePanel();
      if (key.pageUp) scrollBy(Math.max(middleRows - 2, 1));
      if (key.pageDown) scrollBy(-Math.max(middleRows - 2, 1));
    },
    { isActive: approval === null && planChoice === null }
  );

  // 1 / 2 / 3 picks how to build the plan; 4 or n discards it.
  useInput(
    (input) => {
      if (!planChoice) return;
      const index = Number(input) - 1;
      const picked = APPROVAL_CHOICES[index];
      if (picked) {
        print(fmt.success(`  Plan approved · ${picked.label}`));
        planChoice.resolve(picked.level);
      } else if (input === "4" || input === "n") {
        print(fmt.error("  Plan rejected"));
        planChoice.resolve(null);
      } else {
        return;
      }
      setPlanChoice(null);
    },
    { isActive: planChoice !== null }
  );

  // y / n answers a tool approval. Only active while one is waiting.
  useInput(
    (input) => {
      if (!approval || (input !== "y" && input !== "n")) return;
      const approved = input === "y";
      print(approved ? fmt.success(approval.yes) : fmt.error(approval.no));
      approval.resolve(approved);
      setApproval(null);
    },
    { isActive: approval !== null }
  );

  // Header (as tall as the avatar, no border) + bottom box take their rows; the middle gets the rest.
  // The bottom is the input (3 rows) or the plan choice (border 2 + 5 lines = 7).
  const HEADER_ROWS = AVATAR_ROWS;
  const bottomRows = planChoice ? 7 : 3;
  const middleRows = Math.max(rows - HEADER_ROWS - bottomRows, 4);

  function scrollBy(amount: number) {
    setScroll((s) => Math.min(Math.max(s + amount, 0), maxScrollRef.current));
  }

  function togglePanel() {
    setMenu(null);
    if (panelOpen) setPanelOpen(false);
    else void openPanel();
  }

  // Open a header dropdown right under its label (or close it if it is already open).
  function toggleMenu(kind: MenuKind) {
    if (menu === kind) return setMenu(null);
    if (busy) return print(fmt.error(`Wait for the agent to finish before changing the ${kind}.`));
    const session = sessionRef.current;
    if (!session) return;
    setPanelOpen(false);
    const label = kind === "mode" ? modeLabelRef.current : modelLabelRef.current;
    const x = label ? measureElement(label).x : 0;
    setMenuLeft(Math.max(0, Math.min(x, columns - MENU_WIDTH[kind])));
    setMenuIndex(
      kind === "mode"
        ? Math.max(CLI_MODES.indexOf(session.mode), 0)
        : Math.max(MODEL_CHOICES.indexOf(session.choice), 0)
    );
    setMenu(kind);
  }

  // Same as typing /mode: change the SDK permission mode and remember it.
  async function pickMode(mode: CliMode) {
    setMenu(null);
    const session = sessionRef.current;
    if (!session || session.mode === mode) return;
    await session.query.setPermissionMode(cliModeToPermissionMode(mode));
    session.mode = mode;
    syncStatus(session);
    print(fmt.mode(`Mode switched to ${mode} · ${MODE_DESCRIPTIONS[mode]}`));
  }

  async function pickModel(choice: ModelChoice) {
    setMenu(null);
    await controllerRef.current?.setChoice(choice);
    print(fmt.mode(`Model set to ${choice === "optimized" ? "⚡ optimized" : choice}`));
    if (choice !== "optimized") print(fmt.dim("  Escalation is off while you pick a model yourself."));
  }

  // Is the click inside this header piece? Measured live, so it works at any width.
  function hit(ref: RefObject<DOMElement | null>, x: number, y: number): boolean {
    if (!ref.current) return false;
    const box = measureElement(ref.current);
    return x >= box.x && x < box.x + box.width && y >= box.y && y < box.y + box.height;
  }

  // Mouse: click the header's right side to toggle the panel;
  // inside the panel, click a row to select it, click it again to resume; wheel moves.
  useMouse((event) => {
    if (approval || planChoice) return;

    if (event.y < HEADER_ROWS) {
      if (event.button !== "left") return;
      if (hit(modeLabelRef, event.x, event.y)) return toggleMenu("mode");
      if (hit(modelLabelRef, event.x, event.y)) return toggleMenu("model");
      if (hit(sessionsLabelRef, event.x, event.y)) togglePanel();
      return;
    }

    if (menu) {
      if (event.button !== "left") return;
      const count = menu === "mode" ? MODE_ITEMS.length : MODEL_ITEMS.length;
      const row = event.y - HEADER_ROWS - DROPDOWN_LIST_OFFSET;
      const inside = event.x >= menuLeft && event.x < menuLeft + MENU_WIDTH[menu];
      if (!inside || row < 0 || row >= count) return setMenu(null); // click outside closes it
      if (row !== menuIndex) return setMenuIndex(row);
      if (menu === "mode") void pickMode(MODE_ITEMS[row]!.value);
      else void pickModel(MODEL_ITEMS[row]!.value);
      return;
    }

    // The wheel over the conversation scrolls it; over the panel it moves the highlight.
    const panelLeft = columns - PANEL_WIDTH;
    const overPanel = panelOpen && event.x >= panelLeft;
    if (!overPanel) {
      if (event.button === "wheel-up") scrollBy(3);
      else if (event.button === "wheel-down") scrollBy(-3);
      return;
    }
    if (renameDraft !== null) return;

    if (event.button === "wheel-up") return setPanelIndex((i) => Math.max(i - 1, 0));
    if (event.button === "wheel-down") return setPanelIndex((i) => Math.min(i + 1, sessions.length - 1));
    if (event.button !== "left") return;

    const { start, listRows } = panelWindow(panelIndex, sessions.length, middleRows);
    const row = event.y - HEADER_ROWS - PANEL_LIST_OFFSET;
    const target = start + row;
    if (row < 0 || row >= listRows || target >= sessions.length) return;

    if (target === panelIndex) resumeSession(sessions[target]!.sessionId);
    else setPanelIndex(target);
  });

  async function submit(value: string) {
    const line = value.trim();
    setDraft("");
    setScroll(0); // jump back to the newest lines
    const session = sessionRef.current;
    if (!line || busy || !session) return;

    if (line === "/sessions") return void openPanel();
    if (line === "/model") return toggleMenu("model");
    if (line === "/mode") return toggleMenu("mode");

    print(fmt.label(`You: ${line}`));

    const controller = controllerRef.current;
    if (!controller) return;

    if (line === "/plan" || line.startsWith("/plan ")) {
      const parsed = parsePlanCommand(line, findModel);
      if ("error" in parsed) return print(fmt.error(parsed.error));
      setBusy(true);
      return void controller.plan(parsed.task, parsed.planner);
    }

    const result = await handleSlashCommand(line, session, print);
    if (result === "exit") return exit();
    if (result === "handled") return syncStatus(session);

    setBusy(true);
    await controller.send(line);
  }

  // Text area width: screen minus padding (2), minus the sessions panel when it is open.
  const textWidth = columns - 2 - (panelOpen ? PANEL_WIDTH : 0);
  // While scrolled up, one row shows how much is hidden below.
  const fitted = fitRows(lines, scroll > 0 ? middleRows - 1 : middleRows, textWidth, scroll);
  maxScrollRef.current = fitted.maxScroll;
  const shortId = status.id ? status.id.slice(0, 8) : "new";

  return (
    <Box flexDirection="column" height={rows}>
      {/* Header: avatar on the left; "ray" and the labels share one line, level with the eyes. */}
      <Box height={HEADER_ROWS} paddingX={1}>
        <Avatar />
        <Box flexGrow={1} paddingTop={1} paddingLeft={2} justifyContent="space-between">
          <Text bold color="cyan">
            ray
          </Text>
          <Box>
            <Text dimColor>{contextLine ? `${contextLine} · ` : ""}</Text>
            <Box ref={modeLabelRef}>
              <Text color="green">{status.mode} ▾</Text>
            </Box>
            <Text dimColor> · </Text>
            <Box ref={modelLabelRef}>
              <Text color={status.model.includes("planning") ? "magenta" : "yellow"}>
                {status.model} {status.model.includes("planning") ? "" : "▾"}
              </Text>
            </Box>
            <Text dimColor> · {shortId} · </Text>
            <Box ref={sessionsLabelRef}>
              <Text dimColor>{panelOpen ? "✕ close" : "☰ sessions"}</Text>
            </Box>
          </Box>
        </Box>
      </Box>

      <Box height={middleRows}>
        <Box flexDirection="column" flexGrow={1} paddingX={1} overflow="hidden">
          {fitted.lines.map((line, i) => (
            <Text key={i}>{line}</Text>
          ))}
          {fitted.newerBelow > 0 && (
            <Text color="cyan">↓ {fitted.newerBelow} newer line(s) · scroll down or PageDown</Text>
          )}
        </Box>
        {menu === "mode" && (
          <Box position="absolute" top={0} left={menuLeft}>
            <Dropdown
              title="Mode"
              items={MODE_ITEMS}
              current={sessionRef.current?.mode ?? mode}
              width={MENU_WIDTH.mode}
              index={menuIndex}
              setIndex={setMenuIndex}
              onPick={(m) => void pickMode(m)}
              onClose={() => setMenu(null)}
            />
          </Box>
        )}
        {menu === "model" && (
          <Box position="absolute" top={0} left={menuLeft}>
            <Dropdown
              title="Model"
              items={MODEL_ITEMS}
              current={sessionRef.current?.choice ?? model}
              width={MENU_WIDTH.model}
              index={menuIndex}
              setIndex={setMenuIndex}
              onPick={(c) => void pickModel(c)}
              onClose={() => setMenu(null)}
            />
          </Box>
        )}
        {panelOpen && (
          <SessionsPanel
            sessions={sessions}
            currentId={status.id}
            height={middleRows}
            index={panelIndex}
            setIndex={setPanelIndex}
            renameDraft={renameDraft}
            setRenameDraft={setRenameDraft}
            onResume={resumeSession}
            onRename={renameSession}
            onClose={() => setPanelOpen(false)}
          />
        )}
      </Box>

      {planChoice ? (
        <Box flexDirection="column" borderStyle="round" borderColor="yellow" paddingX={1}>
          <Text color="yellow">Approve this plan? How should ray build it?</Text>
          {APPROVAL_CHOICES.map((c, i) => (
            <Text key={c.level}>
              {"  "}
              {i + 1}. {c.label}
              {c.level === "all" ? fmt.dim("  (commands run without asking)") : ""}
            </Text>
          ))}
          <Text>{"  "}4. Don't build (discard the plan)</Text>
        </Box>
      ) : approval ? (
        <Box borderStyle="round" borderColor="yellow" paddingX={1}>
          <Text color="yellow">
            {approval.question} (y/n)
          </Text>
        </Box>
      ) : (
        <Box borderStyle="round" borderColor={busy ? "gray" : "green"} paddingX={1}>
          <Text color={busy ? "gray" : "green"}>{busy ? "… " : "› "}</Text>
          <TextInput
            value={draft}
            onChange={setDraft}
            onSubmit={submit}
            focus={!panelOpen && !menu}
            placeholder={busy ? "Agent working…" : "Message, /plan <task>, /help, or Tab for sessions"}
          />
        </Box>
      )}
    </Box>
  );
}

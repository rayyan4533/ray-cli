import { useEffect, useRef, useState } from "react";
import { Box, Text, useApp, useInput, useWindowSize } from "ink";
import TextInput from "ink-text-input";
import type { SDKSessionInfo } from "@anthropic-ai/claude-agent-sdk";
import { createSession, type AgentSession } from "../../agent/create-session.js";
import { formatMessage } from "../../agent/message-handler.js";
import type { CliMode } from "../../agent/modes.js";
import { listProjectSessions, loadHistory, renameProjectSession } from "../../agent/sessions.js";
import type { ModelId } from "../../config/models.js";
import { handleSlashCommand } from "../../commands/chat.js";
import { fmt } from "../format.js";
import { PANEL_LIST_OFFSET, PANEL_WIDTH, SessionsPanel, panelWindow } from "./SessionsPanel.js";
import { useMouse } from "./use-mouse.js";

type Approval = {
  toolName: string;
  preview: string;
  resolve: (approved: boolean) => void;
};

type Status = { mode: CliMode; model: ModelId; id: string | null };

export type AppProps = {
  mode: CliMode;
  model: ModelId;
  resume?: string;
};

export function App({ mode, model, resume }: AppProps) {
  const { exit } = useApp();
  const { rows, columns } = useWindowSize();

  const [lines, setLines] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [approval, setApproval] = useState<Approval | null>(null);
  const [status, setStatus] = useState<Status>({ mode, model, id: resume ?? null });
  const [panelOpen, setPanelOpen] = useState(false);
  const [sessions, setSessions] = useState<SDKSessionInfo[]>([]);
  const [panelIndex, setPanelIndex] = useState(0);
  const [renameDraft, setRenameDraft] = useState<string | null>(null);
  // Changing this closes the current agent session and opens the chosen one.
  const [resumeId, setResumeId] = useState<string | undefined>(resume);

  const sessionRef = useRef<AgentSession | null>(null);
  // Mode and model carry over when you switch sessions.
  const settingsRef = useRef({ mode, model });

  const print = (line: string) => setLines((prev) => [...prev, line]);

  const syncStatus = (session: AgentSession) => {
    settingsRef.current = { mode: session.mode, model: session.model };
    setStatus({ mode: session.mode, model: session.model, id: session.id });
  };

  // One agent session per resumeId. Runs again whenever resumeId changes.
  useEffect(() => {
    let cancelled = false;
    const { mode, model } = settingsRef.current;

    setLines([]);
    setBusy(false);

    const session = createSession(mode, model, {
      resume: resumeId,
      ask: (toolName, preview) =>
        new Promise<boolean>((resolve) => setApproval({ toolName, preview, resolve })),
    });
    sessionRef.current = session;
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
          if (message.type === "result") setBusy(false);
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
      // A tool approval from the old session must not hang forever.
      setApproval((pending) => {
        pending?.resolve(false);
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
      if (key.tab) togglePanel();
    },
    { isActive: approval === null }
  );

  // y / n answers a tool approval. Only active while one is waiting.
  useInput(
    (input) => {
      if (!approval || (input !== "y" && input !== "n")) return;
      const approved = input === "y";
      print(approved ? fmt.success(`  Allowed ${approval.toolName}`) : fmt.error(`  Denied ${approval.toolName}`));
      approval.resolve(approved);
      setApproval(null);
    },
    { isActive: approval !== null }
  );

  // Header (3 rows) + input box (3 rows) take 6 rows; the middle gets the rest.
  const HEADER_ROWS = 3;
  const middleRows = Math.max(rows - 6, 4);

  function togglePanel() {
    if (panelOpen) setPanelOpen(false);
    else void openPanel();
  }

  // Mouse: click the header's right side to toggle the panel;
  // inside the panel, click a row to select it, click it again to resume; wheel moves.
  useMouse((event) => {
    if (approval) return;

    if (event.y < HEADER_ROWS) {
      if (event.button === "left" && event.x >= columns / 2) togglePanel();
      return;
    }

    const panelLeft = columns - PANEL_WIDTH;
    if (!panelOpen || renameDraft !== null || event.x < panelLeft) return;

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
    const session = sessionRef.current;
    if (!line || busy || !session) return;

    if (line === "/sessions") return void openPanel();

    print(fmt.label(`You: ${line}`));

    const result = await handleSlashCommand(line, session, print);
    if (result === "exit") return exit();
    if (result === "handled") return syncStatus(session);

    setBusy(true);
    session.inputQueue.push(line);
  }

  const visible = lines.slice(-middleRows);
  const shortId = status.id ? status.id.slice(0, 8) : "new";

  return (
    <Box flexDirection="column" height={rows}>
      <Box borderStyle="round" borderColor="cyan" paddingX={1} justifyContent="space-between">
        <Text bold color="cyan">
          ray-cli
        </Text>
        <Text dimColor>
          {status.mode} · {status.model} · {shortId} · {panelOpen ? "✕ close" : "☰ sessions"}
        </Text>
      </Box>

      <Box height={middleRows}>
        <Box flexDirection="column" flexGrow={1} paddingX={1} overflow="hidden">
          {visible.map((line, i) => (
            <Text key={i}>{line}</Text>
          ))}
        </Box>
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

      {approval ? (
        <Box borderStyle="round" borderColor="yellow" paddingX={1}>
          <Text color="yellow">
            Allow {approval.toolName}? {fmt.dim(approval.preview.replace(/\s+/g, " ").slice(0, 60))} (y/n)
          </Text>
        </Box>
      ) : (
        <Box borderStyle="round" borderColor={busy ? "gray" : "green"} paddingX={1}>
          <Text color={busy ? "gray" : "green"}>{busy ? "… " : "› "}</Text>
          <TextInput
            value={draft}
            onChange={setDraft}
            onSubmit={submit}
            focus={!panelOpen}
            placeholder={busy ? "Agent working…" : "Message, /help, or Tab for sessions"}
          />
        </Box>
      )}
    </Box>
  );
}

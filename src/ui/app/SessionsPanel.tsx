import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import type { SDKSessionInfo } from "@anthropic-ai/claude-agent-sdk";
import { sessionTitle, timeAgo } from "../../agent/sessions.js";

export const PANEL_WIDTH = 38;
// Rows above the first session inside the panel: top border + "Sessions" title.
export const PANEL_LIST_OFFSET = 2;

// Which slice of the list is on screen, keeping the selected row roughly centered.
export function panelWindow(index: number, total: number, height: number) {
  // Border (2) + title (1) + help line (1) leave this many rows for sessions.
  const listRows = Math.max(height - 4, 1);
  const start = Math.max(0, Math.min(index - Math.floor(listRows / 2), total - listRows));
  return { start, listRows };
}

type Props = {
  sessions: SDKSessionInfo[];
  currentId: string | null;
  height: number;
  index: number;
  setIndex: (update: (i: number) => number) => void;
  renameDraft: string | null;
  setRenameDraft: (value: string | null) => void;
  onResume: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onClose: () => void;
};

export function SessionsPanel({
  sessions,
  currentId,
  height,
  index,
  setIndex,
  renameDraft,
  setRenameDraft,
  onResume,
  onRename,
  onClose,
}: Props) {
  const selected = sessions[index];
  const renaming = renameDraft !== null;

  // Moving around the list (off while renaming, so typing "r" doesn't trigger it).
  useInput(
    (input, key) => {
      if (key.upArrow) setIndex((i) => Math.max(i - 1, 0));
      else if (key.downArrow) setIndex((i) => Math.min(i + 1, sessions.length - 1));
      else if (key.return && selected) onResume(selected.sessionId);
      else if (input === "r" && selected) setRenameDraft(sessionTitle(selected));
      else if (key.escape) onClose();
    },
    { isActive: !renaming }
  );

  // Esc cancels a rename.
  useInput(
    (_input, key) => {
      if (key.escape) setRenameDraft(null);
    },
    { isActive: renaming }
  );

  function submitRename(value: string) {
    const title = value.trim();
    if (title && selected) onRename(selected.sessionId, title);
    setRenameDraft(null);
  }

  const { start, listRows } = panelWindow(index, sessions.length, height);
  const shown = sessions.slice(start, start + listRows);

  return (
    <Box
      flexDirection="column"
      width={PANEL_WIDTH}
      height={height}
      borderStyle="round"
      borderColor="magenta"
      paddingX={1}
    >
      <Text bold color="magenta">
        Sessions
      </Text>

      <Box flexDirection="column" flexGrow={1}>
        {sessions.length === 0 && <Text dimColor>No sessions yet</Text>}
        {shown.map((s, i) => {
          const isSelected = start + i === index;
          const marker = s.sessionId === currentId ? "● " : "  ";

          if (isSelected && renaming) {
            return (
              <Box key={s.sessionId}>
                <Text color="yellow">✎ </Text>
                <TextInput value={renameDraft} onChange={setRenameDraft} onSubmit={submitRename} />
              </Box>
            );
          }

          return (
            <Box key={s.sessionId} justifyContent="space-between">
              <Text inverse={isSelected} wrap="truncate-end">
                {marker}
                {sessionTitle(s)}
              </Text>
              <Text dimColor> {timeAgo(s.lastModified)}</Text>
            </Box>
          );
        })}
      </Box>

      <Text dimColor wrap="truncate-end">
        {renaming ? "⏎ save · esc cancel" : "click/↑↓ · ⏎ resume · r rename"}
      </Text>
    </Box>
  );
}

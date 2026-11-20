import { query, type Query } from "@anthropic-ai/claude-agent-sdk";
import { buildModeOptions, type CliMode } from "./modes.js";
import { InputQueue } from "./input-queue.js";
import type { ModelId } from "../config/models.js";
import type { AskApproval } from "./permissions.js";

export type AgentSession = {
  query: Query;
  inputQueue: InputQueue;
  mode: CliMode;
  model: ModelId;
  id: string | null;
};

export type ResumeSettings = {
  resume?: string;
  continueLast?: boolean;
  ask?: AskApproval;
};

export function createSession(
  initialMode: CliMode,
  model: ModelId,
  resumeSettings: ResumeSettings = {}
): AgentSession {
  const inputQueue = new InputQueue();
  const agentQuery = query({
    prompt: inputQueue.generator(),
    options: buildModeOptions({
      mode: initialMode,
      model,
      getMode: () => session.mode,
      ...resumeSettings,
    }),
  });

  const session: AgentSession = {
    query: agentQuery,
    inputQueue,
    mode: initialMode,
    model,
    id: resumeSettings.resume ?? null,
  };
  return session;
}

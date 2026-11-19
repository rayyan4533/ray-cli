import { query, type Query } from "@anthropic-ai/claude-agent-sdk";
import { buildModeOptions, type CliMode } from "./modes.js";
import { InputQueue } from "./input-queue.js";
import type { ModelId } from "../config/models.js";

export type AgentSession = {
  query: Query;
  inputQueue: InputQueue;
  mode: CliMode;
  model: ModelId;
};

export function createSession(initialMode: CliMode, model: ModelId): AgentSession {
  const inputQueue = new InputQueue();
  const agentQuery = query({
    prompt: inputQueue.generator(),
    options: buildModeOptions({ mode: initialMode, model, getMode: () => session.mode }),
  });

  const session: AgentSession = { query: agentQuery, inputQueue, mode: initialMode, model };
  return session;
}
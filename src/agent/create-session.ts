import { query, type Query } from "@anthropic-ai/claude-agent-sdk";
import { buildModeOptions, type CliMode } from "./modes.js";
import { InputQueue } from "./input-queue.js";

export type AgentSession = {
  query: Query;
  inputQueue: InputQueue;
  mode: CliMode;
};

export function createSession(initialMode: CliMode): AgentSession {
  const inputQueue = new InputQueue();
  const agentQuery = query({
    prompt: inputQueue.generator(),
    options: buildModeOptions(initialMode, () => session.mode),
  });

  const session: AgentSession = { query: agentQuery, inputQueue, mode: initialMode };
  return session;
}
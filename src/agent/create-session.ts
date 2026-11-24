import { query, type Query } from "@anthropic-ai/claude-agent-sdk";
import { buildModeOptions, type CliMode } from "./modes.js";
import { InputQueue } from "./input-queue.js";
import { OPTIMIZED, type ModelChoice, type ModelId } from "../config/models.js";
import { BUILDER } from "./routing.js";
import type { ApprovalLevel, AskApproval } from "./permissions.js";

export type AgentSession = {
  query: Query;
  inputQueue: InputQueue;
  mode: CliMode;
  choice: ModelChoice; // what the user picked (shown in the header)
  model: ModelId; // what is running right now (can change during escalation)
  id: string | null;
  approvals: ApprovalLevel; // for this task; back to "edits" when it ends
  planning: boolean; // true while /plan runs: every tool that changes things is refused
};

export type ResumeSettings = {
  resume?: string;
  continueLast?: boolean;
  ask?: AskApproval;
  askYesNo?: (question: string) => Promise<boolean>; // guardrail questions
};

export function createSession(
  initialMode: CliMode,
  choice: ModelChoice,
  resumeSettings: ResumeSettings = {}
): AgentSession {
  const model = choice === OPTIMIZED ? BUILDER : choice;
  const inputQueue = new InputQueue();
  const agentQuery = query({
    prompt: inputQueue.generator(),
    options: buildModeOptions({
      mode: initialMode,
      model,
      getMode: () => (session.planning ? "plan" : session.mode),
      getApprovals: () => session.approvals,
      ...resumeSettings,
    }),
  });

  const session: AgentSession = {
    query: agentQuery,
    inputQueue,
    mode: initialMode,
    choice,
    model,
    id: resumeSettings.resume ?? null,
    approvals: "edits",
    planning: false,
  };
  return session;
}

import type { CliMode } from "../agent/modes.js";

export const SLASH_COMMANDS = [
  { command: "/mode agent|ask|plan", description: "Switch permission mode mid-session" },
  { command: "/model [optimized|id]", description: "Show or switch the model (optimized = auto)" },
  { command: "/plan [model] <task>", description: "Plan first (Opus by default), approve, then build" },
  { command: "/sessions", description: "List past sessions in this folder" },
  { command: "/rename <title>", description: "Rename the current session" },
  { command: "/remember [personal] <text>", description: "Save a memory (project, or personal)" },
  { command: "/memory", description: "List saved memories" },
  { command: "/forget <n>", description: "Delete memory number n" },
  { command: "/checks", description: "Run type/test/lint/secret checks now" },
  { command: "/rate good|bad [reason]", description: "Rate the last task (reason optional)" },
  { command: "/stats [--all]", description: "Runs, checks, cost and ratings per model" },
  { command: "/improve", description: "Suggest RAY.md rules from your 👎 runs (you approve each)" },
  { command: "/help", description: "Show slash commands" },
  { command: "/context", description: "Show context window usage" },
  { command: "/exit", description: "End the chat session" },
] as const;

export const CLI_MODES: CliMode[] = ["agent", "ask", "plan"];

export const MODE_DESCRIPTIONS: Record<CliMode, string> = {
  agent: "Edit files freely; asks before running commands",
  ask: "Read-only questions, no changes",
  plan: "Explore and propose a plan, no changes",
};
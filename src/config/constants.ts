import type { CliMode } from "../agent/modes.js";

export const SLASH_COMMANDS = [
  { command: "/mode agent|ask|plan", description: "Switch permission mode mid-session" },
  { command: "/model [id]", description: "Show or switch the model mid-session" },
  { command: "/sessions", description: "List past sessions in this folder" },
  { command: "/rename <title>", description: "Rename the current session" },
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
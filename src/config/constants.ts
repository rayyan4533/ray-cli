export const SLASH_COMMANDS = [
  { command: "/mode agent|ask|plan", description: "Switch permission mode mid-session" },
  { command: "/help", description: "Show slash commands" },
  { command: "/context", description: "Show context window usage" },
  { command: "/exit", description: "End the chat session" },
] as const;
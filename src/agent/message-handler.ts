import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { fmt, truncate } from "../ui/format.js";
import { stopSpinner } from "../ui/spinner.js";

export type MessageHandlerOptions = {
  verbose?: boolean;
  model?: string;
};
type Block = { type: string;[key: string]: unknown };

function getBlocks(content: unknown): Block[] {
  if (!Array.isArray(content)) return [];
  return content.filter(
    (b): b is Block =>
      typeof b === "object" && b !== null && typeof (b as Block).type === "string"
  );
}

export function getText(content: unknown): string {
  if (typeof content === "string") return content;
  return getBlocks(content)
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n");
}
export function formatMessage(
  message: SDKMessage,
  options: MessageHandlerOptions = {}
): string[] {
  const { verbose = false, model } = options;
  const lines: string[] = [];

  if (verbose) lines.push(fmt.dim(`[${message.type}]`));

  switch (message.type) {
    case "system": {
      if (message.subtype === "init") {
        lines.push(
          fmt.system(
            `Session started · model: ${message.model} · id: ${message.session_id.slice(0, 8)}…`
          )
        );
      } else if (message.subtype === "compact_boundary") {
        lines.push(fmt.system("Context compacted — older history summarized"));
      }
      break;
    }

    case "assistant": {
      const content = message.message.content;
      const text = getText(content).trim();
      if (text) lines.push(fmt.assistant(text));

      for (const block of getBlocks(content)) {
        if (block.type === "tool_use") {
          lines.push(fmt.tool(`  → ${block.name} ${truncate(JSON.stringify(block.input), 80)}`));
        }
      }
      break;
    }

    case "user": {
      for (const block of getBlocks(message.message.content)) {
        if (block.type === "tool_result") {
          const result = getText(block.content).trim();
          if (result) lines.push(fmt.toolResult(`  ← ${truncate(result, 120)}`));
        }
      }
      break;
    }

    case "result": {
      if (message.subtype === "success") {
        if (message.result?.trim()) lines.push(fmt.success("\n" + message.result.trim()));
      } else {
        lines.push(fmt.error(`Stopped: ${message.subtype}`));
      }
      const label = model ? `${model} · ` : "";
      lines.push(
        fmt.dim(`Done · ${label}${message.num_turns} turns · $${message.total_cost_usd.toFixed(4)}`)
      );
      break;
    }

    default:
      break;
  }

  return lines;
}

export function handleMessage(
  message: SDKMessage,
  options: MessageHandlerOptions = {}
): void {
  stopSpinner();
  for (const line of formatMessage(message, options)) console.log(line);
}

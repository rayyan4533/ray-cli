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

function getText(content: unknown): string {
  if (typeof content === "string") return content;
  return getBlocks(content)
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("\n");
}
export function handleMessage(
  message: SDKMessage,
  options: MessageHandlerOptions = {}
): void {
  const { verbose = false, model } = options;

  stopSpinner();

  if (verbose) {
    console.log(fmt.dim(`[${message.type}]`));
  }

  switch (message.type) {
    case "system": {
      if (message.subtype === "init") {
        console.log(
          fmt.system(
            `Session started · model: ${message.model} · id: ${message.session_id.slice(0, 8)}…`
          )
        );
      } else if (message.subtype === "compact_boundary") {
        console.log(fmt.system("Context compacted — older history summarized"));
      }
      break;
    }

    case "assistant": {
      const content = message.message.content;
      const text = getText(content).trim();
      if (text) console.log(fmt.assistant(text));

      for (const block of getBlocks(content)) {
        if (block.type === "tool_use") {
          console.log(
            fmt.tool(`  → ${block.name} ${truncate(JSON.stringify(block.input), 80)}`)
          );
        }
      }
      break;
    }

    case "user": {
      for (const block of getBlocks(message.message.content)) {
        if (block.type === "tool_result") {
          const result = getText(block.content).trim();
          if (result) console.log(fmt.toolResult(`  ← ${truncate(result, 120)}`));
        }
      }
      break;
    }

    case "result": {
      if (message.subtype === "success") {
        if (message.result?.trim()) {
          console.log(fmt.success("\n" + message.result.trim()));
        }
      } else {
        console.log(fmt.error(`Stopped: ${message.subtype}`));
      }
      console.log(
        fmt.dim(`Done · ${model ? `${model} · ` : ""}${message.num_turns} turns · $${message.total_cost_usd.toFixed(4)}`)
      );
      break;
    }

    default:
      break;
  }
}
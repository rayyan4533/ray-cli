import type { SDKControlGetContextUsageResponse } from "@anthropic-ai/claude-agent-sdk";
import { fmt } from "../ui/format.js";

type ContextUsage = SDKControlGetContextUsageResponse;

// 24100 -> "24.1k"
export function formatTokens(tokens: number): string {
  return tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);
}

// A text progress bar: bar(25, 8) -> "██░░░░░░"
export function bar(percentage: number, width = 20): string {
  const filled = Math.round((Math.min(percentage, 100) / 100) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

// Green under 50%, yellow under 80%, red above: time to wrap up or compact.
function colorFor(percentage: number): (text: string) => string {
  if (percentage < 50) return fmt.success;
  if (percentage < 80) return fmt.tool;
  return fmt.error;
}

// One line, for the end of each turn and the UI header.
export function contextSummary(usage: ContextUsage): string {
  const pct = Math.round(usage.percentage);
  return colorFor(pct)(
    `Context ${pct}% · ${formatTokens(usage.totalTokens)} / ${formatTokens(usage.maxTokens)} tokens`
  );
}

// Several lines, for /context: the meter plus what is using the space.
export function contextDetails(usage: ContextUsage): string[] {
  const pct = Math.round(usage.percentage);
  const lines = [fmt.label("\nContext window"), `  ${colorFor(pct)(bar(pct))} ${contextSummary(usage)}`];

  const used = usage.categories
    .filter((c) => c.kind === "used" && c.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens);

  for (const c of used) {
    const share = (c.tokens / usage.maxTokens) * 100;
    lines.push(fmt.dim(`  ${c.name.padEnd(22)} ${formatTokens(c.tokens).padStart(7)}  ${share.toFixed(1)}%`));
  }
  lines.push("");
  return lines;
}

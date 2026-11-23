import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Skill } from "./skills.js";

export type SkillPick = {
  skill: Skill | null;
  by: "keywords" | "haiku" | "you" | "none";
  why: string; // shown to the user, e.g. 'keywords: crash, error'
  costUsd: number;
};

const CLASSIFIER_MODEL = "claude-haiku-5-5";

// Does the message contain this keyword as a word or phrase? ("add" must not match "address")
// Simple word endings count too: "crash" also matches "crashes", "crashed", "crashing".
function contains(message: string, keyword: string): boolean {
  if (keyword === "?") return message.includes("?");
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z])${escaped}(s|es|ed|d|ing)?($|[^a-z])`).test(message);
}

// Step 1, free: count keyword hits per skill. A clear winner = more hits than any other.
export function byKeywords(message: string, skills: Skill[]): { skill: Skill; hits: string[] } | null {
  const text = message.toLowerCase();
  const scored = skills
    .map((skill) => ({ skill, hits: skill.keywords.filter((k) => contains(text, k)) }))
    .filter((s) => s.hits.length > 0)
    .sort((a, b) => b.hits.length - a.hits.length);

  const [best, second] = scored;
  if (!best) return null; // nothing matched
  if (second && second.hits.length === best.hits.length) return null; // a tie: not clear
  return best;
}

// Step 2, only when keywords are unclear: ask Haiku to pick (about a tenth of a cent).
async function byHaiku(message: string, skills: Skill[]): Promise<{ skill: Skill | null; costUsd: number }> {
  const list = skills.map((s) => `- ${s.name}: ${s.description}`).join("\n");
  const prompt =
    `Which kind of task is this? Reply with exactly one name from the list, or "none" if none fits.\n\n` +
    `${list}\n\nTask: ${message.slice(0, 1000)}`;

  let answer = "";
  let costUsd = 0;
  for await (const m of query({
    prompt,
    options: {
      model: CLASSIFIER_MODEL,
      maxTurns: 1,
      allowedTools: [],
      canUseTool: async () => ({ behavior: "deny", message: "No tools: reply with one name." }),
      systemPrompt: "You classify coding tasks. Reply with one word only.",
      persistSession: false,
    },
  })) {
    if (m.type === "result") {
      costUsd = m.total_cost_usd;
      if (m.subtype === "success") answer = m.result.trim().toLowerCase();
    }
  }
  const name = answer.replace(/[^a-z0-9_-]/g, "");
  return { skill: skills.find((s) => s.name === name) ?? null, costUsd };
}

// Keywords first; Haiku only when they don't give a clear answer.
export async function chooseSkill(message: string, skills: Skill[]): Promise<SkillPick> {
  const quick = byKeywords(message, skills);
  if (quick) {
    return { skill: quick.skill, by: "keywords", why: `keywords: ${quick.hits.slice(0, 3).join(", ")}`, costUsd: 0 };
  }
  try {
    const { skill, costUsd } = await byHaiku(message, skills);
    return skill
      ? { skill, by: "haiku", why: "keywords unclear, Haiku picked it", costUsd }
      : { skill: null, by: "none", why: "no skill fits", costUsd };
  } catch {
    return { skill: null, by: "none", why: "could not classify", costUsd: 0 };
  }
}

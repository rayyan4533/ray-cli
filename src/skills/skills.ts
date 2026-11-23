import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { BUILTIN_SKILLS } from "./builtin.js";

export type SkillSource = "built-in" | "personal" | "project";

export type Skill = {
  name: string;
  description: string;
  keywords: string[];
  playbook: string; // the steps the agent should follow
  source: SkillSource;
};

// Where skill files are looked for, weakest first: later ones override earlier ones.
export const SKILL_DIRS: { source: SkillSource; dir: string }[] = [
  { source: "personal", dir: join(homedir(), ".ray-cli", "skills") },
  { source: "project", dir: join(process.cwd(), ".ray", "skills") },
];

// A skill file is markdown with a small header ("frontmatter") between --- lines:
//   ---
//   name: bugfix
//   description: ...
//   keywords: bug, crash, error
//   ---
//   1. first step ...
export function parseSkill(text: string, source: SkillSource, fallbackName: string): Skill | null {
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;
  const fields: Record<string, string> = {};
  for (const line of match[1]!.split("\n")) {
    const colon = line.indexOf(":");
    if (colon > 0) fields[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
  }
  const playbook = match[2]!.trim();
  if (!playbook) return null;
  return {
    name: (fields.name || fallbackName).toLowerCase(),
    description: fields.description ?? "",
    keywords: (fields.keywords ?? "")
      .split(",")
      .map((k) => k.trim().toLowerCase())
      .filter(Boolean),
    playbook,
    source,
  };
}

// Read every skill: built-in, then personal, then project. Read fresh each time,
// so a file you edit is used on the very next message.
export function loadSkills(): Map<string, Skill> {
  const skills = new Map<string, Skill>();
  for (const [name, text] of Object.entries(BUILTIN_SKILLS)) {
    const skill = parseSkill(text, "built-in", name);
    if (skill) skills.set(skill.name, skill);
  }
  for (const { source, dir } of SKILL_DIRS) {
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
      const skill = parseSkill(readFileSync(join(dir, file), "utf8"), source, basename(file, ".md"));
      if (skill) skills.set(skill.name, skill);
    }
  }
  return skills;
}

// What is added to your message when a skill is chosen.
export function withSkill(message: string, skill: Skill): string {
  return `${message}\n\n---\nray-cli chose the "${skill.name}" skill for this task. Follow this playbook:\n${skill.playbook}`;
}

// "/skill"                → list the skills
// "/skill bugfix <task>"  → send the task with that skill
// "/skill off <task>"     → send the task with no skill
export type SkillCommand = { list: true } | { override: string; task: string } | { error: string };

export function parseSkillCommand(line: string): SkillCommand {
  const [, name, ...rest] = line.trim().split(/\s+/);
  if (!name) return { list: true };
  const task = rest.join(" ").trim();
  if (!task) return { error: "Usage: /skill <name|off> <task>   e.g. /skill bugfix the login crashes" };
  return { override: name.toLowerCase(), task };
}

export function skillListLines(): string[] {
  const lines = ["", "Skills (ray picks one per task; force one with /skill <name> <task>):"];
  for (const s of loadSkills().values()) {
    lines.push(`  ${s.name.padEnd(10)} ${s.source.padEnd(9)} ${s.description}`);
  }
  lines.push("  Add your own: a .md file in .ray/skills/ (project) or ~/.ray-cli/skills/ (personal).", "");
  return lines;
}

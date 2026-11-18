import { select } from "@inquirer/prompts";
import boxen from "boxen";
import chalk from "chalk";
import { startChat } from "./chat.js";
import { checkEnvironment } from "../config/env.js";
import { CLI_MODES, MODE_DESCRIPTIONS } from "../config/constants.js";
import { printBanner } from "../ui/banner.js";
import type { CliMode } from "../agent/modes.js";

const MODE_COLORS = { agent: "green", ask: "blue", plan: "yellow" } as const;

function printModePanels(): void {
  for (const mode of CLI_MODES) {
    const panel = boxen(
      chalk.bold(mode.toUpperCase()) + "\n\n" + chalk.dim(MODE_DESCRIPTIONS[mode]),
      { padding: 1, borderColor: MODE_COLORS[mode] }
    );
    console.log(panel);
  }
}

export async function wakeUp(): Promise<void> {
  printBanner();
  console.log();

  await checkEnvironment();
  console.log();

  printModePanels();

  const mode = await select<CliMode>({
    message: "Choose a mode to start:",
    choices: CLI_MODES.map((value) => ({
      name: `${value} — ${MODE_DESCRIPTIONS[value]}`,
      value,
    })),
    default: "agent",
  });

  console.log();
  await startChat({ mode });
}
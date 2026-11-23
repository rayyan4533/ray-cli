import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { AgentSession } from "./create-session.js";
import type { ApprovalLevel } from "./permissions.js";
import { MAX_TURNS, cliModeToPermissionMode } from "./modes.js";
import {
  BUILDER,
  BUILD_PROMPT,
  TASK_COST_CAP,
  escalationReason,
  nextStep,
  planPrompt,
} from "./routing.js";
import { OPTIMIZED, choiceLabel, type ModelChoice, type ModelId } from "../config/models.js";
import { RunTracker } from "../quality/signals.js";
import { finishRun } from "../quality/report.js";
import { fmt } from "../ui/format.js";

type Hooks = {
  print: (line: string) => void;
  // Ask the human whether to build the plan they just read.
  // After the plan: how should the build run? null = don't build.
  choosePlanRun: () => Promise<ApprovalLevel | null>;
  // Something the header shows changed (planning started/ended, model choice).
  onChange?: () => void;
};

type Phase = "idle" | "planning" | "building";

// One "task" = what you asked for, from your message until ray-cli is done with it:
// maybe a plan, then a build, then up to two escalations.
// chat.ts and App.tsx both use this, so the rules live in one place.
export class TaskController {
  phase: Phase = "idle";
  planner: ModelId | null = null; // set while /plan is running (the header shows it)

  private tracker = new RunTracker();
  private escalations = 0;
  private taskText = ""; // what you asked, saved with each run
  private spent = 0;
  private closed = false;

  constructor(private session: AgentSession, private hooks: Hooks) {}

  close(): void {
    this.closed = true;
    this.session.planning = false;
  }

  // A normal message: build it straight away.
  async send(text: string): Promise<void> {
    this.startTask("building");
    this.taskText = text;
    await this.useBuilder();
    this.session.inputQueue.push(text);
  }

  // /plan [model] <task>: the planner thinks in read-only plan mode first.
  async plan(task: string, planner: ModelId): Promise<void> {
    this.startTask("planning");
    this.taskText = `/plan ${task}`;
    this.planner = planner;
    this.session.planning = true;
    await this.switchModel(planner);
    await this.session.query.setPermissionMode("plan");
    this.hooks.onChange?.();
    this.hooks.print(fmt.mode(`Planning with ${planner}…`));
    this.session.inputQueue.push(planPrompt(task));
  }

  // The user picked from the model menu.
  async setChoice(choice: ModelChoice): Promise<void> {
    await applyModelChoice(this.session, choice);
    this.hooks.onChange?.();
  }

  // Feed every SDK message in. Returns true when the whole task is finished,
  // so the screen can accept the next message.
  async observe(message: SDKMessage): Promise<boolean> {
    const summary = this.tracker.observe(message);
    if (!summary || this.closed) return false;

    const checks = await finishRun(
      summary,
      {
        mode: this.phase === "planning" ? "plan" : this.session.mode,
        model: this.session.model,
        task: this.taskText,
        attempt: this.escalations,
      },
      this.hooks.print
    );
    this.spent += summary.costUsd;

    if (this.phase === "planning") return this.afterPlan(summary.outcome, summary.changedFiles);

    // Escalation only in optimized mode: a model you picked yourself is respected.
    if (this.session.choice === OPTIMIZED) {
      const reason = escalationReason(summary, checks, MAX_TURNS);
      if (reason) {
        const step = nextStep(this.session.model, reason, checks, this.escalations, this.spent);
        this.hooks.print(step.line);
        if (step.kind === "escalate") {
          this.escalations++;
          await this.switchModel(step.model);
          this.session.inputQueue.push(step.prompt);
          return false; // same task continues with the stronger model
        }
      } else if (this.escalations > 0) {
        this.hooks.print(fmt.success(`✓ Fixed after ${this.escalations} escalation(s) · task cost $${this.spent.toFixed(2)}`));
      }
    }

    await this.endTask();
    return true;
  }

  private async afterPlan(outcome: string, changedFiles: string[]): Promise<boolean> {
    // Back to the user's own mode and model before anything else.
    this.session.planning = false;
    await this.session.query.setPermissionMode(cliModeToPermissionMode(this.session.mode));
    this.planner = null;
    this.hooks.onChange?.();

    // Should never happen now that planning is locked, but say so if it does.
    if (changedFiles.length > 0) {
      this.hooks.print(fmt.error(`Planning changed files it should not have: ${changedFiles.join(", ")}`));
    }

    if (outcome !== "success") {
      const why = outcome === "error_max_turns" ? "it ran out of turns" : `it ended with ${outcome}`;
      this.hooks.print(fmt.error(`Planning did not finish (${why}), so the build was not started.`));
      await this.endTask();
      return true;
    }
    if (this.session.mode !== "agent") {
      this.hooks.print(fmt.dim(`Plan only: you are in ${this.session.mode} mode. Switch with /mode agent to build it.`));
      await this.endTask();
      return true;
    }
    const level = await this.hooks.choosePlanRun();
    if (!level) {
      this.hooks.print(fmt.dim("Plan discarded. Nothing was changed."));
      await this.endTask();
      return true;
    }

    // "manual" needs the SDK to send edits to our handler too, so leave acceptEdits.
    this.session.approvals = level;
    if (level === "manual") await this.session.query.setPermissionMode("default");
    this.phase = "building";
    await this.useBuilder();
    this.hooks.print(fmt.mode(`Building with ${this.session.model}…`));
    this.session.inputQueue.push(BUILD_PROMPT);
    return false;
  }

  private startTask(phase: Phase): void {
    this.phase = phase;
    this.escalations = 0;
    this.spent = 0;
  }

  // Back to normal after every task: edits automatic, commands ask, your own mode.
  private async endTask(): Promise<void> {
    this.phase = "idle";
    if (this.session.approvals !== "edits") {
      this.session.approvals = "edits";
      await this.session.query.setPermissionMode(cliModeToPermissionMode(this.session.mode));
    }
    if (this.spent > TASK_COST_CAP) {
      this.hooks.print(fmt.tool(`Note: this task cost $${this.spent.toFixed(2)}, over the $${TASK_COST_CAP.toFixed(2)} cap.`));
    }
  }

  // Each task starts on the cheap builder (optimized) or the model you picked.
  private async useBuilder(): Promise<void> {
    await applyModelChoice(this.session, this.session.choice);
  }

  private async switchModel(model: ModelId): Promise<void> {
    await switchModel(this.session, model);
  }
}

async function switchModel(session: AgentSession, model: ModelId): Promise<void> {
  if (session.model === model) return;
  await session.query.setModel(model);
  session.model = model;
}

// Used by the model menu and by /model: remember the choice, run the right model.
export async function applyModelChoice(session: AgentSession, choice: ModelChoice): Promise<void> {
  session.choice = choice;
  await switchModel(session, choice === OPTIMIZED ? BUILDER : choice);
}

// What the header shows: the planner while planning, otherwise your choice.
export function headerModel(session: AgentSession, controller: TaskController | null): string {
  if (controller?.planner) return `${controller.planner} (planning)`;
  return choiceLabel(session.choice);
}

import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, relative, resolve } from "node:path";
import type { HookCallback, Options } from "@anthropic-ai/claude-agent-sdk";

// Guardrails are hard rules that apply in every mode and at every approval level,
// even "end to end". They run in a PreToolUse hook, which sees EVERY tool call,
// including the read tools that never reach the permission handler.

export type AskYesNo = (question: string) => Promise<boolean>;
export type GuardrailEvent = { tool: string; rule: string; target: string; decision: "blocked" | "allowed" | "refused" };

const READ_TOOLS = new Set(["Read", "Glob", "Grep"]);
const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit"]);

// Files that hold secrets. .env.example is fine: it is a template without values.
const SECRET_FILE = /(^|\/)(\.env(\.(?!example$)[^/]+)?|id_rsa[^/]*|id_ed25519[^/]*|[^/]+\.(pem|key|p12|pfx)|\.npmrc|\.netrc|credentials(\.json)?)$/i;

// Commands that can destroy work or run code from the internet. Asked about, every time.
const DANGEROUS_COMMANDS: { pattern: RegExp; what: string }[] = [
  { pattern: /\brm\s+(-[a-z]*r[a-z]*f|-[a-z]*f[a-z]*r|-r\s+-f|-f\s+-r)\b/i, what: "deletes files recursively and without asking (rm -rf)" },
  { pattern: /\bgit\s+push\b.*(--force\b|--force-with-lease\b|\s-f\b)/i, what: "overwrites the remote history (git push --force)" },
  { pattern: /\bgit\s+reset\s+--hard\b/i, what: "throws away uncommitted work (git reset --hard)" },
  { pattern: /\bgit\s+clean\s+-[a-z]*f/i, what: "deletes untracked files (git clean -f)" },
  { pattern: /\bsudo\b/i, what: "runs as administrator (sudo)" },
  { pattern: /\b(curl|wget)\b[^|]*\|\s*(ba|z)?sh\b/i, what: "downloads and runs a script from the internet" },
  { pattern: /\b(mkfs|diskutil\s+erase|dd\s+if=)/i, what: "can wipe a disk" },
  { pattern: /\bchmod\s+(-R\s+)?777\b/i, what: "makes files writable by everyone (chmod 777)" },
  { pattern: />\s*\/dev\/(disk|sd)/i, what: "writes straight to a disk device" },
];

// Commands that would print a secret file to the screen.
const SECRET_IN_COMMAND = /(^|[\s"'/=])(\.env(\.(?!example\b)[a-z]+)?|id_rsa|id_ed25519)\b/i;

// Turn any path the agent gives into a real absolute path: resolves "..",
// "~"-free relative paths and symlinks (even for files that don't exist yet).
function realPath(path: string, projectDir: string): string {
  const absolute = resolve(projectDir, path);
  let existing = absolute;
  while (!existsSync(existing) && dirname(existing) !== existing) existing = dirname(existing);
  try {
    return resolve(realpathSync(existing), relative(existing, absolute));
  } catch {
    return absolute;
  }
}

function isInside(path: string, projectDir: string): boolean {
  const rel = relative(realPath(projectDir, projectDir), path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

// The path a file tool wants to touch, if any.
function targetPath(tool: string, input: Record<string, unknown>): string | null {
  const value = input.file_path ?? input.notebook_path ?? input.path;
  if (typeof value === "string" && value) return value;
  // Glob with an absolute pattern like "/etc/**" points outside too.
  if (tool === "Glob" && typeof input.pattern === "string" && isAbsolute(input.pattern)) {
    return input.pattern.split(/[*?[{]/)[0] || "/";
  }
  return null;
}

type Decision = { decision: "allow" | "deny" | "continue"; reason?: string; event?: GuardrailEvent };

// The rules themselves, kept apart from the SDK so they are easy to test.
export async function checkTool(
  tool: string,
  input: Record<string, unknown>,
  projectDir: string,
  ask: AskYesNo
): Promise<Decision> {
  if (READ_TOOLS.has(tool) || WRITE_TOOLS.has(tool)) {
    const raw = targetPath(tool, input);
    if (!raw) return { decision: "continue" }; // e.g. Grep with no path = the project
    const path = realPath(raw, projectDir);

    if (SECRET_FILE.test(path)) {
      return {
        decision: "deny",
        reason: `Blocked by ray-cli guardrails: ${basename(path)} holds secrets and is never read or written.`,
        event: { tool, rule: "secret file", target: path, decision: "blocked" },
      };
    }

    if (!isInside(path, projectDir)) {
      if (WRITE_TOOLS.has(tool)) {
        return {
          decision: "deny",
          reason: `Blocked by ray-cli guardrails: ${path} is outside the project, and ray only changes files inside it.`,
          event: { tool, rule: "write outside project", target: path, decision: "blocked" },
        };
      }
      const ok = await ask(`Read outside the project: ${path} ?`);
      return ok
        ? { decision: "continue", event: { tool, rule: "read outside project", target: path, decision: "allowed" } }
        : {
            decision: "deny",
            reason: `The user did not allow reading ${path} (outside the project).`,
            event: { tool, rule: "read outside project", target: path, decision: "refused" },
          };
    }
    return { decision: "continue" };
  }

  if (tool === "Bash" && typeof input.command === "string") {
    const command = input.command;

    if (SECRET_IN_COMMAND.test(command)) {
      return {
        decision: "deny",
        reason: "Blocked by ray-cli guardrails: this command touches a secret file (.env, a private key).",
        event: { tool, rule: "secret in command", target: command, decision: "blocked" },
      };
    }

    const danger = DANGEROUS_COMMANDS.find((d) => d.pattern.test(command));
    if (danger) {
      const ok = await ask(`⚠ Dangerous command — ${danger.what}:\n  ${command}\nRun it anyway?`);
      return ok
        ? { decision: "allow", event: { tool, rule: "dangerous command", target: command, decision: "allowed" } }
        : {
            decision: "deny",
            reason: `The user refused a dangerous command (${danger.what}). Find a safer way or ask them.`,
            event: { tool, rule: "dangerous command", target: command, decision: "refused" },
          };
    }
  }

  return { decision: "continue" };
}

// The PreToolUse hook the SDK calls before every tool.
export function createGuardrailHook(
  projectDir: string,
  ask: AskYesNo,
  onEvent: (event: GuardrailEvent) => void = () => {}
): HookCallback {
  return async (input) => {
    if (input.hook_event_name !== "PreToolUse") return {};
    const toolInput = (input.tool_input ?? {}) as Record<string, unknown>;
    const result = await checkTool(input.tool_name, toolInput, projectDir, ask);
    if (result.event) onEvent(result.event);
    if (result.decision === "continue") return {}; // no opinion: modes and approvals decide as usual

    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: result.decision,
        permissionDecisionReason: result.reason,
      },
    };
  };
}

// The OS sandbox for commands: macOS itself keeps Bash writing only inside the
// project, and lets it reach only package registries and GitHub on the network.
export const SANDBOX: NonNullable<Options["sandbox"]> = {
  enabled: true,
  failIfUnavailable: false, // if this computer can't sandbox, warn and carry on
  autoAllowBashIfSandboxed: false, // still ask before commands, as before
  allowUnsandboxedCommands: false, // no escape hatch out of the sandbox
  network: {
    allowedDomains: [
      "registry.npmjs.org",
      "registry.yarnpkg.com",
      "github.com",
      "codeload.github.com",
      "objects.githubusercontent.com",
    ],
  },
};

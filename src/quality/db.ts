import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

// One file for every project on this laptop; the project column tells them apart.
export const DB_FILE = join(homedir(), ".ray-cli", "ray.db");

export type RunRecord = {
  project: string;
  sessionId: string;
  model: string;
  mode: string;
  turns: number;
  costUsd: number;
  outcome: string;
  hitMaxTurns: boolean;
  toolErrors: number;
  denials: number;
  filesChanged: number;
  checks: unknown; // the CheckResult[] list, stored as JSON text
  checksPassed: boolean | null;
};

export type RunRow = {
  id: number;
  created_at: string;
  project: string;
  model: string;
  mode: string;
  turns: number;
  cost_usd: number;
  outcome: string;
  tool_errors: number;
  denials: number;
  files_changed: number;
  checks_passed: number | null;
};

let db: DatabaseSync | null = null;

// Opened on first use, so commands that never log never touch the file.
function open(): DatabaseSync {
  if (db) return db;
  mkdirSync(dirname(DB_FILE), { recursive: true });
  db = new DatabaseSync(DB_FILE);
  db.exec(`
    CREATE TABLE IF NOT EXISTS runs (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      project       TEXT    NOT NULL,
      project_name  TEXT    NOT NULL,
      session_id    TEXT,
      model         TEXT    NOT NULL,
      mode          TEXT    NOT NULL,
      turns         INTEGER NOT NULL,
      cost_usd      REAL    NOT NULL,
      outcome       TEXT    NOT NULL,
      hit_max_turns INTEGER NOT NULL,
      tool_errors   INTEGER NOT NULL,
      denials       INTEGER NOT NULL,
      files_changed INTEGER NOT NULL,
      checks        TEXT,
      checks_passed INTEGER
    )
  `);
  return db;
}

const bool = (value: boolean | null) => (value === null ? null : value ? 1 : 0);

export function saveRun(run: RunRecord): void {
  open()
    .prepare(
      `INSERT INTO runs (project, project_name, session_id, model, mode, turns, cost_usd, outcome,
                         hit_max_turns, tool_errors, denials, files_changed, checks, checks_passed)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      run.project,
      basename(run.project),
      run.sessionId,
      run.model,
      run.mode,
      run.turns,
      run.costUsd,
      run.outcome,
      bool(run.hitMaxTurns),
      run.toolErrors,
      run.denials,
      run.filesChanged,
      JSON.stringify(run.checks),
      bool(run.checksPassed)
    );
}

// Newest first. By default only this project; allProjects shows everything.
export function recentRuns(limit = 10, allProjects = false, project = process.cwd()): RunRow[] {
  const select = `SELECT id, created_at, project_name AS project, model, mode, turns, cost_usd, outcome,
                         tool_errors, denials, files_changed, checks_passed FROM runs`;
  const rows = allProjects
    ? open().prepare(`${select} ORDER BY id DESC LIMIT ?`).all(limit)
    : open().prepare(`${select} WHERE project = ? ORDER BY id DESC LIMIT ?`).all(project, limit);
  return rows as unknown as RunRow[];
}

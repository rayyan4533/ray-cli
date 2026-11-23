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
  task: string | null; // what you asked (first 200 characters), so failures can be understood later
  attempt: number; // 0 = first try, 1 = first escalation, 2 = second
  skill: string | null; // the playbook used (Chapter 15), or null
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
  migrate(db);
  db.exec(`
    CREATE TABLE IF NOT EXISTS ratings (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      run_id     INTEGER NOT NULL REFERENCES runs(id),
      score      TEXT    NOT NULL CHECK (score IN ('good', 'bad')),
      reason     TEXT,   -- one of the fixed reasons, "other", or NULL when skipped
      note       TEXT    -- your own words when you picked "Other"
    )
  `);
  return db;
}

// A ray.db from Chapter 12 has no task/attempt columns yet. Add any that are
// missing; existing rows simply get the default. Safe to run every time.
function migrate(database: DatabaseSync): void {
  const columns = database.prepare("PRAGMA table_info(runs)").all() as { name: string }[];
  const has = (name: string) => columns.some((c) => c.name === name);
  if (!has("task")) database.exec("ALTER TABLE runs ADD COLUMN task TEXT");
  if (!has("attempt")) database.exec("ALTER TABLE runs ADD COLUMN attempt INTEGER NOT NULL DEFAULT 0");
  if (!has("skill")) database.exec("ALTER TABLE runs ADD COLUMN skill TEXT");
}

const bool = (value: boolean | null) => (value === null ? null : value ? 1 : 0);

// Returns the new row's id, so the run can be rated later.
export function saveRun(run: RunRecord): number {
  const result = open()
    .prepare(
      `INSERT INTO runs (project, project_name, session_id, model, mode, turns, cost_usd, outcome,
                         hit_max_turns, tool_errors, denials, files_changed, checks, checks_passed,
                         task, attempt, skill)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
      bool(run.checksPassed),
      run.task,
      run.attempt,
      run.skill
    );
  return Number(result.lastInsertRowid);
}

export type Score = "good" | "bad";

export function saveRating(runId: number, score: Score, reason: string | null, note: string | null): void {
  open()
    .prepare("INSERT INTO ratings (run_id, score, reason, note) VALUES (?, ?, ?, ?)")
    .run(runId, score, reason, note);
}

// ---- Questions /stats and /improve ask ----

const scope = (allProjects: boolean) => (allProjects ? "1 = 1" : "r.project = ?");
const params = (allProjects: boolean, project: string, days: number) =>
  allProjects ? [`-${days} days`] : [`-${days} days`, project];

export type ModelStats = {
  model: string;
  runs: number;
  checked: number; // runs where checks actually ran
  passed: number; // of those, how many passed
  avg_cost: number;
  total_cost: number;
  called_in: number; // runs where this model was an escalation
  good: number;
  bad: number;
};

export function statsByModel(allProjects: boolean, days = 30, project = process.cwd()): ModelStats[] {
  return open()
    .prepare(
      `SELECT r.model,
              COUNT(*)                                        AS runs,
              COUNT(r.checks_passed)                          AS checked,
              COALESCE(SUM(r.checks_passed), 0)               AS passed,
              AVG(r.cost_usd)                                 AS avg_cost,
              SUM(r.cost_usd)                                 AS total_cost,
              SUM(CASE WHEN r.attempt > 0 THEN 1 ELSE 0 END)  AS called_in,
              SUM(CASE WHEN g.score = 'good' THEN 1 ELSE 0 END) AS good,
              SUM(CASE WHEN g.score = 'bad'  THEN 1 ELSE 0 END) AS bad
       FROM runs r
       LEFT JOIN ratings g ON g.run_id = r.id
       WHERE r.created_at >= datetime('now', ?) AND ${scope(allProjects)}
       GROUP BY r.model
       ORDER BY runs DESC`
    )
    .all(...params(allProjects, project, days)) as unknown as ModelStats[];
}

export type SkillStats = { skill: string; runs: number; checked: number; passed: number; good: number; bad: number };

// Same idea as statsByModel, grouped by skill ("none" when no skill was used).
export function statsBySkill(allProjects: boolean, days = 30, project = process.cwd()): SkillStats[] {
  return open()
    .prepare(
      `SELECT COALESCE(r.skill, 'none')                     AS skill,
              COUNT(*)                                        AS runs,
              COUNT(r.checks_passed)                          AS checked,
              COALESCE(SUM(r.checks_passed), 0)               AS passed,
              SUM(CASE WHEN g.score = 'good' THEN 1 ELSE 0 END) AS good,
              SUM(CASE WHEN g.score = 'bad'  THEN 1 ELSE 0 END) AS bad
       FROM runs r
       LEFT JOIN ratings g ON g.run_id = r.id
       WHERE r.created_at >= datetime('now', ?) AND ${scope(allProjects)}
       GROUP BY COALESCE(r.skill, 'none')
       ORDER BY runs DESC`
    )
    .all(...params(allProjects, project, days)) as unknown as SkillStats[];
}

export type ReasonCount = { score: Score; reason: string; count: number; checks_ok: number };

// How often each reason was given, and how many of those runs had passed their checks.
export function reasonCounts(allProjects: boolean, days = 30, project = process.cwd()): ReasonCount[] {
  return open()
    .prepare(
      `SELECT g.score, COALESCE(g.reason, 'skipped') AS reason, COUNT(*) AS count,
              SUM(CASE WHEN r.checks_passed = 1 THEN 1 ELSE 0 END) AS checks_ok
       FROM ratings g JOIN runs r ON r.id = g.run_id
       WHERE r.created_at >= datetime('now', ?) AND ${scope(allProjects)}
       GROUP BY g.score, reason
       ORDER BY count DESC`
    )
    .all(...params(allProjects, project, days)) as unknown as ReasonCount[];
}

export type BadRun = {
  model: string;
  task: string | null;
  reason: string | null;
  note: string | null;
  checks: string | null;
  attempt: number;
};

// The 👎 runs with everything we know about them, newest first (for /improve).
export function badRuns(limit = 30, project = process.cwd()): BadRun[] {
  return open()
    .prepare(
      `SELECT r.model, r.task, g.reason, g.note, r.checks, r.attempt
       FROM ratings g JOIN runs r ON r.id = g.run_id
       WHERE g.score = 'bad' AND r.project = ?
       ORDER BY g.id DESC LIMIT ?`
    )
    .all(project, limit) as unknown as BadRun[];
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

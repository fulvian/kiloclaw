/**
 * Proactive Scheduler Store - Persistent task storage
 */

import { Log } from "@/util/log"
import z from "zod"
import { Database as BunDatabase } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"

// =============================================================================
// Schemas
// =============================================================================

// =============================================================================
// Schemas
// =============================================================================

export const TaskStatus = z.enum(["active", "paused", "dlq", "completed", "failed"])
export type TaskStatus = z.infer<typeof TaskStatus>

// Schedule type: one-shot (consume once then completed) vs recurring
export const ScheduleType = z.enum(["one_shot", "recurring"])
export type ScheduleType = z.infer<typeof ScheduleType>

// Extended task state for v2 (Phase 2)
export const TaskState = z.enum(["active", "paused", "running", "completed", "archived", "dlq", "failed"])
export type TaskState = z.infer<typeof TaskState>

// Run type for lineage tracking (manual, replay, scheduled)
export const RunType = z.enum(["scheduled", "manual", "replay"])
export type RunType = z.infer<typeof RunType>

export const RunOutcome = z.enum(["success", "failed", "blocked", "budget_exceeded", "policy_denied"])
export type RunOutcome = z.infer<typeof RunOutcome>

export const ProactiveTaskSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  triggerConfig: z.string(),
  scheduleCron: z.string().nullable().optional(),
  scheduleType: ScheduleType.default("recurring"),
  timezone: z.string().nullable().optional(),
  displaySchedule: z.string().nullable().optional(),
  nextRunAt: z.number().nullable().optional(),
  lastScheduledFor: z.number().nullable().optional(),
  status: TaskStatus.default("active"),
  state: TaskState.default("active"),
  archivedAt: z.number().nullable().optional(),
  completedAt: z.number().nullable().optional(),
  retryCount: z.number().int().nonnegative().default(0),
  maxRetries: z.number().int().positive().default(3),
  lastError: z.string().nullable().optional(),
  createdAt: z.number().optional(),
  updatedAt: z.number().optional(),
})

export type ProactiveTask = z.infer<typeof ProactiveTaskSchema>

export const ProactiveTaskRunSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  runType: RunType.default("scheduled"),
  attempt: z.number().int().positive().optional(),
  parentRunId: z.string().nullable().optional(),
  scheduledFor: z.number().int().nonnegative().nullable().optional(),
  startedAt: z.number().int().nonnegative().nullable().optional(),
  finishedAt: z.number().int().nonnegative().nullable().optional(),
  outcome: RunOutcome,
  durationMs: z.number().int().nonnegative(),
  gateDecisions: z.record(z.string(), z.unknown()).nullable().optional(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  correlationId: z.string().nullable().optional(),
  idempotencyKey: z.string().nullable().optional(),
  traceId: z.string().nullable().optional(),
  evidenceRefs: z.array(z.string()).nullable().optional(),
  createdAt: z.number().optional(),
})

export type ProactiveTaskRun = z.infer<typeof ProactiveTaskRunSchema>

export const ProactiveDlqEntrySchema = z.object({
  id: z.string(),
  taskId: z.string(),
  runId: z.string().nullable().optional(),
  error: z.string(),
  payload: z.record(z.string(), z.unknown()).nullable().optional(),
  retryAt: z.number().nullable().optional(),
  createdAt: z.number().optional(),
})

export type ProactiveDlqEntry = z.infer<typeof ProactiveDlqEntrySchema>

export const CreateTaskInputSchema = ProactiveTaskSchema.omit({
  createdAt: true,
  updatedAt: true,
  status: true,
  retryCount: true,
  lastError: true,
  archivedAt: true,
  completedAt: true,
})
  .partial()
  .extend({
    id: z.string(),
    tenantId: z.string(),
    name: z.string(),
    triggerConfig: z.string(),
    scheduleType: z.enum(["one_shot", "recurring"]).optional(),
    state: TaskState.optional(),
  })

export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>

export const UpdateTaskInputSchema = z.object({
  name: z.string().optional(),
  triggerConfig: z.string().optional(),
  scheduleCron: z.string().nullable().optional(),
  nextRunAt: z.number().nullable().optional(),
  status: TaskStatus.optional(),
  retryCount: z.number().int().nonnegative().optional(),
  maxRetries: z.number().int().positive().optional(),
  lastError: z.string().nullable().optional(),
})

export type UpdateTaskInput = z.infer<typeof UpdateTaskInputSchema>

export const RecordRunInputSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  runType: RunType.default("scheduled"),
  attempt: z.number().int().positive().optional(),
  parentRunId: z.string().nullable().optional(),
  scheduledFor: z.number().int().nonnegative().nullable().optional(),
  startedAt: z.number().int().nonnegative().nullable().optional(),
  finishedAt: z.number().int().nonnegative().nullable().optional(),
  outcome: RunOutcome,
  durationMs: z.number().int().nonnegative(),
  gateDecisions: z.record(z.string(), z.unknown()).nullable().optional(),
  errorCode: z.string().nullable().optional(),
  errorMessage: z.string().nullable().optional(),
  correlationId: z.string().nullable().optional(),
  idempotencyKey: z.string().nullable().optional(),
  traceId: z.string().nullable().optional(),
  evidenceRefs: z.array(z.string()).nullable().optional(),
})

export type RecordRunInput = z.infer<typeof RecordRunInputSchema>

export const MoveToDLQInputSchema = z.object({
  id: z.string(),
  taskId: z.string(),
  runId: z.string().nullable().optional(),
  error: z.string(),
  payload: z.record(z.string(), z.unknown()).nullable().optional(),
  retryAt: z.number().nullable().optional(),
})

export type MoveToDLQInput = z.infer<typeof MoveToDLQInputSchema>

// =============================================================================
// Lease schemas
// =============================================================================

export const RuntimeLeaseSchema = z.object({
  leaseName: z.string(),
  ownerId: z.string(),
  fenceToken: z.number().int().nonnegative(),
  expiresAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  version: z.number().int().positive(),
})

export type RuntimeLease = z.infer<typeof RuntimeLeaseSchema>

export const AcquireLeaseInputSchema = z.object({
  leaseName: z.string(),
  ownerId: z.string(),
  ttlMs: z.number().int().positive(),
})

export type AcquireLeaseInput = z.infer<typeof AcquireLeaseInputSchema>

export const RenewLeaseInputSchema = z.object({
  leaseName: z.string(),
  ownerId: z.string(),
  ttlMs: z.number().int().positive(),
  expectedFenceToken: z.number().int().nonnegative(),
})

export type RenewLeaseInput = z.infer<typeof RenewLeaseInputSchema>

export const ReleaseLeaseInputSchema = z.object({
  leaseName: z.string(),
  ownerId: z.string(),
})

export type ReleaseLeaseInput = z.infer<typeof ReleaseLeaseInputSchema>

// =============================================================================
// SQL for table creation
// =============================================================================

export const PROACTIVE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS proactive_tasks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  trigger_config TEXT NOT NULL,
  schedule_cron TEXT,
  schedule_type TEXT NOT NULL DEFAULT 'recurring',
  timezone TEXT,
  display_schedule TEXT,
  next_run_at INTEGER,
  last_scheduled_for INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  state TEXT NOT NULL DEFAULT 'active',
  archived_at INTEGER,
  completed_at INTEGER,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  last_error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS proactive_task_tenant_idx ON proactive_tasks(tenant_id);
CREATE INDEX IF NOT EXISTS proactive_task_status_idx ON proactive_tasks(status);
CREATE INDEX IF NOT EXISTS proactive_task_state_idx ON proactive_tasks(state);
CREATE INDEX IF NOT EXISTS proactive_task_next_run_idx ON proactive_tasks(next_run_at) WHERE next_run_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS proactive_task_runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES proactive_tasks(id) ON DELETE CASCADE,
  run_type TEXT NOT NULL DEFAULT 'scheduled',
  attempt INTEGER,
  parent_run_id TEXT,
  scheduled_for INTEGER,
  started_at INTEGER,
  finished_at INTEGER,
  outcome TEXT NOT NULL,
  duration_ms INTEGER NOT NULL,
  gate_decisions TEXT,
  error_code TEXT,
  error_message TEXT,
  correlation_id TEXT,
  idempotency_key TEXT,
  trace_id TEXT,
  evidence_refs TEXT,
  fence_token INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS proactive_run_task_idx ON proactive_task_runs(task_id);
CREATE INDEX IF NOT EXISTS proactive_run_created_idx ON proactive_task_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS proactive_run_idempotency_idx ON proactive_task_runs(idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS proactive_dlq (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES proactive_tasks(id) ON DELETE CASCADE,
  run_id TEXT,
  error TEXT NOT NULL,
  payload TEXT,
  retry_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS proactive_dlq_task_idx ON proactive_dlq(task_id);
CREATE INDEX IF NOT EXISTS proactive_dlq_retry_idx ON proactive_dlq(retry_at) WHERE retry_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS proactive_runtime_lease (
  lease_name TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  fence_token INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  version INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS proactive_lease_expires_idx ON proactive_runtime_lease(expires_at);
`

// =============================================================================
// Database
// =============================================================================

const PROACTIVE_DB_PATH = process.env["KILOCLAW_PROACTIVE_DB_PATH"] ?? ".kiloclaw/proactive.db"

let _sqlite: BunDatabase | null = null
let _dbInitialized = false

// =============================================================================
// In-memory cache
// =============================================================================

const taskCache = new Map<string, ProactiveTask>()
const taskRunsCache = new Map<string, ProactiveTaskRun>()
const dlqCache = new Map<string, ProactiveDlqEntry>()
const leaseCache = new Map<string, RuntimeLease>()

const log = Log.create({ service: "kilocclaw.proactive.scheduler.store" })

// =============================================================================
// Helper functions
// =============================================================================

function initDb(): void {
  if (_dbInitialized) return

  try {
    mkdirSync(dirname(PROACTIVE_DB_PATH), { recursive: true })
    _sqlite = new BunDatabase(PROACTIVE_DB_PATH, { create: true })
    _sqlite.run("PRAGMA journal_mode = WAL")
    _sqlite.run("PRAGMA foreign_keys = ON")
    _sqlite.exec(PROACTIVE_TABLES_SQL)
    ensureRunColumns()
    _dbInitialized = true
    log.info("proactive database initialized", { path: PROACTIVE_DB_PATH })
  } catch (err) {
    log.error("failed to initialize proactive database", { err })
  }
}

function ensureRunColumns(): void {
  if (!_sqlite) return
  const cols = [
    ["attempt", "INTEGER"],
    ["scheduled_for", "INTEGER"],
    ["started_at", "INTEGER"],
    ["finished_at", "INTEGER"],
    ["error_code", "TEXT"],
    ["error_message", "TEXT"],
    ["correlation_id", "TEXT"],
    ["idempotency_key", "TEXT"],
    ["trace_id", "TEXT"],
    ["fence_token", "INTEGER"],
    ["run_type", "TEXT NOT NULL DEFAULT 'scheduled'"],
  ] as const
  for (const [name, kind] of cols) {
    try {
      _sqlite.run(`ALTER TABLE proactive_task_runs ADD COLUMN ${name} ${kind}`)
    } catch {}
  }
}

function now(): number {
  return Date.now()
}

function rowToTask(row: Record<string, unknown>): ProactiveTask {
  return {
    id: row["id"] as string,
    tenantId: row["tenant_id"] as string,
    name: row["name"] as string,
    triggerConfig: row["trigger_config"] as string,
    scheduleCron: row["schedule_cron"] as string | null,
    scheduleType: (row["schedule_type"] as "one_shot" | "recurring") ?? "recurring",
    timezone: row["timezone"] as string | null,
    displaySchedule: row["display_schedule"] as string | null,
    nextRunAt: row["next_run_at"] as number | null,
    lastScheduledFor: row["last_scheduled_for"] as number | null,
    status: row["status"] as TaskStatus,
    state: (row["state"] as TaskState) ?? "active",
    archivedAt: row["archived_at"] as number | null,
    completedAt: row["completed_at"] as number | null,
    retryCount: row["retry_count"] as number,
    maxRetries: row["max_retries"] as number,
    lastError: row["last_error"] as string | null,
    createdAt: row["created_at"] as number,
    updatedAt: row["updated_at"] as number,
  }
}

function rowToRun(row: Record<string, unknown>): ProactiveTaskRun {
  return {
    id: row["id"] as string,
    taskId: row["task_id"] as string,
    runType: (row["run_type"] as "manual" | "replay" | "scheduled") ?? "scheduled",
    attempt: (row["attempt"] as number | null) ?? undefined,
    parentRunId: row["parent_run_id"] as string | null,
    scheduledFor: row["scheduled_for"] as number | null,
    startedAt: row["started_at"] as number | null,
    finishedAt: row["finished_at"] as number | null,
    outcome: row["outcome"] as RunOutcome,
    durationMs: row["duration_ms"] as number,
    gateDecisions: row["gate_decisions"]
      ? (JSON.parse(row["gate_decisions"] as string) as Record<string, unknown>)
      : null,
    errorCode: row["error_code"] as string | null,
    errorMessage: row["error_message"] as string | null,
    correlationId: row["correlation_id"] as string | null,
    idempotencyKey: row["idempotency_key"] as string | null,
    traceId: row["trace_id"] as string | null,
    evidenceRefs: row["evidence_refs"] ? (JSON.parse(row["evidence_refs"] as string) as string[]) : null,
    createdAt: row["created_at"] as number,
  }
}

function rowToDlq(row: Record<string, unknown>): ProactiveDlqEntry {
  return {
    id: row["id"] as string,
    taskId: row["task_id"] as string,
    runId: row["run_id"] as string | null,
    error: row["error"] as string,
    payload: row["payload"] ? (JSON.parse(row["payload"] as string) as Record<string, unknown>) : null,
    retryAt: row["retry_at"] as number | null,
    createdAt: row["created_at"] as number,
  }
}

function rowToLease(row: Record<string, unknown>): RuntimeLease {
  return {
    leaseName: row["lease_name"] as string,
    ownerId: row["owner_id"] as string,
    fenceToken: row["fence_token"] as number,
    expiresAt: row["expires_at"] as number,
    updatedAt: row["updated_at"] as number,
    version: row["version"] as number,
  }
}

// Type for SQL bindings
type SqlBindings = string | number | null

// =============================================================================
// ProactiveTaskStore
// =============================================================================

export const ProactiveTaskStore = {
  create(input: CreateTaskInput): ProactiveTask {
    const timestamp = now()
    const task: ProactiveTask = {
      id: input.id,
      tenantId: input.tenantId,
      name: input.name,
      triggerConfig: input.triggerConfig,
      scheduleCron: input.scheduleCron ?? null,
      scheduleType: (input.scheduleType as "one_shot" | "recurring") ?? "recurring",
      timezone: input.timezone ?? null,
      displaySchedule: input.displaySchedule ?? null,
      nextRunAt: input.nextRunAt ?? null,
      lastScheduledFor: input.lastScheduledFor ?? null,
      status: "active",
      state: (input.state as TaskState) ?? "active",
      archivedAt: null,
      completedAt: null,
      retryCount: 0,
      maxRetries: input.maxRetries ?? 3,
      lastError: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }

    if (!_dbInitialized) initDb()

    if (_sqlite) {
      try {
        const stmt = _sqlite.prepare(
          `INSERT INTO proactive_tasks (id, tenant_id, name, trigger_config, schedule_cron, schedule_type, timezone, display_schedule, next_run_at, last_scheduled_for, status, state, archived_at, completed_at, retry_count, max_retries, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        stmt.run(
          task.id,
          task.tenantId,
          task.name,
          task.triggerConfig,
          task.scheduleCron as SqlBindings,
          task.scheduleType,
          task.timezone as SqlBindings,
          task.displaySchedule as SqlBindings,
          task.nextRunAt as SqlBindings,
          task.lastScheduledFor as SqlBindings,
          task.status,
          task.state,
          task.archivedAt as SqlBindings,
          task.completedAt as SqlBindings,
          task.retryCount,
          task.maxRetries as number,
          task.createdAt as number,
          task.updatedAt as number,
        )
      } catch (err) {
        log.error("failed to insert task to DB, using memory", { taskId: task.id, err })
        taskCache.set(task.id, task)
      }
    } else {
      taskCache.set(task.id, task)
    }

    log.info("task created", { taskId: task.id, name: task.name })
    return task
  },

  get(id: string): ProactiveTask | null {
    if (!_dbInitialized) initDb()

    if (_sqlite) {
      try {
        const row = _sqlite.prepare("SELECT * FROM proactive_tasks WHERE id = ?").get(id) as
          | Record<string, unknown>
          | undefined
        if (!row) return null
        return rowToTask(row)
      } catch {
        // Fall back to memory
      }
    }

    return taskCache.get(id) ?? null
  },

  update(id: string, updates: UpdateTaskInput): ProactiveTask | null {
    const existing = this.get(id)
    if (!existing) return null

    const timestamp = now()

    if (_sqlite) {
      try {
        const sets: string[] = []
        const values: SqlBindings[] = []

        if (updates.name !== undefined) {
          sets.push("name = ?")
          values.push(updates.name)
        }
        if (updates.triggerConfig !== undefined) {
          sets.push("trigger_config = ?")
          values.push(updates.triggerConfig)
        }
        if (updates.scheduleCron !== undefined) {
          sets.push("schedule_cron = ?")
          values.push(updates.scheduleCron ?? null)
        }
        if (updates.nextRunAt !== undefined) {
          sets.push("next_run_at = ?")
          values.push(updates.nextRunAt ?? null)
        }
        if (updates.status !== undefined) {
          sets.push("status = ?")
          values.push(updates.status)
        }
        if (updates.retryCount !== undefined) {
          sets.push("retry_count = ?")
          values.push(updates.retryCount)
        }
        if (updates.maxRetries !== undefined) {
          sets.push("max_retries = ?")
          values.push(updates.maxRetries)
        }
        if (updates.lastError !== undefined) {
          sets.push("last_error = ?")
          values.push(updates.lastError ?? null)
        }

        if (sets.length === 0) return existing

        sets.push("updated_at = ?")
        values.push(timestamp)
        values.push(id)

        _sqlite.prepare(`UPDATE proactive_tasks SET ${sets.join(", ")} WHERE id = ?`).run(...values)
      } catch (err) {
        log.error("failed to update task in DB", { err })
      }
    }

    const updated: ProactiveTask = {
      ...existing,
      name: updates.name ?? existing.name,
      triggerConfig: updates.triggerConfig ?? existing.triggerConfig,
      scheduleCron: updates.scheduleCron !== undefined ? (updates.scheduleCron ?? null) : existing.scheduleCron,
      nextRunAt: updates.nextRunAt !== undefined ? (updates.nextRunAt ?? null) : existing.nextRunAt,
      status: updates.status ?? existing.status,
      retryCount: updates.retryCount ?? existing.retryCount,
      maxRetries: updates.maxRetries ?? existing.maxRetries,
      lastError: updates.lastError !== undefined ? (updates.lastError ?? null) : existing.lastError,
      updatedAt: timestamp,
    }
    taskCache.set(id, updated)

    log.info("task updated", { taskId: id, updates: Object.keys(updates) })
    return updated
  },

  remove(id: string): boolean {
    const existing = this.get(id)
    if (!existing) return false

    if (_sqlite) {
      try {
        _sqlite.prepare("DELETE FROM proactive_tasks WHERE id = ?").run(id)
      } catch (err) {
        log.error("failed to delete task from DB", { err })
      }
    }

    taskCache.delete(id)
    log.info("task deleted", { taskId: id })
    return true
  },

  list(tenantId: string, status?: TaskStatus): ProactiveTask[] {
    if (_sqlite) {
      try {
        const rows = _sqlite.prepare("SELECT * FROM proactive_tasks ORDER BY created_at DESC").all() as Record<
          string,
          unknown
        >[]
        const tasks = rows.map(rowToTask)
        const scoped = tasks.filter((task) => task.tenantId === tenantId)
        if (!status) return scoped
        return scoped.filter((task) => task.status === status)
      } catch (err) {
        log.error("failed to list tasks from DB, using memory", { err })
      }
    }

    const tasks = [...taskCache.values()].filter((t) => t.tenantId === tenantId)
    if (status) {
      return tasks.filter((t) => t.status === status)
    }
    return tasks
  },

  getPending(limit?: number): ProactiveTask[] {
    const before = now()

    if (_sqlite) {
      try {
        let query =
          "SELECT * FROM proactive_tasks WHERE status = 'active' AND next_run_at IS NOT NULL AND next_run_at <= ? ORDER BY next_run_at ASC"

        if (limit) {
          query += " LIMIT ?"
        }

        const rows = limit
          ? (_sqlite.prepare(query).all(before, limit) as Record<string, unknown>[])
          : (_sqlite.prepare(query).all(before) as Record<string, unknown>[])

        return rows.map(rowToTask)
      } catch (err) {
        log.error("failed to get pending tasks from DB, using memory", { err })
      }
    }

    return [...taskCache.values()].filter((t) => t.status === "active" && t.nextRunAt != null && t.nextRunAt <= before)
  },

  recordRun(input: RecordRunInput): ProactiveTaskRun {
    const timestamp = now()

    const run: ProactiveTaskRun = {
      id: input.id,
      taskId: input.taskId,
      runType: (input.runType as "manual" | "replay" | "scheduled") ?? "scheduled",
      attempt: input.attempt ?? 1,
      parentRunId: input.parentRunId ?? null,
      scheduledFor: input.scheduledFor ?? null,
      startedAt: input.startedAt ?? null,
      finishedAt: input.finishedAt ?? null,
      outcome: input.outcome,
      durationMs: input.durationMs,
      gateDecisions: input.gateDecisions ?? null,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      correlationId: input.correlationId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      traceId: input.traceId ?? null,
      evidenceRefs: input.evidenceRefs ?? null,
      createdAt: timestamp,
    }

    if (_sqlite) {
      try {
        const stmt = _sqlite.prepare(
          `INSERT INTO proactive_task_runs (id, task_id, run_type, attempt, parent_run_id, scheduled_for, started_at, finished_at, outcome, duration_ms, gate_decisions, error_code, error_message, correlation_id, idempotency_key, trace_id, evidence_refs, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        stmt.run(
          run.id,
          run.taskId,
          run.runType,
          run.attempt as number,
          run.parentRunId as string | null,
          run.scheduledFor as number | null,
          run.startedAt as number | null,
          run.finishedAt as number | null,
          run.outcome,
          run.durationMs,
          run.gateDecisions ? JSON.stringify(run.gateDecisions) : null,
          run.errorCode as string | null,
          run.errorMessage as string | null,
          run.correlationId as string | null,
          run.idempotencyKey as string | null,
          run.traceId as string | null,
          run.evidenceRefs ? JSON.stringify(run.evidenceRefs) : null,
          run.createdAt as number,
        )
      } catch (err) {
        log.error("failed to record run to DB, using memory", { err })
        taskRunsCache.set(run.id, run)
      }
    } else {
      taskRunsCache.set(run.id, run)
    }

    log.info("task run recorded", { runId: run.id, taskId: run.taskId, outcome: run.outcome })
    return run
  },

  getRun(id: string): ProactiveTaskRun | null {
    if (_sqlite) {
      try {
        const row = _sqlite.prepare("SELECT * FROM proactive_task_runs WHERE id = ?").get(id) as
          | Record<string, unknown>
          | undefined
        if (!row) return null
        return rowToRun(row)
      } catch {
        // Fall back to memory
      }
    }

    return taskRunsCache.get(id) ?? null
  },

  getRuns(taskId: string, limit?: number): ProactiveTaskRun[] {
    if (_sqlite) {
      try {
        let query = "SELECT * FROM proactive_task_runs WHERE task_id = ? ORDER BY created_at DESC"

        if (limit) {
          query += " LIMIT ?"
        }

        const rows = limit
          ? (_sqlite.prepare(query).all(taskId, limit) as Record<string, unknown>[])
          : (_sqlite.prepare(query).all(taskId) as Record<string, unknown>[])

        return rows.map(rowToRun)
      } catch {
        // Fall back to memory
      }
    }

    return [...taskRunsCache.values()]
      .filter((r) => r.taskId === taskId)
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
  },

  moveToDLQ(input: MoveToDLQInput): ProactiveDlqEntry {
    const timestamp = now()

    const entry: ProactiveDlqEntry = {
      id: input.id,
      taskId: input.taskId,
      runId: input.runId ?? null,
      error: input.error,
      payload: input.payload ?? null,
      retryAt: input.retryAt ?? null,
      createdAt: timestamp,
    }

    if (_sqlite) {
      try {
        const stmt = _sqlite.prepare(
          `INSERT INTO proactive_dlq (id, task_id, run_id, error, payload, retry_at, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        stmt.run(
          entry.id,
          entry.taskId,
          entry.runId as string | null,
          entry.error,
          entry.payload ? JSON.stringify(entry.payload) : null,
          entry.retryAt as number | null,
          entry.createdAt as number,
        )
      } catch (err) {
        log.error("failed to move to DLQ in DB, using memory", { err })
        dlqCache.set(entry.id, entry)
      }
    } else {
      dlqCache.set(entry.id, entry)
    }

    log.info("task moved to DLQ", { dlqId: entry.id, taskId: entry.taskId, error: entry.error })
    return entry
  },

  getDLQEntry(id: string): ProactiveDlqEntry | null {
    if (_sqlite) {
      try {
        const row = _sqlite.prepare("SELECT * FROM proactive_dlq WHERE id = ?").get(id) as
          | Record<string, unknown>
          | undefined
        if (!row) return null
        return rowToDlq(row)
      } catch {
        // Fall back to memory
      }
    }

    return dlqCache.get(id) ?? null
  },

  getDLQ(taskId?: string, readyOnly?: boolean): ProactiveDlqEntry[] {
    const nowVal = now()

    if (_sqlite) {
      try {
        const conditions: string[] = []
        const params: SqlBindings[] = []

        if (taskId) {
          conditions.push("task_id = ?")
          params.push(taskId)
        }

        if (readyOnly) {
          conditions.push("(retry_at IS NULL OR retry_at <= ?)")
          params.push(nowVal)
        }

        let query = "SELECT * FROM proactive_dlq"
        if (conditions.length > 0) {
          query += " WHERE " + conditions.join(" AND ")
        }
        query += " ORDER BY created_at ASC"

        const rows = _sqlite.prepare(query).all(...params) as Record<string, unknown>[]
        return rows.map(rowToDlq)
      } catch (err) {
        log.error("failed to get DLQ from DB, using memory", { err })
      }
    }

    let entries = [...dlqCache.values()]

    if (taskId) {
      entries = entries.filter((e) => e.taskId === taskId)
    }

    if (readyOnly) {
      entries = entries.filter((e) => e.retryAt == null || e.retryAt <= nowVal)
    }

    return entries.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0))
  },

  removeFromDLQ(id: string): boolean {
    if (_sqlite) {
      try {
        const result = _sqlite.prepare("DELETE FROM proactive_dlq WHERE id = ?").run(id)
        if (result.changes > 0) {
          dlqCache.delete(id)
          log.info("entry removed from DLQ", { dlqId: id })
          return true
        }
        return false
      } catch (err) {
        log.error("failed to remove from DLQ in DB", { err })
      }
    }

    if (!dlqCache.has(id)) return false
    dlqCache.delete(id)
    log.info("entry removed from DLQ (memory)", { dlqId: id })
    return true
  },

  getReadyDLQEntries(): ProactiveDlqEntry[] {
    return this.getDLQ(undefined, true)
  },

  // =============================================================================
  // Lease management
  // =============================================================================

  getLease(leaseName: string): RuntimeLease | null {
    if (!_dbInitialized) initDb()

    if (_sqlite) {
      try {
        const row = _sqlite.prepare("SELECT * FROM proactive_runtime_lease WHERE lease_name = ?").get(leaseName) as
          | Record<string, unknown>
          | undefined
        if (!row) return null
        return rowToLease(row)
      } catch {
        // Fall back to memory
      }
    }

    return leaseCache.get(leaseName) ?? null
  },

  acquireLease(input: AcquireLeaseInput): RuntimeLease | null {
    const now = Date.now()
    const expiresAt = now + input.ttlMs
    const fenceToken = 1

    if (!_dbInitialized) initDb()

    if (_sqlite) {
      try {
        // Use INSERT OR REPLACE for simplicity - in production, use CAS transaction
        const stmt = _sqlite.prepare(
          `INSERT INTO proactive_runtime_lease (lease_name, owner_id, fence_token, expires_at, updated_at, version)
             VALUES (?, ?, ?, ?, ?, 1)
             ON CONFLICT(lease_name) DO UPDATE SET
               owner_id = excluded.owner_id,
               fence_token = fence_token + 1,
               expires_at = excluded.expires_at,
               updated_at = excluded.updated_at,
               version = version + 1
             WHERE expires_at < ?`,
        )
        const result = stmt.run(input.leaseName, input.ownerId, fenceToken, expiresAt, now, now)

        if (result.changes > 0) {
          const lease = this.getLease(input.leaseName)
          if (lease) {
            leaseCache.set(input.leaseName, lease)
            log.info("lease acquired", {
              leaseName: input.leaseName,
              ownerId: input.ownerId,
              fenceToken: lease.fenceToken,
            })
            return lease
          }
        }
      } catch (err) {
        log.error("failed to acquire lease in DB", { err })
      }
    }

    // Fallback to memory-based lease
    const existing = leaseCache.get(input.leaseName)
    if (existing && existing.expiresAt > now) {
      log.info("lease already held by another owner", { leaseName: input.leaseName, existingOwner: existing.ownerId })
      return null
    }

    const lease: RuntimeLease = {
      leaseName: input.leaseName,
      ownerId: input.ownerId,
      fenceToken: fenceToken,
      expiresAt,
      updatedAt: now,
      version: 1,
    }
    leaseCache.set(input.leaseName, lease)
    log.info("lease acquired (memory)", { leaseName: input.leaseName, ownerId: input.ownerId })
    return lease
  },

  renewLease(input: RenewLeaseInput): RuntimeLease | null {
    const now = Date.now()
    const expiresAt = now + input.ttlMs

    if (!_dbInitialized) initDb()

    const existing = this.getLease(input.leaseName)
    if (!existing) {
      log.warn("lease not found for renewal", { leaseName: input.leaseName })
      return null
    }

    if (existing.ownerId !== input.ownerId) {
      log.warn("lease owned by different owner", {
        leaseName: input.leaseName,
        expectedOwner: input.ownerId,
        actualOwner: existing.ownerId,
      })
      return null
    }

    if (existing.fenceToken !== input.expectedFenceToken) {
      log.warn("lease fence token mismatch", {
        leaseName: input.leaseName,
        expectedToken: input.expectedFenceToken,
        actualToken: existing.fenceToken,
      })
      return null
    }

    if (_sqlite) {
      try {
        const stmt = _sqlite.prepare(
          `UPDATE proactive_runtime_lease SET expires_at = ?, updated_at = ?, version = version + 1
             WHERE lease_name = ? AND owner_id = ? AND fence_token = ? AND expires_at > ?`,
        )
        const result = stmt.run(expiresAt, now, input.leaseName, input.ownerId, input.expectedFenceToken, now)

        if (result.changes > 0) {
          const updated = this.getLease(input.leaseName)
          if (updated) {
            leaseCache.set(input.leaseName, updated)
            log.info("lease renewed", { leaseName: input.leaseName, ownerId: input.ownerId, newExpiresAt: expiresAt })
            return updated
          }
        }
      } catch (err) {
        log.error("failed to renew lease in DB", { err })
      }
    }

    // Memory fallback
    const updated: RuntimeLease = {
      ...existing,
      expiresAt,
      updatedAt: now,
      version: existing.version + 1,
    }
    leaseCache.set(input.leaseName, updated)
    log.info("lease renewed (memory)", { leaseName: input.leaseName, ownerId: input.ownerId })
    return updated
  },

  releaseLease(input: ReleaseLeaseInput): boolean {
    const now = Date.now()

    if (!_dbInitialized) initDb()

    if (_sqlite) {
      try {
        const stmt = _sqlite.prepare(`DELETE FROM proactive_runtime_lease WHERE lease_name = ? AND owner_id = ?`)
        const result = stmt.run(input.leaseName, input.ownerId)
        if (result.changes > 0) {
          leaseCache.delete(input.leaseName)
          log.info("lease released", { leaseName: input.leaseName, ownerId: input.ownerId })
          return true
        }
        return false
      } catch (err) {
        log.error("failed to release lease in DB", { err })
      }
    }

    // Memory fallback
    const existing = leaseCache.get(input.leaseName)
    if (existing && existing.ownerId === input.ownerId) {
      leaseCache.delete(input.leaseName)
      log.info("lease released (memory)", { leaseName: input.leaseName, ownerId: input.ownerId })
      return true
    }
    return false
  },

  clearAll(): void {
    if (_sqlite) {
      try {
        _sqlite.run("DELETE FROM proactive_dlq")
        _sqlite.run("DELETE FROM proactive_task_runs")
        _sqlite.run("DELETE FROM proactive_tasks")
        _sqlite.run("DELETE FROM proactive_runtime_lease")
      } catch (err) {
        log.error("failed to clear tables in DB", { err })
      }
    }

    taskCache.clear()
    taskRunsCache.clear()
    dlqCache.clear()
    leaseCache.clear()
    log.info("all proactive data cleared")
  },
}

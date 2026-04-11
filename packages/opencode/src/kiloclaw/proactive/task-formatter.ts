/**
 * Shared task formatters for CLI and TUI output
 * Used by both non-interactive CLI and interactive TUI components
 */

import type { ProactiveTask, ProactiveTaskRun, ProactiveDlqEntry } from "./scheduler.store"
import { parseConfig } from "./scheduled-task"
import { nextRuns } from "./schedule-parse"

/**
 * Format a task for list output
 */
export function formatTaskListRow(task: ProactiveTask, runs?: ProactiveTaskRun[]): TaskListRow {
  const lastOutcome = runs?.[0]?.outcome ?? "-"
  const nextRun = task.nextRunAt ? formatRelativeTime(task.nextRunAt) : "-"
  return {
    id: task.id,
    ref: task.ref,
    name: task.name,
    schedule: task.scheduleCron ?? "-",
    nextRun,
    status: task.status,
    lastOutcome,
  }
}

/**
 * Format a task for detailed output
 */
export function formatTaskDetail(task: ProactiveTask, runs: ProactiveTaskRun[], dlqCount?: number): TaskDetail {
  const config = parseConfig(task.triggerConfig)
  const tz = typeof config.timezone === "string" ? config.timezone : Intl.DateTimeFormat().resolvedOptions().timeZone
  const preview = task.scheduleCron ? nextRuns({ cron: task.scheduleCron, timezone: tz, count: 2 }) : []

  return {
    id: task.id,
    ref: task.ref,
    name: task.name,
    status: task.status,
    schedule: task.scheduleCron,
    timezone: tz,
    prompt: config.prompt as string | undefined,
    nextRunAt: task.nextRunAt,
    nextRunsPreview: preview.map((ts) => new Date(ts).toISOString()),
    retry: config.retry as RetryConfig | undefined,
    concurrency: config.concurrency as string | undefined,
    startingDeadlineMs: config.startingDeadlineMs as number | undefined,
    missedRunPolicy: config.missedRunPolicy as string | undefined,
    requireApproval: config.requireApproval as string | undefined,
    quietHours: config.quietHours as QuietHoursConfig | undefined,
    lastError: task.lastError ?? null,
    lastRun: runs[0] ?? null,
    recentRuns: runs.slice(0, 10),
    dlqCount: dlqCount ?? 0,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    tenantId: task.tenantId,
  }
}

/**
 * Format a run for list output
 */
export function formatRunRow(run: ProactiveTaskRun): RunRow {
  return {
    id: run.id,
    taskId: run.taskId,
    attempt: run.attempt ?? 1,
    outcome: run.outcome,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    durationMs: run.durationMs,
    scheduledFor: run.scheduledFor,
    errorCode: run.errorCode ?? null,
    errorMessage: run.errorMessage ?? null,
    correlationId: run.correlationId ?? null,
    traceId: run.traceId ?? null,
    gateDecisions: run.gateDecisions ?? null,
  }
}

/**
 * Format a DLQ entry for list output
 */
export function formatDlqRow(entry: ProactiveDlqEntry, taskName?: string): DlqRow {
  return {
    id: entry.id,
    taskId: entry.taskId,
    taskName: taskName ?? entry.taskId,
    runId: entry.runId ?? null,
    error: entry.error,
    errorCode: extractErrorCode(entry.error),
    payload: entry.payload ?? null,
    retryAt: entry.retryAt,
    isReady: !entry.retryAt || entry.retryAt <= Date.now(),
    createdAt: entry.createdAt,
  }
}

/**
 * Extract error code from error message
 */
function extractErrorCode(error: string): string {
  const match = error.match(/\(([A-Z_]+)\)/)
  return match?.[1] ?? "ERR"
}

/**
 * Format relative time string
 */
function formatRelativeTime(ts: number): string {
  const now = Date.now()
  const diff = ts - now
  if (diff < 0) return "overdue"
  if (diff < 60 * 60 * 1000) return `in ${Math.floor(diff / 60000)}m`
  if (diff < 24 * 60 * 60 * 1000) return `in ${Math.floor(diff / 3600000)}h`
  if (diff < 7 * 24 * 60 * 60 * 1000) return `in ${Math.floor(diff / (24 * 3600000))}d`
  return new Date(ts).toLocaleDateString()
}

/**
 * Format timestamp to ISO string or "-"
 */
export function formatTimestamp(ts: number | null | undefined): string {
  if (!ts) return "-"
  return new Date(ts).toISOString()
}

/**
 * Format duration in human-readable form
 */
export function formatDuration(ms: number | undefined): string {
  if (!ms) return "-"
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

// Types for formatted output

export interface TaskListRow {
  id: string
  ref: string
  name: string
  schedule: string
  nextRun: string
  status: string
  lastOutcome: string
}

export interface TaskDetail {
  id: string
  ref: string
  name: string
  status: string
  schedule: string | null | undefined
  timezone: string
  prompt: string | undefined
  nextRunAt: number | null | undefined
  nextRunsPreview: string[]
  retry: RetryConfig | undefined
  concurrency: string | undefined
  startingDeadlineMs: number | undefined
  missedRunPolicy: string | undefined
  requireApproval: string | undefined
  quietHours: QuietHoursConfig | undefined
  lastError: string | null
  lastRun: ProactiveTaskRun | null
  recentRuns: ProactiveTaskRun[]
  dlqCount: number
  createdAt: number | null | undefined
  updatedAt: number | null | undefined
  tenantId: string
}

export interface RetryConfig {
  maxAttempts: number
  backoff: string
  baseMs: number
  maxMs: number
  jitter: number
}

export interface QuietHoursConfig {
  start: string
  end: string
}

export interface RunRow {
  id: string
  taskId: string
  attempt: number
  outcome: string
  startedAt: number | null | undefined
  finishedAt: number | null | undefined
  durationMs: number | undefined
  scheduledFor: number | null | undefined
  errorCode: string | null
  errorMessage: string | null
  correlationId: string | null
  traceId: string | null
  gateDecisions: Record<string, unknown> | null
}

export interface DlqRow {
  id: string
  taskId: string
  taskName: string
  runId: string | null
  error: string
  errorCode: string
  payload: Record<string, unknown> | null
  retryAt: number | null | undefined
  isReady: boolean
  createdAt: number | null | undefined
}

/**
 * Check if running in a TTY (interactive mode)
 */
export function isInteractive(): boolean {
  return process.stdin.isTTY === true && process.stdout.isTTY === true
}

/**
 * Check if JSON output is requested
 */
export function wantsJson(args: { json?: boolean }): boolean {
  return args.json === true
}

/**
 * Proactive Scheduler Engine - Persistent tick-based dispatcher
 */

import { Log } from "@/util/log"
import z from "zod"
import { ProactiveTaskStore, type ProactiveTask, type ProactiveDlqEntry, type RunOutcome } from "./scheduler.store"
import { BudgetManager } from "./budget"
import { ProactivityLimitsManager } from "./limits"
import type { TriggerEvent } from "./trigger"
import { createHash } from "node:crypto"
import { nextRuns } from "./schedule-parse"
import { Flag } from "@/flag/flag"
import { emitTaskNotification } from "./notifications"

// =============================================================================
// Types
// =============================================================================

export interface GateResult {
  allowed: boolean
  reasons: string[]
  blockers: string[]
  metadata?: Record<string, unknown>
}

export interface ExecutionContext {
  task: ProactiveTask
  triggerEvent?: TriggerEvent
  runId: string
  startedAt: number
}

export interface ExecutionResult {
  ok: boolean
  errorCode?: string
  errorMessage?: string
  evidenceRefs?: string[]
}

export type TaskExecutor = (context: ExecutionContext) => Promise<ExecutionResult | void>

export interface PolicyGate {
  evaluate(task: ProactiveTask, context?: ExecutionContext): Promise<GateResult>
}

export const SchedulerEngineConfigSchema = z.object({
  tickMs: z.number().int().positive().default(1000),
  maxConcurrent: z.number().int().positive().default(10),
  defaultMaxRetries: z.number().int().nonnegative().default(3),
  baseBackoffMs: z.number().int().positive().default(1000),
  maxBackoffMs: z.number().int().positive().default(300000),
  dlqCheckIntervalMs: z.number().int().positive().default(60000),
})

export type SchedulerEngineConfig = z.infer<typeof SchedulerEngineConfigSchema>

export interface SchedulerEngineStats {
  isRunning: boolean
  lastTickAt: number | null
  tasksProcessed: number
  tasksSucceeded: number
  tasksFailed: number
  tasksBlocked: number
  dlqEntries: number
  pendingTasks: number
}

// =============================================================================
// Default Policy Gate
// =============================================================================

export class DefaultPolicyGate implements PolicyGate {
  private readonly log: ReturnType<typeof Log.create>
  private budgetManager: BudgetManager | null = null
  private limitsManager: ProactivityLimitsManager | null = null

  constructor(budgetManager?: BudgetManager, limitsManager?: ProactivityLimitsManager) {
    this.log = Log.create({ service: "kilocclaw.proactive.scheduler.engine.policy_gate" })
    this.budgetManager = budgetManager ?? null
    this.limitsManager = limitsManager ?? null
  }

  async evaluate(task: ProactiveTask, _context?: ExecutionContext): Promise<GateResult> {
    const reasons: string[] = []
    const blockers: string[] = []

    if (this.budgetManager) {
      const budgetOk = this.budgetManager.checkLimit("act_low_risk")
      if (!budgetOk) {
        blockers.push("Budget limit exceeded")
        return { allowed: false, reasons: ["budget exceeded"], blockers }
      }
      reasons.push("budget available")
    } else {
      reasons.push("no budget check")
    }

    if (this.limitsManager) {
      const mode = this.limitsManager.getConfirmationMode()
      if (mode === "explicit_approval") {
        blockers.push("Explicit approval required")
        return { allowed: false, reasons, blockers }
      }
      reasons.push("policy passed")
    } else {
      reasons.push("no policy check")
    }

    return {
      allowed: true,
      reasons,
      blockers: [],
    }
  }
}

// =============================================================================
// ProactiveSchedulerEngine
// =============================================================================

export const ProactiveSchedulerEngine = {
  isRunning: false,
  tickInterval: null as ReturnType<typeof setInterval> | null,
  dlqCheckInterval: null as ReturnType<typeof setInterval> | null,
  config: null as SchedulerEngineConfig | null,
  policyGate: null as PolicyGate | null,
  taskExecutor: null as TaskExecutor | null,
  mode: "standalone" as "standalone" | "daemon",

  lastTickAt: null as number | null,
  tasksProcessed: 0,
  tasksSucceeded: 0,
  tasksFailed: 0,
  tasksBlocked: 0,

  // Track in-flight task instances for max_instances enforcement
  inFlightTasks: new Map<string, number>(),

  log: Log.create({ service: "kilocclaw.proactive.scheduler.engine" }),

  /**
   * Misfire handling conforming to APScheduler semantics:
   * - skip: do not run missed jobs at all
   * - catchup_one: run the most recent missed job once
   * - catchup_all: run all missed jobs (burst mode)
   */
  misfireDecision(
    task: ProactiveTask,
    now: number,
  ): { action: "skip" | "catchup_one" | "catchup_all"; coalescedCount: number } {
    const cfg = this.taskConfig(task)
    const policy: "skip" | "catchup_one" | "catchup_all" =
      (cfg.missedRunPolicy as "skip" | "catchup_one" | "catchup_all") ?? "catchup_one"
    const nextRunAt = task.nextRunAt ?? 0
    const startingDeadlineMs = (cfg.startingDeadlineMs as number) ?? 600_000

    if (nextRunAt > now) {
      return { action: "skip", coalescedCount: 0 }
    }

    if (now - nextRunAt > startingDeadlineMs) {
      this.log.info("task missed starting deadline, applying misfire policy", {
        taskId: task.id,
        nextRunAt,
        now,
        overdueMs: now - nextRunAt,
        policy,
      })
    }

    switch (policy) {
      case "skip":
        return { action: "skip", coalescedCount: 0 }
      case "catchup_one":
        return { action: "catchup_one", coalescedCount: 1 }
      case "catchup_all":
        // Count how many runs we missed
        const missedCount = Math.floor((now - nextRunAt) / (this.config?.tickMs ?? 1000))
        return { action: "catchup_all", coalescedCount: Math.min(missedCount, 100) }
    }
  },

  /**
   * Check if task has reached max_instances limit.
   */
  checkMaxInstances(task: ProactiveTask): boolean {
    const cfg = this.taskConfig(task)
    const maxInstances = (cfg.maxInstances as number) ?? 1
    const currentCount = this.inFlightTasks.get(task.id) ?? 0
    return currentCount < maxInstances
  },

  /**
   * Increment in-flight count for a task.
   */
  addInFlight(taskId: string): void {
    const current = this.inFlightTasks.get(taskId) ?? 0
    this.inFlightTasks.set(taskId, current + 1)
  },

  /**
   * Decrement in-flight count for a task.
   */
  removeInFlight(taskId: string): void {
    const current = this.inFlightTasks.get(taskId) ?? 0
    if (current <= 1) {
      this.inFlightTasks.delete(taskId)
    } else {
      this.inFlightTasks.set(taskId, current - 1)
    }
  },

  /**
   * Calculate retry backoff with deterministic jitter.
   * Jitter is based on retry count and task id for idempotency.
   * Conforms to Celery exponential backoff + jitter pattern.
   */
  calculateBackoff(retryCount: number, taskId: string): number {
    if (!this.config) return 1000 * Math.pow(2, retryCount - 1)
    const delay = this.config.baseBackoffMs * Math.pow(2, retryCount - 1)
    const cappedDelay = Math.min(delay, this.config.maxBackoffMs)

    // Extract jitter config from task
    const jitter = 0.2 // default
    const jitteredDelay = this.applyJitter(cappedDelay, retryCount, taskId, jitter)
    return jitteredDelay
  },

  /**
   * Apply deterministic jitter based on retry count and task id.
   * Uses a simple hash to ensure same retry count + task id always produces same jitter factor.
   */
  applyJitter(delay: number, retryCount: number, taskId: string, jitterFactor: number): number {
    if (jitterFactor <= 0) return delay
    // Deterministic hash using taskId + retryCount
    const hash = this.simpleHash(`${taskId}:${retryCount}`)
    // Normalize to [0, jitterFactor] range
    const jitterAmount = jitterFactor * delay
    const randomFactor = (hash % 1000) / 1000 // [0, 0.999]
    return Math.floor(delay + randomFactor * jitterAmount)
  },

  /**
   * Simple string hash for deterministic jitter.
   */
  simpleHash(input: string): number {
    let hash = 0
    for (let i = 0; i < input.length; i++) {
      const char = input.charCodeAt(i)
      hash = ((hash << 5) - hash + char) | 0
    }
    return Math.abs(hash)
  },

  init(input: Partial<SchedulerEngineConfig> & { policyGate?: PolicyGate } = {}): void {
    this.config = {
      tickMs: input.tickMs ?? 1000,
      maxConcurrent: input.maxConcurrent ?? 10,
      defaultMaxRetries: input.defaultMaxRetries ?? 3,
      baseBackoffMs: input.baseBackoffMs ?? 1000,
      maxBackoffMs: input.maxBackoffMs ?? 300000,
      dlqCheckIntervalMs: input.dlqCheckIntervalMs ?? 60000,
    }

    this.policyGate = input.policyGate ?? new DefaultPolicyGate()

    this.log.info("scheduler engine initialized", { config: this.config })
  },

  setExecutor(executor: TaskExecutor): void {
    this.taskExecutor = executor
    this.log.info("task executor set")
  },

  start(input?: { mode?: "standalone" | "daemon" }): void {
    if (!this.config) {
      this.log.error("scheduler engine not initialized, call init() first")
      return
    }

    if (!this.taskExecutor) {
      this.log.error("scheduler engine cannot start: no executor registered. Call setExecutor() before start()")
      return
    }

    if (this.isRunning) {
      this.log.warn("scheduler engine already running")
      return
    }

    this.mode = input?.mode ?? "standalone"
    this.isRunning = true

    if (this.mode === "standalone") {
      this.tickInterval = setInterval(() => this.tick(), this.config!.tickMs)
      this.dlqCheckInterval = setInterval(() => this.dlqTick(), this.config!.dlqCheckIntervalMs)
    }

    this.recoverPendingTasks()

    this.log.info("scheduler engine started", {
      mode: this.mode,
      tickMs: this.config.tickMs,
      dlqCheckIntervalMs: this.config.dlqCheckIntervalMs,
    })
  },

  stop(): void {
    if (!this.isRunning) {
      this.log.warn("scheduler engine not running")
      return
    }

    this.isRunning = false

    if (this.tickInterval) {
      clearInterval(this.tickInterval)
      this.tickInterval = null
    }

    if (this.dlqCheckInterval) {
      clearInterval(this.dlqCheckInterval)
      this.dlqCheckInterval = null
    }

    this.inFlightTasks.clear()

    this.log.info("scheduler engine stopped")
  },

  getIsRunning(): boolean {
    return this.isRunning
  },

  hasExecutor(): boolean {
    return this.taskExecutor !== null
  },

  getStats(): SchedulerEngineStats {
    const pendingTasks = ProactiveTaskStore.getPending()
    const dlqEntries = ProactiveTaskStore.getDLQ()

    return {
      isRunning: this.isRunning,
      lastTickAt: this.lastTickAt,
      tasksProcessed: this.tasksProcessed,
      tasksSucceeded: this.tasksSucceeded,
      tasksFailed: this.tasksFailed,
      tasksBlocked: this.tasksBlocked,
      dlqEntries: dlqEntries.length,
      pendingTasks: pendingTasks.length,
    }
  },

  async executeTask(input: { taskId: string; runType?: "scheduled" | "manual" | "replay" }): Promise<boolean> {
    const task = ProactiveTaskStore.get(input.taskId)
    if (!task) {
      this.log.error("task not found for execution", { taskId: input.taskId })
      return false
    }

    return this.executeTaskInternal(task, input.runType ?? "scheduled")
  },

  async processDLQ(): Promise<number> {
    return this.dlqTickInternal()
  },

  recoverPendingTasks(): number {
    const pendingTasks = ProactiveTaskStore.getPending()
    let recovered = 0

    for (const task of pendingTasks) {
      const recentRuns = ProactiveTaskStore.getRuns(task.id, 1)
      const lastRun = recentRuns[0]

      if (lastRun && Date.now() - (lastRun.createdAt ?? 0) < 60000) {
        this.log.info("skipping recently executed task during recovery", {
          taskId: task.id,
          lastRunAt: lastRun.createdAt,
        })
      } else {
        recovered++
      }
    }

    this.log.info("pending tasks recovery check complete", { count: recovered })
    return recovered
  },

  tick(): void {
    if (!this.isRunning || !this.config) return

    this.lastTickAt = Date.now()

    try {
      const pendingTasks = ProactiveTaskStore.getPending(this.config.maxConcurrent)

      for (const task of pendingTasks) {
        if (this.inFlightTasks.has(task.id)) {
          this.log.debug("task already in flight, skipping", { taskId: task.id })
          continue
        }

        this.executeTaskInternal(task).catch((err) => {
          this.log.error("task execution error", { taskId: task.id, err })
        })
      }
    } catch (err) {
      this.log.error("tick error", { err })
    }
  },

  dlqTick(): void {
    if (!this.isRunning) return
    this.dlqTickInternal().catch((err) => {
      this.log.error("DLQ tick error", { err })
    })
  },

  async dlqTickInternal(): Promise<number> {
    const readyEntries = ProactiveTaskStore.getReadyDLQEntries()
    let retried = 0

    for (const entry of readyEntries) {
      const task = ProactiveTaskStore.get(entry.taskId)
      if (!task) {
        this.log.warn("DLQ entry references missing task", { dlqId: entry.id, taskId: entry.taskId })
        ProactiveTaskStore.removeFromDLQ(entry.id)
        continue
      }

      ProactiveTaskStore.update(task.id, {
        status: "active",
        nextRunAt: Date.now(),
      })

      emitTaskNotification(task, { type: "dlq_replay", entry })

      ProactiveTaskStore.removeFromDLQ(entry.id)

      await this.executeTaskInternal(task)
      retried++
    }

    if (retried > 0) {
      this.log.info("DLQ entries retried", { count: retried })
    }

    return retried
  },

  async executeTaskInternal(
    task: ProactiveTask,
    runType: "scheduled" | "manual" | "replay" = "scheduled",
  ): Promise<boolean> {
    const runId = `run_${crypto.randomUUID()}`
    const scheduledFor = task.nextRunAt ?? Date.now()
    const attempt = task.retryCount + 1
    const cfg = this.taskConfig(task)
    const salt = typeof cfg.idempotencySalt === "string" ? cfg.idempotencySalt : task.id
    const correlationId = `corr_${crypto.randomUUID()}`
    const idempotencyKey = createHash("sha256").update(`${task.id}:${scheduledFor}:${attempt}:${salt}`).digest("hex")
    const traceId = `trace_${crypto.randomUUID()}`

    if (this.inFlightTasks.has(task.id)) {
      this.log.debug("task already in flight", { taskId: task.id })
      return false
    }

    this.inFlightTasks.set(task.id, 1)

    const startedAt = Date.now()
    let outcome: RunOutcome = "success"
    let gateResult: GateResult | null = null

    try {
      const context: ExecutionContext = {
        task,
        runId,
        startedAt,
      }

      gateResult = await this.policyGate!.evaluate(task, context)

      if (!gateResult.allowed) {
        outcome = "policy_denied"
        this.log.info("task blocked by policy gate", {
          taskId: task.id,
          blockers: gateResult.blockers,
        })

        this.recordTaskRun(runId, task, outcome, startedAt, gateResult, null, {
          attempt,
          scheduledFor,
          correlationId,
          idempotencyKey,
          traceId,
          runType,
        })
        const run = ProactiveTaskStore.getRuns(task.id, 1)[0]
        if (run) emitTaskNotification(task, { type: "run_policy_denied", run })
        this.tasksBlocked++
        this.tasksProcessed++

        return false
      }

      if (!this.executeWithBudget(task)) {
        outcome = "budget_exceeded"
        this.recordTaskRun(runId, task, outcome, startedAt, gateResult, null, {
          attempt,
          scheduledFor,
          correlationId,
          idempotencyKey,
          traceId,
          runType,
        })
        const run = ProactiveTaskStore.getRuns(task.id, 1)[0]
        if (run) emitTaskNotification(task, { type: "run_budget_exceeded", run })
        this.tasksBlocked++
        this.tasksProcessed++

        return false
      }

      if (this.taskExecutor) {
        const result = await this.taskExecutor(context)
        const exec = result ?? { ok: true, evidenceRefs: [] }
        if (!exec.ok) {
          outcome = "failed"
          this.recordTaskRun(
            runId,
            task,
            outcome,
            startedAt,
            gateResult,
            { error: exec.errorMessage ?? "executor failed" },
            {
              attempt,
              scheduledFor,
              correlationId,
              idempotencyKey,
              traceId,
              runType,
              errorCode: exec.errorCode ?? "task_execution_failed",
              evidenceRefs: exec.evidenceRefs ?? null,
            },
          )
          const failedRun = ProactiveTaskStore.getRuns(task.id, 1)[0]
          if (failedRun)
            emitTaskNotification(task, {
              type: "run_failed",
              run: failedRun,
              error: exec.errorMessage ?? exec.errorCode ?? "executor failed",
            })
          this.tasksFailed++
          this.tasksProcessed++
          return false
        }
        outcome = "success"
        this.recordTaskRun(runId, task, outcome, startedAt, gateResult, null, {
          attempt,
          scheduledFor,
          correlationId,
          idempotencyKey,
          traceId,
          runType,
          evidenceRefs: exec.evidenceRefs ?? null,
        })
      } else {
        this.log.warn("no task executor registered", { taskId: task.id })
        outcome = "executor_missing"
        this.recordTaskRun(
          runId,
          task,
          outcome,
          startedAt,
          gateResult,
          { error: "no executor registered" },
          {
            attempt,
            scheduledFor,
            correlationId,
            idempotencyKey,
            traceId,
            runType,
            errorCode: "executor_missing",
          },
        )
        const run = ProactiveTaskStore.getRuns(task.id, 1)[0]
        if (run) emitTaskNotification(task, { type: "run_failed", run, error: "no executor registered" })
        this.tasksFailed++
        this.tasksProcessed++
        this.inFlightTasks.delete(task.id)
        return false
      }

      const run = ProactiveTaskStore.getRuns(task.id, 1)[0]
      if (run) emitTaskNotification(task, { type: "run_success", run })

      const nextRunAt = this.calculateNextRun(task)
      ProactiveTaskStore.update(task.id, {
        status: "active",
        nextRunAt,
        retryCount: 0,
        lastError: null,
      })

      this.tasksSucceeded++
      this.tasksProcessed++

      this.log.info("task executed successfully", {
        taskId: task.id,
        durationMs: Date.now() - startedAt,
        nextRunAt,
      })

      return true
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      outcome = "failed"

      this.log.error("task execution failed", {
        taskId: task.id,
        error: errorMsg,
        retryCount: task.retryCount,
      })

      const retryCount = task.retryCount + 1
      const maxRetries = task.maxRetries ?? this.config?.defaultMaxRetries ?? 3

      if (retryCount >= maxRetries) {
        const dlqEntry = ProactiveTaskStore.moveToDLQ({
          id: `dlq-${Date.now()}-${task.id}`,
          taskId: task.id,
          runId,
          error: errorMsg,
          payload: { triggerConfig: task.triggerConfig },
          retryAt: Date.now() + this.calculateBackoff(retryCount, task.id),
        })

        ProactiveTaskStore.update(task.id, {
          status: "dlq",
          retryCount,
          lastError: errorMsg,
        })

        this.log.info("task moved to DLQ", {
          taskId: task.id,
          dlqId: dlqEntry.id,
          maxRetries,
        })
        emitTaskNotification(task, { type: "dlq_move", entry: dlqEntry })
      } else {
        const nextRunAt = Date.now() + this.calculateBackoff(retryCount, task.id)

        ProactiveTaskStore.update(task.id, {
          status: "active",
          nextRunAt,
          retryCount,
          lastError: errorMsg,
        })

        this.log.info("task scheduled for retry", {
          taskId: task.id,
          retryCount,
          nextRunAt,
          backoffMs: this.calculateBackoff(retryCount, task.id),
        })
      }

      this.recordTaskRun(
        runId,
        task,
        outcome,
        startedAt,
        gateResult,
        { error: errorMsg },
        {
          attempt,
          scheduledFor,
          correlationId,
          idempotencyKey,
          traceId,
          runType,
          errorCode: "task_execution_failed",
        },
      )
      const failedRun = ProactiveTaskStore.getRuns(task.id, 1)[0]
      if (failedRun) emitTaskNotification(task, { type: "run_failed", run: failedRun, error: errorMsg })
      this.tasksFailed++
      this.tasksProcessed++

      return false
    } finally {
      this.inFlightTasks.delete(task.id)
    }
  },

  executeWithBudget(_task: ProactiveTask): boolean {
    return true
  },

  recordTaskRun(
    runId: string,
    task: ProactiveTask,
    outcome: RunOutcome,
    startedAt: number,
    gateResult: GateResult | null,
    errorInfo: { error: string } | null,
    meta?: {
      attempt: number
      scheduledFor: number
      correlationId: string
      idempotencyKey: string
      traceId: string
      runType?: "scheduled" | "manual" | "replay"
      errorCode?: string
      evidenceRefs?: string[] | null
    },
  ): void {
    const durationMs = Date.now() - startedAt

    const gateDecisions: Record<string, unknown> = {}
    if (gateResult) {
      gateDecisions.allowed = gateResult.allowed
      gateDecisions.reasons = gateResult.reasons
      gateDecisions.blockers = gateResult.blockers
    }
    if (errorInfo) {
      gateDecisions.error = errorInfo.error
    }

    ProactiveTaskStore.recordRun({
      id: runId,
      taskId: task.id,
      runType: meta?.runType ?? "scheduled",
      attempt: meta?.attempt,
      scheduledFor: meta?.scheduledFor,
      startedAt,
      finishedAt: Date.now(),
      outcome,
      durationMs,
      gateDecisions,
      errorCode: meta?.errorCode
        ? meta.errorCode
        : errorInfo
          ? "task_execution_failed"
          : outcome === "policy_denied"
            ? "policy_denied"
            : outcome === "budget_exceeded"
              ? "budget_exceeded"
              : null,
      errorMessage: errorInfo?.error ?? null,
      correlationId: meta?.correlationId,
      idempotencyKey: meta?.idempotencyKey,
      traceId: meta?.traceId,
      evidenceRefs: meta?.evidenceRefs ?? null,
    })
  },

  taskConfig(task: ProactiveTask): Record<string, unknown> {
    try {
      return JSON.parse(task.triggerConfig) as Record<string, unknown>
    } catch {
      return {}
    }
  },

  calculateNextRun(task: ProactiveTask): number | null {
    const cron = task.scheduleCron
    if (!cron) return null

    // Use unified timezone-aware scheduler if flag is enabled
    if (Flag.KILOCLAW_SCHEDULER_NEXTRUN_UNIFIED) {
      try {
        const config = this.taskConfig(task)
        const timezone =
          typeof config.timezone === "string" ? config.timezone : Intl.DateTimeFormat().resolvedOptions().timeZone
        const runs = nextRuns({ cron, timezone, count: 1 })
        return runs[0] ?? null
      } catch (err) {
        this.log.warn("failed to compute next run with nextRuns", { taskId: task.id, err })
      }
    }

    // Fallback to legacy behavior
    try {
      const parts = cron.split(" ")
      if (parts.length >= 2) {
        const minute = parseInt(parts[0], 10)
        const hour = parseInt(parts[1], 10)
        const now = new Date()
        const next = new Date(now)
        next.setHours(hour, minute, 0, 0)

        if (next.getTime() <= now.getTime()) {
          next.setDate(next.getDate() + 1)
        }

        return next.getTime()
      }
    } catch {
      this.log.warn("failed to parse cron expression", { cron })
    }

    return Date.now() + 86400000
  },
}

export const ProactiveSchedulerEngine$ = {
  create: (cfg: SchedulerEngineConfig) => {
    ProactiveSchedulerEngine.init(cfg)
    return {
      start: () => ProactiveSchedulerEngine.start(),
      stop: () => ProactiveSchedulerEngine.stop(),
      getStats: () => ProactiveSchedulerEngine.getStats(),
      executeTask: (taskId: string, runType?: "scheduled" | "manual" | "replay") =>
        ProactiveSchedulerEngine.executeTask({ taskId, runType }),
      processDLQ: () => ProactiveSchedulerEngine.processDLQ(),
      setExecutor: (executor: TaskExecutor) => ProactiveSchedulerEngine.setExecutor(executor),
    }
  },
}

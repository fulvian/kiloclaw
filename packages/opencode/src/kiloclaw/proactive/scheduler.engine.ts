/**
 * Proactive Scheduler Engine - Persistent tick-based dispatcher
 */

import { Log } from "@/util/log"
import z from "zod"
import { ProactiveTaskStore, type ProactiveTask, type RunOutcome } from "./scheduler.store"
import { BudgetManager } from "./budget"
import { ProactivityLimitsManager } from "./limits"
import type { TriggerEvent } from "./trigger"

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

export type TaskExecutor = (context: ExecutionContext) => Promise<void>

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
  inFlightTasks: new Set<string>(),

  lastTickAt: null as number | null,
  tasksProcessed: 0,
  tasksSucceeded: 0,
  tasksFailed: 0,
  tasksBlocked: 0,

  log: Log.create({ service: "kilocclaw.proactive.scheduler.engine" }),

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

  start(): void {
    if (!this.config) {
      this.log.error("scheduler engine not initialized, call init() first")
      return
    }

    if (this.isRunning) {
      this.log.warn("scheduler engine already running")
      return
    }

    this.isRunning = true

    this.tickInterval = setInterval(() => this.tick(), this.config!.tickMs)
    this.dlqCheckInterval = setInterval(() => this.dlqTick(), this.config!.dlqCheckIntervalMs)

    this.recoverPendingTasks()

    this.log.info("scheduler engine started", {
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

  async executeTask(input: { taskId: string }): Promise<boolean> {
    const task = ProactiveTaskStore.get(input.taskId)
    if (!task) {
      this.log.error("task not found for execution", { taskId: input.taskId })
      return false
    }

    return this.executeTaskInternal(task)
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

      ProactiveTaskStore.removeFromDLQ(entry.id)

      await this.executeTaskInternal(task)
      retried++
    }

    if (retried > 0) {
      this.log.info("DLQ entries retried", { count: retried })
    }

    return retried
  },

  async executeTaskInternal(task: ProactiveTask): Promise<boolean> {
    const runId = `run-${Date.now()}-${task.id}`

    if (this.inFlightTasks.has(task.id)) {
      this.log.debug("task already in flight", { taskId: task.id })
      return false
    }

    this.inFlightTasks.add(task.id)

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

        this.recordTaskRun(runId, task, outcome, startedAt, gateResult, null)
        this.tasksBlocked++
        this.tasksProcessed++

        return false
      }

      if (!this.executeWithBudget(task)) {
        outcome = "budget_exceeded"
        this.recordTaskRun(runId, task, outcome, startedAt, gateResult, null)
        this.tasksBlocked++
        this.tasksProcessed++

        return false
      }

      if (this.taskExecutor) {
        await this.taskExecutor(context)
      } else {
        this.log.warn("no task executor registered", { taskId: task.id })
      }

      outcome = "success"
      this.recordTaskRun(runId, task, outcome, startedAt, gateResult, null)

      const nextRunAt = this.calculateNextRun(task.scheduleCron ?? null)
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
          retryAt: Date.now() + this.calculateBackoff(retryCount),
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
      } else {
        const nextRunAt = Date.now() + this.calculateBackoff(retryCount)

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
          backoffMs: this.calculateBackoff(retryCount),
        })
      }

      this.recordTaskRun(runId, task, outcome, startedAt, gateResult, { error: errorMsg })
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
      outcome,
      durationMs,
      gateDecisions,
      evidenceRefs: null,
    })
  },

  calculateNextRun(cron: string | null): number | null {
    if (!cron) return null

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

  calculateBackoff(retryCount: number): number {
    if (!this.config) return 1000 * Math.pow(2, retryCount - 1)
    const delay = this.config.baseBackoffMs * Math.pow(2, retryCount - 1)
    return Math.min(delay, this.config.maxBackoffMs)
  },
}

export const ProactiveSchedulerEngine$ = {
  create: (cfg: SchedulerEngineConfig) => {
    ProactiveSchedulerEngine.init(cfg)
    return {
      start: () => ProactiveSchedulerEngine.start(),
      stop: () => ProactiveSchedulerEngine.stop(),
      getStats: () => ProactiveSchedulerEngine.getStats(),
      executeTask: (taskId: string) => ProactiveSchedulerEngine.executeTask({ taskId }),
      processDLQ: () => ProactiveSchedulerEngine.processDLQ(),
      setExecutor: (executor: TaskExecutor) => ProactiveSchedulerEngine.setExecutor(executor),
    }
  },
}

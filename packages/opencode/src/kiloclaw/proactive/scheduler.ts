/**
 * Proactive Scheduler - Task scheduling and execution
 */

import { Log } from "@/util/log"
import z from "zod"
import type { TriggerCondition, TriggerEvent } from "./trigger"
import { TriggerEvaluator } from "./trigger"
import { BudgetManager, type BudgetStats } from "./budget"
import { ProactiveTaskStore, type ProactiveTask } from "./scheduler.store"
import { ProactiveSchedulerEngine } from "./scheduler.engine"

// =============================================================================
// Scheduled task definition
// =============================================================================

export interface ScheduledTask {
  readonly id: string
  readonly name: string
  readonly trigger: TriggerCondition
  readonly action: () => Promise<void>
  readonly enabled: boolean
  tenantId?: string
  lastRun?: Date
  nextRun?: Date
}

export interface SchedulerEvent {
  readonly taskId: string
  readonly type: "scheduled" | "triggered" | "completed" | "failed"
  readonly timestamp: Date
  readonly details?: string
}

// =============================================================================
// ProactiveScheduler
// =============================================================================

export const ProactiveSchedulerOptionsSchema = z.object({
  totalDailyBudget: z.number().int().positive().optional(),
  usePersistentStore: z.boolean().default(false),
  tenantId: z.string().optional(),
})

export type ProactiveSchedulerOptions = z.infer<typeof ProactiveSchedulerOptionsSchema>

export class ProactiveScheduler {
  private readonly log: ReturnType<typeof Log.create>
  private readonly triggerEvaluator: TriggerEvaluator
  private readonly budgetManager: BudgetManager
  private readonly tasks: Map<string, ScheduledTask>
  private readonly eventLog: SchedulerEvent[]
  private paused: boolean
  private readonly usePersistentStore: boolean
  private readonly tenantId: string | null

  constructor(options?: ProactiveSchedulerOptions) {
    this.log = Log.create({ service: "kilocclaw.proactive.scheduler" })
    this.triggerEvaluator = new TriggerEvaluator()
    this.budgetManager = new BudgetManager(options?.totalDailyBudget ?? 100)
    this.tasks = new Map()
    this.eventLog = []
    this.paused = false
    this.usePersistentStore = options?.usePersistentStore ?? false
    this.tenantId = options?.tenantId ?? null

    if (this.usePersistentStore && this.tenantId) {
      this.initializePersistentMode()
    }

    this.log.info("proactive scheduler initialized", {
      usePersistentStore: this.usePersistentStore,
      tenantId: this.tenantId,
    })
  }

  private initializePersistentMode(): void {
    ProactiveSchedulerEngine.init({
      maxConcurrent: 10,
      defaultMaxRetries: 3,
    })

    ProactiveSchedulerEngine.setExecutor(async (context) => {
      const task = this.tasks.get(context.task.id)
      if (task) {
        await task.action()
      }
    })

    ProactiveSchedulerEngine.start()

    this.log.info("persistent mode initialized", { tenantId: this.tenantId })
  }

  register(task: ScheduledTask): void {
    this.tasks.set(task.id, task)
    this.log.info("task registered", { taskId: task.id, name: task.name })

    if (this.usePersistentStore && this.tenantId) {
      this.persistTask(task)
    }

    this.triggerEvaluator.register(task.trigger)
  }

  private persistTask(task: ScheduledTask): void {
    if (!this.tenantId) return

    try {
      const existingTask = ProactiveTaskStore.get(task.id)
      if (existingTask) {
        ProactiveTaskStore.update(task.id, {
          name: task.name,
          triggerConfig: JSON.stringify(task.trigger),
          scheduleCron: task.trigger.config.frequency ?? null,
          nextRunAt: task.nextRun ? task.nextRun.getTime() : null,
        })
      } else {
        ProactiveTaskStore.create({
          id: task.id,
          tenantId: this.tenantId,
          name: task.name,
          triggerConfig: JSON.stringify(task.trigger),
          scheduleCron: task.trigger.config.frequency ?? null,
          nextRunAt: task.nextRun ? task.nextRun.getTime() : null,
          maxRetries: 3,
        })
      }
    } catch (err) {
      this.log.error("failed to persist task", { taskId: task.id, err })
    }
  }

  unregister(taskId: string): void {
    const task = this.tasks.get(taskId)
    if (task) {
      this.triggerEvaluator.unregister(task.trigger.name)
    }
    this.tasks.delete(taskId)
    this.log.info("task unregistered", { taskId })

    if (this.usePersistentStore) {
      try {
        ProactiveTaskStore.remove(taskId)
      } catch (err) {
        this.log.error("failed to delete task from store", { taskId, err })
      }
    }
  }

  setPaused(paused: boolean): void {
    this.paused = paused
    this.log.info("scheduler paused state changed", { paused })
  }

  isPaused(): boolean {
    return this.paused
  }

  async evaluateTrigger(event: TriggerEvent): Promise<EvaluationResult> {
    this.log.debug("evaluating trigger event", { signal: event.signal, condition: event.condition })

    if (this.paused) {
      return { executed: [], skipped: [], errors: [] }
    }

    const result = this.triggerEvaluator.evaluate(event)
    const executed: string[] = []
    const skipped: string[] = []
    const errors: TaskError[] = []

    for (const condition of result.conditions) {
      const task = this.findTaskByCondition(condition)

      if (!task) {
        this.log.warn("no task found for condition", { conditionName: condition.name })
        continue
      }

      if (!task.enabled) {
        skipped.push(task.id)
        this.log.debug("task disabled, skipping", { taskId: task.id })
        continue
      }

      if (!this.budgetManager.checkLimit("act_low_risk")) {
        skipped.push(task.id)
        this.log.warn("budget limit reached, skipping task", { taskId: task.id })
        continue
      }

      try {
        await this.executeTask(task)
        executed.push(task.id)
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err)
        errors.push({ taskId: task.id, error: errorMsg })
        this.log.error("task execution failed", { taskId: task.id, error: errorMsg })

        if (this.usePersistentStore && this.tenantId) {
          this.recordTaskFailure(task.id, errorMsg)
        }
      }
    }

    return { executed, skipped, errors }
  }

  private async executeTask(task: ScheduledTask): Promise<void> {
    this.log.info("executing task", { taskId: task.id, name: task.name })

    this.eventLog.push({
      taskId: task.id,
      type: "triggered",
      timestamp: new Date(),
    })

    const consumed = this.budgetManager.consume(1, "act_low_risk")
    if (!consumed) {
      throw new Error("Budget limit exceeded")
    }

    const start = Date.now()

    try {
      await task.action()
      this.eventLog.push({
        taskId: task.id,
        type: "completed",
        timestamp: new Date(),
        details: `duration=${Date.now() - start}ms`,
      })

      task.lastRun = new Date()

      if (this.usePersistentStore && this.tenantId) {
        this.recordTaskSuccess(task.id, start)
      }
    } catch (err) {
      this.eventLog.push({
        taskId: task.id,
        type: "failed",
        timestamp: new Date(),
        details: err instanceof Error ? err.message : String(err),
      })
      throw err
    }
  }

  private recordTaskSuccess(taskId: string, startedAt: number): void {
    if (!this.tenantId) return

    try {
      ProactiveTaskStore.recordRun({
        id: `run-${Date.now()}-${taskId}`,
        taskId,
        runType: "scheduled",
        outcome: "success",
        durationMs: Date.now() - startedAt,
      })

      const task = this.tasks.get(taskId)
      if (task?.trigger.config.frequency) {
        const nextRun = this.calculateNextRun(task.trigger.config.frequency)
        ProactiveTaskStore.update(taskId, {
          status: "active",
          nextRunAt: nextRun,
          retryCount: 0,
          lastError: null,
        })
      }
    } catch (err) {
      this.log.error("failed to record task success", { taskId, err })
    }
  }

  private recordTaskFailure(taskId: string, error: string): void {
    if (!this.tenantId) return

    try {
      const task = ProactiveTaskStore.get(taskId)
      if (!task) return

      const retryCount = task.retryCount + 1
      const maxRetries = task.maxRetries

      if (retryCount >= maxRetries) {
        ProactiveTaskStore.moveToDLQ({
          id: `dlq-${Date.now()}-${taskId}`,
          taskId,
          error,
          payload: { triggerConfig: task.triggerConfig },
          retryAt: Date.now() + this.calculateBackoff(retryCount),
        })

        ProactiveTaskStore.update(taskId, {
          status: "dlq",
          retryCount,
          lastError: error,
        })
      } else {
        ProactiveTaskStore.update(taskId, {
          status: "active",
          nextRunAt: Date.now() + this.calculateBackoff(retryCount),
          retryCount,
          lastError: error,
        })
      }

      ProactiveTaskStore.recordRun({
        id: `run-${Date.now()}-${taskId}`,
        taskId,
        runType: "scheduled",
        outcome: "failed",
        durationMs: 0,
        gateDecisions: { error },
      })
    } catch (err) {
      this.log.error("failed to record task failure", { taskId, err })
    }
  }

  private calculateNextRun(cron: string): number {
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
      this.log.warn("failed to parse cron", { cron })
    }

    return Date.now() + 86400000
  }

  private calculateBackoff(retryCount: number): number {
    const base = 1000
    const delay = base * Math.pow(2, retryCount - 1)
    return Math.min(delay, 300000)
  }

  private findTaskByCondition(condition: TriggerCondition): ScheduledTask | undefined {
    for (const task of this.tasks.values()) {
      if (task.trigger.name === condition.name) {
        return task
      }
    }
    return undefined
  }

  getTasks(): ScheduledTask[] {
    return [...this.tasks.values()]
  }

  getTask(taskId: string): ScheduledTask | undefined {
    return this.tasks.get(taskId)
  }

  getEventLog(): SchedulerEvent[] {
    return [...this.eventLog]
  }

  getBudgetStats(): BudgetStats {
    return this.budgetManager.getStats()
  }

  clearEventLog(): void {
    this.eventLog.length = 0
    this.log.info("event log cleared")
  }

  startEngine(): void {
    if (!this.usePersistentStore) {
      this.log.warn("cannot start engine: persistent store not enabled")
      return
    }

    ProactiveSchedulerEngine.start()
  }

  stopEngine(): void {
    ProactiveSchedulerEngine.stop()
  }

  getEngineStats() {
    if (!this.usePersistentStore) {
      return null
    }

    return ProactiveSchedulerEngine.getStats()
  }

  getPersistedTasks(): ProactiveTask[] {
    if (!this.tenantId) return []
    return ProactiveTaskStore.list(this.tenantId)
  }

  syncFromStore(): void {
    if (!this.tenantId) return

    const persistedTasks = ProactiveTaskStore.list(this.tenantId)

    for (const pTask of persistedTasks) {
      if (!this.tasks.has(pTask.id)) {
        this.log.info("found orphaned task in store", { taskId: pTask.id })
      }
    }
  }
}

export interface EvaluationResult {
  readonly executed: string[]
  readonly skipped: string[]
  readonly errors: TaskError[]
}

export interface TaskError {
  readonly taskId: string
  readonly error: string
}

export const ProactiveScheduler$ = {
  create: (config?: ProactiveSchedulerOptions) => new ProactiveScheduler(config),
}

export namespace Scheduler {
  export function createTask(input: {
    id: string
    name: string
    trigger: TriggerCondition
    action: () => Promise<void>
    enabled?: boolean
    tenantId?: string
  }): ScheduledTask {
    return {
      id: input.id,
      name: input.name,
      trigger: input.trigger,
      action: input.action,
      enabled: input.enabled ?? true,
      tenantId: input.tenantId,
    }
  }

  export function createScheduleTrigger(name: string, cronExpression: string): TriggerCondition {
    return {
      signal: "schedule",
      name,
      description: `Scheduled task: ${name}`,
      enabled: true,
      config: { frequency: cronExpression },
    }
  }

  export function createThresholdTrigger(name: string, threshold: number): TriggerCondition {
    return {
      signal: "threshold",
      name,
      description: `Threshold trigger: ${name}`,
      enabled: true,
      config: { threshold },
    }
  }

  export function createAnomalyTrigger(name: string, patterns?: string[]): TriggerCondition {
    return {
      signal: "anomaly",
      name,
      description: `Anomaly trigger: ${name}`,
      enabled: true,
      config: { patterns: patterns ?? ["unusual_time", "unusual_frequency"] },
    }
  }
}

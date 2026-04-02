import { Log } from "@/util/log"
import { fn } from "@/util/fn"
import z from "zod"
import type { TriggerCondition, TriggerEvent } from "./trigger"
import { TriggerEvaluator } from "./trigger"
import { BudgetManager, type BudgetStats } from "./budget"

// Scheduled task definition
export interface ScheduledTask {
  readonly id: string
  readonly name: string
  readonly trigger: TriggerCondition
  readonly action: () => Promise<void>
  readonly enabled: boolean
  lastRun?: Date
  nextRun?: Date
}

// Scheduler events
export interface SchedulerEvent {
  readonly taskId: string
  readonly type: "scheduled" | "triggered" | "completed" | "failed"
  readonly timestamp: Date
  readonly details?: string
}

// Proactive scheduler - manages scheduled and triggered tasks
export class ProactiveScheduler {
  private readonly log: ReturnType<typeof Log.create>
  private readonly triggerEvaluator: TriggerEvaluator
  private readonly budgetManager: BudgetManager
  private readonly tasks: Map<string, ScheduledTask>
  private readonly eventLog: SchedulerEvent[]
  private paused: boolean

  constructor(budgetManager?: BudgetManager) {
    this.log = Log.create({ service: "kiloclaw.proactive.scheduler" })
    this.triggerEvaluator = new TriggerEvaluator()
    this.budgetManager = budgetManager ?? new BudgetManager(100)
    this.tasks = new Map()
    this.eventLog = []
    this.paused = false

    this.log.info("proactive scheduler initialized")
  }

  // Register a scheduled task
  register(task: ScheduledTask): void {
    this.tasks.set(task.id, task)
    this.log.info("task registered", { taskId: task.id, name: task.name })
  }

  // Unregister a task
  unregister(taskId: string): void {
    this.tasks.delete(taskId)
    this.log.info("task unregistered", { taskId })
  }

  // Enable/disable the scheduler
  setPaused(paused: boolean): void {
    this.paused = paused
    this.log.info("scheduler paused state changed", { paused })
  }

  // Check if scheduler is paused
  isPaused(): boolean {
    return this.paused
  }

  // Evaluate a trigger event and execute matching tasks
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

      // Check budget before execution
      if (!this.budgetManager.checkLimit("act_low_risk")) {
        skipped.push(task.id)
        this.log.warn("budget limit reached, skipping task", { taskId: task.id })
        continue
      }

      // Execute task
      try {
        await this.executeTask(task)
        executed.push(task.id)
      } catch (err) {
        errors.push({ taskId: task.id, error: err instanceof Error ? err.message : String(err) })
        this.log.error("task execution failed", { taskId: task.id, error: err })
      }
    }

    return { executed, skipped, errors }
  }

  // Execute a task
  private async executeTask(task: ScheduledTask): Promise<void> {
    this.log.info("executing task", { taskId: task.id, name: task.name })

    this.eventLog.push({
      taskId: task.id,
      type: "triggered",
      timestamp: new Date(),
    })

    // Consume budget
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

      // Update last run time
      task.lastRun = new Date()
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

  // Find task by condition
  private findTaskByCondition(condition: TriggerCondition): ScheduledTask | undefined {
    for (const task of this.tasks.values()) {
      if (task.trigger.name === condition.name) {
        return task
      }
    }
    return undefined
  }

  // Get all registered tasks
  getTasks(): ScheduledTask[] {
    return [...this.tasks.values()]
  }

  // Get task by ID
  getTask(taskId: string): ScheduledTask | undefined {
    return this.tasks.get(taskId)
  }

  // Get event log
  getEventLog(): SchedulerEvent[] {
    return [...this.eventLog]
  }

  // Get budget stats
  getBudgetStats(): BudgetStats {
    return this.budgetManager.getStats()
  }

  // Clear event log
  clearEventLog(): void {
    this.eventLog.length = 0
    this.log.info("event log cleared")
  }
}

// Evaluation result
export interface EvaluationResult {
  readonly executed: string[]
  readonly skipped: string[]
  readonly errors: TaskError[]
}

// Task error
export interface TaskError {
  readonly taskId: string
  readonly error: string
}

// Factory function
export const ProactiveScheduler$ = {
  create: fn(
    z.object({
      totalDailyBudget: z.number().int().positive().optional(),
    }),
    (config) =>
      new ProactiveScheduler(config.totalDailyBudget ? new BudgetManager(config.totalDailyBudget) : undefined),
  ),
}

// Namespace with helper functions
export namespace Scheduler {
  export function createTask(input: {
    id: string
    name: string
    trigger: TriggerCondition
    action: () => Promise<void>
    enabled?: boolean
  }): ScheduledTask {
    return {
      id: input.id,
      name: input.name,
      trigger: input.trigger,
      action: input.action,
      enabled: input.enabled ?? true,
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
}

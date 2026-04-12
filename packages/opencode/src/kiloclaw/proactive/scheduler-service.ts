import { BudgetManager } from "./budget"
import { ProactivityLimitsManager } from "./limits"
import { type LedgerTask, type ReconcileResult, TaskLedger } from "./task-ledger"

export interface SchedulerTaskInput {
  readonly id?: string
  readonly name: string
  readonly payload?: Record<string, unknown>
  readonly meta?: {
    readonly maxRetries?: number
    readonly retryDelayMs?: number
    readonly timeoutMs?: number
    readonly graceMs?: number
  }
}

export interface SchedulerReconcile extends ReconcileResult {
  readonly queued: number
}

export class SchedulerService {
  private readonly ledger: TaskLedger
  private readonly limits: ProactivityLimitsManager
  private readonly budget: BudgetManager
  private readonly graceMs: number

  constructor(input: {
    ledger: TaskLedger
    limits?: ProactivityLimitsManager
    budget?: BudgetManager
    graceMs?: number
  }) {
    this.ledger = input.ledger
    this.limits = input.limits ?? new ProactivityLimitsManager()
    this.budget = input.budget ?? new BudgetManager(100)
    this.graceMs = input.graceMs ?? 60_000
  }

  private isEnabled(): boolean {
    return process.env.KILOCLAW_PROACTIVE_ENABLED !== "false"
  }

  enqueue(input: SchedulerTaskInput): LedgerTask {
    return this.ledger.createTask({
      id: input.id,
      name: input.name,
      payload: input.payload,
      meta: input.meta,
    })
  }

  claimNext(workerId: string, now: number = Date.now()): LedgerTask | null {
    if (!this.isEnabled()) return null
    this.reconcile({ now })
    const queued = this.ledger
      .list({ state: "queued" })
      .filter((task) => {
        const at = task.meta.nextAttemptAt
        if (typeof at !== "number") return true
        return at <= now
      })
      .sort((a, b) => a.createdAt - b.createdAt)

    if (queued.length === 0) return null
    if (!this.limits.isProactionAllowed("act_low_risk")) return null
    if (!this.budget.consume(1, "act_low_risk")) return null

    const task = queued[0]
    if (!task) return null
    const claim = this.ledger.claimTask(task.id, workerId, now)
    if (claim) return claim

    const retryTask = this.ledger.list({ state: "queued" })[0] ?? null
    if (!retryTask) return null
    return this.ledger.claimTask(retryTask.id, workerId, now)
  }

  complete(taskId: string, now: number = Date.now()): LedgerTask | null {
    return this.ledger.completeTask(taskId, now)
  }

  fail(taskId: string, err: unknown, now: number = Date.now()): LedgerTask | null {
    const task = this.ledger.get(taskId)
    if (!task) return null

    const max = task.meta.maxRetries ?? 0
    const delay = task.meta.retryDelayMs ?? 0
    const retry = task.attempt <= max
    const msg = err instanceof Error ? err.message : String(err)

    return this.ledger.failTask(taskId, {
      error: msg,
      retry,
      retryDelayMs: delay,
      now,
    })
  }

  cancel(taskId: string, reason?: string, now: number = Date.now()): LedgerTask | null {
    return this.ledger.cancelTask(taskId, reason, now)
  }

  list(): LedgerTask[] {
    return this.ledger.list()
  }

  get(taskId: string): LedgerTask | null {
    return this.ledger.get(taskId)
  }

  reconcile(input?: { now?: number; graceMs?: number }): SchedulerReconcile {
    const now = input?.now ?? Date.now()
    const graceMs = input?.graceMs ?? this.graceMs
    const out = this.ledger.reconcile({ now, graceMs })
    return {
      ...out,
      queued: this.ledger.list({ state: "queued" }).length,
    }
  }
}

import { Log } from "@/util/log"
import { fn } from "@/util/fn"
import z from "zod"
import type { ProactionType } from "./trigger"

// Proactive budget interface
export interface ProactiveBudget {
  readonly totalDaily: number
  readonly remaining: number
  readonly resetsAt: Date
  consume(amount: number, type: ProactionType): boolean
  checkLimit(type: ProactionType): boolean
  reset(): void
}

// Budget entry tracking
interface BudgetEntry {
  type: ProactionType
  amount: number
  timestamp: Date
}

// Budget limits by proaction type
interface BudgetLimits {
  suggest: number
  notify: number
  actLowRisk: number
}

// Default budget limits (can be overridden)
const DEFAULT_LIMITS: BudgetLimits = {
  suggest: 50,
  notify: 30,
  actLowRisk: 10,
}

// Proactivity budget manager
export class BudgetManager implements ProactiveBudget {
  private readonly log: ReturnType<typeof Log.create>
  private readonly totalDaily: number
  private readonly limits: BudgetLimits
  private readonly entries: BudgetEntry[]
  private resetAt: Date

  constructor(totalDaily: number, limits?: Partial<BudgetLimits>) {
    this.log = Log.create({ service: "kiloclaw.proactive.budget" })
    this.totalDaily = totalDaily
    this.limits = { ...DEFAULT_LIMITS, ...limits }

    // Set reset time to midnight
    const now = new Date()
    this.resetAt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0)

    this.entries = []
    this.log.info("budget manager initialized", {
      totalDaily,
      limits: this.limits,
      resetsAt: this.resetAt.toISOString(),
    })
  }

  // Get remaining budget
  get remaining(): number {
    const used = this.entries.reduce((acc, e) => acc + e.amount, 0)
    return Math.max(0, this.totalDaily - used)
  }

  // Get total daily budget
  get resetsAt(): Date {
    return this.resetAt
  }

  // Consume budget for an action
  consume(amount: number, type: ProactionType): boolean {
    // Check if within limits
    if (!this.checkLimit(type)) {
      this.log.warn("budget limit exceeded", { type, amount, limit: this.limits[type] })
      return false
    }

    // Check if enough remaining budget
    if (this.remaining < amount) {
      this.log.warn("insufficient budget", { remaining: this.remaining, requested: amount })
      return false
    }

    // Record consumption
    this.entries.push({ type, amount, timestamp: new Date() })
    this.log.info("budget consumed", { type, amount, remaining: this.remaining })

    return true
  }

  // Check if a specific type is within limits
  checkLimit(type: ProactionType): boolean {
    const usedByType = this.entries.filter((e) => e.type === type).reduce((acc, e) => acc + e.amount, 0)
    return usedByType + 1 <= this.limits[type]
  }

  // Reset budget (called at midnight or manually)
  reset(): void {
    this.entries.length = 0

    // Set new reset time
    const now = new Date()
    this.resetAt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0)

    this.log.info("budget reset", { newResetsAt: this.resetAt.toISOString() })
  }

  // Get usage statistics
  getStats(): BudgetStats {
    const byType: Record<ProactionType, number> = {
      suggest: 0,
      notify: 0,
      act_low_risk: 0,
    }

    for (const entry of this.entries) {
      byType[entry.type] += entry.amount
    }

    const total = this.entries.reduce((acc, e) => acc + e.amount, 0)

    return {
      totalUsed: total,
      totalLimit: this.totalDaily,
      remaining: this.remaining,
      byType,
      limits: this.limits,
    }
  }

  // Check if budget should auto-reset
  checkAutoReset(): boolean {
    if (new Date() >= this.resetAt) {
      this.reset()
      return true
    }
    return false
  }
}

// Budget statistics
export interface BudgetStats {
  totalUsed: number
  totalLimit: number
  remaining: number
  byType: Record<ProactionType, number>
  limits: BudgetLimits
}

// Factory function
export const BudgetManager$ = {
  create: fn(
    z.object({
      totalDaily: z.number().int().positive().default(100),
      suggestLimit: z.number().int().positive().optional(),
      notifyLimit: z.number().int().positive().optional(),
      actLowRiskLimit: z.number().int().positive().optional(),
    }),
    (config) =>
      new BudgetManager(config.totalDaily, {
        suggest: config.suggestLimit,
        notify: config.notifyLimit,
        actLowRisk: config.actLowRiskLimit,
      }),
  ),
}

// Singleton instance for global budget management
let globalBudgetManager: BudgetManager | null = null

export namespace Budget {
  export function getGlobal(): BudgetManager {
    if (!globalBudgetManager) {
      globalBudgetManager = new BudgetManager(100)
    }
    return globalBudgetManager
  }

  export function setGlobal(manager: BudgetManager): void {
    globalBudgetManager = manager
  }

  export function create(totalDaily: number, limits?: Partial<BudgetLimits>): BudgetManager {
    return new BudgetManager(totalDaily, limits)
  }
}

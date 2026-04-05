/**
 * Proactive Explain - Rationale and explainability for proactive actions
 * Generates human-readable explanations for every proactive decision
 */

import { Log } from "@/util/log"
import z from "zod"
import { fn } from "@/util/fn"
import { BudgetManager, type BudgetStats } from "./budget"
import { RiskLevel, type RiskLevel as RiskLevelType } from "./policy-gate"
import type { TriggerCondition, TriggerEvent } from "./trigger"

// Risk level type alias
type RiskLevelValue = z.infer<typeof RiskLevel>

// =============================================================================
// Types
// =============================================================================

/**
 * Explanation for a proactive action
 */
export interface ProactionExplanation {
  /** Why the action was triggered */
  readonly why: string
  /** What action will be performed */
  readonly what: string
  /** What signals/triggers were used */
  readonly how: string[]
  /** Which policy authorized this action */
  readonly policy: string
  /** Current budget consumption */
  readonly budget: BudgetSummary
  /** How to disable this action */
  readonly howToDisable: string
  /** When this explanation was generated */
  readonly generatedAt: Date
}

/**
 * Budget summary for explanations
 */
export interface BudgetSummary {
  readonly totalUsed: number
  readonly totalLimit: number
  readonly byType: Record<string, number>
}

/**
 * Context for generating explanations
 */
export const ExplainContextSchema = z.object({
  taskId: z.string(),
  taskName: z.string(),
  trigger: z.instanceof(Object),
  triggerEvent: z.instanceof(Object).optional(),
  actionType: z.string(),
  riskLevel: RiskLevel,
  budgetStats: z.record(z.string(), z.unknown()).optional(),
  policyDecision: z
    .object({
      allowed: z.boolean(),
      reasons: z.array(z.string()),
      blockers: z.array(z.string()),
    })
    .optional(),
  signals: z.array(z.string()).optional(),
})

export type ExplainContext = z.infer<typeof ExplainContextSchema>

// =============================================================================
// ProactionExplainer
// =============================================================================

export class ProactionExplainer {
  private readonly log: ReturnType<typeof Log.create>

  constructor() {
    this.log = Log.create({ service: "kilocclaw.proactive.explain" })
  }

  /**
   * Generate a complete explanation for a proactive action
   */
  explain(context: ExplainContext): ProactionExplanation {
    const why = this.generateWhy(context)
    const what = this.generateWhat(context)
    const how = this.generateHow(context)
    const policy = this.generatePolicy(context)
    const budget = this.generateBudget(context)
    const howToDisable = this.generateHowToDisable(context)

    const explanation: ProactionExplanation = {
      why,
      what,
      how,
      policy,
      budget,
      howToDisable,
      generatedAt: new Date(),
    }

    this.log.info("proaction explanation generated", {
      taskId: context.taskId,
      why,
      what,
    })

    return explanation
  }

  /**
   * Generate the "why" - trigger reason
   */
  private generateWhy(context: ExplainContext): string {
    const trigger = context.trigger as TriggerCondition
    const signal = trigger?.signal ?? context.actionType

    switch (signal) {
      case "schedule":
        return `Scheduled task triggered at ${new Date().toLocaleTimeString()}`

      case "reminder":
        return `Reminder set for this time`

      case "threshold":
        return `Threshold exceeded for monitored metric`

      case "anomaly":
        return `Anomalous behavior detected in usage pattern`

      default: {
        const event = context.triggerEvent as TriggerEvent | undefined
        if (event?.condition) {
          return `Event condition matched: ${event.condition}`
        }
        return `Triggered by ${signal} signal`
      }
    }
  }

  /**
   * Generate the "what" - action description
   */
  private generateWhat(context: ExplainContext): string {
    const taskName = context.taskName || "proactive task"
    const riskLabel = this.riskLevelLabel(context.riskLevel)

    return `Will ${context.actionType} "${taskName}" (${riskLabel} risk)`
  }

  /**
   * Generate the "how" - signals used
   */
  private generateHow(context: ExplainContext): string[] {
    const signals: string[] = []
    const trigger = context.trigger as TriggerCondition

    if (trigger?.signal) {
      signals.push(`Trigger signal: ${trigger.signal}`)
    }

    if (trigger?.config) {
      const config = trigger.config as Record<string, unknown>
      if (config.frequency) {
        signals.push(`Schedule: ${config.frequency}`)
      }
      if (config.threshold !== undefined) {
        signals.push(`Threshold: ${config.threshold}`)
      }
      if (config.patterns) {
        signals.push(`Anomaly patterns: ${(config.patterns as string[]).join(", ")}`)
      }
    }

    if (context.signals && context.signals.length > 0) {
      signals.push(...context.signals)
    }

    return signals.length > 0 ? signals : ["No specific signals identified"]
  }

  /**
   * Generate the "policy" - authorization summary
   */
  private generatePolicy(context: ExplainContext): string {
    const decision = context.policyDecision

    if (!decision) {
      return "Policy evaluation not available"
    }

    if (decision.allowed) {
      const reasons = decision.reasons.slice(0, 2)
      return `Authorized: ${reasons.join("; ")}`
    }

    const blockers = decision.blockers.slice(0, 2)
    return `Blocked: ${blockers.join("; ")}`
  }

  /**
   * Generate the "budget" summary
   */
  private generateBudget(context: ExplainContext): BudgetSummary {
    const stats = context.budgetStats as BudgetStats | undefined

    if (!stats) {
      return {
        totalUsed: 0,
        totalLimit: 0,
        byType: {},
      }
    }

    return {
      totalUsed: stats.totalUsed,
      totalLimit: stats.totalLimit,
      byType: Object.fromEntries(Object.entries(stats.byType).map(([k, v]) => [k, v])),
    }
  }

  /**
   * Generate the "how to disable" instruction
   */
  private generateHowToDisable(context: ExplainContext): string {
    const parts: string[] = []

    // Task-level disable
    parts.push(`Disable task "${context.taskName}" in settings`)

    // Risk-based suggestions
    switch (context.riskLevel) {
      case "low":
        parts.push("or set confirmation mode to 'suggest_then_act'")
        break
      case "medium":
        parts.push("or reduce budget allocation for this action type")
        break
      case "high":
      case "critical":
        parts.push("or enable explicit approval mode")
        break
    }

    // Global kill-switch
    parts.push("or use the global proactive kill-switch")

    return parts.join(" ")
  }

  /**
   * Convert risk level to human-readable label
   */
  private riskLevelLabel(level: RiskLevelValue): string {
    const labels: Record<RiskLevelValue, string> = {
      low: "Low",
      medium: "Medium",
      high: "High",
      critical: "Critical",
    }
    return labels[level] ?? "Unknown"
  }

  /**
   * Format explanation for UX display
   */
  formatForUX(explanation: ProactionExplanation): string {
    const lines = [
      `Sto per ${explanation.what.split("Will ").pop()}`,
      `perché ${explanation.why}`,
      "",
      `Policy: ${explanation.policy}`,
      `Budget: ${explanation.budget.totalUsed}/${explanation.budget.totalLimit}`,
      "",
      `Per disattivare: ${explanation.howToDisable}`,
    ]

    return lines.join("\n")
  }

  /**
   * Format explanation as structured data for logging
   */
  formatForLog(explanation: ProactionExplanation): Record<string, unknown> {
    return {
      why: explanation.why,
      what: explanation.what,
      how: explanation.how,
      policy: explanation.policy,
      budget: explanation.budget,
      howToDisable: explanation.howToDisable,
      generatedAt: explanation.generatedAt.toISOString(),
    }
  }
}

// =============================================================================
// Factory function
// =============================================================================

export const ProactionExplainer$ = {
  create: () => new ProactionExplainer(),
}

// =============================================================================
// Namespace exports
// =============================================================================

export namespace ProactionExplainer {
  export const Schema = ExplainContextSchema

  export function explain(input: ExplainContext): ProactionExplanation {
    const explainer = new ProactionExplainer()
    return explainer.explain(input)
  }

  export function formatForUX(explanation: ProactionExplanation): string {
    const explainer = new ProactionExplainer()
    return explainer.formatForUX(explanation)
  }

  export function formatForLog(explanation: ProactionExplanation): Record<string, unknown> {
    const explainer = new ProactionExplainer()
    return explainer.formatForLog(explanation)
  }
}

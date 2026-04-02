import z from "zod"
import { Log } from "@/util/log"
import { fn } from "@/util/fn"
import {
  type ActionContext,
  type RiskScore,
  type RiskFactor,
  type StaticRule,
  type GuardrailResult,
  type PolicyEngineConfig,
  RISK_THRESHOLDS,
  Policy,
} from "./rules"
import type { Action } from "../types"

// Cache entry
interface CacheEntry {
  result: GuardrailResult
  timestamp: number
}

// Policy engine - evaluates actions against static and dynamic rules
export class PolicyEngine {
  private readonly log: ReturnType<typeof Log.create>
  private readonly staticRules: StaticRule[]
  private readonly cache: Map<string, CacheEntry>
  private readonly config: PolicyEngineConfig

  constructor(config: Partial<PolicyEngineConfig> = {}) {
    this.log = Log.create({ service: "kiloclaw.policy.engine" })
    this.staticRules = []
    this.cache = new Map()
    this.config = {
      enableCaching: config.enableCaching ?? true,
      cacheTTLMs: config.cacheTTLMs ?? 5000,
      fallbackToConsultative: config.fallbackToConsultative ?? true,
    }
  }

  // Register a static rule
  registerRule(rule: StaticRule): void {
    this.staticRules.push(rule)
    this.log.info("static rule registered", { ruleId: rule.id, severity: rule.severity })
  }

  // Evaluate action against all rules (static + dynamic)
  evaluate(context: ActionContext, action: Action): GuardrailResult {
    const cacheKey = this.getCacheKey(context, action)
    const cached = this.getCachedResult(cacheKey)
    if (cached) {
      this.log.debug("cache hit", { cacheKey })
      return cached
    }

    this.log.info("evaluating policy", {
      actionType: action.type,
      correlationId: context.correlationId,
    })

    // Static rule evaluation
    const staticResult = this.evaluateStaticRules(context, action)

    // Dynamic rule evaluation (risk scoring)
    const riskScore = this.calculateRiskScore(action, context)

    // Combine results
    const result = this.combineResults(staticResult, riskScore)

    // Cache the result
    this.setCachedResult(cacheKey, result)

    this.log.info("policy evaluation complete", {
      allowed: result.allowed,
      riskScore: result.riskScore,
      escalationRequired: result.escalationRequired,
    })

    return result
  }

  // Evaluate against static rules only
  private evaluateStaticRules(context: ActionContext, action: Action): GuardrailResult {
    let blocked = false
    let reason = ""
    let highestSeverity: "low" | "medium" | "high" | "critical" = "low"

    for (const rule of this.staticRules) {
      try {
        if (rule.check(context as any)) {
          blocked = true
          reason = reason ? `${reason}; ${rule.description}` : rule.description
          if (this.severityOrder(rule.severity) > this.severityOrder(highestSeverity)) {
            highestSeverity = rule.severity
          }
        }
      } catch (err) {
        this.log.error("rule evaluation error", { ruleId: rule.id, error: err })
      }
    }

    return {
      allowed: !blocked,
      reason: blocked ? reason : "all static rules passed",
      riskScore: blocked ? RISK_THRESHOLDS[highestSeverity] : undefined,
      escalationRequired: blocked && highestSeverity === "critical",
    }
  }

  // Calculate dynamic risk score for an action
  private calculateRiskScore(action: Action, context: ActionContext): RiskScore {
    const factors: RiskFactor[] = []

    // Reversibility factor
    const isReversible = this.checkReversibility(action)
    factors.push({
      type: "reversibility",
      weight: 0.25,
      value: isReversible ? 0.1 : 0.9,
    })

    // Data sensitivity factor
    const maxSensitivity = this.getMaxDataSensitivity(context.dataClassification)
    factors.push({
      type: "data_sensitivity",
      weight: 0.3,
      value: maxSensitivity,
    })

    // Scope factor (based on toolIds)
    const scopeScore = this.calculateScopeScore(context.toolIds)
    factors.push({
      type: "scope",
      weight: 0.2,
      value: scopeScore,
    })

    // Autonomy factor (based on agency context)
    const autonomyScore = context.agencyId ? 0.3 : 0.1
    factors.push({
      type: "autonomy",
      weight: 0.1,
      value: autonomyScore,
    })

    // External impact factor
    const externalScore = action.type.includes("external") || action.type.includes("api") ? 0.7 : 0.2
    factors.push({
      type: "external_impact",
      weight: 0.15,
      value: externalScore,
    })

    // Calculate weighted score
    const score = factors.reduce((acc, f) => acc + f.weight * f.value, 0)

    return {
      action,
      score: Math.min(1, Math.max(0, score)),
      factors,
      threshold: Policy.classifyRisk(score),
    }
  }

  // Check if action is reversible
  private checkReversibility(action: Action): boolean {
    const irreversibleTypes = ["delete", "drop", "remove", "destroy", "terminate", "cancel", "revoke", "purge"]
    return !irreversibleTypes.some((t) => action.type.toLowerCase().includes(t))
  }

  // Get max data sensitivity from classifications
  private getMaxDataSensitivity(classifications: string[]): number {
    const sensitivityMap: Record<string, number> = {
      P0_Critical: 1.0,
      P1_High: 0.75,
      P2_Medium: 0.5,
      P3_Low: 0.25,
    }
    return Math.max(...classifications.map((c) => sensitivityMap[c] ?? 0), 0)
  }

  // Calculate scope score from tool IDs
  private calculateScopeScore(toolIds: string[]): number {
    if (toolIds.length === 0) return 0.1
    if (toolIds.length > 5) return 0.8
    return 0.3 + toolIds.length * 0.1
  }

  // Combine static and dynamic results
  private combineResults(staticResult: GuardrailResult, riskScore: RiskScore): GuardrailResult {
    // If static rules blocked, use that result
    if (!staticResult.allowed) {
      return {
        ...staticResult,
        riskScore: staticResult.riskScore ?? riskScore.score,
      }
    }

    // Check if risk exceeds threshold
    const exceedsHigh = riskScore.score >= RISK_THRESHOLDS.high
    const exceedsCritical = riskScore.score >= RISK_THRESHOLDS.critical

    if (exceedsCritical) {
      return {
        allowed: false,
        reason: `critical risk: ${riskScore.score.toFixed(2)}`,
        riskScore: riskScore.score,
        escalationRequired: true,
      }
    }

    if (exceedsHigh) {
      return {
        allowed: true,
        reason: `high risk requires confirmation: ${riskScore.score.toFixed(2)}`,
        riskScore: riskScore.score,
        escalationRequired: true,
      }
    }

    // Medium risk - enhanced logging
    if (riskScore.score >= RISK_THRESHOLDS.medium) {
      return {
        allowed: true,
        reason: `medium risk with enhanced logging: ${riskScore.score.toFixed(2)}`,
        riskScore: riskScore.score,
        escalationRequired: false,
      }
    }

    // Low risk - proceed with logging
    return {
      allowed: true,
      reason: `low risk: ${riskScore.score.toFixed(2)}`,
      riskScore: riskScore.score,
      escalationRequired: false,
    }
  }

  // Cache management
  private getCacheKey(context: ActionContext, action: Action): string {
    return `${context.correlationId}:${context.agencyId ?? "no-agency"}:${action.type}:${JSON.stringify(action.parameters ?? {})}`
  }

  private getCachedResult(key: string): GuardrailResult | null {
    if (!this.config.enableCaching) return null
    const entry = this.cache.get(key)
    if (!entry) return null
    if (Date.now() - entry.timestamp > this.config.cacheTTLMs) {
      this.cache.delete(key)
      return null
    }
    return entry.result
  }

  private setCachedResult(key: string, result: GuardrailResult): void {
    if (!this.config.enableCaching) return
    this.cache.set(key, { result, timestamp: Date.now() })
  }

  // Clear cache
  clearCache(): void {
    this.cache.clear()
    this.log.info("cache cleared")
  }

  // Severity ordering
  private severityOrder(severity: "low" | "medium" | "high" | "critical"): number {
    const order = { low: 0, medium: 1, high: 2, critical: 3 }
    return order[severity] ?? 0
  }
}

// Factory function
export const PolicyEngine$ = {
  create: fn(
    z.object({
      enableCaching: z.boolean().optional(),
      cacheTTLMs: z.number().int().positive().optional(),
      fallbackToConsultative: z.boolean().optional(),
    }),
    (config) => new PolicyEngine(config),
  ),
}

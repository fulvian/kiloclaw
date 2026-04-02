import { Log } from "@/util/log"
import { fn } from "@/util/fn"
import z from "zod"
import type { Action } from "../types"
import { RISK_THRESHOLDS } from "../policy/rules"

// Risk factor weights
interface FactorWeights {
  reversibility: number
  dataSensitivity: number
  scope: number
  autonomy: number
  externalImpact: number
}

// Default weights from ADR-003
const DEFAULT_WEIGHTS: FactorWeights = {
  reversibility: 0.25,
  dataSensitivity: 0.3,
  scope: 0.2,
  autonomy: 0.1,
  externalImpact: 0.15,
}

// Risk score input
interface RiskScoreInput {
  action: Action
  toolIds: string[]
  dataClassifications: string[]
  isAgencyContext: boolean
  hasExternalImpact: boolean
}

// Risk factor result
interface RiskFactorResult {
  name: string
  weight: number
  value: number
  contribution: number
}

// Scored result
export interface ScoredResult {
  score: number
  threshold: "low" | "medium" | "high" | "critical"
  factors: RiskFactorResult[]
  recommendation: "allow" | "confirm" | "block"
}

// Risk scorer - calculates risk scores for actions
export class RiskScorer {
  private readonly log: ReturnType<typeof Log.create>
  private weights: FactorWeights

  constructor(weights?: Partial<FactorWeights>) {
    this.log = Log.create({ service: "kiloclaw.guardrail.risk-scorer" })
    this.weights = { ...DEFAULT_WEIGHTS, ...weights }
  }

  // Calculate risk score for an action
  score(input: RiskScoreInput): ScoredResult {
    this.log.debug("calculating risk score", { actionType: input.action.type })

    const factors = this.calculateFactors(input)
    const score = this.aggregateScore(factors)
    const threshold = this.classifyThreshold(score)

    const result: ScoredResult = {
      score,
      threshold,
      factors,
      recommendation: this.getRecommendation(score),
    }

    this.log.info("risk scored", {
      actionType: input.action.type,
      score: score.toFixed(3),
      threshold,
      recommendation: result.recommendation,
    })

    return result
  }

  // Calculate individual risk factors
  private calculateFactors(input: RiskScoreInput): RiskFactorResult[] {
    return [
      this.calculateReversibility(input.action),
      this.calculateDataSensitivity(input.dataClassifications),
      this.calculateScope(input.toolIds),
      this.calculateAutonomy(input.isAgencyContext),
      this.calculateExternalImpact(input.hasExternalImpact),
    ]
  }

  // Reversibility factor
  private calculateReversibility(action: Action): RiskFactorResult {
    const irreversible = [
      "delete",
      "drop",
      "remove",
      "destroy",
      "terminate",
      "cancel",
      "revoke",
      "purge",
      "reset",
      "wipe",
      "truncate",
    ]

    const isIrreversible = irreversible.some((t) => action.type.toLowerCase().includes(t))

    return {
      name: "reversibility",
      weight: this.weights.reversibility,
      value: isIrreversible ? 0.95 : 0.1,
      contribution: isIrreversible ? this.weights.reversibility * 0.95 : this.weights.reversibility * 0.1,
    }
  }

  // Data sensitivity factor
  private calculateDataSensitivity(classifications: string[]): RiskFactorResult {
    const sensitivityMap: Record<string, number> = {
      P0_Critical: 1.0,
      P1_High: 0.75,
      P2_Medium: 0.5,
      P3_Low: 0.25,
    }

    const maxSensitivity =
      classifications.length > 0 ? Math.max(...classifications.map((c) => sensitivityMap[c] ?? 0)) : 0.05

    return {
      name: "data_sensitivity",
      weight: this.weights.dataSensitivity,
      value: maxSensitivity,
      contribution: this.weights.dataSensitivity * maxSensitivity,
    }
  }

  // Scope factor
  private calculateScope(toolIds: string[]): RiskFactorResult {
    let value: number
    if (toolIds.length === 0) {
      value = 0.05
    } else if (toolIds.length === 1) {
      value = 0.25
    } else if (toolIds.length <= 3) {
      value = 0.45
    } else if (toolIds.length <= 5) {
      value = 0.65
    } else {
      value = 0.85
    }

    return {
      name: "scope",
      weight: this.weights.scope,
      value,
      contribution: this.weights.scope * value,
    }
  }

  // Autonomy factor
  private calculateAutonomy(isAgencyContext: boolean): RiskFactorResult {
    const value = isAgencyContext ? 0.5 : 0.15
    return {
      name: "autonomy",
      weight: this.weights.autonomy,
      value,
      contribution: this.weights.autonomy * value,
    }
  }

  // External impact factor
  private calculateExternalImpact(hasExternalImpact: boolean): RiskFactorResult {
    const value = hasExternalImpact ? 0.8 : 0.15
    return {
      name: "external_impact",
      weight: this.weights.externalImpact,
      value,
      contribution: this.weights.externalImpact * value,
    }
  }

  // Aggregate weighted factors
  private aggregateScore(factors: RiskFactorResult[]): number {
    const total = factors.reduce((acc, f) => acc + f.contribution, 0)
    return Math.min(1, Math.max(0, total))
  }

  // Classify threshold from score
  private classifyThreshold(score: number): "low" | "medium" | "high" | "critical" {
    if (score >= RISK_THRESHOLDS.critical) return "critical"
    if (score >= RISK_THRESHOLDS.high) return "high"
    if (score >= RISK_THRESHOLDS.medium) return "medium"
    return "low"
  }

  // Get recommended action based on score
  private getRecommendation(score: number): "allow" | "confirm" | "block" {
    if (score >= RISK_THRESHOLDS.critical) return "block"
    if (score >= RISK_THRESHOLDS.high) return "confirm"
    return "allow"
  }

  // Check if score exceeds threshold
  exceedsThreshold(score: number, threshold: "low" | "medium" | "high" | "critical"): boolean {
    return score >= RISK_THRESHOLDS[threshold]
  }

  // Set custom weights
  setWeights(weights: Partial<FactorWeights>): void {
    this.weights = { ...this.weights, ...weights }
    this.log.info("risk weights updated", { weights })
  }

  // Get current weights
  getWeights(): FactorWeights {
    return { ...this.weights }
  }
}

// Factory function
export const RiskScorer$ = {
  create: fn(
    z.object({
      reversibility: z.number().min(0).max(1).optional(),
      dataSensitivity: z.number().min(0).max(1).optional(),
      scope: z.number().min(0).max(1).optional(),
      autonomy: z.number().min(0).max(1).optional(),
      externalImpact: z.number().min(0).max(1).optional(),
    }),
    (weights) => new RiskScorer(weights),
  ),
}

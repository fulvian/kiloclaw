import z from "zod"
import { Log } from "@/util/log"
import type { Action } from "../types"
import { RISK_THRESHOLDS, Policy } from "./rules"

// Risk factor types as defined in ADR-003
export type RiskFactorType = "reversibility" | "data_sensitivity" | "scope" | "autonomy" | "external_impact"

// Risk factor interface
export interface RiskFactor {
  readonly type: RiskFactorType
  readonly weight: number
  readonly value: number
}

// Risk score interface
export interface DynamicRiskScore {
  readonly action: Action
  readonly score: number
  readonly factors: RiskFactor[]
  readonly threshold: "low" | "medium" | "high" | "critical"
}

// Dynamic risk calculation input
export interface RiskCalculationInput {
  readonly action: Action
  readonly toolIds: string[]
  readonly dataClassifications: string[]
  readonly isAgencyContext: boolean
  readonly hasExternalImpact: boolean
}

// Dynamic risk calculator
export class DynamicRiskCalculator {
  private readonly log: ReturnType<typeof Log.create>

  // Default factor weights from ADR-003
  private readonly defaultWeights: Record<RiskFactorType, number> = {
    reversibility: 0.25,
    data_sensitivity: 0.3,
    scope: 0.2,
    autonomy: 0.1,
    external_impact: 0.15,
  }

  constructor() {
    this.log = Log.create({ service: "kiloclaw.policy.dynamic" })
  }

  // Calculate risk score for an action
  calculate(input: RiskCalculationInput): DynamicRiskScore {
    this.log.debug("calculating dynamic risk", { actionType: input.action.type })

    const factors = this.calculateFactors(input)
    const score = this.aggregateScore(factors)
    const threshold = Policy.classifyRisk(score)

    this.log.info("risk calculated", { actionType: input.action.type, score, threshold })

    return {
      action: input.action,
      score,
      factors,
      threshold,
    }
  }

  // Calculate individual risk factors
  private calculateFactors(input: RiskCalculationInput): RiskFactor[] {
    return [
      this.calculateReversibilityFactor(input.action),
      this.calculateDataSensitivityFactor(input.dataClassifications),
      this.calculateScopeFactor(input.toolIds),
      this.calculateAutonomyFactor(input.isAgencyContext),
      this.calculateExternalImpactFactor(input.hasExternalImpact),
    ]
  }

  // Reversibility factor
  private calculateReversibilityFactor(action: Action): RiskFactor {
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
    ]
    const isIrreversible = irreversible.some((t) => action.type.toLowerCase().includes(t))
    return {
      type: "reversibility",
      weight: this.defaultWeights.reversibility,
      value: isIrreversible ? 0.9 : 0.1,
    }
  }

  // Data sensitivity factor
  private calculateDataSensitivityFactor(classifications: string[]): RiskFactor {
    const sensitivityMap: Record<string, number> = {
      P0_Critical: 1.0,
      P1_High: 0.75,
      P2_Medium: 0.5,
      P3_Low: 0.25,
    }
    const maxSensitivity =
      classifications.length > 0 ? Math.max(...classifications.map((c) => sensitivityMap[c] ?? 0)) : 0

    return {
      type: "data_sensitivity",
      weight: this.defaultWeights.data_sensitivity,
      value: maxSensitivity,
    }
  }

  // Scope factor based on number of tools involved
  private calculateScopeFactor(toolIds: string[]): RiskFactor {
    let value: number
    if (toolIds.length === 0) {
      value = 0.05
    } else if (toolIds.length === 1) {
      value = 0.2
    } else if (toolIds.length <= 3) {
      value = 0.4
    } else if (toolIds.length <= 5) {
      value = 0.6
    } else {
      value = 0.8
    }

    return {
      type: "scope",
      weight: this.defaultWeights.scope,
      value,
    }
  }

  // Autonomy factor based on agency context
  private calculateAutonomyFactor(isAgencyContext: boolean): RiskFactor {
    return {
      type: "autonomy",
      weight: this.defaultWeights.autonomy,
      value: isAgencyContext ? 0.5 : 0.1,
    }
  }

  // External impact factor
  private calculateExternalImpactFactor(hasExternalImpact: boolean): RiskFactor {
    return {
      type: "external_impact",
      weight: this.defaultWeights.external_impact,
      value: hasExternalImpact ? 0.8 : 0.15,
    }
  }

  // Aggregate weighted factors into final score
  private aggregateScore(factors: RiskFactor[]): number {
    const score = factors.reduce((acc, f) => acc + f.weight * f.value, 0)
    return Math.min(1, Math.max(0, score))
  }

  // Check if score exceeds a threshold
  exceedsThreshold(score: number, level: keyof typeof RISK_THRESHOLDS): boolean {
    return score >= RISK_THRESHOLDS[level]
  }

  // Get recommended action based on risk score
  getRecommendedAction(score: number): "allow" | "confirm" | "block" {
    if (score >= RISK_THRESHOLDS.critical) return "block"
    if (score >= RISK_THRESHOLDS.high) return "confirm"
    return "allow"
  }
}

// Namespace exports
export namespace DynamicRisk {
  export const calculator = new DynamicRiskCalculator()

  export function calculate(input: RiskCalculationInput): DynamicRiskScore {
    return calculator.calculate(input)
  }

  export function isHighRisk(score: number): boolean {
    return score >= RISK_THRESHOLDS.high
  }

  export function isCriticalRisk(score: number): boolean {
    return score >= RISK_THRESHOLDS.critical
  }
}

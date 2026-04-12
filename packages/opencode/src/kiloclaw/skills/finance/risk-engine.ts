// Finance Risk Engine Skill
// Portfolio risk assessment with circuit breakers

import { Log } from "@/util/log"
import { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"

export interface Position {
  symbol: string
  quantity: number
  avgPrice: number
  currentPrice: number
}

export interface RiskLimits {
  maxPositionPct: number
  maxLossDailyPct: number
  maxDrawdownPct: number
  maxLeverage: number
}

export interface RiskEngineInput {
  portfolio: Position[]
  riskLimits: RiskLimits
}

export interface RiskEngineOutput {
  riskScore: number
  var: number
  sharpeRatio: number
  maxDrawdown: number
  violations: Violation[]
  recommendations: string[]
  circuitBreakerTriggered: boolean
}

export interface Violation {
  limit: string
  current: number
  allowed: number
  severity: "warning" | "critical"
}

export const FinanceRiskEngineSkill: Skill = {
  id: "finance-risk-engine" as SkillId,
  version: "1.0.0",
  name: "Finance Risk Engine",
  inputSchema: {
    type: "object",
    properties: {
      portfolio: {
        type: "array",
        items: {
          type: "object",
          properties: {
            symbol: { type: "string" },
            quantity: { type: "number" },
            avgPrice: { type: "number" },
            currentPrice: { type: "number" },
          },
        },
      },
      riskLimits: {
        type: "object",
        properties: {
          maxPositionPct: { type: "number" },
          maxLossDailyPct: { type: "number" },
          maxDrawdownPct: { type: "number" },
          maxLeverage: { type: "number" },
        },
      },
    },
    required: ["portfolio", "riskLimits"],
  },
  outputSchema: {
    type: "object",
    properties: {
      riskScore: { type: "number" },
      var: { type: "number" },
      sharpeRatio: { type: "number" },
      maxDrawdown: { type: "number" },
      violations: {
        type: "array",
        items: { type: "object", properties: { limit: { type: "string" }, current: { type: "number" }, allowed: { type: "number" }, severity: { type: "string" } } },
      },
      recommendations: { type: "array", items: { type: "string" } },
      circuitBreakerTriggered: { type: "boolean" },
    },
  },
  capabilities: ["risk.assessment", "alert.risk"],
  tags: ["finance", "risk-management", "portfolio"],
  async execute(input: unknown, context: SkillContext): Promise<RiskEngineOutput> {
    const log = Log.create({ service: "kiloclaw.skill.finance-risk-engine" })
    const startTime = Date.now()

    log.info("risk engine skill started", { correlationId: context.correlationId, input })

    const { portfolio, riskLimits } = input as RiskEngineInput

    const violations: Violation[] = []
    const recommendations: string[] = []
    let circuitBreakerTriggered = false

    // Calculate total portfolio value
    const totalValue = portfolio.reduce((sum, p) => sum + p.quantity * p.currentPrice, 0)
    const totalCost = portfolio.reduce((sum, p) => sum + p.quantity * p.avgPrice, 0)

    // Check position concentration
    for (const position of portfolio) {
      const positionValue = position.quantity * position.currentPrice
      const positionPct = (positionValue / totalValue) * 100

      if (positionPct > riskLimits.maxPositionPct) {
        violations.push({
          limit: "maxPositionPct",
          current: positionPct,
          allowed: riskLimits.maxPositionPct,
          severity: positionPct > riskLimits.maxPositionPct * 1.5 ? "critical" : "warning",
        })
        recommendations.push(`Reduce ${position.symbol} position: ${positionPct.toFixed(1)}% exceeds limit of ${riskLimits.maxPositionPct}%`)
      }
    }

    // Calculate daily P&L
    const dailyPnL = portfolio.reduce((sum, p) => {
      const value = p.quantity * p.currentPrice
      const cost = p.quantity * p.avgPrice
      return sum + (value - cost)
    }, 0)
    const dailyPnLPct = (dailyPnL / totalValue) * 100

    if (dailyPnLPct < -riskLimits.maxLossDailyPct) {
      violations.push({
        limit: "maxLossDailyPct",
        current: Math.abs(dailyPnLPct),
        allowed: riskLimits.maxLossDailyPct,
        severity: "critical",
      })
      recommendations.push(`Daily loss ${Math.abs(dailyPnLPct).toFixed(2)}% exceeds limit of ${riskLimits.maxLossDailyPct}%`)
      circuitBreakerTriggered = true
    }

    // Calculate max drawdown (simplified)
    const maxDrawdown = Math.abs(dailyPnLPct) * 1.5 // Simplified estimate
    if (maxDrawdown > riskLimits.maxDrawdownPct) {
      violations.push({
        limit: "maxDrawdownPct",
        current: maxDrawdown,
        allowed: riskLimits.maxDrawdownPct,
        severity: "critical",
      })
      recommendations.push(`Max drawdown ${maxDrawdown.toFixed(2)}% exceeds limit of ${riskLimits.maxDrawdownPct}%`)
      circuitBreakerTriggered = true
    }

    // Calculate risk score (0-100)
    const riskScore = Math.min(100, violations.length * 20 + (circuitBreakerTriggered ? 30 : 0))

    // Calculate VaR (simplified - 1-day 95% VaR)
    const volatility = 0.02 // Assume 2% daily volatility
    const var_ = totalValue * 1.65 * volatility

    // Calculate Sharpe Ratio (simplified)
    const sharpeRatio = dailyPnL / (totalValue * volatility)

    log.info("risk engine completed", {
      correlationId: context.correlationId,
      riskScore,
      violationsCount: violations.length,
      circuitBreakerTriggered,
      durationMs: Date.now() - startTime,
    })

    return {
      riskScore,
      var: var_,
      sharpeRatio,
      maxDrawdown,
      violations,
      recommendations,
      circuitBreakerTriggered,
    }
  },
}

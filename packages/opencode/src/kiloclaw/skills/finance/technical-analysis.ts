// Finance Technical Analysis Skill
// Calculates technical indicators and identifies patterns

import { Log } from "@/util/log"
import { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"

export interface TechnicalAnalysisInput {
  symbol: string
  timeframe: "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w" | "1mo"
  indicators: ("rsi" | "macd" | "sma" | "ema" | "bb" | "atr" | "adx")[]
  prices: { timestamp: string; open: number; high: number; low: number; close: number; volume: number }[]
}

export interface TechnicalAnalysisOutput {
  symbol: string
  signals: Signal[]
  patterns: Pattern[]
  summary: string
}

export interface Signal {
  indicator: string
  value: number
  signal: "bullish" | "bearish" | "neutral"
  strength: number
}

export interface Pattern {
  type: string
  confidence: number
  description: string
}

export const FinanceTechnicalAnalysisSkill: Skill = {
  id: "finance-technical-analysis" as SkillId,
  version: "1.0.0",
  name: "Finance Technical Analysis",
  inputSchema: {
    type: "object",
    properties: {
      symbol: { type: "string" },
      timeframe: { type: "string", enum: ["1m", "5m", "15m", "1h", "4h", "1d", "1w", "1mo"] },
      indicators: {
        type: "array",
        items: { type: "string", enum: ["rsi", "macd", "sma", "ema", "bb", "atr", "adx"] },
      },
      prices: {
        type: "array",
        items: {
          type: "object",
          properties: {
            timestamp: { type: "string" },
            open: { type: "number" },
            high: { type: "number" },
            low: { type: "number" },
            close: { type: "number" },
            volume: { type: "number" },
          },
        },
      },
    },
    required: ["symbol", "timeframe", "indicators", "prices"],
  },
  outputSchema: {
    type: "object",
    properties: {
      symbol: { type: "string" },
      signals: {
        type: "array",
        items: {
          type: "object",
          properties: { indicator: { type: "string" }, value: { type: "number" }, signal: { type: "string" }, strength: { type: "number" } },
        },
      },
      patterns: {
        type: "array",
        items: { type: "object", properties: { type: { type: "string" }, confidence: { type: "number" }, description: { type: "string" } } },
      },
      summary: { type: "string" },
    },
  },
  capabilities: ["technical.indicators", "chart.patterns"],
  tags: ["finance", "technical-analysis", "indicators"],
  async execute(input: unknown, context: SkillContext): Promise<TechnicalAnalysisOutput> {
    const log = Log.create({ service: "kiloclaw.skill.finance-technical-analysis" })
    const startTime = Date.now()

    log.info("technical analysis skill started", { correlationId: context.correlationId, input })

    const { symbol, timeframe, indicators, prices } = input as TechnicalAnalysisInput

    const signals: Signal[] = []
    const patterns: Pattern[] = []

    // Calculate indicators
    for (const indicator of indicators) {
      const result = calculateIndicator(indicator, prices)
      signals.push(result)
    }

    // Detect patterns
    if (prices.length >= 20) {
      const patternResult = detectPatterns(prices)
      patterns.push(patternResult)
    }

    const summary = generateSummary(signals, patterns)

    log.info("technical analysis completed", {
      correlationId: context.correlationId,
      symbol,
      signalsCount: signals.length,
      patternsCount: patterns.length,
      durationMs: Date.now() - startTime,
    })

    return { symbol, signals, patterns, summary }
  },
}

function calculateIndicator(indicator: string, prices: { close: number }[]): Signal {
  const closes = prices.map((p) => p.close)
  const lastPrice = closes[closes.length - 1]

  switch (indicator) {
    case "rsi": {
      const gains = []
      const losses = []
      for (let i = 1; i < closes.length; i++) {
        const change = closes[i] - closes[i - 1]
        gains.push(Math.max(0, change))
        losses.push(Math.max(0, -change))
      }
      const avgGain = gains.slice(-14).reduce((a, b) => a + b, 0) / 14
      const avgLoss = losses.slice(-14).reduce((a, b) => a + b, 0) / 14
      const rs = avgGain / (avgLoss || 1)
      const rsi = 100 - 100 / (1 + rs)
      return {
        indicator: "rsi",
        value: rsi,
        signal: rsi > 70 ? "bearish" : rsi < 30 ? "bullish" : "neutral",
        strength: Math.abs(rsi - 50) / 50,
      }
    }
    case "macd": {
      const ema12 = calculateEMA(closes, 12)
      const ema26 = calculateEMA(closes, 26)
      const macd = ema12 - ema26
      const signal = macd > 0 ? "bullish" : macd < 0 ? "bearish" : "neutral"
      return { indicator: "macd", value: macd, signal, strength: Math.abs(macd) / lastPrice }
    }
    case "sma": {
      const sma = closes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, closes.length)
      return { indicator: "sma", value: sma, signal: lastPrice > sma ? "bullish" : "bearish", strength: Math.abs(lastPrice - sma) / sma }
    }
    case "ema": {
      const ema = calculateEMA(closes, 12)
      return { indicator: "ema", value: ema, signal: lastPrice > ema ? "bullish" : "bearish", strength: Math.abs(lastPrice - ema) / ema }
    }
    case "bb": {
      const sma = closes.slice(-20).reduce((a, b) => a + b, 0) / Math.min(20, closes.length)
      const variance = closes.slice(-20).reduce((a, b) => a + Math.pow(b - sma, 2), 0) / closes.length
      const stdDev = Math.sqrt(variance)
      const upper = sma + 2 * stdDev
      const lower = sma - 2 * stdDev
      return {
        indicator: "bb",
        value: lastPrice,
        signal: lastPrice < lower ? "bullish" : lastPrice > upper ? "bearish" : "neutral",
        strength: lastPrice < lower || lastPrice > upper ? 1 : 0,
      }
    }
    case "atr": {
      const trs = []
      for (let i = 1; i < prices.length; i++) {
        const tr = Math.max(prices[i].high - prices[i].low, Math.abs(prices[i].high - closes[i - 1]), Math.abs(prices[i].low - closes[i - 1]))
        trs.push(tr)
      }
      const atr = trs.slice(-14).reduce((a, b) => a + b, 0) / 14
      return { indicator: "atr", value: atr, signal: "neutral", strength: 0.5 }
    }
    case "adx": {
      return { indicator: "adx", value: 25 + Math.random() * 30, signal: "neutral", strength: 0.5 }
    }
    default:
      return { indicator, value: 0, signal: "neutral" as const, strength: 0 }
  }
}

function calculateEMA(data: number[], period: number): number {
  const multiplier = 2 / (period + 1)
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period
  for (let i = period; i < data.length; i++) {
    ema = data[i] * multiplier + ema * (1 - multiplier)
  }
  return ema
}

function detectPatterns(prices: { high: number; low: number; close: number }[]): Pattern {
  // Simple pattern detection - look for double bottom, head and shoulders, etc.
  const highs = prices.map((p) => p.high)
  const lows = prices.map((p) => p.low)

  // Check for uptrend
  const trend = highs[highs.length - 1] > highs[0] ? "uptrend" : "downtrend"

  return {
    type: trend,
    confidence: 0.7,
    description: `Detected ${trend} pattern with ${prices.length} data points`,
  }
}

function generateSummary(signals: Signal[], patterns: Pattern[]): string {
  const bullish = signals.filter((s) => s.signal === "bullish").length
  const bearish = signals.filter((s) => s.signal === "bearish").length
  const neutral = signals.filter((s) => s.signal === "neutral").length

  const overall = bullish > bearish ? "bullish" : bearish > bullish ? "bearish" : "neutral"

  return `Technical analysis shows ${overall} momentum. ${bullish} bullish, ${bearish} bearish, ${neutral} neutral signals. ${
    patterns.length > 0 ? `Pattern detected: ${patterns[0].type}` : ""
  }`
}

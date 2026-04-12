// Finance Market Data Skill
// Fetches and aggregates market data from multiple providers

import { Log } from "@/util/log"
import { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"
import { FinanceProviders } from "../../agency/finance/providers"

// Input types
export interface MarketDataInput {
  /** Asset symbol (e.g., "BTC", "AAPL", "ETH") */
  symbol: string
  /** Asset type for provider routing */
  assetType: "stock" | "etf" | "crypto" | "forex" | "commodity"
  /** Data type to fetch */
  dataType: "price" | "historical" | "orderbook" | "fundamentals" | "news"
  /** Timeframe for historical data (default: "1d") */
  timeframe?: "1m" | "5m" | "15m" | "1h" | "4h" | "1d" | "1w" | "1mo"
  /** Number of data points for historical (default: 30) */
  limit?: number
}

// Output types
export interface MarketDataOutput {
  data: PriceData | HistoricalData[] | OrderbookData | FundamentalsData | NewsData[]
  providerUsed: string
  quality: number
  latencyMs: number
  fromCache: boolean
  fallbackChain: string[]
  errors: Record<string, string>
  timestamp: string
}

export interface PriceData {
  symbol: string
  price: number
  change24h: number
  changePercent24h: number
  high24h: number
  low24h: number
  volume24h: number
  marketCap?: number
}

export interface HistoricalData {
  timestamp: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export interface OrderbookData {
  symbol: string
  bids: { price: number; quantity: number }[]
  asks: { price: number; quantity: number }[]
  spread: number
}

export interface FundamentalsData {
  symbol: string
  name: string
  sector?: string
  marketCap?: number
  peRatio?: number
  eps?: number
  dividendYield?: number
  beta?: number
  weekHigh52: number
  weekLow52: number
}

export interface NewsData {
  title: string
  source: string
  url: string
  publishedAt: string
  sentiment?: "positive" | "negative" | "neutral"
}

export const FinanceMarketDataSkill: Skill = {
  id: "finance-market-data" as SkillId,
  version: "1.0.0",
  name: "Finance Market Data",
  inputSchema: {
    type: "object",
    properties: {
      symbol: { type: "string", description: "Asset symbol (e.g., 'BTC', 'AAPL')" },
      assetType: { type: "string", enum: ["stock", "etf", "crypto", "forex", "commodity"] },
      dataType: { type: "string", enum: ["price", "historical", "orderbook", "fundamentals", "news"] },
      timeframe: { type: "string", enum: ["1m", "5m", "15m", "1h", "4h", "1d", "1w", "1mo"] },
      limit: { type: "number", minimum: 1, maximum: 365 },
    },
    required: ["symbol", "assetType", "dataType"],
  },
  outputSchema: {
    type: "object",
    properties: {
      data: { type: "object" },
      providerUsed: { type: "string" },
      quality: { type: "number" },
      latencyMs: { type: "number" },
      fromCache: { type: "boolean" },
      fallbackChain: { type: "array", items: { type: "string" } },
      errors: { type: "object" },
      timestamp: { type: "string" },
    },
  },
  capabilities: ["price.current", "price.historical", "orderbook", "fundamentals", "macro", "filings", "news"],
  tags: ["finance", "market-data", "data-ingestion"],
  async execute(input: unknown, context: SkillContext): Promise<MarketDataOutput> {
    const log = Log.create({ service: "kiloclaw.skill.finance-market-data" })
    const startTime = Date.now()

    log.info("finance market data skill started", { correlationId: context.correlationId, input })

    const { symbol, assetType, dataType, timeframe = "1d", limit = 30 } = input as MarketDataInput

    const errors: Record<string, string> = {}
    const fallbackChain: string[] = []

    const primaryProvider = FinanceProviders.getPrimaryProvider(assetType, dataType)
    const fallbackProviders = FinanceProviders.getFallbackProviders(assetType, dataType)

    log.info("provider routing", { primaryProvider, fallbackProviders })

    let result: any = null
    let providerUsed = primaryProvider

    try {
      result = await FinanceProviders.fetch(primaryProvider, symbol, dataType, { timeframe, limit })
    } catch (err: any) {
      errors[primaryProvider] = err?.message ?? "Unknown error"
      fallbackChain.push(primaryProvider)
    }

    if (!result) {
      for (const provider of fallbackProviders) {
        try {
          result = await FinanceProviders.fetch(provider, symbol, dataType, { timeframe, limit })
          providerUsed = provider
          fallbackChain.push(provider)
          break
        } catch (err: any) {
          errors[provider] = err?.message ?? "Unknown error"
          fallbackChain.push(provider)
        }
      }
    }

    if (!result) {
      return {
        data: {} as any,
        providerUsed: "none",
        quality: 0,
        latencyMs: Date.now() - startTime,
        fromCache: false,
        fallbackChain,
        errors,
        timestamp: new Date().toISOString(),
      }
    }

    return {
      data: result.data,
      providerUsed,
      quality: result.quality ?? 100,
      latencyMs: Date.now() - startTime,
      fromCache: result.fromCache ?? false,
      fallbackChain,
      errors,
      timestamp: new Date().toISOString(),
    }
  },
}

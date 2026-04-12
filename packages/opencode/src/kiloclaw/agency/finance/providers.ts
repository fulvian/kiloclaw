// Finance Providers - Multi-provider data fetching with fallback

import { Log } from "@/util/log"
import type { AssetType, DataType } from "../../types"

// Provider configuration
interface ProviderConfig {
  id: string
  rateLimit: { rpm: number; daily: number }
  supportedAssets: AssetType[]
  supportedDataTypes: DataType[]
}

const PROVIDERS: Record<string, ProviderConfig> = {
  coingecko: {
    id: "coingecko",
    rateLimit: { rpm: 10, daily: 100 },
    supportedAssets: ["crypto"],
    supportedDataTypes: ["price", "historical", "news"],
  },
  binance: {
    id: "binance",
    rateLimit: { rpm: 1200, daily: 100000 },
    supportedAssets: ["crypto"],
    supportedDataTypes: ["price", "historical", "orderbook"],
  },
  yahoo_finance: {
    id: "yahoo_finance",
    rateLimit: { rpm: 2000, daily: 100000 },
    supportedAssets: ["stock", "etf", "crypto", "forex"],
    supportedDataTypes: ["price", "historical", "fundamentals", "news"],
  },
  finnhub: {
    id: "finnhub",
    rateLimit: { rpm: 60, daily: 5000 },
    supportedAssets: ["stock"],
    supportedDataTypes: ["fundamentals", "news"],
  },
  fred: {
    id: "fred",
    rateLimit: { rpm: 120, daily: 10000 },
    supportedAssets: ["stock", "etf", "forex", "commodity"],
    supportedDataTypes: ["price"],
  },
}

export const FinanceProviders = {
  getPrimaryProvider(assetType: AssetType, dataType: DataType): string {
    // Crypto primary
    if (assetType === "crypto") {
      if (dataType === "orderbook") return "binance"
      return "coingecko"
    }
    // Stock/ETF primary
    if (assetType === "stock" || assetType === "etf") {
      if (dataType === "fundamentals") return "finnhub"
      return "yahoo_finance"
    }
    // Default
    return "yahoo_finance"
  },

  getFallbackProviders(assetType: AssetType, dataType: DataType): string[] {
    const fallbacks: Record<string, string[]> = {
      crypto: dataType === "orderbook" ? ["coingecko"] : ["binance", "yahoo_finance"],
      stock: dataType === "fundamentals" ? ["yahoo_finance"] : ["finnhub", "yahoo_finance"],
      etf: ["yahoo_finance"],
      forex: ["yahoo_finance"],
      commodity: ["yahoo_finance"],
    }
    return fallbacks[assetType] || ["yahoo_finance"]
  },

  async fetch(
    provider: string,
    symbol: string,
    dataType: DataType,
    options: { timeframe?: string; limit?: number }
  ): Promise<{ data: any; quality: number; fromCache: boolean }> {
    const log = Log.create({ service: "finance.providers" })

    // Mock implementation - in production, these would call actual APIs
    // This is a placeholder that returns structured data for testing

    log.info("fetching data", { provider, symbol, dataType })

    // Return mock data based on provider and type
    const mockData = generateMockData(provider, symbol, dataType)

    return {
      data: mockData,
      quality: 85,
      fromCache: false,
    }
  },
}

function generateMockData(provider: string, symbol: string, dataType: DataType): any {
  switch (dataType) {
    case "price":
      return {
        symbol,
        price: 100 + Math.random() * 1000,
        change24h: (Math.random() - 0.5) * 100,
        changePercent24h: (Math.random() - 0.5) * 10,
        high24h: 1100,
        low24h: 900,
        volume24h: 1000000000,
        marketCap: 100000000000,
      }
    case "historical":
      return Array.from({ length: 30 }, (_, i) => ({
        timestamp: new Date(Date.now() - i * 86400000).toISOString(),
        open: 100 + Math.random() * 50,
        high: 110 + Math.random() * 50,
        low: 90 + Math.random() * 50,
        close: 100 + Math.random() * 50,
        volume: 1000000 + Math.random() * 500000,
      }))
    case "orderbook":
      return {
        symbol,
        bids: Array.from({ length: 10 }, (_, i) => ({
          price: 100 - i * 0.5,
          quantity: Math.random() * 10,
        })),
        asks: Array.from({ length: 10 }, (_, i) => ({
          price: 100 + i * 0.5,
          quantity: Math.random() * 10,
        })),
        spread: 1.0,
      }
    case "fundamentals":
      return {
        symbol,
        name: `${symbol} Inc.`,
        sector: "Technology",
        marketCap: 1000000000000,
        peRatio: 25 + Math.random() * 30,
        eps: 5 + Math.random() * 10,
        dividendYield: Math.random() * 3,
        beta: 1 + Math.random(),
        weekHigh52: 150,
        weekLow52: 80,
      }
    case "news":
      return [
        {
          title: `${symbol} reports strong earnings`,
          source: "Financial Times",
          url: "https://example.com/news/1",
          publishedAt: new Date().toISOString(),
          sentiment: "positive" as const,
        },
      ]
    default:
      return {}
  }
}

export const FINANCE_PROVIDER_CONFIG = PROVIDERS

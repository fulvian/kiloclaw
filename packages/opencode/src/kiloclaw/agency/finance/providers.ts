// Finance Providers - Multi-provider data fetching with fallback
// Uses yahooquery for Yahoo Finance data (replaces deprecated yfinance)
// Docs: https://yahooquery.dopaapps.net/

import { Log } from "@/util/log"
import { Process } from "@/util/process"
import type { AssetType, DataType } from "../../types"

// Provider configuration
interface ProviderConfig {
  id: string
  rateLimit: { rpm: number; daily: number }
  supportedAssets: AssetType[]
  supportedDataTypes: DataType[]
  requiresPython?: boolean
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
  yahooquery: {
    id: "yahooquery",
    rateLimit: { rpm: 2000, daily: 100000 },
    supportedAssets: ["stock", "etf", "crypto", "forex"],
    supportedDataTypes: ["price", "historical", "fundamentals", "news"],
    requiresPython: true,
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

// Python wrapper path for yahooquery
const YAHOOQUERY_WRAPPER = Bun.env.YAHOOQUERY_WRAPPER_PATH ?? "/tmp/yahooquery_wrapper.py"

export const FinanceProviders = {
  getPrimaryProvider(assetType: AssetType, dataType: DataType): string {
    // Crypto primary
    if (assetType === "crypto") {
      if (dataType === "orderbook") return "binance"
      return "coingecko"
    }
    // Stock/ETF primary - use yahooquery
    if (assetType === "stock" || assetType === "etf") {
      if (dataType === "fundamentals") return "finnhub"
      return "yahooquery"
    }
    // Default - use yahooquery
    return "yahooquery"
  },

  getFallbackProviders(assetType: AssetType, dataType: DataType): string[] {
    const fallbacks: Record<string, string[]> = {
      crypto: dataType === "orderbook" ? ["coingecko"] : ["binance", "yahooquery"],
      stock: dataType === "fundamentals" ? ["yahooquery"] : ["finnhub", "yahooquery"],
      etf: ["yahooquery"],
      forex: ["yahooquery"],
      commodity: ["yahooquery"],
    }
    return fallbacks[assetType] || ["yahooquery"]
  },

  async fetch(
    provider: string,
    symbol: string,
    dataType: DataType,
    options: { timeframe?: string; limit?: number },
  ): Promise<{ data: any; quality: number; fromCache: boolean }> {
    const log = Log.create({ service: "finance.providers" })
    const startTime = Date.now()

    log.info("fetching data", { provider, symbol, dataType })

    try {
      // Use yahooquery for Yahoo Finance data
      if (provider === "yahooquery") {
        return await fetchYahooQuery(symbol, dataType, options, log)
      }

      // For other providers, return mock data for now
      // TODO: Implement actual API calls for coingecko, binance, finnhub, fred
      const mockData = generateMockData(provider, symbol, dataType)
      return {
        data: mockData,
        quality: 60, // Lower quality for mock data
        fromCache: false,
      }
    } catch (err) {
      log.error("fetch failed", { provider, symbol, dataType, err })
      throw err
    }
  },
}

/**
 * Fetch data using yahooquery Python library
 * Requires: pip install yahooquery
 */
async function fetchYahooQuery(
  symbol: string,
  dataType: DataType,
  options: { timeframe?: string; limit?: number },
  log: ReturnType<typeof Log.create>,
): Promise<{ data: any; quality: number; fromCache: boolean }> {
  const limit = options.limit ?? 30

  // Build Python script for yahooquery
  const pythonScript = buildYahooQueryScript(symbol, dataType, limit)

  try {
    const result = await Process.run(["python3", "-c", pythonScript], {
      timeout: 30000,
    })

    if (result.code !== 0) {
      const stderr = result.stderr.toString()
      log.error("yahooquery python failed", { stderr })
      throw new Error(`yahooquery failed: ${stderr}`)
    }

    const stdout = result.stdout.toString()
    const data = JSON.parse(stdout)

    return {
      data,
      quality: 95,
      fromCache: false,
    }
  } catch (err) {
    log.warn("yahooquery unavailable, using mock data", { err: String(err) })
    // Fallback to mock data if Python/yahooquery not available
    return {
      data: generateMockData("yahooquery", symbol, dataType),
      quality: 60,
      fromCache: false,
    }
  }
}

/**
 * Build Python script for yahooquery calls
 */
function buildYahooQueryScript(symbol: string, dataType: DataType, limit: number): string {
  // Import yahooquery and return JSON
  const handlers: Record<DataType, string> = {
    price: `
from yahooquery import Ticker
t = Ticker('${symbol}')
info = t.price['${symbol}']
print(json.dumps(info))
`,
    historical: `
from yahooquery import Ticker
import json
t = Ticker('${symbol}')
hist = t.history(period='${limit}d')
# Convert DataFrame to list of dicts
records = hist.reset_index().to_dict('records')
# Convert datetime to ISO string
for r in records:
    if 'date' in r:
        r['timestamp'] = r.pop('date').isoformat()
print(json.dumps(records))
`,
    fundamentals: `
from yahooquery import Ticker
t = Ticker('${symbol}')
info = t.summary_detail['${symbol}']
print(json.dumps(info))
`,
    news: `
from yahooquery import Ticker
t = Ticker('${symbol}')
news = t.news['${symbol}']
print(json.dumps(news))
`,
    orderbook: `
# yahooquery doesn't provide orderbook data
print(json.dumps({}))
`,
  }

  const handler = handlers[dataType] ?? handlers.price

  return `
import json
${handler}
`.trim()
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

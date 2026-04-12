// Finance Providers - Multi-provider data fetching with fallback
// Primary providers: Twelve Data, Polygon, Alpha Vantage, FRED, Finnhub, FMP
// Docs: See each provider section below

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
  // Twelve Data - Primary for stocks, forex, crypto (good free tier)
  twelve_data: {
    id: "twelve_data",
    rateLimit: { rpm: 800, daily: 100000 },
    supportedAssets: ["stock", "etf", "crypto", "forex", "commodity"],
    supportedDataTypes: ["price", "historical", "fundamentals"],
  },
  // Polygon - US stocks, forex, crypto
  polygon: {
    id: "polygon",
    rateLimit: { rpm: 100, daily: 10000 },
    supportedAssets: ["stock", "crypto", "forex"],
    supportedDataTypes: ["price", "historical"],
  },
  // Alpha Vantage - Technical indicators, forex, crypto
  alpha_vantage: {
    id: "alpha_vantage",
    rateLimit: { rpm: 75, daily: 5000 },
    supportedAssets: ["stock", "forex", "crypto"],
    supportedDataTypes: ["price", "historical"],
  },
  // FRED - Macroeconomic data
  fred: {
    id: "fred",
    rateLimit: { rpm: 120, daily: 10000 },
    supportedAssets: ["stock", "etf", "forex", "commodity"],
    supportedDataTypes: ["price"],
  },
  // Finnhub - Stock fundamentals, news, SEC filings
  finnhub: {
    id: "finnhub",
    rateLimit: { rpm: 60, daily: 5000 },
    supportedAssets: ["stock"],
    supportedDataTypes: ["fundamentals", "news"],
  },
  // Financial Modeling Prep - Stock fundamentals, ratios
  fmp: {
    id: "fmp",
    rateLimit: { rpm: 250, daily: 10000 },
    supportedAssets: ["stock"],
    supportedDataTypes: ["fundamentals", "news"],
  },
  // NASDAQ - Market data
  nasdaq: {
    id: "nasdaq",
    rateLimit: { rpm: 100, daily: 5000 },
    supportedAssets: ["stock", "etf"],
    supportedDataTypes: ["price", "historical"],
  },
}

export const FinanceProviders = {
  getPrimaryProvider(assetType: AssetType, dataType: DataType): string {
    // Stocks - use Twelve Data first, then FMP, Finnhub
    if (assetType === "stock") {
      if (dataType === "fundamentals") return "fmp"
      return "twelve_data"
    }
    // ETF - use Twelve Data
    if (assetType === "etf") {
      return "twelve_data"
    }
    // Crypto - use Twelve Data or Polygon
    if (assetType === "crypto") {
      return "twelve_data"
    }
    // Forex - use Twelve Data
    if (assetType === "forex") {
      return "twelve_data"
    }
    // Commodity - use Twelve Data
    if (assetType === "commodity") {
      return "twelve_data"
    }
    // Default
    return "twelve_data"
  },

  getFallbackProviders(assetType: AssetType, dataType: DataType): string[] {
    const fallbacks: Record<string, string[]> = {
      stock: dataType === "fundamentals" ? ["finnhub", "fmp"] : ["polygon", "nasdaq"],
      etf: ["nasdaq", "twelve_data"],
      crypto: ["polygon", "alpha_vantage"],
      forex: ["alpha_vantage", "twelve_data"],
      commodity: ["twelve_data"],
    }
    return fallbacks[assetType] || ["twelve_data"]
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
      // Route to appropriate fetch function
      switch (provider) {
        case "twelve_data":
          return await fetchTwelveData(symbol, dataType, options, log)
        case "polygon":
          return await fetchPolygon(symbol, dataType, options, log)
        case "alpha_vantage":
          return await fetchAlphaVantage(symbol, dataType, options, log)
        case "fred":
          return await fetchFRED(symbol, dataType, log)
        case "finnhub":
          return await fetchFinnhub(symbol, dataType, log)
        case "fmp":
          return await fetchFMP(symbol, dataType, log)
        case "nasdaq":
          return await fetchNASDAQ(symbol, dataType, options, log)
        default:
          log.warn("unknown provider, using mock data", { provider })
          return { data: generateMockData(symbol, dataType), quality: 50, fromCache: false }
      }
    } catch (err) {
      log.error("fetch failed", { provider, symbol, dataType, err })
      throw err
    }
  },
}

// ============================================================================
// Twelve Data - Primary provider (stocks, forex, crypto, commodities)
// Docs: https://twelvedata.com/docs
// ============================================================================
async function fetchTwelveData(
  symbol: string,
  dataType: DataType,
  options: { timeframe?: string; limit?: number },
  log: ReturnType<typeof Log.create>,
): Promise<{ data: any; quality: number; fromCache: boolean }> {
  const apiKey = Bun.env.TWELVE_DATA_API_KEY
  if (!apiKey) {
    log.warn("TWELVE_DATA_API_KEY not set, using mock data")
    return { data: generateMockData(symbol, dataType), quality: 50, fromCache: false }
  }

  const baseUrl = "https://api.twelvedata.com/v1"

  try {
    let url = ""
    let params = ""

    switch (dataType) {
      case "price": {
        url = `${baseUrl}/quote/${symbol}`
        params = `apikey=${apiKey}`
        break
      }
      case "historical": {
        url = `${baseUrl}/time_series`
        const interval = mapTimeframe(options.timeframe)
        params = `symbol=${symbol}&interval=${interval}&apikey=${apiKey}&format=JSON`
        break
      }
      case "fundamentals": {
        // Twelve Data doesn't have deep fundamentals, use FMP instead
        log.warn("twelve_data doesn't support fundamentals, use fmp provider")
        return { data: generateMockData(symbol, dataType), quality: 50, fromCache: false }
      }
      default:
        return { data: {}, quality: 0, fromCache: false }
    }

    const response = await fetch(`${url}?${params}`)
    if (!response.ok) {
      throw new Error(`Twelve Data API error: ${response.status}`)
    }

    const json = await response.json()
    return { data: json, quality: 90, fromCache: false }
  } catch (err) {
    log.error("twelve_data fetch failed", { err })
    return { data: generateMockData(symbol, dataType), quality: 50, fromCache: false }
  }
}

// ============================================================================
// Polygon - US stocks, crypto (real-time and historical)
// Docs: https://polygon.io/docs
// ============================================================================
async function fetchPolygon(
  symbol: string,
  dataType: DataType,
  options: { timeframe?: string; limit?: number },
  log: ReturnType<typeof Log.create>,
): Promise<{ data: any; quality: number; fromCache: boolean }> {
  const apiKey = Bun.env.POLYGON_API_KEY
  if (!apiKey) {
    log.warn("POLYGON_API_KEY not set, using mock data")
    return { data: generateMockData(symbol, dataType), quality: 50, fromCache: false }
  }

  const baseUrl = "https://api.polygon.io/v2"

  try {
    let url = ""

    switch (dataType) {
      case "price": {
        // Get previous close
        url = `${baseUrl}/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${apiKey}`
        break
      }
      case "historical": {
        const multiplier = getPolygonMultiplier(options.timeframe)
        const timespan = getPolygonTimespan(options.timeframe)
        const from = getFromDate(options.limit ?? 30)
        url = `${baseUrl}/aggs/ticker/${symbol}/range/${multiplier}/${timespan}/${from}/now?adjusted=true&apiKey=${apiKey}`
        break
      }
      default:
        return { data: {}, quality: 0, fromCache: false }
    }

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Polygon API error: ${response.status}`)
    }

    const json = await response.json()
    return { data: json, quality: 90, fromCache: false }
  } catch (err) {
    log.error("polygon fetch failed", { err })
    return { data: generateMockData(symbol, dataType), quality: 50, fromCache: false }
  }
}

// ============================================================================
// Alpha Vantage - Technical indicators, forex, crypto
// Docs: https://www.alphavantage.co/documentation/
// ============================================================================
async function fetchAlphaVantage(
  symbol: string,
  dataType: DataType,
  options: { timeframe?: string; limit?: number },
  log: ReturnType<typeof Log.create>,
): Promise<{ data: any; quality: number; fromCache: boolean }> {
  const apiKey = Bun.env.ALPHA_VANTAGE_API_KEY
  if (!apiKey) {
    log.warn("ALPHA_VANTAGE_API_KEY not set, using mock data")
    return { data: generateMockData(symbol, dataType), quality: 50, fromCache: false }
  }

  const baseUrl = "https://www.alphavantage.co/query"

  try {
    let func = ""
    let url = ""

    // Map symbol to forex pair if needed
    const symbolParam = symbol

    switch (dataType) {
      case "price": {
        func = "GLOBAL_QUOTE"
        url = `${baseUrl}?function=${func}&symbol=${symbolParam}&apikey=${apiKey}`
        break
      }
      case "historical": {
        func = "TIME_SERIES_DAILY"
        url = `${baseUrl}?function=${func}&symbol=${symbolParam}&outputsize=compact&apikey=${apiKey}`
        break
      }
      default:
        return { data: {}, quality: 0, fromCache: false }
    }

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Alpha Vantage API error: ${response.status}`)
    }

    const json = await response.json()
    return { data: json, quality: 85, fromCache: false }
  } catch (err) {
    log.error("alpha_vantage fetch failed", { err })
    return { data: generateMockData(symbol, dataType), quality: 50, fromCache: false }
  }
}

// ============================================================================
// FRED - Federal Reserve Economic Data (macroeconomic)
// Docs: https://fred.stlouisfed.org/docs/api/fred/
// ============================================================================
async function fetchFRED(
  symbol: string,
  dataType: DataType,
  log: ReturnType<typeof Log.create>,
): Promise<{ data: any; quality: number; fromCache: boolean }> {
  const apiKey = Bun.env.FRED_API_KEY
  if (!apiKey) {
    log.warn("FRED_API_KEY not set, using mock data")
    return { data: generateMockData(symbol, dataType), quality: 50, fromCache: false }
  }

  const baseUrl = "https://api.stlouisfed.org/fred"

  try {
    // FRED uses series IDs (e.g., "GDP", "CPIAUCSL", "FEDFUNDS")
    let url = `${baseUrl}/series/observations?series_id=${symbol}&api_key=${apiKey}&file_type=json`

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`FRED API error: ${response.status}`)
    }

    const json = await response.json()
    return { data: json, quality: 95, fromCache: false }
  } catch (err) {
    log.error("fred fetch failed", { err })
    return { data: generateMockData(symbol, dataType), quality: 50, fromCache: false }
  }
}

// ============================================================================
// Finnhub - Stock fundamentals, news, SEC filings
// Docs: https://finnhub.io/
// ============================================================================
async function fetchFinnhub(
  symbol: string,
  dataType: DataType,
  log: ReturnType<typeof Log.create>,
): Promise<{ data: any; quality: number; fromCache: boolean }> {
  const apiKey = Bun.env.FINNHUB_API_KEY
  if (!apiKey) {
    log.warn("FINNHUB_API_KEY not set, using mock data")
    return { data: generateMockData(symbol, dataType), quality: 50, fromCache: false }
  }

  const baseUrl = "https://finnhub.io/api/v1"

  try {
    let url = ""

    switch (dataType) {
      case "price": {
        url = `${baseUrl}/quote?symbol=${symbol}&token=${apiKey}`
        break
      }
      case "fundamentals": {
        url = `${baseUrl}/stock/metric?symbol=${symbol}&metric=all&token=${apiKey}`
        break
      }
      case "news": {
        // Get market news
        url = `${baseUrl}/news?category=general&token=${apiKey}`
        break
      }
      default:
        return { data: {}, quality: 0, fromCache: false }
    }

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Finnhub API error: ${response.status}`)
    }

    const json = await response.json()
    return { data: json, quality: 85, fromCache: false }
  } catch (err) {
    log.error("finnhub fetch failed", { err })
    return { data: generateMockData(symbol, dataType), quality: 50, fromCache: false }
  }
}

// ============================================================================
// Financial Modeling Prep - Stock fundamentals, ratios, financial statements
// Docs: https://site.financialmodelingprep.com/developer/docs
// ============================================================================
async function fetchFMP(
  symbol: string,
  dataType: DataType,
  log: ReturnType<typeof Log.create>,
): Promise<{ data: any; quality: number; fromCache: boolean }> {
  const apiKey = Bun.env.FMP_API_KEY
  if (!apiKey) {
    log.warn("FMP_API_KEY not set, using mock data")
    return { data: generateMockData(symbol, dataType), quality: 50, fromCache: false }
  }

  const baseUrl = "https://financialmodelingprep.com/api/v3"

  try {
    let url = ""

    switch (dataType) {
      case "price": {
        url = `${baseUrl}/quote-short/${symbol}?apikey=${apiKey}`
        break
      }
      case "historical": {
        url = `${baseUrl}/historical-price-full/${symbol}?apikey=${apiKey}`
        break
      }
      case "fundamentals": {
        url = `${baseUrl}/key-metrics/${symbol}?apikey=${apiKey}`
        break
      }
      case "news": {
        url = `${baseUrl}/fmp/articles?apikey=${apiKey}`
        break
      }
      default:
        return { data: {}, quality: 0, fromCache: false }
    }

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`FMP API error: ${response.status}`)
    }

    const json = await response.json()
    return { data: json, quality: 85, fromCache: false }
  } catch (err) {
    log.error("fmp fetch failed", { err })
    return { data: generateMockData(symbol, dataType), quality: 50, fromCache: false }
  }
}

// ============================================================================
// NASDAQ - Market data
// Docs: https://api.nasdaq.com/api/docs
// ============================================================================
async function fetchNASDAQ(
  symbol: string,
  dataType: DataType,
  options: { timeframe?: string; limit?: number },
  log: ReturnType<typeof Log.create>,
): Promise<{ data: any; quality: number; fromCache: boolean }> {
  const apiKey = Bun.env.NASDAQ_DATA_API_KEY
  if (!apiKey) {
    log.warn("NASDAQ_DATA_API_KEY not set, using mock data")
    return { data: generateMockData(symbol, dataType), quality: 50, fromCache: false }
  }

  const baseUrl = "https://api.nasdaq.com/api"

  try {
    let url = ""

    switch (dataType) {
      case "price": {
        url = `${baseUrl}/quote/${symbol}/info?apiKey=${apiKey}`
        break
      }
      case "historical": {
        const limit = options.limit ?? 30
        url = `${baseUrl}/quote/${symbol}/historical?assetclass=stocks&limit=${limit}&todate=&fromdate=&type=1%7C2%7C3%7C4&apiKey=${apiKey}`
        break
      }
      default:
        return { data: {}, quality: 0, fromCache: false }
    }

    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    })
    if (!response.ok) {
      throw new Error(`NASDAQ API error: ${response.status}`)
    }

    const json = await response.json()
    return { data: json, quality: 85, fromCache: false }
  } catch (err) {
    log.error("nasdaq fetch failed", { err })
    return { data: generateMockData(symbol, dataType), quality: 50, fromCache: false }
  }
}

// ============================================================================
// Helper functions
// ============================================================================
function mapTimeframe(tf?: string): string {
  const map: Record<string, string> = {
    "1m": "1min",
    "5m": "5min",
    "15m": "15min",
    "1h": "1hour",
    "4h": "4hour",
    "1d": "1day",
    "1w": "1week",
    "1mo": "1month",
  }
  return map[tf ?? "1d"] ?? "1day"
}

function getPolygonMultiplier(tf?: string): number {
  const map: Record<string, number> = {
    "1m": 1,
    "5m": 5,
    "15m": 15,
    "1h": 1,
    "4h": 4,
    "1d": 1,
    "1w": 1,
    "1mo": 1,
  }
  return map[tf ?? "1d"] ?? 1
}

function getPolygonTimespan(tf?: string): string {
  const map: Record<string, string> = {
    "1m": "minute",
    "5m": "minute",
    "15m": "minute",
    "1h": "hour",
    "4h": "hour",
    "1d": "day",
    "1w": "week",
    "1mo": "month",
  }
  return map[tf ?? "1d"] ?? "day"
}

function getFromDate(days: number): string {
  const date = new Date()
  date.setDate(date.getDate() - days)
  return date.toISOString().split("T")[0]
}

// ============================================================================
// Mock data fallback
// ============================================================================
function generateMockData(symbol: string, dataType: DataType): any {
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

// Polymarket Adapter
// Prediction market odds for NBA markets (championship, awards, etc.)
// Uses public Gamma API - no authentication required for reads
// Docs: https://docs.polymarket.com/
// IMPORTANT: Trading/CLOB is DENIED in v1 - read-only access only

import type { Odds } from "../schema"
import { OddsSchema, FreshnessStateSchema } from "../schema"
import { NbaCircuitBreaker, assessFreshness } from "../resilience"
import { Log } from "@/util/log"
import type { NbaAdapter, AdapterResult, AdapterError } from "./base"

const GAMMA_API = "https://gamma-api.polymarket.com"
const PROVIDER = "polymarket"

// NBA-related question condition IDs (from Polymarket)
// These would be fetched dynamically but hardcoded for MVP
const NBA_CHAMPIONSHIP_CONDITIONS = [
  "basketball_nba_championship_winner_2025",
  "basketball_nba_championship_winner_2026",
]

interface GammaMarket {
  id: string
  question: string
  condition_id: string
  slug: string
  active: boolean
  closed: boolean
  outcomes: string[]
  outcome_prices: Record<string, string>
  volume: number
  liquidity: number
  created_at: string
  updated_at: string
  game_start_time?: string
}

interface GammaPriceResult {
  market: string
  prices: { outcome: string; price: string }[]
}

export class PolymarketAdapter implements NbaAdapter {
  readonly provider = PROVIDER
  readonly config: {
    provider: string
    baseUrl: string
    timeoutMs: number
    retryAttempts: number
    circuitBreaker: NbaCircuitBreaker.Instance
  }
  private log = Log.create({ service: `nba.adapter.${PROVIDER}` })

  constructor(
    private circuitBreaker: NbaCircuitBreaker.Instance,
    private timeoutMs = 10000,
    private retryAttempts = 3,
  ) {
    this.config = {
      provider: PROVIDER,
      baseUrl: GAMMA_API,
      timeoutMs,
      retryAttempts,
      circuitBreaker,
    }
  }

  private async fetch<T>(endpoint: string): Promise<T> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const response = await fetch(`${GAMMA_API}${endpoint}`, {
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        throw {
          category: "transient_error" as const,
          message: `HTTP ${response.status}`,
          retryable: true,
          statusCode: response.status,
        }
      }

      return response.json() as T
    } catch (err: any) {
      clearTimeout(timeout)

      if (err.category) throw err

      if (err.name === "AbortError") {
        throw { category: "transient_error" as const, message: "Request timeout", retryable: true }
      }

      throw { category: "fatal_error" as const, message: err.message || "Unknown error", retryable: false }
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.fetch<GammaMarket[]>("/markets?limit=1")
      return true
    } catch {
      return false
    }
  }

  async getGames(): Promise<AdapterResult<never[]>> {
    // Polymarket doesn't provide game scores
    return { data: [], error: null, metadata: { provider: PROVIDER, latencyMs: 0, cached: false, freshnessSeconds: 0 } }
  }

  async getOdds(options?: { gameIds?: string[] }): Promise<AdapterResult<Odds[]>> {
    const startTime = Date.now()

    if (!this.config.circuitBreaker.allow(PROVIDER)) {
      return {
        data: null,
        error: { category: "transient_error", message: "Circuit breaker open", retryable: false },
        metadata: { provider: PROVIDER, latencyMs: Date.now() - startTime, cached: false, freshnessSeconds: 0 },
      }
    }

    try {
      // Fetch NBA-related markets
      // Polymarket uses "condition_id" for specific questions
      // For MVP, we'll search for NBA championship markets
      const searchParams = new URLSearchParams()
      searchParams.set("limit", "50")
      searchParams.set("closed", "false")

      if (options?.gameIds?.length) {
        // NOTE: BallDontLie game IDs (numeric) do NOT work with Polymarket condition IDs.
        // Only pass if they look like Polymarket condition IDs (not pure numeric).
        const isBdlId = (id: string) => /^\d+$/.test(id)
        const polyIds = options.gameIds.filter((id) => !isBdlId(id))
        if (polyIds.length > 0) {
          searchParams.set("condition_id", polyIds.join(","))
        }
        // If all are BDL IDs, fall through to search by question
      }

      // Only search by question if no valid condition IDs were provided
      if (!searchParams.get("condition_id")) {
        searchParams.set("question", "NBA")
      }

      const marketsResponse = await this.fetch<GammaMarket[]>(`/markets?${searchParams}`)
      const now = Date.now()
      const odds: Odds[] = []

      for (const market of marketsResponse) {
        // Parse outcome prices
        const outcomes = Object.keys(market.outcome_prices)
        const prices = Object.values(market.outcome_prices).map((p) => parseFloat(p))

        if (prices.length < 2) continue

        // Calculate fair probabilities
        const total = prices.reduce((sum, p) => sum + p, 0)
        const fairProbabilities = prices.map((p) => p / total)
        const overround = total
        const vigPercent = (overround - 1) * 100

        const lastUpdate = new Date(market.updated_at).getTime()
        const freshnessSeconds = Math.max(0, Math.floor((now - lastUpdate) / 1000))
        const freshness = assessFreshness("polymarket", freshnessSeconds)

        // Polymarket markets are binary (Yes/No) typically
        // Map to our odds format
        odds.push(
          OddsSchema.parse({
            odds_id: `polymarket-${market.id}`,
            game_id: market.condition_id,
            source: "polymarket",
            market: "h2h", // Polymarket is effectively a binary market
            bookmaker_or_exchange: "Polymarket",
            outcomes: outcomes,
            implied_probabilities_raw: fairProbabilities,
            implied_probabilities_fair: fairProbabilities,
            vig_percent: vigPercent,
            freshness_seconds: freshnessSeconds,
            freshness_state: freshness.state,
            collected_at_utc: new Date().toISOString(),
          }),
        )
      }

      this.config.circuitBreaker.recordSuccess(PROVIDER)

      return {
        data: odds,
        error: null,
        metadata: {
          provider: PROVIDER,
          latencyMs: Date.now() - startTime,
          cached: false,
          freshnessSeconds: 0,
        },
      }
    } catch (err: any) {
      this.config.circuitBreaker.recordFailure(PROVIDER)
      return {
        data: null,
        error: err as AdapterError,
        metadata: { provider: PROVIDER, latencyMs: Date.now() - startTime, cached: false, freshnessSeconds: 0 },
      }
    }
  }

  async getInjuries(): Promise<AdapterResult<never[]>> {
    // Polymarket doesn't provide injury data
    return { data: [], error: null, metadata: { provider: PROVIDER, latencyMs: 0, cached: false, freshnessSeconds: 0 } }
  }

  async getStats(): Promise<AdapterResult<never[]>> {
    return { data: [], error: null, metadata: { provider: PROVIDER, latencyMs: 0, cached: false, freshnessSeconds: 0 } }
  }
}

export const createPolymarketAdapter = (circuitBreaker: NbaCircuitBreaker.Instance) =>
  new PolymarketAdapter(circuitBreaker)

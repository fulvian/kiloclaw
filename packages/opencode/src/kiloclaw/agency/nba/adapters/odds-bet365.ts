// Odds-API.io (Bet365) Adapter
// Bet365-dedicated odds provider
// Docs: https://docs.odds-api.io/

import type { Odds } from "../schema"
import { OddsSchema, FreshnessStateSchema } from "../schema"
import { NbaCircuitBreaker, assessFreshness } from "../resilience"
import { KeyManager } from "../../key-pool"
import { Log } from "@/util/log"
import type { OddsAdapter, AdapterResult, AdapterError } from "./base"

const BASE_URL = "https://api.odds-api.io/v4"
const PROVIDER = "odds_bet365"
const SPORT_KEY = "basketball_nba"

interface OddsApiResponse {
  id: string
  sport_key: string
  commence_time: string
  home_team: string
  away_team: string
  bookmakers: Bookmaker[]
}

interface Bookmaker {
  key: string
  title: string
  last_update: string
  markets: Market[]
}

interface Market {
  key: string
  outcomes: Outcome[]
}

interface Outcome {
  name: string
  price: number
  point?: number
}

export class OddsBet365Adapter implements OddsAdapter {
  readonly provider = PROVIDER
  readonly config: {
    provider: string
    baseUrl: string
    timeoutMs: number
    retryAttempts: number
    circuitBreaker: NbaCircuitBreaker.Instance
  }
  private log = Log.create({ service: `nba.adapter.${PROVIDER}` })
  private keyManager = KeyManager.getInstance()
  private pool = this.keyManager.getPool("ODDS_BET365")
  private remainingQuota = 0
  private usedQuota = 0

  constructor(
    private circuitBreaker: NbaCircuitBreaker.Instance,
    private timeoutMs = 15000,
    private retryAttempts = 3,
  ) {
    this.config = {
      provider: PROVIDER,
      baseUrl: BASE_URL,
      timeoutMs,
      retryAttempts,
      circuitBreaker,
    }
  }

  private async fetch<T>(endpoint: string): Promise<T> {
    const startTime = Date.now()
    const keyState = this.pool.getKey()

    if (!keyState) {
      throw { category: "auth_error" as const, message: "No API key available", retryable: false }
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const url = endpoint.includes("?") ? `${endpoint}&` : `${endpoint}?`
      const fullUrl = `${url}apiKey=${keyState.key}`

      const response = await fetch(fullUrl, {
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      })

      clearTimeout(timeout)

      const remaining = response.headers.get("x-requests-remaining")
      const used = response.headers.get("x-requests-used")
      if (remaining) this.remainingQuota = parseInt(remaining, 10)
      if (used) this.usedQuota = parseInt(used, 10)

      if (response.status === 401 || response.status === 403) {
        this.pool.markError(keyState.key, `Auth error: ${response.status}`)
        throw {
          category: "auth_error" as const,
          message: "Unauthorized",
          retryable: false,
          statusCode: response.status,
        }
      }

      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After")
        this.pool.markRateLimited(keyState.key, retryAfter ? parseInt(retryAfter) : undefined)
        throw { category: "rate_limited" as const, message: "Rate limited", retryable: true, statusCode: 429 }
      }

      if (!response.ok) {
        throw {
          category: "transient_error" as const,
          message: `HTTP ${response.status}`,
          retryable: true,
          statusCode: response.status,
        }
      }

      this.pool.markSuccess(keyState.key)
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

  getRemainingQuota(): number {
    return this.remainingQuota
  }

  getUsedQuota(): number {
    return this.usedQuota
  }

  async ping(): Promise<boolean> {
    try {
      await this.fetch<unknown[]>(`${BASE_URL}/sports?all=true`)
      return true
    } catch {
      return false
    }
  }

  async getGames(): Promise<AdapterResult<never[]>> {
    return { data: [], error: null, metadata: { provider: PROVIDER, latencyMs: 0, cached: false, freshnessSeconds: 0 } }
  }

  async getOdds(options?: {
    gameIds?: string[]
    markets?: string[]
    regions?: string[]
  }): Promise<AdapterResult<Odds[]>> {
    const startTime = Date.now()

    if (!this.config.circuitBreaker.allow(PROVIDER)) {
      return {
        data: null,
        error: { category: "transient_error", message: "Circuit breaker open", retryable: false },
        metadata: { provider: PROVIDER, latencyMs: Date.now() - startTime, cached: false, freshnessSeconds: 0 },
      }
    }

    try {
      const params = new URLSearchParams()
      params.set("sport", SPORT_KEY)

      const markets = options?.markets || ["h2h", "spreads", "totals"]
      params.set("markets", markets.join(","))

      // Use provided regions or default to Bet365-friendly regions
      const regions = options?.regions?.length ? options.regions : ["uk", "us", "au"]
      params.set("regions", regions.join(","))

      params.set("oddsFormat", "decimal")

      if (options?.gameIds?.length) {
        // NOTE: BallDontLie game IDs (numeric) do NOT work with Bet365 event IDs (hashed).
        // Only pass if they look like Bet365 event IDs (not pure numeric).
        const isBdlId = (id: string) => /^\d+$/.test(id)
        const oddsApiIds = options.gameIds.filter((id) => !isBdlId(id))
        if (oddsApiIds.length > 0) {
          params.set("eventIds", oddsApiIds.join(","))
        }
      }

      const response = await this.fetch<OddsApiResponse[]>(`${BASE_URL}/sports/${SPORT_KEY}/odds?${params}`)
      const now = Date.now()
      const odds: Odds[] = []

      for (const event of response) {
        // Filter only Bet365 bookmaker
        const bet365Bookmaker = event.bookmakers.find((b) => b.key === "bet365" || b.key === "bet365uk")

        if (!bet365Bookmaker) continue

        for (const market of bet365Bookmaker.markets) {
          const outcomes = market.outcomes.map((o) => ({
            name: o.name,
            price: o.price,
            point: o.point,
          }))

          const prices = outcomes.map((o) => o.price)
          const overround = prices.reduce((sum, p) => sum + 1 / p, 0)
          const fairProbabilities = prices.map((p) => 1 / p / overround)
          const vigPercent = (overround - 1) * 100

          const lastUpdate = new Date(bet365Bookmaker.last_update).getTime()
          const freshnessSeconds = Math.max(0, Math.floor((now - lastUpdate) / 1000))
          const freshness = assessFreshness("odds_bet365", freshnessSeconds)

          odds.push(
            OddsSchema.parse({
              odds_id: `${event.id}-bet365-${market.key}`,
              game_id: event.id,
              source: "odds_bet365",
              market: this.mapMarket(market.key),
              bookmaker_or_exchange: bet365Bookmaker.title,
              outcomes: outcomes.map((o) => o.name),
              implied_probabilities_raw: prices.map((p) => 1 / p),
              implied_probabilities_fair: fairProbabilities,
              vig_percent: vigPercent,
              freshness_seconds: freshnessSeconds,
              freshness_state: freshness.state,
              collected_at_utc: new Date().toISOString(),
            }),
          )
        }
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
    return { data: [], error: null, metadata: { provider: PROVIDER, latencyMs: 0, cached: false, freshnessSeconds: 0 } }
  }

  async getStats(): Promise<AdapterResult<never[]>> {
    return { data: [], error: null, metadata: { provider: PROVIDER, latencyMs: 0, cached: false, freshnessSeconds: 0 } }
  }

  private mapMarket(key: string): Odds["market"] {
    switch (key) {
      case "h2h":
        return "h2h"
      case "spreads":
        return "spreads"
      case "totals":
        return "totals"
      default:
        return "h2h"
    }
  }
}

export const createOddsBet365Adapter = (circuitBreaker: NbaCircuitBreaker.Instance) =>
  new OddsBet365Adapter(circuitBreaker)

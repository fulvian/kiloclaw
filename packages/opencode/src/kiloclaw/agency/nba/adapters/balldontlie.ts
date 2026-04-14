// BallDontLie NBA API Adapter
// Comprehensive adapter for games, players, stats, injuries, and odds
// Docs: https://docs.balldontlie.io/

import type { Game, Odds, Injury } from "../schema"
import { GameSchema, OddsSchema, InjurySchema, SourceSchema, OddsSourceSchema, FreshnessStateSchema } from "../schema"
import { NbaCircuitBreaker, assessFreshness } from "../resilience"
import { KeyManager } from "../../key-pool"
import { Log } from "@/util/log"
import type { NbaAdapter, AdapterResult, AdapterError, FetchOptions, PaginatedResult } from "./base"

const BASE_URL = "https://api.balldontlie.io/v1"
const PROVIDER = "balldontlie"

export interface BallDontLieConfig {
  timeoutMs?: number
  retryAttempts?: number
  circuitBreaker?: NbaCircuitBreaker.Instance
}

interface BdlTeam {
  id: number
  conference: string
  division: string
  city: string
  name: string
  full_name: string
  abbreviation: string
}

interface BdlPlayer {
  id: number
  first_name: string
  last_name: string
  position: string
  height: string
  weight: string
  jersey_number: string
  college: string
  country: string
  draft_year: number
  draft_round: number
  draft_number: number
  team: BdlTeam
}

interface BdlGame {
  id: number
  date: string
  season: number
  status: string
  period: number
  time: string
  postponed: boolean
  postseason: boolean
  home_team_score: number
  visitor_team_score: number
  datetime: string
  home_q1: number | null
  home_q2: number | null
  home_q3: number | null
  home_q4: number | null
  home_ot1: number | null
  home_ot2: number | null
  home_ot3: number | null
  home_timeouts_remaining: number
  home_in_bonus: boolean
  visitor_q1: number | null
  visitor_q2: number | null
  visitor_q3: number | null
  visitor_q4: number | null
  visitor_ot1: number | null
  visitor_ot2: number | null
  visitor_ot3: number | null
  visitor_timeouts_remaining: number
  visitor_in_bonus: boolean
  home_team: BdlTeam
  visitor_team: BdlTeam
  ist_stage: string | null
}

interface BdlInjury {
  id: string
  player_id: number
  player_name: string
  team: BdlTeam
  status: string
  injury: string
  description: string
  date: string
}

interface BdlOdds {
  id: number
  game_id: number
  sportsbook: string
  market: string
  odds: {
    home: number
    away: number
  }
  updated_at: string
}

export class BallDontLieAdapter implements NbaAdapter {
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
  private pool = this.keyManager.getPool("BALLDONTLIE")

  constructor(
    private circuitBreaker: NbaCircuitBreaker.Instance,
    private timeoutMs = 10000,
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

  private async fetch<T>(endpoint: string, options?: FetchOptions): Promise<T> {
    const startTime = Date.now()
    const keyState = this.pool.getKey()

    if (!keyState) {
      throw { category: "auth_error" as const, message: "No API key available", retryable: false }
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        headers: {
          Authorization: keyState.key,
          ...options?.headers,
        },
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (response.status === 401) {
        this.pool.markError(keyState.key, "Unauthorized - check API key and tier")
        throw { category: "auth_error" as const, message: "Unauthorized", retryable: false, statusCode: 401 }
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

  async ping(): Promise<boolean> {
    try {
      await this.fetch<{ data: BdlTeam[] }>("/teams?per_page=1")
      return true
    } catch {
      return false
    }
  }

  async getGames(options?: { dates?: string[]; teamIds?: string[] }): Promise<AdapterResult<Game[]>> {
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
      params.set("per_page", "100")

      if (options?.dates?.length) {
        options.dates.forEach((d) => params.append("dates[]", d))
      }
      if (options?.teamIds?.length) {
        options.teamIds.forEach((id) => params.append("team_ids[]", id))
      }

      const response = await this.fetch<PaginatedResult<BdlGame>>(`/games?${params}`)
      const now = Date.now()

      const games: Game[] = response.data.map((g) => {
        const collectedAt = new Date().toISOString()
        const gameDate = new Date(g.datetime).getTime()
        const freshnessSeconds = Math.max(0, Math.floor((now - gameDate) / 1000))
        const freshness = assessFreshness("balldontlie_games", freshnessSeconds)

        return GameSchema.parse({
          game_id: String(g.id),
          source: "balldontlie",
          start_time_utc: g.datetime,
          status: this.mapGameStatus(g.status, g.postponed),
          home_team: { id: String(g.home_team.id), name: g.home_team.full_name },
          away_team: { id: String(g.visitor_team.id), name: g.visitor_team.full_name },
          score:
            g.home_team_score && g.visitor_team_score
              ? { home: g.home_team_score, away: g.visitor_team_score }
              : undefined,
          freshness_seconds: freshnessSeconds,
          freshness_state: freshness.state,
          collected_at_utc: collectedAt,
        })
      })

      this.config.circuitBreaker.recordSuccess(PROVIDER)

      return {
        data: games,
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

  async getInjuries(_options?: { teamIds?: string[] }): Promise<AdapterResult<Injury[]>> {
    const startTime = Date.now()

    if (!this.config.circuitBreaker.allow(PROVIDER)) {
      return {
        data: null,
        error: { category: "transient_error", message: "Circuit breaker open", retryable: false },
        metadata: { provider: PROVIDER, latencyMs: Date.now() - startTime, cached: false, freshnessSeconds: 0 },
      }
    }

    try {
      const response = await this.fetch<PaginatedResult<BdlInjury>>("/injuries")
      const now = Date.now()

      const injuries: Injury[] = response.data.map((inj) => {
        const collectedAt = new Date().toISOString()
        const injuryDate = new Date(inj.date).getTime()
        const freshnessSeconds = Math.max(0, Math.floor((now - injuryDate) / 1000))
        const freshness = assessFreshness("balldontlie_injuries", freshnessSeconds)

        return InjurySchema.parse({
          injury_id: inj.id,
          player_id: String(inj.player_id),
          player_name: inj.player_name,
          team_id: String(inj.team.id),
          team_name: inj.team.full_name,
          status: this.mapInjuryStatus(inj.status),
          injury: inj.injury,
          description: inj.description,
          date: inj.date,
          source: "balldontlie",
          freshness_seconds: freshnessSeconds,
          freshness_state: freshness.state,
          collected_at_utc: collectedAt,
        })
      })

      this.config.circuitBreaker.recordSuccess(PROVIDER)

      return {
        data: injuries,
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

  async getOdds(_options?: {
    gameIds?: string[]
    markets?: string[]
    bookmakers?: string[]
  }): Promise<AdapterResult<Odds[]>> {
    // BallDontLie odds require GOAT tier
    // For MVP, odds are primarily sourced from The Odds API / ParlayAPI
    // This is a fallback/validation source
    const startTime = Date.now()
    return {
      data: [],
      error: null,
      metadata: {
        provider: PROVIDER,
        latencyMs: Date.now() - startTime,
        cached: false,
        freshnessSeconds: 0,
      },
    }
  }

  private mapGameStatus(status: string, postponed: boolean): Game["status"] {
    if (postponed) return "postponed"
    if (status === "Final") return "final"
    if (status.includes("Qtr") || status.includes("Half")) return "live"
    return "scheduled"
  }

  private mapInjuryStatus(status: string): Injury["status"] {
    const s = status.toLowerCase()
    if (s.includes("out")) return "out"
    if (s.includes("questionable")) return "questionable"
    if (s.includes("doubtful")) return "doubtful"
    if (s.includes("probable")) return "probable"
    return "game_time_decision"
  }
}

export const createBallDontLieAdapter = (circuitBreaker: NbaCircuitBreaker.Instance) =>
  new BallDontLieAdapter(circuitBreaker)

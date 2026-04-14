// NBA Adapter Base Types
// Common interfaces for all NBA data adapters

import type { Game, Odds, Injury } from "../schema"
import { NbaCircuitBreaker } from "../resilience"

export interface AdapterConfig {
  provider: string
  baseUrl: string
  timeoutMs: number
  retryAttempts: number
  circuitBreaker: NbaCircuitBreaker.Instance
}

export interface AdapterResult<T> {
  data: T | null
  error: AdapterError | null
  metadata: {
    provider: string
    latencyMs: number
    cached: boolean
    freshnessSeconds: number
  }
}

export interface AdapterError {
  category: "auth_error" | "rate_limited" | "transient_error" | "fatal_error"
  message: string
  retryable: boolean
  statusCode?: number
}

export interface FetchOptions {
  signal?: AbortSignal
  headers?: Record<string, string>
}

export interface PaginatedResult<T> {
  data: T[]
  meta: {
    next_cursor: string | null
    per_page: number
  }
}

// Base adapter interface
export interface NbaAdapter {
  readonly provider: string
  readonly config: AdapterConfig

  // Health check
  ping(): Promise<boolean>

  // Fetch games (scoreboard)
  getGames(options?: { dates?: string[]; teamIds?: string[] }): Promise<AdapterResult<Game[]>>

  // Fetch odds
  getOdds(options?: {
    gameIds?: string[]
    markets?: string[]
    bookmakers?: string[]
    regions?: string[]
  }): Promise<AdapterResult<Odds[]>>

  // Fetch injuries
  getInjuries(options?: { teamIds?: string[] }): Promise<AdapterResult<Injury[]>>

  // Fetch stats (player stats, team stats, season averages, recent games)
  getStats(options: {
    type: "player_stats" | "player_season_averages" | "team_stats" | "recent_games"
    playerIds?: string[]
    teamIds?: string[]
    season?: number
    startDate?: string
    endDate?: string
    lastNGages?: number
    postseason?: boolean
  }): Promise<AdapterResult<Record<string, unknown>[]>>
}

// Odds adapter specific interface
export interface OddsAdapter extends NbaAdapter {
  // Quota tracking
  getRemainingQuota(): number
  getUsedQuota(): number
}

// Provider priority for fallback chain
export const ADAPTER_PRIORITY = {
  // Games/Scores
  games: ["balldontlie", "espn", "nba_api"] as const,
  // Odds
  odds: ["odds_bet365", "odds_api", "parlay", "balldontlie", "polymarket"] as const,
  // Injuries
  injuries: ["balldontlie", "espn"] as const,
  // Stats
  stats: ["balldontlie", "nba_api"] as const,
  // Player Props
  playerProps: ["balldontlie"] as const,
} as const

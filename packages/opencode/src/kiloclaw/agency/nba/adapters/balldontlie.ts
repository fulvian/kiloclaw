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

// BallDontLie /v1/player_injuries response format
interface BdlPlayerInjury {
  player: {
    id: number
    first_name: string
    last_name: string
    position: string
    height: string
    weight: string
    jersey_number: string
    college: string
    team_id: number
  }
  return_date: string
  description: string
  status: string
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

// BallDontLie player game stats response
interface BdlPlayerGameStat {
  id: number
  min: string
  fgm: number
  fga: number
  fg_pct: number
  fg3m: number
  fg3a: number
  fg3_pct: number
  ftm: number
  fta: number
  ft_pct: number
  oreb: number
  dreb: number
  reb: number
  ast: number
  stl: number
  blk: number
  turnover: number
  pf: number
  pts: number
  plus_minus: number
  player: {
    id: number
    first_name: string
    last_name: string
    position: string
    team_id: number
  }
  team: BdlTeam
  game: {
    id: number
    date: string
    season: number
    status: string
    home_team: BdlTeam
    visitor_team: BdlTeam
  }
}

// BallDontLie season averages response
interface BdlSeasonAverage {
  player_id: number
  season: number
  games_played: number
  min: string
  fgm: number
  fga: number
  fg_pct: number
  fg3m: number
  fg3a: number
  fg3_pct: number
  ftm: number
  fta: number
  ft_pct: number
  oreb: number
  dreb: number
  reb: number
  ast: number
  stl: number
  blk: number
  turnover: number
  pf: number
  pts: number
}

// BallDontLie team season averages response
interface BdlTeamSeasonAvg {
  team_id: number
  gp: number
  w: number
  l: number
  pts: number
  reb: number
  ast: number
  stl: number
  blk: number
  tov: number
  fg_pct: number
  fg3_pct: number
  ft_pct: number
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

  async getInjuries(options?: { teamIds?: string[] }): Promise<AdapterResult<Injury[]>> {
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

      if (options?.teamIds?.length) {
        options.teamIds.forEach((id) => params.append("team_ids[]", id))
      }

      const response = await this.fetch<PaginatedResult<BdlPlayerInjury>>(`/player_injuries?${params}`)
      const now = Date.now()

      // We need team names - fetch teams for mapping if we don't have them cached
      const teamMap = await this.getTeamMap()

      const injuries: Injury[] = response.data
        .filter((inj) => inj.player)
        .map((inj, idx) => {
          const collectedAt = new Date().toISOString()
          const freshnessSeconds = 0 // Current data is fresh by definition
          const freshness = assessFreshness("balldontlie_injuries", freshnessSeconds)
          const teamId = String(inj.player.team_id)
          const teamName = teamMap.get(inj.player.team_id) ?? `Team ${teamId}`
          const playerName = `${inj.player.first_name} ${inj.player.last_name}`
          const injuryId = `bdl-${inj.player.id}-${idx}`

          return InjurySchema.parse({
            injury_id: injuryId,
            player_id: String(inj.player.id),
            player_name: playerName,
            team_id: teamId,
            team_name: teamName,
            status: this.mapInjuryStatus(inj.status),
            injury: this.extractInjuryType(inj.description),
            description: inj.description || "No details available",
            date: inj.return_date || new Date().toISOString().split("T")[0],
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

  // Cache team name mapping (id -> full_name)
  private teamMapCache: Map<number, string> | null = null

  private async getTeamMap(): Promise<Map<number, string>> {
    if (this.teamMapCache) return this.teamMapCache

    try {
      const response = await this.fetch<{ data: BdlTeam[] }>("/teams")
      this.teamMapCache = new Map(response.data.map((t) => [t.id, t.full_name]))
      return this.teamMapCache
    } catch {
      return new Map()
    }
  }

  private extractInjuryType(description: string): string {
    // Try to extract the injury type from the description
    // E.g. "Nov 16: Bufkin (shoulder) is listed as doubtful..." -> "shoulder"
    const match = description.match(/\(([^)]+)\)/)
    if (match?.[1]) return match[1]
    // Fallback: use first few words
    const parts = description.split(" ")
    if (parts.length > 2) return parts.slice(0, 3).join(" ")
    return description.slice(0, 50) || "Unspecified"
  }

  async getOdds(_options?: {
    gameIds?: string[]
    markets?: string[]
    bookmakers?: string[]
    regions?: string[]
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

  // Stats support - player stats, season averages, team stats, recent games
  async getStats(options: {
    type: "player_stats" | "player_season_averages" | "team_stats" | "recent_games"
    playerIds?: string[]
    teamIds?: string[]
    season?: number
    startDate?: string
    endDate?: string
    lastNGames?: number
    postseason?: boolean
  }): Promise<AdapterResult<Record<string, unknown>[]>> {
    const startTime = Date.now()

    if (!this.config.circuitBreaker.allow(PROVIDER)) {
      return {
        data: null,
        error: { category: "transient_error", message: "Circuit breaker open", retryable: false },
        metadata: { provider: PROVIDER, latencyMs: Date.now() - startTime, cached: false, freshnessSeconds: 0 },
      }
    }

    try {
      const currentSeason = options.season ?? this.getCurrentSeason()

      switch (options.type) {
        case "player_stats":
          return await this.getPlayerStats(options, currentSeason)
        case "player_season_averages":
          return await this.getPlayerSeasonAverages(options, currentSeason)
        case "team_stats":
          return await this.getTeamStats(options, currentSeason)
        case "recent_games":
          return await this.getRecentGames(options)
        default:
          return {
            data: [],
            error: null,
            metadata: { provider: PROVIDER, latencyMs: Date.now() - startTime, cached: false, freshnessSeconds: 0 },
          }
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

  private getCurrentSeason(): number {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    // NBA season: Oct-Jun. If before October, we're in the previous season's playoffs
    return month >= 10 ? year : year - 1
  }

  private async getPlayerStats(
    options: { playerIds?: string[]; startDate?: string; endDate?: string; postseason?: boolean },
    season: number,
  ): Promise<AdapterResult<Record<string, unknown>[]>> {
    const params = new URLSearchParams()
    params.set("per_page", "100")
    params.append("seasons[]", String(season))

    if (options.playerIds?.length) {
      options.playerIds.forEach((id) => params.append("player_ids[]", id))
    }
    if (options.startDate) params.set("start_date", options.startDate)
    if (options.endDate) params.set("end_date", options.endDate)
    if (options.postseason !== undefined) params.set("postseason", String(options.postseason))

    const response = await this.fetch<PaginatedResult<BdlPlayerGameStat>>(`/stats?${params}`)
    const teamMap = await this.getTeamMap()

    const stats = response.data.map((s) => ({
      player_name: `${s.player.first_name} ${s.player.last_name}`,
      player_id: s.player.id,
      team_name: teamMap.get(s.player.team_id) ?? `Team ${s.player.team_id}`,
      team_id: s.player.team_id,
      game_id: s.game.id,
      date: s.game.date,
      min: s.min,
      pts: s.pts,
      ast: s.ast,
      reb: s.reb,
      stl: s.stl,
      blk: s.blk,
      tov: s.turnover,
      pf: s.pf,
      fgm: s.fgm,
      fga: s.fga,
      fg_pct: s.fg_pct,
      fg3m: s.fg3m,
      fg3a: s.fg3a,
      fg3_pct: s.fg3_pct,
      ftm: s.ftm,
      fta: s.fta,
      ft_pct: s.ft_pct,
      oreb: s.oreb,
      dreb: s.dreb,
      plus_minus: s.plus_minus,
    }))

    this.config.circuitBreaker.recordSuccess(PROVIDER)

    return {
      data: stats as Record<string, unknown>[],
      error: null,
      metadata: { provider: PROVIDER, latencyMs: 0, cached: false, freshnessSeconds: 0 },
    }
  }

  private async getPlayerSeasonAverages(
    options: { playerIds?: string[] },
    season: number,
  ): Promise<AdapterResult<Record<string, unknown>[]>> {
    if (!options.playerIds?.length) {
      return {
        data: [],
        error: { category: "fatal_error", message: "playerIds required for season averages", retryable: false },
        metadata: { provider: PROVIDER, latencyMs: 0, cached: false, freshnessSeconds: 0 },
      }
    }

    const params = new URLSearchParams()
    params.set("season", String(season))
    options.playerIds.forEach((id) => params.append("player_ids[]", id))

    const response = await this.fetch<{ data: BdlSeasonAverage[] }>(`/season_averages?${params}`)

    const stats = response.data.map((s) => ({
      player_id: s.player_id,
      season: s.season,
      games_played: s.games_played,
      min: s.min,
      pts: s.pts,
      ast: s.ast,
      reb: s.reb,
      stl: s.stl,
      blk: s.blk,
      tov: s.turnover,
      fgm: s.fgm,
      fga: s.fga,
      fg_pct: s.fg_pct,
      fg3m: s.fg3m,
      fg3a: s.fg3a,
      fg3_pct: s.fg3_pct,
      ftm: s.ftm,
      fta: s.fta,
      ft_pct: s.ft_pct,
      oreb: s.oreb,
      dreb: s.dreb,
    }))

    this.config.circuitBreaker.recordSuccess(PROVIDER)

    return {
      data: stats as Record<string, unknown>[],
      error: null,
      metadata: { provider: PROVIDER, latencyMs: 0, cached: false, freshnessSeconds: 0 },
    }
  }

  private async getTeamStats(
    options: { teamIds?: string[] },
    season: number,
  ): Promise<AdapterResult<Record<string, unknown>[]>> {
    const params = new URLSearchParams()
    params.set("season", String(season))
    params.set("season_type", "regular")
    params.set("type", "base")

    if (options.teamIds?.length) {
      options.teamIds.forEach((id) => params.append("team_ids[]", id))
    }

    const response = await this.fetch<PaginatedResult<BdlTeamSeasonAvg>>(
      `/nba/v1/team_season_averages/general?${params}`,
    )
    const teamMap = await this.getTeamMap()

    const stats = response.data.map((s) => ({
      ...s,
      team_name: teamMap.get(s.team_id) ?? `Team ${s.team_id}`,
    }))

    this.config.circuitBreaker.recordSuccess(PROVIDER)

    return {
      data: stats as Record<string, unknown>[],
      error: null,
      metadata: { provider: PROVIDER, latencyMs: 0, cached: false, freshnessSeconds: 0 },
    }
  }

  private async getRecentGames(options: {
    teamIds?: string[]
    lastNGames?: number
  }): Promise<AdapterResult<Record<string, unknown>[]>> {
    const teamIds = options.teamIds
    if (!teamIds?.length) {
      return {
        data: [],
        error: { category: "fatal_error", message: "teamIds required for recent_games", retryable: false },
        metadata: { provider: PROVIDER, latencyMs: 0, cached: false, freshnessSeconds: 0 },
      }
    }

    const limit = Math.min(options.lastNGames ?? 5, 20)
    const results: Record<string, unknown>[] = []

    for (const teamId of teamIds) {
      const params = new URLSearchParams()
      params.set("per_page", String(limit))
      params.append("team_ids[]", teamId)
      params.set("end_date", new Date().toISOString().split("T")[0])

      const response = await this.fetch<PaginatedResult<BdlGame>>(`/games?${params}`)

      // Take the last N games (most recent)
      const recentGames = response.data.slice(-limit).reverse()

      const teamMap = await this.getTeamMap()

      for (const g of recentGames) {
        results.push({
          game_id: g.id,
          date: g.date,
          status: g.status,
          home_team_id: g.home_team.id,
          home_team_name: g.home_team.full_name,
          away_team_id: g.visitor_team.id,
          away_team_name: g.visitor_team.full_name,
          home_team_score: g.home_team_score,
          away_team_score: g.visitor_team_score,
        })
      }
    }

    this.config.circuitBreaker.recordSuccess(PROVIDER)

    return {
      data: results,
      error: null,
      metadata: { provider: PROVIDER, latencyMs: 0, cached: false, freshnessSeconds: 0 },
    }
  }
}

export const createBallDontLieAdapter = (circuitBreaker: NbaCircuitBreaker.Instance) =>
  new BallDontLieAdapter(circuitBreaker)

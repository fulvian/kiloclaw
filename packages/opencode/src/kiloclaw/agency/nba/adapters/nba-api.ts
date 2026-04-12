// NBA.com Official API Adapter (via nba_api Python package wrapper)
// Advanced stats, play-by-play, official NBA data
// Note: This is a REST wrapper around the unofficial NBA.com API
// The actual nba_api is a Python package - this provides HTTP access pattern
// Docs: https://github.com/swar/nba_api/

import type { Game } from "../schema"
import { GameSchema, FreshnessStateSchema } from "../schema"
import { NbaCircuitBreaker, assessFreshness } from "../resilience"
import { Log } from "@/util/log"
import type { NbaAdapter, AdapterResult, AdapterError } from "./base"

const PROVIDER = "nba_api"

// Note: nba_api is a Python package, not a REST API
// This adapter provides the interface pattern for when we wrap the Python calls
// For now, we document the endpoints that would be called

export interface NbaApiConfig {
  // nba_api requires proxy configuration for production use
  proxyUrl?: string
  timeoutMs?: number
}

export class NbaApiAdapter implements NbaAdapter {
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
    private timeoutMs = 30000, // nba_api calls can be slower
    private retryAttempts = 2,
  ) {
    this.config = {
      provider: PROVIDER,
      baseUrl: "https://nba-api.com", // Placeholder - actual calls go through Python
      timeoutMs,
      retryAttempts,
      circuitBreaker,
    }
  }

  async ping(): Promise<boolean> {
    // nba_api ping would require Python execution
    // For now, return true if circuit breaker allows
    return this.config.circuitBreaker.allow(PROVIDER)
  }

  async getGames(): Promise<AdapterResult<Game[]>> {
    // nba_api.live.nba.endpoints.scoreboard.ScoreBoard()
    // Returns today's games with real-time updates
    // Example: scoreboard = ScoreBoard()
    // game_data = scoreboard.get_dict()
    const startTime = Date.now()

    if (!this.config.circuitBreaker.allow(PROVIDER)) {
      return {
        data: null,
        error: { category: "transient_error", message: "Circuit breaker open", retryable: false },
        metadata: { provider: PROVIDER, latencyMs: Date.now() - startTime, cached: false, freshnessSeconds: 0 },
      }
    }

    // TODO: Implement Python nba_api call via subprocess or embedded interpreter
    // For now, return empty with documentation
    this.config.circuitBreaker.recordSuccess(PROVIDER)

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

  async getOdds(): Promise<AdapterResult<never[]>> {
    // nba_api doesn't provide betting odds
    return { data: [], error: null, metadata: { provider: PROVIDER, latencyMs: 0, cached: false, freshnessSeconds: 0 } }
  }

  async getInjuries(): Promise<AdapterResult<never[]>> {
    // nba_api doesn't have a dedicated injury endpoint
    // Use BallDontLie or ESPN instead
    return { data: [], error: null, metadata: { provider: PROVIDER, latencyMs: 0, cached: false, freshnessSeconds: 0 } }
  }

  // Advanced stats endpoints that nba_api provides:
  // - stats.endpoints.playercareerstats.PlayerCareerStats
  // - stats.endpoints.playergamelog.PlayerGameLog
  // - stats.endpoints.teamgamelog.TeamGameLog
  // - stats.endpoints.shotchartdetail.ShotChartDetail
  // - stats.endpoints.leaguedashplayerstats.LeagueDashPlayerStats
  // - stats.endpoints.leaguedashteamstats.LeagueDashTeamStats
  // - stats.endpoints.playertrackingstats.PlayerTrackingStats
  // - stats.endpoints.boxscoreadvancedv2.BoxScoreAdvancedV2
  // - stats.endpoints.boxscorescoringv2.BoxScoreScoringV2
  // - stats.endpoints.boxscoreusagev2.BoxScoreUsageV2
  // - stats.endpoints.boxscorefourfactorsv2.BoxScoreFourFactorsV2
  // - stats.endpoints.boxscoremiscv2.BoxScoreMiscV2
  // - stats.endpoints.boxscorepaceadvv2.BoxScorePaceAdvV2
}

/**
 * NBA API Advanced Stats Categories
 *
 * General:
 * - General: base, advanced, usage, scoring, defense, misc
 * - Clutch: base, advanced, misc, scoring, usage
 *
 * Shooting:
 * - Defense: 2_pointers, 3_pointers, greater_than_15ft, less_than_10ft, less_than_6ft, overall
 * - Shot Dashboard: overall, pullups, catch_and_shoot, less_than_10_ft
 *
 * Playtypes:
 * - cut, handoff, isolation, offrebound, offscreen, postup, prballhandler, prrollman, spotup, transition, misc
 *
 * Tracking:
 * - PaintTouch, ElbowTouch, PostTouch, Passing, Drives, Rebounding, CatchShoot, PullUpShot, Possessions, SpeedDistance, Defense, Efficiency
 *
 * Hustle:
 * - (no type required) - Contains screen assists, deflections, loose ball recoveries, charges drawn, contests
 */

// Implementation note:
// To use nba_api effectively, we would spawn a Python process:
// bun run python nba_api_wrapper.py --endpoint stats --method LeagueDashPlayerStats --params '{"season": "2024-25", "season_type": "Regular Season"}'

export const createNbaApiAdapter = (circuitBreaker: NbaCircuitBreaker.Instance) => new NbaApiAdapter(circuitBreaker)

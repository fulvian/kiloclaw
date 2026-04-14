// NBA Data Orchestrator
// Wires together adapters with fallback chains, freshness tracking, and confidence scoring

import type { Game, Odds, Injury } from "./schema"
import { StaleRecommendationInputSchema } from "./schema"
import { NbaCircuitBreaker } from "./resilience"
import type { NbaAdapter, AdapterResult } from "./adapters"
import {
  ADAPTER_PRIORITY,
  createBallDontLieAdapter,
  createOddsApiAdapter,
  createOddsBet365Adapter,
  createParlayApiAdapter,
  createEspnAdapter,
  createNbaApiAdapter,
  createPolymarketAdapter,
} from "./adapters"
import z from "zod"

export interface OrchestratorConfig {
  circuitBreaker: NbaCircuitBreaker.Instance
  // Confidence weights by provider (higher = more trusted)
  providerWeights?: Record<string, number>
  // Injury freshness penalty (0-1, lower = more penalty for stale injuries)
  injuryFreshnessThreshold?: number
}

const DEFAULT_PROVIDER_WEIGHTS: Record<string, number> = {
  balldontlie: 0.9,
  odds_bet365: 0.85,
  odds_api: 0.8,
  parlay: 0.75,
  espn: 0.7,
  nba_api: 0.65,
  polymarket: 0.5,
}

export interface OrchestratorResult<T> {
  data: T[]
  provider: string
  combinedFreshnessSeconds: number
  staleCount: number
  errorCount: number
}

const INITIAL_FRESHNESS_PENALTY = 0.3

export namespace NbaOrchestrator {
  // Cached adapter instances
  let adapters: Map<string, NbaAdapter> | null = null
  let config: OrchestratorConfig | null = null

  function getAdapters(cb: NbaCircuitBreaker.Instance): Map<string, NbaAdapter> {
    if (adapters) return adapters

    adapters = new Map<string, NbaAdapter>([
      ["balldontlie", createBallDontLieAdapter(cb)],
      ["odds_api", createOddsApiAdapter(cb)],
      ["odds_bet365", createOddsBet365Adapter(cb)],
      ["parlay", createParlayApiAdapter(cb)],
      ["espn", createEspnAdapter(cb)],
      ["nba_api", createNbaApiAdapter(cb)],
      ["polymarket", createPolymarketAdapter(cb)],
    ])

    return adapters
  }

  export function initialize(cfg: OrchestratorConfig) {
    config = cfg
    adapters = null // Reset adapters with new config
  }

  export function reset() {
    adapters = null
    config = null
  }

  // Compute confidence based on freshness
  function computeConfidence(
    provider: string,
    freshnessSeconds: number,
    maxAgeSeconds: number,
    weights = DEFAULT_PROVIDER_WEIGHTS,
  ): number {
    const baseWeight = weights[provider] ?? 0.5
    const freshnessRatio = Math.max(0, 1 - freshnessSeconds / maxAgeSeconds)
    return baseWeight * freshnessRatio
  }

  // Fetch games with fallback chain
  export async function getGames(options?: {
    dates?: string[]
    teamIds?: string[]
  }): Promise<OrchestratorResult<Game>> {
    const cb =
      config?.circuitBreaker ??
      NbaCircuitBreaker.create({
        failureThreshold: 5,
        halfOpenAfterMs: 30000,
        successThreshold: 2,
      })

    const adps = getAdapters(cb)
    const providers = [...ADAPTER_PRIORITY.games] as string[]
    const results: Game[] = []
    let bestProvider = providers[0] ?? "balldontlie"
    let minFreshness = Infinity
    let staleCount = 0
    let errorCount = 0

    for (const provider of providers) {
      const adapter = adps.get(provider)
      if (!adapter) continue

      try {
        const result = await adapter.getGames(options)

        if (result.data && result.data.length > 0) {
          for (const game of result.data) {
            const freshness = game.freshness_seconds ?? 0
            if (freshness < minFreshness) {
              minFreshness = freshness
              bestProvider = provider
            }
            if (game.freshness_state === "stale") staleCount++
            results.push(game)
          }
        }

        if (result.error) errorCount++
      } catch {
        errorCount++
      }
    }

    return {
      data: results,
      provider: bestProvider,
      combinedFreshnessSeconds: minFreshness === Infinity ? 0 : minFreshness,
      staleCount,
      errorCount,
    }
  }

  // Fetch odds with fallback chain - tries primary odds sources first
  export async function getOdds(options?: {
    gameIds?: string[]
    markets?: string[]
    bookmakers?: string[]
    regions?: string[]
  }): Promise<OrchestratorResult<Odds>> {
    const cb =
      config?.circuitBreaker ??
      NbaCircuitBreaker.create({
        failureThreshold: 5,
        halfOpenAfterMs: 30000,
        successThreshold: 2,
      })

    const adps = getAdapters(cb)
    const providers = [...ADAPTER_PRIORITY.odds] as string[]
    const oddsMap = new Map<string, Odds>() // Deduplicate by odds_id
    let bestProvider = providers[0] ?? "odds_bet365"
    let minFreshness = Infinity
    let staleCount = 0
    let errorCount = 0

    for (const provider of providers) {
      const adapter = adps.get(provider)
      if (!adapter) continue

      try {
        const result = await adapter.getOdds(options)

        if (result.data && result.data.length > 0) {
          // For odds, we prefer the most recent (lowest freshnessSeconds)
          for (const odds of result.data) {
            const existing = oddsMap.get(odds.odds_id)
            if (!existing || (odds.freshness_seconds ?? Infinity) < (existing.freshness_seconds ?? Infinity)) {
              oddsMap.set(odds.odds_id, odds)
              if ((odds.freshness_seconds ?? 0) < minFreshness) {
                minFreshness = odds.freshness_seconds ?? 0
                bestProvider = provider
              }
            }
            if (odds.freshness_state === "stale") staleCount++
          }
        }

        if (result.error) errorCount++
      } catch {
        errorCount++
      }
    }

    return {
      data: Array.from(oddsMap.values()),
      provider: bestProvider,
      combinedFreshnessSeconds: minFreshness === Infinity ? 0 : minFreshness,
      staleCount,
      errorCount,
    }
  }

  // Fetch injuries with fallback chain - CRITICAL for betting analysis
  // Primary: BallDontLie (has dedicated injuries endpoint)
  // Fallback: ESPN (per-team injuries)
  export async function getInjuries(options?: { teamIds?: string[] }): Promise<OrchestratorResult<Injury>> {
    const cb =
      config?.circuitBreaker ??
      NbaCircuitBreaker.create({
        failureThreshold: 3, // Lower threshold for injuries (critical)
        halfOpenAfterMs: 60000, // Longer recovery for injuries
        successThreshold: 2,
      })

    const adps = getAdapters(cb)
    const providers = [...ADAPTER_PRIORITY.injuries] as string[]
    const injuriesMap = new Map<string, Injury>() // Deduplicate by injury_id
    let bestProvider = providers[0] ?? "balldontlie"
    let minFreshness = Infinity
    let staleCount = 0
    let errorCount = 0

    // Freshness thresholds (in seconds)
    const freshnessThresholds: Record<string, number> = {
      balldontlie: 3600, // 1 hour
      espn: 3600, // 1 hour
    }

    for (const provider of providers) {
      const adapter = adps.get(provider)
      if (!adapter) continue

      try {
        const result = await adapter.getInjuries(options)

        if (result.data && result.data.length > 0) {
          for (const injury of result.data) {
            const existing = injuriesMap.get(injury.injury_id)
            // Prefer more recent injury report
            if (!existing || (injury.freshness_seconds ?? Infinity) < (existing.freshness_seconds ?? Infinity)) {
              injuriesMap.set(injury.injury_id, injury)
              if ((injury.freshness_seconds ?? 0) < minFreshness) {
                minFreshness = injury.freshness_seconds ?? 0
                bestProvider = provider
              }
            }
            if (injury.freshness_state === "stale") staleCount++
          }
        }

        if (result.error) errorCount++
      } catch {
        errorCount++
      }
    }

    return {
      data: Array.from(injuriesMap.values()),
      provider: bestProvider,
      combinedFreshnessSeconds: minFreshness === Infinity ? 0 : minFreshness,
      staleCount,
      errorCount,
    }
  }

  // Compute injury confidence penalty based on freshness
  // Critical for betting - stale injuries should reduce confidence significantly
  export function computeInjuryConfidencePenalty(injuries: Injury[] | undefined, maxAgeSeconds = 3600): number {
    if (!injuries || injuries.length === 0) return 0

    let totalPenalty = 0

    for (const injury of injuries) {
      const ageSeconds = injury.freshness_seconds ?? 0
      if (ageSeconds > maxAgeSeconds) {
        // Severe penalty for stale injury data
        totalPenalty += INITIAL_FRESHNESS_PENALTY
      } else {
        // Gradual penalty as injury data ages
        const ageRatio = ageSeconds / maxAgeSeconds
        totalPenalty += INITIAL_FRESHNESS_PENALTY * ageRatio
      }
    }

    // Average penalty across all injuries
    const avgPenalty = totalPenalty / injuries.length
    return Math.min(avgPenalty, 0.5) // Cap at 50% penalty
  }

  // Build freshness input for runtime decision
  export function buildStaleInput(
    oddsResult: OrchestratorResult<Odds>,
    injuriesResult: OrchestratorResult<Injury>,
  ): z.infer<typeof StaleRecommendationInputSchema> {
    return {
      odds: {
        freshness_seconds: oddsResult.combinedFreshnessSeconds,
        max_freshness_seconds: 60, // Odds should be ≤60s old
      },
      injuries: {
        freshness_seconds: injuriesResult.combinedFreshnessSeconds,
        max_freshness_seconds: 3600, // Injuries should be ≤1h old
      },
    }
  }

  // Health check all adapters
  export async function healthCheck(): Promise<Record<string, boolean>> {
    const cb =
      config?.circuitBreaker ??
      NbaCircuitBreaker.create({
        failureThreshold: 5,
        halfOpenAfterMs: 30000,
        successThreshold: 2,
      })

    const adps = getAdapters(cb)
    const results: Record<string, boolean> = {}

    for (const [name, adapter] of adps) {
      try {
        results[name] = await adapter.ping()
      } catch {
        results[name] = false
      }
    }

    return results
  }

  // Fetch stats (player stats, team stats, season averages, recent games)
  export async function getStats(options: {
    type: "player_stats" | "player_season_averages" | "team_stats" | "recent_games"
    playerIds?: string[]
    teamIds?: string[]
    season?: number
    startDate?: string
    endDate?: string
    lastNGames?: number
    postseason?: boolean
  }): Promise<OrchestratorResult<Record<string, unknown>>> {
    const cb =
      config?.circuitBreaker ??
      NbaCircuitBreaker.create({
        failureThreshold: 5,
        halfOpenAfterMs: 30000,
        successThreshold: 2,
      })

    const adps = getAdapters(cb)
    const providers = [...ADAPTER_PRIORITY.stats] as string[]
    const results: Record<string, unknown>[] = []
    let bestProvider = providers[0] ?? "balldontlie"
    let staleCount = 0
    let errorCount = 0

    for (const provider of providers) {
      const adapter = adps.get(provider)
      if (!adapter) continue

      try {
        const result = await adapter.getStats(options)

        if (result.data && result.data.length > 0) {
          for (const item of result.data) {
            results.push(item as Record<string, unknown>)
          }
          bestProvider = provider
        }

        if (result.error) errorCount++
      } catch {
        errorCount++
      }
    }

    return {
      data: results,
      provider: bestProvider,
      combinedFreshnessSeconds: 0,
      staleCount,
      errorCount,
    }
  }
}

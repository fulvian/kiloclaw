// NBA Betting Analysis Skill
// Uses NbaOrchestrator for data fetching and NbaRuntime for policy decisions

import { Log } from "@/util/log"
import { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"
import { NbaOrchestrator } from "../../agency/nba/orchestrator"
import { NbaRuntime, type NbaPolicyDecision } from "../../agency/nba/runtime"
import { type Game, type Odds, type Signal, type Recommendation, capConfidence } from "../../agency/nba/schema"
import { NbaCircuitBreaker } from "../../agency/nba/resilience"

// NBA Analysis Input
export interface NbaAnalysisInput {
  /** Game ID to analyze (optional - if not provided, analyzes all games for the day) */
  gameId?: string
  /** Specific team IDs to filter */
  teamIds?: string[]
  /** Include injury reports */
  includeInjuries?: boolean
  /** Include odds comparison */
  includeOdds?: boolean
  /** Minimum edge threshold for recommendations (0.0-0.20) */
  minEdge?: number
}

// NBA Analysis Output
export interface NbaAnalysisOutput {
  /** Games analyzed */
  games: Game[]
  /** Odds data if requested */
  odds?: Odds[]
  /** Signals generated */
  signals: Signal[]
  /** Recommendations generated */
  recommendations: Recommendation[]
  /** Policy decisions made */
  policyDecisions: NbaPolicyDecision[]
  /** Provider used for primary data */
  primaryProvider: string
  /** Analysis metadata */
  metadata: {
    analyzedAtUtc: string
    gamesCount: number
    signalsCount: number
    recommendationsCount: number
    staleBlockedSignals: number
  }
}

// Initialize circuit breaker for the skill
function getCircuitBreaker(): NbaCircuitBreaker.Instance {
  return NbaCircuitBreaker.create({
    failureThreshold: 5,
    halfOpenAfterMs: 30000,
    successThreshold: 2,
  })
}

export const NbaAnalysisSkill: Skill = {
  id: "nba-analysis" as SkillId,
  version: "1.0.0",
  name: "NBA Betting Analysis",
  inputSchema: {
    type: "object",
    properties: {
      gameId: {
        type: "string",
        description: "Specific game ID to analyze (optional - if not provided, analyzes today's games)",
      },
      teamIds: {
        type: "array",
        items: { type: "string" },
        description: "Filter to specific team IDs",
      },
      includeInjuries: {
        type: "boolean",
        description: "Include injury reports in analysis (default: true)",
      },
      includeOdds: {
        type: "boolean",
        description: "Include odds comparison (default: true)",
      },
      minEdge: {
        type: "number",
        description: "Minimum edge threshold for recommendations (0.0-0.20, default: 0.05)",
        minimum: 0,
        maximum: 0.2,
      },
    },
    required: [],
  },
  outputSchema: {
    type: "object",
    properties: {
      games: {
        type: "array",
        items: {
          type: "object",
          properties: {
            game_id: { type: "string" },
            source: { type: "string" },
            start_time_utc: { type: "string" },
            status: { type: "string" },
            home_team: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
              },
            },
            away_team: {
              type: "object",
              properties: {
                id: { type: "string" },
                name: { type: "string" },
              },
            },
            freshness_seconds: { type: "number" },
            freshness_state: { type: "string" },
          },
        },
      },
      signals: {
        type: "array",
        items: {
          type: "object",
          properties: {
            signal_id: { type: "string" },
            game_id: { type: "string" },
            market: { type: "string" },
            model_probability: { type: "number" },
            fair_implied_probability: { type: "number" },
            edge: { type: "number" },
            value_flag: { type: "boolean" },
            confidence: { type: "number" },
            calibration_bucket: { type: "string" },
            stale_blocked: { type: "boolean" },
          },
        },
      },
      recommendations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            recommendation_id: { type: "string" },
            signal_id: { type: "string" },
            action: { type: "string" },
            rationale: { type: "string" },
            confidence: { type: "number" },
            constraints: {
              type: "object",
              properties: {
                hitl_required: { type: "boolean" },
                max_stake_pct: { type: "number" },
              },
            },
            policy_level: { type: "string" },
            emitted_at_utc: { type: "string" },
          },
        },
      },
      primaryProvider: { type: "string" },
      metadata: {
        type: "object",
        properties: {
          analyzedAtUtc: { type: "string" },
          gamesCount: { type: "number" },
          signalsCount: { type: "number" },
          recommendationsCount: { type: "number" },
          staleBlockedSignals: { type: "number" },
        },
      },
    },
  },
  capabilities: [
    "nba_analysis",
    "sports_analytics",
    "betting_insights",
    "injury_analysis",
    "odds_comparison",
    "edge_detection",
  ],
  tags: ["nba", "sports", "betting", "analytics", "basketball"],
  async execute(input: unknown, context: SkillContext): Promise<NbaAnalysisOutput> {
    const log = Log.create({ service: "kiloclaw.skill.nba-analysis" })
    const startTime = Date.now()

    log.info("NBA analysis skill started", {
      correlationId: context.correlationId,
      input,
    })

    const { gameId, teamIds, includeInjuries = true, includeOdds = true, minEdge = 0.05 } = input as NbaAnalysisInput

    const cb = getCircuitBreaker()
    const policyDecisions: NbaPolicyDecision[] = []

    // Step 1: Policy decision for data ingestion
    const dataIngestionDecision = NbaRuntime.decide({
      capability: "odds_markets",
      requestId: context.correlationId,
    })
    policyDecisions.push(dataIngestionDecision)

    if (dataIngestionDecision.outcome === "deny") {
      log.warn("NBA analysis denied by policy", {
        correlationId: context.correlationId,
        reason: dataIngestionDecision.reason,
      })
      return {
        games: [],
        signals: [],
        recommendations: [],
        policyDecisions,
        primaryProvider: "none",
        metadata: {
          analyzedAtUtc: new Date().toISOString(),
          gamesCount: 0,
          signalsCount: 0,
          recommendationsCount: 0,
          staleBlockedSignals: 0,
        },
      }
    }

    // Step 2: Fetch games
    const gamesResult = await NbaOrchestrator.getGames({
      teamIds,
    })

    const games = gamesResult.data.filter((g) => !gameId || g.game_id === gameId)

    log.info("games fetched", {
      correlationId: context.correlationId,
      gamesCount: games.length,
      primaryProvider: gamesResult.provider,
    })

    // Step 3: Fetch odds if requested
    let odds: Odds[] = []
    if (includeOdds) {
      const oddsResult = await NbaOrchestrator.getOdds({
        gameIds: games.map((g) => g.game_id),
      })
      odds = oddsResult.data
    }

    // Step 4: Fetch injuries if requested
    let injuriesFreshnessSeconds = 0
    if (includeInjuries) {
      const injuriesResult = await NbaOrchestrator.getInjuries({
        teamIds,
      })
      injuriesFreshnessSeconds = injuriesResult.combinedFreshnessSeconds
    }

    // Step 5: Generate signals for each game
    const signals: Signal[] = []
    let staleBlockedCount = 0

    for (const game of games) {
      const gameOdds = odds.filter((o) => o.game_id === game.game_id)

      if (gameOdds.length === 0) {
        continue // Skip games without odds
      }

      // Build stale input for policy check
      const staleInput = NbaOrchestrator.buildStaleInput(
        {
          data: gameOdds,
          provider: "",
          combinedFreshnessSeconds: gameOdds[0]?.freshness_seconds ?? 0,
          staleCount: 0,
          errorCount: 0,
        },
        { data: [], provider: "", combinedFreshnessSeconds: injuriesFreshnessSeconds, staleCount: 0, errorCount: 0 },
      )

      // Policy decision for edge detection
      const edgeDecision = NbaRuntime.decide({
        capability: "edge_detection",
        freshness: staleInput,
      })
      policyDecisions.push(edgeDecision)

      if (edgeDecision.outcome === "deny") {
        staleBlockedCount++
        continue
      }

      // Generate signal for each market
      for (const oddsData of gameOdds) {
        // Simple signal generation based on vig removal and edge detection
        const impliedProbabilities = oddsData.implied_probabilities_fair

        // Model probability (mock - in production this would use ML model)
        const modelProbability = 0.5 + (Math.random() - 0.5) * 0.3

        // Calculate edge
        const edge = modelProbability - impliedProbabilities[0]

        // Apply confidence cap
        const confidence = capConfidence(0.7 + Math.random() * 0.2)

        const signal: Signal = {
          signal_id: `sig_${game.game_id}_${oddsData.market}_${Date.now()}`,
          game_id: game.game_id,
          market: oddsData.market,
          model_probability: modelProbability,
          fair_implied_probability: impliedProbabilities[0],
          edge,
          value_flag: edge >= minEdge,
          confidence,
          calibration_bucket: confidence >= 0.9 ? "high" : confidence >= 0.7 ? "medium" : "low",
          stale_blocked: false,
          freshness_seconds: oddsData.freshness_seconds,
          freshness_state: oddsData.freshness_state,
          collected_at_utc: new Date().toISOString(),
        }

        signals.push(signal)
      }
    }

    // Step 6: Generate recommendations
    const recommendations: Recommendation[] = []

    for (const signal of signals) {
      if (!signal.value_flag) {
        continue // Skip non-value signals
      }

      // Policy decision for recommendation
      const recDecision = NbaRuntime.decide({
        capability: "recommendation_report",
      })
      policyDecisions.push(recDecision)

      if (recDecision.outcome === "deny") {
        continue
      }

      // Determine action based on edge direction
      const action = signal.edge > 0 ? "lean_home" : "lean_away"

      // Apply HITL requirement for stake sizing
      const stakeDecision = NbaRuntime.decide({
        capability: "stake_sizing",
      })

      const recommendation: Recommendation = {
        recommendation_id: `rec_${signal.signal_id}`,
        signal_id: signal.signal_id,
        action,
        rationale: `Edge of ${(signal.edge * 100).toFixed(1)}% detected with ${(signal.confidence * 100).toFixed(0)}% confidence. ${signal.stale_blocked ? "BLOCKED: stale data." : ""}`,
        confidence: signal.confidence,
        constraints: {
          hitl_required: stakeDecision.hitlRequired,
          max_stake_pct: stakeDecision.hitlRequired ? 0.02 : undefined, // 2% max if no HITL
        },
        policy_level: recDecision.policy,
        emitted_at_utc: new Date().toISOString(),
      }

      recommendations.push(recommendation)
    }

    const durationMs = Date.now() - startTime

    log.info("NBA analysis completed", {
      correlationId: context.correlationId,
      gamesCount: games.length,
      signalsCount: signals.length,
      recommendationsCount: recommendations.length,
      staleBlockedCount,
      durationMs,
      primaryProvider: gamesResult.provider,
    })

    return {
      games,
      odds,
      signals,
      recommendations,
      policyDecisions,
      primaryProvider: gamesResult.provider,
      metadata: {
        analyzedAtUtc: new Date().toISOString(),
        gamesCount: games.length,
        signalsCount: signals.length,
        recommendationsCount: recommendations.length,
        staleBlockedSignals: staleBlockedCount,
      },
    }
  },
}

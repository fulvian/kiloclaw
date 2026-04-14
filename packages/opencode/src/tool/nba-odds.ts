// NBA Odds Tool - Get NBA betting odds from multiple bookmakers
// Uses NbaOrchestrator with fallback chain: Bet365 → Odds API → Parlay → Polymarket

import z from "zod"
import { Tool } from "./tool"
import { NbaOrchestrator } from "../kiloclaw/agency/nba/orchestrator"
import { type Odds } from "../kiloclaw/agency/nba/schema"

function formatOdds(odds: Odds): string {
  const freshness = odds.freshness_state === "fresh" ? "✓" : odds.freshness_state === "stale" ? "⚠" : "?"

  const outcomes = odds.outcomes
    .map((o, i) => {
      const raw = odds.implied_probabilities_raw[i]
      const fair = odds.implied_probabilities_fair[i]
      const rawPct = raw !== undefined ? (raw * 100).toFixed(1) : "N/A"
      const fairPct = fair !== undefined ? (fair * 100).toFixed(1) : "N/A"
      const edge = fair !== undefined && raw !== undefined ? ((fair - raw) * 100).toFixed(1) : "0.0"
      return `    ${o}: ${rawPct}% (fair: ${fairPct}%, edge: ${edge}%)`
    })
    .join("\n")

  const marketLabel = odds.market === "h2h" ? "Moneyline" : odds.market === "spreads" ? "Spread" : "Over/Under"

  return `${freshness} [${odds.bookmaker_or_exchange}] ${marketLabel} (vig: ${odds.vig_percent.toFixed(2)}%)\n${outcomes}`
}

function formatOddsMarkdown(odds: Odds[], provider: string, freshnessSeconds: number): string {
  if (odds.length === 0) {
    return "No odds found for the specified criteria."
  }

  // Group by game
  const byGame = new Map<string, Odds[]>()
  for (const o of odds) {
    const existing = byGame.get(o.game_id) ?? []
    existing.push(o)
    byGame.set(o.game_id, existing)
  }

  const lines: string[] = [
    `## 📊 NBA Odds (${odds.length} lines from ${provider})`,
    `**Provider**: ${provider} | **Freshness**: ${freshnessSeconds < 60 ? `${freshnessSeconds}s ago` : `${Math.round(freshnessSeconds / 60)}m ago`}`,
    "",
  ]

  for (const [gameId, gameOdds] of byGame) {
    const sample = gameOdds[0]
    if (!sample) continue

    lines.push(`### Game: ${gameId}`)
    lines.push("")

    // Group by market
    const byMarket = new Map<string, Odds[]>()
    for (const o of gameOdds) {
      const existing = byMarket.get(o.market) ?? []
      existing.push(o)
      byMarket.set(o.market, existing)
    }

    for (const [market, marketOdds] of byMarket) {
      const marketLabel = market === "h2h" ? "💰 Moneyline" : market === "spreads" ? "📐 Spread" : "📈 Over/Under"
      lines.push(`${marketLabel}:`)
      for (const o of marketOdds) {
        lines.push(formatOdds(o))
      }
      lines.push("")
    }
  }

  lines.push(`---`)
  lines.push(`*Odds from ${provider} via NBA Agency orchestrator | Note: Always verify odds before betting*`)

  return lines.join("\n")
}

export const NbaOddsTool = Tool.define("nba-odds", async () => {
  return {
    description:
      "Get NBA betting odds from multiple bookmakers (Bet365, Odds API, Parlay, Polymarket). " +
      "Returns moneyline, spread, and over/under odds with implied probabilities and vig removal. " +
      "Use this for odds comparison, value detection, and betting analysis. " +
      "NOTE: Game IDs from nba-games (BallDontLie format like '21681576') cannot be used directly - " +
      "the Odds API uses different ID formats. If gameIds are provided but no odds are returned, " +
      "try without gameIds to get all available odds. Without gameIds, returns odds for all active games.",

    parameters: z.object({
      gameIds: z.array(z.string()).optional().describe("Game IDs from nba-games output (e.g. ['12345'])."),
      date: z
        .string()
        .optional()
        .describe("Filter odds by date (YYYY-MM-DD). Use when gameIds not available. Defaults to today."),
      markets: z
        .array(z.enum(["h2h", "spreads", "totals"]))
        .optional()
        .describe("Filter by market types: 'h2h' (moneyline), 'spreads' (point spread), 'totals' (over/under)."),
      bookmakers: z
        .array(z.string())
        .optional()
        .describe("Filter by specific bookmaker names (e.g., ['Bet365', 'FanDuel'])."),
      regions: z.array(z.string()).optional().describe("Filter by regions: 'us', 'uk', 'eu', 'au'."),
      minEdge: z
        .number()
        .optional()
        .describe("Minimum edge percentage to filter (0.0-0.20). Only show odds with at least this edge."),
    }),

    async execute(params, ctx) {
      await ctx.ask({
        permission: "nba-odds",
        patterns: [],
        always: [],
        metadata: { operation: "nba-odds", gameIds: params.gameIds },
      })

      const result = await NbaOrchestrator.getOdds({
        gameIds: params.gameIds,
        date: params.date,
        markets: params.markets as string[] | undefined,
        bookmakers: params.bookmakers,
        regions: params.regions as string[] | undefined,
      })

      let odds = result.data

      // Filter by minimum edge if specified
      if (params.minEdge !== undefined && params.minEdge > 0) {
        odds = odds.filter((o) => {
          // Calculate max edge across all outcomes
          let maxEdge = 0
          for (let i = 0; i < o.outcomes.length; i++) {
            const raw = o.implied_probabilities_raw[i]
            const fair = o.implied_probabilities_fair[i]
            if (raw !== undefined && fair !== undefined) {
              const edge = fair - raw
              if (edge > maxEdge) maxEdge = edge
            }
          }
          return maxEdge >= params.minEdge!
        })
      }

      const output = formatOddsMarkdown(odds, result.provider, result.combinedFreshnessSeconds)

      return {
        title: `NBA Odds - ${result.provider}`,
        output,
        metadata: {
          provider: result.provider,
          oddsCount: odds.length,
          totalCount: result.data.length,
          freshnessSeconds: result.combinedFreshnessSeconds,
          staleCount: result.staleCount,
          errorCount: result.errorCount,
          markets: [...new Set(odds.map((o) => o.market))],
          bookmakers: [...new Set(odds.map((o) => o.bookmaker_or_exchange))],
        },
      }
    },
  }
})

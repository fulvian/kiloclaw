// NBA Games Tool - Get live NBA games, scores, and schedule
// Uses NbaOrchestrator with fallback chain: BallDontLie → ESPN → NBA API

import z from "zod"
import { Tool } from "./tool"
import { NbaOrchestrator } from "../kiloclaw/agency/nba/orchestrator"
import { type Game } from "../kiloclaw/agency/nba/schema"

function formatGame(game: Game): string {
  const status =
    game.status === "live" ? "🔴 LIVE" : game.status === "final" ? "✅ FINAL" : `🕐 ${game.status.toUpperCase()}`

  let score = ""
  if (game.score?.home !== undefined && game.score?.away !== undefined) {
    score = ` [${game.score.home} - ${game.score.away}]`
  }

  const home = game.home_team.name
  const away = game.away_team.name
  const freshness = game.freshness_state === "fresh" ? "✓" : game.freshness_state === "stale" ? "⚠" : "?"

  return `${freshness} ${status}${score} | ${away} @ ${home}`
}

function formatGamesMarkdown(games: Game[], provider: string, freshnessSeconds: number): string {
  if (games.length === 0) {
    return "No games found for the specified criteria."
  }

  const lines = [
    `## 🏀 NBA Games (${games.length} games)`,
    `**Provider**: ${provider} | **Freshness**: ${freshnessSeconds < 60 ? `${freshnessSeconds}s ago` : `${Math.round(freshnessSeconds / 60)}m ago`}`,
    "",
    ...games.map((g) => formatGame(g)),
    "",
    `---`,
    `*Data from ${provider} via NBA Agency orchestrator*`,
  ]

  return lines.join("\n")
}

export const NbaGamesTool = Tool.define("nba-games", async () => {
  return {
    description:
      "Get NBA games, scores, and schedule from BallDontLie API with ESPN and NBA API fallback. " +
      "Returns live scores, game status, team information with freshness tracking. " +
      "Use this to get today's games, live scores, or schedule information. " +
      "Supports filtering by date (YYYY-MM-DD) and team IDs.",

    parameters: z.object({
      date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today's date."),
      teamIds: z
        .array(z.string())
        .optional()
        .describe("Filter by specific team IDs (e.g., ['1610612739', '1610612737'] for Lakers/Celtics)."),
      status: z
        .enum(["all", "scheduled", "live", "final"])
        .optional()
        .default("all")
        .describe("Filter games by status."),
    }),

    async execute(params, ctx) {
      await ctx.ask({
        permission: "nba-games",
        patterns: [],
        always: [],
        metadata: { operation: "nba-games", date: params.date },
      })

      // Default to today's date if none provided (BDL API returns ALL games without date)
      const dates = params.date ? [params.date] : [new Date().toISOString().split("T")[0]]

      const result = await NbaOrchestrator.getGames({
        dates,
        teamIds: params.teamIds,
      })

      // Filter by status if requested
      let games = result.data
      if (params.status && params.status !== "all") {
        games = games.filter((g) => g.status === params.status)
      }

      const output = formatGamesMarkdown(games, result.provider, result.combinedFreshnessSeconds)

      return {
        title: `NBA Games - ${result.provider}`,
        output,
        metadata: {
          provider: result.provider,
          gamesCount: games.length,
          totalCount: result.data.length,
          freshnessSeconds: result.combinedFreshnessSeconds,
          staleCount: result.staleCount,
          errorCount: result.errorCount,
        },
      }
    },
  }
})

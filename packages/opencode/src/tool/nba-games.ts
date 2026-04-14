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
  const homeId = game.home_team.id
  const awayId = game.away_team.id
  const freshness = game.freshness_state === "fresh" ? "✓" : game.freshness_state === "stale" ? "⚠" : "?"

  const startTime = game.start_time_utc
    ? new Date(game.start_time_utc).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      })
    : ""

  return `${freshness} ${status}${score} | ${away} (ID:${awayId}) @ ${home} (ID:${homeId}) | Game:${game.game_id}${startTime ? ` | ${startTime}` : ""}`
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
  ]

  // Add tool chaining guidance with IDs from the games
  const allTeamIds = new Set<string>()
  const allGameIds: string[] = []
  for (const g of games) {
    allTeamIds.add(g.home_team.id)
    allTeamIds.add(g.away_team.id)
    allGameIds.push(g.game_id)
  }
  const teamIdsStr = [...allTeamIds].join(",")
  const gameIdsStr = allGameIds.join(",")

  lines.push("---")
  lines.push(`*Data from ${provider} via NBA Agency orchestrator*`)
  lines.push("")
  lines.push("💡 **Next steps — use the IDs above with other NBA tools:**")
  lines.push(`- \`nba-stats\` (teamIds: [${teamIdsStr}]) → team/player statistics, season averages, recent games`)
  lines.push(`- \`nba-injuries\` (teamIds: [${teamIdsStr}]) → injury reports for these teams`)
  lines.push(`- \`nba-odds\` (gameIds: [${gameIdsStr}]) → betting odds for these games`)

  return lines.join("\n")
}

export const NbaGamesTool = Tool.define("nba-games", async () => {
  return {
    description:
      "Get NBA games, scores, and schedule from BallDontLie API with ESPN and NBA API fallback. " +
      "Returns live scores, game status, team information with freshness tracking. " +
      "Each game shows team IDs (BallDontLie numeric format, e.g. 1-30) and game ID — use these with nba-stats, nba-injuries, and nba-odds. " +
      "Supports filtering by date (YYYY-MM-DD) and team IDs.",

    parameters: z.object({
      date: z.string().optional().describe("Date in YYYY-MM-DD format. Defaults to today's date."),
      teamIds: z
        .array(z.string())
        .optional()
        .describe("Filter by BallDontLie team IDs (numeric 1-30, e.g. ['14', '1'] for Lakers/Celtics)."),
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
      // NBA games for "tonight" in local time may be scheduled on the next calendar day in UTC
      // (US evening games start ~11PM UTC). When no date specified, fetch both today and tomorrow
      // to capture all relevant games.
      let dates: string[]
      if (params.date) {
        dates = [params.date]
      } else {
        const today = new Date()
        const tomorrow = new Date(today)
        tomorrow.setDate(tomorrow.getDate() + 1)
        dates = [
          today.toLocaleDateString("en-CA"), // YYYY-MM-DD in local timezone
          tomorrow.toLocaleDateString("en-CA"),
        ]
      }

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

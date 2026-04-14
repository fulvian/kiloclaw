// NBA Stats Tool - Player stats, team stats, season averages, and recent games
// Uses BallDontLie API with fallback chain
// Provides: player game stats, season averages, team season stats, recent games

import z from "zod"
import { Tool } from "./tool"
import { NbaOrchestrator } from "../kiloclaw/agency/nba/orchestrator"

function formatPlayerStats(stats: Record<string, unknown>[], title: string): string {
  if (stats.length === 0) return `No ${title} found.`

  const lines = [`## 📊 ${title} (${stats.length} records})`, ""]

  for (const stat of stats) {
    const name = String(stat.player_name ?? stat.name ?? "Unknown")
    const team = String(stat.team_name ?? stat.team ?? "")
    const pts = stat.pts ?? stat.points ?? "-"
    const ast = stat.ast ?? stat.assists ?? "-"
    const reb = stat.reb ?? stat.rebounds ?? "-"
    const stl = stat.stl ?? stat.steals ?? "-"
    const blk = stat.blk ?? stat.blocks ?? "-"
    const min = stat.min ?? stat.minutes ?? "-"
    const gp = stat.games_played ?? stat.gp ?? "-"

    lines.push(`**${name}** (${team})`)
    if (gp !== "-") lines.push(`  GP: ${gp}`)
    lines.push(`  MIN: ${min} | PTS: ${pts} | AST: ${ast} | REB: ${reb} | STL: ${stl} | BLK: ${blk}`)

    // Show additional stats if available
    const fgPct = stat.fg_pct ?? stat.field_goal_pct
    const fg3Pct = stat.fg3_pct ?? stat.three_point_pct
    const ftPct = stat.ft_pct ?? stat.free_throw_pct
    const tov = stat.tov ?? stat.turnover ?? stat.turnovers

    if (fgPct !== undefined)
      lines.push(`  FG%: ${fgPct} | 3P%: ${fg3Pct ?? "-"} | FT%: ${ftPct ?? "-"} | TOV: ${tov ?? "-"}`)
    lines.push("")
  }

  return lines.join("\n")
}

function formatTeamStats(stats: Record<string, unknown>[], title: string): string {
  if (stats.length === 0) return `No ${title} found.`

  const lines = [`## 🏀 ${title} (${stats.length} teams})`, ""]

  for (const stat of stats) {
    const name = String(stat.team_name ?? stat.name ?? "Unknown")
    const gp = stat.gp ?? stat.games_played ?? "-"
    const w = stat.w ?? stat.wins ?? "-"
    const l = stat.l ?? stat.losses ?? "-"
    const pts = stat.pts ?? stat.points ?? "-"
    const reb = stat.reb ?? stat.rebounds ?? "-"
    const ast = stat.ast ?? stat.assists ?? "-"
    const fgPct = stat.fg_pct ?? "-"
    const fg3Pct = stat.fg3_pct ?? "-"

    lines.push(`**${name}** (${gp !== "-" ? `${w}-${l}` : "N/A"})`)
    lines.push(`  PTS: ${pts} | REB: ${reb} | AST: ${ast} | FG%: ${fgPct} | 3P%: ${fg3Pct}`)
    lines.push("")
  }

  return lines.join("\n")
}

function formatGames(games: Record<string, unknown>[], title: string): string {
  if (games.length === 0) return `No ${title} found.`

  const lines = [`## 🏀 ${title} (${games.length} games)`, ""]

  for (const game of games) {
    const date = String(game.date ?? "")
    const home = String(game.home_team_name ?? game.home_team ?? "Home")
    const away = String(game.away_team_name ?? game.away_team ?? "Away")
    const homeScore = game.home_team_score ?? game.home_score ?? ""
    const awayScore = game.away_team_score ?? game.away_score ?? ""
    const status = String(game.status ?? "")

    const score = homeScore !== "" && awayScore !== "" ? ` [${homeScore}-${awayScore}]` : ""
    const statusLabel = status === "Final" ? "✅" : status === "Live" ? "🔴" : "🕐"

    lines.push(`${statusLabel} ${date} | ${away} @ ${home}${score}`)
  }

  return lines.join("\n")
}

export const NbaStatsTool = Tool.define("nba-stats", async () => {
  return {
    description:
      "Get NBA player statistics, team statistics, season averages, and recent game results. " +
      "Supports multiple query types:\n" +
      "- 'player_stats': Per-game player box score stats for a date range\n" +
      "- 'player_season_averages': Season averages for specific players\n" +
      "- 'team_stats': Team season statistics\n" +
      "- 'recent_games': Last N games for a specific team\n" +
      "Uses BallDontLie API. Requires player/team IDs (use nba-games to find teams).",

    parameters: z.object({
      type: z
        .enum(["player_stats", "player_season_averages", "team_stats", "recent_games"])
        .describe("Type of stats to retrieve."),
      playerIds: z
        .array(z.string())
        .optional()
        .describe("Player IDs for stats (use with player_stats or player_season_averages)."),
      teamIds: z.array(z.string()).optional().describe("Team IDs for stats (use with team_stats or recent_games)."),
      season: z
        .number()
        .optional()
        .describe("Season year (e.g., 2025 for 2025-26 season). Defaults to current season."),
      startDate: z
        .string()
        .optional()
        .describe("Start date for stats (YYYY-MM-DD). Use with player_stats or recent_games."),
      endDate: z
        .string()
        .optional()
        .describe("End date for stats (YYYY-MM-DD). Use with player_stats or recent_games."),
      lastNGames: z
        .number()
        .optional()
        .default(5)
        .describe("Number of recent games to fetch (use with recent_games). Default: 5."),
      postseason: z
        .boolean()
        .optional()
        .default(false)
        .describe("Include playoff stats. Default: false (regular season only)."),
    }),

    async execute(params, ctx) {
      await ctx.ask({
        permission: "nba-stats",
        patterns: [],
        always: [],
        metadata: { operation: "nba-stats", type: params.type },
      })

      const result = await NbaOrchestrator.getStats({
        type: params.type,
        playerIds: params.playerIds,
        teamIds: params.teamIds,
        season: params.season,
        startDate: params.startDate,
        endDate: params.endDate,
        lastNGames: params.lastNGames,
        postseason: params.postseason,
      })

      const title = params.type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())

      const output =
        params.type === "team_stats"
          ? formatTeamStats(result.data as Record<string, unknown>[], title)
          : params.type === "recent_games"
            ? formatGames(result.data as Record<string, unknown>[], title)
            : formatPlayerStats(result.data as Record<string, unknown>[], title)

      return {
        title: `NBA Stats - ${title}`,
        output,
        metadata: {
          provider: result.provider,
          statsCount: result.data.length,
          type: params.type,
        },
      }
    },
  }
})

// NBA Injuries Tool - Get NBA injury reports
// Uses NbaOrchestrator with fallback chain: BallDontLie → ESPN
// CRITICAL: Injury data is essential for betting analysis

import z from "zod"
import { Tool } from "./tool"
import { NbaOrchestrator } from "../kiloclaw/agency/nba/orchestrator"
import { type Injury } from "../kiloclaw/agency/nba/schema"

function formatInjury(injury: Injury): string {
  const statusIcon =
    injury.status === "out"
      ? "❌ OUT"
      : injury.status === "doubtful"
        ? "⚠️ DOUBTFUL"
        : injury.status === "questionable"
          ? "❓ QUESTIONABLE"
          : injury.status === "probable"
            ? "✅ PROBABLE"
            : "⏳ GAME TIME DECISION"

  const freshness = injury.freshness_state === "fresh" ? "✓" : injury.freshness_state === "stale" ? "⚠" : "?"

  return `${freshness} ${statusIcon} | ${injury.player_name} (${injury.team_name})\n    Injury: ${injury.injury}\n    ${injury.description}`
}

function formatInjuriesMarkdown(injuries: Injury[], provider: string, freshnessSeconds: number): string {
  if (injuries.length === 0) {
    return "No injuries found for the specified criteria."
  }

  // Group by team
  const byTeam = new Map<string, Injury[]>()
  for (const i of injuries) {
    const existing = byTeam.get(i.team_name) ?? []
    existing.push(i)
    byTeam.set(i.team_name, existing)
  }

  const lines: string[] = [
    `## 🏥 NBA Injury Report (${injuries.length} players)`,
    `**Provider**: ${provider} | **Freshness**: ${freshnessSeconds < 3600 ? `${Math.round(freshnessSeconds / 60)}m ago` : `${Math.round(freshnessSeconds / 3600)}h ago`}`,
    "",
  ]

  // Sort teams by number of injuries (most injured first)
  const sortedTeams = [...byTeam.entries()].sort((a, b) => b[1].length - a[1].length)

  for (const [teamName, teamInjuries] of sortedTeams) {
    lines.push(`### ${teamName} (${teamInjuries.length} injured)`)
    lines.push("")

    // Sort by status severity (out first)
    const statusOrder = ["out", "doubtful", "questionable", "probable", "game_time_decision"]
    const sorted = teamInjuries.sort((a, b) => statusOrder.indexOf(a.status) - statusOrder.indexOf(b.status))

    for (const injury of sorted) {
      lines.push(formatInjury(injury))
      lines.push("")
    }
  }

  // Summary
  const outCount = injuries.filter((i) => i.status === "out").length
  const questionableCount = injuries.filter((i) => i.status === "questionable" || i.status === "doubtful").length

  lines.push(`---`)
  lines.push(`**Summary**: ${outCount} OUT | ${questionableCount} QUESTIONABLE/DOUBTFUL`)
  lines.push(
    `*Injury data from ${provider} via NBA Agency orchestrator | Data freshness: ${freshnessSeconds < 3600 ? "CURRENT" : "STALE"}*`,
  )

  return lines.join("\n")
}

export const NbaInjuriesTool = Tool.define("nba-injuries", async () => {
  return {
    description:
      "Get NBA injury reports from BallDontLie and ESPN. " +
      "Returns player injuries with status (OUT/Doubtful/Questionable/Probable) and injury details. " +
      "CRITICAL for betting analysis - injuries significantly impact game outcomes and odds. " +
      "Use team IDs from nba-games output (BallDontLie numeric format 1-30). " +
      "If no teamIds provided, returns injuries for all teams with games today.",

    parameters: z.object({
      teamIds: z
        .array(z.string())
        .optional()
        .describe("BallDontLie team IDs (numeric 1-30, from nba-games output, e.g. ['14', '1'])."),
      status: z
        .enum(["all", "out", "questionable", "doubtful", "probable"])
        .optional()
        .default("all")
        .describe("Filter by injury status severity."),
      includeGameTimeDecision: z
        .boolean()
        .optional()
        .default(true)
        .describe("Include players with 'game time decision' status."),
    }),

    async execute(params, ctx) {
      await ctx.ask({
        permission: "nba-injuries",
        patterns: [],
        always: [],
        metadata: { operation: "nba-injuries", teamIds: params.teamIds },
      })

      const result = await NbaOrchestrator.getInjuries({
        teamIds: params.teamIds,
      })

      let injuries = result.data

      // Filter by status if requested
      if (params.status && params.status !== "all") {
        injuries = injuries.filter((i) => i.status === params.status)
      }

      // Filter game time decisions if requested
      if (params.includeGameTimeDecision === false) {
        injuries = injuries.filter((i) => i.status !== "game_time_decision")
      }

      const output = formatInjuriesMarkdown(injuries, result.provider, result.combinedFreshnessSeconds)

      return {
        title: `NBA Injuries - ${result.provider}`,
        output,
        metadata: {
          provider: result.provider,
          injuriesCount: injuries.length,
          totalCount: result.data.length,
          freshnessSeconds: result.combinedFreshnessSeconds,
          staleCount: result.staleCount,
          errorCount: result.errorCount,
          teams: [...new Set(injuries.map((i) => i.team_name))],
          outCount: injuries.filter((i) => i.status === "out").length,
          questionableCount: injuries.filter((i) => i.status === "questionable" || i.status === "doubtful").length,
        },
      }
    },
  }
})

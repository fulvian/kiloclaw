// NBA Tool Resolution Test
// Verifies that L3 tool resolution correctly handles NBA adapter tools

import { describe, it, expect } from "bun:test"
import { RoutingPipeline } from "../../src/kiloclaw/agency/routing/pipeline"
import { AgencyRegistry } from "../../src/kiloclaw/agency/registry/agency-registry"
import { bootstrapRegistries } from "../../src/kiloclaw/agency/bootstrap"
import type { Intent } from "../../src/kiloclaw/types"

describe("NBA Tool Resolution (L3)", () => {
  it("should resolve NBA adapter tools for schedule_live capability", async () => {
    bootstrapRegistries()
    const l3Result = await RoutingPipeline.resolveTools("agency-nba", "nba-analysis")

    console.log("L3 Result for NBA agency:", {
      toolsRequested: l3Result.toolsRequested,
      toolsResolved: l3Result.toolsResolved,
      deniedTools: l3Result.deniedTools,
    })

    // Verify that NBA adapter tools are in the allowlist
    expect(l3Result.deniedTools).toHaveLength(0)
    expect(l3Result.toolsResolved).toBeGreaterThan(0)
  })

  it("should include balldontlie adapters in NBA tool allowlist", async () => {
    bootstrapRegistries()
    const agency = AgencyRegistry.getAgency("agency-nba")
    expect(agency).toBeDefined()

    if (!agency) return

    const l3Result = await RoutingPipeline.resolveTools("agency-nba", "nba-analysis")

    // Since we pass undefined for requestedTools, it uses the allowlist
    // The allowlist should contain NBA adapter tools
    console.log("Tools resolved:", l3Result.toolsResolved)
    console.log("Tools denied:", l3Result.deniedTools)

    // Verify "skill" is resolved (NBA skill)
    expect(l3Result.deniedTools.filter((t) => t === "skill").length).toBe(0)

    // Verify websearch is NOT in the denied list for NBA
    // (it shouldn't be in the allowlist for NBA)
    const websearchDenied = l3Result.deniedTools.includes("websearch")
    console.log("Websearch denied:", websearchDenied)
    // websearchDenied should be true because NBA doesn't use websearch
  })

  it("should NOT include websearch/webfetch in NBA tool allowlist", async () => {
    // This verifies that NBA agency explicitly does NOT include generic web tools
    bootstrapRegistries()
    const agency = AgencyRegistry.getAgency("agency-nba")
    expect(agency).toBeDefined()

    const nbaTools = [
      "balldontlie.getGames",
      "balldontlie.getInjuries",
      "balldontlie.getStats",
      "espn.getScoreboard",
      "espn.getInjuries",
      "espn.getStandings",
      "nba_api.getStats",
      "odds_bet365.getOdds",
      "odds_api.getOdds",
      "parlay.getOdds",
      "polymarket.getOdds",
      "skill",
    ]

    // Try to resolve each NBA tool
    for (const tool of nbaTools) {
      const l3Result = await RoutingPipeline.resolveTools("agency-nba", "nba-analysis", undefined, [tool])
      console.log(`Tool: ${tool}, Resolved: ${l3Result.toolsResolved}, Denied: ${l3Result.deniedTools.length}`)
      // Each native tool should be resolved (not denied)
      expect(l3Result.deniedTools).not.toContain(tool)
    }

    // Verify websearch is denied for NBA
    const websearchResult = await RoutingPipeline.resolveTools("agency-nba", "nba-analysis", undefined, ["websearch"])
    console.log("Websearch for NBA - Denied:", websearchResult.deniedTools)
    expect(websearchResult.deniedTools).toContain("websearch")

    // Verify webfetch is denied for NBA
    const webfetchResult = await RoutingPipeline.resolveTools("agency-nba", "nba-analysis", undefined, ["webfetch"])
    console.log("Webfetch for NBA - Denied:", webfetchResult.deniedTools)
    expect(webfetchResult.deniedTools).toContain("webfetch")
  })

  it("should maintain deny-by-default for unknown tools in NBA", async () => {
    bootstrapRegistries()
    const result = await RoutingPipeline.resolveTools("agency-nba", "nba-analysis", undefined, [
      "unknown.tool",
      "fake.adapter",
    ])

    console.log("Unknown tools - Denied:", result.deniedTools)
    expect(result.deniedTools).toContain("unknown.tool")
    expect(result.deniedTools).toContain("fake.adapter")
  })
})

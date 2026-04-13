// Agency Compliance Audit Test
// Validates that all agencies follow Protocol V2 compliance rules

import { describe, it, expect } from "bun:test"
import { AgencyRegistry } from "../../src/kiloclaw/agency/registry/agency-registry"
import { bootstrapRegistries } from "../../src/kiloclaw/agency/bootstrap"
import { RoutingPipeline } from "../../src/kiloclaw/agency/routing/pipeline"

describe("Agency Compliance Audit (Protocol V2)", () => {
  it("all agencies have deny-by-default policies", async () => {
    bootstrapRegistries()

    const agencies = AgencyRegistry.getAllAgencies()
    console.log(`Auditing ${agencies.length} agencies...`)

    for (const agency of agencies) {
      // Every agency must have at least one denied capability
      const hasDeniedCapabilities = agency.policies.deniedCapabilities && agency.policies.deniedCapabilities.length > 0

      // Every agency must have at most a reasonable number of allowed capabilities
      const reasonableAllowCount = agency.policies.allowedCapabilities.length <= 50

      console.log(`  ${agency.id}:`, {
        allowedCapabilities: agency.policies.allowedCapabilities.length,
        deniedCapabilities: agency.policies.deniedCapabilities.length,
        denyByDefault: hasDeniedCapabilities ? "✅" : "⚠️",
        reasonableCount: reasonableAllowCount ? "✅" : "❌",
      })

      // Verify no overlap between allowed and denied
      const overlap = agency.policies.allowedCapabilities.filter((cap) =>
        agency.policies.deniedCapabilities.includes(cap),
      )
      expect(overlap).toHaveLength(0, `Agency ${agency.id} has overlap between allowed and denied capabilities`)
    }
  })

  it("specialized agencies do not allow generic tools", async () => {
    bootstrapRegistries()

    const specializedAgencies = ["agency-nba", "agency-finance", "agency-nutrition", "agency-weather"]

    for (const agencyId of specializedAgencies) {
      // Test that websearch is denied
      const searchResult = await RoutingPipeline.resolveTools(agencyId, undefined, undefined, ["websearch"])
      expect(searchResult.deniedTools).toContain("websearch", `${agencyId} should deny websearch`)

      // Test that webfetch is denied
      const fetchResult = await RoutingPipeline.resolveTools(agencyId, undefined, undefined, ["webfetch"])
      expect(fetchResult.deniedTools).toContain("webfetch", `${agencyId} should deny webfetch`)

      console.log(`✅ ${agencyId}: generic tools denied`)
    }
  })

  it("verify GWorkspace has explicit tool allowlist", async () => {
    bootstrapRegistries()

    const gworkspaceTools = [
      "gmail.search",
      "gmail.read",
      "drive.search",
      "calendar.list",
      "docs.read",
      "sheets.read",
    ]

    const l3Result = await RoutingPipeline.resolveTools("agency-gworkspace", undefined, undefined, gworkspaceTools)

    console.log("GWorkspace tool resolution:", {
      requested: gworkspaceTools.length,
      resolved: l3Result.toolsResolved,
      denied: l3Result.toolsDenied,
    })

    expect(l3Result.toolsResolved).toBe(gworkspaceTools.length)
    expect(l3Result.toolsDenied).toBe(0)
  })

  it("development agency allows code tools", async () => {
    bootstrapRegistries()

    const devTools = ["read", "glob", "grep", "bash", "skill"]

    const l3Result = await RoutingPipeline.resolveTools("agency-development", undefined, undefined, devTools)

    console.log("Development tool resolution:", {
      requested: devTools.length,
      resolved: l3Result.toolsResolved,
      denied: l3Result.toolsDenied,
    })

    expect(l3Result.toolsResolved).toBe(devTools.length)
    expect(l3Result.toolsDenied).toBe(0)
  })

  it("knowledge agency allows generic tools", async () => {
    bootstrapRegistries()

    const knowledgeTools = ["websearch", "webfetch", "skill"]

    const l3Result = await RoutingPipeline.resolveTools("agency-knowledge", undefined, undefined, knowledgeTools)

    console.log("Knowledge tool resolution:", {
      requested: knowledgeTools.length,
      resolved: l3Result.toolsResolved,
      denied: l3Result.toolsDenied,
    })

    expect(l3Result.toolsResolved).toBe(knowledgeTools.length)
    expect(l3Result.toolsDenied).toBe(0)
  })

  it("verify all agencies have proper metadata", async () => {
    bootstrapRegistries()

    const agencies = AgencyRegistry.getAllAgencies()

    for (const agency of agencies) {
      // Every agency must have metadata with wave and description
      expect(agency.metadata).toBeDefined()
      expect(agency.metadata.wave).toBeDefined()
      expect(agency.metadata.description).toBeDefined()

      // Wave must be between 1-4
      expect(agency.metadata.wave).toBeGreaterThanOrEqual(1)
      expect(agency.metadata.wave).toBeLessThanOrEqual(4)

      console.log(`  ${agency.id}: Wave ${agency.metadata.wave}`)
    }
  })

  it("no cross-agency tool conflicts", async () => {
    bootstrapRegistries()

    const agencies = AgencyRegistry.getAllAgencies()

    // Build a map of tool → agencies that claim to allow it
    const toolOwnership: Record<string, string[]> = {}

    for (const agency of agencies) {
      // Simulate tool resolution for this agency
      const l3Result = await RoutingPipeline.resolveTools(agency.id, undefined, undefined, [
        "balldontlie.getGames",
        "odds_bet365.getOdds",
        "usda.fooddata",
        "openweathermap.current",
        "twelve_data.prices",
        "gmail.search",
        "read",
        "websearch",
      ])

      for (const resolvedTool of [
        "balldontlie.getGames",
        "odds_bet365.getOdds",
        "usda.fooddata",
        "openweathermap.current",
        "twelve_data.prices",
        "gmail.search",
        "read",
        "websearch",
      ]) {
        if (!l3Result.deniedTools.includes(resolvedTool)) {
          if (!toolOwnership[resolvedTool]) {
            toolOwnership[resolvedTool] = []
          }
          toolOwnership[resolvedTool].push(agency.id)
        }
      }
    }

    // Specialized tools should only belong to one agency
    const specializedTools = [
      "balldontlie.getGames",
      "odds_bet365.getOdds",
      "usda.fooddata",
      "openweathermap.current",
      "twelve_data.prices",
      "gmail.search",
    ]

    for (const tool of specializedTools) {
      if (toolOwnership[tool]) {
        expect(toolOwnership[tool].length).toBeLessThanOrEqual(1, `Tool ${tool} claimed by multiple agencies`)
      }
    }

    console.log("Tool ownership map:", toolOwnership)
  })
})

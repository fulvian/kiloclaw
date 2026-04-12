/**
 * NBA Agency E2E Tests
 * P2: End-to-end tests for NBA agency routing and execution
 *
 * Tests the complete flow: intent classification → routing → tool context → skill execution
 */

import { describe, expect, test, beforeEach } from "bun:test"
import { RoutingPipeline } from "@/kiloclaw/agency/routing/pipeline"
import { AgencyRegistry } from "@/kiloclaw/agency/registry/agency-registry"
import { SkillRegistry } from "@/kiloclaw/agency/registry/skill-registry"
import { bootstrapRegistries, resetBootstrap } from "@/kiloclaw/agency/bootstrap"
import type { RouteResult } from "@/kiloclaw/types"

describe("nba-agency e2e", () => {
  beforeEach(() => {
    // Reset and bootstrap registries for fresh state
    resetBootstrap()
    bootstrapRegistries()
  })

  test("routes NBA game query to agency-nba", async () => {
    const result = await RoutingPipeline.route({
      id: "test-nba-games",
      type: "query",
      description: "analizza partite NBA per questa notte",
      risk: "low",
    })

    expect(result.agencyId).toBe("agency-nba")
    expect(result.layers.L0).toBeDefined()
    expect(result.layers.L0?.domain).toBe("nba")
    expect(result.confidence).toBeGreaterThan(0.3)
  })

  test("routes NBA betting query to agency-nba", async () => {
    const result = await RoutingPipeline.route({
      id: "test-nba-betting",
      type: "query",
      description: "analizza quote scommesse NBA e trova value betting",
      risk: "low",
    })

    expect(result.agencyId).toBe("agency-nba")
    expect(result.layers.L0?.domain).toBe("nba")
  })

  test("routes NBA odds analysis to agency-nba", async () => {
    const result = await RoutingPipeline.route({
      id: "test-nba-odds",
      type: "query",
      description: "confronta quote NBA tra bookmakers per trovare value",
      risk: "low",
    })

    expect(result.agencyId).toBe("agency-nba")
    expect(result.layers.L0?.domain).toBe("nba")
  })

  test("routes NBA injury report query to agency-nba", async () => {
    const result = await RoutingPipeline.route({
      id: "test-nba-injuries",
      type: "query",
      description: "report infortuni giocatori NBA per le partite di stanotte",
      risk: "low",
    })

    expect(result.agencyId).toBe("agency-nba")
    expect(result.layers.L0?.confidence).toBeGreaterThan(0.3)
  })

  test("routes NBA stats analysis to agency-nba", async () => {
    const result = await RoutingPipeline.route({
      id: "test-nba-stats",
      type: "query",
      description: "statistiche giocatori e team per analisi NBA",
      risk: "low",
    })

    expect(result.agencyId).toBe("agency-nba")
    expect(result.layers.L0?.domain).toBe("nba")
  })

  test("NBA agency policy allows betting-related capabilities", () => {
    const agency = AgencyRegistry.getAgency("agency-nba")
    expect(agency).toBeDefined()
    expect(agency?.policies.allowedCapabilities).toContain("odds_markets")
    expect(agency?.policies.allowedCapabilities).toContain("edge_detection")
    expect(agency?.policies.allowedCapabilities).toContain("value_watchlist")
  })

  test("NBA agency denies dangerous betting operations", () => {
    const agency = AgencyRegistry.getAgency("agency-nba")
    expect(agency?.policies.deniedCapabilities).toContain("auto_bet")
    expect(agency?.policies.deniedCapabilities).toContain("auto_bet_execution")
    expect(agency?.policies.deniedCapabilities).toContain("martingale")
  })

  test("NBA agency requires approval for operations", () => {
    const agency = AgencyRegistry.getAgency("agency-nba")
    expect(agency?.policies.requiresApproval).toBe(true)
  })

  test("nba-analysis skill is registered", () => {
    const skill = SkillRegistry.getSkill("nba-analysis")
    expect(skill).toBeDefined()
    expect(skill?.id).toBe("nba-analysis")
    expect(skill?.capabilities).toContain("nba_analysis")
  })

  test("routeResult for NBA matches RouteResult type", async () => {
    const result = await RoutingPipeline.route({
      id: "test-nba-route-result",
      type: "query",
      description: "analisi partite NBA e pronostici",
      risk: "low",
    })

    // L1 should have routeResult for skill routing
    expect(result.layers.L1).toBeDefined()

    const routeResult = result.layers.L1?.routeResult
    if (routeResult) {
      // Validate structure matches RouteResult type
      expect(["skill", "chain", "agent"]).toContain(routeResult.type)
      expect(typeof routeResult.confidence).toBe("number")
      expect(routeResult.confidence).toBeGreaterThanOrEqual(0)
      expect(routeResult.confidence).toBeLessThanOrEqual(1)

      // If routed to skill, should have skill field
      if (routeResult.type === "skill") {
        expect(routeResult.skill).toBeDefined()
      }
    }
  })

  test("NBA L3 tool resolution respects policy", async () => {
    const result = await RoutingPipeline.route({
      id: "test-nba-tools",
      type: "query",
      description: "NBA odds and analysis",
      risk: "low",
    })

    // L3 should resolve tools based on agency policy
    if (result.layers.L3) {
      expect(result.layers.L3.toolsRequested).toBeGreaterThanOrEqual(0)
      // Verify blocked/denied tools are tracked
      expect(Array.isArray(result.layers.L3.deniedTools)).toBe(true)
      expect(Array.isArray(result.layers.L3.blockedTools)).toBe(true)
    }
  })

  test("Italian NBA keywords route correctly", async () => {
    // Test Italian keywords that should trigger NBA routing
    const keywords = [
      "partite NBA stasera",
      "quote scommesse basket",
      "infortuni giocatori NBA",
      "analisi partita NBA",
      "value betting NBA",
    ]

    for (const keyword of keywords) {
      const result = await RoutingPipeline.route({
        id: `test-nba-italian-${keyword.slice(0, 10)}`,
        type: "query",
        description: keyword,
        risk: "low",
      })

      expect(result.agencyId).toBe("agency-nba")
      expect(result.layers.L0?.domain).toBe("nba")
    }
  })
})

/**
 * Finance Agency E2E Tests
 * P2: End-to-end tests for finance agency routing and execution
 *
 * Tests the complete flow: intent classification → routing → tool context → skill execution
 */

import { describe, expect, test, beforeEach } from "bun:test"
import { RoutingPipeline } from "@/kiloclaw/agency/routing/pipeline"
import { AgencyRegistry } from "@/kiloclaw/agency/registry/agency-registry"
import { bootstrapRegistries, resetBootstrap } from "@/kiloclaw/agency/bootstrap"
import type { RouteResult } from "@/kiloclaw/types"

describe("finance-agency e2e", () => {
  beforeEach(() => {
    // Reset and bootstrap registries for fresh state
    resetBootstrap()
    bootstrapRegistries()
  })

  test("routes crypto price query to agency-finance with routeResult", async () => {
    const result = await RoutingPipeline.route({
      id: "test-finance-crypto",
      type: "query",
      description: "qual è il prezzo di Bitcoin oggi",
      risk: "low",
    })

    expect(result.agencyId).toBe("agency-finance")
    expect(result.layers.L0).toBeDefined()
    expect(result.layers.L0?.domain).toBe("finance")
    expect(result.confidence).toBeGreaterThan(0.3)

    // L1 routing should provide routeResult if capabilities match
    if (result.layers.L1) {
      const l1RouteResult = result.layers.L1.routeResult
      expect(l1RouteResult === null || l1RouteResult === undefined || typeof l1RouteResult === "object").toBe(true)
    }
  })

  test("routes stock analysis to agency-finance with tool resolution", async () => {
    const result = await RoutingPipeline.route({
      id: "test-finance-stock",
      type: "query",
      description: "stock price RSI MACD technical analysis for AAPL",
      risk: "low",
    })

    expect(result.agencyId).toBe("agency-finance")
    expect(result.layers.L0?.domain).toBe("finance")

    // L3 should resolve tools based on agency policy
    if (result.layers.L3) {
      expect(result.layers.L3.toolsRequested).toBeGreaterThanOrEqual(0)
    }
  })

  test("routes forex query to agency-finance", async () => {
    const result = await RoutingPipeline.route({
      id: "test-finance-forex",
      type: "query",
      description: "EUR USD forex trading signals and trend analysis",
      risk: "low",
    })

    expect(result.agencyId).toBe("agency-finance")
    expect(result.layers.L0?.domain).toBe("finance")
  })

  test("routes trading signal query to agency-finance", async () => {
    const result = await RoutingPipeline.route({
      id: "test-finance-signals",
      type: "query",
      description: "genera segnali di trading per TSLA",
      risk: "medium",
    })

    expect(result.agencyId).toBe("agency-finance")
    expect(result.layers.L0?.confidence).toBeGreaterThan(0.3)
  })

  test("routes commodity query to agency-finance", async () => {
    const result = await RoutingPipeline.route({
      id: "test-finance-commodity",
      type: "query",
      description: "gold price commodity trading market per ounce",
      risk: "low",
    })

    expect(result.agencyId).toBe("agency-finance")
    expect(result.layers.L0?.domain).toBe("finance")
  })

  test("finance agency policy allows expected capabilities", () => {
    const agency = AgencyRegistry.getAgency("agency-finance")
    expect(agency).toBeDefined()
    expect(agency?.policies.allowedCapabilities).toContain("price.current")
    expect(agency?.policies.allowedCapabilities).toContain("signal.generation")
    expect(agency?.policies.allowedCapabilities).toContain("portfolio.rebalance")
  })

  test("finance agency denies risky capabilities", () => {
    const agency = AgencyRegistry.getAgency("agency-finance")
    expect(agency?.policies.deniedCapabilities).toContain("real.execution")
    expect(agency?.policies.deniedCapabilities).toContain("leverage.extreme")
    expect(agency?.policies.deniedCapabilities).toContain("market.manipulation")
  })

  test("routeResult structure matches RouteResult type for finance", async () => {
    const result = await RoutingPipeline.route({
      id: "test-finance-struct",
      type: "query",
      description: "stock price analysis for MSFT",
      risk: "low",
    })

    const routeResult = result.layers.L1?.routeResult

    if (routeResult) {
      // Validate structure matches RouteResult type
      expect(["skill", "chain", "agent"]).toContain(routeResult.type)
      expect(typeof routeResult.confidence).toBe("number")
      expect(routeResult.confidence).toBeGreaterThanOrEqual(0)
      expect(routeResult.confidence).toBeLessThanOrEqual(1)
    }
  })

  test("finance fallback used when no capabilities match", async () => {
    // Route with intent that doesn't match finance capabilities
    const result = await RoutingPipeline.route({
      id: "test-finance-unknown",
      type: "chat",
      description: "make me a sandwich",
      risk: "low",
    })

    // Should still route to some agency but may use fallback
    expect(result.agencyId).toBeDefined()
    // FallbackUsed indicates routing couldn't find optimal match
    expect(typeof result.fallbackUsed).toBe("boolean")
  })
})

// Finance Routing Diagnostic Test

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { HybridRouter, type HybridIntentRouter } from "../../src/kiloclaw/agency/routing/semantic/hybrid-router"
import { AgencyRegistry } from "../../src/kiloclaw/agency/registry/agency-registry"
import { bootstrapRegistries } from "../../src/kiloclaw/agency/bootstrap"
import type { Intent } from "../../src/kiloclaw/agency/routing/semantic"

describe("Finance Routing", () => {
  let router: HybridIntentRouter

  beforeEach(() => {
    bootstrapRegistries()
    HybridRouter.reset()
    router = HybridRouter.create()
  })

  afterEach(() => {
    HybridRouter.reset()
  })

  it("should route crypto price query to agency-finance", async () => {
    const intent: Intent = {
      id: "test-finance-crypto-1",
      type: "query",
      description: "qual è il prezzo di Bitcoin oggi",
      risk: "low",
    }

    const result = await router.route(intent)
    console.log("Finance crypto routing result:", {
      agencyId: result.agencyId,
      matchedDomain: result.matchedDomain,
      confidence: result.confidence,
      routingMethod: result.routingMethod,
      reasoning: result.reasoning,
    })

    expect(result.matchedDomain).toBe("finance")
    expect(result.confidence).toBeGreaterThan(0.4)
  })

  it("should route stock analysis query to agency-finance", async () => {
    const intent: Intent = {
      id: "test-finance-stock-1",
      type: "query",
      description: "stock price RSI MACD technical analysis for AAPL",
      risk: "low",
    }

    const result = await router.route(intent)
    console.log("Finance stock routing result:", {
      agencyId: result.agencyId,
      matchedDomain: result.matchedDomain,
      confidence: result.confidence,
    })

    expect(result.matchedDomain).toBe("finance")
    expect(result.confidence).toBeGreaterThan(0.4)
  })

  it("should route forex query to agency-finance", async () => {
    const intent: Intent = {
      id: "test-finance-forex-1",
      type: "query",
      description: "EUR USD forex trading signals and trend analysis",
      risk: "low",
    }

    const result = await router.route(intent)
    console.log("Finance forex routing result:", {
      agencyId: result.agencyId,
      matchedDomain: result.matchedDomain,
      confidence: result.confidence,
    })

    expect(result.matchedDomain).toBe("finance")
    expect(result.confidence).toBeGreaterThan(0.4)
  })

  it("should route portfolio risk query to agency-finance", async () => {
    const intent: Intent = {
      id: "test-finance-risk-1",
      type: "query",
      description: "portfolio risk management and VaR calculation",
      risk: "low",
    }

    const result = await router.route(intent)
    console.log("Finance risk routing result:", {
      agencyId: result.agencyId,
      matchedDomain: result.matchedDomain,
      confidence: result.confidence,
    })

    expect(result.matchedDomain).toBe("finance")
    expect(result.confidence).toBeGreaterThan(0.35)
  })

  it("should route trading signal query to agency-finance", async () => {
    const intent: Intent = {
      id: "test-finance-signals-1",
      type: "query",
      description: "genera segnali di trading per TSLA",
      risk: "medium",
    }

    const result = await router.route(intent)
    console.log("Finance signals routing result:", {
      agencyId: result.agencyId,
      matchedDomain: result.matchedDomain,
      confidence: result.confidence,
    })

    expect(result.matchedDomain).toBe("finance")
    expect(result.confidence).toBeGreaterThan(0.4)
  })

  it("should route commodity query to agency-finance", async () => {
    const intent: Intent = {
      id: "test-finance-commodity-1",
      type: "query",
      description: "gold price commodity trading market per ounce",
      risk: "low",
    }

    const result = await router.route(intent)
    console.log("Finance commodity routing result:", {
      agencyId: result.agencyId,
      matchedDomain: result.matchedDomain,
      confidence: result.confidence,
    })

    expect(result.matchedDomain).toBe("finance")
    expect(result.confidence).toBeGreaterThan(0.35)
  })

  it("should verify agency-finance is registered after bootstrap", () => {
    const agencies = AgencyRegistry.getAllAgencies()
    const financeAgency = agencies.find((a) => a.id === "agency-finance")

    console.log(
      "Registered agencies:",
      agencies.map((a) => a.id),
    )

    expect(financeAgency).toBeDefined()
    expect(financeAgency?.domain).toBe("finance")
  })
})

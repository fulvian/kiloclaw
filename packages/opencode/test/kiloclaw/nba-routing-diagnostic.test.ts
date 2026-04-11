// NBA Routing Diagnostic Test

import { describe, it, expect } from "bun:test"
import { HybridRouter, type HybridIntentRouter } from "../../src/kiloclaw/agency/routing/semantic/hybrid-router"
import { AgencyRegistry } from "../../src/kiloclaw/agency/registry/agency-registry"
import { bootstrapRegistries } from "../../src/kiloclaw/agency/bootstrap"
import type { Intent } from "../../src/kiloclaw/agency/routing/semantic"

describe("NBA Routing Diagnostic", () => {
  it("should show all registered agencies before bootstrap", () => {
    const agencies = AgencyRegistry.getAllAgencies()
    console.log(
      "Agencies before bootstrap:",
      agencies.map((a) => a.id),
    )
  })

  it("should route NBA query to agency-nba after bootstrap", async () => {
    // First bootstrap the registries
    bootstrapRegistries()

    const agencies = AgencyRegistry.getAllAgencies()
    console.log(
      "Agencies after bootstrap:",
      agencies.map((a) => a.id),
    )

    // Create router and test NBA query
    HybridRouter.reset()
    const router = HybridRouter.create()

    const intent: Intent = {
      id: "test-nba-1",
      type: "query",
      description: "analizza partite NBA per questa notte",
      risk: "low",
    }

    const result = await router.route(intent)
    console.log("NBA routing result:", {
      agencyId: result.agencyId,
      matchedDomain: result.matchedDomain,
      confidence: result.confidence,
      routingMethod: result.routingMethod,
      reasoning: result.reasoning,
    })

    expect(result.agencyId).toBe("agency-nba" as any)
  })

  it("should route NBA query with betting keywords", async () => {
    bootstrapRegistries()
    HybridRouter.reset()
    const router = HybridRouter.create()

    const intent: Intent = {
      id: "test-nba-2",
      type: "query",
      description: "analizza quote scommesse NBA e trova value betting",
      risk: "low",
    }

    const result = await router.route(intent)
    console.log("NBA betting routing result:", {
      agencyId: result.agencyId,
      matchedDomain: result.matchedDomain,
      confidence: result.confidence,
      routingMethod: result.routingMethod,
    })

    expect(result.matchedDomain).toBe("nba")
  })
})

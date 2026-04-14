// Travel Routing Diagnostic Test

import { describe, it, expect } from "bun:test"
import { HybridRouter, type HybridIntentRouter } from "../../src/kiloclaw/agency/routing/semantic/hybrid-router"
import { AgencyRegistry } from "../../src/kiloclaw/agency/registry/agency-registry"
import { bootstrapRegistries } from "../../src/kiloclaw/agency/bootstrap"
import type { Intent } from "../../src/kiloclaw/agency/routing/semantic"

describe("Travel Routing Diagnostic", () => {
  it("should show all registered agencies before bootstrap", () => {
    const agencies = AgencyRegistry.getAllAgencies()
    console.log(
      "Agencies before bootstrap:",
      agencies.map((a) => a.id),
    )
  })

  it("should route travel query to agency-travel after bootstrap", async () => {
    // First bootstrap the registries
    bootstrapRegistries()

    const agencies = AgencyRegistry.getAllAgencies()
    console.log(
      "Agencies after bootstrap:",
      agencies.map((a) => a.id),
    )

    // Create router and test travel query
    HybridRouter.reset()
    const router = HybridRouter.create()

    const intent: Intent = {
      id: "test-travel-1",
      type: "query",
      description: "organizza un weekend a Lisbona con volo+hotel e attività culturali",
      risk: "low",
    }

    const result = await router.route(intent)
    console.log("Travel routing result:", {
      agencyId: result.agencyId,
      matchedDomain: result.matchedDomain,
      confidence: result.confidence,
      routingMethod: result.routingMethod,
      reasoning: result.reasoning,
    })

    expect(result.agencyId).toBe("agency-travel" as any)
    expect(result.matchedDomain).toBe("travel")
    expect(result.confidence).toBeGreaterThanOrEqual(0.4)
  })

  it("should route travel query with flight keywords", async () => {
    bootstrapRegistries()
    HybridRouter.reset()
    const router = HybridRouter.create()

    const intent: Intent = {
      id: "test-travel-2",
      type: "query",
      description: "cerca voli economici da Roma a Londra per il prossimo weekend",
      risk: "low",
    }

    const result = await router.route(intent)
    console.log("Travel flight routing result:", {
      agencyId: result.agencyId,
      matchedDomain: result.matchedDomain,
      confidence: result.confidence,
    })

    expect(result.matchedDomain).toBe("travel")
    expect(result.confidence).toBeGreaterThanOrEqual(0.3)
  })

  it("should route travel query with hotel keywords", async () => {
    bootstrapRegistries()
    HybridRouter.reset()
    const router = HybridRouter.create()

    const intent: Intent = {
      id: "test-travel-3",
      type: "query",
      description: "trova hotel 4 stelle con parcheggio a Barcellona centro",
      risk: "low",
    }

    const result = await router.route(intent)
    console.log("Travel hotel routing result:", {
      agencyId: result.agencyId,
      matchedDomain: result.matchedDomain,
      confidence: result.confidence,
    })

    expect(result.matchedDomain).toBe("travel")
  })

  it("should route travel query with itinerary keywords", async () => {
    bootstrapRegistries()
    HybridRouter.reset()
    const router = HybridRouter.create()

    const intent: Intent = {
      id: "test-travel-4",
      type: "query",
      description: "crea itinerario di 5 giorni a Tokyo con trasporti locali",
      risk: "low",
    }

    const result = await router.route(intent)
    console.log("Travel itinerary routing result:", {
      agencyId: result.agencyId,
      matchedDomain: result.matchedDomain,
      confidence: result.confidence,
    })

    expect(result.matchedDomain).toBe("travel")
    expect(result.confidence).toBeGreaterThanOrEqual(0.3)
  })

  it("should NOT route development query to travel agency", async () => {
    bootstrapRegistries()
    HybridRouter.reset()
    const router = HybridRouter.create()

    const intent: Intent = {
      id: "test-dev-1",
      type: "query",
      description: "scrivi una funzione TypeScript per calcolare fattoriale",
      risk: "low",
    }

    const result = await router.route(intent)
    console.log("Development query result:", {
      agencyId: result.agencyId,
      matchedDomain: result.matchedDomain,
      confidence: result.confidence,
    })

    // Should NOT route to travel
    expect(result.agencyId).not.toBe("agency-travel")
  })
})

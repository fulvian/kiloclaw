import { describe, expect, test } from "bun:test"
import { Router } from "@/kiloclaw/router"

describe("kiloclaw.router typo tolerance", () => {
  test("routes italian typo search query to knowledge domain", async () => {
    const router = Router.create({})

    const result = await router.route({
      id: "intent-typo-001",
      type: "chat",
      description: "ricrca annunci macbook pro usato a milano",
      risk: "low",
    })

    expect(result.matchedDomain).toBe("knowledge")
    expect(String(result.agencyId)).toBe("agency-knowledge")
    expect(result.confidence).toBeGreaterThan(0)
  })
})

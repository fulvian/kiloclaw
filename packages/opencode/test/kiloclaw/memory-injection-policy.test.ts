import { describe, expect, it } from "bun:test"
import { MemoryInjectionPolicy } from "@/kiloclaw/memory"

describe("MemoryInjectionPolicy", () => {
  it("returns coherent policy envelope", () => {
    const low = MemoryInjectionPolicy.decide({
      confidence: 0.45,
      text: "what did we discuss before",
    })
    expect(low.maxItemsPerLayer).toBeGreaterThan(0)
    expect(low.maxHits).toBeGreaterThan(0)

    const high = MemoryInjectionPolicy.decide({
      confidence: 0.9,
      text: "di cosa abbiamo discusso nelle ultime 10 sessioni e quali feedback ho dato negli ultimi giorni",
    })
    expect(high.maxItemsPerLayer).toBeGreaterThan(0)
    expect(high.maxHits).toBeGreaterThan(0)
  })
})

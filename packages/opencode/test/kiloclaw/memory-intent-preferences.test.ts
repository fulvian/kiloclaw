import { describe, expect, it } from "bun:test"
import { MemoryIntent, MemoryRecallPolicy } from "@/kiloclaw/memory"

describe("Memory intent preference reuse", () => {
  it("classifies taste-based italian request as preference_reuse", async () => {
    const out = await MemoryIntent.classify("consigliami qualche nuova serie tv sulla base dei miei gusti")
    expect(out.kind).toBe("preference_reuse")
    expect(out.lang === "it" || out.lang === "mixed").toBeTrue()
  })

  it("forces recall for explicit preference reuse phrases", async () => {
    const out = await MemoryRecallPolicy.evaluate("consigliami qualche nuova serie tv in base ai miei gusti")
    expect(out.decision).toBe("recall")
    expect(out.confidence).toBeGreaterThanOrEqual(0.7)
  })

  it("classifies explicit recent-history question as explicit recall", async () => {
    const out = await MemoryIntent.classify("di cosa abbiamo discusso ultimamente?")
    expect(out.kind).toBe("explicit_recall")
  })

  it("recalls for explicit recent-history question", async () => {
    const out = await MemoryRecallPolicy.evaluate("di cosa abbiamo discusso ultimamente?")
    expect(out.decision).toBe("recall")
  })
})

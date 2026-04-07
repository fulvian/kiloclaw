import { describe, expect, it } from "bun:test"
import { MemoryRecallPolicy } from "@/kiloclaw/memory"

describe("MemoryRecallPolicy", () => {
  it("classifies 'nostra recente conversazione' as recall (Italian conversational reference)", async () => {
    // This is the exact phrasing the user used that was NOT triggering recall before the fix
    const text =
      "rispetto alla nostra recente conversazione su una scheda madre per pc che supportasse 4 gpu in parallelo"
    const out = await MemoryRecallPolicy.evaluate(text)
    console.log("DEBUG recall eval:", JSON.stringify(out, null, 2))
    console.log("DEBUG text has conversazione:", /conversaz/i.test(text))
    console.log("DEBUG text has session:", /(session|sessioni|conversaz)/i.test(text))
    expect(out.decision).toBeOneOf(["recall", "shadow"])
    expect(out.intent.kind).toBe("explicit_recall")
    expect(out.intent.lang).toBe("it")
    expect(out.confidence).toBeGreaterThan(0.3)
  })

  it("classifies 'nostra conversazione' with context as recall", async () => {
    const out = await MemoryRecallPolicy.evaluate("rispetto alla nostra conversazione precedente riguardo le gpu")
    expect(out.decision).toBeOneOf(["recall", "shadow"])
    expect(out.intent.kind === "explicit_recall" || out.intent.kind === "project_context").toBeTrue()
  })

  it("classifies explicit italian recall as recall or shadow", async () => {
    const out = await MemoryRecallPolicy.evaluate(
      "di cosa abbiamo discusso nelle ultime 10 sessioni e quale feedback ho dato?",
    )
    expect(["recall", "shadow"]).toContain(out.decision)
    expect(out.intent.kind).toBe("explicit_recall")
    expect(out.intent.lang === "it" || out.intent.lang === "mixed").toBeTrue()
    expect(out.confidence).toBeGreaterThan(0.3)
  })

  it("classifies explicit english recall as recall or shadow", async () => {
    const out = await MemoryRecallPolicy.evaluate(
      "what did we discuss in the last sessions and what feedback did I give?",
    )
    expect(["recall", "shadow"]).toContain(out.decision)
    expect(out.intent.kind).toBe("explicit_recall")
    expect(out.intent.lang === "en" || out.intent.lang === "mixed").toBeTrue()
  })

  it("keeps direct coding request as skip or low-confidence shadow", async () => {
    const out = await MemoryRecallPolicy.evaluate("fix lint errors in src/index.ts")
    expect(["skip", "shadow"]).toContain(out.decision)
    expect(out.intent.kind === "none" || out.intent.kind === "project_context").toBeTrue()
    expect(out.confidence).toBeLessThan(0.7)
  })
})

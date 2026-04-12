import { describe, expect, it } from "bun:test"
import { NbaBudgeting } from "@/kiloclaw/agency/nba/budgeting"
import type { NbaToolMetadata } from "@/kiloclaw/agency/nba/budgeting"

const tools: NbaToolMetadata[] = [
  {
    id: "tool-a",
    domain: "nba",
    capability: "odds_markets",
    risk: "low",
    provider: "p1",
    tokenSize: 100,
    latencyClass: "fast",
    quotaCost: 3,
    relevanceScore: 0.8,
  },
  {
    id: "tool-b",
    domain: "nba",
    capability: "odds_markets",
    risk: "low",
    provider: "p1",
    tokenSize: 120,
    latencyClass: "fast",
    quotaCost: 1,
    relevanceScore: 0.8,
  },
  {
    id: "tool-c",
    domain: "nba",
    capability: "stake_sizing",
    risk: "high",
    provider: "p2",
    tokenSize: 90,
    latencyClass: "medium",
    quotaCost: 2,
    relevanceScore: 0.9,
  },
  {
    id: "tool-d",
    domain: "nba",
    capability: "probability_estimation",
    risk: "medium",
    provider: "p2",
    tokenSize: 80,
    latencyClass: "slow",
    quotaCost: 2,
    relevanceScore: 0.7,
  },
]

describe("nba budgeting", () => {
  it("enforces normal/deep caps", () => {
    const many = Array.from({ length: 20 }, (_, idx) => ({
      id: `t-${idx}`,
      domain: "nba",
      capability: "odds_markets",
      risk: "low" as const,
      provider: "p",
      tokenSize: 10,
      latencyClass: "fast" as const,
      quotaCost: idx + 1,
      relevanceScore: 1 - idx / 100,
    }))

    const normal = NbaBudgeting.select({
      mode: "normal",
      tools: many,
      requestedCapabilities: ["odds_markets"],
      policyByCapability: { odds_markets: "SAFE" },
    })

    const deep = NbaBudgeting.select({
      mode: "deep",
      tools: many,
      requestedCapabilities: ["odds_markets"],
      policyByCapability: { odds_markets: "SAFE" },
    })

    expect(normal.selected.length).toBe(7)
    expect(deep.selected.length).toBe(12)
  })

  it("uses quotaCost as tie-break for equal relevance", () => {
    const out = NbaBudgeting.select({
      mode: "normal",
      tools,
      requestedCapabilities: ["odds_markets"],
      policyByCapability: { odds_markets: "SAFE" },
    })

    expect(out.selected[0]?.id).toBe("tool-b")
    expect(out.selected[1]?.id).toBe("tool-a")
  })

  it("filters denied capability", () => {
    const out = NbaBudgeting.select({
      mode: "normal",
      tools,
      requestedCapabilities: ["odds_markets", "stake_sizing"],
      policyByCapability: {
        odds_markets: "SAFE",
        stake_sizing: "DENY",
      },
    })

    const ids = out.selected.map((item) => item.id)
    expect(ids.includes("tool-c")).toBeFalse()
    expect(out.metrics.droppedReasons.policy_denied).toBe(1)
  })

  it("is deterministic and reports metrics", () => {
    const input = {
      mode: "normal" as const,
      tools,
      requestedCapabilities: ["odds_markets", "stake_sizing", "probability_estimation"],
      policyByCapability: {
        odds_markets: "SAFE",
        stake_sizing: "CONFIRM",
        probability_estimation: "NOTIFY",
      } as const,
    }

    const first = NbaBudgeting.select(input)
    const second = NbaBudgeting.select(input)

    expect(first.selected.map((item) => item.id)).toEqual(second.selected.map((item) => item.id))
    expect(first.metrics.selectedCount).toBe(first.selected.length)
    expect(first.metrics.estimatedTokens).toBeGreaterThan(0)
    expect(first.metrics.estimatedQuotaCost).toBeGreaterThan(0)
  })
})

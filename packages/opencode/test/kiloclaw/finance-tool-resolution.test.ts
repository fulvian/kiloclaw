// Finance Tool Resolution Test
// Verifies that L3 tool resolution correctly handles Finance provider tools

import { describe, it, expect } from "bun:test"
import { RoutingPipeline } from "../../src/kiloclaw/agency/routing/pipeline"
import { bootstrapRegistries } from "../../src/kiloclaw/agency/bootstrap"

describe("Finance Tool Resolution (L3)", () => {
  it("should resolve Finance provider tools for price.current capability", async () => {
    bootstrapRegistries()

    const l3Result = await RoutingPipeline.resolveTools("agency-finance", "finance-analysis")

    console.log("L3 Result for Finance agency:", {
      toolsRequested: l3Result.toolsRequested,
      toolsResolved: l3Result.toolsResolved,
      deniedTools: l3Result.deniedTools,
    })

    // Verify that Finance provider tools are in the allowlist
    expect(l3Result.deniedTools).toHaveLength(0)
    expect(l3Result.toolsResolved).toBeGreaterThan(0)
  })

  it("should include provider adapters in Finance tool allowlist", async () => {
    bootstrapRegistries()

    const financeProviderTools = [
      "twelve_data.prices",
      "polygon.quotes",
      "finnhub.quote",
      "fmp.fundamentals",
      "fred.data",
      "skill",
    ]

    const l3Result = await RoutingPipeline.resolveTools("agency-finance", undefined, undefined, financeProviderTools)

    console.log("Finance provider tools test:", {
      requested: financeProviderTools,
      resolved: l3Result.toolsResolved,
      denied: l3Result.deniedTools,
    })

    // All Finance tools should be resolved
    expect(l3Result.toolsResolved).toBe(financeProviderTools.length)
    expect(l3Result.deniedTools).toHaveLength(0)
  })

  it("should NOT include websearch/webfetch in Finance tool allowlist", async () => {
    bootstrapRegistries()

    // Finance doesn't use generic web tools
    const websearchResult = await RoutingPipeline.resolveTools("agency-finance", undefined, undefined, ["websearch"])
    expect(websearchResult.deniedTools).toContain("websearch")

    const webfetchResult = await RoutingPipeline.resolveTools("agency-finance", undefined, undefined, ["webfetch"])
    expect(webfetchResult.deniedTools).toContain("webfetch")

    console.log("Generic tools denied for Finance ✅")
  })

  it("should maintain deny-by-default for unknown Finance tools", async () => {
    bootstrapRegistries()

    const result = await RoutingPipeline.resolveTools("agency-finance", undefined, undefined, [
      "unknown.provider",
      "fake.data",
    ])

    expect(result.deniedTools).toContain("unknown.provider")
    expect(result.deniedTools).toContain("fake.data")

    console.log("Unknown tools denied ✅")
  })

  it("should allow all Finance provider adapters", async () => {
    bootstrapRegistries()

    const allFinanceTools = [
      "twelve_data.prices",
      "twelve_data.history",
      "polygon.quotes",
      "polygon.history",
      "polygon.orderbook",
      "alpha_vantage.history",
      "finnhub.quote",
      "finnhub.fundamentals",
      "finnhub.orderbook",
      "finnhub.news",
      "fmp.fundamentals",
      "fmp.filings",
      "fmp.macro",
      "fmp.news",
      "fred.data",
      "skill",
    ]

    for (const tool of allFinanceTools) {
      const l3Result = await RoutingPipeline.resolveTools("agency-finance", undefined, undefined, [tool])
      expect(l3Result.deniedTools).not.toContain(tool, `Tool ${tool} should not be denied`)
    }

    console.log(`All ${allFinanceTools.length} Finance tools allowed ✅`)
  })
})

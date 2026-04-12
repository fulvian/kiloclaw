import { describe, expect, it } from "bun:test"
import { evaluateNbaRolloutGate } from "@/kiloclaw/agency/nba/gates"

describe("nba gates", () => {
  it("returns go when all metrics pass", () => {
    const report = evaluateNbaRolloutGate({
      slateCoverage: 0.97,
      signalPrecisionAt5pctEdge: 0.56,
      staleDataBlockRate: 1,
      policyViolationEscapeRate: 0,
      toolSchemaTokensDeltaPct: -0.4,
      p95LatencySeconds: 6.8,
      availability7d: 0.998,
      latencyBreachOver30m: false,
    })

    expect(report.overall).toBe("pass")
    expect(report.recommendation).toBe("go")
    expect(report.rollbackTriggers).toEqual([])
  })

  it("returns canary_only on non-critical misses without rollback trigger", () => {
    const report = evaluateNbaRolloutGate({
      slateCoverage: 0.97,
      signalPrecisionAt5pctEdge: 0.54,
      staleDataBlockRate: 1,
      policyViolationEscapeRate: 0,
      toolSchemaTokensDeltaPct: -0.2,
      p95LatencySeconds: 6.8,
      availability7d: 0.999,
      latencyBreachOver30m: false,
    })

    expect(report.overall).toBe("fail")
    expect(report.recommendation).toBe("canary_only")
    expect(report.rollbackTriggers).toEqual([])
    expect(report.perMetric.signalPrecisionAt5pctEdge.pass).toBeFalse()
    expect(report.perMetric.toolSchemaTokensDeltaPct.pass).toBeFalse()
  })

  it("returns no_go and rollback triggers for policy violation", () => {
    const report = evaluateNbaRolloutGate({
      slateCoverage: 0.99,
      signalPrecisionAt5pctEdge: 0.62,
      staleDataBlockRate: 1,
      policyViolationEscapeRate: 0.02,
      toolSchemaTokensDeltaPct: -0.5,
      p95LatencySeconds: 5,
      availability7d: 0.999,
      latencyBreachOver30m: false,
    })

    expect(report.recommendation).toBe("no_go")
    expect(report.rollbackTriggers).toContain("policy_violation_escape")
  })

  it("returns no_go and rollback triggers for stale block failures", () => {
    const report = evaluateNbaRolloutGate({
      slateCoverage: 0.99,
      signalPrecisionAt5pctEdge: 0.62,
      staleDataBlockRate: 0.98,
      policyViolationEscapeRate: 0,
      toolSchemaTokensDeltaPct: -0.5,
      p95LatencySeconds: 5,
      availability7d: 0.999,
      latencyBreachOver30m: false,
    })

    expect(report.recommendation).toBe("no_go")
    expect(report.rollbackTriggers).toContain("stale_data_bypass")
  })

  it("returns no_go and rollback triggers for sustained latency breach", () => {
    const report = evaluateNbaRolloutGate({
      slateCoverage: 0.99,
      signalPrecisionAt5pctEdge: 0.62,
      staleDataBlockRate: 1,
      policyViolationEscapeRate: 0,
      toolSchemaTokensDeltaPct: -0.5,
      p95LatencySeconds: 7.8,
      availability7d: 0.999,
      latencyBreachOver30m: true,
    })

    expect(report.recommendation).toBe("no_go")
    expect(report.rollbackTriggers).toContain("sustained_latency_breach")
  })
})

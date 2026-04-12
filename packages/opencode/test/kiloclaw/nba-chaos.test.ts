import { describe, expect, it } from "bun:test"
import { evaluateNbaChaosScenario } from "@/kiloclaw/agency/nba/chaos"

describe("nba chaos", () => {
  it("blocks recommendations when odds are stale", () => {
    const out = evaluateNbaChaosScenario({
      multiProviderOutage: false,
      quotaExhausted: false,
      staleOdds: true,
      missingInjuryFeed: false,
      recommendationAllowed: true,
      degradedMode: false,
      safeMode: false,
      confidencePenaltyApplied: false,
      noBetFlag: false,
    })

    expect(out.pass).toBeFalse()
    expect(out.violations).toContain("stale_odds_recommendation_allowed")
  })

  it("requires degraded or safe mode for outage and quota exhaustion", () => {
    const outage = evaluateNbaChaosScenario({
      multiProviderOutage: true,
      quotaExhausted: false,
      staleOdds: false,
      missingInjuryFeed: false,
      recommendationAllowed: false,
      degradedMode: false,
      safeMode: false,
      confidencePenaltyApplied: false,
      noBetFlag: false,
    })

    const quota = evaluateNbaChaosScenario({
      multiProviderOutage: false,
      quotaExhausted: true,
      staleOdds: false,
      missingInjuryFeed: false,
      recommendationAllowed: false,
      degradedMode: false,
      safeMode: false,
      confidencePenaltyApplied: false,
      noBetFlag: false,
    })

    expect(outage.pass).toBeFalse()
    expect(outage.violations).toContain("unsafe_mode_during_outage_or_quota")
    expect(quota.pass).toBeFalse()
    expect(quota.violations).toContain("unsafe_mode_during_outage_or_quota")
  })

  it("requires confidence penalty or no_bet when injury feed is missing", () => {
    const violated = evaluateNbaChaosScenario({
      multiProviderOutage: false,
      quotaExhausted: false,
      staleOdds: false,
      missingInjuryFeed: true,
      recommendationAllowed: false,
      degradedMode: false,
      safeMode: false,
      confidencePenaltyApplied: false,
      noBetFlag: false,
    })

    const guarded = evaluateNbaChaosScenario({
      multiProviderOutage: false,
      quotaExhausted: false,
      staleOdds: false,
      missingInjuryFeed: true,
      recommendationAllowed: false,
      degradedMode: false,
      safeMode: false,
      confidencePenaltyApplied: true,
      noBetFlag: false,
    })

    expect(violated.pass).toBeFalse()
    expect(violated.violations).toContain("missing_injury_feed_without_guardrail")
    expect(guarded.pass).toBeTrue()
    expect(guarded.violations).toEqual([])
  })
})

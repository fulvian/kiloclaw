import { describe, it, expect } from "bun:test"
import {
  SignalSchema,
  RecommendationSchema,
  hasVigRemovalPreconditions,
  shouldBlockStaleRecommendation,
} from "@/kiloclaw/agency/nba/schema"

describe("nba schema", () => {
  it("enforces confidence cap <= 0.95", () => {
    const signal = SignalSchema.parse({
      signal_id: "sig-1",
      game_id: "game-1",
      market: "h2h",
      model_probability: 0.6,
      fair_implied_probability: 0.5,
      edge: 0.1,
      value_flag: true,
      confidence: 0.99,
      calibration_bucket: "0.9-1.0",
      stale_blocked: false,
      freshness_state: "fresh",
      freshness_seconds: 45,
      collected_at_utc: new Date().toISOString(),
    })

    const rec = RecommendationSchema.parse({
      recommendation_id: "rec-1",
      signal_id: "sig-1",
      action: "lean_home",
      rationale: "edge above threshold",
      confidence: 0.98,
      constraints: {
        hitl_required: true,
        max_stake_pct: 0.01,
      },
      policy_level: "CONFIRM",
      emitted_at_utc: new Date().toISOString(),
    })

    expect(signal.confidence).toBe(0.95)
    expect(rec.confidence).toBe(0.95)
  })

  it("enforces mandatory fields", () => {
    const result = SignalSchema.safeParse({
      signal_id: "sig-1",
      game_id: "game-1",
      market: "h2h",
    })

    expect(result.success).toBeFalse()
  })

  it("blocks stale recommendation when critical dataset is stale", () => {
    expect(
      shouldBlockStaleRecommendation({
        odds: { freshness_seconds: 121, max_freshness_seconds: 120 },
      }),
    ).toBeTrue()

    expect(
      shouldBlockStaleRecommendation({
        odds: { freshness_seconds: 90, max_freshness_seconds: 120 },
      }),
    ).toBeFalse()
  })

  it("checks vig-removal preconditions", () => {
    expect(hasVigRemovalPreconditions([0.55, 0.5])).toBeTrue()
    expect(hasVigRemovalPreconditions([0, 1])).toBeFalse()
    expect(hasVigRemovalPreconditions([0.5])).toBeFalse()
  })
})

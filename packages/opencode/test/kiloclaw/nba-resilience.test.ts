import { describe, expect, it } from "bun:test"
import {
  Agency2ProviderCall,
  NbaCircuitBreaker,
  NbaProviderCallSchema,
  PARLAY_MAX_AGE_SECONDS,
  assessFreshness,
  classifyProviderError,
  computeBackoffMs,
  selectMarketPlan,
} from "@/kiloclaw/agency/nba/resilience"

describe("nba resilience", () => {
  it("assesses freshness per source ttl", () => {
    expect(assessFreshness("odds_api", 60).state).toBe("fresh")
    expect(assessFreshness("odds_api", 61).state).toBe("stale")
    expect(assessFreshness("parlay", PARLAY_MAX_AGE_SECONDS).state).toBe("fresh")
    expect(assessFreshness("parlay", PARLAY_MAX_AGE_SECONDS + 1).state).toBe("stale")
    expect(assessFreshness("polymarket", 60).state).toBe("fresh")
    expect(assessFreshness("polymarket", 61).state).toBe("stale")
    expect(assessFreshness("espn_injuries", 3601).state).toBe("stale")
    expect(assessFreshness("nba_api_advanced", 3600).state).toBe("fresh")
  })

  it("classifies provider errors", () => {
    expect(classifyProviderError(401)).toBe("auth_error")
    expect(classifyProviderError(403)).toBe("auth_error")
    expect(classifyProviderError(429)).toBe("rate_limited")
    expect(classifyProviderError(503)).toBe("transient_error")
    expect(classifyProviderError(undefined, "ETIMEDOUT")).toBe("transient_error")
    expect(classifyProviderError(404)).toBe("fatal_error")
  })

  it("computes bounded increasing backoff", () => {
    const opts = { baseMs: 100, maxMs: 1000, jitterMs: 0 }
    const first = computeBackoffMs(0, opts)
    const second = computeBackoffMs(1, opts)
    const third = computeBackoffMs(2, opts)
    const cap = computeBackoffMs(9, opts)

    expect(first).toBe(100)
    expect(second).toBe(200)
    expect(third).toBe(400)
    expect(cap).toBe(1000)
  })

  it("supports deterministic jitter with seed", () => {
    const opts = { baseMs: 500, maxMs: 2000, jitterMs: 100 }
    const first = computeBackoffMs(2, opts, 42)
    const second = computeBackoffMs(2, opts, 42)
    const other = computeBackoffMs(2, opts, 7)

    expect(first).toBe(second)
    expect(first).not.toBe(other)
    expect(first).toBeGreaterThanOrEqual(0)
    expect(first).toBeLessThanOrEqual(2000)
  })

  it("runs closed -> open -> half_open -> closed", () => {
    const breaker = NbaCircuitBreaker.create({
      failureThreshold: 2,
      halfOpenAfterMs: 1000,
      successThreshold: 2,
    })

    expect(breaker.allow("odds", 0)).toBeTrue()
    breaker.recordFailure("odds", 10)
    expect(breaker.state("odds").state).toBe("closed")

    breaker.recordFailure("odds", 20)
    expect(breaker.state("odds").state).toBe("open")
    expect(breaker.allow("odds", 500)).toBeFalse()

    expect(breaker.allow("odds", 1200)).toBeTrue()
    expect(breaker.state("odds").state).toBe("half_open")

    breaker.recordSuccess("odds", 1210)
    expect(breaker.state("odds").state).toBe("half_open")
    breaker.recordSuccess("odds", 1220)
    expect(breaker.state("odds").state).toBe("closed")
  })

  it("reopens from half_open on failure", () => {
    const breaker = NbaCircuitBreaker.create({
      failureThreshold: 1,
      halfOpenAfterMs: 100,
      successThreshold: 1,
    })

    breaker.recordFailure("injuries", 0)
    expect(breaker.state("injuries").state).toBe("open")
    expect(breaker.allow("injuries", 200)).toBeTrue()
    expect(breaker.state("injuries").state).toBe("half_open")

    breaker.recordFailure("injuries", 210)
    expect(breaker.state("injuries").state).toBe("open")
  })

  it("selects full/degraded/safe market plans", () => {
    const full = selectMarketPlan({
      remainingQuota: 100,
      requestedMarkets: ["h2h", "spreads", "totals"],
      requestedRegions: ["us", "eu"],
      minReserve: 5,
    })

    const degraded = selectMarketPlan({
      remainingQuota: 100,
      requestedMarkets: ["h2h", "spreads", "totals"],
      requestedRegions: ["us", "eu"],
      minReserve: 5,
      rateLimited: true,
    })

    const safe = selectMarketPlan({
      remainingQuota: 2,
      requestedMarkets: ["h2h", "spreads", "totals"],
      requestedRegions: ["us", "eu"],
      minReserve: 5,
    })

    expect(full.mode).toBe("full")
    expect(full.markets).toEqual(["h2h", "spreads", "totals"])
    expect(full.regions).toEqual(["us", "eu"])

    expect(degraded.mode).toBe("degraded")
    expect(degraded.markets).toEqual(["h2h"])
    expect(degraded.regions).toEqual(["us"])

    expect(safe.mode).toBe("safe")
    expect(safe.markets).toEqual(["h2h"])
    expect(safe.regions).toEqual(["us"])
  })

  it("validates provider call telemetry payload", () => {
    const parsed = NbaProviderCallSchema.parse({
      provider: "odds_api",
      endpoint: "/v4/sports/basketball_nba/odds",
      latencyMs: 89,
      status: 200,
      quotaCost: 1,
      retryCount: 0,
      outcomeCategory: "success",
    })

    expect(parsed.provider).toBe("odds_api")
    expect(Agency2ProviderCall.type).toBe("agency2.provider_call")
    expect(() => NbaProviderCallSchema.parse({ provider: "odds_api" })).toThrow()
  })
})

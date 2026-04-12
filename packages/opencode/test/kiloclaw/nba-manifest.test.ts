import { describe, it, expect } from "bun:test"
import { NbaAgency } from "@/kiloclaw/agency/manifests/nba-manifest"

describe("nba manifest policy", () => {
  it("maps canonical operations to expected policy", () => {
    expect(NbaAgency.getPolicy("schedule_live")).toBe("SAFE")
    expect(NbaAgency.getPolicy("probability_estimation")).toBe("NOTIFY")
    expect(NbaAgency.getPolicy("stake_sizing")).toBe("CONFIRM")
    expect(NbaAgency.getPolicy("auto_bet_execution")).toBe("DENY")
  })

  it("enforces deny-by-default for unknown operations", () => {
    expect(NbaAgency.getPolicy("unknown_capability")).toBe("DENY")
  })

  it("requires approval only for confirm operations", () => {
    expect(NbaAgency.requiresApproval("schedule_live")).toBeFalse()
    expect(NbaAgency.requiresApproval("probability_estimation")).toBeFalse()
    expect(NbaAgency.requiresApproval("stake_sizing")).toBeTrue()
    expect(NbaAgency.requiresApproval("auto_bet_execution")).toBeFalse()
  })

  it("normalizes aliases", () => {
    expect(NbaAgency.normalize("odds.markets")).toBe("odds_markets")
    expect(NbaAgency.normalize("Probability Estimation")).toBe("probability_estimation")
  })
})

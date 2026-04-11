import { describe, expect, it } from "bun:test"
import { NbaRuntime, type InjuryConfidenceInput } from "@/kiloclaw/agency/nba/runtime"

describe("nba runtime - injury confidence", () => {
  describe("computeAdjustedConfidence", () => {
    it("returns base confidence when no injuries provided", () => {
      const baseConfidence = 0.85
      const adjusted = NbaRuntime.computeAdjustedConfidence(baseConfidence)
      expect(adjusted).toBe(baseConfidence)
    })

    it("returns base confidence when injuries array is empty", () => {
      const baseConfidence = 0.85
      const input: InjuryConfidenceInput = { injuries: [] }
      const adjusted = NbaRuntime.computeAdjustedConfidence(baseConfidence, input)
      expect(adjusted).toBe(baseConfidence)
    })

    it("applies penalty for fresh injuries", () => {
      const baseConfidence = 0.85
      const injuries = [
        {
          injury_id: "inj-1",
          player_id: "player-1",
          player_name: "Test Player",
          team_id: "team-1",
          team_name: "Test Team",
          status: "out" as const,
          injury: "Ankle",
          description: "Sprained ankle",
          date: new Date().toISOString(),
          source: "balldontlie" as const,
          freshness_seconds: 1800, // 30 min old
          freshness_state: "fresh" as const,
          collected_at_utc: new Date().toISOString(),
        },
      ]

      const input: InjuryConfidenceInput = { injuries }
      const adjusted = NbaRuntime.computeAdjustedConfidence(baseConfidence, input)

      // Fresh injuries still get some penalty based on age ratio
      expect(adjusted).toBeLessThan(baseConfidence)
      // But penalty should be small for fresh data
      expect(adjusted).toBeGreaterThanOrEqual(0.7)
    })

    it("reduces confidence significantly for stale injuries", () => {
      const baseConfidence = 0.85
      const injuries = [
        {
          injury_id: "inj-1",
          player_id: "player-1",
          player_name: "Test Player",
          team_id: "team-1",
          team_name: "Test Team",
          status: "out" as const,
          injury: "Ankle",
          description: "Sprained ankle",
          date: new Date(Date.now() - 100000).toISOString(),
          source: "balldontlie" as const,
          freshness_seconds: 100000, // Very stale
          freshness_state: "stale" as const,
          collected_at_utc: new Date().toISOString(),
        },
      ]

      const input: InjuryConfidenceInput = { injuries }
      const adjusted = NbaRuntime.computeAdjustedConfidence(baseConfidence, input)

      // Stale injuries should reduce confidence noticeably
      expect(adjusted).toBeLessThan(baseConfidence * 0.8)
    })

    it("caps adjusted confidence at 0.95 (CONFIDENCE_CAP)", () => {
      const baseConfidence = 0.98 // Very high base
      const injuries = [
        {
          injury_id: "inj-1",
          player_id: "player-1",
          player_name: "Test Player",
          team_id: "team-1",
          team_name: "Test Team",
          status: "out" as const,
          injury: "Ankle",
          description: "Sprained ankle",
          date: new Date().toISOString(),
          source: "balldontlie" as const,
          freshness_seconds: 0,
          freshness_state: "fresh" as const,
          collected_at_utc: new Date().toISOString(),
        },
      ]

      const input: InjuryConfidenceInput = { injuries }
      const adjusted = NbaRuntime.computeAdjustedConfidence(baseConfidence, input)

      // Should be capped at 0.95
      expect(adjusted).toBeLessThanOrEqual(0.95)
    })
  })
})

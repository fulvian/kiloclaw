import { describe, it, expect } from "bun:test"
import { MemoryTierManager, MemoryTier, TIER_CONFIGS } from "@/kiloclaw/memory"

describe("Memory Tier Manager (BP-15)", () => {
  describe("MemoryTier enum", () => {
    it("should have all 5 tiers defined", () => {
      expect(MemoryTier.TIER_0_CONTEXT).toBe("tier0_context")
      expect(MemoryTier.TIER_1_WORKING).toBe("tier1_working")
      expect(MemoryTier.TIER_2_EPISODIC).toBe("tier2_episodic")
      expect(MemoryTier.TIER_3_SEMANTIC).toBe("tier3_semantic")
      expect(MemoryTier.TIER_4_PROCEDURAL).toBe("tier4_procedural")
    })
  })

  describe("TIER_CONFIGS", () => {
    it("should have configurations for all tiers", () => {
      expect(TIER_CONFIGS["tier0_context"]).toBeDefined()
      expect(TIER_CONFIGS["tier1_working"]).toBeDefined()
      expect(TIER_CONFIGS["tier2_episodic"]).toBeDefined()
      expect(TIER_CONFIGS["tier3_semantic"]).toBeDefined()
      expect(TIER_CONFIGS["tier4_procedural"]).toBeDefined()
    })

    it("should have correct tier 1 (working) configuration", () => {
      const config = TIER_CONFIGS["tier1_working"]
      expect(config.tier).toBe("tier1_working")
      expect(config.ttlMs).toBe(6 * 60 * 60 * 1000) // 6 hours
      expect(config.maxItems).toBe(100)
      expect(config.vectorEnabled).toBe(false)
      expect(config.persistence).toBe("sqlite")
    })

    it("should have correct tier 3 (semantic) configuration", () => {
      const config = TIER_CONFIGS["tier3_semantic"]
      expect(config.tier).toBe("tier3_semantic")
      expect(config.ttlMs).toBeNull() // No automatic expiry
      expect(config.maxItems).toBe(10000)
      expect(config.vectorEnabled).toBe(true)
    })

    it("should have tier 0 as non-persistent", () => {
      const config = TIER_CONFIGS["tier0_context"]
      expect(config.persistence).toBe("memory")
      expect(config.maxItems).toBe(0)
      expect(config.ttlMs).toBeNull()
    })
  })

  describe("classifyTier()", () => {
    it("should classify working layer correctly", () => {
      expect(MemoryTierManager.classifyTier("working")).toBe("tier1_working")
    })

    it("should classify episodic layer correctly", () => {
      expect(MemoryTierManager.classifyTier("episodic")).toBe("tier2_episodic")
    })

    it("should classify semantic layer correctly", () => {
      expect(MemoryTierManager.classifyTier("semantic")).toBe("tier3_semantic")
    })

    it("should classify procedural layer correctly", () => {
      expect(MemoryTierManager.classifyTier("procedural")).toBe("tier4_procedural")
    })

    it("should default unknown layers to episodic", () => {
      expect(MemoryTierManager.classifyTier("unknown")).toBe("tier2_episodic")
      expect(MemoryTierManager.classifyTier("")).toBe("tier2_episodic")
    })
  })

  describe("getTierInfo()", () => {
    it("should return tier configuration", () => {
      const info = MemoryTierManager.getTierInfo(MemoryTier.TIER_1_WORKING)
      expect(info.tier).toBe("tier1_working")
      expect(info.name).toBeDefined()
      expect(info.description).toBeDefined()
    })
  })

  describe("getAllTierConfigs()", () => {
    it("should return all 5 tier configurations", () => {
      const configs = MemoryTierManager.getAllTierConfigs()
      expect(configs.length).toBe(5)
    })
  })

  describe("getTierStats()", () => {
    it("should return stats for all tiers", async () => {
      const stats = await MemoryTierManager.getTierStats()
      expect(stats.length).toBe(4) // Tiers 1-4 have stats (tier 0 is not persisted)
      expect(stats[0].tier).toBe("tier1_working")
      expect(stats[0].count).toBeNumber()
      expect(stats[0].sizeBytes).toBeNumber()
      expect(stats[0].config).toBeDefined()
    })
  })

  describe("getTierHealth()", () => {
    it("should return health for all tiers", async () => {
      const health = await MemoryTierManager.getTierHealth()
      expect(health.length).toBe(4)
      for (const h of health) {
        expect(h.status).toMatch(/healthy|warning|critical/)
        expect(h.utilizationPercent).toBeNumber()
        expect(h.utilizationPercent).toBeGreaterThanOrEqual(0)
        expect(h.utilizationPercent).toBeLessThanOrEqual(100)
      }
    })
  })

  describe("getSummary()", () => {
    it("should return overall memory summary", async () => {
      const summary = await MemoryTierManager.getSummary()
      expect(summary.totalItems).toBeNumber()
      expect(summary.totalSizeBytes).toBeNumber()
      expect(summary.tiersAtRisk).toBeNumber()
      expect(summary.healthSummary).toBeString()
      expect(Array.isArray(summary.recommendations)).toBe(true)
    })
  })

  describe("checkTierHealth()", () => {
    it("should return health for specific tier", async () => {
      const health = await MemoryTierManager.checkTierHealth(MemoryTier.TIER_1_WORKING)
      expect(health.tier).toBe("tier1_working")
      expect(health.status).toMatch(/healthy|warning|critical/)
    })
  })

  describe("getRecommendedActions()", () => {
    it("should return actions for each tier", () => {
      const tiers = [
        MemoryTier.TIER_0_CONTEXT,
        MemoryTier.TIER_1_WORKING,
        MemoryTier.TIER_2_EPISODIC,
        MemoryTier.TIER_3_SEMANTIC,
        MemoryTier.TIER_4_PROCEDURAL,
      ]
      for (const tier of tiers) {
        const actions = MemoryTierManager.getRecommendedActions(tier)
        expect(Array.isArray(actions)).toBe(true)
        expect(actions.length).toBeGreaterThan(0)
      }
    })

    it("should recommend vector search for vector-enabled tiers", () => {
      const semanticActions = MemoryTierManager.getRecommendedActions(MemoryTier.TIER_3_SEMANTIC)
      expect(semanticActions.some((a) => a.includes("Vector"))).toBe(true)
    })
  })
})

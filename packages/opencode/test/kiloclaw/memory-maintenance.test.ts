import { describe, it, expect } from "bun:test"
import { MemoryMaintenance, type MaintenanceOptions } from "@/kiloclaw/memory"

describe("Memory Maintenance (BP-12)", () => {
  describe("getSchedule()", () => {
    it("should return 6 hour interval", () => {
      const schedule = MemoryMaintenance.getSchedule()
      expect(schedule.intervalMs).toBe(6 * 60 * 60 * 1000)
      expect(schedule.description).toBeDefined()
      expect(schedule.description.length).toBeGreaterThan(0)
    })
  })

  describe("healthCheck()", () => {
    it("should return health status", async () => {
      const health = await MemoryMaintenance.healthCheck()
      expect(health).toBeDefined()
      expect(health.healthy).toBeBoolean()
      expect(Array.isArray(health.warnings)).toBe(true)
      expect(health.stats).toBeDefined()
      expect(health.stats.totalFacts).toBeNumber()
      expect(health.stats.lowConfidenceFacts).toBeNumber()
      expect(health.stats.staleFacts).toBeNumber()
      expect(health.stats.duplicateGroups).toBeNumber()
    })
  })

  describe("run()", () => {
    it("should complete maintenance with dry run", async () => {
      const stats = await MemoryMaintenance.run({ dryRun: true } as MaintenanceOptions)
      expect(stats).toBeDefined()
      expect(stats.deduplicated).toBeNumber()
      expect(stats.deleted).toBeNumber()
      expect(stats.updated).toBeNumber()
      expect(stats.noop).toBeNumber()
      expect(stats.duration).toBeNumber()
      expect(Array.isArray(stats.errors)).toBe(true)
    })

    it("should accept maintenance options", async () => {
      const options: MaintenanceOptions = {
        deduplicateWindowMs: 24 * 60 * 60 * 1000,
        staleThresholdDays: 30,
        maxFactsPerSubject: 3,
        dryRun: true,
      }
      const stats = await MemoryMaintenance.run(options)
      expect(stats).toBeDefined()
      // Dry run should not delete anything
      expect(stats.deduplicated).toBe(0)
      expect(stats.deleted).toBe(0)
    })
  })
})

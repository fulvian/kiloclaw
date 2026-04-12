import { describe, it, expect } from "bun:test"
import {
  MemoryRetention,
  DEFAULT_RETENTION,
  isExpired,
  shouldRetain,
  computeExpiresAt,
  type RetentionPolicy,
} from "@/kiloclaw/memory"

describe("Memory Retention", () => {
  describe("DEFAULT_RETENTION", () => {
    it("should have policies for all layers", () => {
      expect(DEFAULT_RETENTION.working).toBeDefined()
      expect(DEFAULT_RETENTION.episodic).toBeDefined()
      expect(DEFAULT_RETENTION.semantic).toBeDefined()
      expect(DEFAULT_RETENTION.procedural).toBeDefined()
    })

    it("should have correct TTL for working memory", () => {
      const policy = DEFAULT_RETENTION.working
      expect(policy.ttlMs).toBe(60 * 60 * 1000) // 1 hour
      expect(policy.maxEntries).toBe(1000)
    })

    it("should have correct TTL for episodic memory", () => {
      const policy = DEFAULT_RETENTION.episodic
      expect(policy.ttlMs).toBe(90 * 24 * 60 * 60 * 1000) // 90 days
    })

    it("should not have TTL for semantic memory (persistent)", () => {
      const policy = DEFAULT_RETENTION.semantic
      expect(policy.ttlMs).toBeUndefined()
    })
  })

  describe("isExpired()", () => {
    it("should return true for past expiration", () => {
      const now = Date.now()
      const past = now - 1000
      expect(isExpired(past, now)).toBe(true)
    })

    it("should return false for future expiration", () => {
      const now = Date.now()
      const future = now + 100000
      expect(isExpired(future, now)).toBe(false)
    })

    it("should return false for null (no expiration)", () => {
      expect(isExpired(null)).toBe(false)
    })

    it("should return false for undefined (no expiration)", () => {
      expect(isExpired(undefined)).toBe(false)
    })
  })

  describe("shouldRetain()", () => {
    it("should return true if createdAt is recent", () => {
      const policy: RetentionPolicy = {
        layer: "working",
        ttlMs: 60 * 60 * 1000,
        encryption: "none",
        compress: false,
      }
      const now = Date.now()
      const recent = now - 1000

      expect(shouldRetain(recent, policy, now)).toBe(true)
    })

    it("should return false if createdAt exceeds TTL", () => {
      const policy: RetentionPolicy = {
        layer: "working",
        ttlMs: 60 * 60 * 1000,
        encryption: "none",
        compress: false,
      }
      const now = Date.now()
      const old = now - 120 * 60 * 1000 // 2 hours ago

      expect(shouldRetain(old, policy, now)).toBe(false)
    })

    it("should return true if policy has no TTL (semantic/procedural)", () => {
      const policy: RetentionPolicy = {
        layer: "semantic",
        encryption: "standard",
        compress: false,
      }
      const now = Date.now()
      const old = now - 1000 * 24 * 60 * 60 * 1000 // 1000 days ago

      expect(shouldRetain(old, policy, now)).toBe(true)
    })
  })

  describe("computeExpiresAt()", () => {
    it("should compute correct expiration time", () => {
      const createdAt = Date.now()
      const ttlMs = 60 * 60 * 1000 // 1 hour

      const expiresAt = computeExpiresAt(createdAt, ttlMs)

      expect(expiresAt).toBe(createdAt + ttlMs)
    })

    it("should return null if no TTL", () => {
      const createdAt = Date.now()

      expect(computeExpiresAt(createdAt, undefined)).toBeNull()
    })
  })

  describe("MemoryRetention.getStats()", () => {
    it("should return stats for all layers", async () => {
      const stats = await MemoryRetention.getStats("test-tenant")

      expect(stats.working).toBeDefined()
      expect(stats.episodic).toBeDefined()
      expect(stats.semantic).toBeDefined()
      expect(stats.procedural).toBeDefined()
    })

    it("should include policy in stats", async () => {
      const stats = await MemoryRetention.getStats("test-tenant")

      expect(stats.working.policy).toBeDefined()
      expect(stats.working.policy.layer).toBe("working")
    })
  })

  describe("MemoryRetention.rightToForget()", () => {
    it("should accept RTBF request (requires initialized repo)", async () => {
      // This test requires the repository to be initialized
      // Skipping actual DB operations test
      await expect(MemoryRetention.rightToForget("tenant-1", "user-1", "user_request")).resolves.toBeDefined()
    })
  })
})

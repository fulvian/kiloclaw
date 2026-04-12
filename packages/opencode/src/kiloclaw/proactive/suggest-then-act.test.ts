import { describe, it, expect, beforeEach } from "bun:test"
import {
  SuggestThenAct,
  createSuggestion,
  acceptSuggestion,
  rejectSuggestion,
  getSuggestion,
  getPendingSuggestions,
  expireSuggestions,
  type Suggestion,
} from "./suggest-then-act"

describe("SuggestThenAct", () => {
  describe("createSuggestion", () => {
    it("should create a suggestion with pending status", async () => {
      const suggestion = await createSuggestion({
        taskId: "task-1",
        tenantId: "tenant-1",
        userId: "user-1",
        message: "Would you like me to send a daily summary?",
        rationale: {
          trigger: "schedule",
          signals: ["Trigger signal: schedule", "Schedule: 0 9 * * *"],
          policy: "Authorized: Budget available",
          budget: { totalUsed: 5, totalLimit: 100, byType: { suggest: 5 } },
          riskLevel: "low",
        },
        ttlMs: 300000,
      })

      expect(suggestion.id).toMatch(/^suggestion-/)
      expect(suggestion.taskId).toBe("task-1")
      expect(suggestion.tenantId).toBe("tenant-1")
      expect(suggestion.userId).toBe("user-1")
      expect(suggestion.message).toBe("Would you like me to send a daily summary?")
      expect(suggestion.status).toBe("pending")
      expect(suggestion.respondedAt).toBeNull()
      expect(suggestion.expiresAt).toBeGreaterThan(Date.now())
    })
  })

  describe("acceptSuggestion", () => {
    it("should accept a pending suggestion", async () => {
      const created = await createSuggestion({
        taskId: "task-1",
        tenantId: "tenant-1",
        userId: "user-1",
        message: "Test suggestion",
        rationale: {
          trigger: "schedule",
          signals: [],
          policy: "Authorized",
          budget: { totalUsed: 1, totalLimit: 50, byType: {} },
          riskLevel: "low",
        },
        ttlMs: 60000,
      })

      const accepted = await acceptSuggestion({ suggestionId: created.id })

      expect(accepted.status).toBe("accepted")
      expect(accepted.respondedAt).not.toBeNull()
    })

    it("should reject accepting a non-pending suggestion", async () => {
      const created = await createSuggestion({
        taskId: "task-1",
        tenantId: "tenant-1",
        userId: "user-1",
        message: "Test suggestion",
        rationale: {
          trigger: "schedule",
          signals: [],
          policy: "Authorized",
          budget: { totalUsed: 1, totalLimit: 50, byType: {} },
          riskLevel: "low",
        },
        ttlMs: 60000,
      })

      // First accept
      await acceptSuggestion({ suggestionId: created.id })

      // Try to accept again
      await expect(acceptSuggestion({ suggestionId: created.id })).rejects.toThrow("is not pending")
    })

    it("should reject accepting non-existent suggestion", async () => {
      await expect(acceptSuggestion({ suggestionId: "nonexistent" })).rejects.toThrow("not found")
    })
  })

  describe("rejectSuggestion", () => {
    it("should reject a pending suggestion with reason", async () => {
      const created = await createSuggestion({
        taskId: "task-1",
        tenantId: "tenant-1",
        userId: "user-1",
        message: "Test suggestion",
        rationale: {
          trigger: "schedule",
          signals: [],
          policy: "Authorized",
          budget: { totalUsed: 1, totalLimit: 50, byType: {} },
          riskLevel: "low",
        },
        ttlMs: 60000,
      })

      const rejected = await rejectSuggestion({
        suggestionId: created.id,
        reason: "Not interested",
      })

      expect(rejected.status).toBe("rejected")
      expect(rejected.respondedAt).not.toBeNull()
    })

    it("should reject accepting a non-pending suggestion", async () => {
      const created = await createSuggestion({
        taskId: "task-1",
        tenantId: "tenant-1",
        userId: "user-1",
        message: "Test suggestion",
        rationale: {
          trigger: "schedule",
          signals: [],
          policy: "Authorized",
          budget: { totalUsed: 1, totalLimit: 50, byType: {} },
          riskLevel: "low",
        },
        ttlMs: 60000,
      })

      // First reject
      await rejectSuggestion({ suggestionId: created.id })

      // Try to reject again
      await expect(rejectSuggestion({ suggestionId: created.id })).rejects.toThrow("is not pending")
    })
  })

  describe("getSuggestion", () => {
    it("should return suggestion by ID", async () => {
      const created = await createSuggestion({
        taskId: "task-1",
        tenantId: "tenant-1",
        userId: "user-1",
        message: "Get test",
        rationale: {
          trigger: "schedule",
          signals: [],
          policy: "Authorized",
          budget: { totalUsed: 1, totalLimit: 50, byType: {} },
          riskLevel: "low",
        },
        ttlMs: 60000,
      })

      const result = await getSuggestion({ suggestionId: created.id })

      expect(result).not.toBeNull()
      expect(result!.id).toBe(created.id)
      expect(result!.message).toBe("Get test")
    })

    it("should return null for non-existent suggestion", async () => {
      const result = await getSuggestion({ suggestionId: "nonexistent" })

      expect(result).toBeNull()
    })
  })

  describe("getPendingSuggestions", () => {
    it("should return only pending suggestions for user", async () => {
      // Use unique tenant/user for this test to avoid cache conflicts
      const testTenant = `tenant-pending-${Date.now()}`
      const testUser = `user-pending-${Date.now()}`

      // Create multiple suggestions
      const s1 = await createSuggestion({
        taskId: "task-1",
        tenantId: testTenant,
        userId: testUser,
        message: "Pending 1",
        rationale: {
          trigger: "schedule",
          signals: [],
          policy: "Authorized",
          budget: { totalUsed: 1, totalLimit: 50, byType: {} },
          riskLevel: "low",
        },
        ttlMs: 60000,
      })

      await createSuggestion({
        taskId: "task-2",
        tenantId: testTenant,
        userId: testUser,
        message: "Pending 2",
        rationale: {
          trigger: "schedule",
          signals: [],
          policy: "Authorized",
          budget: { totalUsed: 2, totalLimit: 50, byType: {} },
          riskLevel: "low",
        },
        ttlMs: 60000,
      })

      // Accept one
      await acceptSuggestion({ suggestionId: s1.id })

      const pending = await getPendingSuggestions({
        tenantId: testTenant,
        userId: testUser,
        limit: 10,
      })

      expect(pending.length).toBe(1)
      expect(pending[0].message).toBe("Pending 2")
    })

    it("should return empty array when no pending suggestions", async () => {
      const pending = await getPendingSuggestions({
        tenantId: "nonexistent-tenant",
        userId: "nonexistent-user",
        limit: 10,
      })

      expect(pending).toEqual([])
    })
  })

  describe("expireSuggestions", () => {
    it("should expire stale suggestions", async () => {
      // Use unique tenant/user for this test
      const testTenant = `tenant-expire-${Date.now()}`
      const testUser = `user-expire-${Date.now()}`

      // Create a suggestion with very short TTL (50ms)
      const created = await createSuggestion({
        taskId: "task-expire",
        tenantId: testTenant,
        userId: testUser,
        message: "Will expire",
        rationale: {
          trigger: "schedule",
          signals: [],
          policy: "Authorized",
          budget: { totalUsed: 1, totalLimit: 50, byType: {} },
          riskLevel: "low",
        },
        ttlMs: 50, // 50ms TTL - enough to verify it's pending initially
      })

      // Check that suggestion is pending immediately
      const beforeExpire = await getSuggestion({ suggestionId: created.id })
      expect(beforeExpire!.status).toBe("pending")

      // Wait for it to expire
      await new Promise((resolve) => setTimeout(resolve, 60))

      // Expire suggestions - use the namespace wrapper
      const result = await SuggestThenAct.expireSuggestions()

      expect(result.expiredCount).toBeGreaterThanOrEqual(1)

      // Check suggestion is now expired
      const suggestion = await getSuggestion({ suggestionId: created.id })
      expect(suggestion!.status).toBe("expired")
    })
  })

  describe("SuggestionStatus", () => {
    it("should have correct status values", () => {
      expect(SuggestThenAct.Status.options).toEqual(["pending", "accepted", "rejected", "expired"])
    })
  })
})

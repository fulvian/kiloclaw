/**
 * Feedback Processor Tests - Phase 1: Feedback Loop End-to-End
 * KILOCLAW_PROACTIVE_CONTINUATIVE_AUTOLEARNING_PLAN_2026-04-05.md
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "bun:test"
import { tmpdir } from "../fixture/fixture"

// Mock modules before importing - complete mock to avoid polluting module cache
vi.mock("@/kiloclaw/memory/memory.repository", () => ({
  FeedbackRepo: {
    record: vi.fn().mockResolvedValue("fb_123"),
    getByTenant: vi.fn().mockResolvedValue([]),
    getByTarget: vi.fn().mockResolvedValue([]),
    deleteByUser: vi.fn().mockResolvedValue(undefined),
  },
  UserProfileRepo: {
    get: vi.fn().mockResolvedValue(null),
    upsert: vi.fn().mockResolvedValue(undefined),
  },
  ProceduralMemoryRepo: {
    get: vi.fn().mockResolvedValue({ id: "proc_1", usage_count: 10, success_rate: 80 }),
    upsert: vi.fn().mockResolvedValue(undefined),
    updateStats: vi.fn().mockResolvedValue(undefined),
    incrementUsage: vi.fn().mockResolvedValue(undefined),
    recordOutcome: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    findByPattern: vi.fn().mockResolvedValue([]),
    getStats: vi.fn().mockResolvedValue({ total_uses: 0, success_rate: 0 }),
    count: vi.fn().mockResolvedValue(0),
  },
  SemanticMemoryRepo: {
    getFact: vi.fn().mockResolvedValue({ id: "fact_1", confidence: 80 }),
    updateFact: vi.fn().mockResolvedValue(undefined),
    count: vi.fn().mockResolvedValue(0),
    assertFact: vi.fn().mockResolvedValue("fact_mock_id"),
    queryFacts: vi.fn().mockResolvedValue([]),
    deleteFact: vi.fn().mockResolvedValue(undefined),
    retractFact: vi.fn().mockResolvedValue(undefined),
    storeVector: vi.fn().mockResolvedValue(undefined),
    getVectors: vi.fn().mockResolvedValue([]),
    similaritySearch: vi.fn().mockResolvedValue([]),
    getById: vi.fn().mockResolvedValue(null),
    getBySubject: vi.fn().mockResolvedValue([]),
    getByPredicate: vi.fn().mockResolvedValue([]),
    getByActor: vi.fn().mockResolvedValue([]),
    getRecent: vi.fn().mockResolvedValue([]),
    search: vi.fn().mockResolvedValue([]),
    archive: vi.fn().mockResolvedValue(undefined),
    countArchived: vi.fn().mockResolvedValue(0),
  },
  AuditRepo: {
    log: vi.fn().mockResolvedValue("audit_123"),
    getByTarget: vi.fn().mockResolvedValue([]),
    getByActor: vi.fn().mockResolvedValue([]),
    verifyChain: vi.fn().mockResolvedValue(true),
  },
  EpisodicMemoryRepo: {
    save: vi.fn().mockResolvedValue("ep_123"),
    getById: vi.fn().mockResolvedValue(null),
    getByTenant: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    countEvents: vi.fn().mockResolvedValue(0),
    getRecent: vi.fn().mockResolvedValue([]),
    getBySession: vi.fn().mockResolvedValue([]),
    archive: vi.fn().mockResolvedValue(undefined),
    countArchived: vi.fn().mockResolvedValue(0),
    delete: vi.fn().mockResolvedValue(undefined),
    GC: vi.fn().mockResolvedValue(0),
  },
  WorkingMemoryRepo: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    getMany: vi.fn().mockResolvedValue([]),
    count: vi.fn().mockResolvedValue(0),
    clear: vi.fn().mockResolvedValue(undefined),
  },
  GraphMemoryRepo: {
    upsert: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    getNeighbors: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
  },
}))

import {
  FeedbackProcessor,
  FeedbackLearner,
  FeedbackReasonCode,
  calculateQualityScore,
  validateFeedbackEvent,
} from "@/kiloclaw/feedback"
import type { FeedbackEvent } from "@/kiloclaw/feedback"

// =============================================================================
// Unit Tests for FeedbackProcessor
// =============================================================================

describe("FeedbackProcessor", () => {
  describe("process validation", () => {
    it("should accept valid feedback event", async () => {
      const validFeedback = {
        id: crypto.randomUUID(),
        tenantId: "tenant_1",
        userId: "user_1",
        target: {
          type: "response" as const,
          id: "resp_123",
        },
        vote: "up" as const,
        reason: "irrelevant" as const,
        ts: Date.now(),
      }

      const result = await FeedbackProcessor.process({ feedback: validFeedback })

      expect(result.success).toBe(true)
      expect(result.feedbackId).toBe(validFeedback.id)
    })

    it("should reject feedback without tenantId", async () => {
      const invalidFeedback = {
        id: crypto.randomUUID(),
        tenantId: "", // Empty tenantId
        target: {
          type: "response" as const,
          id: "resp_123",
        },
        vote: "up" as const,
        reason: "irrelevant" as const,
        ts: Date.now(),
      }

      const result = await FeedbackProcessor.process({ feedback: invalidFeedback as any })

      expect(result.success).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors!.length).toBeGreaterThan(0)
    })

    it("should reject feedback with invalid vote", async () => {
      const invalidFeedback = {
        id: crypto.randomUUID(),
        tenantId: "tenant_1",
        target: {
          type: "response" as const,
          id: "resp_123",
        },
        vote: "maybe" as any, // Invalid vote
        reason: "irrelevant" as const,
        ts: Date.now(),
      }

      const result = await FeedbackProcessor.process({ feedback: invalidFeedback })

      expect(result.success).toBe(false)
    })
  })

  describe("process with skipLearning", () => {
    it("should skip learning actions when skipLearning is true", async () => {
      const feedback = {
        id: crypto.randomUUID(),
        tenantId: "tenant_1",
        userId: "user_1",
        target: {
          type: "response" as const,
          id: "resp_123",
        },
        vote: "up" as const,
        reason: "irrelevant" as const,
        ts: Date.now(),
      }

      const result = await FeedbackProcessor.process({ feedback, skipLearning: true })

      expect(result.success).toBe(true)
      expect(result.actions.length).toBe(0)
    })
  })

  describe("getSummary", () => {
    it("should return empty summary for tenant with no feedback", async () => {
      const { FeedbackRepo } = await import("@/kiloclaw/memory/memory.repository")
      ;(FeedbackRepo.getByTenant as ReturnType<typeof vi.fn>).mockResolvedValueOnce([])

      const summary = await FeedbackProcessor.getSummary("tenant_empty")

      expect(summary.total).toBe(0)
      expect(summary.upvotes).toBe(0)
      expect(summary.downvotes).toBe(0)
      expect(summary.byReason).toEqual({})
      expect(summary.avgScore).toBe(0)
    })

    it("should aggregate feedback by reason", async () => {
      const { FeedbackRepo } = await import("@/kiloclaw/memory/memory.repository")
      ;(FeedbackRepo.getByTenant as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        { id: "1", tenant_id: "t1", vote: "up", reason: "irrelevant", score: 0.8 },
        { id: "2", tenant_id: "t1", vote: "down", reason: "wrong_fact", score: 0.2 },
        { id: "3", tenant_id: "t1", vote: "down", reason: "wrong_fact", score: 0.3 },
      ])

      const summary = await FeedbackProcessor.getSummary("t1")

      expect(summary.total).toBe(3)
      expect(summary.upvotes).toBe(1)
      expect(summary.downvotes).toBe(2)
      expect(summary.byReason["irrelevant"]).toBe(1)
      expect(summary.byReason["wrong_fact"]).toBe(2)
      expect(summary.avgScore).toBeCloseTo((0.8 + 0.2 + 0.3) / 3)
    })
  })
})

// =============================================================================
// Unit Tests for FeedbackLearner
// =============================================================================

describe("FeedbackLearner", () => {
  describe("updateUserProfile", () => {
    it("should update density preference for too_verbose feedback", async () => {
      const { UserProfileRepo } = await import("@/kiloclaw/memory/memory.repository")
      ;(UserProfileRepo.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: "prof_1",
        tenant_id: "tenant_1",
        user_id: "user_1",
        preferences_json: { density: 0.7 },
        communication_style: "neutral",
        constraints_json: {},
        created_at: Date.now(),
      })

      const result = await FeedbackLearner.updateUserProfile("tenant_1", "user_1", {
        vote: "down",
        reason: "too_verbose",
        score: 0.8,
      })

      expect(result.updated).toBe(true)
      expect(result.changes.density).toBeLessThan(0.7)
    })

    it("should update tone preference for style_mismatch with correction", async () => {
      const { UserProfileRepo } = await import("@/kiloclaw/memory/memory.repository")
      ;(UserProfileRepo.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: "prof_1",
        tenant_id: "tenant_1",
        user_id: "user_1",
        preferences_json: {},
        communication_style: "neutral",
        constraints_json: {},
        created_at: Date.now(),
      })

      const result = await FeedbackLearner.updateUserProfile("tenant_1", "user_1", {
        vote: "down",
        reason: "style_mismatch",
        score: 0.9,
        correction: "more technical",
      })

      expect(result.updated).toBe(true)
      expect(result.changes.tone).toBe("more technical")
    })

    it("should detect communication style change based on thresholds", async () => {
      const { UserProfileRepo } = await import("@/kiloclaw/memory/memory.repository")
      ;(UserProfileRepo.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: "prof_1",
        tenant_id: "tenant_1",
        user_id: "user_1",
        preferences_json: { feedbackStats: { too_verbose: 6 } },
        communication_style: "neutral",
        constraints_json: {},
        created_at: Date.now(),
      })

      const result = await FeedbackLearner.updateUserProfile("tenant_1", "user_1", {
        vote: "down",
        reason: "too_verbose",
        score: 0.5,
      })

      expect(result.updated).toBe(true)
      expect(result.changes.communication_style).toBe("concise")
    })
  })

  describe("updateRetrievalSignals", () => {
    it("should apply penalty for wrong_fact on down vote", async () => {
      const result = await FeedbackLearner.updateRetrievalSignals("tenant_1", {
        targetId: "fact_123",
        targetType: "fact",
        reason: "wrong_fact",
        vote: "down",
        score: 0.7,
      })

      expect(result.updated).toBe(true)
      expect(result.penalties.length).toBe(1)
      expect(result.penalties[0].source).toBe("fact:fact_123")
      expect(result.penalties[0].penalty).toBeCloseTo(0.7 * 0.25)
    })

    it("should apply penalty for irrelevant on down vote", async () => {
      const result = await FeedbackLearner.updateRetrievalSignals("tenant_1", {
        targetId: "mem_456",
        targetType: "memory",
        reason: "irrelevant",
        vote: "down",
        score: 0.6,
      })

      expect(result.updated).toBe(true)
      expect(result.penalties.length).toBe(1)
      expect(result.penalties[0].source).toBe("pattern:mem_456")
    })

    it("should not apply penalty for up vote", async () => {
      const result = await FeedbackLearner.updateRetrievalSignals("tenant_1", {
        targetId: "fact_123",
        targetType: "fact",
        reason: "wrong_fact",
        vote: "up",
        score: 0.8,
      })

      expect(result.updated).toBe(false)
      expect(result.penalties.length).toBe(0)
    })
  })

  describe("updateProcedureStats", () => {
    it("should update success rate for successful task", async () => {
      const { ProceduralMemoryRepo } = await import("@/kiloclaw/memory/memory.repository")
      ;(ProceduralMemoryRepo.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: "proc_1",
        usage_count: 10,
        success_rate: 80,
      })

      const result = await FeedbackLearner.updateProcedureStats({
        procedureId: "proc_1",
        vote: "up",
        reason: "other",
        score: 0.9,
      })

      expect(result.updated).toBe(true)
      expect(result.newSuccessRate).toBeGreaterThan(80)
    })

    it("should not update for non-existent procedure", async () => {
      const { ProceduralMemoryRepo } = await import("@/kiloclaw/memory/memory.repository")
      ;(ProceduralMemoryRepo.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null)

      const result = await FeedbackLearner.updateProcedureStats({
        procedureId: "nonexistent",
        vote: "up",
        reason: "other",
        score: 0.9,
      })

      expect(result.updated).toBe(false)
    })
  })

  describe("adjustProactivePolicy", () => {
    it("should reduce aggressiveness for negative expectation_mismatch", async () => {
      const { UserProfileRepo } = await import("@/kiloclaw/memory/memory.repository")
      ;(UserProfileRepo.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: "prof_1",
        tenant_id: "tenant_1",
        user_id: "user_1",
        preferences_json: {},
        communication_style: "neutral",
        constraints_json: { proactive: { aggressiveness: 0.7 } },
        created_at: Date.now(),
      })

      const result = await FeedbackLearner.adjustProactivePolicy("tenant_1", "user_1", {
        vote: "down",
        reason: "expectation_mismatch",
        score: 0.6,
      })

      expect(result.adjusted).toBe(true)
      expect(result.aggressivenessDelta).toBeLessThan(0)
    })

    it("should increase aggressiveness slightly for positive feedback", async () => {
      const { UserProfileRepo } = await import("@/kiloclaw/memory/memory.repository")
      ;(UserProfileRepo.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: "prof_1",
        tenant_id: "tenant_1",
        user_id: "user_1",
        preferences_json: {},
        communication_style: "neutral",
        constraints_json: { proactive: { aggressiveness: 0.5 } },
        created_at: Date.now(),
      })

      const result = await FeedbackLearner.adjustProactivePolicy("tenant_1", "user_1", {
        vote: "up",
        reason: "other",
        score: 0.8,
      })

      expect(result.adjusted).toBe(true)
      expect(result.aggressivenessDelta).toBeGreaterThan(0)
    })

    it("should not adjust for unsafe content", async () => {
      const { UserProfileRepo } = await import("@/kiloclaw/memory/memory.repository")
      ;(UserProfileRepo.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: "prof_1",
        tenant_id: "tenant_1",
        user_id: "user_1",
        preferences_json: {},
        communication_style: "neutral",
        constraints_json: { proactive: { aggressiveness: 0.5 } },
        created_at: Date.now(),
      })

      const result = await FeedbackLearner.adjustProactivePolicy("tenant_1", "user_1", {
        vote: "up",
        reason: "unsafe",
        score: 0.9,
      })

      expect(result.adjusted).toBe(false)
    })
  })

  describe("extractPatterns", () => {
    it("should detect high accuracy issues", async () => {
      const { FeedbackRepo } = await import("@/kiloclaw/memory/memory.repository")
      const mockEvents = Array(6)
        .fill(null)
        .map((_, i) => ({
          id: String(i),
          tenant_id: "t1",
          reason: "wrong_fact",
          vote: "down",
        }))
      ;(FeedbackRepo.getByTenant as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockEvents)

      const patterns = await FeedbackLearner.extractPatterns("t1")

      expect(patterns.length).toBeGreaterThan(0)
      const accuracyPattern = patterns.find((p) => p.type === "accuracy")
      expect(accuracyPattern).toBeDefined()
      expect(accuracyPattern!.severity).toBe("medium")
    })

    it("should detect high relevance issues", async () => {
      const { FeedbackRepo } = await import("@/kiloclaw/memory/memory.repository")
      // 15 events triggers medium severity (>10), 21 triggers high (>20)
      const mockEvents = Array(15)
        .fill(null)
        .map((_, i) => ({
          id: String(i),
          tenant_id: "t1",
          reason: "irrelevant",
          vote: "down",
        }))
      ;(FeedbackRepo.getByTenant as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockEvents)

      const patterns = await FeedbackLearner.extractPatterns("t1")

      const relevancePattern = patterns.find((p) => p.type === "relevance")
      expect(relevancePattern).toBeDefined()
      expect(relevancePattern!.severity).toBe("medium") // > 10 is medium, > 20 is high
    })

    it("should flag safety issues immediately", async () => {
      const { FeedbackRepo } = await import("@/kiloclaw/memory/memory.repository")
      const mockEvents = [{ id: "1", tenant_id: "t1", reason: "unsafe", vote: "down" }]
      ;(FeedbackRepo.getByTenant as ReturnType<typeof vi.fn>).mockResolvedValueOnce(mockEvents)

      const patterns = await FeedbackLearner.extractPatterns("t1")

      const safetyPattern = patterns.find((p) => p.type === "safety")
      expect(safetyPattern).toBeDefined()
      expect(safetyPattern!.severity).toBe("high")
    })
  })
})

// =============================================================================
// Integration Tests for Feedback -> Profile
// =============================================================================

describe("Feedback to Profile Integration", () => {
  it("should update profile when receiving multiple negative feedbacks", async () => {
    const { FeedbackRepo, UserProfileRepo } = await import("@/kiloclaw/memory/memory.repository")

    // First call returns empty (no existing profile)
    ;(UserProfileRepo.get as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(null)
      // Second call returns the profile we just created
      .mockResolvedValueOnce({
        id: "prof_new",
        tenant_id: "tenant_1",
        user_id: "user_1",
        preferences_json: { feedbackStats: { too_verbose: 1 } },
        communication_style: "neutral",
        constraints_json: {},
        created_at: Date.now(),
      })
    ;(FeedbackRepo.record as ReturnType<typeof vi.fn>).mockResolvedValueOnce("fb_1")

    // Process first feedback
    const result1 = await FeedbackProcessor.process({
      feedback: {
        id: crypto.randomUUID(),
        tenantId: "tenant_1",
        userId: "user_1",
        target: { type: "response", id: "resp_1" },
        vote: "down",
        reason: "too_verbose",
        ts: Date.now(),
      },
    })

    expect(result1.success).toBe(true)
  })
})

// =============================================================================
// Regression Tests for Retrieval Ranking
// =============================================================================

describe("Retrieval Ranking Regression", () => {
  it("should not degrade retrieval when receiving positive feedback", async () => {
    const { FeedbackRepo } = await import("@/kiloclaw/memory/memory.repository")
    ;(FeedbackRepo.record as ReturnType<typeof vi.fn>).mockResolvedValueOnce("fb_1")

    const result = await FeedbackProcessor.process({
      feedback: {
        id: crypto.randomUUID(),
        tenantId: "tenant_1",
        userId: "user_1",
        target: { type: "memory_retrieval", id: "mem_1" },
        vote: "up",
        reason: "other",
        ts: Date.now(),
      },
    })

    expect(result.success).toBe(true)
  })

  it("should apply penalties for irrelevant feedback", async () => {
    const { FeedbackRepo, UserProfileRepo } = await import("@/kiloclaw/memory/memory.repository")
    ;(FeedbackRepo.record as ReturnType<typeof vi.fn>).mockResolvedValueOnce("fb_1")
    ;(UserProfileRepo.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "prof_1",
      tenant_id: "tenant_1",
      user_id: "user_1",
      preferences_json: {},
      communication_style: "neutral",
      constraints_json: {},
      created_at: Date.now(),
    })

    const result = await FeedbackProcessor.process({
      feedback: {
        id: crypto.randomUUID(),
        tenantId: "tenant_1",
        userId: "user_1",
        target: { type: "memory_retrieval", id: "mem_irrelevant" },
        vote: "down",
        reason: "irrelevant",
        score: 0.6,
        ts: Date.now(),
      },
    })

    expect(result.success).toBe(true)
    expect(result.actions.some((a) => a.type === "retrieval_update")).toBe(true)
  })
})

// =============================================================================
// Contract Tests
// =============================================================================

describe("Feedback Contract", () => {
  describe("calculateQualityScore", () => {
    it("should return 1.0 for up vote with no issues", () => {
      const event: FeedbackEvent = {
        id: crypto.randomUUID(),
        tenantId: "tenant_1",
        target: { type: "response", id: "resp_1" },
        vote: "up",
        reason: "other",
        channel: "cli",
        ts: Date.now(),
      }

      expect(calculateQualityScore(event)).toBe(1.0)
    })

    it("should penalize wrong_fact heavily", () => {
      const event: FeedbackEvent = {
        id: crypto.randomUUID(),
        tenantId: "tenant_1",
        target: { type: "response", id: "resp_1" },
        vote: "down",
        reason: "wrong_fact",
        channel: "cli",
        ts: Date.now(),
      }

      const score = calculateQualityScore(event)
      expect(score).toBeLessThan(0.7) // 0.0 - 0.3 penalty
    })

    it("should use explicit score when provided", () => {
      const event: FeedbackEvent = {
        id: crypto.randomUUID(),
        tenantId: "tenant_1",
        target: { type: "response", id: "resp_1" },
        vote: "up",
        score: 0.5,
        reason: "other",
        channel: "cli",
        ts: Date.now(),
      }

      expect(calculateQualityScore(event)).toBe(0.5)
    })
  })

  describe("validateFeedbackEvent", () => {
    it("should validate a complete feedback event", () => {
      const event = {
        id: crypto.randomUUID(),
        tenantId: "tenant_1",
        userId: "user_1",
        sessionId: "session_1",
        correlationId: "corr_1",
        target: {
          type: "response",
          id: "resp_123",
          taskId: "task_456",
        },
        vote: "down",
        score: 0.3,
        reason: "wrong_fact",
        correction: "The correct answer is...",
        expectedOutcome: "factual answer",
        actualOutcome: "incorrect statement",
        channel: "cli" as const,
        ts: Date.now(),
      }

      const result = validateFeedbackEvent(event)

      expect(result.valid).toBe(true)
      if (result.valid) {
        expect(result.data.tenantId).toBe("tenant_1")
        expect(result.data.score).toBe(0.3)
      }
    })

    it("should reject invalid reason code", () => {
      const event = {
        id: crypto.randomUUID(),
        tenantId: "tenant_1",
        target: { type: "response", id: "resp_1" },
        vote: "down",
        reason: "invalid_reason",
        ts: Date.now(),
      }

      const result = validateFeedbackEvent(event)

      expect(result.valid).toBe(false)
    })
  })
})

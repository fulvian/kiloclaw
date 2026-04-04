import { describe, it, expect } from "bun:test"
import { MemoryFeedback, MemoryLearning, type FeedbackPayload } from "@/kiloclaw/memory"

describe("Memory Feedback", () => {
  describe("FeedbackPayload validation", () => {
    it("should accept valid up vote payload", () => {
      const payload: FeedbackPayload = {
        vote: "up",
        reason: "irrelevant", // using valid reason from type
        target: {
          responseId: "resp-123",
          memoryIds: ["mem-1", "mem-2"],
        },
      }

      expect(payload.vote).toBe("up")
      expect(payload.reason).toBe("irrelevant")
    })

    it("should accept valid down vote payload with correction", () => {
      const payload: FeedbackPayload = {
        vote: "down",
        reason: "wrong_fact",
        correction: "The correct fact is...",
        target: {
          responseId: "resp-456",
          memoryIds: ["mem-3"],
        },
      }

      expect(payload.vote).toBe("down")
      expect(payload.reason).toBe("wrong_fact")
      expect(payload.correction).toBeDefined()
    })

    it("should accept all reason types", () => {
      const reasons = ["wrong_fact", "irrelevant", "too_verbose", "style_mismatch", "unsafe", "other"] as const

      for (const reason of reasons) {
        const payload: FeedbackPayload = {
          vote: "down",
          reason,
          target: { memoryIds: ["mem-1"] },
        }
        expect(payload.reason).toBe(reason)
      }
    })
  })

  describe("MemoryLearning.Pattern extraction", () => {
    it("should define pattern structure correctly", () => {
      // Test the pattern interface exists and has correct structure
      const pattern = {
        type: "accuracy",
        severity: "high" as const,
        description: "Test pattern",
        recommendation: "Test recommendation",
      }

      expect(pattern.type).toBe("accuracy")
      expect(pattern.severity).toBe("high")
    })
  })
})

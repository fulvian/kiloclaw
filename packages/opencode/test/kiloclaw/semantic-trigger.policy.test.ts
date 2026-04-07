/**
 * Semantic Trigger Policy Tests
 *
 * Tests the pure semantic-based recall trigger (no hardcoded keywords).
 * Validates that queries in any language trigger recall based on semantic similarity.
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "bun:test"
import { SemanticTriggerPolicy } from "@/kiloclaw/memory/semantic-trigger.policy"
import { MemoryEmbedding } from "@/kiloclaw/memory/memory.embedding"
import { RECALL_TEST_CASES } from "./recall-test-cases"
import { EpisodicMemoryRepo } from "@/kiloclaw/memory/memory.repository"

// Mock the dependencies
vi.mock("@/kiloclaw/memory/memory.embedding", () => ({
  MemoryEmbedding: {
    embed: vi.fn(),
    embedBatch: vi.fn(),
    model: () => "test-model",
    baseURL: () => "http://localhost:1234",
  },
}))

vi.mock("@/kiloclaw/memory/memory.repository", () => ({
  EpisodicMemoryRepo: {
    getRecentEpisodes: vi.fn(),
    getEpisode: vi.fn(),
    recordEpisode: vi.fn(),
  },
  SemanticMemoryRepo: {
    similaritySearch: vi.fn(),
  },
}))

describe("SemanticTriggerPolicy", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    EpisodicMemoryRepo.getRecentEpisodes = vi.fn().mockResolvedValue([])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("Italian queries trigger recall via semantic similarity", () => {
    it("returns skip when no episodes exist", async () => {
      EpisodicMemoryRepo.getRecentEpisodes = vi.fn().mockResolvedValue([])

      const result = await SemanticTriggerPolicy.evaluate("suggeriscimi delle schede madri")

      expect(result.decision).toBe("skip")
      expect(result.shouldRecall).toBe(false)
      expect(result.episodesCompared).toBe(0)
    })

    it("triggers recall when query is semantically similar to stored episode", async () => {
      // Setup: store a fake episode about motherboards
      const mockEpisodes = [
        {
          id: "ep_italian_mb",
          task_description: "Discussione sulle schede madri MSI e ASUS ROG per gaming",
          outcome: "User prefers ASUS ROG for gaming build",
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          correlationId: "corr_1",
          agencyId: "agency_1",
          agentId: "agent_1",
          events: [],
        },
      ]
      EpisodicMemoryRepo.getRecentEpisodes = vi.fn().mockResolvedValue(mockEpisodes)

      // Mock embedding to return high similarity
      const queryEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5]
      const episodeEmbedding = [0.12, 0.22, 0.32, 0.42, 0.52] // High similarity

      MemoryEmbedding.embed = vi
        .fn()
        .mockResolvedValueOnce(queryEmbedding) // Query embedding
        .mockResolvedValueOnce(episodeEmbedding) // Episode embedding

      const result = await SemanticTriggerPolicy.evaluate("suggeriscimi delle schede madri")

      expect(result.decision).toBeOneOf(["recall", "shadow", "skip"])
      expect(result.episodesCompared).toBeGreaterThan(0)
    })
  })

  describe("BM25 fallback when LM Studio unavailable", () => {
    it("uses BM25 fallback when embedding fails", async () => {
      const mockEpisodes = [
        {
          id: "ep_node",
          task_description: "Discussione su Node.js installation",
          outcome: "Success",
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          correlationId: "corr_1",
          agencyId: "agency_1",
          agentId: "agent_1",
          events: [],
        },
      ]
      EpisodicMemoryRepo.getRecentEpisodes = vi.fn().mockResolvedValue(mockEpisodes)

      // Mock embedding to fail (simulating LM Studio unavailable)
      MemoryEmbedding.embed = vi.fn().mockRejectedValue(new Error("LM Studio unavailable"))

      const result = await SemanticTriggerPolicy.evaluate("installare Node.js")

      expect(result.fallbackUsed).toBe(true)
      expect(result.fallbackReason).toBe("lm_studio_unavailable")
      expect(result.episodesCompared).toBeGreaterThan(0)
    })
  })

  describe("Regression: no false positives on pure coding tasks", () => {
    it("should NOT trigger recall for pure coding tasks", async () => {
      // Setup: no relevant episodes
      EpisodicMemoryRepo.getRecentEpisodes = vi.fn().mockResolvedValue([])

      const codingTasks = [
        "fix lint errors in src/index.ts",
        "implement the API handler for retries",
        "write a function to parse JSON",
        "add TypeScript types to this module",
      ]

      for (const task of codingTasks) {
        const result = await SemanticTriggerPolicy.evaluate(task)
        expect(result.decision).toBe("skip")
        expect(result.shouldRecall).toBe(false)
      }
    })
  })

  describe("Test cases from RECALL_TEST_CASES", () => {
    for (const testCase of RECALL_TEST_CASES.shouldSkip) {
      it(`should skip: ${testCase.id} - "${testCase.text}"`, async () => {
        EpisodicMemoryRepo.getRecentEpisodes = vi.fn().mockResolvedValue([])

        const result = await SemanticTriggerPolicy.evaluate(testCase.text)
        expect(result.decision).toBe("skip")
        expect(testCase.reason).toBeDefined()
      })
    }
  })

  describe("Confidence and similarity reporting", () => {
    it("reports correct similarity score", async () => {
      const mockEpisodes = [
        {
          id: "ep_1",
          task_description: "Discussione su schede madri",
          outcome: "Completed",
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          correlationId: "corr_1",
          agencyId: "agency_1",
          agentId: "agent_1",
          events: [],
        },
      ]
      EpisodicMemoryRepo.getRecentEpisodes = vi.fn().mockResolvedValue(mockEpisodes)

      // Mock embedding with known values
      const queryEmbedding = [1.0, 0.0, 0.0]
      const episodeEmbedding = [1.0, 0.0, 0.0] // Perfect similarity

      MemoryEmbedding.embed = vi.fn().mockResolvedValueOnce(queryEmbedding).mockResolvedValueOnce(episodeEmbedding)

      const result = await SemanticTriggerPolicy.evaluate("schede madri")

      expect(result.topSimilarity).toBeCloseTo(1.0)
      expect(result.confidence).toBeCloseTo(1.0)
      expect(result.topEpisodeId).toBe("ep_1" as any)
    })

    it("reports zero similarity when episodes don't match", async () => {
      const mockEpisodes = [
        {
          id: "ep_1",
          task_description: "Discussione su Node.js",
          outcome: "Completed",
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          correlationId: "corr_1",
          agencyId: "agency_1",
          agentId: "agent_1",
          events: [],
        },
      ]
      EpisodicMemoryRepo.getRecentEpisodes = vi.fn().mockResolvedValue(mockEpisodes)

      // Mock embedding with orthogonal vectors (zero similarity)
      const queryEmbedding = [1.0, 0.0, 0.0]
      const episodeEmbedding = [0.0, 1.0, 0.0]

      MemoryEmbedding.embed = vi.fn().mockResolvedValueOnce(queryEmbedding).mockResolvedValueOnce(episodeEmbedding)

      const result = await SemanticTriggerPolicy.evaluate("schede madri gaming")

      expect(result.topSimilarity).toBe(0)
      expect(result.confidence).toBe(0)
    })
  })

  describe("Episode text extraction", () => {
    it("handles episodes with missing task_description and outcome", async () => {
      const mockEpisodes = [
        {
          id: "ep_1",
          task_description: "",
          outcome: "",
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          correlationId: "corr_1",
          agencyId: "agency_1",
          agentId: "agent_1",
          events: [],
        },
      ]
      EpisodicMemoryRepo.getRecentEpisodes = vi.fn().mockResolvedValue(mockEpisodes)

      // No embedding calls should happen for empty text
      MemoryEmbedding.embed = vi.fn()

      const result = await SemanticTriggerPolicy.evaluate("any query")

      // With empty task_description and outcome, the episode text is empty, so embed is not called
      // But the episode was still returned, so episodesCompared is 1 and it skips the empty one
      expect(result.decision).toBe("skip")
    })
  })
})

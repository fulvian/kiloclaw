/**
 * Hybrid Retriever Tests
 *
 * Tests the hybrid retrieval combining Vector search (semantic) + BM25 (lexical).
 * Based on ReMe paper: Vector 0.7 + BM25 0.3
 */

import { describe, expect, it, beforeEach, afterEach, vi } from "bun:test"
import { HybridRetriever } from "@/kiloclaw/memory/hybrid-retriever"
import { MemoryEmbedding } from "@/kiloclaw/memory/memory.embedding"
import {
  SemanticMemoryRepo,
  EpisodicMemoryRepo,
  WorkingMemoryRepo,
  ProceduralMemoryRepo,
} from "@/kiloclaw/memory/memory.repository"

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
  SemanticMemoryRepo: {
    similaritySearch: vi.fn(),
    queryFacts: vi.fn(),
    assertFact: vi.fn(),
    storeVector: vi.fn(),
  },
  EpisodicMemoryRepo: {
    getRecentEpisodes: vi.fn(),
    recordEpisode: vi.fn(),
    recordEvent: vi.fn(),
  },
  WorkingMemoryRepo: {
    getMany: vi.fn(),
    set: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  },
  ProceduralMemoryRepo: {
    list: vi.fn(),
    register: vi.fn(),
    get: vi.fn(),
  },
  UserProfileRepo: {
    get: vi.fn(),
  },
  FeedbackRepo: {
    record: vi.fn(),
  },
  AuditRepo: {
    log: vi.fn(),
  },
}))

describe("HybridRetriever", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("Basic retrieval", () => {
    it("returns empty result when no data available", async () => {
      SemanticMemoryRepo.similaritySearch = vi.fn().mockResolvedValue([])
      EpisodicMemoryRepo.getRecentEpisodes = vi.fn().mockResolvedValue([])
      WorkingMemoryRepo.getMany = vi.fn().mockResolvedValue({})
      ProceduralMemoryRepo.list = vi.fn().mockResolvedValue([])

      const result = await HybridRetriever.retrieve({ query: "test query" })

      expect(result.items).toEqual([])
      expect(result.vectorHits).toBe(0)
      expect(result.bm25Hits).toBe(0)
    })

    it("returns results with hybrid scoring", async () => {
      // Mock semantic results
      const mockFacts = [
        {
          id: "fact_1",
          subject: "user",
          predicate: "prefers",
          object: "ASUS ROG for gaming",
          confidence: 90,
        },
      ]
      SemanticMemoryRepo.similaritySearch = vi.fn().mockResolvedValue([{ fact: mockFacts[0], similarity: 0.85 }])

      // Mock empty BM25 results for other layers
      EpisodicMemoryRepo.getRecentEpisodes = vi.fn().mockResolvedValue([])
      WorkingMemoryRepo.getMany = vi.fn().mockResolvedValue({})
      ProceduralMemoryRepo.list = vi.fn().mockResolvedValue([])

      MemoryEmbedding.embed = vi.fn().mockResolvedValue([0.1, 0.2, 0.3])

      const result = await HybridRetriever.retrieve({ query: "ASUS ROG preference", limit: 10 })

      expect(result.items.length).toBeGreaterThan(0)
      expect(result.vectorHits).toBeGreaterThan(0)
      expect(result.items[0].hybridScore).toBeGreaterThan(0)
      expect(result.items[0].layer).toBe("semantic")
    })
  })

  describe("BM25 lexical fallback", () => {
    it("includes BM25 results when vector search returns nothing", async () => {
      // Mock empty semantic results
      SemanticMemoryRepo.similaritySearch = vi.fn().mockResolvedValue([])

      // Mock episodic results
      const mockEpisodes = [
        {
          id: "ep_1",
          task_description: "Discussione su schede madri MSI",
          outcome: "User prefers ASUS",
        },
      ]
      EpisodicMemoryRepo.getRecentEpisodes = vi.fn().mockResolvedValue(mockEpisodes)

      // Mock empty working and procedural
      WorkingMemoryRepo.getMany = vi.fn().mockResolvedValue({})
      ProceduralMemoryRepo.list = vi.fn().mockResolvedValue([])

      // Mock query facts for BM25 fallback
      SemanticMemoryRepo.queryFacts = vi.fn().mockResolvedValue([])

      MemoryEmbedding.embed = vi.fn().mockRejectedValue(new Error("LM Studio unavailable"))

      const result = await HybridRetriever.retrieve({ query: "schede madri MSI", limit: 10 })

      expect(result.bm25Hits).toBeGreaterThan(0)
    })
  })

  describe("Layer filtering", () => {
    it("respects layer filter option", async () => {
      SemanticMemoryRepo.similaritySearch = vi.fn().mockResolvedValue([])
      EpisodicMemoryRepo.getRecentEpisodes = vi.fn().mockResolvedValue([])
      WorkingMemoryRepo.getMany = vi.fn().mockResolvedValue({})
      ProceduralMemoryRepo.list = vi.fn().mockResolvedValue([])

      const result = await HybridRetriever.retrieve({
        query: "test",
        layers: ["working"],
      })

      // Only working layer should be queried
      expect(WorkingMemoryRepo.getMany).toHaveBeenCalled()
      expect(EpisodicMemoryRepo.getRecentEpisodes).not.toHaveBeenCalled()
    })
  })

  describe("Token estimation", () => {
    it("estimates tokens correctly", async () => {
      const mockFacts = [
        {
          id: "fact_1",
          subject: "user",
          predicate: "prefers",
          object: "ASUS ROG for gaming build with multiple GPUs",
          confidence: 90,
        },
      ]
      SemanticMemoryRepo.similaritySearch = vi.fn().mockResolvedValue([{ fact: mockFacts[0], similarity: 0.85 }])

      EpisodicMemoryRepo.getRecentEpisodes = vi.fn().mockResolvedValue([])
      WorkingMemoryRepo.getMany = vi.fn().mockResolvedValue({})
      ProceduralMemoryRepo.list = vi.fn().mockResolvedValue([])

      MemoryEmbedding.embed = vi.fn().mockResolvedValue([0.1, 0.2, 0.3])

      const result = await HybridRetriever.retrieve({ query: "ASUS ROG preference" })

      expect(result.tokenUsage).toBeGreaterThan(0)
    })
  })

  describe("Limit enforcement", () => {
    it("respects the limit parameter", async () => {
      // Create many mock facts
      const manyFacts = Array.from({ length: 20 }, (_, i) => ({
        id: `fact_${i}`,
        subject: "user",
        predicate: "prefers",
        object: `item ${i}`,
        confidence: 80,
      }))

      SemanticMemoryRepo.similaritySearch = vi
        .fn()
        .mockResolvedValue(manyFacts.map((f) => ({ fact: f, similarity: 0.8 })))

      EpisodicMemoryRepo.getRecentEpisodes = vi.fn().mockResolvedValue([])
      WorkingMemoryRepo.getMany = vi.fn().mockResolvedValue({})
      ProceduralMemoryRepo.list = vi.fn().mockResolvedValue([])

      MemoryEmbedding.embed = vi.fn().mockResolvedValue([0.1, 0.2, 0.3])

      const result = await HybridRetriever.retrieve({ query: "preference", limit: 5 })

      expect(result.items.length).toBeLessThanOrEqual(5)
    })
  })
})

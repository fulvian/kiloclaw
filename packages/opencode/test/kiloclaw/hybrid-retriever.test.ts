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

describe("HybridRetriever", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    vi.spyOn(MemoryEmbedding, "embed").mockResolvedValue(Array.from({ length: 384 }, () => 0.1))
    vi.spyOn(MemoryEmbedding, "embedBatch").mockResolvedValue([Array.from({ length: 384 }, () => 0.1)])

    vi.spyOn(SemanticMemoryRepo, "similaritySearch").mockResolvedValue([])
    vi.spyOn(SemanticMemoryRepo, "queryFacts").mockResolvedValue([])
    vi.spyOn(SemanticMemoryRepo, "assertFact").mockResolvedValue("fact_mock")
    vi.spyOn(SemanticMemoryRepo, "storeVector").mockResolvedValue("vec_mock")

    vi.spyOn(EpisodicMemoryRepo, "getRecentEpisodes").mockResolvedValue([])
    vi.spyOn(EpisodicMemoryRepo, "recordEpisode").mockResolvedValue("ep_mock")
    vi.spyOn(EpisodicMemoryRepo, "recordEvent").mockResolvedValue("evt_mock")

    vi.spyOn(WorkingMemoryRepo, "getMany").mockResolvedValue({})
    vi.spyOn(WorkingMemoryRepo, "set").mockResolvedValue(undefined)
    vi.spyOn(WorkingMemoryRepo, "get").mockResolvedValue(undefined)
    vi.spyOn(WorkingMemoryRepo, "delete").mockResolvedValue(undefined)

    vi.spyOn(ProceduralMemoryRepo, "list").mockResolvedValue([])
    vi.spyOn(ProceduralMemoryRepo, "register").mockResolvedValue("proc_mock")
    vi.spyOn(ProceduralMemoryRepo, "get").mockResolvedValue(null)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe("Basic retrieval", () => {
    it("returns empty result when no data available", async () => {
      ;(SemanticMemoryRepo.similaritySearch as ReturnType<typeof vi.fn>).mockResolvedValue([])
      ;(EpisodicMemoryRepo.getRecentEpisodes as ReturnType<typeof vi.fn>).mockResolvedValue([])
      ;(WorkingMemoryRepo.getMany as ReturnType<typeof vi.fn>).mockResolvedValue({})
      ;(ProceduralMemoryRepo.list as ReturnType<typeof vi.fn>).mockResolvedValue([])

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
      ;(SemanticMemoryRepo.similaritySearch as ReturnType<typeof vi.fn>).mockResolvedValue([
        { fact: mockFacts[0], similarity: 0.85 },
      ])

      // Mock empty BM25 results for other layers
      ;(EpisodicMemoryRepo.getRecentEpisodes as ReturnType<typeof vi.fn>).mockResolvedValue([])
      ;(WorkingMemoryRepo.getMany as ReturnType<typeof vi.fn>).mockResolvedValue({})
      ;(ProceduralMemoryRepo.list as ReturnType<typeof vi.fn>).mockResolvedValue([])
      ;(MemoryEmbedding.embed as ReturnType<typeof vi.fn>).mockResolvedValue([0.1, 0.2, 0.3])

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
      ;(SemanticMemoryRepo.similaritySearch as ReturnType<typeof vi.fn>).mockResolvedValue([])

      // Mock episodic results
      const mockEpisodes = [
        {
          id: "ep_1",
          task_description: "Discussione su schede madri MSI",
          outcome: "User prefers ASUS",
        },
      ]
      ;(EpisodicMemoryRepo.getRecentEpisodes as ReturnType<typeof vi.fn>).mockResolvedValue(mockEpisodes)

      // Mock empty working and procedural
      ;(WorkingMemoryRepo.getMany as ReturnType<typeof vi.fn>).mockResolvedValue({})
      ;(ProceduralMemoryRepo.list as ReturnType<typeof vi.fn>).mockResolvedValue([])

      // Mock query facts for BM25 fallback
      ;(SemanticMemoryRepo.queryFacts as ReturnType<typeof vi.fn>).mockResolvedValue([])
      ;(MemoryEmbedding.embed as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("LM Studio unavailable"))

      const result = await HybridRetriever.retrieve({ query: "schede madri MSI", limit: 10 })

      expect(result.bm25Hits).toBeGreaterThan(0)
    })
  })

  describe("Layer filtering", () => {
    it("respects layer filter option", async () => {
      ;(SemanticMemoryRepo.similaritySearch as ReturnType<typeof vi.fn>).mockResolvedValue([])
      ;(EpisodicMemoryRepo.getRecentEpisodes as ReturnType<typeof vi.fn>).mockResolvedValue([])
      ;(WorkingMemoryRepo.getMany as ReturnType<typeof vi.fn>).mockResolvedValue({})
      ;(ProceduralMemoryRepo.list as ReturnType<typeof vi.fn>).mockResolvedValue([])

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
      ;(SemanticMemoryRepo.similaritySearch as ReturnType<typeof vi.fn>).mockResolvedValue([
        { fact: mockFacts[0], similarity: 0.85 },
      ])
      ;(EpisodicMemoryRepo.getRecentEpisodes as ReturnType<typeof vi.fn>).mockResolvedValue([])
      ;(WorkingMemoryRepo.getMany as ReturnType<typeof vi.fn>).mockResolvedValue({})
      ;(ProceduralMemoryRepo.list as ReturnType<typeof vi.fn>).mockResolvedValue([])
      ;(MemoryEmbedding.embed as ReturnType<typeof vi.fn>).mockResolvedValue([0.1, 0.2, 0.3])

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

      ;(SemanticMemoryRepo.similaritySearch as ReturnType<typeof vi.fn>).mockResolvedValue(
        manyFacts.map((f) => ({ fact: f, similarity: 0.8 })),
      )
      ;(EpisodicMemoryRepo.getRecentEpisodes as ReturnType<typeof vi.fn>).mockResolvedValue([])
      ;(WorkingMemoryRepo.getMany as ReturnType<typeof vi.fn>).mockResolvedValue({})
      ;(ProceduralMemoryRepo.list as ReturnType<typeof vi.fn>).mockResolvedValue([])
      ;(MemoryEmbedding.embed as ReturnType<typeof vi.fn>).mockResolvedValue([0.1, 0.2, 0.3])

      const result = await HybridRetriever.retrieve({ query: "preference", limit: 5 })

      expect(result.items.length).toBeLessThanOrEqual(5)
    })
  })
})

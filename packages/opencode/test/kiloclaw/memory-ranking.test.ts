import { describe, it, expect } from "bun:test"
import {
  rank,
  rankAndDeduplicate,
  applyBudget,
  DEFAULT_WEIGHTS,
  DEFAULT_THRESHOLDS,
  DEFAULT_BUDGET,
  type RankedItem,
} from "@/kiloclaw/memory"

describe("Memory Ranking", () => {
  describe("rank()", () => {
    it("should rank items by score descending", () => {
      const items = [
        { item: { id: "1", fingerprint: "a", layer: "working" }, relevanceVector: 0.5, confidence: 0.5 },
        { item: { id: "2", fingerprint: "b", layer: "working" }, relevanceVector: 0.9, confidence: 0.8 },
        { item: { id: "3", fingerprint: "c", layer: "working" }, relevanceVector: 0.3, confidence: 0.3 },
      ]

      const results = rank(items)

      expect(results.length).toBe(3)
      expect(results[0].item.id).toBe("2") // highest relevance
      expect(results[1].item.id).toBe("1")
      expect(results[2].item.id).toBe("3")
    })

    it("should filter out items below minConfidence threshold", () => {
      const items = [
        { item: { id: "1", fingerprint: "a", layer: "working" }, relevanceVector: 0.9, confidence: 0.9 },
        { item: { id: "2", fingerprint: "b", layer: "working" }, relevanceVector: 0.5, confidence: 0.2 }, // below 0.3
      ]

      const results = rank(items, DEFAULT_WEIGHTS, { ...DEFAULT_THRESHOLDS, minConfidence: 0.3 })
      const included = results.filter((r) => !r.excluded)

      expect(included.length).toBe(1)
      expect(included[0].item.id).toBe("1")
    })

    it("should exclude items with sensitivity above threshold", () => {
      const items = [
        {
          item: { id: "1", fingerprint: "a", layer: "working" },
          relevanceVector: 0.9,
          confidence: 0.9,
          sensitivity: "low",
        },
        {
          item: { id: "2", fingerprint: "b", layer: "working" },
          relevanceVector: 0.9,
          confidence: 0.9,
          sensitivity: "critical",
        },
      ]

      const results = rank(items, DEFAULT_WEIGHTS, { ...DEFAULT_THRESHOLDS, sensitivityMax: "high" })
      const included = results.filter((r) => !r.excluded)

      expect(included.length).toBe(1)
      expect(included[0].item.id).toBe("1")
    })

    it("should exclude items with sensitivity above threshold", () => {
      const items = [
        {
          item: { id: "1", fingerprint: "a", layer: "working" },
          relevanceVector: 0.9,
          confidence: 0.9,
          sensitivity: "low",
        },
        {
          item: { id: "2", fingerprint: "b", layer: "working" },
          relevanceVector: 0.9,
          confidence: 0.9,
          sensitivity: "critical",
        },
      ]

      const results = rank(items, DEFAULT_WEIGHTS, { ...DEFAULT_THRESHOLDS, sensitivityMax: "high" })
      const included = results.filter((r) => !r.excluded)

      expect(included.length).toBe(1)
      expect(included[0].item.id).toBe("1")
    })

    it("should compute score factors correctly", () => {
      const items = [{ item: { id: "1", fingerprint: "a", layer: "working" }, relevanceVector: 0.8, confidence: 0.7 }]

      const results = rank(items)
      const factors = results[0].factors

      expect(factors.relevanceVector).toBe(0.8)
      expect(factors.confidence).toBe(0.7)
      expect(factors.recencyNorm).toBeGreaterThanOrEqual(0)
    })

    it("should include explain array in results", () => {
      const items = [{ item: { id: "1", fingerprint: "a", layer: "working" }, relevanceVector: 0.8, confidence: 0.7 }]

      const results = rank(items)

      expect(Array.isArray(results[0].explain)).toBe(true)
    })
  })

  describe("rankAndDeduplicate()", () => {
    it("should deduplicate items by fingerprint", () => {
      const items = [
        { item: { id: "1", fingerprint: "a", layer: "working" }, relevanceVector: 0.9, confidence: 0.9 },
        { item: { id: "2", fingerprint: "a", layer: "working" }, relevanceVector: 0.5, confidence: 0.5 }, // same fingerprint
        { item: { id: "3", fingerprint: "b", layer: "working" }, relevanceVector: 0.7, confidence: 0.7 },
      ]

      const results = rankAndDeduplicate(items)

      expect(results.length).toBe(2)
      expect(results[0].item.id).toBe("1") // first one with fingerprint "a" wins (higher score)
      expect(results[1].item.id).toBe("3")
    })
  })

  describe("applyBudget()", () => {
    it("should respect token budget per layer", () => {
      const items: RankedItem<{ id: string; fingerprint: string; layer: string; content: string }>[] = [
        {
          item: { id: "1", fingerprint: "a", layer: "working", content: "x".repeat(100) },
          score: 0.9,
          factors: {} as any,
          explain: [],
        },
        {
          item: { id: "2", fingerprint: "b", layer: "episodic", content: "y".repeat(100) },
          score: 0.8,
          factors: {} as any,
          explain: [],
        },
        {
          item: { id: "3", fingerprint: "c", layer: "semantic", content: "z".repeat(100) },
          score: 0.7,
          factors: {} as any,
          explain: [],
        },
      ]

      const maxTokens = 200 // enough for working + episodic
      const result = applyBudget(items, DEFAULT_BUDGET, maxTokens)

      expect(result.selected.length).toBeGreaterThan(0)
      expect(result.tokenUsage).toBeLessThanOrEqual(maxTokens)
    })

    it("should return empty selected when budget is zero", () => {
      const items: RankedItem<{ id: string; fingerprint: string; layer: string }>[] = [
        { item: { id: "1", fingerprint: "a", layer: "working" }, score: 0.9, factors: {} as any, explain: [] },
      ]

      const result = applyBudget(items, { working: 0, episodic: 0, semantic: 0, procedural: 0, reserve: 0 }, 100)

      expect(result.selected.length).toBe(0)
    })
  })

  describe("DEFAULT_BUDGET", () => {
    it("should have correct percentages", () => {
      expect(DEFAULT_BUDGET.working).toBe(0.2)
      expect(DEFAULT_BUDGET.episodic).toBe(0.25)
      expect(DEFAULT_BUDGET.semantic).toBe(0.35)
      expect(DEFAULT_BUDGET.procedural).toBe(0.15)
      expect(DEFAULT_BUDGET.reserve).toBe(0.05)
    })

    it("should sum to 1", () => {
      const sum =
        DEFAULT_BUDGET.working +
        DEFAULT_BUDGET.episodic +
        DEFAULT_BUDGET.semantic +
        DEFAULT_BUDGET.procedural +
        DEFAULT_BUDGET.reserve
      expect(sum).toBe(1)
    })
  })
})

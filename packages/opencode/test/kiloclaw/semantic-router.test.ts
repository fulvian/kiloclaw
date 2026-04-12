// Semantic Router Tests
// Tests for capability-based routing implementation

import { describe, it, expect, beforeEach, afterEach, vi } from "bun:test"
import { tmpdir } from "../fixture/fixture"
import {
  CapabilityRegistry,
  getCapabilityRegistry,
  cosineSimilarity,
  hybridScore,
  DOMAIN_KEYWORD_HINTS,
  type CapabilityDescriptor,
  type Intent,
  type CapabilityMatch,
} from "../../src/kiloclaw/agency/routing/semantic"
import { MemoryEmbedding } from "../../src/kiloclaw/memory/memory.embedding"

const mockVec = (text: string) => {
  const hash = text.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const dim = 384
  return Array.from({ length: dim }, (_, i) => Math.sin(hash * (i + 1)))
}

beforeEach(() => {
  vi.spyOn(MemoryEmbedding, "embed").mockImplementation(async (text: string) => mockVec(text))
  vi.spyOn(MemoryEmbedding, "embedBatch").mockImplementation(async (texts: string[]) => texts.map(mockVec))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("Utility Functions", () => {
  describe("cosineSimilarity", () => {
    it("returns 1 for identical vectors", () => {
      const v = [1, 2, 3, 4, 5]
      expect(cosineSimilarity(v, v)).toBeCloseTo(1.0)
    })

    it("returns 0 for orthogonal vectors", () => {
      const v1 = [1, 0, 0]
      const v2 = [0, 1, 0]
      expect(cosineSimilarity(v1, v2)).toBeCloseTo(0.0)
    })

    it("returns -1 for opposite vectors", () => {
      const v1 = [1, 2, 3]
      const v2 = [-1, -2, -3]
      expect(cosineSimilarity(v1, v2)).toBeCloseTo(-1.0)
    })

    it("handles zero vectors", () => {
      const v1 = [0, 0, 0]
      const v2 = [1, 2, 3]
      expect(cosineSimilarity(v1, v2)).toBe(0)
    })

    it("handles mismatched dimensions", () => {
      const v1 = [1, 2, 3]
      const v2 = [1, 2]
      expect(cosineSimilarity(v1, v2)).toBe(0)
    })
  })

  describe("hybridScore", () => {
    it("weights embedding higher by default", () => {
      const score = hybridScore(0.8, 0.4)
      expect(score).toBeCloseTo(0.68) // 0.7*0.8 + 0.3*0.4
    })

    it("respects custom embedding weight", () => {
      const score = hybridScore(0.8, 0.4, 0.5)
      expect(score).toBeCloseTo(0.6) // 0.5*0.8 + 0.5*0.4
    })

    it("caps at 1.0", () => {
      const score = hybridScore(1.0, 1.0)
      expect(score).toBeLessThanOrEqual(1.0)
    })
  })

  describe("DOMAIN_KEYWORD_HINTS", () => {
    it("contains keywords for all major domains", () => {
      expect(DOMAIN_KEYWORD_HINTS.development).toBeDefined()
      expect(DOMAIN_KEYWORD_HINTS.knowledge).toBeDefined()
      expect(DOMAIN_KEYWORD_HINTS.nutrition).toBeDefined()
      expect(DOMAIN_KEYWORD_HINTS.weather).toBeDefined()
    })

    it("includes multilingual keywords", () => {
      // Italian keywords should be present
      expect(DOMAIN_KEYWORD_HINTS.knowledge.some((k) => k === "cerca" || k === "cercami")).toBe(true)
      expect(DOMAIN_KEYWORD_HINTS.development.some((k) => k === "codice")).toBe(true)
    })
  })
})

describe("CapabilityRegistry", () => {
  let registry: CapabilityRegistry

  beforeEach(() => {
    registry = new CapabilityRegistry()
  })

  describe("register", () => {
    it("registers a capability", () => {
      const cap: CapabilityDescriptor = {
        id: "web_search",
        domain: "knowledge",
        description: "Search the web for information",
        keywords: ["search", "find", "lookup"],
        metadata: {},
      }
      registry.register(cap)
      expect(registry.get("web_search")).toBeDefined()
      expect(registry.size()).toBe(1)
    })

    it("throws for duplicate capability", () => {
      const cap: CapabilityDescriptor = {
        id: "web_search",
        domain: "knowledge",
        description: "Search the web",
        keywords: ["search"],
        metadata: {},
      }
      registry.register(cap)
      expect(() => registry.register(cap)).toThrow()
    })
  })

  describe("unregister", () => {
    it("removes a capability", () => {
      const cap: CapabilityDescriptor = {
        id: "web_search",
        domain: "knowledge",
        description: "Search the web",
        keywords: ["search"],
        metadata: {},
      }
      registry.register(cap)
      expect(registry.unregister("web_search")).toBe(true)
      expect(registry.get("web_search")).toBeUndefined()
      expect(registry.size()).toBe(0)
    })

    it("returns false for non-existent capability", () => {
      expect(registry.unregister("non_existent")).toBe(false)
    })
  })

  describe("getByDomain", () => {
    it("returns capabilities for a domain", () => {
      registry.register({
        id: "web_search",
        domain: "knowledge",
        description: "Web search",
        keywords: ["search"],
        metadata: {},
      })
      registry.register({
        id: "code_gen",
        domain: "development",
        description: "Code generation",
        keywords: ["code", "generate"],
        metadata: {},
      })

      const knowledgeCaps = registry.getByDomain("knowledge")
      expect(knowledgeCaps).toHaveLength(1)
      expect(knowledgeCaps[0].id).toBe("web_search")
    })
  })

  describe("findByKeywords", () => {
    it("finds capabilities by keyword matching", () => {
      registry.register({
        id: "web_search",
        domain: "knowledge",
        description: "Search the web for information",
        keywords: ["search", "find", "lookup", "cerca"],
        metadata: {},
      })
      registry.register({
        id: "fact_check",
        domain: "knowledge",
        description: "Verify facts and claims",
        keywords: ["verify", "check", "confirm", "verifica"],
        metadata: {},
      })

      const matches = registry.findByKeywords(["search", "cerca"])
      expect(matches.length).toBeGreaterThan(0)
      expect(matches[0].capability.id).toBe("web_search")
    })

    it("respects threshold", () => {
      registry.register({
        id: "web_search",
        domain: "knowledge",
        description: "Web search",
        keywords: ["search", "find"],
        metadata: {},
      })

      const highThresholdMatches = registry.findByKeywords(["search"], 0.9)
      const lowThresholdMatches = registry.findByKeywords(["search"], 0.1)

      expect(lowThresholdMatches.length).toBeGreaterThanOrEqual(highThresholdMatches.length)
    })
  })

  describe("clear", () => {
    it("removes all capabilities", () => {
      registry.register({
        id: "web_search",
        domain: "knowledge",
        description: "Web search",
        keywords: ["search"],
        metadata: {},
      })
      registry.register({
        id: "code_gen",
        domain: "development",
        description: "Code generation",
        keywords: ["code"],
        metadata: {},
      })

      registry.clear()
      expect(registry.size()).toBe(0)
    })
  })
})

describe("CapabilityRegistry with Embeddings", () => {
  let registry: CapabilityRegistry

  beforeEach(() => {
    registry = new CapabilityRegistry()
  })

  describe("findSimilar", () => {
    it("finds capabilities by embedding similarity", async () => {
      // Register capability with pre-computed embedding
      const embedding = Array.from({ length: 384 }, (_, i) => Math.sin(i * 0.1))
      registry.register({
        id: "web_search",
        domain: "knowledge",
        description: "Search the web for information",
        keywords: ["search", "find"],
        embedding,
        metadata: {},
      })

      // Query with similar embedding
      const queryEmbedding = Array.from({ length: 384 }, (_, i) => Math.sin(i * 0.1 + 0.01))
      const matches = await registry.findSimilar(queryEmbedding, 0.8)

      expect(matches.length).toBeGreaterThan(0)
      expect(matches[0].capability.id).toBe("web_search")
      expect(matches[0].matchType).toBe("embedding")
    })

    it("returns empty array when no match above threshold", async () => {
      registry.register({
        id: "web_search",
        domain: "knowledge",
        description: "Web search",
        keywords: ["search"],
        embedding: Array.from({ length: 384 }, () => 0),
        metadata: {},
      })

      const queryEmbedding = Array.from({ length: 384 }, () => 1)
      const matches = await registry.findSimilar(queryEmbedding, 0.5)

      expect(matches.length).toBe(0)
    })
  })
})

describe("Intent Matching", () => {
  let registry: CapabilityRegistry

  beforeEach(() => {
    registry = new CapabilityRegistry()
  })

  const testCapabilities: CapabilityDescriptor[] = [
    {
      id: "web_search",
      domain: "knowledge",
      description: "Search the web for information, products, prices",
      keywords: ["search", "find", "lookup", "cercami", "cerca"],
      metadata: {},
    },
    {
      id: "product_research",
      domain: "knowledge",
      description: "Research products, compare prices, find best deals",
      keywords: ["product", "price", "compare", "annuncio", "annunci"],
      metadata: {},
    },
    {
      id: "code_generation",
      domain: "development",
      description: "Generate code, programming, software development",
      keywords: ["code", "generate", "program", "codice"],
      metadata: {},
    },
    {
      id: "debugging",
      domain: "development",
      description: "Debug code, fix errors, troubleshooting",
      keywords: ["debug", "fix", "error", "bug"],
      metadata: {},
    },
    {
      id: "nutrition_analysis",
      domain: "nutrition",
      description: "Analyze nutrition, diet, food composition",
      keywords: ["nutrition", "diet", "calories", "nutrizione"],
      metadata: {},
    },
    {
      id: "weather_forecast",
      domain: "weather",
      description: "Get weather forecasts and conditions",
      keywords: ["weather", "forecast", "temperature", "meteo"],
      metadata: {},
    },
  ]

  it("matches web search intent in English", async () => {
    for (const cap of testCapabilities) {
      registry.register(cap)
    }

    const matches = registry.findByKeywords(["search", "for", "information"])
    expect(matches.length).toBeGreaterThan(0)
    expect(matches[0].capability.id).toBe("web_search")
  })

  it("matches web search intent in Italian", async () => {
    for (const cap of testCapabilities) {
      registry.register(cap)
    }

    const matches = registry.findByKeywords(["cercami", "annunci", "MacBook"])
    expect(matches.length).toBeGreaterThan(0)
    // Should match either web_search or product_research
    const matchedIds = matches.map((m) => m.capability.id)
    expect(matchedIds).toContain("web_search")
    expect(matchedIds).toContain("product_research")
  })

  it("matches development domain for code-related queries", async () => {
    for (const cap of testCapabilities) {
      registry.register(cap)
    }

    const matches = registry.findByKeywords(["code", "generation"])
    expect(matches.length).toBeGreaterThan(0)
    expect(matches[0].capability.id).toBe("code_generation")
  })

  it("matches nutrition domain for diet-related queries", async () => {
    for (const cap of testCapabilities) {
      registry.register(cap)
    }

    const matches = registry.findByKeywords(["nutrition", "diet"])
    expect(matches.length).toBeGreaterThan(0)
    expect(matches[0].capability.id).toBe("nutrition_analysis")
  })
})

describe("Multilingual Capability Matching", () => {
  let registry: CapabilityRegistry

  beforeEach(() => {
    registry = new CapabilityRegistry()
  })

  it("handles Italian search queries", async () => {
    registry.register({
      id: "web_search",
      domain: "knowledge",
      description: "Search the web",
      keywords: ["search", "find", "cercami", "cerca"],
      metadata: {},
    })

    const matches = registry.findByKeywords(["cercami", "annunci"])
    expect(matches.some((m) => m.capability.id === "web_search")).toBe(true)
  })

  it("handles mixed language queries", async () => {
    registry.register({
      id: "product_research",
      domain: "knowledge",
      description: "Research products and prices",
      keywords: ["product", "price", "annuncio", "listino"],
      metadata: {},
    })

    const matches = registry.findByKeywords(["MacBook", "price", "annunci"])
    expect(matches.some((m) => m.capability.id === "product_research")).toBe(true)
  })
})

describe("getCapabilityRegistry singleton", () => {
  it("returns same instance", () => {
    const reg1 = getCapabilityRegistry()
    const reg2 = getCapabilityRegistry()
    expect(reg1).toBe(reg2)
  })
})

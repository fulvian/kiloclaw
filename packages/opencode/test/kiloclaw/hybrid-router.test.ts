// HybridRouter Integration Tests
// Tests for hybrid semantic + keyword routing

import { describe, it, expect, beforeEach, afterEach, vi } from "bun:test"
import { tmpdir } from "../fixture/fixture"
import {
  HybridRouter,
  type HybridIntentRouter,
  type HybridRoutingResult,
} from "../../src/kiloclaw/agency/routing/semantic/hybrid-router"
import type { Intent } from "../../src/kiloclaw/agency/routing/semantic"
import { MemoryEmbedding } from "../../src/kiloclaw/memory/memory.embedding"

const mockVec = (text: string) => {
  const hash = text.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const dim = 384
  return Array.from({ length: dim }, (_, i) => Math.sin(hash * (i + 1)))
}

describe("HybridRouter", () => {
  let router: HybridIntentRouter

  beforeEach(() => {
    vi.spyOn(MemoryEmbedding, "embed").mockImplementation(async (text: string) => mockVec(text))
    vi.spyOn(MemoryEmbedding, "embedBatch").mockImplementation(async (texts: string[]) => texts.map(mockVec))
    HybridRouter.reset()
    router = HybridRouter.create()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    HybridRouter.reset()
  })

  describe("create", () => {
    it("creates a hybrid router instance", () => {
      expect(router).toBeDefined()
      expect(typeof router.route).toBe("function")
      expect(typeof router.registerDomainHandler).toBe("function")
      expect(typeof router.unregisterDomainHandler).toBe("function")
    })
  })

  describe("route with keyword fallback", () => {
    it("routes a chat intent to knowledge agency", async () => {
      const intent: Intent = {
        id: "test-1",
        type: "chat",
        description: "Tell me about the weather",
        risk: "low",
      }

      const result = await router.route(intent)
      expect(result).toBeDefined()
      expect(result.agencyId).toBeDefined()
      expect(typeof result.confidence).toBe("number")
      expect(["knowledge", "weather"]).toContain(result.matchedDomain)
    })

    it("routes development intent to development agency", async () => {
      const intent: Intent = {
        id: "test-2",
        type: "task",
        description: "Write a function to sort an array",
        risk: "medium",
      }

      const result = await router.route(intent)
      expect(result).toBeDefined()
      expect(result.matchedDomain).toBeDefined()
    })

    it("includes routing method in result", async () => {
      const intent: Intent = {
        id: "test-3",
        type: "chat",
        description: "Search for the latest news",
        risk: "low",
      }

      const result = await router.route(intent)
      expect(result.routingMethod).toBeDefined()
      expect(["semantic", "keyword"]).toContain(result.routingMethod)
    })

    it("handles nutrition-related intents", async () => {
      const intent: Intent = {
        id: "test-4",
        type: "query",
        description: "What should I eat for a balanced diet?",
        risk: "low",
      }

      const result = await router.route(intent)
      expect(result).toBeDefined()
      expect(result.matchedDomain).toBeDefined()
    })
  })

  describe("domain handlers", () => {
    it("registers and calls domain handler for matching domain", async () => {
      let handlerCalled = false
      const customHandler = async (intent: Intent) => {
        handlerCalled = true
        return "custom-agency" as any
      }

      // Register handler for a domain that definitely matches
      router.registerDomainHandler("weather", customHandler)

      const intent: Intent = {
        id: "test-5",
        type: "query",
        description: "What is the weather forecast today?",
        risk: "low",
      }

      await router.route(intent)
      // Handler should be called when weather domain is matched
      expect(handlerCalled).toBe(true)
    })

    it("unregisters a domain handler", () => {
      const customHandler = async (intent: Intent) => "custom-agency" as any
      router.registerDomainHandler("knowledge", customHandler)
      router.unregisterDomainHandler("knowledge")

      // Should not throw
      expect(() => router.unregisterDomainHandler("knowledge")).not.toThrow()
    })
  })

  describe("getInstance singleton", () => {
    it("returns same instance on multiple calls", () => {
      const instance1 = HybridRouter.getInstance()
      const instance2 = HybridRouter.getInstance()
      expect(instance1).toBe(instance2)
    })

    it("returns different instance after reset", () => {
      const instance1 = HybridRouter.getInstance()
      HybridRouter.reset()
      const instance2 = HybridRouter.getInstance()
      expect(instance1).not.toBe(instance2)
    })
  })
})

describe("HybridRouter multilingual support", () => {
  let router: HybridIntentRouter

  beforeEach(() => {
    HybridRouter.reset()
    router = HybridRouter.create()
  })

  afterEach(() => {
    HybridRouter.reset()
  })

  it("handles Italian queries", async () => {
    const intent: Intent = {
      id: "test-it-1",
      type: "query",
      description: "Cercami informazioni sul machine learning",
      risk: "low",
    }

    const result = await router.route(intent)
    expect(result).toBeDefined()
    expect(result.matchedDomain).toBeDefined()
  })

  it("handles English queries", async () => {
    const intent: Intent = {
      id: "test-en-1",
      type: "query",
      description: "Find me a recipe for pasta",
      risk: "low",
    }

    const result = await router.route(intent)
    expect(result).toBeDefined()
    expect(result.matchedDomain).toBeDefined()
  })

  it("handles mixed language queries", async () => {
    const intent: Intent = {
      id: "test-mixed-1",
      type: "query",
      description: "Show me annunci for MacBook Pro price",
      risk: "low",
    }

    const result = await router.route(intent)
    expect(result).toBeDefined()
    expect(result.matchedDomain).toBe("knowledge")
  })
})

describe("HybridRouter confidence scoring", () => {
  let router: HybridIntentRouter

  beforeEach(() => {
    HybridRouter.reset()
    router = HybridRouter.create()
  })

  afterEach(() => {
    HybridRouter.reset()
  })

  it("returns confidence between 0 and 1", async () => {
    const intent: Intent = {
      id: "test-conf-1",
      type: "chat",
      description: "Hello world",
      risk: "low",
    }

    const result = await router.route(intent)
    expect(result.confidence).toBeGreaterThanOrEqual(0)
    expect(result.confidence).toBeLessThanOrEqual(1)
  })

  it("includes scores for each domain", async () => {
    const intent: Intent = {
      id: "test-scores-1",
      type: "query",
      description: "What is the capital of France?",
      risk: "low",
    }

    const result = await router.route(intent)
    expect(result.scores).toBeDefined()
    expect(Array.isArray(result.scores)).toBe(true)
  })
})

describe("HybridRouter error handling", () => {
  let router: HybridIntentRouter

  beforeEach(() => {
    HybridRouter.reset()
    router = HybridRouter.create()
  })

  afterEach(() => {
    HybridRouter.reset()
  })

  it("handles intents with minimal description", async () => {
    const intent: Intent = {
      id: "test-min-1",
      type: "chat",
      description: "",
      risk: "low",
    }

    const result = await router.route(intent)
    expect(result).toBeDefined()
    expect(result.agencyId).toBeDefined()
  })

  it("handles intents without description", async () => {
    const intent: Intent = {
      id: "test-nodev-1",
      type: "task",
      description: "",
      risk: "medium",
    }

    const result = await router.route(intent)
    expect(result).toBeDefined()
  })
})

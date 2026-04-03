// ChainRegistry Tests - Phase 2: Flexible Agency Architecture

import { describe, it, expect, beforeEach } from "bun:test"
import { ChainRegistry } from "@/kiloclaw/agency/registry/chain-registry"
import type { SkillChain } from "@/kiloclaw/agency/registry/types"

// Test fixtures
const createTestChain = (overrides: Partial<SkillChain> = {}): SkillChain => ({
  id: "test-chain",
  name: "Test Chain",
  description: "A test chain for unit testing",
  steps: [{ skillId: "skill-1" }],
  outputSchema: {},
  version: "1.0.0",
  ...overrides,
})

describe("ChainRegistry", () => {
  beforeEach(() => {
    ChainRegistry.clear()
  })

  describe("registerChain", () => {
    it("should register a valid chain", () => {
      const chain = createTestChain({ id: "search-analyze", steps: [{ skillId: "search" }, { skillId: "analyze" }] })
      ChainRegistry.registerChain(chain)
      const result = ChainRegistry.getChain("search-analyze")
      expect(result).toBeDefined()
      expect(result?.id).toBe("search-analyze")
      expect(result?.steps).toHaveLength(2)
    })

    it("should throw when registering duplicate chain", () => {
      const chain = createTestChain({ id: "duplicate" })
      ChainRegistry.registerChain(chain)
      expect(() => ChainRegistry.registerChain(chain)).toThrow("Chain duplicate already registered")
    })

    it("should throw on invalid chain definition", () => {
      const invalidChain = createTestChain({ id: "invalid", version: "not-semver" }) as SkillChain
      expect(() => ChainRegistry.registerChain(invalidChain)).toThrow()
    })

    it("should throw on chain with no steps", () => {
      const noStepsChain = createTestChain({ id: "no-steps", steps: [] }) as SkillChain
      expect(() => ChainRegistry.registerChain(noStepsChain)).toThrow()
    })
  })

  describe("unregisterChain", () => {
    it("should unregister existing chain", () => {
      ChainRegistry.registerChain(createTestChain({ id: "to-remove" }))
      const result = ChainRegistry.unregisterChain("to-remove")
      expect(result).toBe(true)
      expect(ChainRegistry.getChain("to-remove")).toBeUndefined()
    })

    it("should return false for non-existent chain", () => {
      const result = ChainRegistry.unregisterChain("non-existent")
      expect(result).toBe(false)
    })
  })

  describe("getChain", () => {
    it("should retrieve registered chain", () => {
      const chain = createTestChain({ id: "retrievable" })
      ChainRegistry.registerChain(chain)
      const result = ChainRegistry.getChain("retrievable")
      expect(result?.id).toBe("retrievable")
    })

    it("should return undefined for non-existent chain", () => {
      const result = ChainRegistry.getChain("non-existent")
      expect(result).toBeUndefined()
    })
  })

  describe("getAllChains", () => {
    it("should return all registered chains", () => {
      ChainRegistry.registerChain(createTestChain({ id: "chain-1" }))
      ChainRegistry.registerChain(createTestChain({ id: "chain-2" }))
      const result = ChainRegistry.getAllChains()
      expect(result).toHaveLength(2)
    })

    it("should return empty array when registry is empty", () => {
      const result = ChainRegistry.getAllChains()
      expect(result).toHaveLength(0)
    })
  })

  describe("findChainForCapabilities", () => {
    it("should find chain by single capability", () => {
      ChainRegistry.registerChain(
        createTestChain({
          id: "search-chain",
          steps: [{ skillId: "search" }, { skillId: "analyze" }],
        }),
      )
      const result = ChainRegistry.findChainForCapabilities(["search"])
      expect(result).toBeDefined()
      expect(result?.id).toBe("search-chain")
    })

    it("should find chain by multiple capabilities", () => {
      ChainRegistry.registerChain(
        createTestChain({
          id: "research-chain",
          steps: [{ skillId: "search" }, { skillId: "analyze" }, { skillId: "summarize" }],
        }),
      )
      const result = ChainRegistry.findChainForCapabilities(["search", "analyze"])
      expect(result).toBeDefined()
      expect(result?.id).toBe("research-chain")
    })

    it("should return undefined when no chain matches all capabilities", () => {
      ChainRegistry.registerChain(
        createTestChain({
          id: "limited-chain",
          steps: [{ skillId: "search" }],
        }),
      )
      const result = ChainRegistry.findChainForCapabilities(["search", "analyze"])
      expect(result).toBeUndefined()
    })

    it("should return undefined when no chains registered", () => {
      const result = ChainRegistry.findChainForCapabilities(["search"])
      expect(result).toBeUndefined()
    })

    it("should return first matching chain when multiple match", () => {
      ChainRegistry.registerChain(
        createTestChain({
          id: "first-chain",
          steps: [{ skillId: "search" }, { skillId: "analyze" }],
        }),
      )
      ChainRegistry.registerChain(
        createTestChain({
          id: "second-chain",
          steps: [{ skillId: "search" }, { skillId: "analyze" }],
        }),
      )
      const result = ChainRegistry.findChainForCapabilities(["search", "analyze"])
      expect(result).toBeDefined()
      // Returns first registered
      expect(["first-chain", "second-chain"]).toContain(result!.id)
    })
  })

  describe("clear", () => {
    it("should remove all chains from registry", () => {
      ChainRegistry.registerChain(createTestChain({ id: "chain-1" }))
      ChainRegistry.registerChain(createTestChain({ id: "chain-2" }))
      ChainRegistry.clear()
      const result = ChainRegistry.getAllChains()
      expect(result).toHaveLength(0)
    })
  })
})

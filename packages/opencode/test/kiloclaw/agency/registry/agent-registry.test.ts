// FlexibleAgentRegistry Tests - Phase 2: Flexible Agency Architecture

import { describe, it, expect, beforeEach } from "bun:test"
import { FlexibleAgentRegistry } from "@/kiloclaw/agency/registry/agent-registry"
import type { FlexibleAgentDefinition } from "@/kiloclaw/agency/registry/types"

// Test fixtures
const defaultAgent: FlexibleAgentDefinition = {
  id: "test-agent",
  name: "Test Agent",
  primaryAgency: "test-agency",
  secondaryAgencies: [],
  capabilities: ["test"],
  skills: [],
  constraints: {},
  version: "1.0.0",
}

const createTestAgent = (overrides: Partial<FlexibleAgentDefinition> = {}): FlexibleAgentDefinition => ({
  ...defaultAgent,
  ...overrides,
})

describe("FlexibleAgentRegistry", () => {
  beforeEach(() => {
    FlexibleAgentRegistry.clear()
  })

  describe("registerAgent", () => {
    it("should register a valid agent", () => {
      const agent = createTestAgent({ id: "dev-coder", capabilities: ["coding", "review"] })
      FlexibleAgentRegistry.registerAgent(agent)
      const result = FlexibleAgentRegistry.getAgent("dev-coder")
      expect(result).toBeDefined()
      expect(result?.id).toBe("dev-coder")
      expect(result?.capabilities).toEqual(["coding", "review"])
    })

    it("should throw when registering duplicate agent", () => {
      const agent = createTestAgent({ id: "duplicate" })
      FlexibleAgentRegistry.registerAgent(agent)
      expect(() => FlexibleAgentRegistry.registerAgent(agent)).toThrow("Agent duplicate already registered")
    })

    it("should throw on invalid agent definition", () => {
      const invalidAgent = createTestAgent({ id: "" }) as FlexibleAgentDefinition
      expect(() => FlexibleAgentRegistry.registerAgent(invalidAgent)).toThrow()
    })

    it("should throw on agent without capabilities", () => {
      const noCapsAgent = createTestAgent({ id: "no-caps", capabilities: [] as unknown as string[] })
      expect(() => FlexibleAgentRegistry.registerAgent(noCapsAgent)).toThrow()
    })
  })

  describe("unregisterAgent", () => {
    it("should unregister existing agent", () => {
      FlexibleAgentRegistry.registerAgent(createTestAgent({ id: "to-remove" }))
      const result = FlexibleAgentRegistry.unregisterAgent("to-remove")
      expect(result).toBe(true)
      expect(FlexibleAgentRegistry.getAgent("to-remove")).toBeUndefined()
    })

    it("should return false for non-existent agent", () => {
      const result = FlexibleAgentRegistry.unregisterAgent("non-existent")
      expect(result).toBe(false)
    })
  })

  describe("getAgent", () => {
    it("should retrieve registered agent", () => {
      const agent = createTestAgent({ id: "retrievable" })
      FlexibleAgentRegistry.registerAgent(agent)
      const result = FlexibleAgentRegistry.getAgent("retrievable")
      expect(result?.id).toBe("retrievable")
    })

    it("should return undefined for non-existent agent", () => {
      const result = FlexibleAgentRegistry.getAgent("non-existent")
      expect(result).toBeUndefined()
    })
  })

  describe("getAllAgents", () => {
    it("should return all registered agents", () => {
      FlexibleAgentRegistry.registerAgent(createTestAgent({ id: "agent-1" }))
      FlexibleAgentRegistry.registerAgent(createTestAgent({ id: "agent-2" }))
      const result = FlexibleAgentRegistry.getAllAgents()
      expect(result).toHaveLength(2)
    })

    it("should return empty array when registry is empty", () => {
      const result = FlexibleAgentRegistry.getAllAgents()
      expect(result).toHaveLength(0)
    })
  })

  describe("findByCapabilities", () => {
    it("should find agents by single capability", () => {
      FlexibleAgentRegistry.registerAgent(createTestAgent({ id: "coder", capabilities: ["coding"] }))
      FlexibleAgentRegistry.registerAgent(createTestAgent({ id: "reviewer", capabilities: ["review"] }))
      const result = FlexibleAgentRegistry.findByCapabilities(["coding"])
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("coder")
    })

    it("should find agents by multiple capabilities (OR semantics)", () => {
      FlexibleAgentRegistry.registerAgent(createTestAgent({ id: "coder", capabilities: ["coding", "review"] }))
      FlexibleAgentRegistry.registerAgent(createTestAgent({ id: "reviewer", capabilities: ["review", "analysis"] }))
      const result = FlexibleAgentRegistry.findByCapabilities(["coding", "review"])
      expect(result).toHaveLength(2) // OR: both agents match at least one capability
      expect(result[0].id).toBe("coder") // coder matches both, higher score
    })

    it("should return all agents when no capabilities specified", () => {
      FlexibleAgentRegistry.registerAgent(createTestAgent({ id: "agent-1" }))
      FlexibleAgentRegistry.registerAgent(createTestAgent({ id: "agent-2" }))
      const result = FlexibleAgentRegistry.findByCapabilities([])
      expect(result).toHaveLength(2)
    })

    it("should return empty array when no agents match", () => {
      FlexibleAgentRegistry.registerAgent(createTestAgent({ id: "coder", capabilities: ["coding"] }))
      const result = FlexibleAgentRegistry.findByCapabilities(["nonexistent"])
      expect(result).toHaveLength(0)
    })

    it("should sort by match score descending", () => {
      FlexibleAgentRegistry.registerAgent(
        createTestAgent({ id: "fullstack", capabilities: ["coding", "review", "debugging", "testing"] }),
      )
      FlexibleAgentRegistry.registerAgent(createTestAgent({ id: "junior", capabilities: ["coding"] }))
      const result = FlexibleAgentRegistry.findByCapabilities(["coding", "review", "debugging", "testing"])
      expect(result[0].id).toBe("fullstack")
    })

    it("should filter by agency when specified", () => {
      FlexibleAgentRegistry.registerAgent(
        createTestAgent({ id: "dev-coder", primaryAgency: "development", capabilities: ["coding"] }),
      )
      FlexibleAgentRegistry.registerAgent(
        createTestAgent({ id: "research-coder", primaryAgency: "knowledge", capabilities: ["coding", "research"] }),
      )
      const result = FlexibleAgentRegistry.findByCapabilities(["coding"], "development")
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("dev-coder")
    })
  })

  describe("getAgentsByAgency", () => {
    it("should find agents by primary agency", () => {
      FlexibleAgentRegistry.registerAgent(createTestAgent({ id: "dev-agent", primaryAgency: "development" }))
      FlexibleAgentRegistry.registerAgent(createTestAgent({ id: "research-agent", primaryAgency: "knowledge" }))
      const result = FlexibleAgentRegistry.getAgentsByAgency("development")
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("dev-agent")
    })

    it("should find agents by secondary agency", () => {
      FlexibleAgentRegistry.registerAgent(
        createTestAgent({ id: "cross-agent", primaryAgency: "development", secondaryAgencies: ["knowledge"] }),
      )
      FlexibleAgentRegistry.registerAgent(createTestAgent({ id: "dev-agent", primaryAgency: "development" }))
      const result = FlexibleAgentRegistry.getAgentsByAgency("knowledge")
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("cross-agent")
    })

    it("should return empty array for non-existent agency", () => {
      const result = FlexibleAgentRegistry.getAgentsByAgency("non-existent")
      expect(result).toHaveLength(0)
    })
  })

  describe("clear", () => {
    it("should remove all agents from registry", () => {
      FlexibleAgentRegistry.registerAgent(createTestAgent({ id: "agent-1" }))
      FlexibleAgentRegistry.registerAgent(createTestAgent({ id: "agent-2" }))
      FlexibleAgentRegistry.clear()
      const result = FlexibleAgentRegistry.getAllAgents()
      expect(result).toHaveLength(0)
    })
  })
})

/**
 * Routing to Chain Executor Integration Tests
 * P1: Integration tests for execution bridge
 *
 * Tests the connection between routing decisions and skill/chain execution
 * via the execution bridge.
 */

import { describe, expect, test } from "bun:test"
import { getSkill } from "../../src/kiloclaw/agency/chain-executor"
import { ChainRegistry } from "../../src/kiloclaw/agency/registry/chain-registry"

describe("execution-bridge", () => {
  describe("getSkill (from chain-executor)", () => {
    test("returns skill for valid skill ID", () => {
      const skill = getSkill("web-research")
      expect(skill).toBeDefined()
      expect(skill?.id).toBe("web-research")
      expect(skill?.name).toBe("Web Research")
    })

    test("returns undefined for invalid skill ID", () => {
      const skill = getSkill("non-existent-skill")
      expect(skill).toBeUndefined()
    })

    test("returns all knowledge agency skills", () => {
      const skills = ["web-research", "synthesis", "fact-check", "literature-review", "critical-analysis"]
      for (const skillId of skills) {
        const skill = getSkill(skillId)
        expect(skill).toBeDefined()
        expect(skill?.id).toBe(skillId)
      }
    })

    test("returns all development agency skills", () => {
      const skills = ["code-review", "debugging", "tdd", "comparison", "document-analysis", "simplification"]
      for (const skillId of skills) {
        const skill = getSkill(skillId)
        expect(skill).toBeDefined()
        expect(skill?.id).toBe(skillId)
      }
    })

    test("returns nutrition agency skills", () => {
      const skills = ["diet-plan", "nutrition-analysis", "food-recall", "recipe-search"]
      for (const skillId of skills) {
        const skill = getSkill(skillId)
        expect(skill).toBeDefined()
        expect(skill?.id).toBe(skillId)
      }
    })

    test("returns weather agency skills", () => {
      const skills = ["weather-forecast", "weather-alerts", "weather-current"]
      for (const skillId of skills) {
        const skill = getSkill(skillId)
        expect(skill).toBeDefined()
        expect(skill?.id).toBe(skillId)
      }
    })
  })

  describe("skill registry structure", () => {
    test("all skills have required properties", () => {
      const skillIds = [
        "web-research",
        "synthesis",
        "fact-check",
        "literature-review",
        "critical-analysis",
        "code-review",
        "debugging",
        "tdd",
        "comparison",
        "document-analysis",
        "simplification",
      ]

      for (const skillId of skillIds) {
        const skill = getSkill(skillId)
        expect(skill).toBeDefined()
        expect(skill?.id as string).toBe(skillId)
        expect(skill?.name).toBeDefined()
        expect(skill?.version).toBeDefined()
        expect(skill?.capabilities).toBeDefined()
        expect(Array.isArray(skill?.capabilities)).toBe(true)
        expect(skill?.tags).toBeDefined()
        expect(Array.isArray(skill?.tags)).toBe(true)
        expect(typeof skill?.execute).toBe("function")
      }
    })

    test("skills have correct input/output schemas", () => {
      const skill = getSkill("web-research")
      expect(skill?.inputSchema).toBeDefined()
      expect(skill?.inputSchema.type).toBe("object")
      expect(skill?.outputSchema).toBeDefined()
      expect(skill?.outputSchema.type).toBe("object")
    })
  })

  describe("chain registry", () => {
    test("ChainRegistry is available", () => {
      expect(ChainRegistry).toBeDefined()
      expect(typeof ChainRegistry.registerChain).toBe("function")
      expect(typeof ChainRegistry.getChain).toBe("function")
      expect(typeof ChainRegistry.getAllChains).toBe("function")
    })

    test("getChain returns undefined for non-existent chain", () => {
      const chain = ChainRegistry.getChain("definitely-does-not-exist")
      expect(chain).toBeUndefined()
    })

    test("getAllChains returns array", () => {
      const chains = ChainRegistry.getAllChains()
      expect(Array.isArray(chains)).toBe(true)
    })
  })
})

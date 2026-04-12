/**
 * Agency Skill Execution E2E Tests
 * P1: End-to-end tests for agency skill execution
 *
 * Tests the skill registry and execution interface
 */

import { describe, expect, test } from "bun:test"
import { getSkill } from "../../src/kiloclaw/agency/chain-executor"
import { knowledgeSkills, developmentSkills, nutritionSkills, weatherSkills } from "../../src/kiloclaw/skills"

describe("agency-skill-execution e2e", () => {
  describe("knowledge agency skills", () => {
    test("web-research skill is available", () => {
      const skill = getSkill("web-research")
      expect(skill).toBeDefined()
      expect(skill?.id).toBe("web-research")
      expect(skill?.capabilities).toContain("search")
    })

    test("synthesis skill is available", () => {
      const skill = getSkill("synthesis")
      expect(skill).toBeDefined()
      expect(skill?.id).toBe("synthesis")
    })

    test("fact-check skill is available", () => {
      const skill = getSkill("fact-check")
      expect(skill).toBeDefined()
      expect(skill?.id).toBe("fact-check")
    })

    test("literature-review skill is available", () => {
      const skill = getSkill("literature-review")
      expect(skill).toBeDefined()
      expect(skill?.id).toBe("literature-review")
    })

    test("critical-analysis skill is available", () => {
      const skill = getSkill("critical-analysis")
      expect(skill).toBeDefined()
      expect(skill?.id).toBe("critical-analysis")
    })
  })

  describe("development agency skills", () => {
    test("code-review skill is available", () => {
      const skill = getSkill("code-review")
      expect(skill).toBeDefined()
      expect(skill?.id).toBe("code-review")
    })

    test("debugging skill is available", () => {
      const skill = getSkill("debugging")
      expect(skill).toBeDefined()
      expect(skill?.id).toBe("debugging")
    })

    test("tdd skill is available", () => {
      const skill = getSkill("tdd")
      expect(skill).toBeDefined()
      expect(skill?.id).toBe("tdd")
    })

    test("comparison skill is available", () => {
      const skill = getSkill("comparison")
      expect(skill).toBeDefined()
      expect(skill?.id).toBe("comparison")
    })

    test("document-analysis skill is available", () => {
      const skill = getSkill("document-analysis")
      expect(skill).toBeDefined()
      expect(skill?.id).toBe("document-analysis")
    })

    test("simplification skill is available", () => {
      const skill = getSkill("simplification")
      expect(skill).toBeDefined()
      expect(skill?.id).toBe("simplification")
    })
  })

  describe("nutrition agency skills", () => {
    test("diet-plan skill is available", () => {
      const skill = getSkill("diet-plan")
      expect(skill).toBeDefined()
      expect(skill?.id).toBe("diet-plan")
    })

    test("nutrition-analysis skill is available", () => {
      const skill = getSkill("nutrition-analysis")
      expect(skill).toBeDefined()
      expect(skill?.id).toBe("nutrition-analysis")
    })

    test("food-recall skill is available", () => {
      const skill = getSkill("food-recall")
      expect(skill).toBeDefined()
      expect(skill?.id).toBe("food-recall")
    })

    test("recipe-search skill is available", () => {
      const skill = getSkill("recipe-search")
      expect(skill).toBeDefined()
      expect(skill?.id).toBe("recipe-search")
    })
  })

  describe("weather agency skills", () => {
    test("weather-forecast skill is available", () => {
      const skill = getSkill("weather-forecast")
      expect(skill).toBeDefined()
      expect(skill?.id).toBe("weather-forecast")
    })

    test("weather-alerts skill is available", () => {
      const skill = getSkill("weather-alerts")
      expect(skill).toBeDefined()
      expect(skill?.id).toBe("weather-alerts")
    })

    test("weather-current skill is available", () => {
      const skill = getSkill("weather-current")
      expect(skill).toBeDefined()
      expect(skill?.id).toBe("weather-current")
    })
  })

  describe("skill execute interface", () => {
    test("knowledge skills have execute method", () => {
      for (const skill of knowledgeSkills) {
        expect(typeof skill.execute).toBe("function")
      }
    })

    test("development skills have execute method", () => {
      for (const skill of developmentSkills) {
        expect(typeof skill.execute).toBe("function")
      }
    })

    test("nutrition skills have execute method", () => {
      for (const skill of nutritionSkills) {
        expect(typeof skill.execute).toBe("function")
      }
    })

    test("weather skills have execute method", () => {
      for (const skill of weatherSkills) {
        expect(typeof skill.execute).toBe("function")
      }
    })

    test("web-research skill has correct input schema", () => {
      const skill = getSkill("web-research")
      expect(skill?.inputSchema).toBeDefined()
      expect(skill?.inputSchema.type).toBe("object")
      expect(skill?.inputSchema.properties).toHaveProperty("query")
    })

    test("web-research skill has correct output schema", () => {
      const skill = getSkill("web-research")
      expect(skill?.outputSchema).toBeDefined()
      expect(skill?.outputSchema.type).toBe("object")
      expect(skill?.outputSchema.properties).toHaveProperty("results")
      expect(skill?.outputSchema.properties).toHaveProperty("summary")
    })
  })

  describe("skills have expected telemetry properties", () => {
    test("skills have tags for telemetry", () => {
      const skill = getSkill("web-research")
      expect(skill?.tags).toBeDefined()
      expect(Array.isArray(skill?.tags)).toBe(true)
      expect(skill?.tags.length).toBeGreaterThan(0)
    })

    test("skills have capabilities for routing", () => {
      const skill = getSkill("web-research")
      expect(skill?.capabilities).toBeDefined()
      expect(Array.isArray(skill?.capabilities)).toBe(true)
      expect(skill?.capabilities.length).toBeGreaterThan(0)
    })

    test("skills have version information", () => {
      const skill = getSkill("web-research")
      expect(skill?.version).toBeDefined()
      expect(typeof skill?.version).toBe("string")
    })
  })

  describe("skill registry consistency", () => {
    test("skills from chain executor registry are available via getSkill", () => {
      // These are the skills that are in the chain-executor registry
      const registeredSkills = [
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
        "diet-plan",
        "nutrition-analysis",
        "food-recall",
        "recipe-search",
        "weather-forecast",
        "weather-alerts",
        "weather-current",
      ]

      for (const skillId of registeredSkills) {
        const retrieved = getSkill(skillId)
        expect(retrieved).toBeDefined()
        expect(retrieved?.id).toBe(skillId)
      }
    })
  })
})

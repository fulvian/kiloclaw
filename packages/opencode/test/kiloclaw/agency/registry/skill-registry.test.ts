// SkillRegistry Tests - Phase 2: Flexible Agency Architecture

import { describe, it, expect, beforeEach } from "bun:test"
import { SkillRegistry } from "@/kiloclaw/agency/registry/skill-registry"
import type { SkillDefinition } from "@/kiloclaw/agency/registry/types"

// Test fixtures
const createTestSkill = (overrides: Partial<SkillDefinition> = {}): SkillDefinition => ({
  id: "test-skill",
  name: "Test Skill",
  version: "1.0.0",
  description: "A test skill for unit testing",
  inputSchema: {},
  outputSchema: {},
  capabilities: ["test"],
  tags: ["testing"],
  ...overrides,
})

describe("SkillRegistry", () => {
  beforeEach(() => {
    SkillRegistry.clear()
  })

  describe("registerSkill", () => {
    it("should register a valid skill", () => {
      const skill = createTestSkill({ id: "web-search", capabilities: ["search", "web"] })
      SkillRegistry.registerSkill(skill)
      const result = SkillRegistry.getSkill("web-search")
      expect(result).toBeDefined()
      expect(result?.id).toBe("web-search")
      expect(result?.capabilities).toEqual(["search", "web"])
    })

    it("should throw when registering duplicate skill", () => {
      const skill = createTestSkill({ id: "duplicate" })
      SkillRegistry.registerSkill(skill)
      expect(() => SkillRegistry.registerSkill(skill)).toThrow("Skill duplicate already registered")
    })

    it("should throw on invalid skill definition", () => {
      const invalidSkill = createTestSkill({ id: "" }) as SkillDefinition
      expect(() => SkillRegistry.registerSkill(invalidSkill)).toThrow()
    })

    it("should throw on skill without capabilities", () => {
      const noCapsSkill = createTestSkill({ id: "no-caps", capabilities: [] as unknown as string[] })
      expect(() => SkillRegistry.registerSkill(noCapsSkill)).toThrow()
    })

    it("should throw on invalid semver version", () => {
      const badVersion = createTestSkill({ id: "bad-version", version: "latest" })
      expect(() => SkillRegistry.registerSkill(badVersion)).toThrow()
    })
  })

  describe("unregisterSkill", () => {
    it("should unregister existing skill", () => {
      SkillRegistry.registerSkill(createTestSkill({ id: "to-remove" }))
      const result = SkillRegistry.unregisterSkill("to-remove")
      expect(result).toBe(true)
      expect(SkillRegistry.getSkill("to-remove")).toBeUndefined()
    })

    it("should return false for non-existent skill", () => {
      const result = SkillRegistry.unregisterSkill("non-existent")
      expect(result).toBe(false)
    })
  })

  describe("getSkill", () => {
    it("should retrieve registered skill", () => {
      const skill = createTestSkill({ id: "retrievable" })
      SkillRegistry.registerSkill(skill)
      const result = SkillRegistry.getSkill("retrievable")
      expect(result?.id).toBe("retrievable")
    })

    it("should return undefined for non-existent skill", () => {
      const result = SkillRegistry.getSkill("non-existent")
      expect(result).toBeUndefined()
    })
  })

  describe("getAllSkills", () => {
    it("should return all registered skills", () => {
      SkillRegistry.registerSkill(createTestSkill({ id: "skill-1" }))
      SkillRegistry.registerSkill(createTestSkill({ id: "skill-2" }))
      const result = SkillRegistry.getAllSkills()
      expect(result).toHaveLength(2)
    })

    it("should return empty array when registry is empty", () => {
      const result = SkillRegistry.getAllSkills()
      expect(result).toHaveLength(0)
    })
  })

  describe("findByCapabilities", () => {
    it("should find skills by single capability", () => {
      SkillRegistry.registerSkill(createTestSkill({ id: "web-search", capabilities: ["search", "web"] }))
      SkillRegistry.registerSkill(createTestSkill({ id: "code-gen", capabilities: ["coding", "generation"] }))
      const result = SkillRegistry.findByCapabilities(["search"])
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("web-search")
    })

    it("should find skills by multiple capabilities (OR semantics)", () => {
      SkillRegistry.registerSkill(createTestSkill({ id: "skill-a", capabilities: ["search", "analysis"] }))
      SkillRegistry.registerSkill(createTestSkill({ id: "skill-b", capabilities: ["analysis", "synthesis"] }))
      const result = SkillRegistry.findByCapabilities(["search", "analysis"])
      expect(result).toHaveLength(2) // OR: both skills match at least one capability
      expect(result[0].id).toBe("skill-a") // skill-a matches both, higher score
    })

    it("should return all skills when no capabilities specified", () => {
      SkillRegistry.registerSkill(createTestSkill({ id: "skill-1" }))
      SkillRegistry.registerSkill(createTestSkill({ id: "skill-2" }))
      const result = SkillRegistry.findByCapabilities([])
      expect(result).toHaveLength(2)
    })

    it("should return empty array when no skills match", () => {
      SkillRegistry.registerSkill(createTestSkill({ id: "search-skill", capabilities: ["search"] }))
      const result = SkillRegistry.findByCapabilities(["nonexistent"])
      expect(result).toHaveLength(0)
    })

    it("should return matching skills when at least one capability matches (OR semantics)", () => {
      SkillRegistry.registerSkill(createTestSkill({ id: "skill-a", capabilities: ["search"] }))
      SkillRegistry.registerSkill(createTestSkill({ id: "skill-b", capabilities: ["analysis"] }))
      const result = SkillRegistry.findByCapabilities(["search", "synthesis"])
      expect(result).toHaveLength(1) // OR: skill-a matches "search"
      expect(result[0].id).toBe("skill-a")
    })
  })

  describe("findByTag", () => {
    it("should find skills by tag", () => {
      SkillRegistry.registerSkill(createTestSkill({ id: "doc-skill", tags: ["documentation", "writing"] }))
      SkillRegistry.registerSkill(createTestSkill({ id: "code-skill", tags: ["coding"] }))
      const result = SkillRegistry.findByTag("documentation")
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("doc-skill")
    })

    it("should return empty array for non-existent tag", () => {
      const result = SkillRegistry.findByTag("nonexistent-tag")
      expect(result).toHaveLength(0)
    })
  })

  describe("getVersion", () => {
    it("should return version for registered skill", () => {
      SkillRegistry.registerSkill(createTestSkill({ id: "versioned-skill", version: "2.5.0" }))
      const result = SkillRegistry.getVersion("versioned-skill")
      expect(result).toBe("2.5.0")
    })

    it("should return undefined for non-existent skill", () => {
      const result = SkillRegistry.getVersion("non-existent")
      expect(result).toBeUndefined()
    })
  })

  describe("clear", () => {
    it("should remove all skills from registry", () => {
      SkillRegistry.registerSkill(createTestSkill({ id: "skill-1" }))
      SkillRegistry.registerSkill(createTestSkill({ id: "skill-2" }))
      SkillRegistry.clear()
      const result = SkillRegistry.getAllSkills()
      expect(result).toHaveLength(0)
    })
  })
})

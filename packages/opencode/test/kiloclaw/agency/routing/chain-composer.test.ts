import { test, expect, beforeEach, afterEach, describe } from "bun:test"
import { ChainComposer, ChainCompositionError } from "../../../../src/kiloclaw/agency/routing/chain-composer"
import { SkillRegistry } from "../../../../src/kiloclaw/agency/registry/skill-registry"
import { ChainRegistry } from "../../../../src/kiloclaw/agency/registry/chain-registry"
import type { SkillDefinition, SkillChain } from "../../../../src/kiloclaw/agency/registry/types"

// Helper to create a minimal skill
function createSkill(override: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    id: override.id ?? "test-skill",
    name: override.name ?? "Test Skill",
    version: override.version ?? "1.0.0",
    description: override.description ?? "A test skill",
    inputSchema: override.inputSchema ?? {},
    outputSchema: override.outputSchema ?? {},
    capabilities: override.capabilities ?? ["test"],
    tags: override.tags ?? [],
    ...override,
  }
}

// Helper to create a minimal chain
function createChain(override: Partial<SkillChain> = {}): SkillChain {
  return {
    id: override.id ?? "test-chain",
    name: override.name ?? "Test Chain",
    description: override.description ?? "",
    steps: override.steps ?? [{ skillId: "step-skill" }],
    outputSchema: override.outputSchema ?? {},
    version: override.version ?? "1.0.0",
  }
}

describe("ChainComposer", () => {
  beforeEach(() => {
    SkillRegistry.clear()
    ChainRegistry.clear()
  })

  afterEach(() => {
    SkillRegistry.clear()
    ChainRegistry.clear()
  })

  describe("canCompose", () => {
    test("given empty capabilities when canCompose then returns false", () => {
      expect(ChainComposer.canCompose([])).toBe(false)
    })

    test("given no skills registered when canCompose then returns false", () => {
      expect(ChainComposer.canCompose(["search"])).toBe(false)
    })

    test("given skill matching capability when canCompose then returns true", () => {
      const skill = createSkill({ id: "search-skill", capabilities: ["search"] })
      SkillRegistry.registerSkill(skill)

      expect(ChainComposer.canCompose(["search"])).toBe(true)
    })

    test("given existing chain when canCompose then returns true without skills", () => {
      const chain = createChain({
        id: "search-analyze",
        steps: [{ skillId: "search" }, { skillId: "analyze" }],
      })
      ChainRegistry.registerChain(chain)

      expect(ChainComposer.canCompose(["search", "analyze"])).toBe(true)
    })

    test("given partial capability match when canCompose then returns false", () => {
      const skill = createSkill({ id: "search-skill", capabilities: ["search"] })
      SkillRegistry.registerSkill(skill)

      expect(ChainComposer.canCompose(["search", "analyze"])).toBe(false)
    })
  })

  describe("compose", () => {
    test("given empty capabilities when compose then returns null", () => {
      expect(ChainComposer.compose([])).toBeNull()
    })

    test("given no skills when compose then returns null", () => {
      expect(ChainComposer.compose(["search"])).toBeNull()
    })

    test("given composable skills when compose then returns chain", () => {
      const searchSkill = createSkill({ id: "search", capabilities: ["search"] })
      const analyzeSkill = createSkill({ id: "analyze", capabilities: ["analysis"] })

      SkillRegistry.registerSkill(searchSkill)
      SkillRegistry.registerSkill(analyzeSkill)

      const result = ChainComposer.compose(["search", "analysis"])

      expect(result).not.toBeNull()
      expect(result!.steps).toHaveLength(2)
      expect(result!.steps[0]!.skillId).toBe("search")
      expect(result!.steps[1]!.skillId).toBe("analyze")
    })

    test("given existing chain when compose then prefers existing", () => {
      const searchSkill = createSkill({ id: "search", capabilities: ["search"] })
      const analyzeSkill = createSkill({ id: "analyze", capabilities: ["analysis"] })

      SkillRegistry.registerSkill(searchSkill)
      SkillRegistry.registerSkill(analyzeSkill)

      const existingChain = createChain({
        id: "search-analyze",
        steps: [{ skillId: "search" }, { skillId: "analyze" }],
      })
      ChainRegistry.registerChain(existingChain)

      const result = ChainComposer.compose(["search", "analysis"])

      expect(result).not.toBeNull()
      expect(result!.id).toBe("search-analyze")
    })

    test("given duplicate capability when compose then deduplicates steps", () => {
      const multiSkill = createSkill({ id: "multi", capabilities: ["search", "analysis"] })
      SkillRegistry.registerSkill(multiSkill)

      const result = ChainComposer.compose(["search", "analysis"])

      expect(result).not.toBeNull()
      expect(result!.steps).toHaveLength(1)
      expect(result!.steps[0]!.skillId).toBe("multi")
    })

    test("given single capability when compose then returns single step chain", () => {
      const skill = createSkill({ id: "search", capabilities: ["search"] })
      SkillRegistry.registerSkill(skill)

      const result = ChainComposer.compose(["search"])

      expect(result).not.toBeNull()
      expect(result!.steps).toHaveLength(1)
      expect(result!.steps[0]!.skillId).toBe("search")
    })

    test("given no matching skills when compose then returns null", () => {
      expect(ChainComposer.compose(["nonexistent"])).toBeNull()
    })
  })

  describe("estimateChainSteps", () => {
    test("given empty capabilities when estimate then returns 0", () => {
      expect(ChainComposer.estimateChainSteps([])).toBe(0)
    })

    test("given existing chain when estimate then returns chain length", () => {
      const chain = createChain({
        id: "search-analyze",
        steps: [{ skillId: "search" }, { skillId: "analyze" }, { skillId: "report" }],
      })
      ChainRegistry.registerChain(chain)

      expect(ChainComposer.estimateChainSteps(["search", "analyze"])).toBe(3)
    })

    test("given skills for capabilities when estimate then counts unique skills", () => {
      const searchSkill = createSkill({ id: "search", capabilities: ["search"] })
      const analyzeSkill = createSkill({ id: "analyze", capabilities: ["analysis"] })

      SkillRegistry.registerSkill(searchSkill)
      SkillRegistry.registerSkill(analyzeSkill)

      expect(ChainComposer.estimateChainSteps(["search", "analysis"])).toBe(2)
    })

    test("given no skills when estimate then returns 0", () => {
      expect(ChainComposer.estimateChainSteps(["search"])).toBe(0)
    })
  })

  describe("findBestChain", () => {
    test("given empty capabilities when findBestChain then returns undefined", () => {
      expect(ChainComposer.findBestChain([])).toBeUndefined()
    })

    test("given existing chain when findBestChain then returns chain", () => {
      const chain = createChain({
        id: "search-analyze",
        steps: [{ skillId: "search" }, { skillId: "analyze" }],
      })
      ChainRegistry.registerChain(chain)

      const result = ChainComposer.findBestChain(["search", "analyze"])

      expect(result).toBeDefined()
      expect(result!.id).toBe("search-analyze")
    })

    test("given no matching chain when findBestChain then returns undefined", () => {
      const chain = createChain({
        id: "search-analyze",
        steps: [{ skillId: "search" }],
      })
      ChainRegistry.registerChain(chain)

      expect(ChainComposer.findBestChain(["coding"])).toBeUndefined()
    })
  })
})

describe("ChainRegistry (existing chain functionality)", () => {
  beforeEach(() => {
    SkillRegistry.clear()
    ChainRegistry.clear()
  })

  afterEach(() => {
    SkillRegistry.clear()
    ChainRegistry.clear()
  })

  describe("findChainForCapabilities", () => {
    test("given chain when register then can retrieve", () => {
      const chain = createChain({
        id: "search-analyze",
        steps: [{ skillId: "search" }, { skillId: "analyze" }],
      })
      ChainRegistry.registerChain(chain)

      const retrieved = ChainRegistry.getChain("search-analyze")
      expect(retrieved).toBeDefined()
      expect(retrieved!.id).toBe("search-analyze")
    })

    test("given chains with capabilities when findByCapabilities then returns matching", () => {
      const chain1 = createChain({
        id: "search-analyze",
        steps: [{ skillId: "search" }, { skillId: "analyze" }],
      })
      const chain2 = createChain({
        id: "generate-review",
        steps: [{ skillId: "generate" }, { skillId: "review" }],
      })

      ChainRegistry.registerChain(chain1)
      ChainRegistry.registerChain(chain2)

      const result = ChainRegistry.findChainForCapabilities(["search", "analyze"])
      expect(result).toBeDefined()
      expect(result!.id).toBe("search-analyze")
    })

    test("given no matching chain when findByCapabilities then returns undefined", () => {
      const chain = createChain({
        id: "search-analyze",
        steps: [{ skillId: "search" }],
      })
      ChainRegistry.registerChain(chain)

      const result = ChainRegistry.findChainForCapabilities(["coding"])
      expect(result).toBeUndefined()
    })
  })
})

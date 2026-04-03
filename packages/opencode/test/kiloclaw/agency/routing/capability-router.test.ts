import { test, expect, beforeEach, afterEach, describe } from "bun:test"
import {
  CapabilityRouter,
  CapabilityDeniedError,
  NoMatchingCapabilityError,
} from "../../../src/kiloclaw/agency/routing/capability-router"
import { SkillRegistry } from "../../../src/kiloclaw/agency/registry/skill-registry"
import { FlexibleAgentRegistry } from "../../../src/kiloclaw/agency/registry/agent-registry"
import { AgencyRegistry } from "../../../src/kiloclaw/agency/registry/agency-registry"
import { ChainRegistry } from "../../../src/kiloclaw/agency/registry/chain-registry"
import type {
  SkillDefinition,
  FlexibleAgentDefinition,
  AgencyDefinition,
  SkillChain,
} from "../../../src/kiloclaw/agency/registry/types"

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

// Helper to create a minimal agent
function createAgent(override: Partial<FlexibleAgentDefinition> = {}): FlexibleAgentDefinition {
  return {
    id: override.id ?? "test-agent",
    name: override.name ?? "Test Agent",
    primaryAgency: override.primaryAgency ?? "test-agency",
    secondaryAgencies: override.secondaryAgencies ?? [],
    capabilities: override.capabilities ?? ["test"],
    skills: override.skills ?? [],
    constraints: override.constraints ?? {},
    version: override.version ?? "1.0.0",
    ...override,
  }
}

// Helper to create a minimal agency
function createAgency(override: Partial<AgencyDefinition> = {}): AgencyDefinition {
  return {
    id: override.id ?? "test-agency",
    name: override.name ?? "Test Agency",
    domain: override.domain ?? "test",
    policies: {
      allowedCapabilities: override.policies?.allowedCapabilities ?? [],
      deniedCapabilities: override.policies?.deniedCapabilities ?? [],
      maxRetries: override.policies?.maxRetries ?? 3,
      requiresApproval: override.policies?.requiresApproval ?? false,
      dataClassification: override.policies?.dataClassification ?? "internal",
    },
    providers: override.providers ?? [],
    metadata: override.metadata ?? {},
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
    ...override,
  }
}

describe("CapabilityRouter", () => {
  beforeEach(() => {
    // Clear all registries before each test
    SkillRegistry.clear()
    FlexibleAgentRegistry.clear()
    AgencyRegistry.clear()
    ChainRegistry.clear()
  })

  afterEach(() => {
    // Clean up after each test
    SkillRegistry.clear()
    FlexibleAgentRegistry.clear()
    AgencyRegistry.clear()
    ChainRegistry.clear()
  })

  describe("findSkillsForCapabilities", () => {
    test("given empty registry when find then returns empty array", () => {
      const result = CapabilityRouter.findSkillsForCapabilities(["search"])
      expect(result).toEqual([])
    })

    test("given single matching skill when find then returns skill", () => {
      const skill = createSkill({
        id: "web-search",
        capabilities: ["search", "web"],
      })
      SkillRegistry.registerSkill(skill)

      const result = CapabilityRouter.findSkillsForCapabilities(["search"])
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("web-search")
    })

    test("given multiple skills when find by capability then returns matching", () => {
      const webSearch = createSkill({ id: "web-search", capabilities: ["search", "web"] })
      const codeGen = createSkill({ id: "code-gen", capabilities: ["coding", "generation"] })
      const factCheck = createSkill({ id: "fact-check", capabilities: ["fact-checking", "verification"] })

      SkillRegistry.registerSkill(webSearch)
      SkillRegistry.registerSkill(codeGen)
      SkillRegistry.registerSkill(factCheck)

      const result = CapabilityRouter.findSkillsForCapabilities(["search"])
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("web-search")
    })

    test("given skills with overlapping capabilities when find then returns intersection", () => {
      const skill1 = createSkill({ id: "skill1", capabilities: ["search", "analysis"] })
      const skill2 = createSkill({ id: "skill2", capabilities: ["analysis", "synthesis"] })

      SkillRegistry.registerSkill(skill1)
      SkillRegistry.registerSkill(skill2)

      const result = CapabilityRouter.findSkillsForCapabilities(["search", "analysis"])
      expect(result).toHaveLength(2)
    })

    test("given empty required capabilities when find then returns all skills", () => {
      const skill1 = createSkill({ id: "skill1", capabilities: ["search"] })
      const skill2 = createSkill({ id: "skill2", capabilities: ["coding"] })

      SkillRegistry.registerSkill(skill1)
      SkillRegistry.registerSkill(skill2)

      const result = CapabilityRouter.findSkillsForCapabilities([])
      expect(result).toHaveLength(2)
    })
  })

  describe("findAgentsForCapabilities", () => {
    test("given empty registry when find then returns empty array", () => {
      const result = CapabilityRouter.findAgentsForCapabilities(["coding"])
      expect(result).toEqual([])
    })

    test("given matching agent when find then returns agent", () => {
      const agent = createAgent({
        id: "coder",
        capabilities: ["coding", "review", "debugging"],
      })
      FlexibleAgentRegistry.registerAgent(agent)

      const result = CapabilityRouter.findAgentsForCapabilities(["coding"])
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("coder")
    })

    test("given multiple agents when find then scores and ranks", () => {
      const coder = createAgent({
        id: "coder",
        capabilities: ["coding", "review", "debugging"],
      })
      const reviewer = createAgent({
        id: "reviewer",
        capabilities: ["review", "analysis"],
      })

      FlexibleAgentRegistry.registerAgent(coder)
      FlexibleAgentRegistry.registerAgent(reviewer)

      const result = CapabilityRouter.findAgentsForCapabilities(["coding", "review", "debugging", "testing"])
      expect(result).toHaveLength(2)
      // coder has 3/4 match, reviewer has 1/4 match
      expect(result[0].id).toBe("coder")
      expect(result[1].id).toBe("reviewer")
    })

    test("given agency filter when find then filters by agency", () => {
      const devCoder = createAgent({
        id: "dev-coder",
        primaryAgency: "development",
        capabilities: ["coding"],
      })
      const researchCoder = createAgent({
        id: "research-coder",
        primaryAgency: "knowledge",
        capabilities: ["coding", "research"],
      })

      FlexibleAgentRegistry.registerAgent(devCoder)
      FlexibleAgentRegistry.registerAgent(researchCoder)

      const result = CapabilityRouter.findAgentsForCapabilities(["coding"], "development")
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("dev-coder")
    })

    test("given agents in multiple agencies when list by agency then includes secondary agencies", () => {
      const devAgent = createAgent({
        id: "dev-agent",
        primaryAgency: "development",
        capabilities: ["coding"],
      })
      const crossAgent = createAgent({
        id: "cross-agent",
        primaryAgency: "development",
        secondaryAgencies: ["knowledge"],
        capabilities: ["research"],
      })

      FlexibleAgentRegistry.registerAgent(devAgent)
      FlexibleAgentRegistry.registerAgent(crossAgent)

      const result = FlexibleAgentRegistry.getAgentsByAgency("knowledge")
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe("cross-agent")
    })
  })

  describe("matchScore", () => {
    test("given agent with full match when score then returns 1", () => {
      const agent = createAgent({ capabilities: ["coding", "review"] })
      const score = CapabilityRouter.matchScore(agent, ["coding", "review"])
      expect(score).toBe(1)
    })

    test("given agent with partial match when score then returns fraction", () => {
      const agent = createAgent({ capabilities: ["coding"] })
      const score = CapabilityRouter.matchScore(agent, ["coding", "review"])
      expect(score).toBe(0.5)
    })

    test("given agent with no match when score then returns 0", () => {
      const agent = createAgent({ capabilities: ["coding"] })
      const score = CapabilityRouter.matchScore(agent, ["research"])
      expect(score).toBe(0)
    })

    test("given empty required when score then returns 1", () => {
      const agent = createAgent({ capabilities: ["coding"] })
      const score = CapabilityRouter.matchScore(agent, [])
      expect(score).toBe(1)
    })
  })

  describe("composeChain", () => {
    test("given existing chain when compose then returns existing chain", () => {
      const chain = createChain({
        id: "search-analyze",
        steps: [{ skillId: "search" }, { skillId: "analyze" }],
      })
      ChainRegistry.registerChain(chain)

      const intent = {
        intent: "research",
        parameters: { capabilities: ["search", "analyze"] },
        context: {},
      }

      const result = CapabilityRouter.composeChain(intent)
      expect(result).not.toBeNull()
      expect(result!.id).toBe("search-analyze")
    })

    test("given no existing chain but available skills when compose then returns composed chain", () => {
      const searchSkill = createSkill({ id: "search", capabilities: ["search"] })
      const analyzeSkill = createSkill({ id: "analyze", capabilities: ["analysis"] })

      SkillRegistry.registerSkill(searchSkill)
      SkillRegistry.registerSkill(analyzeSkill)

      const intent = {
        intent: "research",
        parameters: { capabilities: ["search"] },
        context: {},
      }

      const result = CapabilityRouter.composeChain(intent)
      expect(result).not.toBeNull()
      expect(result!.id).toBe("composed-search")
      expect(result!.steps).toHaveLength(1)
      expect(result!.steps[0].skillId).toBe("search")
    })

    test("given no matching skills when compose then returns null", () => {
      const intent = {
        intent: "unknown",
        parameters: { capabilities: ["nonexistent"] },
        context: {},
      }

      const result = CapabilityRouter.composeChain(intent)
      expect(result).toBeNull()
    })

    test("given empty capabilities when compose then returns null", () => {
      const intent = {
        intent: "test",
        parameters: {},
        context: {},
      }

      const result = CapabilityRouter.composeChain(intent)
      expect(result).toBeNull()
    })
  })

  describe("routeTask", () => {
    test("given single matching skill when route then returns skill result", () => {
      const skill = createSkill({
        id: "web-search",
        capabilities: ["search", "web"],
      })
      SkillRegistry.registerSkill(skill)

      const intent = {
        intent: "search",
        parameters: { capabilities: ["search"] },
        context: {},
      }

      const result = CapabilityRouter.routeTask(intent)
      expect(result.type).toBe("skill")
      expect(result.skill).toBe("web-search")
      expect(result.confidence).toBe(1)
    })

    test("given multiple matching skills when route then returns best match", () => {
      const coder = createSkill({
        id: "coder",
        capabilities: ["coding", "debugging"],
      })
      const generalist = createSkill({
        id: "generalist",
        capabilities: ["coding"],
      })

      SkillRegistry.registerSkill(coder)
      SkillRegistry.registerSkill(generalist)

      const intent = {
        intent: "code-debug",
        parameters: { capabilities: ["coding", "debugging"] },
        context: {},
      }

      const result = CapabilityRouter.routeTask(intent)
      expect(result.type).toBe("skill")
      expect(result.skill).toBe("coder")
    })

    test("given chain possible when route then returns chain result", () => {
      const chain = createChain({
        id: "research-chain",
        steps: [{ skillId: "search" }, { skillId: "analyze" }],
      })
      ChainRegistry.registerChain(chain)

      const intent = {
        intent: "research",
        parameters: { capabilities: ["search", "analyze"] },
        context: {},
      }

      const result = CapabilityRouter.routeTask(intent)
      expect(result.type).toBe("chain")
      expect(result.chain).toBe("research-chain")
      expect(result.confidence).toBe(1)
    })

    test("given no skill or chain match but agent exists when route then returns agent result", () => {
      const agent = createAgent({
        id: "dev-agent",
        capabilities: ["coding", "debugging"],
      })
      FlexibleAgentRegistry.registerAgent(agent)

      const intent = {
        intent: "complex-task",
        parameters: {},
        context: {},
      }

      // Since intent is "complex-task", capabilities extracted will be ["complex-task"]
      // which won't match any skill or chain, but will match agent partially
      const result = CapabilityRouter.routeTask(intent)
      expect(result.type).toBe("agent")
      expect(result.agent).toBe("dev-agent")
    })

    test("given agency with denied capability when route then throws CapabilityDeniedError", () => {
      const agency = createAgency({
        id: "dev-agency",
        domain: "development",
        policies: {
          allowedCapabilities: [],
          deniedCapabilities: ["network"],
          maxRetries: 3,
          requiresApproval: false,
          dataClassification: "internal",
        },
      })
      AgencyRegistry.registerAgency(agency)

      const intent = {
        intent: "task",
        parameters: { capabilities: ["network", "search"] },
        context: {},
      }

      expect(() => CapabilityRouter.routeTask(intent, "dev-agency")).toThrow(CapabilityDeniedError)
    })

    test("given agency context when route then respects agency policies", () => {
      const agency = createAgency({
        id: "dev-agency",
        domain: "development",
        policies: {
          allowedCapabilities: [],
          deniedCapabilities: ["network"],
          maxRetries: 3,
          requiresApproval: false,
          dataClassification: "internal",
        },
      })
      AgencyRegistry.registerAgency(agency)

      const skill = createSkill({
        id: "web-skill",
        capabilities: ["web", "search"],
      })
      SkillRegistry.registerSkill(skill)

      const intent = {
        intent: "web-search",
        parameters: { capabilities: ["web", "search"] },
        context: {},
      }

      // Should succeed because web and search are not denied
      const result = CapabilityRouter.routeTask(intent, "dev-agency")
      expect(result.type).toBe("skill")
      expect(result.skill).toBe("web-skill")
    })

    test("given no matching anything when route then throws NoMatchingCapabilityError", () => {
      const intent = {
        intent: "completely-unknown-task",
        parameters: {},
        context: {},
      }

      expect(() => CapabilityRouter.routeTask(intent)).toThrow(NoMatchingCapabilityError)
    })
  })
})

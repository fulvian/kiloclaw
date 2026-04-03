import { beforeEach, describe, expect, it } from "bun:test"
import {
  IntentClassifier,
  CapabilityRouter,
  CapabilityDeniedError,
  SkillRegistry,
  FlexibleAgentRegistry,
  AgencyRegistry,
  ChainRegistry,
} from "@/kiloclaw"
import {
  WorkingMemory,
  EpisodicMemory,
  SemanticMemory,
  ProceduralMemory,
  MemoryBroker,
  MemoryLifecycle,
} from "@/kiloclaw/memory"
import type { AgencyDefinition, FlexibleAgentDefinition, SkillChain, SkillDefinition } from "@/kiloclaw"
import type { AgencyId, AgentId, SkillId } from "@/kiloclaw"
import type { EntityId } from "@/kiloclaw/memory"

function makeAgency(input: Partial<AgencyDefinition> & Pick<AgencyDefinition, "id" | "domain">): AgencyDefinition {
  return {
    id: input.id,
    name: input.name ?? input.id,
    domain: input.domain,
    policies: input.policies ?? {
      allowedCapabilities: [],
      deniedCapabilities: [],
      maxRetries: 3,
      requiresApproval: false,
      dataClassification: "internal",
    },
    providers: input.providers ?? [],
    metadata: input.metadata ?? {},
  }
}

function makeSkill(input: Partial<SkillDefinition> & Pick<SkillDefinition, "id" | "capabilities">): SkillDefinition {
  return {
    id: input.id,
    name: input.name ?? input.id,
    version: input.version ?? "1.0.0",
    description: input.description ?? "smoke skill",
    inputSchema: input.inputSchema ?? {},
    outputSchema: input.outputSchema ?? {},
    capabilities: input.capabilities,
    tags: input.tags ?? [],
    requires: input.requires,
    providesContext: input.providesContext,
  }
}

function makeAgent(
  input: Partial<FlexibleAgentDefinition> & Pick<FlexibleAgentDefinition, "id" | "primaryAgency" | "capabilities">,
): FlexibleAgentDefinition {
  return {
    id: input.id,
    name: input.name ?? input.id,
    primaryAgency: input.primaryAgency,
    secondaryAgencies: input.secondaryAgencies ?? [],
    capabilities: input.capabilities,
    skills: input.skills ?? [],
    constraints: input.constraints ?? {},
    version: input.version ?? "1.0.0",
  }
}

describe("Kiloclaw smoke - routing + memory", () => {
  beforeEach(() => {
    SkillRegistry.clear()
    FlexibleAgentRegistry.clear()
    AgencyRegistry.clear()
    ChainRegistry.clear()
    WorkingMemory.clear()
    EpisodicMemory.clear()
    SemanticMemory.clear()
    ProceduralMemory.clear()
  })

  it("routes complex prompt with multi-agency registry coverage", () => {
    AgencyRegistry.registerAgency(makeAgency({ id: "knowledge", domain: "knowledge" }))
    AgencyRegistry.registerAgency(makeAgency({ id: "development", domain: "development" }))
    AgencyRegistry.registerAgency(makeAgency({ id: "nutrition", domain: "nutrition" }))
    AgencyRegistry.registerAgency(makeAgency({ id: "weather", domain: "weather" }))

    SkillRegistry.registerSkill(makeSkill({ id: "web-research", capabilities: ["search", "web", "analysis"] }))
    SkillRegistry.registerSkill(makeSkill({ id: "critical-analysis", capabilities: ["analysis", "reasoning"] }))
    SkillRegistry.registerSkill(makeSkill({ id: "tdd", capabilities: ["planning", "testing", "generate"] }))

    const chain: SkillChain = {
      id: "search-analyze-chain",
      name: "Search Analyze Chain",
      description: "chain",
      steps: [{ skillId: "web-research" }, { skillId: "critical-analysis" }],
      outputSchema: {},
      version: "1.0.0",
    }
    ChainRegistry.registerChain(chain)

    FlexibleAgentRegistry.registerAgent(
      makeAgent({
        id: "researcher",
        primaryAgency: "knowledge",
        capabilities: ["search", "analysis", "synthesis"],
        skills: ["web-research"],
      }),
    )
    FlexibleAgentRegistry.registerAgent(
      makeAgent({
        id: "cross-coder",
        primaryAgency: "development",
        secondaryAgencies: ["knowledge"],
        capabilities: ["coding", "analysis", "planning"],
      }),
    )

    const intent = IntentClassifier.classify(
      "Search the web, analyze the evidence, then generate a robust implementation plan",
    )

    const route = CapabilityRouter.routeTask(intent, "knowledge")
    expect(["skill", "chain", "agent"]).toContain(route.type)
    expect(route.confidence).toBeGreaterThan(0)

    const crossAgencyAgents = CapabilityRouter.findAgentsForCapabilities(["analysis", "planning"], "knowledge")
    expect(crossAgencyAgents.some((a) => a.id === "cross-coder")).toBe(true)
  })

  it("enforces denied capability policy at route time", () => {
    AgencyRegistry.registerAgency(
      makeAgency({
        id: "knowledge",
        domain: "knowledge",
        policies: {
          allowedCapabilities: [],
          deniedCapabilities: ["network"],
          maxRetries: 3,
          requiresApproval: false,
          dataClassification: "internal",
        },
      }),
    )

    SkillRegistry.registerSkill(makeSkill({ id: "web-research", capabilities: ["search", "network"] }))

    const intent = {
      intent: "research",
      parameters: { capabilities: ["network", "search"] },
      context: { urgency: "high" as const },
    }

    expect(() => CapabilityRouter.routeTask(intent, "knowledge")).toThrow(CapabilityDeniedError)
  })

  it("executes 4-layer memory smoke path end-to-end", async () => {
    WorkingMemory.set("session:query", "debug routing issue")
    expect(WorkingMemory.get("session:query")).toBe("debug routing issue")

    await EpisodicMemory.record({
      id: "ev_smoke" as any,
      type: "task_start",
      timestamp: new Date().toISOString(),
      correlationId: "corr_smoke" as any,
      agencyId: "agency-knowledge" as AgencyId,
      agentId: "agent-researcher" as AgentId,
      data: { step: "start" },
    })

    const epId = await EpisodicMemory.recordTask(
      "task-smoke",
      "cross-agency memory smoke",
      "success",
      new Date(),
      "corr_smoke",
      "agency-knowledge",
      "agent-researcher",
      { notes: "completed" },
    )

    await SemanticMemory.assert({
      subject: "topic:kiloclaw" as EntityId,
      predicate: "state",
      object: "stable",
      confidence: 0.95,
      source: "smoke",
    })
    await SemanticMemory.embedAndStore("kiloclaw routing and memory smoke validation", {
      entityType: "topic",
      entityId: "topic:kiloclaw" as EntityId,
      tags: ["smoke", "routing", "memory"],
    })

    await ProceduralMemory.register({
      name: "smoke-playbook",
      description: "smoke steps",
      version: "1.0.0",
      agencyId: "agency-knowledge" as AgencyId,
      skillId: "web-research" as SkillId,
      steps: [
        { id: "1", action: "capture" },
        { id: "2", action: "classify" },
        { id: "3", action: "retrieve" },
      ],
    })

    const entries = await MemoryBroker.read({ limit: 200 })
    const layers = new Set(entries.map((e) => e.layer))
    expect(layers.has("working")).toBe(true)
    expect(layers.has("episodic")).toBe(true)
    expect(layers.has("semantic")).toBe(true)
    expect(layers.has("procedural")).toBe(true)

    const ranked = await MemoryBroker.search({ text: "kiloclaw routing memory", k: 5 })
    expect(ranked.length).toBeGreaterThan(0)

    const consolidated = await MemoryLifecycle.consolidate([epId])
    expect(consolidated.sourceEpisodes).toContain(epId)
    expect(consolidated.confidence).toBeGreaterThanOrEqual(0)

    const stats = await MemoryLifecycle.getStats()
    expect(stats.working.size).toBeGreaterThan(0)
    expect(stats.episodic.totalEpisodes).toBeGreaterThan(0)
    expect(stats.procedural.totalProcedures).toBeGreaterThan(0)
  })
})

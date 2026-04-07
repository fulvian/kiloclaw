import { beforeEach, describe, expect, it } from "bun:test"
import { RoutingPipeline } from "@/kiloclaw/agency/routing/pipeline"
import { AgencyRegistry } from "@/kiloclaw/agency/registry/agency-registry"
import { SkillRegistry } from "@/kiloclaw/agency/registry/skill-registry"
import { FlexibleAgentRegistry } from "@/kiloclaw/agency/registry/agent-registry"

describe("kiloclaw.routing.pipeline", () => {
  beforeEach(() => {
    AgencyRegistry.clear()
    SkillRegistry.clear()
    FlexibleAgentRegistry.clear()
  })

  it("resolves L0-L3 for knowledge intent with policy-gated tools", async () => {
    AgencyRegistry.registerAgency({
      id: "agency-knowledge",
      name: "Knowledge Agency",
      domain: "knowledge",
      policies: {
        allowedCapabilities: ["search", "synthesis", "verification", "web-search"],
        deniedCapabilities: [],
        maxRetries: 3,
        requiresApproval: false,
        dataClassification: "public",
      },
      providers: ["tavily", "firecrawl"],
      metadata: {},
    })

    SkillRegistry.registerSkill({
      id: "web-research",
      name: "Web Research",
      version: "1.0.0",
      description: "Find and analyze web information",
      inputSchema: {},
      outputSchema: {},
      capabilities: ["search", "web"],
      tags: ["knowledge"],
    })

    FlexibleAgentRegistry.registerAgent({
      id: "researcher",
      name: "Researcher",
      primaryAgency: "agency-knowledge",
      secondaryAgencies: [],
      capabilities: ["search", "analysis", "synthesis"],
      skills: ["web-research"],
      constraints: {},
      version: "1.0.0",
    })

    const result = await RoutingPipeline.route({
      id: "intent-pipeline-001",
      type: "chat",
      description: "search the web and verify sources about bun runtime",
      risk: "low",
    })

    expect(result.agencyId).toBe("agency-knowledge")
    expect(result.layers.L0).toBeDefined()
    expect(result.layers.L1).toBeDefined()
    expect(result.layers.L2).toBeDefined()
    expect(result.layers.L3).toBeDefined()
    expect(result.layers.L2?.agentId).toBe("researcher")
    expect(result.layers.L3?.toolsResolved).toBeGreaterThan(0)
    expect(result.layers.L3?.toolsDenied).toBe(0)
  })

  it("enforces deny list in L3 tool resolution for knowledge agency", async () => {
    AgencyRegistry.registerAgency({
      id: "agency-knowledge",
      name: "Knowledge Agency",
      domain: "knowledge",
      policies: {
        allowedCapabilities: ["search"],
        deniedCapabilities: [],
        maxRetries: 3,
        requiresApproval: false,
        dataClassification: "public",
      },
      providers: ["tavily"],
      metadata: {},
    })

    const l3 = await RoutingPipeline.resolveTools("agency-knowledge", undefined, undefined, [
      "websearch",
      "codesearch",
      "exa_news_search",
    ])
    expect(l3.toolsRequested).toBeGreaterThan(0)
    expect(l3.toolsDenied).toBeGreaterThan(0)
    expect(l3.deniedTools).toContain("codesearch")
    expect(l3.blockedTools).toContain("codesearch")
    expect(l3.deniedTools).toContain("exa_news_search")
    expect(l3.deniedTools).not.toContain("websearch")
  })

  it("routes italian typo search-like intent to knowledge agency", async () => {
    AgencyRegistry.registerAgency({
      id: "agency-knowledge",
      name: "Knowledge Agency",
      domain: "knowledge",
      policies: {
        allowedCapabilities: ["search", "web-search"],
        deniedCapabilities: [],
        maxRetries: 3,
        requiresApproval: false,
        dataClassification: "public",
      },
      providers: ["tavily"],
      metadata: {},
    })

    SkillRegistry.registerSkill({
      id: "web-research",
      name: "Web Research",
      version: "1.0.0",
      description: "Find web info",
      inputSchema: {},
      outputSchema: {},
      capabilities: ["search", "web"],
      tags: ["knowledge"],
    })

    FlexibleAgentRegistry.registerAgent({
      id: "researcher",
      name: "Researcher",
      primaryAgency: "agency-knowledge",
      secondaryAgencies: [],
      capabilities: ["search"],
      skills: ["web-research"],
      constraints: {},
      version: "1.0.0",
    })

    const result = await RoutingPipeline.route({
      id: "intent-typo-002",
      type: "search",
      description: "ricrca web annunci macbook pro 14 m3",
      risk: "low",
    })

    expect(result.agencyId).toBe("agency-knowledge")
    expect(result.layers.L3?.toolsResolved).toBeGreaterThan(0)
    expect(result.layers.L3?.toolsDenied).toBe(0)
  })
})

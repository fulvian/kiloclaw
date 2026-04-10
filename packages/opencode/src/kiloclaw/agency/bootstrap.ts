// Bootstrap - Initialize registries with skills and agencies
// Phase 1: Knowledge Agency Implementation
// Phase 8: Dynamic Multi-Level Retrieval SOTA 2026 - Lazy loading support

import { Log } from "@/util/log"
import { Flag } from "@/flag/flag"
import { SkillRegistry } from "./registry/skill-registry"
import { AgencyRegistry } from "./registry/agency-registry"
import { FlexibleAgentRegistry } from "./registry/agent-registry"
import { ChainRegistry } from "./registry/chain-registry"
import type { AgencyDefinition, SkillChain } from "./registry/types"
import type { Skill } from "../skill"
import type { SkillDefinition } from "./registry/types"
import {
  setLazyBootstrap,
  ensureRegistryInitialized,
  isRegistryInitialized,
  getAllRegistryStatuses,
  LazyLoader,
} from "./lazy-registry"

// Import all skills
import { allSkills, knowledgeSkills, developmentSkills, nutritionSkills, weatherSkills } from "../skills"

// Import and register flexible agents
import { registerFlexibleAgents } from "./agency-definitions"

const log = Log.create({ service: "kiloclaw.bootstrap" })

// Convert Skill to SkillDefinition for registry
function skillToDefinition(skill: Skill): SkillDefinition {
  return {
    id: skill.id as string,
    name: skill.name,
    version: skill.version,
    description: `Skill: ${skill.name}`,
    inputSchema: skill.inputSchema as unknown as Record<string, unknown>,
    outputSchema: skill.outputSchema as unknown as Record<string, unknown>,
    capabilities: skill.capabilities,
    tags: skill.tags,
  }
}

// Default agency definitions
const agencyDefinitions: AgencyDefinition[] = [
  {
    id: "agency-knowledge",
    name: "Knowledge Agency",
    domain: "knowledge",
    policies: {
      allowedCapabilities: [
        "search",
        "synthesis",
        "information_gathering",
        "fact-checking",
        "web-search",
        "academic-research",
        "verification",
        "source_grounding",
      ],
      deniedCapabilities: [],
      maxRetries: 3,
      requiresApproval: false,
      dataClassification: "public",
    },
    providers: ["tavily", "firecrawl", "brave", "ddg", "wikipedia", "pubmed", "arxiv", "semanticscholar", "crossref"],
    metadata: { wave: 1, description: "Research, synthesis, and knowledge operations" },
  },
  {
    id: "agency-development",
    name: "Development Agency",
    domain: "development",
    policies: {
      allowedCapabilities: ["coding", "debugging", "refactoring", "code-generation", "code-review", "testing", "tdd"],
      deniedCapabilities: [],
      maxRetries: 3,
      requiresApproval: false,
      dataClassification: "internal",
    },
    providers: [],
    metadata: { wave: 1, description: "Coding, review, and delivery assistance" },
  },
  {
    id: "agency-nutrition",
    name: "Nutrition Agency",
    domain: "nutrition",
    policies: {
      allowedCapabilities: ["nutrition-analysis", "food-analysis", "recipe-search", "meal-planning", "diet-generation"],
      deniedCapabilities: [],
      maxRetries: 3,
      requiresApproval: false,
      dataClassification: "confidential",
    },
    providers: ["usda", "openfoodfacts"],
    metadata: { wave: 2, description: "Nutrition planning and food analysis" },
  },
  {
    id: "agency-weather",
    name: "Weather Agency",
    domain: "weather",
    policies: {
      allowedCapabilities: ["weather-query", "weather-forecast", "weather-alerts"],
      deniedCapabilities: [],
      maxRetries: 3,
      requiresApproval: false,
      dataClassification: "public",
    },
    providers: ["openweathermap"],
    metadata: { wave: 2, description: "Weather information and forecasts" },
  },
  {
    id: "agency-gworkspace",
    name: "Google Workspace Agency",
    domain: "gworkspace",
    policies: {
      allowedCapabilities: [
        "gmail.search",
        "gmail.read",
        "gmail.draft",
        "gmail.send",
        "calendar.list",
        "calendar.read",
        "calendar.create",
        "calendar.update",
        "drive.search",
        "drive.list",
        "drive.read",
        "drive.share",
        "docs.read",
        "docs.update",
        "sheets.read",
        "sheets.update",
      ],
      deniedCapabilities: ["gmail.bulk_send", "drive.share_public", "*.permanent_delete"],
      maxRetries: 5,
      requiresApproval: true,
      dataClassification: "confidential",
    },
    providers: ["googleapis_native", "google_workspace_mcp"],
    metadata: { wave: 3, description: "Gmail, Calendar, Drive, Docs, and Sheets operations" },
  },
]

// Pre-defined skill chains for knowledge agency
const chainDefinitions: SkillChain[] = [
  {
    id: "knowledge-research-synthesis",
    name: "Research and Synthesis",
    description: "Web research followed by knowledge synthesis - finds information and creates a unified summary",
    version: "1.0.0",
    outputSchema: {},
    steps: [{ skillId: "web-research" }, { skillId: "synthesis" }],
  },
  {
    id: "knowledge-full-research",
    name: "Full Research Pipeline",
    description: "Complete knowledge workflow: web research → synthesis → fact-check for rigorous verification",
    version: "1.0.0",
    outputSchema: {},
    steps: [{ skillId: "web-research" }, { skillId: "synthesis" }, { skillId: "fact-check" }],
  },
  {
    id: "knowledge-academic-review",
    name: "Academic Literature Review",
    description: "Academic paper search followed by synthesis for comprehensive literature overview",
    version: "1.0.0",
    outputSchema: {},
    steps: [{ skillId: "literature-review" }, { skillId: "synthesis" }],
  },
  {
    id: "knowledge-verify-claim",
    name: "Claim Verification",
    description: "Fact-check a claim with source verification",
    version: "1.0.0",
    outputSchema: {},
    steps: [{ skillId: "fact-check" }, { skillId: "critical-analysis" }],
  },
]

let bootstrapped = false

/**
 * Internal bootstrap function - registers all agencies, skills, agents, and chains
 */
function doBootstrap(): void {
  log.info("bootstrapping registries...")

  // 1. Register agencies
  for (const agency of agencyDefinitions) {
    try {
      AgencyRegistry.registerAgency(agency)
      log.debug("agency registered", { agencyId: agency.id, domain: agency.domain })
    } catch (error: any) {
      if (error?.message?.includes("already registered")) {
        log.debug("agency already registered", { agencyId: agency.id })
      } else {
        log.error("failed to register agency", { agencyId: agency.id, error: error?.message })
      }
    }
  }

  // 2. Register skills
  for (const skill of allSkills) {
    try {
      const definition = skillToDefinition(skill)
      SkillRegistry.registerSkill(definition)
      log.debug("skill registered", { skillId: skill.id })
    } catch (error: any) {
      if (error?.message?.includes("already registered")) {
        log.debug("skill already registered", { skillId: skill.id })
      } else {
        log.error("failed to register skill", { skillId: skill.id, error: error?.message })
      }
    }
  }

  // 3. Register flexible agents
  try {
    registerFlexibleAgents()
  } catch (error: any) {
    log.error("failed to register flexible agents", { error: error?.message })
  }

  // 4. Register skill chains
  for (const chain of chainDefinitions) {
    try {
      ChainRegistry.registerChain(chain)
      log.debug("chain registered", { chainId: chain.id })
    } catch (error: any) {
      if (error?.message?.includes("already registered")) {
        log.debug("chain already registered", { chainId: chain.id })
      } else {
        log.error("failed to register chain", { chainId: chain.id, error: error?.message })
      }
    }
  }

  log.info("registries bootstrapped", {
    agencies: agencyDefinitions.length,
    skills: allSkills.length,
    chains: chainDefinitions.length,
    agenciesRegistered: AgencyRegistry.getAllAgencies().length,
    skillsRegistered: SkillRegistry.getAllSkills().length,
    agentsRegistered: FlexibleAgentRegistry.getAllAgents().length,
    chainsRegistered: ChainRegistry.getAllChains().length,
  })
}

// Bootstrap function to initialize all registries
export function bootstrapRegistries(): void {
  if (bootstrapped) {
    log.debug("registries already bootstrapped, skipping")
    return
  }

  doBootstrap()
  bootstrapped = true
}

// Lazy bootstrap - only initializes when first accessed
export function lazyBootstrapRegistries(): void {
  // Register the bootstrap function with the lazy loader
  setLazyBootstrap(doBootstrap)

  // For backward compatibility, also mark as bootstrapped
  // The actual initialization will happen on first access
  bootstrapped = true
  log.debug("lazy bootstrap registered, initialization deferred")
}

// Check if bootstrapped
export function isBootstrapped(): boolean {
  return bootstrapped
}

// Get bootstrap stats
export function getBootstrapStats(): {
  agencies: number
  skills: number
  agents: number
  chains: number
} {
  return {
    agencies: AgencyRegistry.getAllAgencies().length,
    skills: SkillRegistry.getAllSkills().length,
    agents: FlexibleAgentRegistry.getAllAgents().length,
    chains: ChainRegistry.getAllChains().length,
  }
}

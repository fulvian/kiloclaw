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
  {
    id: "agency-nba",
    name: "NBA Betting Agency",
    domain: "nba",
    policies: {
      allowedCapabilities: [
        "schedule_live",
        "team_player_stats",
        "injury_status",
        "odds_markets",
        "probability_estimation",
        "vig_removal",
        "edge_detection",
        "calibration_monitoring",
        "game_preview",
        "value_watchlist",
        "recommendation_report",
        "stake_sizing",
      ],
      deniedCapabilities: ["auto_bet", "auto_bet_execution", "execution_orders", "martingale"],
      maxRetries: 3,
      requiresApproval: true,
      dataClassification: "internal",
    },
    providers: ["espn", "balldontlie", "odds_api", "odds_bet365", "parlay", "polymarket", "nba_api"],
    metadata: { wave: 3, description: "NBA data ingestion, probability analytics, and guarded recommendations" },
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

const gworkspaceSkillDefinitions: SkillDefinition[] = [
  {
    id: "gworkspace-gmail-search",
    name: "Google Workspace Gmail Search",
    version: "1.0.0",
    description: "Search Gmail messages via Google Workspace agency",
    inputSchema: {},
    outputSchema: {},
    capabilities: ["gmail.search", "search"],
    tags: ["gworkspace", "gmail"],
  },
  {
    id: "gworkspace-drive-search",
    name: "Google Workspace Drive Search",
    version: "1.0.0",
    description: "Search Google Drive files via Google Workspace agency",
    inputSchema: {},
    outputSchema: {},
    capabilities: ["drive.search", "drive.list", "drive.read"],
    tags: ["gworkspace", "drive"],
  },
  {
    id: "gworkspace-calendar-list",
    name: "Google Workspace Calendar List",
    version: "1.0.0",
    description: "List Calendar events via Google Workspace agency",
    inputSchema: {},
    outputSchema: {},
    capabilities: ["calendar.list", "calendar.read"],
    tags: ["gworkspace", "calendar"],
  },
  {
    id: "gworkspace-docs-read",
    name: "Google Workspace Docs Read",
    version: "1.0.0",
    description: "Read Google Docs documents via Google Workspace agency",
    inputSchema: {},
    outputSchema: {},
    capabilities: ["docs.read"],
    tags: ["gworkspace", "docs"],
  },
  {
    id: "gworkspace-sheets-read",
    name: "Google Workspace Sheets Read",
    version: "1.0.0",
    description: "Read Google Sheets spreadsheets via Google Workspace agency",
    inputSchema: {},
    outputSchema: {},
    capabilities: ["sheets.read"],
    tags: ["gworkspace", "sheets"],
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

  for (const skill of gworkspaceSkillDefinitions) {
    try {
      SkillRegistry.registerSkill(skill)
      log.debug("skill registered", { skillId: skill.id })
    } catch (error: any) {
      if (error?.message?.includes("already registered")) {
        log.debug("skill already registered", { skillId: skill.id })
      } else {
        log.error("failed to register skill", { skillId: skill.id, error: error?.message })
      }
    }
  }

  // Onda 1: Skill aliases for kilo_kit naming convention
  // Maps refoundation plan skill IDs -> existing skill implementations
  const onda1SkillAliases: SkillDefinition[] = [
    {
      id: "systematic-debugging",
      name: "Systematic Debugging",
      version: "1.0.0",
      description: "Four-phase systematic debugging: Observe, Hypothesize, Investigate, Resolve",
      inputSchema: {
        type: "object",
        properties: { code: { type: "string" }, error: { type: "string" } },
        required: ["code"],
      },
      outputSchema: { type: "object", properties: { diagnosis: { type: "string" }, steps: { type: "array" } } },
      capabilities: ["debugging", "root-cause-analysis", "troubleshooting"],
      tags: ["development", "debugging"],
    },
    {
      id: "test-driven-development",
      name: "Test-Driven Development",
      version: "1.0.0",
      description: "TDD workflow: write failing test first, then implement to make it pass",
      inputSchema: {
        type: "object",
        properties: { code: { type: "string" }, framework: { type: "string" } },
        required: ["code"],
      },
      outputSchema: { type: "object", properties: { tests: { type: "array" }, passed: { type: "boolean" } } },
      capabilities: ["test_generation", "test_execution", "tdd_workflow"],
      tags: ["development", "testing", "tdd"],
    },
    {
      id: "verification-before-completion",
      name: "Verification Before Completion",
      version: "1.0.0",
      description: "Verify all requirements met and tests pass before concluding a task",
      inputSchema: { type: "object", properties: { taskId: { type: "string" }, criteria: { type: "array" } } },
      outputSchema: { type: "object", properties: { verified: { type: "boolean" }, issues: { type: "array" } } },
      capabilities: ["verification", "quality-assurance", "task-completion"],
      tags: ["development", "quality", "verification"],
    },
    {
      id: "planning-with-files",
      name: "Planning with Files",
      version: "1.0.0",
      description: "Use persistent markdown files to track multi-step project plans",
      inputSchema: { type: "object", properties: { goal: { type: "string" }, phases: { type: "array" } } },
      outputSchema: { type: "object", properties: { planFile: { type: "string" }, steps: { type: "array" } } },
      capabilities: ["task-planning", "file-based-tracking", "roadmapping"],
      tags: ["development", "planning"],
    },
    {
      id: "executing-plans",
      name: "Executing Plans",
      version: "1.0.0",
      description: "Execute multi-step plans with phase gates and verification",
      inputSchema: { type: "object", properties: { planId: { type: "string" }, currentPhase: { type: "number" } } },
      outputSchema: {
        type: "object",
        properties: { phaseComplete: { type: "boolean" }, nextPhase: { type: "number" } },
      },
      capabilities: ["plan-execution", "phase-management", "gate-verification"],
      tags: ["development", "execution"],
    },
    {
      id: "writing-plans",
      name: "Writing Plans",
      version: "1.0.0",
      description: "Create structured implementation plans with DOT diagrams",
      inputSchema: { type: "object", properties: { objective: { type: "string" }, constraints: { type: "array" } } },
      outputSchema: { type: "object", properties: { plan: { type: "string" }, phases: { type: "array" } } },
      capabilities: ["plan-writing", "documentation", "structuring"],
      tags: ["development", "planning", "documentation"],
    },
    {
      id: "subagent-driven-development",
      name: "Subagent-Driven Development",
      version: "1.0.0",
      description: "Coordinate specialized subagents to complete complex tasks",
      inputSchema: { type: "object", properties: { task: { type: "string" }, agents: { type: "array" } } },
      outputSchema: { type: "object", properties: { results: { type: "array" }, status: { type: "string" } } },
      capabilities: ["task-decomposition", "agent-coordination", "result-aggregation"],
      tags: ["development", "orchestration", "multi-agent"],
    },
    {
      id: "multi-agent-orchestration",
      name: "Multi-Agent Orchestration",
      version: "1.0.0",
      description: "Orchestrate multiple agents with handoff protocols and state management",
      inputSchema: { type: "object", properties: { workflow: { type: "array" }, context: { type: "object" } } },
      outputSchema: { type: "object", properties: { outcomes: { type: "array" }, finalState: { type: "object" } } },
      capabilities: ["workflow-orchestration", "state-management", "agent-handoffs"],
      tags: ["development", "orchestration", "workflow"],
    },
    {
      id: "dispatching-parallel-agents",
      name: "Dispatching Parallel Agents",
      version: "1.0.0",
      description: "Fan out independent tasks to multiple agents executing in parallel",
      inputSchema: { type: "object", properties: { tasks: { type: "array" }, parallelism: { type: "number" } } },
      outputSchema: { type: "object", properties: { results: { type: "array" }, elapsedMs: { type: "number" } } },
      capabilities: ["parallel-dispatch", "fan-out", "concurrent-execution"],
      tags: ["development", "parallel", "dispatch"],
    },
  ]

  for (const skill of onda1SkillAliases) {
    try {
      SkillRegistry.registerSkill(skill)
      log.debug("skill alias registered", { skillId: skill.id })
    } catch (error: any) {
      if (error?.message?.includes("already registered")) {
        log.debug("skill alias already registered", { skillId: skill.id })
      } else {
        log.error("failed to register skill alias", { skillId: skill.id, error: error?.message })
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

// Reset bootstrap state - for testing only
// Clears all registries and resets the bootstrapped flag so bootstrapRegistries() can run again
export function resetBootstrap(): void {
  bootstrapped = false
  SkillRegistry.clear()
  FlexibleAgentRegistry.clear()
  AgencyRegistry.clear()
  ChainRegistry.clear()
  log.debug("bootstrap state reset")
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

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
import {
  allSkills,
  knowledgeSkills,
  developmentSkills,
  nutritionSkills,
  weatherSkills,
  nbaSkills,
  financeSkills,
  travelSkills,
} from "../skills"

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
      allowedCapabilities: [
        "coding",
        "code-generation",
        "code-review",
        "refactoring",
        "debugging",
        "testing",
        "tdd",
        "planning",
        "document_analysis",
        "comparison",
      ],
      deniedCapabilities: [
        "destructive_git", // git reset --hard, force push
        "secret_export", // export API keys, credentials
        "auto_execute", // auto-run without user approval
      ],
      maxRetries: 3,
      requiresApproval: false, // Skills may override per-operation
      dataClassification: "internal",
    },
    providers: [
      "native", // Native file/git/bash operations (preferred)
      "firecrawl", // Fallback for web research in development context
    ],
    metadata: {
      wave: 1,
      description: "Coding, review, and delivery assistance",
      nativeAdapters: ["NativeFileAdapter", "NativeGitAdapter", "NativeBuildAdapter"],
      policyEnforced: true,
      contextFootprint: {
        toolsExposed: 9,
        schemaSizeEstimate: "~2.5KB",
        lazyLoadingStrategy: "skills loaded on-demand via execution-bridge",
        budgetContextPerStep: "4KB (tokens ~500)",
      },
    },
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
  {
    id: "agency-finance",
    name: "Finance Agency",
    domain: "finance",
    policies: {
      allowedCapabilities: [
        // Data Ingestion
        "price.current",
        "price.historical",
        "orderbook",
        "fundamentals",
        "macro",
        "filings",
        "news",
        // Analytics
        "technical.indicators",
        "chart.patterns",
        "factor.analysis",
        "stress.test",
        "correlation",
        "sentiment",
        // Trading Operations
        "signal.generation",
        "paper.trade",
        "order.simulation",
        "execution.assist",
        "portfolio.rebalance",
        "alert.risk",
        // Reporting
        "watchlist.view",
        "journal.entry",
        "report.generate",
      ],
      deniedCapabilities: [
        "real.execution",
        "leverage.extreme",
        "risk.limit.bypass",
        "market.manipulation",
        "insider.info",
      ],
      maxRetries: 3,
      requiresApproval: true,
      dataClassification: "confidential",
    },
    providers: ["twelve_data", "polygon", "alpha_vantage", "fred", "finnhub", "fmp", "nasdaq"],
    metadata: { wave: 4, description: "Multi-asset financial analysis, trading signals, and risk assessment" },
  },
  {
    id: "agency-travel",
    name: "Travel Agency",
    domain: "travel",
    policies: {
      allowedCapabilities: [
        // Destination discovery & comparison
        "destination-discovery",
        "destination-compare",
        "budget-fit-check",
        "seasonality-analysis",
        "visa-doc-check",
        "date-window-optimization",
        "multi-city-optimizer",
        // Transport search
        "flight-search",
        "flight-compare",
        "rail-search",
        "bus-search",
        "transfer-search",
        // Accommodation
        "hotel-search",
        "hotel-compare",
        "booking-link-hotel",
        "cancellation-policy-check",
        // Local mobility
        "local-transport-plan",
        "car-rental-search",
        "parking-check",
        // Dining & POI
        "restaurant-search",
        "restaurant-availability",
        "poi-search",
        "poi-alt-search",
        // Activities & Events
        "activity-search",
        "event-search",
        "event-booking-link",
        // Itinerary & Risk
        "itinerary-build",
        "itinerary-balance",
        "weather-risk-check",
        // Emergency & Advisory
        "emergency-nearby",
        "advisory-monitor",
        "audit-log",
      ],
      deniedCapabilities: [
        "payment-execution",
        "direct-booking-irreversible",
        "passport-data-store",
        "medical-decision-auto",
        "emergency-decision-auto",
      ],
      maxRetries: 3,
      requiresApproval: true,
      dataClassification: "confidential",
    },
    providers: ["amadeus", "ticketmaster", "openweather", "google_places", "opentripmap", "aviationstack"],
    metadata: {
      wave: 5,
      description:
        "End-to-end travel planning: destination selection, transport search, accommodation booking, activities, and emergency support",
      policyEnforced: true,
      denyByDefault: true,
    },
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

  // Onda 2: Security/Ops/Review skills
  // Maps refoundation plan skill IDs -> existing skill implementations
  const onda2SkillAliases: SkillDefinition[] = [
    {
      id: "security-audit",
      name: "Security Audit",
      version: "1.0.0",
      description: "Comprehensive security review and vulnerability assessment",
      inputSchema: {
        type: "object",
        properties: { code: { type: "string" }, scope: { type: "string" } },
        required: ["code"],
      },
      outputSchema: {
        type: "object",
        properties: {
          vulnerabilities: { type: "array" },
          riskLevel: { type: "string" },
          recommendations: { type: "array" },
        },
      },
      capabilities: ["security-analysis", "vulnerability-assessment", "risk-evaluation"],
      tags: ["security", "audit", "review"],
    },
    {
      id: "code-review-discipline",
      name: "Code Review Discipline",
      version: "1.0.0",
      description: "Systematic code review methodology for consistent quality",
      inputSchema: {
        type: "object",
        properties: { code: { type: "string" }, language: { type: "string" } },
        required: ["code"],
      },
      outputSchema: {
        type: "object",
        properties: { issues: { type: "array" }, score: { type: "number" }, summary: { type: "string" } },
      },
      capabilities: ["code-review", "quality-assessment", "best-practices"],
      tags: ["code-review", "quality", "development"],
    },
    {
      id: "requesting-code-review",
      name: "Requesting Code Review",
      version: "1.0.0",
      description: "Process of requesting and preparing code for peer review",
      inputSchema: {
        type: "object",
        properties: { branchName: { type: "string" }, changes: { type: "string" } },
        required: ["branchName"],
      },
      outputSchema: {
        type: "object",
        properties: { reviewRequest: { type: "object" }, checklist: { type: "array" } },
      },
      capabilities: ["code-review-preparation", "change-documentation"],
      tags: ["code-review", "workflow", "development"],
    },
    {
      id: "receiving-code-review",
      name: "Receiving Code Review",
      version: "1.0.0",
      description: "Process of receiving and responding to code review feedback",
      inputSchema: {
        type: "object",
        properties: { feedback: { type: "string" }, changes: { type: "array" } },
        required: ["feedback"],
      },
      outputSchema: {
        type: "object",
        properties: { addressed: { type: "array" }, remaining: { type: "array" } },
      },
      capabilities: ["feedback-integration", "revision-management"],
      tags: ["code-review", "feedback", "development"],
    },
    {
      id: "finishing-a-development-branch",
      name: "Finishing a Development Branch",
      version: "1.0.0",
      description: "Validate branch readiness for merge: tests, clean state, commit history",
      inputSchema: {
        type: "object",
        properties: {
          branchName: { type: "string" },
          targetBranch: { type: "string" },
          requireTests: { type: "boolean" },
        },
        required: ["branchName"],
      },
      outputSchema: {
        type: "object",
        properties: { status: { type: "string" }, checks: { type: "array" }, summary: { type: "string" } },
      },
      capabilities: ["branch-validation", "git-workflow", "merge-readiness"],
      tags: ["git", "workflow", "development"],
    },
    {
      id: "using-git-worktrees",
      name: "Using Git Worktrees",
      version: "1.0.0",
      description: "Manage isolated workspaces with git worktrees for parallel development",
      inputSchema: {
        type: "object",
        properties: { action: { type: "string" }, worktreePath: { type: "string" }, branchName: { type: "string" } },
        required: ["action"],
      },
      outputSchema: {
        type: "object",
        properties: { success: { type: "boolean" }, worktrees: { type: "array" }, message: { type: "string" } },
      },
      capabilities: ["git-worktree-management", "parallel-development", "branch-isolation"],
      tags: ["git", "worktree", "development"],
    },
    {
      id: "anti-patterns",
      name: "Anti-Patterns Detection",
      version: "1.0.0",
      description: "Detect common anti-patterns and code smells",
      inputSchema: {
        type: "object",
        properties: { code: { type: "string" }, language: { type: "string" }, strictness: { type: "string" } },
        required: ["code"],
      },
      outputSchema: {
        type: "object",
        properties: { patternsFound: { type: "array" }, overallScore: { type: "number" }, summary: { type: "string" } },
      },
      capabilities: ["code-quality-analysis", "anti-pattern-detection", "refactoring-suggestions"],
      tags: ["quality", "refactoring", "code-review"],
    },
    {
      id: "yagni-enforcement",
      name: "YAGNI Enforcement",
      version: "1.0.0",
      description: "Enforce YAGNI (You Aren't Gonna Need It) principle - avoid speculative code",
      inputSchema: {
        type: "object",
        properties: { proposedCode: { type: "string" }, context: { type: "string" } },
        required: ["proposedCode"],
      },
      outputSchema: {
        type: "object",
        properties: { verdict: { type: "string" }, analysis: { type: "array" }, summary: { type: "string" } },
      },
      capabilities: ["yagni-enforcement", "simplicity-analysis", "refactoring-suggestions"],
      tags: ["yagni", "simplicity", "quality", "refactoring"],
    },
  ]

  for (const skill of onda2SkillAliases) {
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

  // Onda 3: Frontend/Data/ML skills
  // performance-optimization, database-design, api-development, visual-companion, spec-driven-development
  const onda3SkillAliases: SkillDefinition[] = [
    {
      id: "performance-optimization",
      name: "Performance Optimization",
      version: "1.0.0",
      description: "Identify bottlenecks and suggest optimizations for code performance",
      inputSchema: {
        type: "object",
        properties: { code: { type: "string" }, language: { type: "string" }, targetMetric: { type: "string" } },
        required: ["code"],
      },
      outputSchema: {
        type: "object",
        properties: {
          bottlenecks: { type: "array" },
          suggestions: { type: "array" },
          estimatedImpact: { type: "object" },
          summary: { type: "string" },
        },
      },
      capabilities: ["performance-analysis", "bottleneck-detection", "optimization-suggestions"],
      tags: ["performance", "optimization", "development"],
    },
    {
      id: "database-design",
      name: "Database Design",
      version: "1.0.0",
      description: "Design database schemas with normalization, relationships, and scale recommendations",
      inputSchema: {
        type: "object",
        properties: { entities: { type: "array" }, requirements: { type: "array" }, scale: { type: "string" } },
        required: ["entities"],
      },
      outputSchema: {
        type: "object",
        properties: {
          schema: { type: "object" },
          relationships: { type: "array" },
          recommendations: { type: "array" },
          summary: { type: "string" },
        },
      },
      capabilities: ["database-design", "schema-creation", "normalization", "relationship-mapping"],
      tags: ["database", "design", "schema"],
    },
    {
      id: "api-development",
      name: "API Development",
      version: "1.0.0",
      description: "Design and generate REST/GraphQL/gRPC API endpoints with schemas",
      inputSchema: {
        type: "object",
        properties: { spec: { type: "object" }, resources: { type: "array" }, style: { type: "string" } },
        required: ["resources"],
      },
      outputSchema: {
        type: "object",
        properties: {
          endpoints: { type: "array" },
          schemas: { type: "object" },
          recommendations: { type: "array" },
          summary: { type: "string" },
        },
      },
      capabilities: ["api-design", "endpoint-generation", "schema-creation", "rest-conventions"],
      tags: ["api", "development", "rest", "design"],
    },
    {
      id: "visual-companion",
      name: "Visual Companion",
      version: "1.0.0",
      description: "Assist with visual design decisions: layout, color, typography, spacing",
      inputSchema: {
        type: "object",
        properties: { task: { type: "string" }, context: { type: "string" }, code: { type: "string" } },
        required: ["task"],
      },
      outputSchema: {
        type: "object",
        properties: {
          task: { type: "string" },
          observations: { type: "array" },
          suggestions: { type: "array" },
          summary: { type: "string" },
        },
      },
      capabilities: ["visual-design", "layout-analysis", "design-review", "ui-consistency"],
      tags: ["design", "ui", "visual", "css", "frontend"],
    },
    {
      id: "spec-driven-development",
      name: "Spec-Driven Development",
      version: "1.0.0",
      description: "Create specifications from objectives, then generate test cases and implementation guides",
      inputSchema: {
        type: "object",
        properties: {
          objective: { type: "string" },
          constraints: { type: "array" },
          acceptanceCriteria: { type: "array" },
        },
        required: ["objective"],
      },
      outputSchema: {
        type: "object",
        properties: {
          specification: { type: "object" },
          testCases: { type: "array" },
          implementationGuide: { type: "array" },
          summary: { type: "string" },
        },
      },
      capabilities: [
        "specification-creation",
        "requirement-analysis",
        "test-case-generation",
        "implementation-planning",
      ],
      tags: ["specification", "tdd", "requirements", "planning"],
    },
  ]

  for (const skill of onda3SkillAliases) {
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

  // Onda 4: Knowledge + Meta skills aliases
  const onda4SkillAliases: SkillDefinition[] = [
    {
      id: "deep-research",
      name: "Deep Research",
      version: "1.0.0",
      description: "Comprehensive multi-source research synthesis with source evaluation",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string" }, sources: { type: "number" }, depth: { type: "string" } },
        required: ["query"],
      },
      outputSchema: {
        type: "object",
        properties: { findings: { type: "array" }, gaps: { type: "array" }, summary: { type: "string" } },
      },
      capabilities: ["research-synthesis", "source-evaluation", "gap-analysis", "multi-source-research"],
      tags: ["knowledge", "research", "analysis"],
    },
    {
      id: "tavily-research",
      name: "Tavily Research",
      version: "1.0.0",
      description: "Tavily AI web search integration for up-to-date information",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string" }, searchDepth: { type: "string" }, maxResults: { type: "number" } },
        required: ["query"],
      },
      outputSchema: {
        type: "object",
        properties: { results: { type: "array" }, summary: { type: "string" } },
      },
      capabilities: ["web-search", "tavily-integration", "information-gathering"],
      tags: ["knowledge", "search", "tavily"],
    },
    {
      id: "context-engineering",
      name: "Context Engineering",
      version: "1.0.0",
      description: "Optimize LLM interaction through structured context management",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string" }, strategy: { type: "string" }, maxTokens: { type: "number" } },
        required: ["text"],
      },
      outputSchema: {
        type: "object",
        properties: { compressed: { type: "string" }, metadata: { type: "object" } },
      },
      capabilities: ["context-compression", "context-expansion", "context-ranking", "token-optimization"],
      tags: ["knowledge", "context", "llm-optimization"],
    },
    {
      id: "knowledge-graph-memory",
      name: "Knowledge Graph Memory",
      version: "1.0.0",
      description: "Graph-based memory storage and retrieval for persistent context",
      inputSchema: {
        type: "object",
        properties: { action: { type: "string" }, entities: { type: "array" }, relationships: { type: "array" } },
        required: ["action"],
      },
      outputSchema: {
        type: "object",
        properties: { stored: { type: "boolean" }, entities: { type: "array" }, query: { type: "string" } },
      },
      capabilities: ["graph-storage", "entity-tracking", "relationship-mapping", "memory-retrieval"],
      tags: ["knowledge", "memory", "graph"],
    },
    {
      id: "using-superpowers",
      name: "Using Superpowers",
      version: "1.0.0",
      description: "Methodology guidance for code-gen, debugging, refactoring, docs, and testing",
      inputSchema: {
        type: "object",
        properties: { task: { type: "string" }, methodology: { type: "string" } },
        required: ["task"],
      },
      outputSchema: {
        type: "object",
        properties: { guidance: { type: "string" }, steps: { type: "array" } },
      },
      capabilities: ["methodology-guidance", "workflow-assistance", "best-practices"],
      tags: ["meta", "guidance", "methodology"],
    },
    {
      id: "writing-skills",
      name: "Writing Skills",
      version: "1.0.0",
      description: "Writing type guidance for technical, documentation, creative, business, academic",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string" }, type: { type: "string" }, tone: { type: "string" } },
        required: ["text"],
      },
      outputSchema: {
        type: "object",
        properties: { rewritten: { type: "string" }, suggestions: { type: "array" } },
      },
      capabilities: ["text-rewriting", "tone-adjustment", "style-improvement", "type-specific-writing"],
      tags: ["meta", "writing", "language"],
    },
    {
      id: "brainstorming",
      name: "Brainstorming",
      version: "1.0.0",
      description: "Idea generation with SCAMPER, Six Thinking Hats, and other techniques",
      inputSchema: {
        type: "object",
        properties: { topic: { type: "string" }, technique: { type: "string" } },
        required: ["topic"],
      },
      outputSchema: {
        type: "object",
        properties: { ideas: { type: "array" }, technique: { type: "string" } },
      },
      capabilities: ["idea-generation", "scamper", "six-thinking-hats", "creative-brainstorming"],
      tags: ["meta", "creativity", "brainstorming"],
    },
  ]

  for (const skill of onda4SkillAliases) {
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

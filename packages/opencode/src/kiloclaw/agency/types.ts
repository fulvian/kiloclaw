// AgentDefinition types and AgentRegistry for Kiloclaw
// Implements multi-agency agent support as defined in HANDOVER_specialized-agents.md

import z from "zod"
import { Log } from "@/util/log"
import { type AgentId, type SemanticVersion, type Domain } from "../types"

// TaskType: atomic tasks that an agent can perform
// @deprecated - Use TaskIntent from "./routing/types" instead
export const TaskType = z.enum([
  // Knowledge agency tasks
  "web-search",
  "academic-research",
  "fact-checking",
  "source-verification",
  "summarization",
  "explanation",
  "literature-review",
  "data-analysis",
  "comparison",
  // Development agency tasks
  "code-generation",
  "code-modification",
  "bug-fixing",
  "code-review",
  "debugging",
  "root-cause-analysis",
  "task-planning",
  "code-planning",
  "refactoring",
  "simplification",
  "tdd",
  // Nutrition agency tasks
  "nutrition-analysis",
  "food-analysis",
  "recipe-search",
  "meal-planning",
  "diet-generation",
  "calorie-calculation",
  "food-recall",
  // Weather agency tasks
  "weather-query",
  "weather-forecast",
  "weather-alerts",
  "location-analysis",
  // Notifications
  "notifications",
])
export type TaskType = z.infer<typeof TaskType>

// SkillName: valid skill identifiers
// @deprecated - Use SkillDefinition.capabilities instead
export const SkillName = z.enum([
  // Development skills
  "code-review",
  "debugging",
  "tdd",
  "comparison",
  "document-analysis",
  "simplification",
  // Knowledge skills
  "web-research",
  "fact-check",
  "academic-search",
  "summarization",
  "explanation",
  "literature-review",
  "synthesis",
  "critical-analysis",
  // Nutrition skills
  "nutrition-analysis",
  "diet-plan",
  "recipe-search",
  "food-recall",
  // Weather skills
  "weather-current",
  "weather-forecast",
  "weather-alerts",
])
export type SkillName = z.infer<typeof SkillName>

// AgencyName: valid agency identifiers
export const AgencyName = z.enum(["development", "knowledge", "nutrition", "weather", "nba", "finance"])
export type AgencyName = z.infer<typeof AgencyName>

/**
 * Policy enforcement level for capabilities and tools
 * - SAFE: Operazioni read-only, nessun side effect
 * - NOTIFY: Operazioni con side effect reversibili (notifica post-exec)
 * - CONFIRM: Operazioni con impatto significativo (richiedi conferma)
 * - HITL: Operazioni irreversibili/ad alto rischio (richiedi approvazione umana)
 * - DENY: Mai consentito
 */
export type PolicyLevel = "SAFE" | "NOTIFY" | "CONFIRM" | "HITL" | "DENY"

export const PolicyLevelOrder = {
  SAFE: 0,
  NOTIFY: 1,
  CONFIRM: 2,
  HITL: 3,
  DENY: 4,
} as const

export function isMoreRestrictive(a: PolicyLevel, b: PolicyLevel): boolean {
  return PolicyLevelOrder[a] > PolicyLevelOrder[b]
}

export function enforcePolicy(level: PolicyLevel, requiresApproval: boolean): "allow" | "notify" | "confirm" | "deny" {
  if (level === "DENY" || requiresApproval) return "deny"
  if (level === "HITL") return "deny" // Can only proceed with user approval
  if (level === "CONFIRM") return "confirm"
  if (level === "NOTIFY") return "notify"
  return "allow"
}

// AgentDefinition: formal definition of an agent as per HANDOVER doc
export const AgentDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  agencyOwner: AgencyName,
  agencyCross: z.array(AgencyName).default([]),
  taskTypes: z.array(TaskType).min(1),
  skills: z.array(SkillName).min(1),
  capabilities: z.array(z.string()),
  description: z.string(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "Must be semver format (x.y.z)"),
})
export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>

/**
 * @deprecated Use FlexibleAgentRegistry from "./registry/agent-registry" instead.
 * This class uses TaskType-based routing which is being replaced by capability-based routing.
 * Migration: Use FlexibleAgentRegistry.findByCapabilities() with TaskIntent.
 */
export class AgentRegistry {
  private agents = new Map<AgentId, AgentDefinition>()
  private agentsByAgency = new Map<AgencyName, Set<AgentId>>()
  private agentsByTask = new Map<TaskType, Set<AgentId>>()
  private log = Log.create({ service: "kiloclaw.agent-registry" })

  // Register a new agent
  registerAgent(agent: AgentDefinition): void {
    const id = agent.id as AgentId
    this.agents.set(id, agent)

    // Index by agency owner
    if (!this.agentsByAgency.has(agent.agencyOwner)) {
      this.agentsByAgency.set(agent.agencyOwner, new Set())
    }
    this.agentsByAgency.get(agent.agencyOwner)!.add(id)

    // Index by agency cross (agents that can work in other agencies)
    for (const crossAgency of agent.agencyCross) {
      if (!this.agentsByAgency.has(crossAgency)) {
        this.agentsByAgency.set(crossAgency, new Set())
      }
      this.agentsByAgency.get(crossAgency)!.add(id)
    }

    // Index by task types
    for (const taskType of agent.taskTypes) {
      if (!this.agentsByTask.has(taskType)) {
        this.agentsByTask.set(taskType, new Set())
      }
      this.agentsByTask.get(taskType)!.add(id)
    }

    this.log.info("agent registered", {
      agentId: agent.id,
      agencyOwner: agent.agencyOwner,
      agencyCross: agent.agencyCross,
      taskTypes: agent.taskTypes,
    })
  }

  // Get agent by ID
  getAgent(id: string): AgentDefinition | undefined {
    return this.agents.get(id as AgentId)
  }

  // List all agents
  listAgents(): AgentDefinition[] {
    return [...this.agents.values()]
  }

  // List agents by agency (owner OR cross)
  listAgentsByAgency(agency: AgencyName): AgentDefinition[] {
    const agentIds = this.agentsByAgency.get(agency)
    if (!agentIds) return []
    return [...agentIds].map((id) => this.agents.get(id)!).filter(Boolean)
  }

  // List agents by task type
  findAgentsForTask(taskType: TaskType): AgentDefinition[] {
    const agentIds = this.agentsByTask.get(taskType)
    if (!agentIds) return []
    return [...agentIds].map((id) => this.agents.get(id)!).filter(Boolean)
  }

  // Find agents for task within a specific agency
  findAgentsForTaskInAgency(taskType: TaskType, agency: AgencyName): AgentDefinition[] {
    return this.findAgentsForTask(taskType).filter(
      (agent) => agent.agencyOwner === agency || agent.agencyCross.includes(agency),
    )
  }

  // Get agent count
  getAgentCount(): number {
    return this.agents.size
  }
}

/**
 * @deprecated Use FlexibleAgentRegistry from "./registry/agent-registry" instead.
 */
export function getAgentRegistry(): AgentRegistry {
  console.warn(
    "[DEPRECATED] getAgentRegistry() is deprecated. Use FlexibleAgentRegistry from './registry/agent-registry' instead.",
  )
  if (!registryInstance) {
    registryInstance = new AgentRegistry()
  }
  return registryInstance
}

// Internal singleton instance - do not use directly
let registryInstance: AgentRegistry | null = null

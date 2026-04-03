// CapabilityRouter - routes tasks based on capability matching
// Phase 3: Flexible Agency Architecture

import { Log } from "@/util/log"
import { SkillRegistry } from "../registry/skill-registry"
import { FlexibleAgentRegistry } from "../registry/agent-registry"
import { ChainRegistry } from "../registry/chain-registry"
import { AgencyRegistry } from "../registry/agency-registry"
import type { TaskIntent, RouteResult } from "./types"
import type { SkillDefinition, FlexibleAgentDefinition } from "../registry/types"

const log = Log.create({ service: "kiloclaw.routing.capability-router" })

// Error types for capability routing
export class CapabilityRouterError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message)
    this.name = "CapabilityRouterError"
  }
}

export class CapabilityDeniedError extends CapabilityRouterError {
  constructor(capability: string, agency: string) {
    super(`Capability '${capability}' denied by agency '${agency}'`, "CAPABILITY_DENIED")
    this.name = "CapabilityDeniedError"
  }
}

export class NoMatchingCapabilityError extends CapabilityRouterError {
  constructor(required: string[]) {
    super(`No skills or agents found matching capabilities: ${required.join(", ")}`, "NO_MATCH")
    this.name = "NoMatchingCapabilityError"
  }
}

function calculateMatchScore(capabilities: string[], required: string[]): number {
  if (required.length === 0) return 1
  const matched = capabilities.filter((cap) => required.includes(cap))
  return matched.length / required.length
}

function findBestSkill(skills: SkillDefinition[], required: string[]): SkillDefinition | null {
  if (skills.length === 0) return null

  const scored = skills.map((s) => ({ skill: s, score: calculateMatchScore(s.capabilities, required) }))
  scored.sort((a, b) => b.score - a.score)

  const best = scored[0]
  return best && best.score >= 0.5 ? best.skill : null
}

function findBestAgent(agents: FlexibleAgentDefinition[], required: string[]): FlexibleAgentDefinition | null {
  if (agents.length === 0) return null

  const scored = agents.map((a) => ({ agent: a, score: calculateMatchScore(a.capabilities, required) }))
  scored.sort((a, b) => b.score - a.score)

  const best = scored[0]
  return best && best.score > 0 ? best.agent : null
}

export namespace CapabilityRouter {
  /**
   * Find skills matching the required capabilities
   */
  export function findSkillsForCapabilities(required: string[]): SkillDefinition[] {
    if (required.length === 0) return SkillRegistry.getAllSkills()
    return SkillRegistry.findByCapabilities(required)
  }

  /**
   * Find agents matching the required capabilities, optionally filtered by agency
   */
  export function findAgentsForCapabilities(required: string[], agency?: string): FlexibleAgentDefinition[] {
    return FlexibleAgentRegistry.findByCapabilities(required, agency)
  }

  /**
   * Calculate match score for an agent against required capabilities
   */
  export function matchScore(agent: FlexibleAgentDefinition, required: string[]): number {
    return calculateMatchScore(agent.capabilities, required)
  }

  /**
   * Compose a chain from skills matching the required capabilities
   */
  export function composeChain(taskIntent: TaskIntent): { id: string; steps: { skillId: string }[] } | null {
    const capabilities = extractCapabilitiesFromIntent(taskIntent)
    if (capabilities.length === 0) return null

    // Check if there's an existing chain for these capabilities
    const existingChain = ChainRegistry.findChainForCapabilities(capabilities)
    if (existingChain) {
      return existingChain
    }

    // Try to compose from available skills
    const skills = SkillRegistry.findByCapabilities(capabilities)
    if (skills.length === 0) return null

    const bestSkill = findBestSkill(skills, capabilities)
    if (!bestSkill) return null

    // Return as single-step "chain"
    return {
      id: `composed-${bestSkill.id}`,
      steps: [{ skillId: bestSkill.id }],
    }
  }

  /**
   * Route a task intent to the best matching skill, chain, or agent
   */
  export function routeTask(taskIntent: TaskIntent, agency?: string): RouteResult {
    const capabilities = extractCapabilitiesFromIntent(taskIntent)
    log.debug("routing task", { intent: taskIntent.intent, capabilities, agency })

    // Check agency policies if agency is specified
    if (agency) {
      const deniedCaps = AgencyRegistry.getDeniedCapabilities(agency)
      const matchingDenied = capabilities.filter((c) => deniedCaps.includes(c))
      const firstDenied = matchingDenied[0]
      if (firstDenied) {
        throw new CapabilityDeniedError(firstDenied, agency)
      }
    }

    // 1. Try to find a matching skill
    if (capabilities.length > 0) {
      const skills = SkillRegistry.findByCapabilities(capabilities)
      const bestSkill = findBestSkill(skills, capabilities)
      if (bestSkill) {
        const score = calculateMatchScore(bestSkill.capabilities, capabilities)
        return {
          type: "skill",
          skill: bestSkill.id,
          confidence: score,
          reason: `Best skill match for ${capabilities.join(", ")}`,
        }
      }

      // 2. Try to find a matching chain
      const chain = ChainRegistry.findChainForCapabilities(capabilities)
      if (chain) {
        return {
          type: "chain",
          chain: chain.id,
          confidence: 1.0,
          reason: `Chain found for ${capabilities.join(", ")}`,
        }
      }
    }

    // 3. Try to find a matching agent
    const agents = FlexibleAgentRegistry.findByCapabilities(capabilities, agency)
    const bestAgent = findBestAgent(agents, capabilities)
    if (bestAgent) {
      const score = calculateMatchScore(bestAgent.capabilities, capabilities)
      return {
        type: "agent",
        agent: bestAgent.id,
        confidence: score,
        reason: `Best agent match for ${capabilities.join(", ")}`,
      }
    }

    // No match found
    throw new NoMatchingCapabilityError(capabilities)
  }

  /**
   * Extract capabilities from task intent
   */
  function extractCapabilitiesFromIntent(taskIntent: TaskIntent): string[] {
    // If capabilities are provided in parameters, use them
    if (taskIntent.parameters.capabilities && Array.isArray(taskIntent.parameters.capabilities)) {
      return taskIntent.parameters.capabilities as string[]
    }
    // If intent itself is a capability-like string, use it
    if (taskIntent.intent) {
      return [taskIntent.intent]
    }
    return []
  }
}

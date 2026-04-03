// AgentRegistry - capability-based agent registration and lookup
// Phase 2: Flexible Agency Architecture

import { Log } from "@/util/log"
import { FlexibleAgentDefinitionSchema, type FlexibleAgentDefinition } from "./types"

const log = Log.create({ service: "kiloclaw.registry.agent" })

export namespace FlexibleAgentRegistry {
  const registry = new Map<string, FlexibleAgentDefinition>()
  const capabilitiesIndex = new Map<string, Set<string>>()
  const agencyIndex = new Map<string, Set<string>>()

  function indexAgent(agent: FlexibleAgentDefinition): void {
    for (const cap of agent.capabilities) {
      if (!capabilitiesIndex.has(cap)) {
        capabilitiesIndex.set(cap, new Set())
      }
      capabilitiesIndex.get(cap)!.add(agent.id)
    }

    if (!agencyIndex.has(agent.primaryAgency)) {
      agencyIndex.set(agent.primaryAgency, new Set())
    }
    agencyIndex.get(agent.primaryAgency)!.add(agent.id)

    for (const agency of agent.secondaryAgencies) {
      if (!agencyIndex.has(agency)) {
        agencyIndex.set(agency, new Set())
      }
      agencyIndex.get(agency)!.add(agent.id)
    }
  }

  function unindexAgent(agent: FlexibleAgentDefinition): void {
    for (const cap of agent.capabilities) {
      capabilitiesIndex.get(cap)?.delete(agent.id)
    }
    agencyIndex.get(agent.primaryAgency)?.delete(agent.id)
    for (const agency of agent.secondaryAgencies) {
      agencyIndex.get(agency)?.delete(agent.id)
    }
  }

  export function registerAgent(agent: FlexibleAgentDefinition): void {
    const parsed = FlexibleAgentDefinitionSchema.parse(agent)

    if (registry.has(parsed.id)) {
      throw new Error(`Agent ${parsed.id} already registered`)
    }

    registry.set(parsed.id, parsed)
    indexAgent(parsed)

    log.debug("agent registered", { agentId: parsed.id })
  }

  export function unregisterAgent(agentId: string): boolean {
    const agent = registry.get(agentId)
    if (!agent) return false

    unindexAgent(agent)
    registry.delete(agentId)

    log.debug("agent unregistered", { agentId })
    return true
  }

  export function getAgent(agentId: string): FlexibleAgentDefinition | undefined {
    return registry.get(agentId)
  }

  export function getAllAgents(): FlexibleAgentDefinition[] {
    return Array.from(registry.values())
  }

  function matchScore(agent: FlexibleAgentDefinition, required: string[]): number {
    if (required.length === 0) return 1
    const matched = agent.capabilities.filter((cap) => required.includes(cap))
    return matched.length / required.length
  }

  export function findByCapabilities(required: string[], agency?: string): FlexibleAgentDefinition[] {
    let candidates = agency ? getAgentsByAgency(agency) : getAllAgents()

    if (required.length === 0) {
      return candidates
    }

    return candidates
      .filter((agent) => required.every((cap) => agent.capabilities.includes(cap)))
      .sort((a, b) => matchScore(b, required) - matchScore(a, required))
  }

  export function getAgentsByAgency(agencyId: string): FlexibleAgentDefinition[] {
    const agentIds = agencyIndex.get(agencyId)
    if (!agentIds) return []

    return Array.from(agentIds)
      .map((id) => registry.get(id))
      .filter((a): a is FlexibleAgentDefinition => a !== undefined)
  }

  export function clear(): void {
    registry.clear()
    capabilitiesIndex.clear()
    agencyIndex.clear()
  }
}

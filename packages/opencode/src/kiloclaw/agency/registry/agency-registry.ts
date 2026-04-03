// AgencyRegistry - agency registration with domain indexing and policy lookup
// Phase 2: Flexible Agency Architecture

import { Log } from "@/util/log"
import { AgencyDefinitionSchema, type AgencyDefinition } from "./types"

const log = Log.create({ service: "kiloclaw.registry.agency" })

export namespace AgencyRegistry {
  const registry = new Map<string, AgencyDefinition>()
  const domainIndex = new Map<string, string>()

  export function registerAgency(agency: AgencyDefinition): void {
    const parsed = AgencyDefinitionSchema.parse(agency)

    if (registry.has(parsed.id)) {
      throw new Error(`Agency ${parsed.id} already registered`)
    }

    const existingDomain = domainIndex.get(parsed.domain)
    if (existingDomain) {
      throw new Error(`Domain '${parsed.domain}' already registered by agency '${existingDomain}'`)
    }

    registry.set(parsed.id, parsed)
    domainIndex.set(parsed.domain, parsed.id)

    log.debug("agency registered", { agencyId: parsed.id, domain: parsed.domain })
  }

  export function unregisterAgency(agencyId: string): boolean {
    const agency = registry.get(agencyId)
    if (!agency) return false

    domainIndex.delete(agency.domain)
    registry.delete(agencyId)

    log.debug("agency unregistered", { agencyId })
    return true
  }

  export function getAgency(agencyId: string): AgencyDefinition | undefined {
    return registry.get(agencyId)
  }

  export function getByDomain(domain: string): AgencyDefinition | undefined {
    const agencyId = domainIndex.get(domain)
    return agencyId ? registry.get(agencyId) : undefined
  }

  export function getAllAgencies(): AgencyDefinition[] {
    return Array.from(registry.values())
  }

  export function getAllowedCapabilities(agencyId: string): string[] {
    const agency = registry.get(agencyId)
    return agency?.policies.allowedCapabilities ?? []
  }

  export function getDeniedCapabilities(agencyId: string): string[] {
    const agency = registry.get(agencyId)
    return agency?.policies.deniedCapabilities ?? []
  }

  export function clear(): void {
    registry.clear()
    domainIndex.clear()
  }
}

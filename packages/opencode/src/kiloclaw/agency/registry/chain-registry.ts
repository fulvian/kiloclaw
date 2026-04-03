// ChainRegistry - skill chain registration and lookup
// Phase 2: Flexible Agency Architecture

import { Log } from "@/util/log"
import { SkillChainSchema, type SkillChain } from "./types"
import { SkillRegistry } from "./skill-registry"

const log = Log.create({ service: "kiloclaw.registry.chain" })

export namespace ChainRegistry {
  const registry = new Map<string, SkillChain>()
  const capabilitiesIndex = new Map<string, Set<string>>()

  function indexChain(chain: SkillChain): void {
    const chainCaps = new Set<string>()
    for (const step of chain.steps) {
      const cap = step.skillId
      if (!capabilitiesIndex.has(cap)) {
        capabilitiesIndex.set(cap, new Set())
      }
      capabilitiesIndex.get(cap)!.add(chain.id)
      chainCaps.add(cap)
    }
  }

  function unindexChain(chain: SkillChain): void {
    for (const step of chain.steps) {
      capabilitiesIndex.get(step.skillId)?.delete(chain.id)
    }
  }

  export function registerChain(chain: SkillChain): void {
    const parsed = SkillChainSchema.parse(chain)

    if (registry.has(parsed.id)) {
      throw new Error(`Chain ${parsed.id} already registered`)
    }

    registry.set(parsed.id, parsed)
    indexChain(parsed)

    log.debug("chain registered", { chainId: parsed.id })
  }

  export function unregisterChain(chainId: string): boolean {
    const chain = registry.get(chainId)
    if (!chain) return false

    unindexChain(chain)
    registry.delete(chainId)

    log.debug("chain unregistered", { chainId })
    return true
  }

  export function getChain(chainId: string): SkillChain | undefined {
    return registry.get(chainId)
  }

  export function getAllChains(): SkillChain[] {
    return Array.from(registry.values())
  }

  export function findChainForCapabilities(required: string[]): SkillChain | undefined {
    if (required.length === 0) return undefined

    // Find chains where all required capabilities are provided by the chain's skills
    const matchingChains = getAllChains().filter((chain) => {
      // Get all capabilities provided by this chain's skills
      const chainCapabilities = new Set<string>()
      const chainSkillIds = new Set<string>()
      for (const step of chain.steps) {
        chainSkillIds.add(step.skillId)
        const skill = SkillRegistry.getSkill(step.skillId)
        if (skill) {
          for (const cap of skill.capabilities) {
            chainCapabilities.add(cap)
          }
        }
      }
      // Check if all required capabilities are provided
      // Also accept skillId as a match (for cases where required is skillId, not capability)
      return required.every((cap) => chainCapabilities.has(cap) || chainSkillIds.has(cap))
    })

    return matchingChains[0]
  }

  export function clear(): void {
    registry.clear()
    capabilitiesIndex.clear()
  }
}

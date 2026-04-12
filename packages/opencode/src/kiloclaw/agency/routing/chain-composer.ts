// ChainComposer - composes skill chains from available capabilities
// Phase 4: Flexible Agency Architecture

import { Log } from "@/util/log"
import { SkillRegistry } from "../registry/skill-registry"
import { ChainRegistry } from "../registry/chain-registry"
import type { SkillChain } from "../registry/types"

const log = Log.create({ service: "kiloclaw.routing.chain-composer" })

export class ChainCompositionError extends Error {
  constructor(reason: string) {
    super(`Cannot compose chain: ${reason}`)
    this.name = "ChainCompositionError"
  }
}

export namespace ChainComposer {
  /**
   * Check if a chain can be composed for the required capabilities
   */
  export function canCompose(requiredCapabilities: string[]): boolean {
    if (requiredCapabilities.length === 0) return false

    // Check if there's an existing chain
    const existingChain = ChainRegistry.findChainForCapabilities(requiredCapabilities)
    if (existingChain) return true

    // Check if we can find skills for each capability
    for (const cap of requiredCapabilities) {
      const skills = SkillRegistry.findByCapabilities([cap])
      if (skills.length === 0) {
        log.debug("cannot compose - no skill for capability", { capability: cap })
        return false
      }
    }

    return true
  }

  /**
   * Compose a chain from skills matching the required capabilities
   */
  export function compose(requiredCapabilities: string[]): SkillChain | null {
    if (requiredCapabilities.length === 0) return null

    // First, check if there's an existing chain that matches
    const existingChain = ChainRegistry.findChainForCapabilities(requiredCapabilities)
    if (existingChain) {
      log.debug("using existing chain", { chainId: existingChain.id })
      return existingChain
    }

    // Try to compose a new chain from available skills
    const steps: { skillId: string; inputTransform?: string; outputTransform?: string; condition?: string }[] = []

    for (const cap of requiredCapabilities) {
      const skills = SkillRegistry.findByCapabilities([cap])
      if (skills.length === 0) {
        log.debug("cannot compose - no skill for capability", { capability: cap })
        return null
      }

      // Pick the first/best skill for this capability
      // Sort by number of capabilities matched (prefer more specific skills)
      skills.sort((a, b) => b.capabilities.length - a.capabilities.length)
      const bestSkill = skills[0]
      if (!bestSkill) continue

      // Avoid duplicate steps
      if (!steps.some((s) => s.skillId === bestSkill.id)) {
        steps.push({ skillId: bestSkill.id })
      }
    }

    if (steps.length === 0) {
      return null
    }

    // Generate a unique chain ID
    const chainId = `composed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const name = `Composed chain for ${requiredCapabilities.join(", ")}`

    const composedChain: SkillChain = {
      id: chainId,
      name,
      description: `Auto-composed chain for capabilities: ${requiredCapabilities.join(", ")}`,
      steps,
      outputSchema: {},
      version: "1.0.0",
    }

    log.debug("composed new chain", { chainId, steps: steps.length })
    return composedChain
  }

  /**
   * Estimate the number of steps needed to fulfill required capabilities
   */
  export function estimateChainSteps(requiredCapabilities: string[]): number {
    if (requiredCapabilities.length === 0) return 0

    // Check existing chain first
    const existingChain = ChainRegistry.findChainForCapabilities(requiredCapabilities)
    if (existingChain) {
      return existingChain.steps.length
    }

    // Count unique skills needed
    const uniqueSkillIds = new Set<string>()

    for (const cap of requiredCapabilities) {
      const skills = SkillRegistry.findByCapabilities([cap])
      if (skills.length > 0) {
        // Pick the best match
        skills.sort((a, b) => b.capabilities.length - a.capabilities.length)
        const bestSkill = skills[0]
        if (bestSkill) {
          uniqueSkillIds.add(bestSkill.id)
        }
      }
    }

    return uniqueSkillIds.size
  }

  /**
   * Find the best existing chain for required capabilities, or null
   */
  export function findBestChain(requiredCapabilities: string[]): SkillChain | undefined {
    if (requiredCapabilities.length === 0) return undefined
    return ChainRegistry.findChainForCapabilities(requiredCapabilities)
  }
}

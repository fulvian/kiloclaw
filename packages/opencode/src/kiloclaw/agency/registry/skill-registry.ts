// SkillRegistry - capability-based skill registration and lookup
// Phase 2: Flexible Agency Architecture

import { Log } from "@/util/log"
import { SkillDefinitionSchema, type SkillDefinition } from "./types"

const log = Log.create({ service: "kiloclaw.registry.skill" })

export namespace SkillRegistry {
  const registry = new Map<string, SkillDefinition>()
  const capabilitiesIndex = new Map<string, Set<string>>()
  const tagIndex = new Map<string, Set<string>>()

  function indexSkill(skill: SkillDefinition): void {
    for (const cap of skill.capabilities) {
      if (!capabilitiesIndex.has(cap)) {
        capabilitiesIndex.set(cap, new Set())
      }
      capabilitiesIndex.get(cap)!.add(skill.id)
    }

    for (const tag of skill.tags) {
      if (!tagIndex.has(tag)) {
        tagIndex.set(tag, new Set())
      }
      tagIndex.get(tag)!.add(skill.id)
    }
  }

  function unindexSkill(skill: SkillDefinition): void {
    for (const cap of skill.capabilities) {
      capabilitiesIndex.get(cap)?.delete(skill.id)
    }
    for (const tag of skill.tags) {
      tagIndex.get(tag)?.delete(skill.id)
    }
  }

  export function registerSkill(skill: SkillDefinition): void {
    const parsed = SkillDefinitionSchema.parse(skill)

    if (registry.has(parsed.id)) {
      throw new Error(`Skill ${parsed.id} already registered`)
    }

    registry.set(parsed.id, parsed)
    indexSkill(parsed)

    log.debug("skill registered", { skillId: parsed.id })
  }

  export function unregisterSkill(skillId: string): boolean {
    const skill = registry.get(skillId)
    if (!skill) return false

    unindexSkill(skill)
    registry.delete(skillId)

    log.debug("skill unregistered", { skillId })
    return true
  }

  export function getSkill(skillId: string): SkillDefinition | undefined {
    return registry.get(skillId)
  }

  export function getAllSkills(): SkillDefinition[] {
    return Array.from(registry.values())
  }

  export function findByCapabilities(required: string[]): SkillDefinition[] {
    if (required.length === 0) return getAllSkills()

    const matchingSkillIds = new Set<string>()

    for (const cap of required) {
      const skillIds = capabilitiesIndex.get(cap)
      if (skillIds) {
        for (const id of skillIds) {
          // OR semantics: add all skills matching any capability
          matchingSkillIds.add(id)
        }
      }
    }

    // OR semantics: return any skill that has at least one matching capability
    // Then sort by how many capabilities it matches (descending)
    return Array.from(matchingSkillIds)
      .map((id) => registry.get(id))
      .filter((s): s is SkillDefinition => s !== undefined)
      .sort((a, b) => {
        const scoreA = a.capabilities.filter((c) => required.includes(c)).length
        const scoreB = b.capabilities.filter((c) => required.includes(c)).length
        return scoreB - scoreA
      })
  }

  export function findByTag(tag: string): SkillDefinition[] {
    const skillIds = tagIndex.get(tag)
    if (!skillIds) return []

    return Array.from(skillIds)
      .map((id) => registry.get(id))
      .filter((s): s is SkillDefinition => s !== undefined)
  }

  export function getVersion(skillId: string): string | undefined {
    return registry.get(skillId)?.version
  }

  export function clear(): void {
    registry.clear()
    capabilitiesIndex.clear()
    tagIndex.clear()
  }
}

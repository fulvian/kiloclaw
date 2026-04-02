import { Log } from "@/util/log"
import { fn } from "@/util/fn"
import z from "zod"
import { type SkillId, type ToolId, type SemanticVersion, type CapabilitySet, SemanticVersion } from "./types"
import type { Skill } from "./skill"
import type { Tool } from "./tool"

export namespace Registry {
  const log = Log.create({ service: "kiloclaw.registry" })

  // Versioned entry with capability metadata
  interface VersionedEntry<T> {
    item: T
    version: SemanticVersion
    capabilities: string[]
    deprecated: boolean
    registeredAt: number
  }

  // Skill entry
  interface SkillEntry extends VersionedEntry<Skill> {
    tags: string[]
  }

  // Tool entry
  interface ToolEntry extends VersionedEntry<Tool> {}

  export interface Stats {
    skills: number
    tools: number
    capabilities: number
  }

  export const Stats = z.object({
    skills: z.number().int().nonnegative(),
    tools: z.number().int().nonnegative(),
    capabilities: z.number().int().nonnegative(),
  })
  export type Stats = z.infer<typeof Stats>
}

// Registry interface for skills and tools
export interface Registry {
  // Skill management
  registerSkill(skill: Skill): void
  unregisterSkill(skillId: SkillId): boolean
  getSkill(skillId: SkillId, version?: SemanticVersion): Skill | undefined
  listSkills(): Skill[]
  findSkillsByCapability(capability: string): Skill[]

  // Tool management
  registerTool(tool: Tool): void
  unregisterTool(toolId: ToolId): boolean
  getTool(toolId: ToolId): Tool | undefined
  listTools(): Tool[]

  // Stats
  getStats(): Registry.Stats
}

export namespace Registry {
  export const create = fn(z.object({}), () => {
    const skills = new Map<SkillId, SkillEntry>()
    const tools = new Map<ToolId, ToolEntry>()
    const capabilities = new Set<string>()

    return {
      // Skill management
      registerSkill(skill: Skill): void {
        const entry: SkillEntry = {
          item: skill,
          version: skill.version,
          capabilities: skill.capabilities,
          deprecated: false,
          registeredAt: Date.now(),
        }
        skills.set(skill.id, entry)
        skill.capabilities.forEach((c) => capabilities.add(c))
        log.info("skill registered", { skillId: skill.id, version: skill.version })
      },

      unregisterSkill(skillId: SkillId): boolean {
        const entry = skills.get(skillId)
        if (entry) {
          // Remove capabilities that are no longer used
          const remainingCapabilities = new Set<string>()
          for (const [id, e] of skills) {
            if (id !== skillId) {
              e.item.capabilities.forEach((c) => remainingCapabilities.add(c))
            }
          }
          capabilities.clear()
          remainingCapabilities.forEach((c) => capabilities.add(c))

          skills.delete(skillId)
          log.info("skill unregistered", { skillId })
          return true
        }
        return false
      },

      getSkill(skillId: SkillId, version?: SemanticVersion): Skill | undefined {
        const entry = skills.get(skillId)
        if (!entry) return undefined
        if (version && entry.version !== version) return undefined
        return entry.item
      },

      listSkills(): Skill[] {
        return [...skills.values()].filter((e) => !e.deprecated).map((e) => e.item)
      },

      findSkillsByCapability(capability: string): Skill[] {
        return [...skills.values()]
          .filter((e) => !e.deprecated && e.item.capabilities.includes(capability))
          .map((e) => e.item)
      },

      // Tool management
      registerTool(tool: Tool): void {
        const entry: ToolEntry = {
          item: tool,
          version: "1.0.0" as SemanticVersion, // Tools use implicit versioning
          capabilities: tool.permissionScope,
          deprecated: false,
          registeredAt: Date.now(),
        }
        tools.set(tool.id, entry)
        log.info("tool registered", { toolId: tool.id })
      },

      unregisterTool(toolId: ToolId): boolean {
        const deleted = tools.delete(toolId)
        if (deleted) {
          log.info("tool unregistered", { toolId })
        }
        return deleted
      },

      getTool(toolId: ToolId): Tool | undefined {
        return tools.get(toolId)?.item
      },

      listTools(): Tool[] {
        return [...tools.values()].filter((e) => !e.deprecated).map((e) => e.item)
      },

      // Stats
      getStats(): Registry.Stats {
        return {
          skills: skills.size,
          tools: tools.size,
          capabilities: capabilities.size,
        }
      },
    } satisfies Registry
  })
}

import { Log } from "@/util/log"
import { fn } from "@/util/fn"
import z from "zod"
import { type SkillId, type ToolId, type SemanticVersion } from "./types"
import type { Skill } from "./skill"
import type { Tool } from "./tool"

// Registry interfaces
export interface RegistryStats {
  skills: number
  tools: number
  capabilities: number
}

// Registry interface for skills and tools
export interface Registry {
  // Skill management
  registerSkill(skill: Skill): void
  unregisterSkill(skillId: string): boolean
  getSkill(skillId: string, version?: SemanticVersion): Skill | undefined
  listSkills(): Skill[]
  findSkillsByCapability(capability: string): Skill[]

  // Tool management
  registerTool(tool: Tool): void
  unregisterTool(toolId: string): boolean
  getTool(toolId: string): Tool | undefined
  listTools(): Tool[]

  // Stats
  getStats(): RegistryStats
}

// Registry factory
export const Registry = {
  create: fn(z.object({}), () => {
    const log = Log.create({ service: "kiloclaw.registry" })
    const skills = new Map<string, Skill>()
    const tools = new Map<string, Tool>()
    const capabilities = new Set<string>()

    const registry: Registry = {
      // Skill management
      registerSkill(skill: Skill): void {
        skills.set(skill.id, skill)
        skill.capabilities.forEach((c) => capabilities.add(c))
        log.info("skill registered", { skillId: skill.id, version: skill.version })
      },

      unregisterSkill(skillId: string): boolean {
        const skill = skills.get(skillId)
        if (skill) {
          // Remove capabilities that are no longer used
          const remainingCapabilities = new Set<string>()
          for (const [id, s] of skills) {
            if (id !== skillId) {
              s.capabilities.forEach((c) => remainingCapabilities.add(c))
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

      getSkill(skillId: string, version?: SemanticVersion): Skill | undefined {
        const skill = skills.get(skillId)
        if (!skill) return undefined
        if (version && skill.version !== version) return undefined
        return skill
      },

      listSkills(): Skill[] {
        return [...skills.values()]
      },

      findSkillsByCapability(capability: string): Skill[] {
        return [...skills.values()].filter((s) => s.capabilities.includes(capability))
      },

      // Tool management
      registerTool(tool: Tool): void {
        tools.set(tool.id, tool)
        log.info("tool registered", { toolId: tool.id })
      },

      unregisterTool(toolId: string): boolean {
        const deleted = tools.delete(toolId)
        if (deleted) {
          log.info("tool unregistered", { toolId })
        }
        return deleted
      },

      getTool(toolId: string): Tool | undefined {
        return tools.get(toolId)
      },

      listTools(): Tool[] {
        return [...tools.values()]
      },

      // Stats
      getStats(): RegistryStats {
        return {
          skills: skills.size,
          tools: tools.size,
          capabilities: capabilities.size,
        }
      },
    }

    return registry
  }),
}

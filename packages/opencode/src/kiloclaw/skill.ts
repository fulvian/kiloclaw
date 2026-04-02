import { Log } from "@/util/log"
import { fn } from "@/util/fn"
import z from "zod"
import { type SkillId, type SemanticVersion } from "./types"
import type { SkillContext } from "./agency"
export type { SkillContext }
export { SkillContext as SkillContextType } from "./agency"

// JsonSchema type
interface JsonSchema {
  readonly type: string
  readonly properties?: Record<string, JsonSchema>
  readonly required?: readonly string[]
  readonly items?: JsonSchema
  readonly enum?: unknown[]
  readonly const?: unknown
  readonly additionalProperties?: boolean | JsonSchema
  readonly $ref?: string
  readonly description?: string
  readonly minimum?: number
  readonly maximum?: number
}

// Skill interface
export interface Skill {
  readonly id: SkillId
  readonly version: SemanticVersion
  readonly name: string
  readonly inputSchema: JsonSchema
  readonly outputSchema: JsonSchema
  execute(input: unknown, context: SkillContext): Promise<unknown>
  readonly capabilities: string[]
  readonly tags: string[]
}

// Skill namespace with factory
export namespace Skill {
  export interface Info {
    readonly id: SkillId
    readonly version: SemanticVersion
    readonly name: string
    readonly capabilities: string[]
    readonly tags: string[]
  }

  export const Info = z.object({
    id: z.string(),
    version: z.string(),
    name: z.string(),
    capabilities: z.array(z.string()),
    tags: z.array(z.string()),
  })

  export const create = fn(
    Info.extend({
      inputSchema: z.record(z.string(), z.unknown()),
      outputSchema: z.record(z.string(), z.unknown()),
    }),
    (input) => {
      const log = Log.create({ service: "kiloclaw.skill" })
      const skillId = input.id
      const skillName = input.name

      const skill: Skill = {
        id: skillId as SkillId,
        version: input.version as SemanticVersion,
        name: skillName,
        inputSchema: input.inputSchema as unknown as JsonSchema,
        outputSchema: input.outputSchema as unknown as JsonSchema,
        capabilities: input.capabilities,
        tags: input.tags,
        async execute(input: unknown, context: SkillContext): Promise<unknown> {
          log.info("skill executing", {
            skillId,
            skillName,
            correlationId: context.correlationId,
          })
          return { result: "skill executed", input }
        },
      }
      return skill
    },
  )
}

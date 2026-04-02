import { Log } from "@/util/log"
import { fn } from "@/util/fn"
import z from "zod"
import { type SkillId, type SemanticVersion, type JsonSchema, SemanticVersion } from "./types"
import { type SkillContext } from "./agency"

export namespace Skill {
  const log = Log.create({ service: "kiloclaw.skill" })

  export interface Info {
    readonly id: SkillId
    readonly version: SemanticVersion
    readonly name: string
    readonly capabilities: string[]
    readonly tags: string[]
  }

  export const Info = z.object({
    id: z.string() as z.ZodType<SkillId>,
    version: SemanticVersion,
    name: z.string(),
    capabilities: z.array(z.string()),
    tags: z.array(z.string()),
  })
  export type Info = z.infer<typeof Info>

  // JSON Schema as Zod schema for input/output validation
  export const InputSchema = z.record(z.string(), z.unknown())
  export type InputSchema = z.infer<typeof InputSchema>

  export const OutputSchema = z.record(z.string(), z.unknown())
  export type OutputSchema = z.infer<typeof OutputSchema>
}

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

export namespace Skill {
  export const create = fn(
    Info.extend({
      inputSchema: z.record(z.string(), z.unknown()),
      outputSchema: z.record(z.string(), z.unknown()),
    }),
    (input) => {
      return {
        id: input.id,
        version: input.version,
        name: input.name,
        inputSchema: input.inputSchema,
        outputSchema: input.outputSchema,
        capabilities: input.capabilities,
        tags: input.tags,
        async execute(input: unknown, context: SkillContext): Promise<unknown> {
          log.info("skill executing", {
            skillId: input.id,
            skillName: input.name,
            correlationId: context.correlationId,
          })
          return { result: "skill executed", input }
        },
      } satisfies Skill
    },
  )
}

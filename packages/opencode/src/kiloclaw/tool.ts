import { Log } from "@/util/log"
import { fn } from "@/util/fn"
import z from "zod"
import { type ToolId, type PermissionScope, type PermissionSet, PermissionScope } from "./types"
import { type ToolResult, type ToolHealth } from "./agency"

export namespace Tool {
  const log = Log.create({ service: "kiloclaw.tool" })

  export interface Info {
    readonly id: ToolId
    readonly name: string
    readonly permissionScope: PermissionScope[]
  }

  export const Info = z.object({
    id: z.string() as z.ZodType<ToolId>,
    name: z.string(),
    permissionScope: z.array(PermissionScope),
  })
  export type Info = z.infer<typeof Info>
}

export interface Tool {
  readonly id: ToolId
  readonly name: string
  readonly permissionScope: PermissionScope[]
  execute(input: unknown, permissions: PermissionSet): Promise<ToolResult>
  health(): Promise<ToolHealth>
}

export namespace Tool {
  export const create = fn(Info, (input) => {
    return {
      id: input.id,
      name: input.name,
      permissionScope: input.permissionScope,
      async execute(input: unknown, permissions: PermissionSet): Promise<ToolResult> {
        log.info("tool executing", { toolId: input.id, toolName: input.name })
        const start = Date.now()

        // Check permissions
        const hasPermission = input.permissionScope.every((scope) => permissions.includes(scope))
        if (!hasPermission) {
          return {
            success: false,
            error: "Insufficient permissions",
            durationMs: Date.now() - start,
          }
        }

        return {
          success: true,
          output: { message: "Tool executed" },
          durationMs: Date.now() - start,
        }
      },
      async health(): Promise<ToolHealth> {
        return {
          healthy: true,
          latencyMs: 0,
        }
      },
    } satisfies Tool
  })
}

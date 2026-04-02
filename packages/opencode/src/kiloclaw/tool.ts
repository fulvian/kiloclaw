import { Log } from "@/util/log"
import { fn } from "@/util/fn"
import z from "zod"
import { type ToolId, PermissionScope } from "./types"
import type { ToolResult, ToolHealth } from "./agency"

// Tool interface
export interface Tool {
  readonly id: ToolId
  readonly name: string
  readonly permissionScope: PermissionScope[]
  execute(input: unknown, permissions: PermissionScope[]): Promise<ToolResult>
  health(): Promise<ToolHealth>
}

// Tool factory
export const createTool = fn(
  z.object({
    id: z.string(),
    name: z.string(),
    permissionScope: z.array(PermissionScope),
  }),
  (input) => {
    const log = Log.create({ service: "kiloclaw.tool" })
    const toolId = input.id as ToolId
    const toolName = input.name
    const toolPermissions = input.permissionScope as PermissionScope[]

    const tool: Tool = {
      id: toolId,
      name: toolName,
      permissionScope: toolPermissions,
      async execute(input: unknown, permissions: PermissionScope[]): Promise<ToolResult> {
        log.info("tool executing", { toolId, toolName })
        const start = Date.now()

        // Check permissions against tool's declared permissions
        const hasPermission = toolPermissions.every((scope: PermissionScope) => permissions.includes(scope))
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
    }
    return tool
  },
)

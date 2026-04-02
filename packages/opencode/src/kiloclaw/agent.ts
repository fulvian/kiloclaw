import { Log } from "@/util/log"
import { fn } from "@/util/fn"
import z from "zod"
import {
  type AgentId,
  type AgencyId,
  type CapabilitySet,
  type LimitSet,
  type AgentStatus,
  type JsonSchema,
  CapabilitySet,
  LimitSet,
} from "./types"
import { type Task, type ExecutionContext, type ExecutionResult } from "./agency"

export namespace Agent {
  const log = Log.create({ service: "kiloclaw.agent" })

  export interface Info {
    readonly id: AgentId
    readonly agency: AgencyId
    readonly capabilities: CapabilitySet
    readonly limits: LimitSet
    readonly status: AgentStatus
  }

  export const Info = z.object({
    id: z.string() as z.ZodType<AgentId>,
    agency: z.string() as z.ZodType<AgencyId>,
    capabilities: CapabilitySet,
    limits: LimitSet,
  })
  export type Info = z.infer<typeof Info>

  export const create = fn(Info, (input) => {
    let status: AgentStatus = "idle"

    return {
      id: input.id,
      agency: input.agency,
      capabilities: input.capabilities,
      limits: input.limits,
      getStatus(): AgentStatus {
        return status
      },
      async execute(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
        log.info("agent executing task", {
          agentId: input.id,
          taskId: task.id,
          correlationId: context.correlationId,
        })
        status = "busy"
        try {
          const result: ExecutionResult = {
            success: true,
            output: { message: "Task executed" },
          }
          return result
        } catch (err) {
          log.error("agent task execution failed", { agentId: input.id, taskId: task.id, err })
          return {
            success: false,
            error: String(err),
          }
        } finally {
          status = "idle"
        }
      },
    } satisfies Agent
  })
}

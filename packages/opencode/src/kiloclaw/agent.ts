import { Log } from "@/util/log"
import { fn } from "@/util/fn"
import z from "zod"
import { type AgentId, type AgencyId, CapabilitySet, LimitSet, type AgentStatus } from "./types"
import { type Task, type ExecutionContext, type ExecutionResult } from "./agency"

// Agent interface
export interface Agent {
  readonly id: AgentId
  readonly agency: AgencyId
  readonly capabilities: CapabilitySet
  readonly limits: LimitSet
  execute(task: Task, context: ExecutionContext): Promise<ExecutionResult>
  getStatus(): AgentStatus
}

// Agent namespace with factory
export namespace Agent {
  export interface Info {
    readonly id: AgentId
    readonly agency: AgencyId
    readonly capabilities: CapabilitySet
    readonly limits: LimitSet
  }

  export const Info = z.object({
    id: z.string(),
    agency: z.string(),
    capabilities: CapabilitySet,
    limits: LimitSet,
  })

  export const create = fn(Info, (input) => {
    const log = Log.create({ service: "kiloclaw.agent" })
    let status: AgentStatus = "idle"

    const agent: Agent = {
      id: input.id as AgentId,
      agency: input.agency as AgencyId,
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
    }
    return agent
  })
}

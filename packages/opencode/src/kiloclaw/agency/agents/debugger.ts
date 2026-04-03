// DebuggerAgent - Development agency agent specialized in debugging and root-cause analysis
// As per HANDOVER_specialized-agents.md

import { Log } from "@/util/log"
import type { Agent } from "../../agent"
import type { Task, ExecutionContext, ExecutionResult } from "../../agency"
import { type AgentStatus, type AgentId, type AgencyId, CapabilitySet, LimitSet } from "../../types"
import type { AgentDefinition } from "../types"
import { DebuggingSkill } from "../../skills/development/debugging"
import { runSkill } from "./exec"

// DebuggerAgent definition
export const debuggerAgentDefinition: AgentDefinition = {
  id: "debugger",
  name: "Debugger",
  agencyOwner: "development",
  agencyCross: ["knowledge"],
  taskTypes: ["debugging", "root-cause-analysis"],
  skills: ["debugging"],
  capabilities: ["debugging", "root-cause-analysis", "troubleshooting"],
  description: "Agent specialized in debugging and root-cause analysis",
  version: "1.0.0",
}

// DebuggerAgent implementation
export class DebuggerAgent implements Agent {
  readonly id: AgentId = debuggerAgentDefinition.id as AgentId
  readonly agency: AgencyId = debuggerAgentDefinition.agencyOwner as AgencyId
  readonly capabilities = {} as CapabilitySet
  readonly limits = {} as LimitSet

  private status: AgentStatus = "idle"
  private log = Log.create({ service: "kiloclaw.agent.debugger" })

  getStatus(): AgentStatus {
    return this.status
  }

  async execute(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
    this.log.info("debugger agent executing task", {
      taskId: task.id,
      taskType: task.type,
      correlationId: context.correlationId,
    })
    this.status = "busy"

    try {
      switch (task.type) {
        case "debugging":
          return await this.executeDebugging(task, context)
        case "root-cause-analysis":
          return await this.executeRootCauseAnalysis(task, context)
        default:
          return {
            success: false,
            error: `Unsupported task type: ${task.type}`,
          }
      }
    } catch (err) {
      this.log.error("debugger task execution failed", { taskId: task.id, err })
      return {
        success: false,
        error: String(err),
      }
    } finally {
      this.status = "idle"
    }
  }

  private async executeDebugging(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
    return runSkill(DebuggingSkill, task, context)
  }

  private async executeRootCauseAnalysis(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
    return runSkill(DebuggingSkill, task, context)
  }
}

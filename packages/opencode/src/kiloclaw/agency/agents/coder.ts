// CoderAgent - Development agency agent specialized in code generation and modification
// As per HANDOVER_specialized-agents.md

import { Log } from "@/util/log"
import type { Agent } from "../../agent"
import type { Task, ExecutionContext, ExecutionResult } from "../../agency"
import { type AgentStatus, type AgentId, type AgencyId, CapabilitySet, LimitSet } from "../../types"
import type { AgentDefinition } from "../types"
import { TddSkill } from "../../skills/development/tdd"
import { DebuggingSkill } from "../../skills/development/debugging"
import { runSkill } from "./exec"

// CoderAgent definition
export const coderAgentDefinition: AgentDefinition = {
  id: "coder",
  name: "Coder",
  agencyOwner: "development",
  agencyCross: ["knowledge"],
  taskTypes: ["code-generation", "code-modification", "bug-fixing"],
  skills: ["tdd", "debugging"],
  capabilities: ["coding", "debugging", "refactoring"],
  description: "Agent specialized in code generation, modification, and debugging",
  version: "1.0.0",
}

// CoderAgent implementation
export class CoderAgent implements Agent {
  readonly id: AgentId = coderAgentDefinition.id as AgentId
  readonly agency: AgencyId = coderAgentDefinition.agencyOwner as AgencyId
  readonly capabilities = {} as CapabilitySet
  readonly limits = {} as LimitSet

  private status: AgentStatus = "idle"
  private log = Log.create({ service: "kiloclaw.agent.coder" })

  getStatus(): AgentStatus {
    return this.status
  }

  async execute(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
    this.log.info("coder agent executing task", {
      taskId: task.id,
      taskType: task.type,
      correlationId: context.correlationId,
    })
    this.status = "busy"

    try {
      switch (task.type) {
        case "code-generation":
          return await this.executeCodeGeneration(task, context)
        case "code-modification":
          return await this.executeCodeModification(task, context)
        case "bug-fixing":
          return await this.executeBugFixing(task, context)
        default:
          return {
            success: false,
            error: `Unsupported task type: ${task.type}`,
          }
      }
    } catch (err) {
      this.log.error("coder task execution failed", { taskId: task.id, err })
      return {
        success: false,
        error: String(err),
      }
    } finally {
      this.status = "idle"
    }
  }

  private async executeCodeGeneration(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
    return runSkill(TddSkill, task, context)
  }

  private async executeCodeModification(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
    return runSkill(TddSkill, task, context)
  }

  private async executeBugFixing(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
    return runSkill(DebuggingSkill, task, context)
  }
}

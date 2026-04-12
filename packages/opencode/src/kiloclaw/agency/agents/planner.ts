// PlannerAgent - Development agency agent specialized in task and code planning
// As per HANDOVER_specialized-agents.md

import { Log } from "@/util/log"
import type { Agent } from "../../agent"
import type { Task, ExecutionContext, ExecutionResult } from "../../agency"
import { type AgentStatus, type AgentId, type AgencyId, CapabilitySet, LimitSet } from "../../types"
import type { AgentDefinition } from "../types"
import { TddSkill } from "../../skills/development/tdd"
import { runSkill } from "./exec"

// PlannerAgent definition
export const plannerAgentDefinition: AgentDefinition = {
  id: "planner",
  name: "Planner",
  agencyOwner: "development",
  agencyCross: [],
  taskTypes: ["task-planning", "code-planning"],
  skills: ["tdd"],
  capabilities: ["task-planning", "code-planning", "project-planning"],
  description: "Agent specialized in task planning and code planning",
  version: "1.0.0",
}

// PlannerAgent implementation
export class PlannerAgent implements Agent {
  readonly id: AgentId = plannerAgentDefinition.id as AgentId
  readonly agency: AgencyId = plannerAgentDefinition.agencyOwner as AgencyId
  readonly capabilities = {} as CapabilitySet
  readonly limits = {} as LimitSet

  private status: AgentStatus = "idle"
  private log = Log.create({ service: "kiloclaw.agent.planner" })

  getStatus(): AgentStatus {
    return this.status
  }

  async execute(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
    this.log.info("planner agent executing task", {
      taskId: task.id,
      taskType: task.type,
      correlationId: context.correlationId,
    })
    this.status = "busy"

    try {
      switch (task.type) {
        case "task-planning":
          return await this.executeTaskPlanning(task, context)
        case "code-planning":
          return await this.executeCodePlanning(task, context)
        default:
          return {
            success: false,
            error: `Unsupported task type: ${task.type}`,
          }
      }
    } catch (err) {
      this.log.error("planner task execution failed", { taskId: task.id, err })
      return {
        success: false,
        error: String(err),
      }
    } finally {
      this.status = "idle"
    }
  }

  private async executeTaskPlanning(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
    return runSkill(TddSkill, task, context)
  }

  private async executeCodePlanning(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
    return runSkill(TddSkill, task, context)
  }
}

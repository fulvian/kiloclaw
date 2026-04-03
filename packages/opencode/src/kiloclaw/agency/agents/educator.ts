// EducatorAgent - Knowledge agency agent specialized in summarization and explanation
// As per HANDOVER_specialized-agents.md

import { Log } from "@/util/log"
import type { Agent } from "../../agent"
import type { Task, ExecutionContext, ExecutionResult } from "../../agency"
import { type AgentStatus, type AgentId, type AgencyId, CapabilitySet, LimitSet } from "../../types"
import type { AgentDefinition } from "../types"
import { SynthesisSkill } from "../../skills/knowledge/synthesis"
import { runSkill } from "./exec"

// EducatorAgent definition
export const educatorAgentDefinition: AgentDefinition = {
  id: "educator",
  name: "Educator",
  agencyOwner: "knowledge",
  agencyCross: [],
  taskTypes: ["summarization", "explanation"],
  skills: ["summarization", "explanation"],
  capabilities: ["summarization", "explanation", "teaching"],
  description: "Agent specialized in summarizing and explaining complex topics",
  version: "1.0.0",
}

// EducatorAgent implementation
export class EducatorAgent implements Agent {
  readonly id: AgentId = educatorAgentDefinition.id as AgentId
  readonly agency: AgencyId = educatorAgentDefinition.agencyOwner as AgencyId
  readonly capabilities = {} as CapabilitySet
  readonly limits = {} as LimitSet

  private status: AgentStatus = "idle"
  private log = Log.create({ service: "kiloclaw.agent.educator" })

  getStatus(): AgentStatus {
    return this.status
  }

  async execute(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
    this.log.info("educator agent executing task", {
      taskId: task.id,
      taskType: task.type,
      correlationId: context.correlationId,
    })
    this.status = "busy"

    try {
      switch (task.type) {
        case "summarization":
          return await this.executeSummarization(task, context)
        case "explanation":
          return await this.executeExplanation(task, context)
        default:
          return {
            success: false,
            error: `Unsupported task type: ${task.type}`,
          }
      }
    } catch (err) {
      this.log.error("educator task execution failed", { taskId: task.id, err })
      return {
        success: false,
        error: String(err),
      }
    } finally {
      this.status = "idle"
    }
  }

  private async executeSummarization(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
    return runSkill(SynthesisSkill, task, context)
  }

  private async executeExplanation(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
    return runSkill(SynthesisSkill, task, context)
  }
}

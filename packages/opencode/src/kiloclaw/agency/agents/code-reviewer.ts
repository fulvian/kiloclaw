// CodeReviewerAgent - Development agency agent specialized in code review and fact-checking
// As per HANDOVER_specialized-agents.md

import { Log } from "@/util/log"
import type { Agent } from "../../agent"
import type { Task, ExecutionContext, ExecutionResult } from "../../agency"
import { type AgentStatus, type AgentId, type AgencyId, CapabilitySet, LimitSet } from "../../types"
import type { AgentDefinition } from "../types"
import { CodeReviewSkill } from "../../skills/development/code-review"
import { FactCheckSkill } from "../../skills/knowledge/fact-check"
import { runSkill } from "./exec"

// CodeReviewerAgent definition
export const codeReviewerAgentDefinition: AgentDefinition = {
  id: "code-reviewer",
  name: "Code Reviewer",
  agencyOwner: "development",
  agencyCross: ["knowledge"],
  taskTypes: ["code-review", "fact-checking"],
  skills: ["code-review", "fact-check"],
  capabilities: ["code-review", "quality-assurance"],
  description: "Agent specialized in code review and verification",
  version: "1.0.0",
}

// CodeReviewerAgent implementation
export class CodeReviewerAgent implements Agent {
  readonly id: AgentId = codeReviewerAgentDefinition.id as AgentId
  readonly agency: AgencyId = codeReviewerAgentDefinition.agencyOwner as AgencyId
  readonly capabilities = {} as CapabilitySet
  readonly limits = {} as LimitSet

  private status: AgentStatus = "idle"
  private log = Log.create({ service: "kiloclaw.agent.code-reviewer" })

  getStatus(): AgentStatus {
    return this.status
  }

  async execute(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
    this.log.info("code-reviewer agent executing task", {
      taskId: task.id,
      taskType: task.type,
      correlationId: context.correlationId,
    })
    this.status = "busy"

    try {
      switch (task.type) {
        case "code-review":
          return await this.executeCodeReview(task, context)
        case "fact-checking":
          return await this.executeFactChecking(task, context)
        default:
          return {
            success: false,
            error: `Unsupported task type: ${task.type}`,
          }
      }
    } catch (err) {
      this.log.error("code-reviewer task execution failed", { taskId: task.id, err })
      return {
        success: false,
        error: String(err),
      }
    } finally {
      this.status = "idle"
    }
  }

  private async executeCodeReview(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
    return runSkill(CodeReviewSkill, task, context)
  }

  private async executeFactChecking(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
    return runSkill(FactCheckSkill, task, context)
  }
}

// AnalystAgent - Knowledge agency agent specialized in data analysis and comparison
// As per HANDOVER_specialized-agents.md

import { Log } from "@/util/log"
import type { Agent } from "../../agent"
import type { Task, ExecutionContext, ExecutionResult } from "../../agency"
import { type AgentStatus, type AgentId, type AgencyId, CapabilitySet, LimitSet } from "../../types"
import type { AgentDefinition } from "../types"
import { CriticalAnalysisSkill } from "../../skills/knowledge/critical-analysis"
import { ComparisonSkill } from "../../skills/development/comparison"
import { runSkill } from "./exec"

// AnalystAgent definition
export const analystAgentDefinition: AgentDefinition = {
  id: "analyst",
  name: "Analyst",
  agencyOwner: "knowledge",
  agencyCross: ["development"],
  taskTypes: ["data-analysis", "comparison"],
  skills: ["comparison", "critical-analysis"],
  capabilities: ["data-analysis", "comparison", "insights"],
  description: "Agent specialized in data analysis and comparison tasks",
  version: "1.0.0",
}

// AnalystAgent implementation
export class AnalystAgent implements Agent {
  readonly id: AgentId = analystAgentDefinition.id as AgentId
  readonly agency: AgencyId = analystAgentDefinition.agencyOwner as AgencyId
  readonly capabilities = {} as CapabilitySet
  readonly limits = {} as LimitSet

  private status: AgentStatus = "idle"
  private log = Log.create({ service: "kiloclaw.agent.analyst" })

  getStatus(): AgentStatus {
    return this.status
  }

  async execute(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
    this.log.info("analyst agent executing task", {
      taskId: task.id,
      taskType: task.type,
      correlationId: context.correlationId,
    })
    this.status = "busy"

    try {
      switch (task.type) {
        case "data-analysis":
          return await this.executeDataAnalysis(task, context)
        case "comparison":
          return await this.executeComparison(task, context)
        default:
          return {
            success: false,
            error: `Unsupported task type: ${task.type}`,
          }
      }
    } catch (err) {
      this.log.error("analyst task execution failed", { taskId: task.id, err })
      return {
        success: false,
        error: String(err),
      }
    } finally {
      this.status = "idle"
    }
  }

  private async executeDataAnalysis(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
    return runSkill(CriticalAnalysisSkill, task, context)
  }

  private async executeComparison(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
    return runSkill(ComparisonSkill, task, context)
  }
}

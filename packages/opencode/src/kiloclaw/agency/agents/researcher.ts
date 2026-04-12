// ResearcherAgent - Knowledge agency agent specialized in web and academic research
// As per HANDOVER_specialized-agents.md

import { Log } from "@/util/log"
import type { Agent } from "../../agent"
import type { Task, ExecutionContext, ExecutionResult } from "../../agency"
import { type AgentStatus, type AgentId, type AgencyId, CapabilitySet, LimitSet } from "../../types"
import type { AgentDefinition } from "../types"
import { WebResearchSkill } from "../../skills/knowledge/web-research"
import { LiteratureReviewSkill } from "../../skills/knowledge/literature-review"
import { FactCheckSkill } from "../../skills/knowledge/fact-check"
import { runSkill } from "./exec"

// ResearcherAgent definition
export const researcherAgentDefinition: AgentDefinition = {
  id: "researcher",
  name: "Researcher",
  agencyOwner: "knowledge",
  agencyCross: ["development"],
  taskTypes: ["web-search", "academic-research", "fact-checking", "source-verification"],
  skills: ["web-research", "fact-check", "academic-search"],
  capabilities: ["search", "synthesis", "information_gathering"],
  description: "Research agent specialized in web and academic searches",
  version: "1.0.0",
}

// ResearcherAgent implementation
export class ResearcherAgent implements Agent {
  readonly id: AgentId = researcherAgentDefinition.id as AgentId
  readonly agency: AgencyId = researcherAgentDefinition.agencyOwner as AgencyId
  readonly capabilities = {} as CapabilitySet
  readonly limits = {} as LimitSet

  private status: AgentStatus = "idle"
  private log = Log.create({ service: "kiloclaw.agent.researcher" })

  getStatus(): AgentStatus {
    return this.status
  }

  async execute(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
    this.log.info("researcher agent executing task", {
      taskId: task.id,
      taskType: task.type,
      correlationId: context.correlationId,
    })
    this.status = "busy"

    try {
      switch (task.type) {
        case "web-search":
          return await this.executeWebSearch(task, context)
        case "academic-research":
          return await this.executeAcademicResearch(task, context)
        case "fact-checking":
          return await this.executeFactCheck(task, context)
        case "source-verification":
          return await this.executeSourceVerification(task, context)
        default:
          return {
            success: false,
            error: `Unsupported task type: ${task.type}`,
          }
      }
    } catch (err) {
      this.log.error("researcher task execution failed", { taskId: task.id, err })
      return {
        success: false,
        error: String(err),
      }
    } finally {
      this.status = "idle"
    }
  }

  private async executeWebSearch(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
    return runSkill(WebResearchSkill, task, context)
  }

  private async executeAcademicResearch(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
    return runSkill(LiteratureReviewSkill, task, context)
  }

  private async executeFactCheck(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
    return runSkill(FactCheckSkill, task, context)
  }

  private async executeSourceVerification(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
    return runSkill(FactCheckSkill, task, context)
  }
}

// RecipeSearcherAgent - Nutrition agency agent specialized in recipe search
// As per HANDOVER_specialized-agents.md

import { Log } from "@/util/log"
import type { Agent } from "../../agent"
import type { Task, ExecutionContext, ExecutionResult } from "../../agency"
import { type AgentStatus, type AgentId, type AgencyId, CapabilitySet, LimitSet } from "../../types"
import type { AgentDefinition } from "../types"
import { RecipeSearchSkill } from "../../skills/nutrition/recipe-search"
import { runSkill } from "./exec"

// RecipeSearcherAgent definition
export const recipeSearcherAgentDefinition: AgentDefinition = {
  id: "recipe-searcher",
  name: "Recipe Searcher",
  agencyOwner: "nutrition",
  agencyCross: ["knowledge"],
  taskTypes: ["recipe-search"],
  skills: ["recipe-search"],
  capabilities: ["recipe-search", "food-discovery"],
  description: "Agent specialized in recipe search and food discovery",
  version: "1.0.0",
}

// RecipeSearcherAgent implementation
export class RecipeSearcherAgent implements Agent {
  readonly id: AgentId = recipeSearcherAgentDefinition.id as AgentId
  readonly agency: AgencyId = recipeSearcherAgentDefinition.agencyOwner as AgencyId
  readonly capabilities = {} as CapabilitySet
  readonly limits = {} as LimitSet

  private status: AgentStatus = "idle"
  private log = Log.create({ service: "kiloclaw.agent.recipe-searcher" })

  getStatus(): AgentStatus {
    return this.status
  }

  async execute(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
    this.log.info("recipe-searcher agent executing task", {
      taskId: task.id,
      taskType: task.type,
      correlationId: context.correlationId,
    })
    this.status = "busy"

    try {
      switch (task.type) {
        case "recipe-search":
          return await this.executeRecipeSearch(task, context)
        default:
          return {
            success: false,
            error: `Unsupported task type: ${task.type}`,
          }
      }
    } catch (err) {
      this.log.error("recipe-searcher task execution failed", { taskId: task.id, err })
      return {
        success: false,
        error: String(err),
      }
    } finally {
      this.status = "idle"
    }
  }

  private async executeRecipeSearch(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
    return runSkill(RecipeSearchSkill, task, context)
  }
}

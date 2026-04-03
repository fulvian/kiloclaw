// NutritionistAgent - Nutrition agency agent specialized in food analysis and diet planning
// As per HANDOVER_specialized-agents.md

import { Log } from "@/util/log"
import type { Agent } from "../../agent"
import type { Task, ExecutionContext, ExecutionResult } from "../../agency"
import { type AgentStatus, type AgentId, type AgencyId, CapabilitySet, LimitSet } from "../../types"
import type { AgentDefinition } from "../types"
import { NutritionAnalysisSkill } from "../../skills/nutrition/nutrition-analysis"
import { DietPlanSkill } from "../../skills/nutrition/diet-plan"
import { runSkill } from "./exec"

// NutritionistAgent definition
export const nutritionistAgentDefinition: AgentDefinition = {
  id: "nutritionist",
  name: "Nutritionist",
  agencyOwner: "nutrition",
  agencyCross: ["knowledge"],
  taskTypes: ["nutrition-analysis", "food-analysis", "meal-planning", "diet-generation", "calorie-calculation"],
  skills: ["nutrition-analysis", "diet-plan"],
  capabilities: ["food-analysis", "nutrition-calculation", "meal-planning"],
  description: "Agent specialized in nutrition analysis, food analysis, and diet planning",
  version: "1.0.0",
}

// NutritionistAgent implementation
export class NutritionistAgent implements Agent {
  readonly id: AgentId = nutritionistAgentDefinition.id as AgentId
  readonly agency: AgencyId = nutritionistAgentDefinition.agencyOwner as AgencyId
  readonly capabilities = {} as CapabilitySet
  readonly limits = {} as LimitSet

  private status: AgentStatus = "idle"
  private log = Log.create({ service: "kiloclaw.agent.nutritionist" })

  getStatus(): AgentStatus {
    return this.status
  }

  async execute(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
    this.log.info("nutritionist agent executing task", {
      taskId: task.id,
      taskType: task.type,
      correlationId: context.correlationId,
    })
    this.status = "busy"

    try {
      switch (task.type) {
        case "nutrition-analysis":
          return await this.executeNutritionAnalysis(task, context)
        case "food-analysis":
          return await this.executeFoodAnalysis(task, context)
        case "meal-planning":
          return await this.executeMealPlanning(task, context)
        case "diet-generation":
          return await this.executeDietGeneration(task, context)
        case "calorie-calculation":
          return await this.executeCalorieCalculation(task, context)
        default:
          return {
            success: false,
            error: `Unsupported task type: ${task.type}`,
          }
      }
    } catch (err) {
      this.log.error("nutritionist task execution failed", { taskId: task.id, err })
      return {
        success: false,
        error: String(err),
      }
    } finally {
      this.status = "idle"
    }
  }

  private async executeNutritionAnalysis(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
    return runSkill(NutritionAnalysisSkill, task, context)
  }

  private async executeFoodAnalysis(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
    return runSkill(NutritionAnalysisSkill, task, context)
  }

  private async executeMealPlanning(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
    return runSkill(DietPlanSkill, task, context)
  }

  private async executeDietGeneration(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
    return runSkill(DietPlanSkill, task, context)
  }

  private async executeCalorieCalculation(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
    return runSkill(NutritionAnalysisSkill, task, context)
  }
}

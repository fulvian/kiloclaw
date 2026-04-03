// ForecasterAgent - Weather agency agent specialized in weather forecasting
// As per HANDOVER_specialized-agents.md

import { Log } from "@/util/log"
import type { Agent } from "../../agent"
import type { Task, ExecutionContext, ExecutionResult } from "../../agency"
import { type AgentStatus, type AgentId, type AgencyId, CapabilitySet, LimitSet } from "../../types"
import type { AgentDefinition } from "../types"

// ForecasterAgent definition
export const forecasterAgentDefinition: AgentDefinition = {
  id: "forecaster",
  name: "Forecaster",
  agencyOwner: "weather",
  agencyCross: [],
  taskTypes: ["weather-forecast"],
  skills: ["weather-forecast"],
  capabilities: ["weather-forecasting", "prediction"],
  description: "Agent specialized in weather forecasting",
  version: "1.0.0",
}

// ForecasterAgent implementation
export class ForecasterAgent implements Agent {
  readonly id: AgentId = forecasterAgentDefinition.id as AgentId
  readonly agency: AgencyId = forecasterAgentDefinition.agencyOwner as AgencyId
  readonly capabilities = {} as CapabilitySet
  readonly limits = {} as LimitSet

  private status: AgentStatus = "idle"
  private log = Log.create({ service: "kiloclaw.agent.forecaster" })

  getStatus(): AgentStatus {
    return this.status
  }

  async execute(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
    this.log.info("forecaster agent executing task", {
      taskId: task.id,
      taskType: task.type,
      correlationId: context.correlationId,
    })
    this.status = "busy"

    try {
      switch (task.type) {
        case "weather-forecast":
          return await this.executeWeatherForecast(task, context)
        default:
          return {
            success: false,
            error: `Unsupported task type: ${task.type}`,
          }
      }
    } catch (err) {
      this.log.error("forecaster task execution failed", { taskId: task.id, err })
      return {
        success: false,
        error: String(err),
      }
    } finally {
      this.status = "idle"
    }
  }

  private async executeWeatherForecast(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
    // TODO: Integrate with WeatherForecastSkill
    return {
      success: true,
      output: { message: "Weather forecast task queued", taskType: task.type },
      metrics: { durationMs: Date.now() - (context.metadata?.startTime as number) || 0 },
    }
  }
}

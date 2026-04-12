// WeatherCurrentAgent - Weather agency agent specialized in current weather and location-based queries
// As per HANDOVER_specialized-agents.md

import { Log } from "@/util/log"
import type { Agent } from "../../agent"
import type { Task, ExecutionContext, ExecutionResult } from "../../agency"
import { type AgentStatus, type AgentId, type AgencyId, CapabilitySet, LimitSet } from "../../types"
import type { AgentDefinition } from "../types"
import { WeatherCurrentSkill } from "../../skills/weather/weather-current"
import { runSkill } from "./exec"

// WeatherCurrentAgent definition
export const weatherCurrentAgentDefinition: AgentDefinition = {
  id: "weather-current",
  name: "Weather Current",
  agencyOwner: "weather",
  agencyCross: ["nutrition"],
  taskTypes: ["weather-query", "location-analysis"],
  skills: ["weather-current"],
  capabilities: ["weather-query", "location-analysis"],
  description: "Agent specialized in current weather queries and location-based weather analysis",
  version: "1.0.0",
}

// WeatherCurrentAgent implementation
export class WeatherCurrentAgent implements Agent {
  readonly id: AgentId = weatherCurrentAgentDefinition.id as AgentId
  readonly agency: AgencyId = weatherCurrentAgentDefinition.agencyOwner as AgencyId
  readonly capabilities = {} as CapabilitySet
  readonly limits = {} as LimitSet

  private status: AgentStatus = "idle"
  private log = Log.create({ service: "kiloclaw.agent.weather-current" })

  getStatus(): AgentStatus {
    return this.status
  }

  async execute(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
    this.log.info("weather-current agent executing task", {
      taskId: task.id,
      taskType: task.type,
      correlationId: context.correlationId,
    })
    this.status = "busy"

    try {
      switch (task.type) {
        case "weather-query":
          return await this.executeWeatherQuery(task, context)
        case "location-analysis":
          return await this.executeLocationAnalysis(task, context)
        default:
          return {
            success: false,
            error: `Unsupported task type: ${task.type}`,
          }
      }
    } catch (err) {
      this.log.error("weather-current task execution failed", { taskId: task.id, err })
      return {
        success: false,
        error: String(err),
      }
    } finally {
      this.status = "idle"
    }
  }

  private async executeWeatherQuery(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
    return runSkill(WeatherCurrentSkill, task, context)
  }

  private async executeLocationAnalysis(task: Task, context: ExecutionContext): Promise<ExecutionResult> {
    return runSkill(WeatherCurrentSkill, task, context)
  }
}

/**
 * @deprecated AgentFactory uses TaskType-based agent selection.
 * For new code, use FlexibleAgentRegistry with capability-based routing.
 * See: packages/opencode/src/kiloclaw/agency/registry/agent-registry.ts
 *
 * This factory is maintained during the migration period (Phase 1-2).
 * Migration: Use CapabilityRouter.routeTask() with TaskIntent instead.
 */

// AgentFactory - Factory for creating and selecting agents based on task and agency
// As per HANDOVER_specialized-agents.md

import { Log } from "@/util/log"
import type { Agent } from "../agent"
import type { Task } from "../agency"
import { type AgencyName, type TaskType, getAgentRegistry, type AgentDefinition } from "./types"
import { ResearcherAgent, researcherAgentDefinition } from "./agents/researcher"
import { CoderAgent, coderAgentDefinition } from "./agents/coder"
import { NutritionistAgent, nutritionistAgentDefinition } from "./agents/nutritionist"
import { WeatherCurrentAgent, weatherCurrentAgentDefinition } from "./agents/weather-current"
import { EducatorAgent, educatorAgentDefinition } from "./agents/educator"
import { AnalystAgent, analystAgentDefinition } from "./agents/analyst"
import { CodeReviewerAgent, codeReviewerAgentDefinition } from "./agents/code-reviewer"
import { DebuggerAgent, debuggerAgentDefinition } from "./agents/debugger"
import { PlannerAgent, plannerAgentDefinition } from "./agents/planner"
import { RecipeSearcherAgent, recipeSearcherAgentDefinition } from "./agents/recipe-searcher"
import { DietPlannerAgent, dietPlannerAgentDefinition } from "./agents/diet-planner"
import { ForecasterAgent, forecasterAgentDefinition } from "./agents/forecaster"
import { AlerterAgent, alerterAgentDefinition } from "./agents/alerter"

// Agent implementations map
const agentImplementations: Record<string, Agent> = {
  researcher: new ResearcherAgent(),
  coder: new CoderAgent(),
  nutritionist: new NutritionistAgent(),
  "weather-current": new WeatherCurrentAgent(),
  educator: new EducatorAgent(),
  analyst: new AnalystAgent(),
  "code-reviewer": new CodeReviewerAgent(),
  debugger: new DebuggerAgent(),
  planner: new PlannerAgent(),
  "recipe-searcher": new RecipeSearcherAgent(),
  "diet-planner": new DietPlannerAgent(),
  forecaster: new ForecasterAgent(),
  alerter: new AlerterAgent(),
}

// Agent definitions for registry
const agentDefinitions: AgentDefinition[] = [
  researcherAgentDefinition,
  coderAgentDefinition,
  nutritionistAgentDefinition,
  weatherCurrentAgentDefinition,
  educatorAgentDefinition,
  analystAgentDefinition,
  codeReviewerAgentDefinition,
  debuggerAgentDefinition,
  plannerAgentDefinition,
  recipeSearcherAgentDefinition,
  dietPlannerAgentDefinition,
  forecasterAgentDefinition,
  alerterAgentDefinition,
]

// Initialize agent registry with all agent definitions
function initializeRegistry(): void {
  const registry = getAgentRegistry()
  for (const definition of agentDefinitions) {
    registry.registerAgent(definition)
  }
}

// AgentFactory namespace
export namespace AgentFactory {
  // Initialize on first use
  let initialized = false

  function ensureInitialized(): void {
    if (!initialized) {
      initializeRegistry()
      initialized = true
    }
  }

  /**
   * Select the best agent for a given task
   * Selection logic:
   * 1. If agency is specified, find agents in that agency who can handle the task
   * 2. Otherwise, find any agent who can handle the task across all agencies
   * 3. Prefer agents whose agencyOwner matches the requested agency
   * 4. Fall back to agencyCross agents
   * 5. If no exact match, return undefined
   */
  export function selectAgent(task: Task, agency?: AgencyName): Agent | undefined {
    ensureInitialized()
    const log = Log.create({ service: "kiloclaw.agent-factory" })

    const taskType = task.type as TaskType
    const registry = getAgentRegistry()

    log.debug("selectAgent called", { taskType, agency, taskId: task.id })

    // Get candidates: either from specific agency or all agencies
    const candidates = agency
      ? registry.findAgentsForTaskInAgency(taskType, agency)
      : registry.findAgentsForTask(taskType)

    if (candidates.length === 0) {
      log.debug("no agents found for task", { taskType, agency })
      return undefined
    }

    // Prefer agents whose agencyOwner matches the requested agency
    if (agency) {
      const ownerMatch = candidates.find((c) => c.agencyOwner === agency)
      if (ownerMatch) {
        log.debug("selected owner agent", { agentId: ownerMatch.id, agency })
        return agentImplementations[ownerMatch.id]
      }

      // Fall back to cross-agency agents
      const crossMatch = candidates.find((c) => c.agencyCross.includes(agency))
      if (crossMatch) {
        log.debug("selected cross-agency agent", { agentId: crossMatch.id, agency })
        return agentImplementations[crossMatch.id]
      }
    }

    // Default: return first matching agent
    const selected = candidates[0]
    if (!selected) {
      log.debug("no agents found for task", { taskType, agency })
      return undefined
    }
    log.debug("selected first available agent", { agentId: selected.id })
    return agentImplementations[selected.id]
  }

  /**
   * Select agent by ID
   */
  export function getAgent(agentId: string): Agent | undefined {
    ensureInitialized()
    return agentImplementations[agentId]
  }

  /**
   * List all registered agent definitions
   */
  export function listAgents(): AgentDefinition[] {
    ensureInitialized()
    return getAgentRegistry().listAgents()
  }

  /**
   * List agents by agency
   */
  export function listAgentsByAgency(agency: AgencyName): AgentDefinition[] {
    ensureInitialized()
    return getAgentRegistry().listAgentsByAgency(agency)
  }
}

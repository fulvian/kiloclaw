// ChainExecutor - Executes skill chains
// Phase 4: Knowledge Agency Implementation

import { Log } from "@/util/log"
import { ChainRegistry } from "./registry/chain-registry"
import type { SkillChain, SkillChainStep } from "./registry/types"
import type { SkillContext } from "../skill"
import type { Skill } from "../skill"

// Knowledge skills
import { WebResearchSkill } from "../skills/knowledge/web-research"
import { SynthesisSkill } from "../skills/knowledge/synthesis"
import { FactCheckSkill } from "../skills/knowledge/fact-check"
import { LiteratureReviewSkill } from "../skills/knowledge/literature-review"
import { CriticalAnalysisSkill } from "../skills/knowledge/critical-analysis"

// Development skills
import { CodeReviewSkill } from "../skills/development/code-review"
import { DebuggingSkill } from "../skills/development/debugging"
import { TddSkill } from "../skills/development/tdd"
import { ComparisonSkill } from "../skills/development/comparison"
import { DocumentAnalysisSkill } from "../skills/development/document-analysis"
import { SimplificationSkill } from "../skills/development/simplification"

// Nutrition skills
import { DietPlanSkill } from "../skills/nutrition/diet-plan"
import { NutritionAnalysisSkill } from "../skills/nutrition/nutrition-analysis"
import { FoodRecallSkill } from "../skills/nutrition/food-recall"
import { RecipeSearchSkill } from "../skills/nutrition/recipe-search"

// Weather skills
import { WeatherForecastSkill } from "../skills/weather/weather-forecast"
import { WeatherAlertsSkill } from "../skills/weather/weather-alerts"
import { WeatherCurrentSkill } from "../skills/weather/weather-current"

// NBA Betting Agency skills
import { NbaAnalysisSkill } from "../skills/nba/nba-analysis"

const log = Log.create({ service: "kiloclaw.chain-executor" })

// Chain execution result
export interface ChainExecutionResult {
  chainId: string
  success: boolean
  steps: ChainStepResult[]
  finalOutput: unknown
  error?: string
}

export interface ChainStepResult {
  skillId: string
  success: boolean
  input: unknown
  output: unknown
  error?: string
  durationMs: number
}

// Skill registry map - maps skill IDs to actual Skill objects with execute method
const skillRegistry: Record<string, Skill> = {
  // Knowledge skills
  "web-research": WebResearchSkill,
  synthesis: SynthesisSkill,
  "fact-check": FactCheckSkill,
  "literature-review": LiteratureReviewSkill,
  "critical-analysis": CriticalAnalysisSkill,
  // Development skills
  "code-review": CodeReviewSkill,
  debugging: DebuggingSkill,
  tdd: TddSkill,
  comparison: ComparisonSkill,
  "document-analysis": DocumentAnalysisSkill,
  simplification: SimplificationSkill,
  // Nutrition skills
  "diet-plan": DietPlanSkill,
  "nutrition-analysis": NutritionAnalysisSkill,
  "food-recall": FoodRecallSkill,
  "recipe-search": RecipeSearchSkill,
  // Weather skills
  "weather-forecast": WeatherForecastSkill,
  "weather-alerts": WeatherAlertsSkill,
  "weather-current": WeatherCurrentSkill,
  // NBA Betting Agency skills
  "nba-analysis": NbaAnalysisSkill,
}

// Get a skill by ID (exported for use by execution-bridge)
export function getSkill(skillId: string): Skill | undefined {
  return skillRegistry[skillId]
}

// Execute a single step
async function executeStep(step: SkillChainStep, input: unknown, context: SkillContext): Promise<ChainStepResult> {
  const start = Date.now()
  const skill = getSkill(step.skillId)

  if (!skill) {
    return {
      skillId: step.skillId,
      success: false,
      input,
      output: undefined,
      error: `Skill not found: ${step.skillId}`,
      durationMs: Date.now() - start,
    }
  }

  try {
    log.debug("executing step", { skillId: step.skillId, chain: context.correlationId })

    // Execute the skill
    const output = await skill.execute(input, context)

    return {
      skillId: step.skillId,
      success: true,
      input,
      output,
      durationMs: Date.now() - start,
    }
  } catch (error) {
    log.error("step failed", { skillId: step.skillId, error: error instanceof Error ? error.message : String(error) })
    return {
      skillId: step.skillId,
      success: false,
      input,
      output: undefined,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - start,
    }
  }
}

// Transform input/output between steps
function transformOutput(step: SkillChainStep, output: unknown): unknown {
  // Default: pass output directly to next step
  return output
}

// Execute a skill chain
export async function executeChain(
  chainId: string,
  initialInput: unknown,
  context: SkillContext,
): Promise<ChainExecutionResult> {
  const chain = ChainRegistry.getChain(chainId)

  if (!chain) {
    return {
      chainId,
      success: false,
      steps: [],
      finalOutput: undefined,
      error: `Chain not found: ${chainId}`,
    }
  }

  log.info("executing chain", { chainId, steps: chain.steps.length, correlationId: context.correlationId })

  const stepResults: ChainStepResult[] = []
  let currentInput = initialInput
  let finalOutput: unknown = undefined

  for (const step of chain.steps) {
    const result = await executeStep(step, currentInput, context)
    stepResults.push(result)

    if (!result.success) {
      log.error("chain failed at step", { chainId, failedStep: step.skillId })
      return {
        chainId,
        success: false,
        steps: stepResults,
        finalOutput: undefined,
        error: `Chain failed at step ${step.skillId}: ${result.error}`,
      }
    }

    // Transform output for next step
    currentInput = transformOutput(step, result.output)
    finalOutput = result.output
  }

  log.info("chain completed", { chainId, steps: stepResults.length, correlationId: context.correlationId })

  return {
    chainId,
    success: true,
    steps: stepResults,
    finalOutput,
  }
}

// Execute a chain by finding it from required capabilities
export async function executeChainForCapabilities(
  requiredCapabilities: string[],
  initialInput: unknown,
  context: SkillContext,
): Promise<ChainExecutionResult> {
  const chain = ChainRegistry.findChainForCapabilities(requiredCapabilities)

  if (!chain) {
    return {
      chainId: "unknown",
      success: false,
      steps: [],
      finalOutput: undefined,
      error: `No chain found for capabilities: ${requiredCapabilities.join(", ")}`,
    }
  }

  return executeChain(chain.id, initialInput, context)
}

// Find and execute the best chain for a task
export async function executeBestChain(
  taskIntent: string,
  input: unknown,
  context: SkillContext,
): Promise<ChainExecutionResult> {
  // Map task intent to capabilities
  const capabilityMap: Record<string, string[]> = {
    "web-search": ["search", "web"],
    "web-research": ["search", "information_gathering"],
    "academic-research": ["paper_search", "academic_research"],
    "fact-checking": ["fact-checking", "verification"],
    synthesis: ["synthesis", "multi_doc"],
    "literature-review": ["paper_search", "academic_research"],
  }

  const capabilities = capabilityMap[taskIntent] || [taskIntent]

  // Find chain
  const chain = ChainRegistry.findChainForCapabilities(capabilities)

  if (!chain) {
    return {
      chainId: "unknown",
      success: false,
      steps: [],
      finalOutput: undefined,
      error: `No chain found for task: ${taskIntent}`,
    }
  }

  log.info("found best chain for task", { taskIntent, chainId: chain.id, correlationId: context.correlationId })

  return executeChain(chain.id, input, context)
}

// Get all available chains
export function listChains(): SkillChain[] {
  return ChainRegistry.getAllChains()
}

// Get chain by ID
export function getChain(chainId: string): SkillChain | undefined {
  return ChainRegistry.getChain(chainId)
}

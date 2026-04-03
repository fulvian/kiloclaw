// IntentClassifier - classifies user intent and extracts capabilities
// Phase 5: Flexible Agency Architecture

import { Log } from "@/util/log"
import { TaskIntentSchema, type TaskIntent, migrateLegacyTaskType } from "./types"

const log = Log.create({ service: "kiloclaw.routing.intent-classifier" })

// Known capability keywords for natural language extraction
const CAPABILITY_KEYWORDS: Record<string, string[]> = {
  search: ["search", "find", "look up", "query", "retrieve"],
  web: ["web", "internet", "online"],
  analyze: ["analyze", "analysis", "examine", "investigate", "study"],
  generate: ["generate", "create", "make", "produce", "write"],
  coding: ["code", "coding", "program", "develop", "implement"],
  debugging: ["debug", "debugging", "fix", "bug", "error", "issue"],
  review: ["review", "reviewing", "check", "examine", "assess"],
  testing: ["test", "testing", "verify", "validate"],
  planning: ["plan", "planning", "planify", "schedule"],
  research: ["research", "investigate", "survey"],
  knowledge: ["knowledge", "information", "learn"],
}

// Check if input looks like a legacy TaskType string
function isLegacyTaskType(input: unknown): boolean {
  if (typeof input !== "string") return false

  // Legacy task types are typically camelCase or kebab-case single words/phrases
  // that represent a specific task category
  const legacyPatterns = [
    "web-search",
    "academic-research",
    "fact-checking",
    "source-verification",
    "summarization",
    "explanation",
    "literature-review",
    "data-analysis",
    "comparison",
    "code-generation",
    "code-modification",
    "bug-fixing",
    "code-review",
    "debugging",
    "root-cause-analysis",
    "task-planning",
    "code-planning",
    "refactoring",
    "simplification",
    "tdd",
    "nutrition-analysis",
    "food-analysis",
    "recipe-search",
    "meal-planning",
    "diet-generation",
    "calorie-calculation",
    "food-recall",
    "weather-query",
    "weather-forecast",
    "weather-alerts",
    "location-analysis",
    "notifications",
  ]

  return legacyPatterns.includes(input) || legacyPatterns.includes(input.toLowerCase())
}

// Extract capabilities from natural language
function extractCapabilitiesFromNaturalLanguage(input: string): string[] {
  const lowerInput = input.toLowerCase()
  const foundCapabilities: string[] = []

  for (const [capability, keywords] of Object.entries(CAPABILITY_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerInput.includes(keyword)) {
        if (!foundCapabilities.includes(capability)) {
          foundCapabilities.push(capability)
        }
        break
      }
    }
  }

  return foundCapabilities
}

export namespace IntentClassifier {
  /**
   * Classify input and return a TaskIntent
   */
  export function classify(input: string | TaskIntent): TaskIntent {
    // If already a TaskIntent object, validate and return it
    if (typeof input === "object" && "intent" in input) {
      return TaskIntentSchema.parse(input)
    }

    // Handle legacy TaskType string
    if (isLegacyTaskType(input)) {
      log.debug("detected legacy task type", { input })
      return migrateLegacyTaskType(input)
    }

    // Extract capabilities from natural language
    const capabilities = extractCapabilitiesFromNaturalLanguage(input)

    // Create TaskIntent from natural language
    const intent: TaskIntent = {
      intent: input.toLowerCase().split(" ")[0] || input,
      parameters: {
        ...(capabilities.length > 0 ? { capabilities } : {}),
        originalInput: input,
      },
      context: {
        urgency: "medium",
      },
    }

    log.debug("classified intent", { intent: intent.intent, capabilities })
    return TaskIntentSchema.parse(intent)
  }

  /**
   * Extract capabilities from intent string or TaskIntent
   */
  export function extractCapabilities(input: string | TaskIntent): string[] {
    // If TaskIntent with capabilities in parameters, use those
    if (typeof input === "object" && "parameters" in input) {
      const caps = input.parameters.capabilities
      if (Array.isArray(caps)) {
        return caps as string[]
      }
    }

    // If legacy TaskType, use migration
    if (typeof input === "string" && isLegacyTaskType(input)) {
      const migrated = migrateLegacyTaskType(input)
      const caps = migrated.parameters.capabilities
      if (Array.isArray(caps)) {
        return caps as string[]
      }
    }

    // Extract from natural language
    if (typeof input === "string") {
      return extractCapabilitiesFromNaturalLanguage(input)
    }

    return []
  }

  /**
   * Check if input is a legacy TaskType string
   */
  export function isLegacyTaskTypeInput(input: unknown): boolean {
    return isLegacyTaskType(input)
  }

  /**
   * Migrate a legacy TaskType string to TaskIntent
   */
  export function migrateLegacy(input: string): TaskIntent {
    return migrateLegacyTaskType(input)
  }

  /**
   * Get all known capability keywords
   */
  export function getCapabilityKeywords(): Record<string, string[]> {
    return { ...CAPABILITY_KEYWORDS }
  }
}

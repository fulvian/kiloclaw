// Routing types for capability-based task routing
// Phase 1: Flexible Agency Architecture

import z from "zod"

// TaskIntent - flexible intent replacing TaskType enum
export const TaskIntentSchema = z.object({
  intent: z.string().min(1),
  parameters: z.record(z.string(), z.unknown()).default({}),
  context: z.object({
    domain: z.string().optional(),
    urgency: z.enum(["low", "medium", "high"]).default("medium"),
    preferences: z.record(z.string(), z.unknown()).optional(),
    correlationId: z.string().optional(),
  }),
})

export type TaskIntent = z.infer<typeof TaskIntentSchema>

// RouteResult - result of capability routing
export const RouteResultSchema = z.object({
  type: z.enum(["skill", "chain", "agent"]),
  skill: z.string().optional(), // SkillId
  chain: z.string().optional(), // Chain ID
  agent: z.string().optional(), // AgentId
  confidence: z.number().min(0).max(1),
  reason: z.string().optional(),
})

export type RouteResult = z.infer<typeof RouteResultSchema>

// Legacy TaskType migration helper
export const LegacyTaskTypeMigration: Record<string, { intent: string; capabilities: string[] }> = {
  "web-search": { intent: "search", capabilities: ["search", "web"] },
  "academic-research": { intent: "research", capabilities: ["academic", "search"] },
  "fact-checking": { intent: "verify", capabilities: ["fact-checking", "verification"] },
  "source-verification": { intent: "verify", capabilities: ["source-verification", "fact-checking"] },
  summarization: { intent: "summarize", capabilities: ["summarization"] },
  explanation: { intent: "explain", capabilities: ["explanation"] },
  "literature-review": { intent: "review", capabilities: ["literature-review", "analysis"] },
  "data-analysis": { intent: "analyze", capabilities: ["data-analysis", "analysis"] },
  comparison: { intent: "compare", capabilities: ["comparison"] },
  "code-generation": { intent: "generate", capabilities: ["code-generation", "coding"] },
  "code-modification": { intent: "modify", capabilities: ["code-modification", "coding"] },
  "bug-fixing": { intent: "fix", capabilities: ["bug-fixing", "debugging"] },
  "code-review": { intent: "review", capabilities: ["code-review", "analysis"] },
  debugging: { intent: "debug", capabilities: ["debugging", "diagnosis"] },
  "root-cause-analysis": { intent: "analyze", capabilities: ["root-cause-analysis", "diagnosis"] },
  "task-planning": { intent: "plan", capabilities: ["task-planning", "planning"] },
  "code-planning": { intent: "plan", capabilities: ["code-planning", "planning"] },
  refactoring: { intent: "refactor", capabilities: ["refactoring", "coding"] },
  simplification: { intent: "simplify", capabilities: ["simplification"] },
  tdd: { intent: "test", capabilities: ["tdd", "testing"] },
  "nutrition-analysis": { intent: "analyze", capabilities: ["nutrition-analysis"] },
  "food-analysis": { intent: "analyze", capabilities: ["food-analysis"] },
  "recipe-search": { intent: "search", capabilities: ["recipe-search"] },
  "meal-planning": { intent: "plan", capabilities: ["meal-planning", "planning"] },
  "diet-generation": { intent: "generate", capabilities: ["diet-generation"] },
  "calorie-calculation": { intent: "calculate", capabilities: ["calorie-calculation"] },
  "food-recall": { intent: "recall", capabilities: ["food-recall"] },
  "weather-query": { intent: "query", capabilities: ["weather-query"] },
  "weather-forecast": { intent: "forecast", capabilities: ["weather-forecast"] },
  "weather-alerts": { intent: "alert", capabilities: ["weather-alerts"] },
  "location-analysis": { intent: "analyze", capabilities: ["location-analysis"] },
  notifications: { intent: "notify", capabilities: ["notifications"] },
}

// Migration function for legacy task types
export function migrateLegacyTaskType(taskType: string): TaskIntent {
  const mapping = LegacyTaskTypeMigration[taskType]
  if (mapping) {
    return TaskIntentSchema.parse({
      intent: mapping.intent,
      parameters: { capabilities: mapping.capabilities },
      context: {},
    })
  }
  return TaskIntentSchema.parse({
    intent: taskType,
    parameters: {},
    context: {},
  })
}

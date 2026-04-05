/**
 * Feedback Contract - Unified Schema for Cross-Channel Feedback
 * Based on KILOCLAW_PROACTIVE_CONTINUATIVE_AUTOLEARNING_PLAN_2026-04-05.md
 * Phase 0: Alignment & Contracts
 */

import { z } from "zod"

// =============================================================================
// Feedback Reason Codes (Task Outcome Quality Dictionary)
// =============================================================================

/**
 * Standardized reason codes for feedback taxonomy
 * Aligned with NIST AI RMF for AI-generated content evaluation
 */
export const FeedbackReasonCode = z.enum([
  "wrong_fact", // Factual error in response
  "irrelevant", // Response doesn't address the query
  "too_verbose", // Excessive verbosity, user wanted conciseness
  "style_mismatch", // Communication style not preferred
  "unsafe", // Unsafe content generated (security/safety concern)
  "task_failed", // Task was not completed successfully
  "task_partial", // Task partially completed
  "expectation_mismatch", // Outcome didn't match user expectation
  "other", // Uncategorized reason
])
export type FeedbackReasonCode = z.infer<typeof FeedbackReasonCode>

/**
 * Human-readable descriptions for reason codes
 * Used in UI and documentation
 */
export const FEEDBACK_REASON_DESCRIPTIONS: Record<FeedbackReasonCode, string> = {
  wrong_fact: "The response contained factually incorrect information",
  irrelevant: "The response did not address what was being asked",
  too_verbose: "The response was too long or detailed",
  style_mismatch: "The communication style (tone, format) didn't match preferences",
  unsafe: "The response contained unsafe or problematic content",
  task_failed: "The requested task was not completed",
  task_partial: "The task was only partially completed",
  expectation_mismatch: "The outcome didn't match what was expected",
  other: "Other reason (see correction text if provided)",
}

// =============================================================================
// Feedback Target Types
// =============================================================================

/**
 * Types of targets that can receive feedback
 */
export const FeedbackTargetType = z.enum(["response", "task", "proactive_action", "memory_retrieval"])
export type FeedbackTargetType = z.infer<typeof FeedbackTargetType>

/**
 * Channel through which feedback was collected
 */
export const FeedbackChannel = z.enum(["cli", "vscode", "api", "implicit", "other"])
export type FeedbackChannel = z.infer<typeof FeedbackChannel>

// =============================================================================
// Feedback Vote
// =============================================================================

/**
 * Simple upvote/downvote feedback
 */
export const FeedbackVote = z.enum(["up", "down"])
export type FeedbackVote = z.infer<typeof FeedbackVote>

// =============================================================================
// Core Feedback Event Schema
// =============================================================================

/**
 * Unified feedback event schema - cross-channel compatible
 * This is the primary contract for feedback collection
 */
export const FeedbackEventSchema = z.object({
  // Identification
  id: z.string().uuid(),
  tenantId: z.string().min(1),
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  correlationId: z.string().optional(),

  // Target
  target: z.object({
    type: FeedbackTargetType,
    id: z.string().min(1),
    taskId: z.string().optional(), // For task-related feedback
  }),

  // Vote
  vote: FeedbackVote,
  score: z.number().min(0).max(1).optional(), // 0-1 normalized score

  // Reason
  reason: FeedbackReasonCode,
  correction: z.string().optional(), // User-provided correction

  // Outcome tracking
  expectedOutcome: z.string().optional(),
  actualOutcome: z.string().optional(),

  // Context
  channel: FeedbackChannel.optional().default("cli"),
  metadata: z.record(z.string(), z.unknown()).optional(),

  // Timestamps
  ts: z.number().int().positive(), // Unix timestamp ms
})
export type FeedbackEvent = z.infer<typeof FeedbackEventSchema>

// =============================================================================
// Feedback Summary Schema
// =============================================================================

/**
 * Aggregated feedback summary for a tenant/user
 */
export const FeedbackSummarySchema = z.object({
  tenantId: z.string(),
  userId: z.string().optional(),
  period: z.object({
    since: z.number(),
    until: z.number(),
  }),
  totals: z.object({
    total: z.number(),
    upvotes: z.number(),
    downvotes: z.number(),
    upvoteRate: z.number().min(0).max(1),
  }),
  byReason: z.record(z.string(), z.number()),
  byTargetType: z.record(z.string(), z.number()),
  recentTrend: z.array(
    z.object({
      date: z.string(),
      upvotes: z.number(),
      downvotes: z.number(),
    }),
  ),
  avgScore: z.number().min(0).max(1).optional(),
})
export type FeedbackSummary = z.infer<typeof FeedbackSummarySchema>

// =============================================================================
// Learning Update Types
// =============================================================================

/**
 * Types of updates that can be derived from feedback
 */
export const LearningUpdateType = z.enum([
  "profile_update", // Update user preferences
  "retrieval_update", // Update ranking/retrieval signals
  "procedure_update", // Update success rates
  "proactive_policy_update", // Adjust proactive aggressiveness
  "fact_confidence_update", // Adjust fact confidence
])
export type LearningUpdateType = z.infer<typeof LearningUpdateType>

/**
 * Learning update action derived from feedback processing
 */
export interface LearningUpdate {
  type: LearningUpdateType
  targetId: string
  targetType: string
  delta: number // Direction and magnitude of change
  reason: FeedbackReasonCode
  weight: number // Confidence in the update
  sourceFeedbackId: string
  ts: number
}

export const LearningUpdateSchema = z.object({
  type: LearningUpdateType,
  targetId: z.string(),
  targetType: z.string(),
  delta: z.number(), // Direction and magnitude of change
  reason: FeedbackReasonCode,
  weight: z.number().min(0).max(1), // Confidence in the update
  sourceFeedbackId: z.string(),
  ts: z.number().int().positive(),
})

// =============================================================================
// SLO/SLA Metrics Schema
// =============================================================================

/**
 * Service level objectives for feedback processing
 */
export const FeedbackSLO = z.object({
  feedbackIngestP95LatencyMs: z.number().default(2000), // p95 < 2s
  feedbackCoverageMinPercent: z.number().default(30), // >= 30% sessions
  feedbackProcessingSuccessRate: z.number().min(0).max(1).default(0.99),
})
export type FeedbackSLO = z.infer<typeof FeedbackSLO>

/**
 * Feedback processing result
 */
export const FeedbackProcessingResultSchema = z.object({
  success: z.boolean(),
  feedbackId: z.string(),
  actions: z.array(LearningUpdateSchema),
  errors: z.array(z.string()).optional(),
  sloMet: z.boolean().optional(), // Whether processing met SLO
})
export type FeedbackProcessingResult = z.infer<typeof FeedbackProcessingResultSchema>

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate feedback event from external source (API, CLI, etc.)
 */
export function validateFeedbackEvent(
  input: unknown,
): { valid: true; data: FeedbackEvent } | { valid: false; errors: z.ZodError } {
  const result = FeedbackEventSchema.safeParse(input)
  if (result.success) {
    return { valid: true, data: result.data as FeedbackEvent }
  }
  return { valid: false, errors: result.error }
}

/**
 * Normalize external feedback to internal schema
 */
export function normalizeFeedback(input: unknown, defaults?: Partial<FeedbackEvent>): FeedbackEvent | null {
  const validated = validateFeedbackEvent(input)
  if (!validated.valid) {
    return null
  }
  return {
    ...validated.data,
    ...defaults,
    ts: validated.data.ts ?? Date.now(),
  }
}

// =============================================================================
// Reason Code Mapping (for external APIs)
// =============================================================================

/**
 * Mapping from external reason codes to internal
 * Allows flexibility in external APIs while maintaining internal consistency
 */
export const EXTERNAL_REASON_MAPPING: Record<string, FeedbackReasonCode> = {
  // Generic
  thumbs_up: "other",
  thumbs_down: "other",
  like: "other",
  dislike: "other",

  // Specific
  incorrect: "wrong_fact",
  wrong: "wrong_fact",
  inaccurate: "wrong_fact",
  not_relevant: "irrelevant",
  not_helpful: "irrelevant",
  off_topic: "irrelevant",
  too_long: "too_verbose",
  verbose: "too_verbose",
  concise: "style_mismatch", // user wanted more detail
  tone: "style_mismatch",
  format: "style_mismatch",
  incomplete: "task_partial",
  failed: "task_failed",
  error: "task_failed",
  did_not_complete: "task_failed",
  unexpected: "expectation_mismatch",
  not_expected: "expectation_mismatch",
  harmful: "unsafe",
  inappropriate: "unsafe",
  unsafe: "unsafe",
}

/**
 * Map external reason string to internal reason code
 */
export function mapExternalReason(externalReason: string): FeedbackReasonCode {
  const normalized = externalReason.toLowerCase().trim()
  return EXTERNAL_REASON_MAPPING[normalized] ?? "other"
}

// =============================================================================
// Feedback Quality Scores
// =============================================================================

/**
 * Calculate quality score from feedback event
 * Returns normalized score 0-1 where 1 is best
 */
export function calculateQualityScore(event: FeedbackEvent): number {
  // Base score from vote
  let score = event.vote === "up" ? 1.0 : 0.0

  // Adjust by reason severity
  const reasonPenalties: Record<FeedbackReasonCode, number> = {
    wrong_fact: 0.3,
    unsafe: 0.4,
    task_failed: 0.35,
    expectation_mismatch: 0.25,
    task_partial: 0.2,
    irrelevant: 0.2,
    style_mismatch: 0.1,
    too_verbose: 0.1,
    other: 0.05,
  }

  const penalty = reasonPenalties[event.reason]
  if (event.vote === "down") {
    score = Math.max(0, score - penalty)
  } else if (event.correction) {
    // Positive vote with correction suggests improvement needed
    score = score - penalty * 0.5
  }

  // Apply explicit score if provided
  if (event.score !== undefined) {
    score = event.score
  }

  return Math.max(0, Math.min(1, score))
}

// =============================================================================
// Export namespaces for convenience
// =============================================================================

export namespace FeedbackContract {
  export const Schema = FeedbackEventSchema
  export const Reason = FeedbackReasonCode
  export const TargetType = FeedbackTargetType
  export const Vote = FeedbackVote
  export const Channel = FeedbackChannel
  export const SLO = FeedbackSLO

  export type Event = FeedbackEvent
  export type Summary = FeedbackSummary
  export type ProcessingResult = FeedbackProcessingResult
}

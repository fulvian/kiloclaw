/**
 * Memory Feedback - User feedback loop and auto-learning
 * Based on ADR-005 feedback and auto-learning
 * Phase 1: Extended schema with task_id, session_id, correlation_id, channel, score, expected/actual outcome
 */

import { Log } from "@/util/log"
import { FeedbackRepo, SemanticMemoryRepo, ProceduralMemoryRepo, UserProfileRepo } from "./memory.repository"
import { FeedbackLearner } from "../feedback/learner"
import { FeedbackReasonCode } from "../feedback/contract"

const log = Log.create({ service: "kiloclaw.memory.feedback" })

// =============================================================================
// Feedback Types (Phase 1 Extended)
// =============================================================================

export interface FeedbackPayload {
  vote: "up" | "down"
  reason: FeedbackReason
  correction?: string
  target: {
    responseId?: string
    memoryIds: string[]
  }
  // Phase 1 additions
  taskId?: string
  sessionId?: string
  correlationId?: string
  channel?: "cli" | "vscode" | "api" | "implicit" | "other"
  score?: number
  expectedOutcome?: string
  actualOutcome?: string
}

export type FeedbackReason =
  | "wrong_fact"
  | "irrelevant"
  | "too_verbose"
  | "style_mismatch"
  | "unsafe"
  | "task_failed"
  | "task_partial"
  | "expectation_mismatch"
  | "other"

// =============================================================================
// Feedback Processing
// =============================================================================

export const MemoryFeedback = {
  /**
   * Process user feedback with Phase 1 extended schema
   */
  async process(tenantId: string, userId: string, feedback: FeedbackPayload): Promise<FeedbackResult> {
    log.info("processing feedback", { tenantId, userId, feedback })

    const result: FeedbackResult = {
      success: true,
      actions: [],
    }

    // Record the feedback event with Phase 1 extended schema
    await FeedbackRepo.record({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      user_id: userId,
      target_type: "response",
      target_id: feedback.target.responseId ?? "unknown",
      vote: feedback.vote,
      reason: feedback.reason,
      correction_text: feedback.correction ?? null,
      // Phase 1 additions
      task_id: feedback.taskId ?? null,
      session_id: feedback.sessionId ?? null,
      correlation_id: feedback.correlationId ?? null,
      channel: feedback.channel ?? "cli",
      score: feedback.score ?? null,
      expected_outcome: feedback.expectedOutcome ?? null,
      actual_outcome: feedback.actualOutcome ?? null,
      ts: Date.now(),
      created_at: Date.now(),
    })

    // Process based on vote and reason using FeedbackLearner
    if (feedback.vote === "up") {
      await handlePositiveFeedback(tenantId, userId, feedback, result)
    } else {
      await handleNegativeFeedback(tenantId, userId, feedback, result)
    }

    log.info("feedback processed", { tenantId, userId, result })
    return result
  },

  /**
   * Get feedback summary for a tenant
   */
  async getSummary(tenantId: string): Promise<FeedbackSummary> {
    const recent = await FeedbackRepo.getByTenant(tenantId, 1000)

    const summary: FeedbackSummary = {
      total: recent.length,
      upvotes: recent.filter((f) => f.vote === "up").length,
      downvotes: recent.filter((f) => f.vote === "down").length,
      byReason: {},
      recentTrend: [],
    }

    for (const f of recent) {
      summary.byReason[f.reason ?? "other"] = (summary.byReason[f.reason ?? "other"] ?? 0) + 1
    }

    return summary
  },
}

// =============================================================================
// Feedback Handlers (with real persistent actions)
// =============================================================================

interface FeedbackResult {
  success: boolean
  actions: string[]
}

async function handlePositiveFeedback(
  tenantId: string,
  userId: string,
  feedback: FeedbackPayload,
  result: FeedbackResult,
): Promise<void> {
  // Positive feedback - use FeedbackLearner for real updates
  for (const memoryId of feedback.target.memoryIds) {
    // Update retrieval signals with positive weight
    const retrievalResult = await FeedbackLearner.updateRetrievalSignals(tenantId, {
      targetId: memoryId,
      targetType: "memory",
      reason: feedback.reason as FeedbackReasonCode,
      vote: feedback.vote,
      score: feedback.score,
    })

    if (retrievalResult.updated) {
      result.actions.push(`retrieval_boost:${memoryId}`)
    }

    // Update user profile for style
    if (feedback.reason === "style_mismatch") {
      const profileResult = await FeedbackLearner.updateUserProfile(tenantId, userId, {
        vote: feedback.vote,
        reason: feedback.reason as FeedbackReasonCode,
        score: feedback.score,
        correction: feedback.correction,
      })

      if (profileResult.updated) {
        result.actions.push(`profile_update:${JSON.stringify(profileResult.changes)}`)
      }
    }
  }
}

async function handleNegativeFeedback(
  tenantId: string,
  userId: string,
  feedback: FeedbackPayload,
  result: FeedbackResult,
): Promise<void> {
  switch (feedback.reason) {
    case "wrong_fact":
      // Reduce confidence of the fact using FeedbackLearner
      for (const memoryId of feedback.target.memoryIds) {
        const fact = await SemanticMemoryRepo.getFact(memoryId)
        if (fact) {
          // Use FeedbackLearner for fact confidence update
          const reduction = Math.round((feedback.score ?? 0.5) * 30)
          const newConfidence = Math.max(0, fact.confidence - reduction)
          await SemanticMemoryRepo.updateFact(memoryId, null, newConfidence)
          result.actions.push(`reduced_confidence:${memoryId}:${newConfidence}`)
        }

        if (feedback.correction) {
          result.actions.push(`proposed_correction:${memoryId}`)
        }
      }
      break

    case "irrelevant":
      // Update retrieval signals with penalty using FeedbackLearner
      for (const memoryId of feedback.target.memoryIds) {
        const retrievalResult = await FeedbackLearner.updateRetrievalSignals(tenantId, {
          targetId: memoryId,
          targetType: "memory",
          reason: "irrelevant",
          vote: feedback.vote,
          score: feedback.score,
        })

        if (retrievalResult.updated) {
          result.actions.push(`retrieval_penalty:${JSON.stringify(retrievalResult.penalties)}`)
        }
      }
      break

    case "too_verbose":
      // Update user preference for brevity using FeedbackLearner
      const profileResult = await FeedbackLearner.updateUserProfile(tenantId, userId, {
        vote: feedback.vote,
        reason: "too_verbose",
        score: feedback.score,
      })

      if (profileResult.updated) {
        result.actions.push(`profile_update:${JSON.stringify(profileResult.changes)}`)
      }
      break

    case "style_mismatch":
      // Update user profile communication style using FeedbackLearner
      const styleResult = await FeedbackLearner.updateUserProfile(tenantId, userId, {
        vote: feedback.vote,
        reason: "style_mismatch",
        score: feedback.score,
        correction: feedback.correction,
      })

      if (styleResult.updated) {
        result.actions.push(`profile_update:${JSON.stringify(styleResult.changes)}`)
      }
      break

    case "unsafe":
      // Flag for review (log for safety team)
      result.actions.push("flagged_for_review")
      log.warn("unsafe feedback flagged", { tenantId, userId, feedback })
      break

    case "task_failed":
    case "task_partial":
      // Update procedure stats using FeedbackLearner
      if (feedback.taskId) {
        const procResult = await FeedbackLearner.updateProcedureStats({
          procedureId: feedback.taskId,
          vote: feedback.vote,
          reason: feedback.reason as FeedbackReasonCode,
          score: feedback.score,
        })

        if (procResult.updated) {
          result.actions.push(`procedure_update:${procResult.newSuccessRate}`)
        }
      }
      break

    case "expectation_mismatch":
      // Adjust proactive policy using FeedbackLearner
      const policyResult = await FeedbackLearner.adjustProactivePolicy(tenantId, userId, {
        vote: feedback.vote,
        reason: "expectation_mismatch",
        score: feedback.score,
      })

      if (policyResult.adjusted) {
        result.actions.push(`policy_adjust:${policyResult.aggressivenessDelta}`)
      }
      break

    case "other":
      result.actions.push("logged_for_review")
      break
  }
}

// =============================================================================
// Feedback Summary
// =============================================================================

export interface FeedbackSummary {
  total: number
  upvotes: number
  downvotes: number
  byReason: Record<string, number>
  recentTrend: Array<{ date: string; upvotes: number; downvotes: number }>
}

// =============================================================================
// Auto-Learning (using FeedbackLearner)
// =============================================================================

export const MemoryLearning = {
  /**
   * Update user profile based on feedback patterns
   */
  async updateUserProfile(tenantId: string, userId: string): Promise<void> {
    const summary = await MemoryFeedback.getSummary(tenantId)

    // Detect communication style from feedback
    let style = "neutral"
    if ((summary.byReason["too_verbose"] ?? 0) > 5) {
      style = "concise"
    } else if ((summary.byReason["irrelevant"] ?? 0) > 10) {
      style = "focused"
    }

    // Get current profile
    const current = await UserProfileRepo.get(tenantId, userId)

    // Update preferences - handle both string and object from Drizzle JSON mode
    const currentPrefs = current?.preferences_json
    const preferences =
      typeof currentPrefs === "string" && currentPrefs ? JSON.parse(currentPrefs) : (currentPrefs ?? {})

    ;(preferences as Record<string, unknown>).feedbackSummary = {
      lastUpdated: Date.now(),
      totalFeedback: summary.total,
      upvoteRate: summary.total > 0 ? summary.upvotes / summary.total : 0,
    }

    const currentConstraints = current?.constraints_json
    const constraints =
      typeof currentConstraints === "string" && currentConstraints ? currentConstraints : JSON.stringify({})

    await UserProfileRepo.upsert({
      id: current?.id ?? crypto.randomUUID(),
      tenant_id: tenantId,
      user_id: userId,
      preferences_json: preferences,
      communication_style: style,
      constraints_json: currentConstraints ?? {},
      created_at: current?.created_at ?? Date.now(),
      updated_at: Date.now(),
    })

    log.info("user profile updated from feedback", { tenantId, userId, style })
  },

  /**
   * Update procedure success rates based on feedback
   */
  async updateProcedureStats(procedureId: string, success: boolean): Promise<void> {
    await ProceduralMemoryRepo.updateStats(procedureId, success)
    log.debug("procedure stats updated", { procedureId, success })
  },

  /**
   * Extract patterns from feedback for improvement
   */
  async extractPatterns(tenantId: string): Promise<Pattern[]> {
    // Use FeedbackLearner.extractPatterns for more comprehensive analysis
    return FeedbackLearner.extractPatterns(tenantId) as Promise<Pattern[]>
  },
}

// =============================================================================
// Pattern Detection
// =============================================================================

export interface Pattern {
  type: string
  severity: "low" | "medium" | "high"
  description: string
  recommendation: string
}

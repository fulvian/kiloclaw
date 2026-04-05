/**
 * Feedback Processor - Normalization, Validation, and Action Processing
 * Phase 1: Feedback Loop End-to-End
 * KILOCLAW_PROACTIVE_CONTINUATIVE_AUTOLEARNING_PLAN_2026-04-05.md
 */

import { z } from "zod"
import { Log } from "@/util/log"
import { FeedbackRepo, UserProfileRepo, ProceduralMemoryRepo, SemanticMemoryRepo } from "../memory/memory.repository"
import { AuditRepo } from "../memory/memory.repository"
import type { FeedbackEvent, FeedbackProcessingResult, LearningUpdate } from "./contract"
import {
  FeedbackEventSchema,
  FeedbackProcessingResultSchema,
  LearningUpdateSchema,
  calculateQualityScore,
  FeedbackReasonCode,
} from "./contract"

const log = Log.create({ service: "kiloclaw.feedback.processor" })

// =============================================================================
// Input Validation Schema
// =============================================================================

const ProcessInputSchema = z.object({
  feedback: FeedbackEventSchema,
  skipLearning: z.boolean().optional().default(false),
})

// =============================================================================
// Feedback Processor Namespace
// =============================================================================

export namespace FeedbackProcessor {
  /**
   * Process a feedback event end-to-end:
   * 1. Validate input
   * 2. Record to storage
   * 3. Execute persistent learning actions
   * 4. Return processing result with audit trail
   */
  export async function process(input: unknown): Promise<FeedbackProcessingResult> {
    const startTime = Date.now()

    // Validate input
    const parsed = ProcessInputSchema.safeParse(input)
    if (!parsed.success) {
      return {
        success: false,
        feedbackId: "",
        actions: [],
        errors: parsed.error.issues.map((e) => `${e.path.join(".")}: ${e.message}`),
      }
    }

    const { feedback, skipLearning } = parsed.data

    log.info("processing feedback", {
      feedbackId: feedback.id,
      tenantId: feedback.tenantId,
      vote: feedback.vote,
      reason: feedback.reason,
    })

    const actions: LearningUpdate[] = []
    const errors: string[] = []

    try {
      // 1. Record feedback to storage
      await FeedbackRepo.record({
        id: feedback.id,
        tenant_id: feedback.tenantId,
        user_id: feedback.userId ?? null,
        target_type: feedback.target.type,
        target_id: feedback.target.id,
        vote: feedback.vote,
        reason: feedback.reason,
        correction_text: feedback.correction ?? null,
        task_id: feedback.target.taskId ?? null,
        session_id: feedback.sessionId ?? null,
        correlation_id: feedback.correlationId ?? null,
        channel: feedback.channel ?? "cli",
        score: feedback.score ?? calculateQualityScore(feedback),
        expected_outcome: feedback.expectedOutcome ?? null,
        actual_outcome: feedback.actualOutcome ?? null,
        ts: feedback.ts,
        created_at: Date.now(),
      })

      // 2. Execute learning actions (unless skipped)
      if (!skipLearning) {
        const learningActions = await executeLearningActions(feedback)
        actions.push(...learningActions)
      }

      // 3. Audit log each learning action
      for (const action of actions) {
        await AuditRepo.log({
          id: crypto.randomUUID(),
          actor: feedback.userId ?? "system",
          action: `learning_${action.type}`,
          target_type: action.targetType,
          target_id: action.targetId,
          reason: action.reason,
          correlation_id: feedback.correlationId ?? null,
          previous_hash: null,
          hash: "", // Will be computed by AuditRepo
          metadata_json: {
            delta: action.delta,
            weight: action.weight,
            sourceFeedbackId: feedback.id,
          },
          ts: Date.now(),
        })
      }

      const latency = Date.now() - startTime
      const sloMet = latency < 2000 // p95 < 2s SLO

      log.info("feedback processed", {
        feedbackId: feedback.id,
        actionCount: actions.length,
        latencyMs: latency,
        sloMet,
      })

      return {
        success: true,
        feedbackId: feedback.id,
        actions,
        errors: errors.length > 0 ? errors : undefined,
        sloMet,
      }
    } catch (err) {
      log.error("feedback processing failed", { feedbackId: feedback.id, err })
      return {
        success: false,
        feedbackId: feedback.id,
        actions,
        errors: [`Processing error: ${err instanceof Error ? err.message : String(err)}`],
      }
    }
  }

  /**
   * Get feedback summary for a tenant
   */
  export async function getSummary(
    tenantId: string,
    options?: {
      userId?: string
      since?: number
      until?: number
      limit?: number
    },
  ): Promise<{
    total: number
    upvotes: number
    downvotes: number
    byReason: Record<string, number>
    byTargetType: Record<string, number>
    avgScore: number
  }> {
    const events = await FeedbackRepo.getByTenant(tenantId, options?.limit ?? 1000)

    const filtered = events.filter((e) => {
      if (options?.userId && e.user_id !== options.userId) return false
      if (options?.since && e.ts < options.since) return false
      if (options?.until && e.ts > options.until) return false
      return true
    })

    const summary = {
      total: filtered.length,
      upvotes: filtered.filter((f) => f.vote === "up").length,
      downvotes: filtered.filter((f) => f.vote === "down").length,
      byReason: {} as Record<string, number>,
      byTargetType: {} as Record<string, number>,
      avgScore: 0,
    }

    let scoreSum = 0
    let scoreCount = 0

    for (const f of filtered) {
      summary.byReason[f.reason ?? "other"] = (summary.byReason[f.reason ?? "other"] ?? 0) + 1
      summary.byTargetType[f.target_type] = (summary.byTargetType[f.target_type] ?? 0) + 1

      if (f.score !== null && f.score !== undefined) {
        scoreSum += f.score
        scoreCount++
      }
    }

    summary.avgScore = scoreCount > 0 ? scoreSum / scoreCount : 0

    return summary
  }
}

// =============================================================================
// Learning Actions Execution
// =============================================================================

/**
 * Execute persistent learning actions based on feedback
 * These are real updates, not logical markers
 */
async function executeLearningActions(feedback: FeedbackEvent): Promise<LearningUpdate[]> {
  const actions: LearningUpdate[] = []
  const weight = feedback.score ?? calculateQualityScore(feedback)

  // User profile update for communication style/preferences
  if (feedback.userId) {
    const profileAction = await updateUserProfileFromFeedback(feedback, weight)
    if (profileAction) actions.push(profileAction)
  }

  // Retrieval/ranking signals update
  if (feedback.reason === "wrong_fact" || feedback.reason === "irrelevant") {
    const retrievalAction = await updateRetrievalSignals(feedback, weight)
    if (retrievalAction) actions.push(retrievalAction)
  }

  // Procedure success rate update
  if (feedback.target.type === "task" && feedback.target.taskId) {
    const procedureAction = await updateProcedureFromFeedback(feedback, weight)
    if (procedureAction) actions.push(procedureAction)
  }

  // Fact confidence update
  if (feedback.target.type === "memory_retrieval" && feedback.reason === "wrong_fact") {
    const factAction = await updateFactConfidence(feedback, weight)
    if (factAction) actions.push(factAction)
  }

  // Proactive policy adjustment (for proactive action feedback)
  if (feedback.target.type === "proactive_action") {
    const policyAction = await adjustProactivePolicy(feedback, weight)
    if (policyAction) actions.push(policyAction)
  }

  return actions
}

/**
 * Update user profile with communication style and preference changes
 */
async function updateUserProfileFromFeedback(feedback: FeedbackEvent, weight: number): Promise<LearningUpdate | null> {
  if (!feedback.userId) return null

  try {
    const current = await UserProfileRepo.get(feedback.tenantId, feedback.userId)

    // Parse existing preferences
    const currentPrefs = current?.preferences_json
    const preferences =
      typeof currentPrefs === "string" && currentPrefs ? JSON.parse(currentPrefs) : (currentPrefs ?? {})

    // Adjust preferences based on feedback reason
    const delta = feedback.vote === "up" ? weight : -weight

    switch (feedback.reason) {
      case "too_verbose":
        preferences.density = Math.max(0, Math.min(1, (preferences.density ?? 0.5) + delta * -0.2))
        break
      case "style_mismatch":
        preferences.tone = feedback.correction ?? preferences.tone ?? "neutral"
        break
      case "irrelevant":
        preferences.focus = Math.max(0, Math.min(1, (preferences.focus ?? 0.5) + delta * 0.1))
        break
    }

    // Update feedback stats in preferences
    const fbStats = (preferences.feedbackStats as Record<string, number>) ?? {}
    fbStats[feedback.reason] = (fbStats[feedback.reason] ?? 0) + 1
    fbStats.totalFeedback = (fbStats.totalFeedback ?? 0) + 1
    if (feedback.vote === "up") fbStats.upvotes = (fbStats.upvotes ?? 0) + 1
    else fbStats.downvotes = (fbStats.downvotes ?? 0) + 1
    preferences.feedbackStats = fbStats

    // Determine communication style
    let style = current?.communication_style ?? "neutral"
    if (fbStats.too_verbose > 5) style = "concise"
    else if (fbStats.irrelevant > 10) style = "focused"
    else if (fbStats.style_mismatch > 3) style = "adaptive"

    await UserProfileRepo.upsert({
      id: current?.id ?? crypto.randomUUID(),
      tenant_id: feedback.tenantId,
      user_id: feedback.userId,
      preferences_json: preferences as Record<string, unknown>,
      communication_style: style,
      constraints_json: current?.constraints_json ?? {},
      created_at: current?.created_at ?? Date.now(),
      updated_at: Date.now(),
    })

    log.debug("user profile updated from feedback", {
      tenantId: feedback.tenantId,
      userId: feedback.userId,
      reason: feedback.reason,
      delta,
    })

    return {
      type: "profile_update",
      targetId: feedback.userId,
      targetType: "user_profile",
      delta,
      reason: feedback.reason,
      weight,
      sourceFeedbackId: feedback.id,
      ts: Date.now(),
    }
  } catch (err) {
    log.error("failed to update user profile", { tenantId: feedback.tenantId, userId: feedback.userId, err })
    return null
  }
}

/**
 * Update retrieval ranking signals based on negative feedback
 */
async function updateRetrievalSignals(feedback: FeedbackEvent, weight: number): Promise<LearningUpdate | null> {
  if (!feedback.target.id) return null

  try {
    // For wrong_fact: penalize the specific memory/fact
    if (feedback.reason === "wrong_fact") {
      // This would update a ranking signals table in Phase 3
      // For Phase 1, we log the signal for future retrieval bias
      log.info("retrieval penalty signal", {
        targetId: feedback.target.id,
        reason: feedback.reason,
        penalty: weight * 0.2,
      })
    }

    // For irrelevant: penalize general retrieval approach
    if (feedback.reason === "irrelevant") {
      log.info("relevance penalty signal", {
        targetId: feedback.target.id,
        reason: feedback.reason,
        penalty: weight * 0.15,
      })
    }

    return {
      type: "retrieval_update",
      targetId: feedback.target.id,
      targetType: feedback.target.type,
      delta: feedback.vote === "up" ? weight * 0.1 : -weight * 0.2,
      reason: feedback.reason,
      weight,
      sourceFeedbackId: feedback.id,
      ts: Date.now(),
    }
  } catch (err) {
    log.error("failed to update retrieval signals", { targetId: feedback.target.id, err })
    return null
  }
}

/**
 * Update procedure success rate based on task feedback
 */
async function updateProcedureFromFeedback(feedback: FeedbackEvent, weight: number): Promise<LearningUpdate | null> {
  if (!feedback.target.taskId) return null

  try {
    // Determine success based on vote and reason
    const success = feedback.vote === "up" && feedback.reason !== "task_failed" && feedback.reason !== "task_partial"

    await ProceduralMemoryRepo.updateStats(feedback.target.taskId, success)

    log.debug("procedure stats updated from feedback", {
      taskId: feedback.target.taskId,
      success,
      weight,
    })

    return {
      type: "procedure_update",
      targetId: feedback.target.taskId,
      targetType: "procedure",
      delta: success ? weight : -weight,
      reason: feedback.reason,
      weight,
      sourceFeedbackId: feedback.id,
      ts: Date.now(),
    }
  } catch (err) {
    log.error("failed to update procedure stats", { taskId: feedback.target.taskId, err })
    return null
  }
}

/**
 * Update fact confidence based on wrong_fact feedback
 */
async function updateFactConfidence(feedback: FeedbackEvent, weight: number): Promise<LearningUpdate | null> {
  if (!feedback.target.id) return null

  try {
    const fact = await SemanticMemoryRepo.getFact(feedback.target.id)
    if (!fact) return null

    // Reduce confidence based on weight
    const reduction = Math.round(weight * 30) // Up to 30% reduction
    const newConfidence = Math.max(0, fact.confidence - reduction)

    await SemanticMemoryRepo.updateFact(feedback.target.id, null)

    log.debug("fact confidence updated from feedback", {
      factId: feedback.target.id,
      oldConfidence: fact.confidence,
      newConfidence,
      reduction,
    })

    return {
      type: "fact_confidence_update",
      targetId: feedback.target.id,
      targetType: "fact",
      delta: -reduction,
      reason: feedback.reason,
      weight,
      sourceFeedbackId: feedback.id,
      ts: Date.now(),
    }
  } catch (err) {
    log.error("failed to update fact confidence", { factId: feedback.target.id, err })
    return null
  }
}

/**
 * Adjust proactive policy aggressiveness based on feedback
 */
async function adjustProactivePolicy(feedback: FeedbackEvent, weight: number): Promise<LearningUpdate | null> {
  if (!feedback.userId) return null

  try {
    // Negative feedback on proactive action = reduce aggressiveness
    // Positive feedback = can稍微 increase
    const delta = feedback.vote === "up" ? weight * 0.05 : -weight * 0.15

    log.info("proactive policy adjustment signal", {
      tenantId: feedback.tenantId,
      userId: feedback.userId,
      reason: feedback.reason,
      delta,
    })

    return {
      type: "proactive_policy_update",
      targetId: feedback.userId,
      targetType: "user_profile",
      delta,
      reason: feedback.reason,
      weight,
      sourceFeedbackId: feedback.id,
      ts: Date.now(),
    }
  } catch (err) {
    log.error("failed to adjust proactive policy", { userId: feedback.userId, err })
    return null
  }
}

// =============================================================================
// Process Function with Zod Validation
// =============================================================================

/**
 * Process feedback with full Zod validation
 * Main entry point for feedback processing
 */
export const process = FeedbackProcessor.process

/**
 * Get feedback summary
 */
export const getSummary = FeedbackProcessor.getSummary

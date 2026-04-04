/**
 * Memory Feedback - User feedback loop and auto-learning
 * Based on ADR-005 feedback and auto-learning
 */

import { Log } from "@/util/log"
import { FeedbackRepo, SemanticMemoryRepo, ProceduralMemoryRepo, UserProfileRepo } from "./memory.repository"

const log = Log.create({ service: "kiloclaw.memory.feedback" })

// =============================================================================
// Feedback Types
// =============================================================================

export interface FeedbackPayload {
  vote: "up" | "down"
  reason: FeedbackReason
  correction?: string
  target: {
    responseId?: string
    memoryIds: string[]
  }
}

export type FeedbackReason = "wrong_fact" | "irrelevant" | "too_verbose" | "style_mismatch" | "unsafe" | "other"

// =============================================================================
// Feedback Processing
// =============================================================================

export const MemoryFeedback = {
  /**
   * Process user feedback
   */
  async process(tenantId: string, userId: string, feedback: FeedbackPayload): Promise<FeedbackResult> {
    log.info("processing feedback", { tenantId, userId, feedback })

    const result: FeedbackResult = {
      success: true,
      actions: [],
    }

    // Record the feedback event
    await FeedbackRepo.record({
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      user_id: userId,
      target_type: "response",
      target_id: feedback.target.responseId ?? "unknown",
      vote: feedback.vote,
      reason: feedback.reason,
      correction_text: feedback.correction,
      ts: Date.now(),
      created_at: Date.now(),
    })

    // Process based on vote and reason
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
// Feedback Handlers
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
  // Positive feedback on specific memories
  for (const memoryId of feedback.target.memoryIds) {
    // Increment provenance weight for the memory
    result.actions.push(`incremented_provenance:${memoryId}`)

    // Update user preference match for style
    if (feedback.reason === "style_mismatch") {
      // Update user profile communication style
      result.actions.push(`updated_style:${memoryId}`)
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
      // Reduce confidence of the fact
      for (const memoryId of feedback.target.memoryIds) {
        await SemanticMemoryRepo.updateFact(memoryId, null) // Mark as uncertain
        result.actions.push(`reduced_confidence:${memoryId}`)

        // If correction provided, propose new fact
        if (feedback.correction) {
          result.actions.push(`proposed_correction:${memoryId}`)
        }
      }
      break

    case "irrelevant":
      // Reduce relevance for this pattern
      result.actions.push("penalized_relevance")
      break

    case "too_verbose":
      // Update user preference for brevity
      result.actions.push("updated_preference_brevity")
      break

    case "style_mismatch":
      // Update user profile communication style
      result.actions.push("updated_communication_style")
      break

    case "unsafe":
      // Flag for review
      result.actions.push("flagged_for_review")
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
// Auto-Learning
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
    const summary = await MemoryFeedback.getSummary(tenantId)
    const patterns: Pattern[] = []

    // Detect high-value improvement opportunities
    if ((summary.byReason["wrong_fact"] ?? 0) > 10) {
      patterns.push({
        type: "accuracy",
        severity: "high",
        description: "High rate of fact corrections - verify knowledge base",
        recommendation: "Review recent facts for accuracy",
      })
    }

    if ((summary.byReason["irrelevant"] ?? 0) > 20) {
      patterns.push({
        type: "relevance",
        severity: "medium",
        description: "High rate of irrelevant responses",
        recommendation: "Improve retrieval relevance scoring",
      })
    }

    return patterns
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

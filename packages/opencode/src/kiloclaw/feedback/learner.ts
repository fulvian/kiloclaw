/**
 * Feedback Learner - Auto-Learning Updates from Feedback
 * Phase 1: Feedback Loop End-to-End
 * KILOCLAW_PROACTIVE_CONTINUATIVE_AUTOLEARNING_PLAN_2026-04-05.md
 */

import { z } from "zod"
import { Log } from "@/util/log"
import { UserProfileRepo, ProceduralMemoryRepo, SemanticMemoryRepo } from "../memory/memory.repository"
import { FeedbackReasonCode } from "./contract"

const log = Log.create({ service: "kiloclaw.feedback.learner" })

// =============================================================================
// Feedback Learner Namespace
// =============================================================================

export namespace FeedbackLearner {
  /**
   * Update user profile based on feedback patterns
   * Adjusts: communication style, density, tone, preferences
   */
  export async function updateUserProfile(
    tenantId: string,
    userId: string,
    feedback: {
      vote: "up" | "down"
      reason: FeedbackReasonCode
      score?: number
      correction?: string
    },
  ): Promise<{
    updated: boolean
    changes: Record<string, number | string>
  }> {
    const current = await UserProfileRepo.get(tenantId, userId)
    const weight = feedback.score ?? (feedback.vote === "up" ? 0.8 : 0.3)

    // Parse existing preferences
    const currentPrefs = current?.preferences_json
    const preferences =
      typeof currentPrefs === "string" && currentPrefs ? JSON.parse(currentPrefs) : (currentPrefs ?? {})

    const changes: Record<string, number | string> = {}

    // Apply feedback-driven adjustments
    if (feedback.vote === "down") {
      switch (feedback.reason) {
        case "too_verbose":
          // User wants more concise responses
          preferences.density = Math.max(0.1, (preferences.density as number ?? 0.5) - 0.15)
          changes.density = preferences.density as number
          break

        case "style_mismatch":
          // User provided a correction for style
          if (feedback.correction) {
            preferences.tone = feedback.correction
            changes.tone = feedback.correction
          }
          break

        case "irrelevant":
          // User wants more focused responses
          preferences.focus = Math.max(0.1, (preferences.focus as number ?? 0.5) + 0.1)
          changes.focus = preferences.focus as number
          break

        case "task_partial":
        case "task_failed":
          // User wants more thorough responses
          preferences.thoroughness = Math.min(1, (preferences.thoroughness as number ?? 0.5) + 0.1)
          changes.thoroughness = preferences.thoroughness as number
          break
      }
    } else if (feedback.vote === "up") {
      // Reinforce positive patterns
      switch (feedback.reason) {
        case "style_mismatch":
          // User approved of the style
          preferences.tone = preferences.tone ?? "adaptive"
          break

        case "too_verbose":
          // User actually liked the verbosity
          preferences.density = Math.min(1, (preferences.density as number ?? 0.5) + 0.05)
          changes.density = preferences.density as number
          break
      }
    }

    // Update feedback statistics
    const fbStats = (preferences.feedbackStats as Record<string, number>) ?? {}
    fbStats[feedback.reason] = (fbStats[feedback.reason] ?? 0) + 1
    fbStats.totalFeedback = (fbStats.totalFeedback ?? 0) + 1
    fbStats.lastFeedbackAt = Date.now()
    preferences.feedbackStats = fbStats

    // Determine communication style
    let style = current?.communication_style ?? "neutral"
    if (fbStats.too_verbose > 5) style = "concise"
    else if (fbStats.irrelevant > 10) style = "focused"
    else if (fbStats.style_mismatch > 3) style = "adaptive"

    if (style !== current?.communication_style) {
      changes.communication_style = style
    }

    // Persist update
    await UserProfileRepo.upsert({
      id: current?.id ?? crypto.randomUUID(),
      tenant_id: tenantId,
      user_id: userId,
      preferences_json: preferences as Record<string, unknown>,
      communication_style: style,
      constraints_json: current?.constraints_json ?? {},
      created_at: current?.created_at ?? Date.now(),
      updated_at: Date.now(),
    })

    log.debug("user profile learning update", { tenantId, userId, changes })

    return {
      updated: true,
      changes,
    }
  }

  /**
   * Update retrieval signals based on negative feedback
   * Applies penalties to sources for wrong_fact/irrelevant
   */
  export async function updateRetrievalSignals(
    tenantId: string,
    feedback: {
      targetId: string
      targetType: string
      reason: FeedbackReasonCode
      vote: "up" | "down"
      score?: number
    },
  ): Promise<{
    updated: boolean
    penalties: Array<{ source: string; penalty: number }>
  }> {
    const penalties: Array<{ source: string; penalty: number }> = []

    // Only penalize for negative feedback on wrong_fact or irrelevant
    if (feedback.vote === "up" || (feedback.reason !== "wrong_fact" && feedback.reason !== "irrelevant")) {
      return { updated: false, penalties }
    }

    const weight = feedback.score ?? 0.5

    if (feedback.reason === "wrong_fact") {
      // Penalize the specific fact
      const penalty = weight * 0.25
      penalties.push({ source: `fact:${feedback.targetId}`, penalty })

      log.info("retrieval penalty applied", {
        tenantId,
        targetId: feedback.targetId,
        reason: feedback.reason,
        penalty,
      })
    }

    if (feedback.reason === "irrelevant") {
      // Penalize retrieval pattern
      const penalty = weight * 0.15
      penalties.push({ source: `pattern:${feedback.targetId}`, penalty })

      log.info("relevance penalty applied", {
        tenantId,
        targetId: feedback.targetId,
        reason: feedback.reason,
        penalty,
      })
    }

    // In Phase 3, this would update a ranking signals table
    // For Phase 1, we log the signal for monitoring

    return {
      updated: penalties.length > 0,
      penalties,
    }
  }

  /**
   * Update procedure statistics based on feedback
   * Uses weighted success rate calculation
   */
  export async function updateProcedureStats(
    feedback: {
      procedureId: string
      vote: "up" | "down"
      reason: FeedbackReasonCode
      score?: number
    },
  ): Promise<{
    updated: boolean
    newSuccessRate: number
  }> {
    // Determine if task was successful
    const success =
      feedback.vote === "up" && feedback.reason !== "task_failed" && feedback.reason !== "task_partial"

    const weight = feedback.score ?? (feedback.vote === "up" ? 0.8 : 0.2)

    try {
      const current = await ProceduralMemoryRepo.get(feedback.procedureId)
      if (!current) {
        log.warn("procedure not found for stats update", { procedureId: feedback.procedureId })
        return { updated: false, newSuccessRate: 0 }
      }

      // Weighted success rate update
      const newUsageCount = current.usage_count + 1
      const baseWeight = current.usage_count / newUsageCount
      const feedbackWeight = weight / newUsageCount

      let newSuccessRate: number
      if (success) {
        newSuccessRate = Math.round(
          current.success_rate * baseWeight + 100 * feedbackWeight,
        )
      } else {
        newSuccessRate = Math.round(current.success_rate * baseWeight)
      }

      newSuccessRate = Math.max(0, Math.min(100, newSuccessRate))

      await ProceduralMemoryRepo.updateStats(feedback.procedureId, success)

      log.debug("procedure stats learning update", {
        procedureId: feedback.procedureId,
        success,
        weight,
        oldRate: current.success_rate,
        newRate: newSuccessRate,
      })

      return {
        updated: true,
        newSuccessRate,
      }
    } catch (err) {
      log.error("failed to update procedure stats", { procedureId: feedback.procedureId, err })
      return { updated: false, newSuccessRate: 0 }
    }
  }

  /**
   * Adjust proactive policy based on feedback
   * Controls aggressiveness of proactive suggestions
   */
  export async function adjustProactivePolicy(
    tenantId: string,
    userId: string,
    feedback: {
      vote: "up" | "down"
      reason: FeedbackReasonCode
      score?: number
    },
  ): Promise<{
    adjusted: boolean
    aggressivenessDelta: number
  }> {
    const current = await UserProfileRepo.get(tenantId, userId)
    if (!current) {
      return { adjusted: false, aggressivenessDelta: 0 }
    }

    const weight = feedback.score ?? (feedback.vote === "up" ? 0.7 : 0.4)

    // Parse constraints
    const currentConstraints = current.constraints_json
    const constraints =
      typeof currentConstraints === "string" && currentConstraints
        ? JSON.parse(currentConstraints)
        : currentConstraints ?? {}

    // Initialize proactive settings if not present
    const proactive = (constraints.proactive as Record<string, unknown>) ?? {}
    const currentAggressiveness = (proactive.aggressiveness as number) ?? 0.5

    let delta = 0

    if (feedback.vote === "down") {
      // Reduce aggressiveness based on reason
      switch (feedback.reason) {
        case "expectation_mismatch":
        case "task_partial":
          delta = -weight * 0.2 // Significant reduction
          break
        case "irrelevant":
          delta = -weight * 0.15
          break
        case "unsafe":
          delta = -weight * 0.3 // Major reduction for safety
          break
        default:
          delta = -weight * 0.1
      }
    } else if (feedback.vote === "up" && feedback.reason !== "unsafe") {
      // Slightly increase if positive feedback
      delta = weight * 0.05
    }

    const newAggressiveness = Math.max(0, Math.min(1, currentAggressiveness + delta))

    if (delta !== 0) {
      proactive.aggressiveness = newAggressiveness
      constraints.proactive = proactive

      await UserProfileRepo.upsert({
        id: current.id,
        tenant_id: tenantId,
        user_id: userId,
        preferences_json: current.preferences_json ?? {},
        communication_style: current.communication_style ?? "neutral",
        constraints_json: constraints as Record<string, unknown>,
        created_at: current.created_at,
        updated_at: Date.now(),
      })

      log.debug("proactive policy adjusted", {
        tenantId,
        userId,
        reason: feedback.reason,
        delta,
        newAggressiveness,
      })
    }

    return {
      adjusted: delta !== 0,
      aggressivenessDelta: delta,
    }
  }

  /**
   * Extract learning patterns from feedback aggregate
   */
  export async function extractPatterns(tenantId: string): Promise<
    Array<{
      type: "accuracy" | "relevance" | "style" | "safety"
      severity: "low" | "medium" | "high"
      description: string
      recommendation: string
      count: number
    }>
  > {
    // Get feedback summary from repository
    const { FeedbackRepo } = await import("../memory/memory.repository")
    const events = await FeedbackRepo.getByTenant(tenantId, 100)

    const patterns: Array<{
      type: "accuracy" | "relevance" | "style" | "safety"
      severity: "low" | "medium" | "high"
      description: string
      recommendation: string
      count: number
    }> = []

    // Count by reason
    const reasonCounts: Record<string, number> = {}
    for (const event of events) {
      reasonCounts[event.reason ?? "other"] = (reasonCounts[event.reason ?? "other"] ?? 0) + 1
    }

    // Generate patterns based on thresholds
    if ((reasonCounts.wrong_fact ?? 0) > 5) {
      patterns.push({
        type: "accuracy",
        severity: (reasonCounts.wrong_fact ?? 0) > 10 ? "high" : "medium",
        description: `High rate of fact corrections (${reasonCounts.wrong_fact})`,
        recommendation: "Review recent facts for accuracy, verify knowledge base",
        count: reasonCounts.wrong_fact ?? 0,
      })
    }

    if ((reasonCounts.irrelevant ?? 0) > 10) {
      patterns.push({
        type: "relevance",
        severity: (reasonCounts.irrelevant ?? 0) > 20 ? "high" : "medium",
        description: `High rate of irrelevant responses (${reasonCounts.irrelevant})`,
        recommendation: "Improve retrieval relevance scoring, review query understanding",
        count: reasonCounts.irrelevant ?? 0,
      })
    }

    if ((reasonCounts.style_mismatch ?? 0) > 5) {
      patterns.push({
        type: "style",
        severity: "medium",
        description: `Communication style mismatches (${reasonCounts.style_mismatch})`,
        recommendation: "Adapt to user preferred communication style",
        count: reasonCounts.style_mismatch ?? 0,
      })
    }

    if ((reasonCounts.unsafe ?? 0) > 0) {
      patterns.push({
        type: "safety",
        severity: "high",
        description: `Unsafe content feedback received (${reasonCounts.unsafe})`,
        recommendation: "Immediate review required - check guardrails and safety policies",
        count: reasonCounts.unsafe ?? 0,
      })
    }

    return patterns
  }
}

// =============================================================================
// Exports
// =============================================================================

export const updateUserProfile = FeedbackLearner.updateUserProfile
export const updateRetrievalSignals = FeedbackLearner.updateRetrievalSignals
export const updateProcedureStats = FeedbackLearner.updateProcedureStats
export const adjustProactivePolicy = FeedbackLearner.adjustProactivePolicy
export const extractPatterns = FeedbackLearner.extractPatterns

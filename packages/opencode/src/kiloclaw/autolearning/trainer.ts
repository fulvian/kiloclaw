/**
 * Learning Trainer - Rule-Based Lightweight Learning Algorithms
 * Phase 3: Auto-Learning Governed
 * KILOCLAW_PROACTIVE_CONTINUATIVE_AUTOLEARNING_PLAN_2026-04-05.md
 *
 * Note: This is NOT heavy ML - only lightweight mathematical rules
 */

import { z } from "zod"
import { Log } from "@/util/log"
import { FeatureName } from "./feature-store"

const log = Log.create({ service: "kiloclaw.autolearning.trainer" })

// =============================================================================
// Learning Signal Schema
// =============================================================================

export const LearningSignalSchema = z.object({
  tenantId: z.string().min(1),
  userId: z.string().optional(),
  featureName: FeatureName,
  value: z.number(),
  weight: z.number().min(0).max(1).default(0.5),
  ts: z.number().int().positive(),
})
export type LearningSignal = z.infer<typeof LearningSignalSchema>

// =============================================================================
// Update Result Schema
// =============================================================================

export const UpdateResultSchema = z.object({
  success: z.boolean(),
  featureName: FeatureName,
  oldValue: z.number().nullable(),
  newValue: z.number(),
  delta: z.number(),
  confidence: z.number(),
})
export type UpdateResult = z.infer<typeof UpdateResultSchema>

// =============================================================================
// Learning Trainer Namespace
// =============================================================================

export namespace LearningTrainer {
  // Store for current values (would be database in production)
  const currentValues = new Map<string, number>()
  const confidences = new Map<string, number>()

  /**
   * Get key for value storage
   */
  function getValueKey(tenantId: string, userId: string | undefined, featureName: FeatureName): string {
    return `${tenantId}:${userId ?? "global"}:${featureName}`
  }

  /**
   * Update user preference score using weighted average
   * Formula: newValue = (oldValue * (1 - weight)) + (signal * weight)
   */
  export async function updatePreferenceScore(
    tenantId: string,
    userId: string | undefined,
    signal: LearningSignal,
  ): Promise<UpdateResult> {
    const key = getValueKey(tenantId, userId, "user_preference_score")
    const oldValue = currentValues.get(key) ?? 0.5 // Default neutral
    const confidence = confidences.get(key) ?? 0

    // Weighted average update
    const w = signal.weight
    const newValue = oldValue * (1 - w) + signal.value * w

    // Update confidence based on sample size
    const newConfidence = Math.min(1, confidence + signal.weight * 0.1)

    currentValues.set(key, newValue)
    confidences.set(key, newConfidence)

    log.debug("preference score updated", {
      tenantId,
      userId,
      oldValue,
      newValue,
      delta: newValue - oldValue,
      confidence: newConfidence,
    })

    return {
      success: true,
      featureName: "user_preference_score",
      oldValue: oldValue === 0.5 ? null : oldValue,
      newValue,
      delta: newValue - oldValue,
      confidence: newConfidence,
    }
  }

  /**
   * Update retrieval relevance using exponential decay for irrelevant items
   * Formula: newValue = oldValue * decayFactor for negative signals
   */
  export async function updateRetrievalRelevance(tenantId: string, signal: LearningSignal): Promise<UpdateResult> {
    const key = getValueKey(tenantId, signal.userId, "retrieval_relevance_score")
    const oldValue = currentValues.get(key) ?? 0.8 // Default high relevance
    const confidence = confidences.get(key) ?? 0

    let newValue: number

    if (signal.value < 0.5) {
      // Negative signal - apply exponential decay
      const decayFactor = 0.9
      newValue = oldValue * decayFactor * signal.value
    } else {
      // Positive signal - slight increase
      newValue = Math.min(1, oldValue + (signal.value - 0.5) * 0.1)
    }

    // Update confidence
    const newConfidence = Math.min(1, confidence + signal.weight * 0.05)

    currentValues.set(key, newValue)
    confidences.set(key, newConfidence)

    log.debug("retrieval relevance updated", {
      tenantId,
      userId: signal.userId,
      oldValue,
      newValue,
      delta: newValue - oldValue,
      signal: signal.value,
    })

    return {
      success: true,
      featureName: "retrieval_relevance_score",
      oldValue: oldValue === 0.8 ? null : oldValue,
      newValue,
      delta: newValue - oldValue,
      confidence: newConfidence,
    }
  }

  /**
   * Update procedure success rate using weighted success counting
   */
  export async function updateProcedureSuccessRate(
    tenantId: string,
    procedureId: string,
    success: boolean,
    weight: number = 0.5,
  ): Promise<UpdateResult> {
    const key = getValueKey(tenantId, procedureId, "procedure_success_rate")
    const oldValue = currentValues.get(key) ?? 50 // Default 50%
    const confidence = confidences.get(key) ?? 0

    // Convert to 0-1 scale for calculation
    const oldRate = oldValue / 100
    const sampleCount = confidence * 100

    // Weighted average
    const newRate = oldRate * (1 - weight) + (success ? 1 : 0) * weight
    const newValue = Math.round(newRate * 100)
    const newConfidence = Math.min(1, confidence + weight * 0.1)

    currentValues.set(key, newValue)
    confidences.set(key, newConfidence)

    log.debug("procedure success rate updated", {
      tenantId,
      procedureId,
      success,
      oldValue,
      newValue,
      delta: newValue - oldValue,
    })

    return {
      success: true,
      featureName: "procedure_success_rate",
      oldValue: oldValue === 50 ? null : oldValue,
      newValue,
      delta: newValue - oldValue,
      confidence: newConfidence,
    }
  }

  /**
   * Adjust proactive priority/aggressiveness based on acceptance signals
   */
  export async function adjustProactivePriority(
    tenantId: string,
    userId: string | undefined,
    acceptanceSignal: number, // 0-1, how well proactive actions were received
    weight: number = 0.3,
  ): Promise<UpdateResult> {
    const key = getValueKey(tenantId, userId, "proactive_acceptance_rate")
    const oldValue = currentValues.get(key) ?? 0.5 // Default neutral
    const confidence = confidences.get(key) ?? 0

    // Calculate new aggressiveness based on acceptance
    // If acceptance is high, can increase aggressiveness slightly
    // If acceptance is low, decrease aggressiveness
    let delta = 0
    if (acceptanceSignal > 0.7) {
      delta = weight * 0.1 // Increase
    } else if (acceptanceSignal < 0.3) {
      delta = -weight * 0.2 // Decrease more aggressively
    } else {
      delta = (acceptanceSignal - 0.5) * weight * 0.1 // Fine-tune
    }

    const newValue = Math.max(0, Math.min(1, oldValue + delta))
    const newConfidence = Math.min(1, confidence + weight * 0.05)

    currentValues.set(key, newValue)
    confidences.set(key, newConfidence)

    log.debug("proactive priority adjusted", {
      tenantId,
      userId,
      oldValue,
      newValue,
      delta,
      acceptanceSignal,
    })

    return {
      success: true,
      featureName: "proactive_acceptance_rate",
      oldValue: oldValue === 0.5 ? null : oldValue,
      newValue,
      delta,
      confidence: newConfidence,
    }
  }

  /**
   * Update feedback upvote rate
   */
  export async function updateFeedbackUpvoteRate(
    tenantId: string,
    userId: string | undefined,
    isUpvote: boolean,
    weight: number = 0.3,
  ): Promise<UpdateResult> {
    const key = getValueKey(tenantId, userId, "feedback_upvote_rate")
    const oldValue = currentValues.get(key) ?? 0.5
    const confidence = confidences.get(key) ?? 0

    const signal = isUpvote ? 1 : 0
    const newValue = oldValue * (1 - weight) + signal * weight
    const newConfidence = Math.min(1, confidence + weight * 0.1)

    currentValues.set(key, newValue)
    confidences.set(key, newConfidence)

    return {
      success: true,
      featureName: "feedback_upvote_rate",
      oldValue: oldValue === 0.5 ? null : oldValue,
      newValue,
      delta: newValue - oldValue,
      confidence: newConfidence,
    }
  }

  /**
   * Update wrong fact rate (should decrease over time with corrections)
   */
  export async function updateWrongFactRate(
    tenantId: string,
    userId: string | undefined,
    isWrongFact: boolean,
    weight: number = 0.2,
  ): Promise<UpdateResult> {
    const key = getValueKey(tenantId, userId, "wrong_fact_rate")
    const oldValue = currentValues.get(key) ?? 0.1 // Default low
    const confidence = confidences.get(key) ?? 0

    const signal = isWrongFact ? 1 : 0
    const newValue = oldValue * (1 - weight) + signal * weight
    const newConfidence = Math.min(1, confidence + weight * 0.1)

    currentValues.set(key, newValue)
    confidences.set(key, newConfidence)

    log.debug("wrong fact rate updated", {
      tenantId,
      userId,
      isWrongFact,
      oldValue,
      newValue,
    })

    return {
      success: true,
      featureName: "wrong_fact_rate",
      oldValue: oldValue === 0.1 ? null : oldValue,
      newValue,
      delta: newValue - oldValue,
      confidence: newConfidence,
    }
  }

  /**
   * Update irrelevant rate (should decrease with better retrieval)
   */
  export async function updateIrrelevantRate(
    tenantId: string,
    userId: string | undefined,
    isIrrelevant: boolean,
    weight: number = 0.2,
  ): Promise<UpdateResult> {
    const key = getValueKey(tenantId, userId, "irrelevant_rate")
    const oldValue = currentValues.get(key) ?? 0.15 // Default moderate
    const confidence = confidences.get(key) ?? 0

    const signal = isIrrelevant ? 1 : 0
    const newValue = oldValue * (1 - weight) + signal * weight
    const newConfidence = Math.min(1, confidence + weight * 0.1)

    currentValues.set(key, newValue)
    confidences.set(key, newConfidence)

    log.debug("irrelevant rate updated", {
      tenantId,
      userId,
      isIrrelevant,
      oldValue,
      newValue,
    })

    return {
      success: true,
      featureName: "irrelevant_rate",
      oldValue: oldValue === 0.15 ? null : oldValue,
      newValue,
      delta: newValue - oldValue,
      confidence: newConfidence,
    }
  }

  /**
   * Get current value for a feature
   */
  export async function getCurrentValue(
    tenantId: string,
    userId: string | undefined,
    featureName: FeatureName,
  ): Promise<number | null> {
    const key = getValueKey(tenantId, userId, featureName)
    return currentValues.get(key) ?? null
  }

  /**
   * Get confidence for a feature
   */
  export async function getConfidence(
    tenantId: string,
    userId: string | undefined,
    featureName: FeatureName,
  ): Promise<number> {
    const key = getValueKey(tenantId, userId, featureName)
    return confidences.get(key) ?? 0
  }

  /**
   * Batch update multiple signals
   */
  export async function batchUpdate(signals: LearningSignal[]): Promise<UpdateResult[]> {
    const results: UpdateResult[] = []

    for (const signal of signals) {
      const result = await updatePreferenceScore(signal.tenantId, signal.userId, signal)
      results.push(result)
    }

    log.info("batch update completed", {
      signalCount: signals.length,
      resultsCount: results.length,
    })

    return results
  }

  /**
   * Reset feature to default value
   */
  export async function resetFeature(
    tenantId: string,
    userId: string | undefined,
    featureName: FeatureName,
  ): Promise<void> {
    const key = getValueKey(tenantId, userId, featureName)
    currentValues.delete(key)
    confidences.delete(key)

    log.info("feature reset to default", { tenantId, userId, featureName })
  }
}

// =============================================================================
// Exports
// =============================================================================

export const updatePreferenceScore = LearningTrainer.updatePreferenceScore
export const updateRetrievalRelevance = LearningTrainer.updateRetrievalRelevance
export const updateProcedureSuccessRate = LearningTrainer.updateProcedureSuccessRate
export const adjustProactivePriority = LearningTrainer.adjustProactivePriority
export const updateFeedbackUpvoteRate = LearningTrainer.updateFeedbackUpvoteRate
export const updateWrongFactRate = LearningTrainer.updateWrongFactRate
export const updateIrrelevantRate = LearningTrainer.updateIrrelevantRate
export const getCurrentValue = LearningTrainer.getCurrentValue
export const getConfidence = LearningTrainer.getConfidence
export const batchUpdate = LearningTrainer.batchUpdate
export const resetFeature = LearningTrainer.resetFeature

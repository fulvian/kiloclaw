/**
 * Feature Store - Feature Extraction from Usage/Feedback/Task Outcomes
 * Phase 3: Auto-Learning Governed
 * KILOCLAW_PROACTIVE_CONTINUATIVE_AUTOLEARNING_PLAN_2026-04-05.md
 */

import { z } from "zod"
import { Log } from "@/util/log"

const log = Log.create({ service: "kiloclaw.autolearning.feature-store" })

// =============================================================================
// Feature Types
// =============================================================================

export const FeatureName = z.enum([
  "user_preference_score",
  "retrieval_relevance_score",
  "procedure_success_rate",
  "proactive_acceptance_rate",
  "feedback_upvote_rate",
  "wrong_fact_rate",
  "irrelevant_rate",
  "unsafe_incident_rate",
  "task_completion_rate",
  "response_quality_score",
])
export type FeatureName = z.infer<typeof FeatureName>

export const WindowType = z.enum(["hourly", "daily", "weekly"])
export type WindowType = z.infer<typeof WindowType>

// =============================================================================
// Feature Store Schema
// =============================================================================

export const LearningFeatureSchema = z.object({
  id: z.string(),
  tenantId: z.string().min(1),
  userId: z.string().optional(),
  featureName: FeatureName,
  featureValue: z.number(),
  windowStart: z.number().int().positive(),
  windowEnd: z.number().int().positive(),
  createdAt: z.number().int().positive(),
})
export type LearningFeature = z.infer<typeof LearningFeatureSchema>

export const LearningSnapshotSchema = z.object({
  id: z.string(),
  tenantId: z.string().min(1),
  policyVersion: z.string().optional(),
  profileVersion: z.string().optional(),
  metricsJson: z.record(z.string(), z.unknown()),
  createdAt: z.number().int().positive(),
})
export type LearningSnapshot = z.infer<typeof LearningSnapshotSchema>

// =============================================================================
// Feature Store Namespace
// =============================================================================

export namespace FeatureStore {
  // In-memory store for Phase 3 (would be database in production)
  const features = new Map<string, LearningFeature>()
  const snapshots: LearningSnapshot[] = []

  /**
   * Get feature key for map storage
   */
  function getFeatureKey(
    tenantId: string,
    userId: string | undefined,
    featureName: FeatureName,
    windowStart: number,
  ): string {
    return `${tenantId}:${userId ?? "global"}:${featureName}:${windowStart}`
  }

  /**
   * Extract features from feedback event
   */
  export async function extractFromFeedback(
    tenantId: string,
    userId: string | undefined,
    feedback: {
      vote: "up" | "down"
      reason: string
      score?: number
    },
    windowStart: number,
    windowEnd: number,
  ): Promise<LearningFeature[]> {
    const extracted: LearningFeature[] = []
    const ts = Date.now()

    // Feedback upvote rate
    const upvoteKey = getFeatureKey(tenantId, userId, "feedback_upvote_rate", windowStart)
    const existingUpvote = features.get(upvoteKey)
    const upvoteValue = existingUpvote ? existingUpvote.featureValue : 0
    const upvoteDelta = feedback.vote === "up" ? 1 : 0
    const newUpvoteValue = existingUpvote
      ? (upvoteValue * existingUpvote.featureValue + upvoteDelta) / (existingUpvote.featureValue + 1)
      : upvoteDelta

    extracted.push({
      id: crypto.randomUUID(),
      tenantId,
      userId,
      featureName: "feedback_upvote_rate",
      featureValue: newUpvoteValue,
      windowStart,
      windowEnd,
      createdAt: ts,
    })

    // Wrong fact rate
    if (feedback.reason === "wrong_fact") {
      const key = getFeatureKey(tenantId, userId, "wrong_fact_rate", windowStart)
      const existing = features.get(key)
      const value = existing ? existing.featureValue : 0
      const newValue = existing
        ? (value * existing.featureValue + (feedback.vote === "down" ? 1 : 0)) / (existing.featureValue + 1)
        : feedback.vote === "down"
          ? 1
          : 0

      extracted.push({
        id: crypto.randomUUID(),
        tenantId,
        userId,
        featureName: "wrong_fact_rate",
        featureValue: newValue,
        windowStart,
        windowEnd,
        createdAt: ts,
      })
    }

    // Irrelevant rate
    if (feedback.reason === "irrelevant") {
      const key = getFeatureKey(tenantId, userId, "irrelevant_rate", windowStart)
      const existing = features.get(key)
      const value = existing ? existing.featureValue : 0
      const newValue = existing
        ? (value * existing.featureValue + (feedback.vote === "down" ? 1 : 0)) / (existing.featureValue + 1)
        : feedback.vote === "down"
          ? 1
          : 0

      extracted.push({
        id: crypto.randomUUID(),
        tenantId,
        userId,
        featureName: "irrelevant_rate",
        featureValue: newValue,
        windowStart,
        windowEnd,
        createdAt: ts,
      })
    }

    // Unsafe incident rate
    if (feedback.reason === "unsafe") {
      const key = getFeatureKey(tenantId, userId, "unsafe_incident_rate", windowStart)
      const existing = features.get(key)
      const value = existing ? existing.featureValue : 0
      const newValue = existing ? (value * existing.featureValue + 1) / (existing.featureValue + 1) : 1

      extracted.push({
        id: crypto.randomUUID(),
        tenantId,
        userId,
        featureName: "unsafe_incident_rate",
        featureValue: newValue,
        windowStart,
        windowEnd,
        createdAt: ts,
      })
    }

    // Store extracted features
    for (const feature of extracted) {
      const key = getFeatureKey(tenantId, userId, feature.featureName, windowStart)
      features.set(key, feature)
    }

    log.debug("features extracted from feedback", {
      tenantId,
      userId,
      count: extracted.length,
    })

    return extracted
  }

  /**
   * Extract features from task outcome
   */
  export async function extractFromTaskOutcome(
    tenantId: string,
    userId: string | undefined,
    taskOutcome: {
      success: boolean
      partial: boolean
      completionScore?: number
    },
    windowStart: number,
    windowEnd: number,
  ): Promise<LearningFeature[]> {
    const extracted: LearningFeature[] = []
    const ts = Date.now()

    // Task completion rate
    const completionKey = getFeatureKey(tenantId, userId, "task_completion_rate", windowStart)
    const existingCompletion = features.get(completionKey)
    const completionValue = existingCompletion ? existingCompletion.featureValue : 0
    const newCompletionValue = existingCompletion
      ? (completionValue * existingCompletion.featureValue + (taskOutcome.success ? 1 : 0)) /
        (existingCompletion.featureValue + 1)
      : taskOutcome.success
        ? 1
        : 0

    extracted.push({
      id: crypto.randomUUID(),
      tenantId,
      userId,
      featureName: "task_completion_rate",
      featureValue: newCompletionValue,
      windowStart,
      windowEnd,
      createdAt: ts,
    })

    // Response quality score
    if (taskOutcome.completionScore !== undefined) {
      const qualityKey = getFeatureKey(tenantId, userId, "response_quality_score", windowStart)
      const existingQuality = features.get(qualityKey)
      const qualityValue = existingQuality ? existingQuality.featureValue : 0
      const newQualityValue = existingQuality
        ? (qualityValue * existingQuality.featureValue + taskOutcome.completionScore) /
          (existingQuality.featureValue + 1)
        : taskOutcome.completionScore

      extracted.push({
        id: crypto.randomUUID(),
        tenantId,
        userId,
        featureName: "response_quality_score",
        featureValue: newQualityValue,
        windowStart,
        windowEnd,
        createdAt: ts,
      })
    }

    // Store extracted features
    for (const feature of extracted) {
      const key = getFeatureKey(tenantId, userId, feature.featureName, windowStart)
      features.set(key, feature)
    }

    log.debug("features extracted from task outcome", {
      tenantId,
      userId,
      count: extracted.length,
    })

    return extracted
  }

  /**
   * Extract features from proactive action acceptance
   */
  export async function extractFromProactiveAcceptance(
    tenantId: string,
    userId: string | undefined,
    accepted: boolean,
    windowStart: number,
    windowEnd: number,
  ): Promise<LearningFeature[]> {
    const ts = Date.now()

    const key = getFeatureKey(tenantId, userId, "proactive_acceptance_rate", windowStart)
    const existing = features.get(key)
    const value = existing ? existing.featureValue : 0
    const newValue = existing
      ? (value * existing.featureValue + (accepted ? 1 : 0)) / (existing.featureValue + 1)
      : accepted
        ? 1
        : 0

    const feature: LearningFeature = {
      id: crypto.randomUUID(),
      tenantId,
      userId,
      featureName: "proactive_acceptance_rate",
      featureValue: newValue,
      windowStart,
      windowEnd,
      createdAt: ts,
    }

    features.set(key, feature)

    log.debug("feature extracted from proactive acceptance", {
      tenantId,
      userId,
      accepted,
      newValue,
    })

    return [feature]
  }

  /**
   * Get features for a tenant in a time window
   */
  export async function getFeatures(
    tenantId: string,
    userId?: string,
    windowStart?: number,
    windowEnd?: number,
  ): Promise<LearningFeature[]> {
    const result: LearningFeature[] = []

    for (const feature of features.values()) {
      if (feature.tenantId !== tenantId) continue
      if (userId !== undefined && feature.userId !== userId) continue
      if (windowStart !== undefined && feature.windowStart < windowStart) continue
      if (windowEnd !== undefined && feature.windowEnd > windowEnd) continue

      result.push(feature)
    }

    return result
  }

  /**
   * Get aggregated feature value across time windows
   */
  export async function getAggregatedFeature(
    tenantId: string,
    userId: string | undefined,
    featureName: FeatureName,
    windowType: WindowType,
    now: number = Date.now(),
  ): Promise<number | null> {
    const windowMs = getWindowMs(windowType)
    const windowStart = Math.floor(now / windowMs) * windowMs
    const windowEnd = windowStart + windowMs

    const key = getFeatureKey(tenantId, userId, featureName, windowStart)
    const feature = features.get(key)

    return feature?.featureValue ?? null
  }

  /**
   * Get window duration in milliseconds
   */
  function getWindowMs(windowType: WindowType): number {
    switch (windowType) {
      case "hourly":
        return 60 * 60 * 1000
      case "daily":
        return 24 * 60 * 60 * 1000
      case "weekly":
        return 7 * 24 * 60 * 60 * 1000
    }
  }

  /**
   * Create a learning snapshot for rollback purposes
   */
  export async function createSnapshot(
    tenantId: string,
    policyVersion?: string,
    profileVersion?: string,
  ): Promise<LearningSnapshot> {
    const snapshot: LearningSnapshot = {
      id: crypto.randomUUID(),
      tenantId,
      policyVersion,
      profileVersion,
      metricsJson: {},
      createdAt: Date.now(),
    }

    // Aggregate current features into snapshot
    const tenantFeatures = await getFeatures(tenantId)
    for (const feature of tenantFeatures) {
      const key = `${feature.featureName}:${feature.userId ?? "global"}`
      snapshot.metricsJson[key] = feature.featureValue
    }

    snapshots.push(snapshot)

    log.info("learning snapshot created", {
      tenantId,
      snapshotId: snapshot.id,
      policyVersion,
      profileVersion,
    })

    return snapshot
  }

  /**
   * Get the latest snapshot for a tenant
   */
  export async function getLatestSnapshot(tenantId: string): Promise<LearningSnapshot | null> {
    const tenantSnapshots = snapshots.filter((s) => s.tenantId === tenantId)
    if (tenantSnapshots.length === 0) return null

    return tenantSnapshots.reduce((latest, current) => (current.createdAt > latest.createdAt ? current : latest))
  }

  /**
   * Get features grouped by time window
   */
  export async function getFeaturesByWindow(
    tenantId: string,
    windowType: WindowType,
    userId?: string,
  ): Promise<Map<number, LearningFeature[]>> {
    const allFeatures = await getFeatures(tenantId, userId)
    const grouped = new Map<number, LearningFeature[]>()

    for (const feature of allFeatures) {
      const windowMs = getWindowMs(windowType)
      const windowStart = Math.floor(feature.windowStart / windowMs) * windowMs

      const existing = grouped.get(windowStart) ?? []
      existing.push(feature)
      grouped.set(windowStart, existing)
    }

    return grouped
  }

  /**
   * Clear old features outside retention window
   */
  export async function pruneFeatures(retentionDays: number = 30): Promise<number> {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
    let pruned = 0

    for (const [key, feature] of features.entries()) {
      if (feature.createdAt < cutoff) {
        features.delete(key)
        pruned++
      }
    }

    log.info("features pruned", { pruned, retentionDays })

    return pruned
  }

  /**
   * Get feature names available
   */
  export function getAvailableFeatureNames(): FeatureName[] {
    return FeatureName.options
  }
}

// =============================================================================
// Exports
// =============================================================================

export const extractFromFeedback = FeatureStore.extractFromFeedback
export const extractFromTaskOutcome = FeatureStore.extractFromTaskOutcome
export const extractFromProactiveAcceptance = FeatureStore.extractFromProactiveAcceptance
export const getFeatures = FeatureStore.getFeatures
export const getAggregatedFeature = FeatureStore.getAggregatedFeature
export const createSnapshot = FeatureStore.createSnapshot
export const getLatestSnapshot = FeatureStore.getLatestSnapshot
export const getFeaturesByWindow = FeatureStore.getFeaturesByWindow
export const pruneFeatures = FeatureStore.pruneFeatures
export const getAvailableFeatureNames = FeatureStore.getAvailableFeatureNames

/**
 * Learning Validator - Validation with Thresholds Before Auto-Update
 * Phase 3: Auto-Learning Governed
 * KILOCLAW_PROACTIVE_CONTINUATIVE_AUTOLEARNING_PLAN_2026-04-05.md
 *
 * Implements go/no-go gates for every auto-update based on:
 * - Minimum confidence threshold
 * - Maximum delta threshold (preventing drastic changes)
 * - Safety checks
 */

import { z } from "zod"
import { Log } from "@/util/log"
import { FeatureName } from "./feature-store"
import type { UpdateResult } from "./trainer"

const log = Log.create({ service: "kiloclaw.autolearning.validator" })

// =============================================================================
// Validation Thresholds
// =============================================================================

export const ValidationThresholdsSchema = z.object({
  minConfidence: z.number().min(0).max(1).default(0.3),
  maxDelta: z.number().min(0).max(1).default(0.25),
  minSamples: z.number().int().min(1).default(3),
  safetyMaxDelta: z.number().min(0).max(1).default(0.1),
})
export type ValidationThresholds = z.infer<typeof ValidationThresholdsSchema>

// =============================================================================
// Validation Result
// =============================================================================

export const ValidationResultSchema = z.object({
  approved: z.boolean(),
  featureName: FeatureName,
  oldValue: z.number().nullable(),
  newValue: z.number(),
  delta: z.number(),
  confidence: z.number(),
  rejectionReasons: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  thresholds: ValidationThresholdsSchema,
})
export type ValidationResult = z.infer<typeof ValidationResultSchema>

// =============================================================================
// Learning Validator Namespace
// =============================================================================

export namespace LearningValidator {
  // Default thresholds
  const defaultThresholds: ValidationThresholds = {
    minConfidence: 0.3,
    maxDelta: 0.25,
    minSamples: 3,
    safetyMaxDelta: 0.1,
  }

  // Custom thresholds per tenant (would be database in production)
  const customThresholds = new Map<string, ValidationThresholds>()

  /**
   * Set custom thresholds for a tenant
   */
  export function setThresholds(tenantId: string, thresholds: ValidationThresholds): void {
    customThresholds.set(tenantId, thresholds)
    log.info("custom thresholds set", { tenantId, thresholds })
  }

  /**
   * Get thresholds for a tenant
   */
  function getThresholds(tenantId: string): ValidationThresholds {
    return customThresholds.get(tenantId) ?? defaultThresholds
  }

  /**
   * Validate if an update can be approved
   * Returns detailed ValidationResult with rejection/warning reasons
   */
  export async function validateUpdate(
    tenantId: string,
    update: UpdateResult,
    options?: {
      thresholds?: Partial<ValidationThresholds>
      skipSafetyCheck?: boolean
    },
  ): Promise<ValidationResult> {
    const thresholds = {
      ...defaultThresholds,
      ...options?.thresholds,
    }

    const rejectionReasons: string[] = []
    const warnings: string[] = []

    // Check minimum confidence
    if (update.confidence < thresholds.minConfidence) {
      rejectionReasons.push(`confidence ${update.confidence.toFixed(2)} below minimum ${thresholds.minConfidence}`)
    }

    // Check maximum delta (prevent drastic changes)
    const absDelta = Math.abs(update.delta)
    if (absDelta > thresholds.maxDelta) {
      rejectionReasons.push(`delta ${update.delta.toFixed(2)} exceeds maximum ${thresholds.maxDelta}`)
    }

    // Safety check: for safety-critical features, use stricter delta
    const safetyFeatures: FeatureName[] = ["unsafe_incident_rate", "wrong_fact_rate"]
    if (
      !options?.skipSafetyCheck &&
      safetyFeatures.includes(update.featureName) &&
      absDelta > thresholds.safetyMaxDelta
    ) {
      rejectionReasons.push(`safety delta ${update.delta.toFixed(2)} exceeds maximum ${thresholds.safetyMaxDelta}`)
    }

    // Warnings (not blocking but should be noted)
    if (update.confidence < 0.5) {
      warnings.push(`low confidence ${update.confidence.toFixed(2)} - monitor closely`)
    }

    if (absDelta > thresholds.maxDelta * 0.8) {
      warnings.push(`delta near maximum threshold - watch for oscillation`)
    }

    const approved = rejectionReasons.length === 0

    const result: ValidationResult = {
      approved,
      featureName: update.featureName,
      oldValue: update.oldValue,
      newValue: update.newValue,
      delta: update.delta,
      confidence: update.confidence,
      rejectionReasons,
      warnings,
      thresholds,
    }

    if (approved) {
      log.info("update validated and approved", {
        tenantId,
        featureName: update.featureName,
        newValue: update.newValue,
        confidence: update.confidence,
        delta: update.delta,
      })
    } else {
      log.warn("update rejected by validator", {
        tenantId,
        featureName: update.featureName,
        rejectionReasons,
      })
    }

    return result
  }

  /**
   * Validate multiple updates at once (batch validation)
   */
  export async function validateBatch(
    tenantId: string,
    updates: UpdateResult[],
    options?: {
      thresholds?: Partial<ValidationThresholds>
      requireAllApproved?: boolean
    },
  ): Promise<{
    results: ValidationResult[]
    allApproved: boolean
    approvedCount: number
    rejectedCount: number
  }> {
    const results: ValidationResult[] = []

    for (const update of updates) {
      const result = await validateUpdate(tenantId, update, options)
      results.push(result)
    }

    const approvedCount = results.filter((r) => r.approved).length
    const rejectedCount = results.length - approvedCount
    const allApproved = options?.requireAllApproved ? rejectedCount === 0 : approvedCount === results.length

    log.info("batch validation completed", {
      tenantId,
      total: results.length,
      approved: approvedCount,
      rejected: rejectedCount,
      allApproved,
    })

    return {
      results,
      allApproved,
      approvedCount,
      rejectedCount,
    }
  }

  /**
   * Validate if a canary promotion should proceed
   */
  export async function validateCanaryPromotion(
    tenantId: string,
    canaryMetrics: {
      successRate: number
      errorRate: number
      feedbackScore: number
      userAcceptance: number
    },
  ): Promise<{
    approved: boolean
    score: number
    reasons: string[]
  }> {
    const reasons: string[] = []
    let score = 0

    // Success rate check (minimum 80%)
    if (canaryMetrics.successRate >= 0.8) {
      score += 25
    } else if (canaryMetrics.successRate >= 0.6) {
      score += 10
      reasons.push(`success rate ${canaryMetrics.successRate.toFixed(2)} below optimal`)
    } else {
      reasons.push(`success rate ${canaryMetrics.successRate.toFixed(2)} too low`)
    }

    // Error rate check (maximum 5%)
    if (canaryMetrics.errorRate <= 0.05) {
      score += 25
    } else if (canaryMetrics.errorRate <= 0.1) {
      score += 10
      reasons.push(`error rate ${canaryMetrics.errorRate.toFixed(2)} elevated`)
    } else {
      reasons.push(`error rate ${canaryMetrics.errorRate.toFixed(2)} too high`)
    }

    // Feedback score check (minimum 0.6)
    if (canaryMetrics.feedbackScore >= 0.6) {
      score += 25
    } else if (canaryMetrics.feedbackScore >= 0.4) {
      score += 10
      reasons.push(`feedback score ${canaryMetrics.feedbackScore.toFixed(2)} below optimal`)
    } else {
      reasons.push(`feedback score ${canaryMetrics.feedbackScore.toFixed(2)} too low`)
    }

    // User acceptance check (minimum 50%)
    if (canaryMetrics.userAcceptance >= 0.5) {
      score += 25
    } else {
      reasons.push(`user acceptance ${canaryMetrics.userAcceptance.toFixed(2)} too low`)
    }

    const approved = score >= 70 && reasons.length === 0

    log.info("canary promotion validation", {
      tenantId,
      score,
      approved,
      reasons,
    })

    return { approved, score, reasons }
  }

  /**
   * Validate rollback safety
   */
  export async function validateRollback(
    tenantId: string,
    currentVersion: string,
    targetVersion: string,
    snapshots: Array<{ version: string; metrics: Record<string, unknown> }>,
  ): Promise<{
    approved: boolean
    safetyScore: number
    warnings: string[]
    canRollback: boolean
  }> {
    const warnings: string[] = []
    let safetyScore = 100

    // Check if target version exists
    const targetExists = snapshots.some((s) => s.version === targetVersion)
    if (!targetExists) {
      warnings.push(`target version ${targetVersion} not found in snapshots`)
      safetyScore -= 50
    }

    // Check version age (don't rollback to very old versions)
    const targetSnapshot = snapshots.find((s) => s.version === targetVersion)
    if (targetSnapshot) {
      const ageMs = Date.now() - (targetSnapshot.metrics.createdAt as number)
      const ageDays = ageMs / (24 * 60 * 60 * 1000)

      if (ageDays > 90) {
        warnings.push(`target version is ${ageDays.toFixed(0)} days old - verify compatibility`)
        safetyScore -= 20
      } else if (ageDays > 30) {
        warnings.push(`target version is ${ageDays.toFixed(0)} days old`)
        safetyScore -= 10
      }
    }

    // Check safety metrics in target
    if (targetSnapshot) {
      const unsafeRate = targetSnapshot.metrics.unsafe_incident_rate as number | undefined
      if (unsafeRate !== undefined && unsafeRate > 0.05) {
        warnings.push(`target version has elevated unsafe incident rate ${unsafeRate.toFixed(2)}`)
        safetyScore -= 30
      }
    }

    const canRollback = safetyScore >= 50 && targetExists
    const approved = canRollback && warnings.length <= 1

    log.info("rollback validation", {
      tenantId,
      currentVersion,
      targetVersion,
      safetyScore,
      canRollback,
      approved,
      warnings,
    })

    return {
      approved,
      safetyScore,
      warnings,
      canRollback,
    }
  }

  /**
   * Get current thresholds
   */
  export function getDefaultThresholds(): ValidationThresholds {
    return { ...defaultThresholds }
  }
}

// =============================================================================
// Exports
// =============================================================================

export const validateUpdate = LearningValidator.validateUpdate
export const validateBatch = LearningValidator.validateBatch
export const validateCanaryPromotion = LearningValidator.validateCanaryPromotion
export const validateRollback = LearningValidator.validateRollback
export const setThresholds = LearningValidator.setThresholds
export const getDefaultThresholds = LearningValidator.getDefaultThresholds

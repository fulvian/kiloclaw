/**
 * Canary Release - Controlled Rollout for Policy/Profile Updates
 * Phase 3: Auto-Learning Governed
 * KILOCLAW_PROACTIVE_CONTINUATIVE_AUTOLEARNING_PLAN_2026-04-05.md
 *
 * Implements controlled rollout strategy:
 * - Start with small cohort percentage
 * - Monitor metrics during evaluation period
 * - Promote or rollback based on metrics
 */

import { z } from "zod"
import { Log } from "@/util/log"

const log = Log.create({ service: "kiloclaw.autolearning.canary" })

// =============================================================================
// Canary Types
// =============================================================================

export const CanaryStatus = z.enum(["running", "promoted", "rollback", "failed"])
export type CanaryStatus = z.infer<typeof CanaryStatus>

export const CanaryUpdateType = z.enum([
  "policy_update",
  "profile_update",
  "procedure_update",
  "retrieval_update",
  "proactive_update",
])
export type CanaryUpdateType = z.infer<typeof CanaryUpdateType>

export const CanaryRunSchema = z.object({
  id: z.string(),
  tenantId: z.string().min(1),
  updateType: CanaryUpdateType,
  cohortPercent: z.number().int().min(1).max(100).default(10),
  status: CanaryStatus.default("running"),
  startedAt: z.number().int().positive(),
  completedAt: z.number().int().positive().nullable(),
  metricsJson: z.record(z.string(), z.unknown()).nullable(),
  targetVersion: z.string().optional(),
  previousVersion: z.string().optional(),
})
export type CanaryRun = z.infer<typeof CanaryRunSchema>

// =============================================================================
// Canary Metrics
// =============================================================================

export const CanaryMetricsSchema = z.object({
  totalRequests: z.number().int().nonnegative().default(0),
  successCount: z.number().int().nonnegative().default(0),
  errorCount: z.number().int().nonnegative().default(0),
  userFeedbackCount: z.number().int().nonnegative().default(0),
  positiveFeedbackCount: z.number().int().nonnegative().default(0),
  negativeFeedbackCount: z.number().int().nonnegative().default(0),
  avgResponseTimeMs: z.number().nonnegative().default(0),
  p99ResponseTimeMs: z.number().nonnegative().default(0),
})
export type CanaryMetrics = z.infer<typeof CanaryMetricsSchema>

// =============================================================================
// Canary Release Namespace
// =============================================================================

export namespace CanaryRelease {
  // Store for canary runs (would be database in production)
  const canaryRuns = new Map<string, CanaryRun>()
  const cohortAssignments = new Map<string, Set<string>>() // canaryId -> Set<userId>

  /**
   * Start a new canary release
   * Selects a random cohort of users for testing
   */
  export async function startCanary(
    tenantId: string,
    updateType: CanaryUpdateType,
    options?: {
      cohortPercent?: number
      targetVersion?: string
      previousVersion?: string
    },
  ): Promise<CanaryRun> {
    const canaryId = crypto.randomUUID()
    const cohortPercent = options?.cohortPercent ?? 10

    const canary: CanaryRun = {
      id: canaryId,
      tenantId,
      updateType,
      cohortPercent,
      status: "running",
      startedAt: Date.now(),
      completedAt: null,
      metricsJson: getEmptyMetrics(),
      targetVersion: options?.targetVersion,
      previousVersion: options?.previousVersion,
    }

    canaryRuns.set(canaryId, canary)

    // Initialize cohort assignment (in production, this would query user store)
    cohortAssignments.set(canaryId, new Set())

    log.info("canary release started", {
      canaryId,
      tenantId,
      updateType,
      cohortPercent,
      targetVersion: options?.targetVersion,
    })

    return canary
  }

  /**
   * Assign a user to a canary cohort
   */
  export function assignToCohort(canaryId: string, userId: string): boolean {
    const cohort = cohortAssignments.get(canaryId)
    if (!cohort) return false

    cohort.add(userId)
    return true
  }

  /**
   * Check if a user is in the canary cohort
   */
  export function isInCohort(canaryId: string, userId: string): boolean {
    const cohort = cohortAssignments.get(canaryId)
    return cohort?.has(userId) ?? false
  }

  /**
   * Record a request/response through the canary
   */
  export async function recordCanaryHit(canaryId: string, metrics: Partial<CanaryMetrics>): Promise<void> {
    const canary = canaryRuns.get(canaryId)
    if (!canary) return

    const current = (canary.metricsJson as CanaryMetrics) ?? getEmptyMetrics()

    canary.metricsJson = {
      totalRequests: current.totalRequests + (metrics.totalRequests ?? 0),
      successCount: current.successCount + (metrics.successCount ?? 0),
      errorCount: current.errorCount + (metrics.errorCount ?? 0),
      userFeedbackCount: current.userFeedbackCount + (metrics.userFeedbackCount ?? 0),
      positiveFeedbackCount: current.positiveFeedbackCount + (metrics.positiveFeedbackCount ?? 0),
      negativeFeedbackCount: current.negativeFeedbackCount + (metrics.negativeFeedbackCount ?? 0),
      avgResponseTimeMs:
        (current.avgResponseTimeMs * current.totalRequests + (metrics.avgResponseTimeMs ?? 0)) /
        (current.totalRequests + 1),
      p99ResponseTimeMs: Math.max(current.p99ResponseTimeMs, metrics.p99ResponseTimeMs ?? 0),
    }

    canaryRuns.set(canaryId, canary)
  }

  /**
   * Evaluate canary metrics to decide promote/rollback
   */
  export async function evaluateCanary(canaryId: string): Promise<{
    status: CanaryStatus
    successRate: number
    errorRate: number
    feedbackScore: number
    userAcceptance: number
    recommendation: "promote" | "rollback" | "continue"
  }> {
    const canary = canaryRuns.get(canaryId)
    if (!canary) {
      throw new Error(`canary ${canaryId} not found`)
    }

    const metrics = (canary.metricsJson as CanaryMetrics) ?? getEmptyMetrics()

    const successRate = metrics.totalRequests > 0 ? metrics.successCount / metrics.totalRequests : 0
    const errorRate = metrics.totalRequests > 0 ? metrics.errorCount / metrics.totalRequests : 0
    const feedbackScore =
      metrics.userFeedbackCount > 0 ? metrics.positiveFeedbackCount / metrics.userFeedbackCount : 0.5
    const userAcceptance =
      metrics.userFeedbackCount > 0
        ? (metrics.positiveFeedbackCount - metrics.negativeFeedbackCount * 0.5) / metrics.userFeedbackCount
        : 0.5

    // Decision logic
    let recommendation: "promote" | "rollback" | "continue" = "continue"
    let status: CanaryStatus = "running"

    // Promote if metrics are good after minimum time
    const minDurationMs = 5 * 60 * 1000 // 5 minutes minimum
    const elapsedMs = Date.now() - canary.startedAt
    const hasMinimumData = metrics.totalRequests >= 10

    if (hasMinimumData && elapsedMs >= minDurationMs) {
      if (successRate >= 0.9 && errorRate <= 0.05 && feedbackScore >= 0.7) {
        recommendation = "promote"
        status = "promoted"
      } else if (successRate < 0.7 || errorRate > 0.15 || feedbackScore < 0.3) {
        recommendation = "rollback"
        status = "rollback"
      }
    }

    log.info("canary evaluated", {
      canaryId,
      successRate,
      errorRate,
      feedbackScore,
      userAcceptance,
      recommendation,
      totalRequests: metrics.totalRequests,
      elapsedMs,
    })

    return {
      status,
      successRate,
      errorRate,
      feedbackScore,
      userAcceptance,
      recommendation,
    }
  }

  /**
   * Promote canary (make update available to all users)
   */
  export async function promoteCanary(canaryId: string): Promise<CanaryRun> {
    const canary = canaryRuns.get(canaryId)
    if (!canary) throw new Error(`canary ${canaryId} not found`)

    canary.status = "promoted"
    canary.completedAt = Date.now()
    canaryRuns.set(canaryId, canary)

    log.info("canary promoted", {
      canaryId,
      tenantId: canary.tenantId,
      durationMs: canary.completedAt - canary.startedAt,
    })

    return canary
  }

  /**
   * Rollback canary (revert to previous version)
   */
  export async function rollbackCanary(canaryId: string): Promise<CanaryRun> {
    const canary = canaryRuns.get(canaryId)
    if (!canary) throw new Error(`canary ${canaryId} not found`)

    canary.status = "rollback"
    canary.completedAt = Date.now()
    canaryRuns.set(canaryId, canary)

    // Cleanup cohort
    cohortAssignments.delete(canaryId)

    log.info("canary rolled back", {
      canaryId,
      tenantId: canary.tenantId,
      durationMs: canary.completedAt - canary.startedAt,
    })

    return canary
  }

  /**
   * Get canary run by ID
   */
  export async function getCanary(canaryId: string): Promise<CanaryRun | null> {
    return canaryRuns.get(canaryId) ?? null
  }

  /**
   * Get active canary for a tenant
   */
  export async function getActiveCanary(tenantId: string): Promise<CanaryRun | null> {
    for (const canary of canaryRuns.values()) {
      if (canary.tenantId === tenantId && canary.status === "running") {
        return canary
      }
    }
    return null
  }

  /**
   * Get canary history for a tenant
   */
  export async function getCanaryHistory(tenantId: string, limit: number = 10): Promise<CanaryRun[]> {
    const tenantCanaries: CanaryRun[] = []

    for (const canary of canaryRuns.values()) {
      if (canary.tenantId === tenantId) {
        tenantCanaries.push(canary)
      }
    }

    // Sort by startedAt descending
    tenantCanaries.sort((a, b) => b.startedAt - a.startedAt)

    return tenantCanaries.slice(0, limit)
  }

  /**
   * Get empty metrics object
   */
  function getEmptyMetrics(): CanaryMetrics {
    return {
      totalRequests: 0,
      successCount: 0,
      errorCount: 0,
      userFeedbackCount: 0,
      positiveFeedbackCount: 0,
      negativeFeedbackCount: 0,
      avgResponseTimeMs: 0,
      p99ResponseTimeMs: 0,
    }
  }

  /**
   * Cleanup old canary runs
   */
  export async function pruneOldCanaries(retentionDays: number = 30): Promise<number> {
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
    let pruned = 0

    for (const [canaryId, canary] of canaryRuns.entries()) {
      if (canary.completedAt && canary.completedAt < cutoff) {
        canaryRuns.delete(canaryId)
        cohortAssignments.delete(canaryId)
        pruned++
      }
    }

    log.info("old canary runs pruned", { pruned, retentionDays })

    return pruned
  }
}

// =============================================================================
// Exports
// =============================================================================

export const startCanary = CanaryRelease.startCanary
export const assignToCohort = CanaryRelease.assignToCohort
export const isInCohort = CanaryRelease.isInCohort
export const recordCanaryHit = CanaryRelease.recordCanaryHit
export const evaluateCanary = CanaryRelease.evaluateCanary
export const promoteCanary = CanaryRelease.promoteCanary
export const rollbackCanary = CanaryRelease.rollbackCanary
export const getCanary = CanaryRelease.getCanary
export const getActiveCanary = CanaryRelease.getActiveCanary
export const getCanaryHistory = CanaryRelease.getCanaryHistory
export const pruneOldCanaries = CanaryRelease.pruneOldCanaries

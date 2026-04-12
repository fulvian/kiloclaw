/**
 * Learning Telemetry - Metrics for Auto-Learning System
 * Phase 5: Eval/Observability/Operations
 * KILOCLAW_PROACTIVE_CONTINUATIVE_AUTOLEARNING_PLAN_2026-04-05.md
 *
 * Provides metrics computed from learning_drift_events and feedback:
 * - taskSatisfactionDelta: variation in satisfaction
 * - irrelevanceFeedbackDelta: variation in irrelevance
 * - unsafeIncidentRate: unsafe incidents / total
 * - driftDetectedRate: drift events / check cycles
 * - rollbackCount: number of rollbacks
 */

import { z } from "zod"
import { Log } from "@/util/log"
import type { DriftEvent } from "../autolearning/drift"

const log = Log.create({ service: "kilocclaw.telemetry.learning" })

// =============================================================================
// Drift Types (aligned with autolearning/drift.ts)
// =============================================================================

export const DriftType = z.enum(["accuracy", "relevance", "safety"])
export type DriftType = z.infer<typeof DriftType>

export const DriftSeverity = z.enum(["low", "medium", "high", "critical"])
export type DriftSeverity = z.infer<typeof DriftSeverity>

// =============================================================================
// Metric Schemas
// =============================================================================

export const SatisfactionDeltaSchema = z.object({
  currentValue: z.number(),
  previousValue: z.number(),
  delta: z.number(),
  deltaPercent: z.number(),
  direction: z.enum(["improving", "degrading", "stable"]),
})
export type SatisfactionDelta = z.infer<typeof SatisfactionDeltaSchema>

export const IrrelevanceDeltaSchema = z.object({
  currentValue: z.number(),
  previousValue: z.number(),
  delta: z.number(),
  deltaPercent: z.number(),
  direction: z.enum(["improving", "degrading", "stable"]),
})
export type IrrelevanceDelta = z.infer<typeof IrrelevanceDeltaSchema>

export const UnsafeIncidentRateSchema = z.object({
  totalIncidents: z.number().int().nonnegative(),
  unsafeIncidents: z.number().int().nonnegative(),
  rate: z.number().min(0).max(1),
})
export type UnsafeIncidentRate = z.infer<typeof UnsafeIncidentRateSchema>

export const DriftDetectedRateSchema = z.object({
  totalCheckCycles: z.number().int().nonnegative(),
  driftEvents: z.number().int().nonnegative(),
  rate: z.number().min(0).max(1),
})
export type DriftDetectedRate = z.infer<typeof DriftDetectedRateSchema>

export const RollbackCountSchema = z.object({
  totalRollbacks: z.number().int().nonnegative(),
  automaticRollbacks: z.number().int().nonnegative(),
  manualRollbacks: z.number().int().nonnegative(),
})
export type RollbackCount = z.infer<typeof RollbackCountSchema>

// =============================================================================
// LearningMetrics Namespace
// =============================================================================

export namespace LearningMetrics {
  // Internal state for tracking
  const rollbackState = {
    totalRollbacks: 0,
    automaticRollbacks: 0,
    manualRollbacks: 0,
  }

  /**
   * Record a rollback occurrence
   */
  export function recordRollback(automatic: boolean): void {
    rollbackState.totalRollbacks++
    if (automatic) {
      rollbackState.automaticRollbacks++
    } else {
      rollbackState.manualRollbacks++
    }
    log.info("rollback recorded", { automatic, total: rollbackState.totalRollbacks })
  }

  /**
   * Calculate task satisfaction delta from feedback
   * Satisfaction is derived from upvote rate
   */
  export function calculateSatisfactionDelta(
    currentUpvotes: number,
    currentTotal: number,
    previousUpvotes: number,
    previousTotal: number,
  ): SatisfactionDelta {
    const currentValue = currentTotal > 0 ? currentUpvotes / currentTotal : 0
    const previousValue = previousTotal > 0 ? previousUpvotes / previousTotal : 0
    const delta = currentValue - previousValue
    const deltaPercent = previousValue > 0 ? delta / previousValue : 0

    let direction: "improving" | "degrading" | "stable" = "stable"
    if (delta > 0.01) direction = "improving"
    else if (delta < -0.01) direction = "degrading"

    return {
      currentValue,
      previousValue,
      delta,
      deltaPercent,
      direction,
    }
  }

  /**
   * Calculate irrelevance feedback delta
   */
  export function calculateIrrelevanceDelta(
    currentIrrelevant: number,
    currentTotal: number,
    previousIrrelevant: number,
    previousTotal: number,
  ): IrrelevanceDelta {
    const currentValue = currentTotal > 0 ? currentIrrelevant / currentTotal : 0
    const previousValue = previousTotal > 0 ? previousIrrelevant / previousTotal : 0
    const delta = currentValue - previousValue
    const deltaPercent = previousValue > 0 ? delta / previousValue : 0

    // For irrelevance, lower is better
    let direction: "improving" | "degrading" | "stable" = "stable"
    if (delta < -0.01) direction = "improving"
    else if (delta > 0.01) direction = "degrading"

    return {
      currentValue,
      previousValue,
      delta,
      deltaPercent,
      direction,
    }
  }

  /**
   * Calculate unsafe incident rate from drift events
   */
  export function calculateUnsafeIncidentRate(driftEvents: DriftEvent[]): UnsafeIncidentRate {
    const totalIncidents = driftEvents.length
    const unsafeIncidents = driftEvents.filter((e) => e.driftType === "safety").length
    const rate = totalIncidents > 0 ? unsafeIncidents / totalIncidents : 0

    return {
      totalIncidents,
      unsafeIncidents,
      rate,
    }
  }

  /**
   * Calculate drift detected rate
   * Drift rate = drift events / check cycles
   */
  export function calculateDriftDetectedRate(driftEvents: DriftEvent[], checkCycles: number): DriftDetectedRate {
    const driftCount = driftEvents.length
    const rate = checkCycles > 0 ? driftCount / checkCycles : 0

    return {
      totalCheckCycles: checkCycles,
      driftEvents: driftCount,
      rate,
    }
  }

  /**
   * Get rollback counts
   */
  export function getRollbackCount(): RollbackCount {
    return {
      totalRollbacks: rollbackState.totalRollbacks,
      automaticRollbacks: rollbackState.automaticRollbacks,
      manualRollbacks: rollbackState.manualRollbacks,
    }
  }

  /**
   * Reset rollback counts (for testing)
   */
  export function resetRollbackCount(): void {
    rollbackState.totalRollbacks = 0
    rollbackState.automaticRollbacks = 0
    rollbackState.manualRollbacks = 0
  }

  /**
   * Get all learning metrics
   */
  export function getMetrics(input: {
    currentUpvotes: number
    currentTotal: number
    previousUpvotes: number
    previousTotal: number
    currentIrrelevant: number
    previousIrrelevant: number
    driftEvents: DriftEvent[]
    checkCycles: number
  }): {
    taskSatisfactionDelta: SatisfactionDelta
    irrelevanceFeedbackDelta: IrrelevanceDelta
    unsafeIncidentRate: UnsafeIncidentRate
    driftDetectedRate: DriftDetectedRate
    rollbackCount: RollbackCount
  } {
    return {
      taskSatisfactionDelta: calculateSatisfactionDelta(
        input.currentUpvotes,
        input.currentTotal,
        input.previousUpvotes,
        input.previousTotal,
      ),
      irrelevanceFeedbackDelta: calculateIrrelevanceDelta(
        input.currentIrrelevant,
        input.currentTotal,
        input.previousIrrelevant,
        input.previousTotal,
      ),
      unsafeIncidentRate: calculateUnsafeIncidentRate(input.driftEvents),
      driftDetectedRate: calculateDriftDetectedRate(input.driftEvents, input.checkCycles),
      rollbackCount: getRollbackCount(),
    }
  }
}

// =============================================================================
// Exports
// =============================================================================

export const calculateSatisfactionDelta = LearningMetrics.calculateSatisfactionDelta
export const calculateIrrelevanceDelta = LearningMetrics.calculateIrrelevanceDelta
export const calculateUnsafeIncidentRate = LearningMetrics.calculateUnsafeIncidentRate
export const calculateDriftDetectedRate = LearningMetrics.calculateDriftDetectedRate
export const recordRollback = LearningMetrics.recordRollback
export const getRollbackCount = LearningMetrics.getRollbackCount
export const getLearningMetrics = LearningMetrics.getMetrics

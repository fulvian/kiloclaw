/**
 * Drift Detector - Detection of Accuracy/Relevance/Safety Drift
 * Phase 3: Auto-Learning Governed
 * KILOCLAW_PROACTIVE_CONTINUATIVE_AUTOLEARNING_PLAN_2026-04-05.md
 *
 * Monitors for:
 * - Accuracy drift (wrong_fact rate increase)
 * - Relevance drift (irrelevant rate increase)
 * - Safety drift (unsafe incidents)
 */

import { z } from "zod"
import { Log } from "@/util/log"
import { FeatureName } from "./feature-store"

const log = Log.create({ service: "kiloclaw.autolearning.drift" })

// =============================================================================
// Drift Types
// =============================================================================

export const DriftType = z.enum(["accuracy", "relevance", "safety"])
export type DriftType = z.infer<typeof DriftType>

export const DriftSeverity = z.enum(["low", "medium", "high", "critical"])
export type DriftSeverity = z.infer<typeof DriftSeverity>

export const DriftEventSchema = z.object({
  id: z.string(),
  tenantId: z.string().min(1),
  driftType: DriftType,
  severity: DriftSeverity,
  detectedAt: z.number().int().positive(),
  actionTaken: z.string().nullable(),
  resolvedAt: z.number().int().positive().nullable(),
})
export type DriftEvent = z.infer<typeof DriftEventSchema>

export const DriftReportSchema = z.object({
  tenantId: z.string(),
  timestamp: z.number().int().positive(),
  drifts: z.array(
    z.object({
      type: DriftType,
      severity: DriftSeverity,
      currentValue: z.number(),
      baselineValue: z.number(),
      delta: z.number(),
      deltaPercent: z.number(),
      trend: z.array(z.number()),
      shouldAlert: z.boolean(),
      recommendation: z.string(),
    }),
  ),
  overallRiskLevel: DriftSeverity,
  requiresAction: z.boolean(),
})
export type DriftReport = z.infer<typeof DriftReportSchema>

// =============================================================================
// Drift Thresholds
// =============================================================================

export const DriftThresholdsSchema = z.object({
  accuracy: z.object({
    warningDelta: z.number().default(0.15), // 15% increase
    criticalDelta: z.number().default(0.3), // 30% increase
    windowHours: z.number().default(24),
  }),
  relevance: z.object({
    warningDelta: z.number().default(0.2), // 20% increase
    criticalDelta: z.number().default(0.4), // 40% increase
    windowHours: z.number().default(24),
  }),
  safety: z.object({
    warningDelta: z.number().default(0.05), // 5% increase (very sensitive)
    criticalDelta: z.number().default(0.1), // 10% increase
    windowHours: z.number().default(1), // 1 hour for safety
  }),
})
export type DriftThresholds = z.infer<typeof DriftThresholdsSchema>

// =============================================================================
// Drift Detector Namespace
// =============================================================================

export namespace DriftDetector {
  // Store for drift events
  const driftEvents: DriftEvent[] = []

  // Baseline values per tenant (would be database in production)
  const baselines = new Map<string, Map<DriftType, number>>()

  // Trend history per tenant
  const trends = new Map<string, Map<DriftType, number[]>>()

  // Default thresholds
  const defaultThresholds: DriftThresholds = {
    accuracy: { warningDelta: 0.15, criticalDelta: 0.3, windowHours: 24 },
    relevance: { warningDelta: 0.2, criticalDelta: 0.4, windowHours: 24 },
    safety: { warningDelta: 0.05, criticalDelta: 0.1, windowHours: 1 },
  }

  /**
   * Set baseline value for a tenant
   */
  export function setBaseline(tenantId: string, driftType: DriftType, value: number): void {
    const tenantBaselines = baselines.get(tenantId) ?? new Map()
    tenantBaselines.set(driftType, value)
    baselines.set(tenantId, tenantBaselines)

    // Initialize trend with baseline
    const tenantTrends = trends.get(tenantId) ?? new Map()
    const typeTrends = tenantTrends.get(driftType) ?? [value]
    tenantTrends.set(driftType, typeTrends)
    trends.set(tenantId, tenantTrends)

    log.info("drift baseline set", { tenantId, driftType, value })
  }

  /**
   * Get baseline value for a tenant
   */
  function getBaseline(tenantId: string, driftType: DriftType): number {
    const tenantBaselines = baselines.get(tenantId)
    if (!tenantBaselines) return 0

    switch (driftType) {
      case "accuracy":
        return tenantBaselines.get("accuracy") ?? 0.1 // Default 10%
      case "relevance":
        return tenantBaselines.get("relevance") ?? 0.15 // Default 15%
      case "safety":
        return tenantBaselines.get("safety") ?? 0.01 // Default 1%
    }
  }

  /**
   * Get trend for a tenant/drift type
   */
  function getTrend(tenantId: string, driftType: DriftType): number[] {
    const tenantTrends = trends.get(tenantId)
    return tenantTrends?.get(driftType) ?? []
  }

  /**
   * Update trend with new value
   */
  function updateTrend(tenantId: string, driftType: DriftType, value: number): void {
    const tenantTrends = trends.get(tenantId) ?? new Map()
    const typeTrends = tenantTrends.get(driftType) ?? []

    // Keep last 10 values
    typeTrends.push(value)
    if (typeTrends.length > 10) {
      typeTrends.shift()
    }

    tenantTrends.set(driftType, typeTrends)
    trends.set(tenantId, tenantTrends)
  }

  /**
   * Record current metric values and detect drift
   */
  export async function recordMetrics(
    tenantId: string,
    metrics: {
      wrongFactRate?: number
      irrelevantRate?: number
      unsafeIncidentRate?: number
    },
  ): Promise<DriftReport> {
    const now = Date.now()
    const drifts: DriftReport["drifts"] = []

    // Check accuracy drift
    if (metrics.wrongFactRate !== undefined) {
      updateTrend(tenantId, "accuracy", metrics.wrongFactRate)
      const baseline = getBaseline(tenantId, "accuracy")
      const drift = analyzeDrift("accuracy", metrics.wrongFactRate, baseline, getTrend(tenantId, "accuracy"))
      if (drift) drifts.push(drift)
    }

    // Check relevance drift
    if (metrics.irrelevantRate !== undefined) {
      updateTrend(tenantId, "relevance", metrics.irrelevantRate)
      const baseline = getBaseline(tenantId, "relevance")
      const drift = analyzeDrift("relevance", metrics.irrelevantRate, baseline, getTrend(tenantId, "relevance"))
      if (drift) drifts.push(drift)
    }

    // Check safety drift
    if (metrics.unsafeIncidentRate !== undefined) {
      updateTrend(tenantId, "safety", metrics.unsafeIncidentRate)
      const baseline = getBaseline(tenantId, "safety")
      const drift = analyzeDrift("safety", metrics.unsafeIncidentRate, baseline, getTrend(tenantId, "safety"))
      if (drift) drifts.push(drift)
    }

    // Determine overall risk level
    let overallRiskLevel: DriftSeverity = "low"
    if (drifts.some((d) => d.severity === "critical")) {
      overallRiskLevel = "critical"
    } else if (drifts.some((d) => d.severity === "high")) {
      overallRiskLevel = "high"
    } else if (drifts.some((d) => d.severity === "medium")) {
      overallRiskLevel = "medium"
    }

    const report: DriftReport = {
      tenantId,
      timestamp: now,
      drifts,
      overallRiskLevel,
      requiresAction: drifts.some((d) => d.shouldAlert),
    }

    // Log significant drifts
    if (drifts.length > 0) {
      log.warn("drift detected", {
        tenantId,
        driftCount: drifts.length,
        overallRiskLevel,
        requiresAction: report.requiresAction,
      })
    }

    return report
  }

  /**
   * Analyze drift for a specific type
   */
  function analyzeDrift(
    type: DriftType,
    currentValue: number,
    baselineValue: number,
    trend: number[],
  ): DriftReport["drifts"][0] | null {
    const delta = currentValue - baselineValue
    const deltaPercent = baselineValue > 0 ? delta / baselineValue : 0

    const thresholds = defaultThresholds[type]

    // Determine severity
    let severity: DriftSeverity = "low"
    let shouldAlert = false
    let recommendation = ""

    if (type === "safety") {
      // Safety is more sensitive
      if (delta >= thresholds.criticalDelta) {
        severity = "critical"
        shouldAlert = true
        recommendation = "Immediate investigation required - potential safety issue"
      } else if (delta >= thresholds.warningDelta) {
        severity = "high"
        shouldAlert = true
        recommendation = "Safety metric degraded - monitor closely"
      }
    } else {
      if (deltaPercent >= thresholds.criticalDelta) {
        severity = "high"
        shouldAlert = true
        recommendation = `Significant ${type} degradation detected - consider rollback`
      } else if (deltaPercent >= thresholds.warningDelta) {
        severity = "medium"
        shouldAlert = true
        recommendation = `${type} metric elevated - watch for continued degradation`
      }
    }

    // Check for consistent negative trend
    if (trend.length >= 3) {
      const recentTrend = trend.slice(-3)
      const isDeclining = recentTrend.every((v, i) => i === 0 || v <= recentTrend[i - 1])
      if (isDeclining && delta > 0) {
        severity = severity === "low" ? "medium" : severity
        shouldAlert = shouldAlert || (severity !== "critical" && isDeclining)
      }
    }

    // Only return if there's actual drift
    if (!shouldAlert && Math.abs(delta) < 0.01) {
      return null
    }

    return {
      type,
      severity,
      currentValue,
      baselineValue,
      delta,
      deltaPercent,
      trend: [...trend],
      shouldAlert,
      recommendation,
    }
  }

  /**
   * Detect drift for a tenant
   */
  export async function detectDrift(
    tenantId: string,
    currentMetrics: {
      wrongFactRate?: number
      irrelevantRate?: number
      unsafeIncidentRate?: number
    },
  ): Promise<DriftReport> {
    return recordMetrics(tenantId, currentMetrics)
  }

  /**
   * Create a drift event (record that drift was detected and action taken)
   */
  export async function createDriftEvent(
    tenantId: string,
    driftType: DriftType,
    severity: DriftSeverity,
    actionTaken: string,
  ): Promise<DriftEvent> {
    const event: DriftEvent = {
      id: crypto.randomUUID(),
      tenantId,
      driftType,
      severity,
      detectedAt: Date.now(),
      actionTaken,
      resolvedAt: null,
    }

    driftEvents.push(event)

    log.info("drift event created", {
      tenantId,
      driftType,
      severity,
      actionTaken,
    })

    return event
  }

  /**
   * Resolve a drift event
   */
  export async function resolveDriftEvent(eventId: string): Promise<void> {
    const event = driftEvents.find((e) => e.id === eventId)
    if (!event) return

    event.resolvedAt = Date.now()

    log.info("drift event resolved", {
      eventId,
      tenantId: event.tenantId,
      durationMs: event.resolvedAt - event.detectedAt,
    })
  }

  /**
   * Get drift events for a tenant
   */
  export async function getDriftEvents(
    tenantId: string,
    options?: {
      unresolvedOnly?: boolean
      limit?: number
    },
  ): Promise<DriftEvent[]> {
    let events = driftEvents.filter((e) => e.tenantId === tenantId)

    if (options?.unresolvedOnly) {
      events = events.filter((e) => e.resolvedAt === null)
    }

    // Sort by detectedAt descending
    events.sort((a, b) => b.detectedAt - a.detectedAt)

    if (options?.limit) {
      events = events.slice(0, options.limit)
    }

    return events
  }

  /**
   * Get current thresholds
   */
  export function getThresholds(): DriftThresholds {
    return { ...defaultThresholds }
  }

  /**
   * Update thresholds
   */
  export function updateThresholds(tenantId: string, newThresholds: Partial<DriftThresholds>): void {
    // In production, would store per-tenant thresholds
    log.info("drift thresholds updated", { tenantId, newThresholds })
  }

  /**
   * Reset baseline to current values
   */
  export function resetBaseline(tenantId: string): void {
    baselines.delete(tenantId)
    trends.delete(tenantId)
    log.info("drift baselines reset", { tenantId })
  }
}

// =============================================================================
// Exports
// =============================================================================

export const detectDrift = DriftDetector.detectDrift
export const recordMetrics = DriftDetector.recordMetrics
export const createDriftEvent = DriftDetector.createDriftEvent
export const resolveDriftEvent = DriftDetector.resolveDriftEvent
export const getDriftEvents = DriftDetector.getDriftEvents
export const setBaseline = DriftDetector.setBaseline
export const getThresholds = DriftDetector.getThresholds
export const updateThresholds = DriftDetector.updateThresholds
export const resetBaseline = DriftDetector.resetBaseline

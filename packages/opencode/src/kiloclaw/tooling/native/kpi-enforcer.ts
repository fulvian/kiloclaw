/**
 * KPI Enforcer - Tracks native vs MCP fallback ratios and enforces thresholds
 * Onda 5: Parity Hardening
 * KILOCLAW_DEVELOPMENT_AGENCY_REFOUNDATION_PLAN_2026-04-12.md
 *
 * KPI Targets:
 * - Native execution ratio: >= 90%
 * - MCP fallback ratio: <= 10%
 * - P0/P1 regressions: 0
 */

import z from "zod"

export const KpiStatus = z.enum(["ok", "warning", "critical", "blocked"])
export type KpiStatus = z.infer<typeof KpiStatus>

export const KpiThresholds = z.object({
  nativeMinRatio: z.number().min(0).max(1).default(0.9),
  fallbackMaxRatio: z.number().min(0).max(1).default(0.1),
  windowSize: z.number().int().positive().default(100), // rolling window size
})
export type KpiThresholds = z.infer<typeof KpiThresholds>

export const KpiSnapshot = z.object({
  nativeCalls: z.number().int().nonnegative(),
  fallbackCalls: z.number().int().nonnegative(),
  totalCalls: z.number().int().nonnegative(),
  nativeRatio: z.number().min(0).max(1),
  fallbackRatio: z.number().min(0).max(1),
  status: KpiStatus,
  ts: z.number().int().nonnegative(),
})
export type KpiSnapshot = z.infer<typeof KpiSnapshot>

export const KpiAlert = z.object({
  event: z.literal("kpi_alert"),
  status: KpiStatus,
  nativeRatio: z.number().min(0).max(1),
  fallbackRatio: z.number().min(0).max(1),
  threshold: z.string(), // "nativeMinRatio" | "fallbackMaxRatio"
  message: z.string(),
  ts: z.number().int().nonnegative(),
})
export type KpiAlert = z.infer<typeof KpiAlert>

let _instance: { snapshot: KpiSnapshot; thresholds: KpiThresholds; alerts: KpiAlert[] } | undefined

export namespace KpiEnforcer {
  export function init(thresholds?: Partial<KpiThresholds>): void {
    // If already initialized, only update thresholds if explicitly provided
    if (_instance && thresholds === undefined) return
    const t = KpiThresholds.parse(thresholds ?? {})
    _instance = {
      snapshot: {
        nativeCalls: 0,
        fallbackCalls: 0,
        totalCalls: 0,
        nativeRatio: 0,
        fallbackRatio: 0,
        status: "ok",
        ts: Date.now(),
      },
      thresholds: t,
      alerts: [],
    }
  }

  export function recordNative(): KpiSnapshot {
    ensure()
    const s = _instance!
    s.snapshot.nativeCalls++
    s.snapshot.totalCalls++
    s.snapshot.nativeRatio = s.snapshot.nativeCalls / s.snapshot.totalCalls
    s.snapshot.fallbackRatio = s.snapshot.fallbackCalls / s.snapshot.totalCalls
    s.snapshot.ts = Date.now()
    updateStatus()
    return { ...s.snapshot }
  }

  export function recordFallback(): KpiSnapshot {
    ensure()
    const s = _instance!
    s.snapshot.fallbackCalls++
    s.snapshot.totalCalls++
    s.snapshot.nativeRatio = s.snapshot.nativeCalls / s.snapshot.totalCalls
    s.snapshot.fallbackRatio = s.snapshot.fallbackCalls / s.snapshot.totalCalls
    s.snapshot.ts = Date.now()
    const alert = checkThreshold()
    if (alert) {
      s.alerts.push(alert)
    }
    updateStatus()
    return { ...s.snapshot }
  }

  export function getSnapshot(): KpiSnapshot {
    ensure()
    return { ..._instance!.snapshot }
  }

  export function getAlerts(): KpiAlert[] {
    ensure()
    return [..._instance!.alerts]
  }

  export function getThresholds(): KpiThresholds {
    ensure()
    return { ..._instance!.thresholds }
  }

  export function shouldBlock(): boolean {
    ensure()
    return _instance!.snapshot.status === "blocked"
  }

  export function reset(): void {
    if (_instance) {
      _instance.snapshot = {
        nativeCalls: 0,
        fallbackCalls: 0,
        totalCalls: 0,
        nativeRatio: 0,
        fallbackRatio: 0,
        status: "ok",
        ts: Date.now(),
      }
      _instance.alerts = []
    }
  }

  function ensure(): void {
    if (!_instance) init()
  }

  function updateStatus(): void {
    const s = _instance!
    const { nativeRatio, fallbackRatio } = s.snapshot
    const { nativeMinRatio, fallbackMaxRatio } = s.thresholds

    if (nativeRatio >= nativeMinRatio && fallbackRatio <= fallbackMaxRatio) {
      s.snapshot.status = "ok"
    } else if (nativeRatio >= nativeMinRatio * 0.95 && fallbackRatio <= fallbackMaxRatio * 1.5) {
      s.snapshot.status = "warning"
    } else if (nativeRatio >= nativeMinRatio * 0.8 && fallbackRatio <= fallbackMaxRatio * 2) {
      s.snapshot.status = "critical"
    } else {
      s.snapshot.status = "blocked"
    }
  }

  function checkThreshold(): KpiAlert | undefined {
    const s = _instance!
    const { nativeRatio, fallbackRatio } = s.snapshot
    const { nativeMinRatio, fallbackMaxRatio } = s.thresholds

    if (nativeRatio < nativeMinRatio) {
      return KpiAlert.parse({
        event: "kpi_alert",
        status: s.snapshot.status,
        nativeRatio,
        fallbackRatio,
        threshold: "nativeMinRatio",
        message: `Native ratio ${(nativeRatio * 100).toFixed(1)}% below threshold ${(nativeMinRatio * 100).toFixed(1)}%`,
        ts: Date.now(),
      })
    }
    if (fallbackRatio > fallbackMaxRatio) {
      return KpiAlert.parse({
        event: "kpi_alert",
        status: s.snapshot.status,
        nativeRatio,
        fallbackRatio,
        threshold: "fallbackMaxRatio",
        message: `Fallback ratio ${(fallbackRatio * 100).toFixed(1)}% above threshold ${(fallbackMaxRatio * 100).toFixed(1)}%`,
        ts: Date.now(),
      })
    }
    return undefined
  }
}

/**
 * Daemon Runtime Types
 */

import z from "zod"

// =============================================================================
// Feature flags
// =============================================================================

export const DaemonFeatureFlagsSchema = z.object({
  runtimeEnabled: z.boolean().default(true),
  executionEnabled: z.boolean().default(false),
  leaseRequired: z.boolean().default(false),
  misfireMode: z.enum(["skip", "catchup_one", "catchup_all"]).default("catchup_one"),
})

export type DaemonFeatureFlags = z.infer<typeof DaemonFeatureFlagsSchema>

// =============================================================================
// Environment config
// =============================================================================

export const DaemonConfigSchema = z.object({
  /** Lease TTL in milliseconds */
  leaseTtlMs: z.number().int().positive().default(30000),
  /** How often to renew the lease (as fraction of TTL) */
  leaseRenewalFraction: z.number().min(0.1).max(0.9).default(0.33),
  /** Tick interval in milliseconds */
  tickMs: z.number().int().positive().default(1000),
  /** Max tasks to process per tick */
  maxConcurrent: z.number().int().positive().default(10),
  /** How long to wait for inflight tasks on shutdown */
  drainTimeoutMs: z.number().int().positive().default(30000),
  /** Owner ID for this daemon instance */
  ownerId: z.string(),
  /** Project path for this daemon */
  projectPath: z.string(),
})

export type DaemonConfig = z.infer<typeof DaemonConfigSchema>

// =============================================================================
// Daemon state
// =============================================================================

export const DaemonState = z.enum(["idle", "starting", "running", "draining", "stopping", "stopped", "error"])

export type DaemonState = z.infer<typeof DaemonState>

// =============================================================================
// Health snapshot
// =============================================================================

export interface DaemonHealthSnapshot {
  state: DaemonState
  ownerId: string
  leaseName: string
  isLeader: boolean
  lastTickAt: number | null
  lastRenewalAt: number | null
  nextScheduledTickAt: number | null
  inflightTasks: number
  pendingTasks: number
  dlqSize: number
  uptimeSeconds: number
  version: string
}

// =============================================================================
// Metrics (emitted periodically)
// =============================================================================

export interface DaemonMetrics {
  /** Monotonic counter for lease acquisitions */
  leaseAcquireTotal: number
  /** Monotonic counter for failed lease renewals */
  leaseRenewFailTotal: number
  /** Histogram of tick durations */
  tickDurationMs: number[]
  /** Histogram of tick lag (time since last tick) */
  tickLagMs: number[]
  /** Tasks due in current window */
  taskDueTotal: number
  /** Tasks run by outcome */
  taskRunTotal: Record<string, number>
  /** Tasks misfired by policy */
  taskMisfireTotal: Record<string, number>
  /** Retry attempts */
  taskRetryTotal: number
  /** Moves to DLQ */
  taskDlqTotal: number
  /** Replays suppressed by idempotency */
  taskIdempotencyReplayTotal: number
}

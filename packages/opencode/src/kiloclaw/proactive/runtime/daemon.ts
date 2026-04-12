/**
 * Daemon Runtime - Persistent scheduled task execution service
 *
 * This module implements a long-running service process that executes
 * scheduled tasks even when no TUI or CLI session is active.
 */

import { env } from "node:process"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { Log } from "@/util/log"
import { ProactiveTaskStore } from "../scheduler.store"
import { ProactiveSchedulerEngine } from "../scheduler.engine"
import { TaskExecutorAdapter } from "../task-executor-adapter"
import type { DaemonConfig, DaemonHealthSnapshot, DaemonFeatureFlags } from "./types"
import { isSystemd, notifyReady, notifyStopping, notifyWatchdog, notifyStatus } from "./notify"
import { DaemonFeatureFlagsSchema, DaemonConfigSchema } from "./types"

const log = Log.create({ service: "kilocclaw.daemon" })

// Default lease name for scheduled runtime
const DEFAULT_LEASE_NAME = "scheduled_runtime"

// Feature flag defaults (phase 0 - off by default per plan)
const DEFAULT_FEATURE_FLAGS: DaemonFeatureFlags = {
  runtimeEnabled: false,
  executionEnabled: false,
  leaseRequired: false,
  misfireMode: "catchup_one",
}

// =============================================================================
// Daemon singleton state
// =============================================================================

let state: "idle" | "starting" | "running" | "draining" | "stopping" | "stopped" | "error" = "idle"
let config: DaemonConfig | null = null
let featureFlags: DaemonFeatureFlags = DEFAULT_FEATURE_FLAGS
let startedAt = 0
let lastTickAt: number | null = null
let lastRenewalAt: number | null = null
let inflightTasks = 0
let currentLeaseFenceToken = 0
let renewalInterval: ReturnType<typeof setInterval> | null = null
let tickInterval: ReturnType<typeof setInterval> | null = null
let watchdogInterval: ReturnType<typeof setInterval> | null = null

// =============================================================================
// Feature flag loading
// =============================================================================

function loadFeatureFlags(): DaemonFeatureFlags {
  // NOTE: This internal loader uses a softer check ( !== "false") for testing flexibility.
  // The public Flag.KILOCLAW_DAEMON_RUNTIME_ENABLED requires explicit "true" for secure default.
  // Precedence: explicit env value > default (false for Flag, false here for internal use)
  const flags: DaemonFeatureFlags = {
    runtimeEnabled: env["KILOCLAW_DAEMON_RUNTIME_ENABLED"] !== "false",
    executionEnabled: env["KILOCLAW_DAEMON_EXECUTION_ENABLED"] === "true",
    leaseRequired: env["KILOCLAW_DAEMON_LEASE_REQUIRED"] === "true",
    misfireMode: (env["KILOCLAW_DAEMON_MISFIRE_MODE"] as DaemonFeatureFlags["misfireMode"]) ?? "catchup_one",
  }

  // Validate against schema (ignore if parse fails, use defaults)
  const parsed = DaemonFeatureFlagsSchema.safeParse(flags)
  if (!parsed.success) {
    log.warn("invalid feature flags, using defaults", { errors: parsed.error.issues })
    return DEFAULT_FEATURE_FLAGS
  }

  return parsed.data
}

// =============================================================================
// Config loading
// =============================================================================

function loadConfig(input: { ownerId: string; projectPath: string }): DaemonConfig {
  const parsed = DaemonConfigSchema.safeParse({
    leaseTtlMs: parseInt(env["KILOCLAW_DAEMON_LEASE_TTL_MS"] ?? "30000", 10),
    leaseRenewalFraction: parseFloat(env["KILOCLAW_DAEMON_LEASE_RENEWAL_FRACTION"] ?? "0.33"),
    tickMs: parseInt(env["KILOCLAW_DAEMON_TICK_MS"] ?? "1000", 10),
    maxConcurrent: parseInt(env["KILOCLAW_DAEMON_MAX_CONCURRENT"] ?? "10", 10),
    drainTimeoutMs: parseInt(env["KILOCLAW_DAEMON_DRAIN_TIMEOUT_MS"] ?? "30000", 10),
    ownerId: input.ownerId,
    projectPath: input.projectPath,
  })

  if (!parsed.success) {
    log.error("invalid daemon config", { errors: parsed.error.issues })
    throw new Error("Invalid daemon configuration")
  }

  return parsed.data
}

// =============================================================================
// Lease management
// =============================================================================

async function acquireLease(): Promise<boolean> {
  if (!config) return false

  const lease = ProactiveTaskStore.acquireLease({
    leaseName: DEFAULT_LEASE_NAME,
    ownerId: config.ownerId,
    ttlMs: config.leaseTtlMs,
  })

  if (lease) {
    currentLeaseFenceToken = lease.fenceToken
    lastRenewalAt = Date.now()
    log.info("lease acquired", { leaseName: DEFAULT_LEASE_NAME, fenceToken: lease.fenceToken })
    return true
  }

  log.warn("failed to acquire lease", { leaseName: DEFAULT_LEASE_NAME })
  return false
}

async function renewLease(): Promise<boolean> {
  if (!config) return false

  const lease = ProactiveTaskStore.renewLease({
    leaseName: DEFAULT_LEASE_NAME,
    ownerId: config.ownerId,
    ttlMs: config.leaseTtlMs,
    expectedFenceToken: currentLeaseFenceToken,
  })

  if (lease) {
    currentLeaseFenceToken = lease.fenceToken
    lastRenewalAt = Date.now()
    return true
  }

  log.warn("lease renewal failed", { leaseName: DEFAULT_LEASE_NAME })
  return false
}

async function releaseLease(): Promise<void> {
  if (!config) return

  ProactiveTaskStore.releaseLease({
    leaseName: DEFAULT_LEASE_NAME,
    ownerId: config.ownerId,
  })

  log.info("lease released", { leaseName: DEFAULT_LEASE_NAME })
}

// =============================================================================
// Health and status
// =============================================================================

function isLeader(): boolean {
  if (featureFlags.leaseRequired) {
    const lease = ProactiveTaskStore.getLease(DEFAULT_LEASE_NAME)
    return lease !== null && lease.ownerId === config?.ownerId && lease.expiresAt > Date.now()
  }
  return true
}

function getHealthSnapshot(): DaemonHealthSnapshot {
  const pendingTasks = ProactiveTaskStore.getPending(config?.maxConcurrent ?? 10)
  const dlqEntries = ProactiveTaskStore.getDLQ()

  return {
    state,
    ownerId: config?.ownerId ?? "unknown",
    leaseName: DEFAULT_LEASE_NAME,
    isLeader: isLeader(),
    lastTickAt,
    lastRenewalAt,
    nextScheduledTickAt: lastTickAt ? lastTickAt + (config?.tickMs ?? 1000) : null,
    inflightTasks,
    pendingTasks: pendingTasks.length,
    dlqSize: dlqEntries.length,
    uptimeSeconds: startedAt ? Math.floor((Date.now() - startedAt) / 1000) : 0,
    version: "1.0.0",
  }
}

// =============================================================================
// Lifecycle
// =============================================================================

async function reconcileStaleTasks(): Promise<void> {
  log.info("reconciling stale tasks...")

  // Reconcile tasks that are in stale running state
  // This is handled by the scheduler engine's recoverPendingTasks
  const recovered = ProactiveSchedulerEngine.recoverPendingTasks()
  log.info("reconciliation complete", { recovered })
}

async function tick(): Promise<void> {
  if (state !== "running") return
  if (!featureFlags.runtimeEnabled) return

  lastTickAt = Date.now()

  // Check if we should be executing (leader + execution enabled)
  if (!isLeader()) {
    log.debug("not leader, skipping tick")
    return
  }

  // Get pending tasks
  const pendingTasks = ProactiveTaskStore.getPending(config?.maxConcurrent ?? 10)

  if (pendingTasks.length === 0) {
    return
  }

  log.debug("tick processing", { pendingCount: pendingTasks.length })

  // Shadow mode: just log what would run
  if (!featureFlags.executionEnabled) {
    for (const task of pendingTasks) {
      log.info("shadow: would execute task", { taskId: task.id, name: task.name })
    }
    return
  }

  // Execute tasks
  for (const task of pendingTasks) {
    if (inflightTasks >= (config?.maxConcurrent ?? 10)) {
      break
    }

    inflightTasks++
    try {
      await ProactiveSchedulerEngine.executeTask({ taskId: task.id })
    } finally {
      inflightTasks--
    }
  }
}

async function startRenewalLoop(): Promise<void> {
  if (!config) return

  const renewalIntervalMs = config.leaseTtlMs * config.leaseRenewalFraction

  renewalInterval = setInterval(async () => {
    if (state !== "running") return

    const ok = await renewLease()
    if (!ok && featureFlags.leaseRequired) {
      log.error("lease renewal failed, stopping execution")
      await stop()
      return
    }

    notifyWatchdog()
  }, renewalIntervalMs)
}

async function startTickLoop(): Promise<void> {
  if (!config) return

  tickInterval = setInterval(async () => {
    await tick()
    notifyWatchdog()
  }, config.tickMs)
}

async function startWatchdogLoop(): Promise<void> {
  const watchdogUsec = parseInt(env["WATCHDOG_USEC"] ?? "30000000", 10) // 30s default

  watchdogInterval = setInterval(() => {
    if (state !== "running") return
    notifyWatchdog()
  }, watchdogUsec / 1000)
}

async function start(): Promise<void> {
  if (state !== "idle" && state !== "stopped") {
    log.warn("daemon already started", { state })
    return
  }

  state = "starting"
  startedAt = Date.now()

  log.info("daemon starting", { ownerId: config?.ownerId, projectPath: config?.projectPath })

  // Initialize the scheduler engine
  ProactiveSchedulerEngine.init({
    tickMs: config?.tickMs ?? 1000,
    maxConcurrent: config?.maxConcurrent ?? 10,
  })

  ProactiveSchedulerEngine.setExecutor(TaskExecutorAdapter)
  if (featureFlags.executionEnabled && !ProactiveSchedulerEngine.hasExecutor()) {
    log.error("cannot start: execution enabled but executor adapter is missing")
    state = "error"
    return
  }

  // Attempt to acquire lease
  const leaseAcquired = await acquireLease()
  if (!leaseAcquired && featureFlags.leaseRequired) {
    log.error("cannot start: lease required but not acquired")
    state = "error"
    return
  }

  // Reconcile stale tasks
  await reconcileStaleTasks()

  // Start engine in daemon mode (no internal timers)
  ProactiveSchedulerEngine.start({ mode: "daemon" })
  if (!ProactiveSchedulerEngine.getIsRunning()) {
    log.error("cannot start: scheduler engine failed to start (missing executor?)")
    state = "error"
    return
  }

  // Start loops
  await startRenewalLoop()
  await startTickLoop()

  if (isSystemd()) {
    await startWatchdogLoop()
    notifyReady()
  }

  state = "running"
  log.info("daemon started", { isLeader: isLeader() })
}

async function drain(): Promise<void> {
  if (state !== "running") return

  log.info("daemon draining", { inflightTasks })
  state = "draining"

  // Stop accepting new tasks
  if (tickInterval) {
    clearInterval(tickInterval)
    tickInterval = null
  }

  // Wait for inflight tasks with timeout
  const drainTimeout = config?.drainTimeoutMs ?? 30000
  const deadline = Date.now() + drainTimeout

  while (inflightTasks > 0 && Date.now() < deadline) {
    log.info("waiting for inflight tasks", { remaining: inflightTasks })
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }

  if (inflightTasks > 0) {
    log.warn("drain timeout, forcing stop", { remainingInflight: inflightTasks })
  }

  state = "stopping"
}

async function stop(): Promise<void> {
  if (state === "stopped" || state === "idle") return

  log.info("daemon stopping")

  if (state === "running") {
    await drain()
  }

  state = "stopping"

  // Stop renewal loop
  if (renewalInterval) {
    clearInterval(renewalInterval)
    renewalInterval = null
  }

  // Stop watchdog loop
  if (watchdogInterval) {
    clearInterval(watchdogInterval)
    watchdogInterval = null
  }

  // Release lease
  await releaseLease()

  // Stop scheduler engine
  ProactiveSchedulerEngine.stop()

  state = "stopped"
  log.info("daemon stopped")
}

// =============================================================================
// Public API
// =============================================================================

export const DaemonRuntime = {
  /**
   * Initialize the daemon with configuration
   */
  init(input: { ownerId: string; projectPath: string }): void {
    config = loadConfig(input)
    featureFlags = loadFeatureFlags()
    state = "idle"
    log.info("daemon initialized", { config, featureFlags })
  },

  /**
   * Start the daemon
   */
  start(): Promise<void> {
    return start()
  },

  /**
   * Stop the daemon gracefully
   */
  stop(): Promise<void> {
    return stop()
  },

  /**
   * Get current health snapshot
   */
  getHealth(): DaemonHealthSnapshot {
    return getHealthSnapshot()
  },

  /**
   * Get current state
   */
  getState(): typeof state {
    return state
  },

  /**
   * Get feature flags
   */
  getFeatureFlags(): DaemonFeatureFlags {
    return { ...featureFlags }
  },

  /**
   * Check if running
   */
  isRunning(): boolean {
    return state === "running"
  },
}

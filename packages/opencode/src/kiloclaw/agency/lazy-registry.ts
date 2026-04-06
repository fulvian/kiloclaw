/**
 * Lazy Registry - On-demand initialization for registries
 * Phase 8: Dynamic Multi-Level Retrieval SOTA 2026
 * KILOCLAW_DYNAMIC_MULTI_LEVEL_RETRIEVAL_SOTA_2026-04-06.md
 *
 * Provides lazy initialization for agency, skill, agent, and chain registries.
 * Each registry is initialized only on first access, reducing cold-start time.
 */

import { Log } from "@/util/log"
import { Flag } from "@/flag/flag"

const log = Log.create({ service: "kiloclaw.registry.lazy" })

// Registry initialization state
type RegistryState = "uninitialized" | "initializing" | "initialized"

export interface RegistryStatus {
  state: RegistryState
  initializedAt?: number
  accessCount: number
}

// Registry status tracking
const registryStatus: Record<string, RegistryStatus> = {
  agency: { state: "uninitialized", accessCount: 0 },
  skill: { state: "uninitialized", accessCount: 0 },
  agent: { state: "uninitialized", accessCount: 0 },
  chain: { state: "uninitialized", accessCount: 0 },
}

// Internal bootstrap functions (will be called only when needed)
let bootstrapFn: (() => void) | null = null

/**
 * Set the bootstrap function to use for lazy initialization
 */
export function setLazyBootstrap(fn: () => void): void {
  bootstrapFn = fn
}

/**
 * Get registry initialization status
 */
export function getRegistryStatus(registry: "agency" | "skill" | "agent" | "chain"): RegistryStatus {
  return registryStatus[registry]
}

/**
 * Get all registry statuses
 */
export function getAllRegistryStatuses(): Record<string, RegistryStatus> {
  return { ...registryStatus }
}

/**
 * Check if a specific registry is initialized
 */
export function isRegistryInitialized(registry: "agency" | "skill" | "agent" | "chain"): boolean {
  return registryStatus[registry].state === "initialized"
}

/**
 * Ensure a registry is initialized (lazy initialization)
 * Returns true if initialization was performed, false if already initialized
 */
export function ensureRegistryInitialized(registry: "agency" | "skill" | "agent" | "chain"): boolean {
  const status = registryStatus[registry]
  status.accessCount++

  if (status.state === "initialized") {
    log.debug("registry already initialized", { registry })
    return false
  }

  if (status.state === "initializing") {
    // Already being initialized by another call, wait briefly and check again
    log.debug("registry initialization in progress", { registry })
    return false
  }

  // Mark as initializing
  status.state = "initializing"
  log.info("lazy initializing registry", { registry })

  try {
    // Call the bootstrap function if provided
    if (bootstrapFn) {
      bootstrapFn()
    }

    status.state = "initialized"
    status.initializedAt = Date.now()
    log.info("registry initialized", { registry, accessCount: status.accessCount })
    return true
  } catch (error) {
    status.state = "uninitialized"
    log.error("registry initialization failed", { registry, error })
    throw error
  }
}

/**
 * Mark a specific registry as initialized (for testing or partial initialization)
 */
export function markRegistryInitialized(registry: "agency" | "skill" | "agent" | "chain"): void {
  registryStatus[registry].state = "initialized"
  registryStatus[registry].initializedAt = Date.now()
}

/**
 * Reset registry status (for testing)
 */
export function resetRegistryStatus(registry: "agency" | "skill" | "agent" | "chain"): void {
  registryStatus[registry] = { state: "uninitialized", accessCount: 0 }
}

/**
 * Reset all registry statuses (for testing)
 */
export function resetAllRegistryStatuses(): void {
  for (const key of Object.keys(registryStatus)) {
    registryStatus[key as keyof typeof registryStatus] = { state: "uninitialized", accessCount: 0 }
  }
}

/**
 * LazyLoader namespace - provides lazy initialization context
 */
export namespace LazyLoader {
  /**
   * Wrap a registry operation to ensure initialization first
   */
  export function withLazyInit<T>(registry: "agency" | "skill" | "agent" | "chain", operation: () => T): T {
    ensureRegistryInitialized(registry)
    return operation()
  }

  /**
   * Async wrap a registry operation to ensure initialization first
   */
  export async function withLazyInitAsync<T>(
    registry: "agency" | "skill" | "agent" | "chain",
    operation: () => Promise<T>,
  ): Promise<T> {
    ensureRegistryInitialized(registry)
    return operation()
  }

  /**
   * Get initialization statistics
   */
  export function getStats(): {
    registries: Record<string, { initialized: boolean; accessCount: number; initializedAt?: number }>
    allInitialized: boolean
  } {
    const registries: Record<string, { initialized: boolean; accessCount: number; initializedAt?: number }> = {}
    let allInitialized = true

    for (const [name, status] of Object.entries(registryStatus)) {
      registries[name] = {
        initialized: status.state === "initialized",
        accessCount: status.accessCount,
        initializedAt: status.initializedAt,
      }
      if (status.state !== "initialized") {
        allInitialized = false
      }
    }

    return { registries, allInitialized }
  }
}

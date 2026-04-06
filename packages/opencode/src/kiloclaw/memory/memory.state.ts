/**
 * Memory State - Per-project lazy initialization for persistent memory
 *
 * Uses Instance.state() pattern to ensure memory database is initialized
 * before first use, and disposed when project is closed.
 *
 * Production Integration:
 * - Maintenance scheduler starts after init (runs every 6 hours)
 * - Graceful shutdown flushes writeback and background queues
 * - Disposal properly cleans up timers and pending operations
 */

import { Instance } from "@/project/instance"
import { MemoryDb } from "./memory.db"
import { Log } from "@/util/log"
import { MemoryMaintenance } from "./memory.maintenance"
import { MemoryWriteback } from "./memory.writeback"
import { MemoryBackground } from "./memory.background"

const log = Log.create({ service: "kiloclaw.memory.state" })

// Maintenance scheduler state
let maintenanceInterval: ReturnType<typeof setInterval> | null = null
const MAINTENANCE_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6 hours

/**
 * Start the periodic maintenance scheduler
 */
function startMaintenanceScheduler(): void {
  if (maintenanceInterval) return

  // Run initial maintenance after 5 minutes (give system time to settle)
  const initialDelay = 5 * 60 * 1000

  setTimeout(() => {
    log.info("running initial maintenance")
    MemoryMaintenance.run({ dryRun: false }).catch((err) => {
      log.error("initial maintenance failed", { err: String(err) })
    })

    // Then run periodically
    maintenanceInterval = setInterval(() => {
      log.debug("running scheduled maintenance")
      MemoryMaintenance.run({ dryRun: false }).catch((err) => {
        log.error("scheduled maintenance failed", { err: String(err) })
      })
    }, MAINTENANCE_INTERVAL_MS)

    log.info("maintenance scheduler started", { intervalMs: MAINTENANCE_INTERVAL_MS })
  }, initialDelay)
}

/**
 * Stop the maintenance scheduler
 */
function stopMaintenanceScheduler(): void {
  if (maintenanceInterval) {
    clearTimeout(maintenanceInterval as unknown as number)
    maintenanceInterval = null
    log.info("maintenance scheduler stopped")
  }
}

/**
 * Graceful shutdown - flush all pending operations
 */
export async function memoryShutdown(): Promise<void> {
  log.info("memory shutdown initiated")

  // Stop scheduler first to prevent new tasks
  stopMaintenanceScheduler()

  // Flush writeback queue (blocks until complete)
  await MemoryWriteback.flush()

  // Flush background jobs (blocks until complete)
  await MemoryBackground.flush()

  // Close database
  await MemoryDb.close()

  log.info("memory shutdown complete")
}

/**
 * Memory state that initializes the persistent memory database
 * on first access per project directory.
 *
 * Usage:
 *   const memory = await MemoryState.get()
 *   // or with Instance.state pattern:
 *   const state = MemoryState.state()
 */
export namespace MemoryState {
  /**
   * Initialize memory database for current project
   * Called automatically on first access
   */
  export async function init(): Promise<void> {
    if (!MemoryDb.isEnabled()) {
      log.debug("memory v2 disabled, skipping init")
      return
    }

    const dbPath = getMemoryDbPath()
    log.info("initializing memory state", { dbPath })

    await MemoryDb.init(dbPath)

    // Start maintenance scheduler after successful init
    startMaintenanceScheduler()

    log.info("memory state initialized successfully")
  }

  /**
   * Get Instance.state() compatible state for memory
   * Use this for lazy initialization that respects project boundaries
   *
   * Returns a dispose function that cleans up scheduled tasks
   */
  export function state() {
    return Instance.state(
      async () => {
        await init()
        return {
          initialized: true,
          timestamp: Date.now(),
        }
      },
      async () => {
        // Dispose callback - runs when Instance is disposed
        await memoryShutdown()
      },
    )
  }

  /**
   * Get memory state for a specific directory
   * Useful for operations that need to ensure initialization
   */
  export async function forDirectory(directory: string): Promise<{ initialized: boolean; timestamp: number }> {
    return Instance.provide({
      directory,
      fn: async () => {
        await init()
        return { initialized: true, timestamp: Date.now() }
      },
    })
  }

  /**
   * Get the database path for memory storage
   * Uses .kiloclaw/memory.db relative to project root
   */
  function getMemoryDbPath(): string {
    // Use Instance.directory if available (project context)
    // Otherwise fall back to process.cwd()
    try {
      const dir = Instance.directory
      return `${dir}/.kiloclaw/memory.db`
    } catch {
      // Not in project context, use cwd
      return `.kiloclaw/memory.db`
    }
  }
}

/**
 * Convenience function to ensure memory is initialized
 * before performing memory operations
 */
export async function ensureMemoryInit(): Promise<void> {
  if (!MemoryDb.isEnabled()) return
  await MemoryState.init()
}

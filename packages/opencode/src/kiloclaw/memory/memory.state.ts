/**
 * Memory State - Per-project lazy initialization for persistent memory
 *
 * Uses Instance.state() pattern to ensure memory database is initialized
 * before first use, and disposed when project is closed.
 */

import { Instance } from "@/project/instance"
import { MemoryDb } from "./memory.db"
import { Log } from "@/util/log"

const log = Log.create({ service: "kiloclaw.memory.state" })

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

    log.info("memory state initialized successfully")
  }

  /**
   * Get Instance.state() compatible state for memory
   * Use this for lazy initialization that respects project boundaries
   */
  export function state() {
    return Instance.state(async () => {
      await init()
      return {
        initialized: true,
        timestamp: Date.now(),
      }
    })
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
   * Uses .kilocode/memory.db relative to project root
   */
  function getMemoryDbPath(): string {
    // Use Instance.directory if available (project context)
    // Otherwise fall back to process.cwd()
    try {
      const dir = Instance.directory
      return `${dir}/.kilocode/memory.db`
    } catch {
      // Not in project context, use cwd
      return `.kilocode/memory.db`
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

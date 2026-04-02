import { Log } from "@/util/log"
import { WorkingMemory, MemoryId, MemoryIdFactory, SensitivityLevel, DataCategory } from "./types.js"

// Working memory using simple Map-based storage
const log = Log.create({ service: "kiloclaw.memory.working" })

// TTL entry with expiration tracking
interface TTLEntry {
  value: unknown
  expiresAt: number | null
}

// Module-level state
const store = new Map<string, TTLEntry>()

// Default TTL: 1 hour in ms
const DEFAULT_TTL_MS = 60 * 60 * 1000

export namespace WorkingMemory {
  /**
   * Set a value in working memory with optional TTL
   */
  export function set(key: string, value: unknown, ttlMs?: number): void {
    const expiresAt = ttlMs ? Date.now() + ttlMs : Date.now() + DEFAULT_TTL_MS
    store.set(key, { value, expiresAt })
    log.debug("working memory set", { key, hasTTL: !!ttlMs })
  }

  /**
   * Get a value from working memory, respecting TTL
   */
  export function get(key: string): unknown {
    const entry = store.get(key)
    if (!entry) return undefined

    // Check expiration
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      store.delete(key)
      return undefined
    }

    return entry.value
  }

  /**
   * Delete a specific key from working memory
   */
  export function remove(key: string): void {
    store.delete(key)
  }

  /**
   * Clear all entries from working memory
   */
  export function clear(): void {
    store.clear()
    log.debug("working memory cleared")
  }

  /**
   * Take a snapshot of all working memory entries
   */
  export function snapshot(): Map<string, unknown> {
    const result = new Map<string, unknown>()
    const now = Date.now()

    for (const [key, entry] of store.entries()) {
      // Skip expired entries
      if (entry.expiresAt && now > entry.expiresAt) {
        store.delete(key)
        continue
      }
      result.set(key, entry.value)
    }

    return result
  }

  /**
   * Restore working memory from a snapshot
   */
  export function restore(snapshot: Map<string, unknown>): void {
    for (const [key, value] of snapshot.entries()) {
      store.set(key, { value, expiresAt: null })
    }
    log.debug("working memory restored", { count: snapshot.size })
  }

  /**
   * Set multiple entries at once
   */
  export function setMany(entries: Record<string, unknown>, ttlMs?: number): void {
    for (const [key, value] of Object.entries(entries)) {
      set(key, value, ttlMs)
    }
  }

  /**
   * Get multiple entries at once
   */
  export function getMany(keys: string[]): Record<string, unknown> {
    const result: Record<string, unknown> = {}
    for (const key of keys) {
      const value = get(key)
      if (value !== undefined) {
        result[key] = value
      }
    }
    return result
  }

  /**
   * Get all keys currently in working memory
   */
  export function keys(): string[] {
    const now = Date.now()
    const result: string[] = []

    for (const [key, entry] of store.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        store.delete(key)
        continue
      }
      result.push(key)
    }

    return result
  }

  /**
   * Check if a key exists (and is not expired)
   */
  export function has(key: string): boolean {
    return get(key) !== undefined
  }

  /**
   * Get statistics about working memory
   */
  export function stats(): { size: number; keys: string[] } {
    const keyList = keys()
    return { size: keyList.length, keys: keyList }
  }

  /**
   * Clean up expired entries
   */
  export function cleanup(): number {
    let count = 0
    const now = Date.now()

    for (const [key, entry] of store.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        store.delete(key)
        count++
      }
    }

    if (count > 0) {
      log.debug("working memory cleanup", { count })
    }
    return count
  }
}

// Export as interface implementation for type compatibility
export const workingMemory: WorkingMemory = {
  set: WorkingMemory.set,
  get: WorkingMemory.get,
  delete: WorkingMemory.remove,
  clear: WorkingMemory.clear,
  snapshot: WorkingMemory.snapshot,
  restore: WorkingMemory.restore,
  setMany: WorkingMemory.setMany,
  getMany: WorkingMemory.getMany,
  stats: WorkingMemory.stats,
}

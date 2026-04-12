/**
 * LRU Cache - Simple Least Recently Used cache
 * Phase 8: Dynamic Multi-Level Retrieval SOTA 2026
 * KILOCLAW_DYNAMIC_MULTI_LEVEL_RETRIEVAL_SOTA_2026-04-06.md
 *
 * Provides O(1) get/set with automatic eviction of least recently used entries.
 * Used for routing pipeline caching: Router instances, capability extraction, etc.
 */

export interface LRUCacheOptions {
  /** Maximum number of entries before eviction */
  maxSize?: number
  /** Time-to-live in milliseconds (optional) */
  ttlMs?: number
}

/**
 * Simple LRU Cache implementation
 * Uses Map ordering to track access order (most recent = end)
 */
export class LRUCache<K, V> {
  private readonly maxSize: number
  private readonly ttlMs: number | undefined
  private readonly cache = new Map<K, { value: V; timestamp: number }>()

  constructor(options: LRUCacheOptions = {}) {
    this.maxSize = options.maxSize ?? 100
    this.ttlMs = options.ttlMs
  }

  /**
   * Get a value from the cache
   * Updates access order (most recently used)
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key)

    if (!entry) return undefined

    // Check TTL if configured
    if (this.ttlMs !== undefined) {
      if (Date.now() - entry.timestamp > this.ttlMs) {
        this.cache.delete(key)
        return undefined
      }
    }

    // Move to end (most recently used)
    this.cache.delete(key)
    this.cache.set(key, entry)

    return entry.value
  }

  /**
   * Set a value in the cache
   * Evicts LRU entry if at capacity
   */
  set(key: K, value: V): void {
    // Delete first to update access order
    if (this.cache.has(key)) {
      this.cache.delete(key)
    }

    // Evict LRU if at capacity
    if (this.cache.size >= this.maxSize) {
      const lruKey = this.cache.keys().next().value
      if (lruKey !== undefined) {
        this.cache.delete(lruKey)
      }
    }

    this.cache.set(key, { value, timestamp: Date.now() })
  }

  /**
   * Check if key exists in cache (without updating access order)
   */
  has(key: K): boolean {
    const entry = this.cache.get(key)

    if (!entry) return false

    // Check TTL
    if (this.ttlMs !== undefined) {
      if (Date.now() - entry.timestamp > this.ttlMs) {
        this.cache.delete(key)
        return false
      }
    }

    return true
  }

  /**
   * Delete a specific key from cache
   */
  delete(key: K): boolean {
    return this.cache.delete(key)
  }

  /**
   * Clear all entries from cache
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Get current cache size
   */
  get size(): number {
    return this.cache.size
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number; ttlMs: number | undefined } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttlMs: this.ttlMs,
    }
  }
}

/**
 * Global LRU cache instances for routing pipeline
 * Shared across all routing operations for optimal memory usage
 */

// Router instance cache: domain -> Router
let routerCache: LRUCache<string, unknown> | null = null

/**
 * Get or create the global router cache
 */
export function getRouterCache(): LRUCache<string, unknown> {
  if (!routerCache) {
    routerCache = new LRUCache<string, unknown>({
      maxSize: 10, // Small - just for Router instances
      ttlMs: 60_000, // 1 minute TTL
    })
  }
  return routerCache
}

/**
 * Reset the router cache (for testing)
 */
export function resetRouterCache(): void {
  routerCache?.clear()
}

// Capability extraction cache: intent text hash -> capabilities[]
let capabilityCache: LRUCache<string, string[]> | null = null

/**
 * Get or create the global capability extraction cache
 */
export function getCapabilityCache(): LRUCache<string, string[]> {
  if (!capabilityCache) {
    capabilityCache = new LRUCache<string, string[]>({
      maxSize: 1000, // Large - many different intents
      ttlMs: 300_000, // 5 minutes TTL
    })
  }
  return capabilityCache
}

/**
 * Reset the capability cache (for testing)
 */
export function resetCapabilityCache(): void {
  capabilityCache?.clear()
}

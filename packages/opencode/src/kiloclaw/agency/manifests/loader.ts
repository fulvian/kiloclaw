/**
 * Manifest Loader - Lazy loading of versioned manifests
 * Phase 8: Dynamic Multi-Level Retrieval SOTA 2026
 * KILOCLAW_DYNAMIC_MULTI_LEVEL_RETRIEVAL_SOTA_2026-04-06.md
 *
 * Provides lazy loading of manifests from disk/cache:
 * - Hot cache: in-memory map with TTL for high-frequency routing
 * - Cold manifest: filesystem source of truth for persistence
 */

import { Log } from "@/util/log"
import { Flag } from "@/flag/flag"
import {
  ManifestIndexSchema,
  type ManifestIndex,
  type AgencyManifest,
  type SkillManifest,
  type AgentManifest,
  type ChainManifest,
  AgencyManifestSchema,
  SkillManifestSchema,
  AgentManifestSchema,
  ChainManifestSchema,
  isCompatible,
  type CompatibilityContract,
} from "./schema"

const log = Log.create({ service: "kiloclaw.manifest.loader" })

// =============================================================================
// Types
// =============================================================================

export type ManifestType = "agency" | "skill" | "agent" | "chain"

interface ManifestCacheEntry<T> {
  manifest: T
  loadedAt: number
  ttlMs: number
}

// =============================================================================
// Manifest Loader State
// =============================================================================

const cache = new Map<string, ManifestCacheEntry<unknown>>()
let index: ManifestIndex | null = null
const LOADED = new Set<string>()

// TTL settings (milliseconds) - use flags for dynamic tuning
const DEFAULT_TTL_MS = 60_000 // 1 minute hot cache
const COLD_LOAD_TTL_MS = 3_600_000 // 1 hour cold cache

/**
 * Get TTL for hot cache from flag (allows runtime tuning)
 */
function getHotCacheTTL(): number {
  return Flag.KILO_ROUTING_MANIFEST_CACHE_TTL_MS ?? DEFAULT_TTL_MS
}

// =============================================================================
// Manifest Loader Namespace
// =============================================================================

export namespace ManifestLoader {
  /**
   * Check if manifest discovery is enabled
   */
  export function isEnabled(): boolean {
    return Flag.KILO_ROUTING_MANIFEST_ENABLED
  }

  /**
   * Get the manifest index (lazy loaded)
   */
  export function getIndex(): ManifestIndex | null {
    return index
  }

  /**
   * Load manifest index from source
   */
  export function loadIndex(manifestIndex: ManifestIndex): void {
    index = ManifestIndexSchema.parse(manifestIndex)
    log.debug("manifest index loaded", {
      agencies: Object.keys(index.manifests.agencies).length,
      skills: Object.keys(index.manifests.skills).length,
      agents: Object.keys(index.manifests.agents).length,
      chains: Object.keys(index.manifests.chains).length,
    })
  }

  /**
   * Check if a specific manifest is loaded
   */
  export function isLoaded(id: string, type: ManifestType): boolean {
    const key = `${type}:${id}`
    return LOADED.has(key)
  }

  /**
   * Get cached manifest (returns undefined if not in cache)
   */
  export function getCached<T>(id: string, type: ManifestType): T | undefined {
    const key = `${type}:${id}`
    const entry = cache.get(key) as ManifestCacheEntry<T> | undefined

    if (!entry) return undefined

    // Check TTL
    if (Date.now() - entry.loadedAt > entry.ttlMs) {
      cache.delete(key)
      LOADED.delete(key)
      return undefined
    }

    return entry.manifest
  }

  /**
   * Cache a manifest (hot cache with TTL)
   */
  export function cacheManifest<T>(
    id: string,
    type: ManifestType,
    manifest: T,
    options: { ttlMs?: number; coldCache?: boolean } = {},
  ): void {
    const key = `${type}:${id}`
    // Use dynamic TTL from flag if available, otherwise use options or defaults
    const ttlMs = options.coldCache ? COLD_LOAD_TTL_MS : (options.ttlMs ?? getHotCacheTTL())

    cache.set(key, {
      manifest,
      loadedAt: Date.now(),
      ttlMs,
    })
    LOADED.add(key)

    log.debug("manifest cached", { key, ttlMs, coldCache: options.coldCache })
  }

  /**
   * Invalidate a specific manifest
   */
  export function invalidate(id: string, type: ManifestType): void {
    const key = `${type}:${id}`
    cache.delete(key)
    LOADED.delete(key)
    log.debug("manifest invalidated", { key })
  }

  /**
   * Invalidate all manifests of a type
   */
  export function invalidateType(type: ManifestType): void {
    const prefix = `${type}:`
    for (const key of cache.keys()) {
      if (key.startsWith(prefix)) {
        cache.delete(key)
        LOADED.delete(key)
      }
    }
    log.debug("all manifests of type invalidated", { type })
  }

  /**
   * Invalidate all manifests
   */
  export function invalidateAll(): void {
    cache.clear()
    LOADED.clear()
    index = null
    log.debug("all manifests invalidated")
  }

  /**
   * Validate manifest compatibility
   */
  export function validateCompatibility<T extends { compatibility: CompatibilityContract }>(
    manifest: T,
    clientVersion: string,
  ): boolean {
    if (!isCompatible(clientVersion, manifest.compatibility)) {
      log.warn("manifest incompatible", {
        manifestId: (manifest as unknown as { id: string }).id,
        manifestVersion: (manifest as unknown as { version: string }).version,
        clientVersion,
      })
      return false
    }
    return true
  }

  /**
   * Get loader statistics
   */
  export function getStats(): {
    cachedCount: number
    loadedCount: number
    indexLoaded: boolean
    indexSize: { agencies: number; skills: number; agents: number; chains: number }
  } {
    return {
      cachedCount: cache.size,
      loadedCount: LOADED.size,
      indexLoaded: index !== null,
      indexSize: index
        ? {
            agencies: Object.keys(index.manifests.agencies).length,
            skills: Object.keys(index.manifests.skills).length,
            agents: Object.keys(index.manifests.agents).length,
            chains: Object.keys(index.manifests.chains).length,
          }
        : { agencies: 0, skills: 0, agents: 0, chains: 0 },
    }
  }
}

// =============================================================================
// JSON Manifest Schemas (for file-based manifests)
// =============================================================================

export const AgencyManifestJsonSchema = AgencyManifestSchema
export const SkillManifestJsonSchema = SkillManifestSchema
export const AgentManifestJsonSchema = AgentManifestSchema
export const ChainManifestJsonSchema = ChainManifestSchema

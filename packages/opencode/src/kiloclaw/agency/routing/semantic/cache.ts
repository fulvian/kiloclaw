// Semantic Router Cache - LRU caching for routing results
// Phase 4: Semantic Router v2 - Performance Optimization

import { Flag } from "@/flag/flag"
import { LRUCache } from "../lru-cache"

export interface CacheEntry<T> {
  value: T
  timestamp: number
}

// Cache keys for semantic routing
export function cacheKey(intentId: string, description: string): string {
  return `${intentId}:${description.slice(0, 100)}`
}

// Semantic router cache - capability matching results
let semanticRouterCache: LRUCache<string, CacheEntry<unknown>> | null = null

export function getSemanticRouterCache(): LRUCache<string, CacheEntry<unknown>> {
  if (!semanticRouterCache) {
    semanticRouterCache = new LRUCache<string, CacheEntry<unknown>>({
      maxSize: 100,
      ttlMs: Flag.KILO_ROUTING_CACHE_TTL_MS,
    })
  }
  return semanticRouterCache
}

// Capability extraction cache
let capabilityCache: LRUCache<string, CacheEntry<unknown>> | null = null

export function getCapabilityExtractionCache(): LRUCache<string, CacheEntry<unknown>> {
  if (!capabilityCache) {
    capabilityCache = new LRUCache<string, CacheEntry<unknown>>({
      maxSize: 200,
      ttlMs: Flag.KILO_ROUTING_CAPABILITY_CACHE_TTL_MS,
    })
  }
  return capabilityCache
}

// Domain detection cache
let domainCache: LRUCache<string, CacheEntry<unknown>> | null = null

export function getDomainDetectionCache(): LRUCache<string, CacheEntry<unknown>> {
  if (!domainCache) {
    domainCache = new LRUCache<string, CacheEntry<unknown>>({
      maxSize: 100,
      ttlMs: Flag.KILO_ROUTING_CACHE_TTL_MS,
    })
  }
  return domainCache
}

// Reset all caches
export function resetSemanticRouterCaches(): void {
  semanticRouterCache = null
  capabilityCache = null
  domainCache = null
}

// Cache statistics
export interface CacheStats {
  semanticRouter: { size: number }
  capabilityExtraction: { size: number }
  domainDetection: { size: number }
}

export function getSemanticRouterCacheStats(): CacheStats {
  return {
    semanticRouter: {
      size: semanticRouterCache?.size ?? 0,
    },
    capabilityExtraction: {
      size: capabilityCache?.size ?? 0,
    },
    domainDetection: {
      size: domainCache?.size ?? 0,
    },
  }
}

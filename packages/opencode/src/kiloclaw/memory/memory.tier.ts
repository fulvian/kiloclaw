/**
 * Memory Tier Manager - BP-15
 * OS-style tiered memory architecture for observability and governance
 * Based on SOTA best practices from KILOCLAW_MEMORY_ENHANCEMENT_PLAN_2026-04-04
 *
 * Maps existing 4-layer architecture to OS-style tiers:
 * - Tier 0: In-context (LLM context window, not stored)
 * - Tier 1: Working (session state, hot data)
 * - Tier 2: Episodic (recent history)
 * - Tier 3: Semantic (consolidated facts)
 * - Tier 4: Procedural (patterns, skills)
 */

import { Log } from "@/util/log"
import { WorkingMemoryRepo, EpisodicMemoryRepo, SemanticMemoryRepo, ProceduralMemoryRepo } from "./memory.repository"

const log = Log.create({ service: "kiloclaw.memory.tier" })

const TENANT = "default"

/**
 * Memory tier enumeration - maps to OS-style memory hierarchy
 */
export enum MemoryTier {
  TIER_0_CONTEXT = "tier0_context", // In-LLM-context (not persisted)
  TIER_1_WORKING = "tier1_working", // Working memory - session state
  TIER_2_EPISODIC = "tier2_episodic", // Episodic memory - recent history
  TIER_3_SEMANTIC = "tier3_semantic", // Semantic memory - consolidated facts
  TIER_4_PROCEDURAL = "tier4_procedural", // Procedural memory - patterns & skills
}

/**
 * Tier configuration with storage characteristics
 */
export interface TierConfig {
  tier: MemoryTier
  name: string
  description: string
  ttlMs: number | null // null = no automatic expiry
  maxItems: number
  vectorEnabled: boolean
  compressionEnabled: boolean
  persistence: "memory" | "sqlite" | "registry"
}

/**
 * Tier statistics
 */
export interface TierStats {
  tier: MemoryTier
  name: string
  count: number
  sizeBytes: number
  oldestItemMs: number | null
  newestItemMs: number | null
  config: TierConfig
}

/**
 * Tier health status
 */
export interface TierHealth {
  tier: MemoryTier
  name: string
  status: "healthy" | "warning" | "critical"
  message?: string
  utilizationPercent: number
}

/**
 * Predefined tier configurations
 */
export const TIER_CONFIGS: Record<MemoryTier, TierConfig> = {
  [MemoryTier.TIER_0_CONTEXT]: {
    tier: MemoryTier.TIER_0_CONTEXT,
    name: "Context (Tier 0)",
    description: "In-LLM-context working set - not persisted",
    ttlMs: null,
    maxItems: 0,
    vectorEnabled: false,
    compressionEnabled: false,
    persistence: "memory",
  },
  [MemoryTier.TIER_1_WORKING]: {
    tier: MemoryTier.TIER_1_WORKING,
    name: "Working (Tier 1)",
    description: "Session state, hot data - in-memory with SQLite backup",
    ttlMs: 6 * 60 * 60 * 1000, // 6 hours
    maxItems: 100,
    vectorEnabled: false,
    compressionEnabled: false,
    persistence: "sqlite",
  },
  [MemoryTier.TIER_2_EPISODIC]: {
    tier: MemoryTier.TIER_2_EPISODIC,
    name: "Episodic (Tier 2)",
    description: "Recent episodes and events - SQLite with vector index",
    ttlMs: 30 * 24 * 60 * 60 * 1000, // 30 days
    maxItems: 1000,
    vectorEnabled: true,
    compressionEnabled: false,
    persistence: "sqlite",
  },
  [MemoryTier.TIER_3_SEMANTIC]: {
    tier: MemoryTier.TIER_3_SEMANTIC,
    name: "Semantic (Tier 3)",
    description: "Consolidated facts and knowledge - SQLite with full-text vectors",
    ttlMs: null, // No automatic expiry
    maxItems: 10000,
    vectorEnabled: true,
    compressionEnabled: false,
    persistence: "sqlite",
  },
  [MemoryTier.TIER_4_PROCEDURAL]: {
    tier: MemoryTier.TIER_4_PROCEDURAL,
    name: "Procedural (Tier 4)",
    description: "Patterns, skills, and procedures - SQLite registry",
    ttlMs: null,
    maxItems: 500,
    vectorEnabled: true,
    compressionEnabled: false,
    persistence: "sqlite",
  },
}

/**
 * Memory Tier Manager namespace
 */
export namespace MemoryTierManager {
  /**
   * Determine which tier an item belongs to based on layer name.
   */
  export function classifyTier(layer: string): MemoryTier {
    switch (layer.toLowerCase()) {
      case "working":
        return MemoryTier.TIER_1_WORKING
      case "episodic":
        return MemoryTier.TIER_2_EPISODIC
      case "semantic":
        return MemoryTier.TIER_3_SEMANTIC
      case "procedural":
        return MemoryTier.TIER_4_PROCEDURAL
      default:
        return MemoryTier.TIER_2_EPISODIC
    }
  }

  /**
   * Get tier information by tier enum.
   */
  export function getTierInfo(tier: MemoryTier): TierConfig {
    return TIER_CONFIGS[tier]
  }

  /**
   * Get all tier configurations.
   */
  export function getAllTierConfigs(): TierConfig[] {
    return Object.values(TIER_CONFIGS)
  }

  /**
   * Get statistics for all tiers.
   * Queries each repository to get counts and timing info.
   */
  export async function getTierStats(): Promise<TierStats[]> {
    const stats: TierStats[] = []

    // Tier 1 - Working Memory
    try {
      const workingCount = await WorkingMemoryRepo.count(TENANT)
      stats.push({
        tier: MemoryTier.TIER_1_WORKING,
        name: TIER_CONFIGS[MemoryTier.TIER_1_WORKING].name,
        count: workingCount,
        sizeBytes: workingCount * 500, // Estimate
        oldestItemMs: null, // Working memory doesn't track creation time easily
        newestItemMs: null,
        config: TIER_CONFIGS[MemoryTier.TIER_1_WORKING],
      })
    } catch (err) {
      log.error("failed to get working tier stats", { err: String(err) })
      stats.push(createEmptyTierStats(MemoryTier.TIER_1_WORKING))
    }

    // Tier 2 - Episodic Memory
    try {
      const episodicCount = await EpisodicMemoryRepo.count(TENANT)
      stats.push({
        tier: MemoryTier.TIER_2_EPISODIC,
        name: TIER_CONFIGS[MemoryTier.TIER_2_EPISODIC].name,
        count: episodicCount,
        sizeBytes: episodicCount * 2000, // Estimate
        oldestItemMs: null,
        newestItemMs: null,
        config: TIER_CONFIGS[MemoryTier.TIER_2_EPISODIC],
      })
    } catch (err) {
      log.error("failed to get episodic tier stats", { err: String(err) })
      stats.push(createEmptyTierStats(MemoryTier.TIER_2_EPISODIC))
    }

    // Tier 3 - Semantic Memory
    try {
      const semanticCount = await SemanticMemoryRepo.count(TENANT)
      stats.push({
        tier: MemoryTier.TIER_3_SEMANTIC,
        name: TIER_CONFIGS[MemoryTier.TIER_3_SEMANTIC].name,
        count: semanticCount,
        sizeBytes: semanticCount * 1000, // Estimate
        oldestItemMs: null,
        newestItemMs: null,
        config: TIER_CONFIGS[MemoryTier.TIER_3_SEMANTIC],
      })
    } catch (err) {
      log.error("failed to get semantic tier stats", { err: String(err) })
      stats.push(createEmptyTierStats(MemoryTier.TIER_3_SEMANTIC))
    }

    // Tier 4 - Procedural Memory
    try {
      const procCount = await ProceduralMemoryRepo.count(TENANT)
      stats.push({
        tier: MemoryTier.TIER_4_PROCEDURAL,
        name: TIER_CONFIGS[MemoryTier.TIER_4_PROCEDURAL].name,
        count: procCount,
        sizeBytes: procCount * 3000, // Estimate
        oldestItemMs: null,
        newestItemMs: null,
        config: TIER_CONFIGS[MemoryTier.TIER_4_PROCEDURAL],
      })
    } catch (err) {
      log.error("failed to get procedural tier stats", { err: String(err) })
      stats.push(createEmptyTierStats(MemoryTier.TIER_4_PROCEDURAL))
    }

    return stats
  }

  /**
   * Get health status for all tiers.
   * Checks utilization against maxItems limits.
   */
  export async function getTierHealth(): Promise<TierHealth[]> {
    const stats = await getTierStats()
    const health: TierHealth[] = []

    for (const stat of stats) {
      const utilizationPercent = stat.config.maxItems > 0 ? Math.round((stat.count / stat.config.maxItems) * 100) : 0

      let status: "healthy" | "warning" | "critical" = "healthy"
      let message: string | undefined

      if (utilizationPercent >= 100) {
        status = "critical"
        message = `Tier is full (${stat.count}/${stat.config.maxItems})`
      } else if (utilizationPercent >= 80) {
        status = "warning"
        message = `Tier approaching capacity (${utilizationPercent}%)`
      }

      health.push({
        tier: stat.tier,
        name: stat.name,
        status,
        message,
        utilizationPercent: Math.min(100, utilizationPercent),
      })
    }

    return health
  }

  /**
   * Get a summary report of all tiers.
   */
  export async function getSummary(): Promise<{
    totalItems: number
    totalSizeBytes: number
    tiersAtRisk: number
    healthSummary: string
    recommendations: string[]
  }> {
    const stats = await getTierStats()
    const health = await getTierHealth()

    const totalItems = stats.reduce((sum, s) => sum + s.count, 0)
    const totalSizeBytes = stats.reduce((sum, s) => sum + s.sizeBytes, 0)
    const tiersAtRisk = health.filter((h) => h.status !== "healthy").length

    const healthyTiers = health.filter((h) => h.status === "healthy").length
    const healthSummary = `${healthyTiers}/${health.length} tiers healthy`

    const recommendations: string[] = []

    // Generate recommendations based on health
    for (const h of health) {
      if (h.status === "critical") {
        recommendations.push(`CRITICAL: ${h.name} is at capacity - run maintenance or increase limits`)
      } else if (h.status === "warning") {
        recommendations.push(`WARNING: ${h.name} is ${h.utilizationPercent}% utilized - monitor closely`)
      }
    }

    // Check for very large total size
    if (totalSizeBytes > 100 * 1024 * 1024) {
      // > 100MB
      recommendations.push("Total memory size exceeds 100MB - consider running maintenance")
    }

    return {
      totalItems,
      totalSizeBytes,
      tiersAtRisk,
      healthSummary,
      recommendations,
    }
  }

  /**
   * Check if a specific tier needs attention.
   */
  export async function checkTierHealth(tier: MemoryTier): Promise<TierHealth> {
    const health = await getTierHealth()
    const found = health.find((h) => h.tier === tier)

    if (!found) {
      return {
        tier,
        name: TIER_CONFIGS[tier].name,
        status: "critical",
        message: "Tier not found",
        utilizationPercent: 0,
      }
    }

    return found
  }

  /**
   * Get recommended actions for a tier.
   */
  export function getRecommendedActions(tier: MemoryTier): string[] {
    const config = TIER_CONFIGS[tier]
    const actions: string[] = []

    switch (tier) {
      case MemoryTier.TIER_0_CONTEXT:
        actions.push("Context tier is ephemeral - not persisted")
        actions.push("Consider what information is critical to preserve before context expires")
        break
      case MemoryTier.TIER_1_WORKING:
        actions.push("Working memory auto-expires based on TTL")
        actions.push("Consider increasing ttlMs if sessions are being lost prematurely")
        break
      case MemoryTier.TIER_2_EPISODIC:
        actions.push("Episodic memory can be consolidated into semantic facts")
        actions.push("Run summarization to reduce storage while preserving key information")
        break
      case MemoryTier.TIER_3_SEMANTIC:
        actions.push("Semantic facts can be deduplicated via maintenance")
        actions.push("Low-confidence facts can be refreshed or purged")
        break
      case MemoryTier.TIER_4_PROCEDURAL:
        actions.push("Procedures with low success rates can be archived")
        actions.push("Outdated procedures can be updated or retired")
        break
    }

    if (config.vectorEnabled) {
      actions.push("Vector search is enabled - consider reranking for better retrieval")
    }

    return actions
  }
}

/**
 * Helper to create empty tier stats for error cases
 */
function createEmptyTierStats(tier: MemoryTier): TierStats {
  return {
    tier,
    name: TIER_CONFIGS[tier].name,
    count: 0,
    sizeBytes: 0,
    oldestItemMs: null,
    newestItemMs: null,
    config: TIER_CONFIGS[tier],
  }
}

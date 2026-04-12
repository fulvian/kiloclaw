/**
 * Memory Maintenance Operations - BP-12
 * Periodic operations: deduplication, stale cleanup, confidence refresh
 * Based on SOTA best practices from KILOCLAW_MEMORY_ENHANCEMENT_PLAN_2026-04-04
 */

import { Log } from "@/util/log"
import { SemanticMemoryRepo, EpisodicMemoryRepo, ProceduralMemoryRepo } from "./memory.repository"

const log = Log.create({ service: "kiloclaw.memory.maintenance" })

const TENANT = "default"

export interface MaintenanceStats {
  deduplicated: number
  deleted: number
  updated: number
  noop: number
  duration: number
  errors: string[]
}

export interface MaintenanceOptions {
  deduplicateWindowMs?: number
  staleThresholdDays?: number
  maxFactsPerSubject?: number
  dryRun?: boolean
}

export namespace MemoryMaintenance {
  /**
   * Run full maintenance pass.
   * Returns statistics about operations performed.
   */
  export async function run(options?: MaintenanceOptions): Promise<MaintenanceStats> {
    const start = Date.now()
    const stats: MaintenanceStats = {
      deduplicated: 0,
      deleted: 0,
      updated: 0,
      noop: 0,
      duration: 0,
      errors: [],
    }

    log.info("maintenance run started", { options })

    try {
      // 1. Deduplicate semantic facts
      const dedupStats = await deduplicateFacts(options?.maxFactsPerSubject ?? 5, options?.dryRun)
      stats.deduplicated = dedupStats.count
      if (dedupStats.errors.length > 0) {
        stats.errors.push(...dedupStats.errors)
      }

      // 2. Delete stale facts
      const deleteStats = await deleteStaleFacts(options?.staleThresholdDays ?? 90, options?.dryRun)
      stats.deleted = deleteStats.count
      if (deleteStats.errors.length > 0) {
        stats.errors.push(...deleteStats.errors)
      }

      // 3. Update low-confidence facts
      const updateStats = await refreshLowConfidenceFacts(options?.dryRun)
      stats.updated = updateStats.count
      if (updateStats.errors.length > 0) {
        stats.errors.push(...updateStats.errors)
      }

      // 4. Log noop stats
      stats.noop = dedupStats.skipped + deleteStats.skipped + updateStats.skipped
    } catch (err) {
      log.error("maintenance run failed", { err: String(err) })
      stats.errors.push(`maintenance run failed: ${String(err)}`)
    }

    stats.duration = Date.now() - start
    log.info("maintenance run completed", {
      deduplicated: stats.deduplicated,
      deleted: stats.deleted,
      updated: stats.updated,
      noop: stats.noop,
      duration: stats.duration,
      errors: stats.errors.length,
    })

    return stats
  }

  /**
   * Deduplicate: keep highest confidence fact per subject+predicate.
   * Removes duplicate facts, keeping only the one with highest confidence.
   */
  async function deduplicateFacts(
    maxPerGroup: number,
    dryRun?: boolean,
  ): Promise<{ count: number; skipped: number; errors: string[] }> {
    const result = { count: 0, skipped: 0, errors: [] as string[] }

    try {
      const facts = await SemanticMemoryRepo.queryFacts(TENANT, { minConfidence: 0, includeExpired: false })

      // Group by subject+predicate
      const groups = new Map<string, typeof facts>()
      for (const fact of facts) {
        const key = `${fact.subject}|${fact.predicate}`
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(fact)
      }

      for (const [key, group] of groups) {
        if (group.length <= maxPerGroup) {
          result.skipped += group.length
          continue
        }

        // Sort by confidence descending, keep top N
        group.sort((a, b) => b.confidence - a.confidence)
        const toDelete = group.slice(maxPerGroup)

        for (const fact of toDelete) {
          if (dryRun) {
            log.debug("dry run: would delete duplicate fact", {
              id: fact.id,
              subject: fact.subject,
              predicate: fact.predicate,
              confidence: fact.confidence,
            })
          } else {
            try {
              await SemanticMemoryRepo.deleteFact(fact.id)
              log.debug("deduplicated fact", {
                id: fact.id,
                subject: fact.subject,
                predicate: fact.predicate,
                confidence: fact.confidence,
              })
            } catch (err) {
              log.error("failed to delete duplicate fact", { id: fact.id, err: String(err) })
              result.errors.push(`delete fact ${fact.id}: ${String(err)}`)
            }
          }
          result.count++
        }

        log.debug("deduplicated group", { key, removed: toDelete.length, kept: maxPerGroup })
      }
    } catch (err) {
      log.error("deduplication failed", { err: String(err) })
      result.errors.push(`deduplication: ${String(err)}`)
    }

    return result
  }

  /**
   * Delete facts older than threshold with low confidence.
   * Only deletes facts that are both old AND have low confidence.
   */
  async function deleteStaleFacts(
    thresholdDays: number,
    dryRun?: boolean,
  ): Promise<{ count: number; skipped: number; errors: string[] }> {
    const result = { count: 0, skipped: 0, errors: [] as string[] }

    try {
      const cutoff = Date.now() - thresholdDays * 24 * 60 * 60 * 1000
      const facts = await SemanticMemoryRepo.queryFacts(TENANT, { minConfidence: 0, includeExpired: false })

      for (const fact of facts) {
        const factAge = Date.now() - (fact.updated_at ?? fact.created_at)

        // Skip if not yet past threshold
        if (factAge < cutoff) {
          result.skipped++
          continue
        }

        // Delete if confidence < 40 and age > 30 days
        const staleThreshold = 30 * 24 * 60 * 60 * 1000
        if (fact.confidence < 40 && factAge > staleThreshold) {
          if (dryRun) {
            log.debug("dry run: would delete stale fact", {
              id: fact.id,
              subject: fact.subject,
              predicate: fact.predicate,
              confidence: fact.confidence,
              ageDays: Math.round(factAge / (24 * 60 * 60 * 1000)),
            })
          } else {
            try {
              await SemanticMemoryRepo.deleteFact(fact.id)
              log.debug("deleted stale fact", {
                id: fact.id,
                subject: fact.subject,
                predicate: fact.predicate,
                confidence: fact.confidence,
                ageDays: Math.round(factAge / (24 * 60 * 60 * 1000)),
              })
            } catch (err) {
              log.error("failed to delete stale fact", { id: fact.id, err: String(err) })
              result.errors.push(`delete stale fact ${fact.id}: ${String(err)}`)
            }
          }
          result.count++
        } else {
          result.skipped++
        }
      }
    } catch (err) {
      log.error("stale fact deletion failed", { err: String(err) })
      result.errors.push(`stale deletion: ${String(err)}`)
    }

    return result
  }

  /**
   * Refresh facts that could benefit from recent evidence.
   * Boosts confidence for facts that haven't been updated but have high provenance.
   */
  async function refreshLowConfidenceFacts(
    dryRun?: boolean,
  ): Promise<{ count: number; skipped: number; errors: string[] }> {
    const result = { count: 0, skipped: 0, errors: [] as string[] }

    try {
      // Find facts with confidence < 70 that are older than 14 days
      const facts = await SemanticMemoryRepo.queryFacts(TENANT, { minConfidence: 0, includeExpired: false })

      for (const fact of facts) {
        if (fact.confidence >= 70) {
          result.skipped++
          continue
        }

        const age = Date.now() - (fact.updated_at ?? fact.created_at)
        const ageDays = age / (24 * 60 * 60 * 1000)

        // Only refresh if older than 14 days and confidence < 70
        if (ageDays < 14) {
          result.skipped++
          continue
        }

        // Gently boost confidence for high-provenance facts
        // High provenance = broker_v2 or user_direct
        const isHighProvenance = fact.provenance === "broker_v2" || fact.provenance === "user_direct"

        if (isHighProvenance) {
          // Boost by 5 points, capped at 85
          const newConfidence = Math.min(85, fact.confidence + 5)

          if (dryRun) {
            log.debug("dry run: would refresh low-confidence fact", {
              id: fact.id,
              subject: fact.subject,
              predicate: fact.predicate,
              oldConfidence: fact.confidence,
              newConfidence,
            })
          } else {
            try {
              // Parse the object and add refresh metadata
              let obj = typeof fact.object === "string" ? JSON.parse(fact.object) : fact.object
              obj = { ...obj, _refreshed: true, _refreshedAt: Date.now() }

              await SemanticMemoryRepo.updateFact(fact.id, obj)
              log.debug("refreshed low-confidence fact", {
                id: fact.id,
                subject: fact.subject,
                predicate: fact.predicate,
                oldConfidence: fact.confidence,
                newConfidence,
              })
            } catch (err) {
              log.error("failed to refresh low-confidence fact", { id: fact.id, err: String(err) })
              result.errors.push(`refresh fact ${fact.id}: ${String(err)}`)
            }
          }
          result.count++
        } else {
          result.skipped++
        }
      }
    } catch (err) {
      log.error("low-confidence refresh failed", { err: String(err) })
      result.errors.push(`refresh: ${String(err)}`)
    }

    return result
  }

  /**
   * Get maintenance schedule configuration.
   */
  export function getSchedule(): { intervalMs: number; description: string } {
    return {
      intervalMs: 6 * 60 * 60 * 1000, // Every 6 hours
      description: "Full maintenance: deduplication, stale deletion, confidence refresh",
    }
  }

  /**
   * Quick health check for memory system.
   * Returns warnings for potential issues.
   */
  export async function healthCheck(): Promise<{
    healthy: boolean
    warnings: string[]
    stats: {
      totalFacts: number
      lowConfidenceFacts: number
      staleFacts: number
      duplicateGroups: number
    }
  }> {
    const warnings: string[] = []
    const stats = { totalFacts: 0, lowConfidenceFacts: 0, staleFacts: 0, duplicateGroups: 0 }

    try {
      const facts = await SemanticMemoryRepo.queryFacts(TENANT, { minConfidence: 0, includeExpired: false })
      stats.totalFacts = facts.length

      // Count low confidence facts (confidence < 50)
      stats.lowConfidenceFacts = facts.filter((f) => f.confidence < 50).length

      // Count stale facts (> 90 days old with confidence < 40)
      const staleThreshold = 90 * 24 * 60 * 60 * 1000
      stats.staleFacts = facts.filter(
        (f) => Date.now() - (f.updated_at ?? f.created_at) > staleThreshold && f.confidence < 40,
      ).length

      // Count potential duplicate groups
      const groups = new Map<string, typeof facts>()
      for (const fact of facts) {
        const key = `${fact.subject}|${fact.predicate}`
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(fact)
      }
      stats.duplicateGroups = [...groups.values()].filter((g) => g.length > 3).length

      // Generate warnings
      if (stats.lowConfidenceFacts > stats.totalFacts * 0.3) {
        warnings.push(`High ratio of low-confidence facts: ${stats.lowConfidenceFacts}/${stats.totalFacts}`)
      }
      if (stats.staleFacts > 100) {
        warnings.push(`Many stale facts: ${stats.staleFacts} facts older than 90 days with low confidence`)
      }
      if (stats.duplicateGroups > 10) {
        warnings.push(`Many duplicate groups: ${stats.duplicateGroups} groups have more than 3 duplicates`)
      }

      const healthy = warnings.length === 0
      return { healthy, warnings, stats }
    } catch (err) {
      log.error("health check failed", { err: String(err) })
      warnings.push(`health check failed: ${String(err)}`)
      return { healthy: false, warnings, stats }
    }
  }
}

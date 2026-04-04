/**
 * Memory Retention & Purge - Hard-enforced retention policies
 * Based on ADR-005 retention policies
 */

import { Log } from "@/util/log"
import {
  WorkingMemoryRepo,
  EpisodicMemoryRepo,
  SemanticMemoryRepo,
  ProceduralMemoryRepo,
  UserProfileRepo,
  FeedbackRepo,
  AuditRepo,
} from "./memory.repository"
import { MemoryMetrics } from "./memory.metrics"

const log = Log.create({ service: "kiloclaw.memory.retention" })

// =============================================================================
// Retention Policies
// =============================================================================

export interface RetentionPolicy {
  layer: "working" | "episodic" | "semantic" | "procedural"
  ttlMs?: number // Time to live in milliseconds
  maxEntries?: number // Maximum entries allowed
  encryptAtRest?: boolean
  compress?: boolean
}

export const DEFAULT_RETENTION: Record<string, RetentionPolicy> = {
  working: {
    layer: "working",
    ttlMs: 60 * 60 * 1000, // 1 hour
    maxEntries: 1000,
    compress: false,
  },
  episodic: {
    layer: "episodic",
    ttlMs: 90 * 24 * 60 * 60 * 1000, // 90 days
    maxEntries: 10000,
    compress: true,
  },
  semantic: {
    layer: "semantic",
    compress: false,
    // No TTL - semantic facts are persistent until explicitly purged
  },
  procedural: {
    layer: "procedural",
    compress: false,
    // No TTL - procedures are versioned and persistent
  },
}

// =============================================================================
// Purge Reasons
// =============================================================================

export type PurgeReasonCode =
  | "expired" // TTL exceeded
  | "right_to_forget" // User requested deletion
  | "policy_breach" // Security/compliance violation
  | "manual" // Admin/user manual deletion
  | "migration" // Data migration cleanup
  | "size_limit" // Max entries exceeded

export interface PurgeResult {
  purged: number
  failed: number
  errors: Array<{ id: string; reason: string }>
}

// =============================================================================
// Retention Manager
// =============================================================================

export const MemoryRetention = {
  /**
   * Enforce retention policy for a specific layer
   */
  async enforcePolicy(tenantId: string, layer: string): Promise<PurgeResult> {
    const policy = DEFAULT_RETENTION[layer]
    if (!policy) {
      return { purged: 0, failed: 0, errors: [{ id: "", reason: `Unknown layer: ${layer}` }] }
    }

    log.info("enforcing retention policy", { tenantId, layer, policy })

    const result: PurgeResult = { purged: 0, failed: 0, errors: [] }

    try {
      // Handle expired entries
      if (layer === "working" && policy.ttlMs) {
        const cleaned = await WorkingMemoryRepo.cleanupExpired()
        result.purged += cleaned
        log.info("working memory cleanup", { tenantId, cleaned })
      }

      if (layer === "episodic" && policy.ttlMs) {
        const cleaned = await EpisodicMemoryRepo.cleanupExpired()
        result.purged += cleaned
        log.info("episodic memory cleanup", { tenantId, cleaned })
      }

      // Handle size limits
      if (policy.maxEntries) {
        await enforceSizeLimit(tenantId, layer, policy.maxEntries, result)
      }
    } catch (err) {
      log.error("retention enforcement failed", { tenantId, layer, err })
      result.failed++
      result.errors.push({ id: "", reason: String(err) })
    }

    MemoryMetrics.observePurge(result.purged, result.failed)
    return result
  },

  /**
   * Enforce all retention policies
   */
  async enforceAll(tenantId: string): Promise<PurgeResult> {
    const layers = ["working", "episodic", "semantic", "procedural"]
    const totalResult: PurgeResult = { purged: 0, failed: 0, errors: [] }

    for (const layer of layers) {
      const result = await MemoryRetention.enforcePolicy(tenantId, layer)
      totalResult.purged += result.purged
      totalResult.failed += result.failed
      totalResult.errors.push(...result.errors)
    }

    log.info("retention enforcement complete", { tenantId, result: totalResult })
    MemoryMetrics.observePurge(totalResult.purged, totalResult.failed)
    return totalResult
  },

  /**
   * Right to Forget - Delete all data for a user
   */
  async rightToForget(tenantId: string, userId: string, reason: string = "user_request"): Promise<PurgeResult> {
    log.info("right to forget initiated", { tenantId, userId, reason })

    const result: PurgeResult = { purged: 0, failed: 0, errors: [] }

    try {
      const workingKeys = await WorkingMemoryRepo.getMany(tenantId, [], userId)
      const workingIds = Object.keys(workingKeys)
      for (const key of workingIds) {
        await WorkingMemoryRepo.delete(tenantId, key, userId)
      }
      result.purged += workingIds.length

      const events = await EpisodicMemoryRepo.getEvents(tenantId, { userId })
      for (const event of events) {
        await EpisodicMemoryRepo.deleteEvent(event.id)
      }
      result.purged += events.length

      const episodes = await EpisodicMemoryRepo.getTimeline(tenantId, { userId })
      for (const episode of episodes) {
        await EpisodicMemoryRepo.deleteEpisode(episode.id)
      }
      result.purged += episodes.length

      const facts = await SemanticMemoryRepo.queryFacts(tenantId, { userId, includeExpired: true })
      for (const fact of facts) {
        await SemanticMemoryRepo.deleteFact(fact.id)
      }
      result.purged += facts.length

      const procs = await ProceduralMemoryRepo.deleteByUser(tenantId, userId)
      result.purged += procs

      const feedback = await FeedbackRepo.deleteByUser(tenantId, userId)
      result.purged += feedback

      const profile = await UserProfileRepo.delete(tenantId, userId)
      result.purged += profile

      await AuditRepo.log({
        id: crypto.randomUUID(),
        actor: "system",
        action: "purge",
        target_type: "user",
        target_id: userId,
        reason: `right_to_forget: ${reason}`,
        previous_hash: "",
        hash: "",
        metadata_json: {
          tenantId,
          userId,
          reason,
          working: workingIds.length,
          events: events.length,
          episodes: episodes.length,
          facts: facts.length,
          procedures: procs,
          feedback,
          profile,
        },
        ts: Date.now(),
        created_at: Date.now(),
      })

      log.info("right to forget completed", { tenantId, userId, purged: result.purged })
    } catch (err) {
      log.error("right to forget failed", { tenantId, userId, err })
      result.failed++
      result.errors.push({ id: userId, reason: String(err) })
    }

    MemoryMetrics.observePurge(result.purged, result.failed)
    return result
  },

  /**
   * Purge specific entries
   */
  async purgeEntries(
    tenantId: string,
    entries: Array<{ layer: string; id: string; reason: PurgeReasonCode }>,
  ): Promise<PurgeResult> {
    const result: PurgeResult = { purged: 0, failed: 0, errors: [] }

    for (const entry of entries) {
      try {
        if (entry.layer === "working") {
          await WorkingMemoryRepo.delete(tenantId, entry.id)
        } else if (entry.layer === "episodic") {
          await EpisodicMemoryRepo.deleteEpisode(entry.id)
        } else if (entry.layer === "semantic") {
          await SemanticMemoryRepo.deleteFact(entry.id)
        }

        await AuditRepo.log({
          id: crypto.randomUUID(),
          actor: "system",
          action: "purge",
          target_type: entry.layer,
          target_id: entry.id,
          reason: entry.reason,
          previous_hash: "",
          hash: "",
          metadata_json: { tenantId },
          ts: Date.now(),
          created_at: Date.now(),
        })

        result.purged++
        log.debug("entry purged", { tenantId, layer: entry.layer, id: entry.id, reason: entry.reason })
      } catch (err) {
        log.error("purge failed", { tenantId, entry, err })
        result.failed++
        result.errors.push({ id: entry.id, reason: String(err) })
      }
    }

    MemoryMetrics.observePurge(result.purged, result.failed)
    return result
  },

  /**
   * Get retention statistics
   */
  async getStats(tenantId: string): Promise<
    Record<
      string,
      {
        count: number
        oldestTs?: number
        newestTs?: number
        policy: RetentionPolicy
      }
    >
  > {
    const stats: Record<string, any> = {}

    const workingCount = await WorkingMemoryRepo.count(tenantId)
    const episodicCount = await EpisodicMemoryRepo.count(tenantId)
    const semanticCount = await SemanticMemoryRepo.count(tenantId)
    const proceduralCount = await ProceduralMemoryRepo.count(tenantId)

    stats.working = { count: workingCount, policy: DEFAULT_RETENTION.working }
    stats.episodic = { count: episodicCount, policy: DEFAULT_RETENTION.episodic }
    stats.semantic = { count: semanticCount, policy: DEFAULT_RETENTION.semantic }
    stats.procedural = { count: proceduralCount, policy: DEFAULT_RETENTION.procedural }

    return stats
  },
}

// =============================================================================
// Size Limit Enforcement
// =============================================================================

async function enforceSizeLimit(
  tenantId: string,
  layer: string,
  maxEntries: number,
  result: PurgeResult,
): Promise<void> {
  log.debug("checking size limit", { tenantId, layer, maxEntries })

  if (layer === "working") {
    const count = await WorkingMemoryRepo.count(tenantId)
    const excess = Math.max(0, count - maxEntries)
    if (excess === 0) return

    const oldest = await WorkingMemoryRepo.listOldest(tenantId, excess)
    for (const row of oldest) {
      await WorkingMemoryRepo.delete(tenantId, row.key)
      result.purged++
      await AuditRepo.log({
        id: crypto.randomUUID(),
        actor: "system",
        action: "purge",
        target_type: "working",
        target_id: row.id,
        reason: "size_limit",
        previous_hash: "",
        hash: "",
        metadata_json: { tenantId, layer },
        ts: Date.now(),
        created_at: Date.now(),
      })
    }
    return
  }

  if (layer === "episodic") {
    const count = await EpisodicMemoryRepo.count(tenantId)
    const excess = Math.max(0, count - maxEntries)
    if (excess === 0) return

    const oldest = await EpisodicMemoryRepo.listOldest(tenantId, excess)
    for (const row of oldest) {
      await EpisodicMemoryRepo.deleteEpisode(row.id)
      result.purged++
      await AuditRepo.log({
        id: crypto.randomUUID(),
        actor: "system",
        action: "purge",
        target_type: "episodic",
        target_id: row.id,
        reason: "size_limit",
        previous_hash: "",
        hash: "",
        metadata_json: { tenantId, layer },
        ts: Date.now(),
        created_at: Date.now(),
      })
    }
  }
}

// =============================================================================
// Scheduled Jobs Interface
// =============================================================================

export interface RetentionJob {
  id: string
  tenantId: string
  layer: string
  schedule: string // Cron expression
  lastRun?: number
  nextRun?: number
  enabled: boolean
}

export const RetentionJobs = {
  /**
   * Create a scheduled retention job
   */
  schedule(tenantId: string, layer: string, schedule: string): RetentionJob {
    return {
      id: crypto.randomUUID(),
      tenantId,
      layer,
      schedule,
      enabled: true,
    }
  },

  /**
   * Run all due retention jobs
   */
  async runDue(): Promise<void> {
    // This would be called by a scheduler (e.g., cron, bullmq)
    // Implementation depends on the job scheduling system in use
    log.debug("retention jobs check triggered")
  },
}

// =============================================================================
// Retention Utilities
// =============================================================================

export function isExpired(expiresAt: number | null | undefined, now: number = Date.now()): boolean {
  if (!expiresAt) return false
  return expiresAt < now
}

export function shouldRetain(createdAt: number, policy: RetentionPolicy, now: number = Date.now()): boolean {
  if (!policy.ttlMs) return true // No TTL means retain indefinitely

  const age = now - createdAt
  return age < policy.ttlMs
}

export function computeExpiresAt(createdAt: number, ttlMs: number | undefined): number | null {
  if (!ttlMs) return null
  return createdAt + ttlMs
}

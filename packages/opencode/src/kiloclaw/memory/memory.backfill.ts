/**
 * Memory Backfill - Migrate legacy in-memory data to V2 persistence
 *
 * This module provides utilities to backfill existing data from the legacy
 * in-memory brokers (working, episodic, semantic, procedural) into the new
 * V2 persistent storage.
 *
 * Usage:
 *   await MemoryBackfill.migrate({ tenantId: "default", userId: "user-1" })
 *   await MemoryBackfill.verifyMigration({ tenantId: "default" })
 */

import { Log } from "@/util/log"
import { Flag } from "@/flag/flag"
import {
  WorkingMemoryRepo,
  EpisodicMemoryRepo,
  SemanticMemoryRepo,
  ProceduralMemoryRepo,
  AuditRepo,
} from "./memory.repository"
import { workingMemory, episodicMemory, semanticMemory, proceduralMemory } from "./index.js"

const log = Log.create({ service: "kiloclaw.memory.backfill" })

export namespace MemoryBackfill {
  /**
   * Migration stats
   */
  export interface MigrationStats {
    workingMigrated: number
    episodicMigrated: number
    semanticMigrated: number
    proceduralMigrated: number
    errors: Array<{ layer: string; key: string; error: string }>
    startedAt: number
    completedAt?: number
    durationMs?: number
  }

  /**
   * Migrate all legacy memory layers to V2 persistence
   */
  export async function migrate(options: {
    tenantId: string
    userId?: string
    dryRun?: boolean
  }): Promise<MigrationStats> {
    const stats: MigrationStats = {
      workingMigrated: 0,
      episodicMigrated: 0,
      semanticMigrated: 0,
      proceduralMigrated: 0,
      errors: [],
      startedAt: Date.now(),
    }

    if (!Flag.KILO_EXPERIMENTAL_MEMORY_V2) {
      log.warn("backfill skipped - KILO_EXPERIMENTAL_MEMORY_V2 is not enabled")
      return stats
    }

    log.info("starting memory backfill", options)

    // Migrate working memory
    try {
      const workingStats = await migrateWorkingMemory(options.tenantId, options.userId, options.dryRun)
      stats.workingMigrated = workingStats.count
      stats.errors.push(...workingStats.errors)
    } catch (err) {
      log.error("working memory backfill failed", { err })
      stats.errors.push({ layer: "working", key: "all", error: String(err) })
    }

    // Migrate episodic memory
    try {
      const episodicStats = await migrateEpisodicMemory(options.tenantId, options.userId, options.dryRun)
      stats.episodicMigrated = episodicStats.count
      stats.errors.push(...episodicStats.errors)
    } catch (err) {
      log.error("episodic memory backfill failed", { err })
      stats.errors.push({ layer: "episodic", key: "all", error: String(err) })
    }

    // Migrate semantic memory
    try {
      const semanticStats = await migrateSemanticMemory(options.tenantId, options.userId, options.dryRun)
      stats.semanticMigrated = semanticStats.count
      stats.errors.push(...semanticStats.errors)
    } catch (err) {
      log.error("semantic memory backfill failed", { err })
      stats.errors.push({ layer: "semantic", key: "all", error: String(err) })
    }

    // Migrate procedural memory
    try {
      const proceduralStats = await migrateProceduralMemory(options.tenantId, options.userId, options.dryRun)
      stats.proceduralMigrated = proceduralStats.count
      stats.errors.push(...proceduralStats.errors)
    } catch (err) {
      log.error("procedural memory backfill failed", { err })
      stats.errors.push({ layer: "procedural", key: "all", error: String(err) })
    }

    stats.completedAt = Date.now()
    stats.durationMs = stats.completedAt - stats.startedAt

    // Log audit trail
    await AuditRepo.log({
      id: `audit_backfill_${Date.now()}`,
      actor: "system",
      action: "backfill",
      target_type: "memory_retrieval",
      target_id: options.tenantId,
      reason: "migration_from_legacy",
      metadata_json: {
        workingMigrated: stats.workingMigrated,
        episodicMigrated: stats.episodicMigrated,
        semanticMigrated: stats.semanticMigrated,
        proceduralMigrated: stats.proceduralMigrated,
        errorCount: stats.errors.length,
        durationMs: stats.durationMs,
      },
      ts: Date.now(),
      created_at: Date.now(),
      hash: "",
    })

    log.info("memory backfill completed", {
      migrated: stats.workingMigrated + stats.episodicMigrated + stats.semanticMigrated + stats.proceduralMigrated,
      errors: stats.errors.length,
      durationMs: stats.durationMs,
    })

    return stats
  }

  /**
   * Verify migration - compare legacy and v2 counts per layer
   */
  export async function verifyMigration(options: {
    tenantId: string
    userId?: string
  }): Promise<{ consistent: boolean; discrepancies: string[] }> {
    const discrepancies: string[] = []

    log.info("verifying memory migration", options)

    const legacyWorking = workingMemory.stats().size
    const v2Working = Object.keys(await WorkingMemoryRepo.getMany(options.tenantId, [], options.userId)).length
    if (legacyWorking !== v2Working) {
      discrepancies.push(`working mismatch: legacy=${legacyWorking} v2=${v2Working}`)
    }

    const legacyEpisodes = (await episodicMemory.getRecentEpisodes(1000)).length
    const v2Episodes = (await EpisodicMemoryRepo.getRecentEpisodes(options.tenantId, 1000)).length
    if (legacyEpisodes !== v2Episodes) {
      discrepancies.push(`episodic mismatch: legacy=${legacyEpisodes} v2=${v2Episodes}`)
    }

    const legacyFacts = (await semanticMemory.query()).length
    const v2Facts = (
      await SemanticMemoryRepo.queryFacts(options.tenantId, { userId: options.userId, includeExpired: true })
    ).length
    if (legacyFacts !== v2Facts) {
      discrepancies.push(`semantic mismatch: legacy=${legacyFacts} v2=${v2Facts}`)
    }

    const legacyProcedures = (await proceduralMemory.list()).length
    const v2Procedures = (await ProceduralMemoryRepo.list(options.tenantId, { userId: options.userId })).length
    if (legacyProcedures !== v2Procedures) {
      discrepancies.push(`procedural mismatch: legacy=${legacyProcedures} v2=${v2Procedures}`)
    }

    return {
      consistent: discrepancies.length === 0,
      discrepancies,
    }
  }

  /**
   * Get migration status - check if backfill is needed
   */
  export async function getStatus(options: { tenantId: string; userId?: string }): Promise<{
    needsBackfill: boolean
    legacyCount: number
    v2Count: number
  }> {
    const legacyCount =
      workingMemory.stats().size +
      (await episodicMemory.getRecentEpisodes(1000)).length +
      (await semanticMemory.query()).length +
      (await proceduralMemory.list()).length

    const v2Count =
      Object.keys(await WorkingMemoryRepo.getMany(options.tenantId, [], options.userId)).length +
      (await EpisodicMemoryRepo.getRecentEpisodes(options.tenantId, 1000)).length +
      (await SemanticMemoryRepo.queryFacts(options.tenantId, { userId: options.userId, includeExpired: true })).length +
      (await ProceduralMemoryRepo.list(options.tenantId, { userId: options.userId })).length

    return {
      needsBackfill: v2Count < legacyCount,
      legacyCount,
      v2Count,
    }
  }
}

// Helper functions for migrating each layer

async function migrateWorkingMemory(
  tenantId: string,
  userId?: string,
  dryRun?: boolean,
): Promise<{ count: number; errors: Array<{ layer: string; key: string; error: string }> }> {
  const errors: Array<{ layer: string; key: string; error: string }> = []
  let count = 0

  // Get all keys from legacy working memory using stats()
  const legacy = workingMemory
  const stats = legacy.stats()
  const keys = stats.keys

  for (const key of keys) {
    try {
      const value = legacy.get(key)
      if (value !== null && value !== undefined) {
        if (!dryRun) {
          await WorkingMemoryRepo.set(tenantId, key, value, { userId })
        }
        count++
      }
    } catch (err) {
      errors.push({ layer: "working", key, error: String(err) })
    }
  }

  return { count, errors }
}

async function migrateEpisodicMemory(
  tenantId: string,
  userId?: string,
  dryRun?: boolean,
): Promise<{ count: number; errors: Array<{ layer: string; key: string; error: string }> }> {
  const errors: Array<{ layer: string; key: string; error: string }> = []
  let count = 0

  const legacy = episodicMemory

  // Get recent episodes from legacy
  const episodes = await legacy.getRecentEpisodes(100)

  for (const episode of episodes) {
    try {
      if (!dryRun) {
        await EpisodicMemoryRepo.recordEpisode({
          id: episode.id,
          tenant_id: tenantId,
          user_id: userId ?? null,
          task_description: episode.taskDescription,
          outcome: episode.outcome,
          confidence: 80, // default confidence
          started_at: new Date(episode.startedAt).getTime(),
          completed_at: new Date(episode.completedAt).getTime(),
          created_at: Date.now(),
        })
      }
      count++
    } catch (err) {
      errors.push({ layer: "episodic", key: String(episode.id), error: String(err) })
    }
  }

  return { count, errors }
}

async function migrateSemanticMemory(
  tenantId: string,
  userId?: string,
  dryRun?: boolean,
): Promise<{ count: number; errors: Array<{ layer: string; key: string; error: string }> }> {
  const errors: Array<{ layer: string; key: string; error: string }> = []
  let count = 0

  const legacy = semanticMemory

  // Query all facts from legacy
  const facts = await legacy.query()

  for (const fact of facts) {
    try {
      if (!dryRun) {
        await SemanticMemoryRepo.assertFact({
          id: fact.id,
          tenant_id: tenantId,
          user_id: userId ?? null,
          subject: fact.subject,
          predicate: fact.predicate,
          object: typeof fact.object === "string" ? fact.object : JSON.stringify(fact.object),
          confidence: fact.confidence * 100, // Convert 0-1 to 0-100
          provenance: (fact as any).provenance ?? undefined,
          valid_from: Date.now(),
        })
      }
      count++
    } catch (err) {
      errors.push({ layer: "semantic", key: String(fact.id), error: String(err) })
    }
  }

  return { count, errors }
}

async function migrateProceduralMemory(
  tenantId: string,
  userId?: string,
  dryRun?: boolean,
): Promise<{ count: number; errors: Array<{ layer: string; key: string; error: string }> }> {
  const errors: Array<{ layer: string; key: string; error: string }> = []
  let count = 0

  const legacy = proceduralMemory

  // List all procedures from legacy
  const procedures = await legacy.list()

  for (const proc of procedures) {
    try {
      if (!dryRun) {
        await ProceduralMemoryRepo.register({
          id: proc.id,
          tenant_id: tenantId,
          user_id: userId ?? null,
          scope: (proc as any).scope ?? "global",
          name: proc.name,
          description: proc.description ?? null,
          status: (proc as any).status ?? "active",
          current_version: proc.version,
          success_rate: (proc as any).successRate ? (proc as any).successRate * 100 : 50,
          usage_count: (proc as any).usageCount ?? 0,
          created_at: Date.now(),
          updated_at: Date.now(),
        })
      }
      count++
    } catch (err) {
      errors.push({ layer: "procedural", key: String(proc.id), error: String(err) })
    }
  }

  return { count, errors }
}

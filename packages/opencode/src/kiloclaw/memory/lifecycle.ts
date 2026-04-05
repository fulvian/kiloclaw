import { Log } from "@/util/log"
import { Flag } from "@/flag/flag"
import type {
  RunArtifacts,
  MemoryEntry,
  Classification,
  RetentionPolicy,
  ConsolidationResult,
  EpisodeId,
  Layer,
  MemoryId,
  PurgeReason,
  PurgeResult,
  SensitivityLevel,
} from "./types.js"
import {
  RunArtifactsSchema,
  MemoryEntrySchema,
  ClassificationSchema,
  RetentionPolicySchema,
  PurgeResultSchema,
} from "./types.js"
import { AgencyId, AgentId, CorrelationId } from "../types.js"
import type { MemoryLifecycle as IMemoryLifecycle } from "./types.js"
import { memoryBroker } from "./broker.js"
import { semanticMemory } from "./semantic.js"
import { episodicMemory } from "./episodic.js"
import { MemoryRetention } from "./memory.retention.js"
import { MemoryDb } from "./memory.db.js"
import { WorkingMemoryRepo, EpisodicMemoryRepo, SemanticMemoryRepo, ProceduralMemoryRepo } from "./memory.repository.js"

const log = Log.create({ service: "kiloclaw.memory.lifecycle" })

// Track pending retention jobs
let retentionTimer: ReturnType<typeof setInterval> | null = null

export namespace MemoryLifecycle {
  async function ensureRepo(): Promise<void> {
    if (!Flag.KILO_EXPERIMENTAL_MEMORY_V2) return
    try {
      await WorkingMemoryRepo.count("default")
    } catch {
      await MemoryDb.init(":memory:")
    }
  }

  /**
   * Capture run artifacts and classify for storage
   */
  export function capture(run: RunArtifacts): MemoryEntry[] {
    const validated = RunArtifactsSchema.parse(run)

    const entries: MemoryEntry[] = []

    // Create intent entry
    entries.push(
      MemoryEntrySchema.parse({
        id: `mem_${crypto.randomUUID()}` as MemoryId,
        layer: "working",
        key: `intent:${validated.intent}`,
        value: { intent: validated.intent, plan: validated.plan },
        sensitivity: "high",
        category: "session",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    )

    // Create outcome entry
    entries.push(
      MemoryEntrySchema.parse({
        id: `mem_${crypto.randomUUID()}` as MemoryId,
        layer: "episodic",
        key: `outcome:${Date.now()}`,
        value: {
          outcome: validated.outcome,
          durationMs: validated.durationMs,
          evidences: validated.evidences,
        },
        sensitivity: "medium",
        category: "session",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    )

    log.debug("run artifacts captured", { intent: validated.intent })
    return entries
  }

  /**
   * Classify artifacts for layer assignment
   */
  export function classify(artifacts: MemoryEntry[]): Classification[] {
    return artifacts.map((artifact) => classifyArtifact(artifact))
  }

  /**
   * Apply retention policy based on layer and domain
   */
  export function applyRetentionPolicy(layer: Layer, domain?: string): RetentionPolicy {
    // Return layer-specific default policy
    const policy: RetentionPolicy = {
      layer,
      encryption: layer === "working" ? "none" : layer === "episodic" ? "standard" : "strong",
      compress: layer === "episodic",
    }

    // Apply domain-specific overrides
    if (domain === "audit") {
      policy.ttlMs = 365 * 24 * 60 * 60 * 1000 // 1 year for audit data
      policy.encryption = "maximum"
    }

    log.debug("retention policy determined", { layer, domain })
    return RetentionPolicySchema.parse(policy)
  }

  /**
   * Consolidate episodic memories into semantic/procedural
   */
  export async function consolidate(sourceEpisodes: EpisodeId[]): Promise<ConsolidationResult> {
    log.info("starting consolidation", { episodeCount: sourceEpisodes.length })

    // Get episode details
    const episodes = []
    for (const episodeId of sourceEpisodes) {
      const episode = await episodicMemory.getEpisode(episodeId)
      if (episode) episodes.push(episode)
    }

    if (episodes.length === 0) {
      return {
        sourceEpisodes,
        targetEntry: MemoryEntrySchema.parse({
          id: `mem_${crypto.randomUUID()}` as MemoryId,
          layer: "semantic",
          key: "empty_consolidation",
          value: { message: "No episodes found" },
          sensitivity: "low",
          category: "system",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }),
        confidence: 0,
      }
    }

    // Extract common patterns
    const outcomes = episodes.map((e) => e.outcome)
    const agencies = [...new Set(episodes.map((e) => e.agencyId))]

    // Create consolidated entry
    const consolidated = await semanticMemory.consolidate(sourceEpisodes)

    log.info("consolidation complete", {
      episodeCount: episodes.length,
      confidence: consolidated.confidence,
    })

    return consolidated
  }

  /**
   * Purge a single entry
   */
  export async function purge(entryId: MemoryId, reason: PurgeReason): Promise<void> {
    if (Flag.KILO_EXPERIMENTAL_MEMORY_V2) {
      const layer = inferLayerFromId(entryId)
      await MemoryRetention.purgeEntries("default", [
        {
          layer,
          id: entryId,
          reason: "manual",
        },
      ])
      log.info("entry purged (V2)", { entryId, reason, layer })
      return
    }

    await memoryBroker.purge(entryId, reason)
    log.info("entry purged", { entryId, reason })
  }

  /**
   * Purge multiple entries
   */
  export async function purgeBatch(entryIds: MemoryId[], reason: PurgeReason): Promise<PurgeResult> {
    const result: PurgeResult = {
      purged: 0,
      failed: 0,
      errors: [],
    }

    for (const id of entryIds) {
      try {
        await purge(id, reason)
        result.purged++
      } catch (error) {
        result.failed++
        result.errors.push({
          id,
          reason: error instanceof Error ? error.message : "Unknown error",
        })
      }
    }

    log.info("batch purge complete", { purged: result.purged, failed: result.failed })
    return PurgeResultSchema.parse(result)
  }

  /**
   * Start automatic retention enforcement
   */
  export function startRetentionEnforcement(intervalMs: number = 60 * 60 * 1000): void {
    if (retentionTimer) {
      log.warn("retention enforcement already running")
      return
    }

    retentionTimer = setInterval(() => {
      enforceRetention().catch((err) => {
        log.error("retention enforcement failed", { error: err })
      })
    }, intervalMs)

    log.info("retention enforcement started", { intervalMs })
  }

  /**
   * Stop automatic retention enforcement
   */
  export function stopRetentionEnforcement(): void {
    if (retentionTimer) {
      clearInterval(retentionTimer)
      retentionTimer = null
      log.info("retention enforcement stopped")
    }
  }

  /**
   * Enforce retention policies
   */
  async function enforceRetention(): Promise<void> {
    log.debug("running retention enforcement")

    if (Flag.KILO_EXPERIMENTAL_MEMORY_V2) {
      // V2 uses MemoryRetention from the persistence layer
      try {
        const workingResult = await MemoryRetention.enforcePolicy("default", "working")
        const episodicResult = await MemoryRetention.enforcePolicy("default", "episodic")
        log.info("V2 retention enforcement completed", {
          workingPurged: workingResult.purged,
          episodicPurged: episodicResult.purged,
        })
      } catch (err) {
        log.error("V2 retention enforcement failed", { err })
      }
      return
    }

    // Legacy: clean up working memory expired entries
    memoryBroker.working().cleanup()

    // In production, would also:
    // - Check episodic memory for expired episodes
    // - Check semantic memory for outdated facts
    // - Apply privacy/right-to-forgiveness policies
  }

  /**
   * Get memory statistics across all layers
   */
  export async function getStats(): Promise<{
    working: { size: number; keys: string[] }
    episodic: { totalEpisodes: number; totalEvents: number }
    semantic: { totalFacts: number }
    procedural: { totalProcedures: number; totalPatterns: number }
  }> {
    if (Flag.KILO_EXPERIMENTAL_MEMORY_V2) {
      await ensureRepo()
      const working = await WorkingMemoryRepo.getMany("default", [])
      const totalEpisodes = await EpisodicMemoryRepo.count("default")
      const totalEvents = await EpisodicMemoryRepo.countEvents("default")
      const totalFacts = await SemanticMemoryRepo.count("default")
      const totalProcedures = await ProceduralMemoryRepo.count("default")

      const legacyWorking = memoryBroker.working().stats()
      const legacyEpisodic = await episodicMemory.getStats()
      const legacyProcedures = await memoryBroker.procedural().list()
      const mergedKeys = [...new Set([...Object.keys(working), ...legacyWorking.keys])]

      return {
        working: { size: mergedKeys.length, keys: mergedKeys },
        episodic: {
          totalEpisodes: Math.max(totalEpisodes, legacyEpisodic.totalEpisodes),
          totalEvents: Math.max(totalEvents, legacyEpisodic.totalEvents),
        },
        semantic: { totalFacts },
        procedural: { totalProcedures: Math.max(totalProcedures, legacyProcedures.length), totalPatterns: 0 },
      }
    }

    const episodicStats = await episodicMemory.getStats()
    const procedures = await memoryBroker.procedural().list()

    return {
      working: memoryBroker.working().stats(),
      episodic: {
        totalEpisodes: episodicStats.totalEpisodes,
        totalEvents: episodicStats.totalEvents,
      },
      semantic: {
        totalFacts: 0,
      },
      procedural: {
        totalProcedures: procedures.length,
        totalPatterns: 0,
      },
    }
  }
}

function classifyArtifact(entry: MemoryEntry): Classification {
  const key = entry.key.toLowerCase()
  if (entry.layer === "working") {
    return ClassificationSchema.parse({
      layer: "working",
      sensitivity: "high",
      confidence: 0.9,
      reasoning: "working_context",
    })
  }

  if (entry.layer === "episodic") {
    return ClassificationSchema.parse({
      layer: "episodic",
      sensitivity: "medium",
      confidence: 0.85,
      reasoning: "episodic_event",
    })
  }

  if (key.includes("procedure") || key.includes("playbook") || key.includes("runbook")) {
    return ClassificationSchema.parse({
      layer: "procedural",
      sensitivity: "medium",
      confidence: 0.8,
      reasoning: "procedural_pattern",
    })
  }

  return ClassificationSchema.parse({
    layer: "semantic",
    sensitivity: "low",
    confidence: 0.75,
    reasoning: "semantic_fact",
  })
}

function inferLayerFromId(id: string): string {
  if (id.startsWith("wk_") || id.startsWith("mem_")) return "working"
  if (id.startsWith("ep_") || id.startsWith("ev_")) return "episodic"
  if (id.startsWith("fact_") || id.startsWith("vec_")) return "semantic"
  if (id.startsWith("proc_") || id.startsWith("pv_")) return "procedural"
  return "semantic"
}

// Export as MemoryLifecycle interface
export const memoryLifecycle: IMemoryLifecycle = {
  capture: MemoryLifecycle.capture,
  classify: MemoryLifecycle.classify,
  applyRetentionPolicy: MemoryLifecycle.applyRetentionPolicy,
  consolidate: MemoryLifecycle.consolidate,
  purge: MemoryLifecycle.purge,
  purgeBatch: MemoryLifecycle.purgeBatch,
  getStats: MemoryLifecycle.getStats,
}

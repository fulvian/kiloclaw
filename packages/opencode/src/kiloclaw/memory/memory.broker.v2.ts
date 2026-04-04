/**
 * MemoryBrokerV2 - Persistent Memory Broker with dual-write support
 *
 * Provides persistent storage while maintaining backward compatibility
 * with the legacy in-memory broker. Uses feature flag to enable.
 *
 * ADR-005: Memory Persistence Refoundation
 */

import { Log } from "@/util/log"
import { Flag } from "@/flag/flag"
import { memoryBroker as legacyBroker } from "./broker"
import type { MemoryId } from "./types"
import {
  WorkingMemoryRepo,
  EpisodicMemoryRepo,
  SemanticMemoryRepo,
  ProceduralMemoryRepo,
  UserProfileRepo,
  FeedbackRepo,
  AuditRepo,
} from "./memory.repository"
import { rank, applyBudget, DEFAULT_BUDGET, DEFAULT_WEIGHTS, DEFAULT_THRESHOLDS } from "./memory.ranking"
import type { RankedItem, TokenBudget } from "./memory.ranking"

const log = Log.create({ service: "kiloclaw.memory.broker.v2" })

export interface MemoryBrokerV2 {
  // Working memory
  working(): {
    set(key: string, value: unknown, ttlMs?: number): Promise<void>
    get(key: string): Promise<unknown | null>
    delete(key: string): Promise<void>
  }

  // Episodic memory
  episodic(): {
    record(event: { type: string; data: Record<string, unknown>; correlationId?: string }): Promise<string>
    getRecent(count: number, since?: number): Promise<any[]>
  }

  // Semantic memory
  semantic(): {
    assert(subject: string, predicate: string, object: unknown, confidence?: number): Promise<string>
    query(pattern?: string): Promise<any[]>
    similaritySearch(text: string, k?: number): Promise<any[]>
  }

  // Unified operations
  write(entry: {
    layer: "working" | "episodic" | "semantic" | "procedural"
    key: string
    value: unknown
    sensitivity?: string
    ttlMs?: number
  }): Promise<void>

  read(query: {
    layer?: "working" | "episodic" | "semantic" | "procedural"
    limit?: number
    sensitivityMax?: string
  }): Promise<any[]>

  // Ranking and retrieval
  retrieve(options: {
    query?: string
    limit?: number
    budget?: Partial<TokenBudget>
    weights?: typeof DEFAULT_WEIGHTS
  }): Promise<{
    items: RankedItem<any>[]
    tokenUsage: number
  }>

  // Feedback
  feedback(vote: "up" | "down", reason: string, targetId: string, correction?: string): Promise<void>
}

export const MemoryBrokerV2: MemoryBrokerV2 = {
  working() {
    return {
      async set(key: string, value: unknown, ttlMs?: number): Promise<void> {
        if (!Flag.KILO_EXPERIMENTAL_MEMORY_V2) {
          // Legacy mode
          legacyBroker.working().set(key, value, ttlMs)
          return
        }

        // Dual-write: write to both legacy and persistent
        legacyBroker.working().set(key, value, ttlMs)

        try {
          await WorkingMemoryRepo.set("default", key, value, {
            sensitivity: "medium",
            ttlMs,
          })
        } catch (err) {
          log.error("working memory persist failed", { key, err })
        }
      },

      async get(key: string): Promise<unknown | null> {
        if (!Flag.KILO_EXPERIMENTAL_MEMORY_V2) {
          return legacyBroker.working().get(key) ?? null
        }

        // Try persistent first, fallback to legacy
        try {
          const persistent = await WorkingMemoryRepo.get("default", key)
          if (persistent !== null) return persistent
        } catch (err) {
          log.error("working memory persist read failed", { key, err })
        }

        return legacyBroker.working().get(key) ?? null
      },

      async delete(key: string): Promise<void> {
        if (!Flag.KILO_EXPERIMENTAL_MEMORY_V2) {
          legacyBroker.working().remove(key)
          return
        }

        legacyBroker.working().remove(key)

        try {
          await WorkingMemoryRepo.delete("default", key)
        } catch (err) {
          log.error("working memory persist delete failed", { key, err })
        }
      },
    }
  },

  episodic() {
    return {
      async record(event: { type: string; data: Record<string, unknown>; correlationId?: string }): Promise<string> {
        if (!Flag.KILO_EXPERIMENTAL_MEMORY_V2) {
          // Legacy mode - just log
          log.debug("episodic event (legacy)", { type: event.type })
          return `legacy_${Date.now()}`
        }

        // Dual-write
        const id = `ev_${crypto.randomUUID()}`

        try {
          await EpisodicMemoryRepo.recordEvent({
            id,
            tenant_id: "default",
            correlation_id: event.correlationId ?? null,
            event_type: event.type,
            payload: JSON.stringify(event.data),
            sensitivity: "medium",
            ts: Date.now(),
            created_at: Date.now(),
          })

          // Log to audit
          await AuditRepo.log({
            id: crypto.randomUUID(),
            actor: "system",
            action: "create",
            target_type: "event",
            target_id: id,
            reason: `episodic_record:${event.type}`,
            correlation_id: event.correlationId ?? null,
            previous_hash: "",
            hash: "",
            metadata_json: { eventType: event.type },
            ts: Date.now(),
            created_at: Date.now(),
          })
        } catch (err) {
          log.error("episodic event persist failed", { id, err })
        }

        return id
      },

      async getRecent(count: number, since?: number): Promise<any[]> {
        if (!Flag.KILO_EXPERIMENTAL_MEMORY_V2) {
          return legacyBroker.episodic().getRecentEpisodes(count, since ? new Date(since) : undefined)
        }

        try {
          return await EpisodicMemoryRepo.getRecentEpisodes("default", count, since)
        } catch (err) {
          log.error("episodic getRecent failed", { err })
          return legacyBroker.episodic().getRecentEpisodes(count, since ? new Date(since) : undefined)
        }
      },
    }
  },

  semantic() {
    return {
      async assert(subject: string, predicate: string, object: unknown, confidence = 80): Promise<string> {
        if (!Flag.KILO_EXPERIMENTAL_MEMORY_V2) {
          // Legacy mode
          const fact = await legacyBroker.semantic().assert({
            subject,
            predicate,
            object,
            confidence,
            source: "legacy",
          })
          return fact
        }

        const id = `fact_${crypto.randomUUID()}`

        try {
          await SemanticMemoryRepo.assertFact({
            id,
            tenant_id: "default",
            subject,
            predicate,
            object: JSON.stringify(object),
            confidence,
            provenance: "broker_v2",
            source_event_ids: [],
            valid_from: Date.now(),
            created_at: Date.now(),
            updated_at: Date.now(),
          })

          await AuditRepo.log({
            id: crypto.randomUUID(),
            actor: "system",
            action: "create",
            target_type: "fact",
            target_id: id,
            reason: "semantic_assert",
            previous_hash: "",
            hash: "",
            metadata_json: { subject, predicate },
            ts: Date.now(),
            created_at: Date.now(),
          })
        } catch (err) {
          log.error("semantic assert persist failed", { id, err })
        }

        return id
      },

      async query(pattern?: string): Promise<any[]> {
        if (!Flag.KILO_EXPERIMENTAL_MEMORY_V2) {
          return legacyBroker.semantic().query(pattern)
        }

        try {
          return await SemanticMemoryRepo.queryFacts("default", {
            subject: pattern,
            minConfidence: 30,
          })
        } catch (err) {
          log.error("semantic query failed", { err })
          return legacyBroker.semantic().query(pattern)
        }
      },

      async similaritySearch(text: string, k = 5): Promise<any[]> {
        if (!Flag.KILO_EXPERIMENTAL_MEMORY_V2) {
          // Legacy: use broker.search which handles text->embedding conversion
          const results = await legacyBroker.search({ text, k })
          return results.map((r) => ({
            fact: r.entry.value,
            similarity: r.score,
          }))
        }

        try {
          // Generate embedding for query
          const queryEmbedding = textToEmbedding(text)
          const results = await SemanticMemoryRepo.similaritySearch(queryEmbedding, k, "default")
          return results.map((r) => ({
            fact: r.fact,
            similarity: r.similarity,
          }))
        } catch (err) {
          log.error("similarity search failed", { err })
          // Fallback to legacy on error
          const results = await legacyBroker.search({ text, k })
          return results.map((r) => ({
            fact: r.entry.value,
            similarity: r.score,
          }))
        }
      },
    }
  },

  async write(entry: {
    layer: "working" | "episodic" | "semantic" | "procedural"
    key: string
    value: unknown
    sensitivity?: string
    ttlMs?: number
  }): Promise<void> {
    if (!Flag.KILO_EXPERIMENTAL_MEMORY_V2) {
      // Cast id to MemoryId type
      const id = `mem_${crypto.randomUUID()}` as MemoryId
      await legacyBroker.write({
        id,
        layer: entry.layer,
        key: entry.key,
        value: entry.value,
        sensitivity: (entry.sensitivity as any) ?? "medium",
        category: "session",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      return
    }

    // V2 mode - use appropriate repo
    switch (entry.layer) {
      case "working":
        await this.working().set(entry.key, entry.value, entry.ttlMs)
        break
      case "episodic":
        await this.episodic().record({
          type: "memory_write",
          data: { key: entry.key, value: entry.value },
        })
        break
      case "semantic":
        await this.semantic().assert(entry.key, "value", entry.value)
        break
      default:
        log.warn("write to procedural not implemented in v2", { layer: entry.layer })
    }
  },

  async read(query: {
    layer?: "working" | "episodic" | "semantic" | "procedural"
    limit?: number
    sensitivityMax?: string
  }): Promise<any[]> {
    if (!Flag.KILO_EXPERIMENTAL_MEMORY_V2) {
      return legacyBroker.read({
        layer: query.layer,
        limit: query.limit ?? 100,
        sensitivityMax: query.sensitivityMax as any,
      })
    }

    // V2 mode
    if (query.layer === "working") {
      const items = await WorkingMemoryRepo.getMany("default", [])
      return Object.entries(items).map(([key, value]) => ({
        id: key,
        layer: "working",
        key,
        value,
      }))
    }

    if (query.layer === "episodic") {
      return this.episodic().getRecent(query.limit ?? 50)
    }

    if (query.layer === "semantic") {
      return this.semantic().query()
    }

    return []
  },

  async retrieve(options: {
    query?: string
    limit?: number
    budget?: Partial<TokenBudget>
    weights?: typeof DEFAULT_WEIGHTS
  }): Promise<{ items: RankedItem<any>[]; tokenUsage: number }> {
    const limit = options.limit ?? 50
    const budget = { ...DEFAULT_BUDGET, ...options.budget }
    const weights = options.weights ?? DEFAULT_WEIGHTS

    if (!Flag.KILO_EXPERIMENTAL_MEMORY_V2) {
      // Legacy mode - use broker search
      const results = await legacyBroker.search({
        text: options.query,
        k: limit,
      })

      // Map legacy factors to new ScoreFactors format
      const rankedItems: RankedItem<any>[] = results.map((r) => ({
        item: r.entry,
        score: r.score,
        factors: {
          relevanceVector: r.factors.relevance,
          recencyNorm: r.factors.recency,
          confidence: r.factors.confidence,
          successSignal: 0.5,
          provenanceQuality: r.factors.provenance,
          userPreferenceMatch: 0.5,
          sensitivityPenalty: r.factors.sensitivity,
          contradictionPenalty: 0,
        },
        explain: [],
      }))

      return {
        items: rankedItems,
        tokenUsage: 0,
      }
    }

    // V2 mode - hybrid retrieval
    const candidates: RankedItem<any>[] = []

    try {
      // Get working memory
      const workingItems = await WorkingMemoryRepo.getMany("default", [])
      for (const [key, value] of Object.entries(workingItems)) {
        candidates.push({
          item: { id: key, layer: "working", key, value },
          score: 0.8,
          factors: {
            relevanceVector: 0.5,
            recencyNorm: 0.5,
            confidence: 0.9,
            successSignal: 0.5,
            provenanceQuality: 0.5,
            userPreferenceMatch: 0.5,
            sensitivityPenalty: 0,
            contradictionPenalty: 0,
          },
          explain: ["working_memory"],
        })
      }

      // Get episodic
      const episodes = await EpisodicMemoryRepo.getRecentEpisodes("default", 20)
      for (const ep of episodes) {
        candidates.push({
          item: { layer: "episodic" as const, ...ep },
          score: 0.6,
          factors: {
            relevanceVector: 0.5,
            recencyNorm: 0.5,
            confidence: ep.confidence / 100,
            successSignal: 0.5,
            provenanceQuality: 0.5,
            userPreferenceMatch: 0.5,
            sensitivityPenalty: 0,
            contradictionPenalty: 0,
          },
          explain: ["episodic_memory"],
        })
      }

      // Get semantic
      const facts = await SemanticMemoryRepo.queryFacts("default", { minConfidence: 30 })
      for (const fact of facts) {
        candidates.push({
          item: { layer: "semantic" as const, ...fact },
          score: fact.confidence / 100,
          factors: {
            relevanceVector: 0.5,
            recencyNorm: 0.5,
            confidence: fact.confidence / 100,
            successSignal: 0.5,
            provenanceQuality: 0.5,
            userPreferenceMatch: 0.5,
            sensitivityPenalty: 0,
            contradictionPenalty: 0,
          },
          explain: ["semantic_fact"],
        })
      }

      // Rank all candidates
      const ranked = rank(candidates, weights, DEFAULT_THRESHOLDS)

      // Apply budget
      const maxTokens = limit * 100 // rough estimate
      const result = applyBudget(ranked, budget, maxTokens)

      return {
        items: result.selected,
        tokenUsage: result.tokenUsage,
      }
    } catch (err) {
      log.error("retrieve failed", { err })
      return { items: [], tokenUsage: 0 }
    }
  },

  async feedback(vote: "up" | "down", reason: string, targetId: string, correction?: string): Promise<void> {
    if (!Flag.KILO_EXPERIMENTAL_MEMORY_V2) {
      log.debug("feedback recorded (legacy)", { vote, reason, targetId })
      return
    }

    try {
      await FeedbackRepo.record({
        id: crypto.randomUUID(),
        tenant_id: "default",
        target_type: "memory",
        target_id: targetId,
        vote,
        reason,
        correction_text: correction ?? null,
        ts: Date.now(),
        created_at: Date.now(),
      })

      await AuditRepo.log({
        id: crypto.randomUUID(),
        actor: "user",
        action: vote === "up" ? "feedback_positive" : "feedback_negative",
        target_type: "memory",
        target_id: targetId,
        reason: `feedback:${reason}`,
        previous_hash: "",
        hash: "",
        metadata_json: { vote, reason, correction },
        ts: Date.now(),
        created_at: Date.now(),
      })
    } catch (err) {
      log.error("feedback record failed", { err })
    }
  },
}

// Simple text to embedding (same as in broker.ts)
function textToEmbedding(text: string): number[] {
  const dimension = 128
  const embedding = new Array(dimension).fill(0)

  let hash = 0
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0
  }

  const seed = Math.abs(hash)
  for (let i = 0; i < dimension; i++) {
    const nextSeed = (seed * 1103515245 + 12345) & 0x7fffffff
    embedding[i] = (nextSeed % 1000) / 1000 - 0.5
  }

  const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0))
  return norm > 0 ? embedding.map((v) => v / norm) : embedding
}

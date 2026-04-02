import { Log } from "@/util/log"
import { fn } from "@/util/fn"
import z from "zod"
import type {
  MemoryEntry,
  MemoryQuery,
  SemanticQuery,
  Classification,
  RetentionPolicy,
  PurgeReason,
  RankedResult,
  Layer,
  MemoryId,
  WorkingMemory,
  EpisodicMemory,
  SemanticMemory,
  ProceduralMemory,
} from "./types.js"
import {
  MemoryEntrySchema,
  MemoryQuerySchema,
  SemanticQuerySchema,
  ClassificationSchema,
  RetentionPolicySchema,
  RankedResultSchema,
} from "./types.js"
import type { MemoryBroker as IMemoryBroker } from "./types.js"
import { workingMemory } from "./working.js"
import { episodicMemory } from "./episodic.js"
import { semanticMemory } from "./semantic.js"
import { proceduralMemory } from "./procedural.js"

const log = Log.create({ service: "kiloclaw.memory.broker" })

// Retention policies by layer (defaults)
const DEFAULT_RETENTION: Record<Layer, RetentionPolicy> = {
  working: {
    layer: "working",
    ttlMs: 60 * 60 * 1000, // 1 hour
    maxEntries: 1000,
    encryption: "none",
    compress: false,
  },
  episodic: {
    layer: "episodic",
    ttlMs: 90 * 24 * 60 * 60 * 1000, // 90 days
    maxEntries: 10000,
    encryption: "standard",
    compress: true,
  },
  semantic: {
    layer: "semantic",
    encryption: "strong",
    compress: false,
  },
  procedural: {
    layer: "procedural",
    encryption: "strong",
    compress: false,
  },
}

export namespace MemoryBroker {
  /**
   * Get the working memory layer
   */
  export function working(): WorkingMemory {
    return workingMemory
  }

  /**
   * Get the episodic memory layer
   */
  export function episodic(): EpisodicMemory {
    return episodicMemory
  }

  /**
   * Get the semantic memory layer
   */
  export function semantic(): SemanticMemory {
    return semanticMemory
  }

  /**
   * Get the procedural memory layer
   */
  export function procedural(): ProceduralMemory {
    return proceduralMemory
  }

  /**
   * Write a memory entry to the appropriate layer
   */
  export async function write(entry: MemoryEntry): Promise<void> {
    const validated = MemoryEntrySchema.parse(entry)

    switch (validated.layer) {
      case "working":
        workingMemory.set(validated.key, validated.value)
        break
      case "episodic":
        // Episodic uses events, not key-value
        log.warn("episodic layer does not support direct write", { key: validated.key })
        break
      case "semantic":
        // Semantic uses facts
        await semanticMemory.assert({
          subject: validated.key,
          predicate: "value",
          object: validated.value,
          confidence: 1 - (validated.sensitivity === "critical" ? 0.1 : validated.sensitivity === "high" ? 0.3 : 0),
          source: "broker",
        })
        break
      case "procedural":
        // Procedural uses procedures
        log.warn("procedural layer does not support direct write", { key: validated.key })
        break
    }

    log.debug("memory entry written", { layer: validated.layer, key: validated.key })
  }

  /**
   * Read memory entries matching a query
   */
  export async function read(query: MemoryQuery): Promise<MemoryEntry[]> {
    const validated = MemoryQuerySchema.parse(query)
    const results: MemoryEntry[] = []

    // Determine which layers to query
    const layers: Layer[] = validated.layer ? [validated.layer] : ["working", "episodic", "semantic", "procedural"]

    for (const layer of layers) {
      switch (layer) {
        case "working": {
          if (validated.keys) {
            const values = workingMemory.getMany(validated.keys)
            for (const [key, value] of Object.entries(values)) {
              results.push(createMemoryEntry("working", key, value))
            }
          } else {
            const snapshot = workingMemory.snapshot()
            for (const [key, value] of snapshot.entries()) {
              results.push(createMemoryEntry("working", key, value))
            }
          }
          break
        }
        case "episodic": {
          const episodes = await episodicMemory.getRecentEpisodes(
            validated.limit || 50,
            validated.since ? new Date(validated.since) : undefined,
          )
          for (const episode of episodes) {
            results.push(createMemoryEntry("episodic", episode.id, episode))
          }
          break
        }
        case "semantic": {
          const facts = await semanticMemory.query()
          for (const fact of facts) {
            results.push(createMemoryEntry("semantic", fact.id, fact))
          }
          break
        }
        case "procedural": {
          const procedures = await proceduralMemory.list()
          for (const proc of procedures) {
            results.push(createMemoryEntry("procedural", proc.id, proc))
          }
          break
        }
      }
    }

    // Filter by sensitivity
    let filtered = results
    if (validated.sensitivityMax) {
      const sensitivityOrder = ["low", "medium", "high", "critical"]
      const maxIdx = sensitivityOrder.indexOf(validated.sensitivityMax)
      filtered = filtered.filter((r) => {
        const idx = sensitivityOrder.indexOf(r.sensitivity)
        return idx <= maxIdx
      })
    }

    return filtered.slice(0, validated.limit)
  }

  /**
   * Search semantic memory using embeddings
   */
  export async function search(query: SemanticQuery): Promise<RankedResult[]> {
    const validated = SemanticQuerySchema.parse(query)

    // Convert text to embedding if provided
    const embedding = validated.embedding || (validated.text ? textToEmbedding(validated.text) : null)

    if (!embedding) {
      return []
    }

    const similarFacts = await semanticMemory.similaritySearch(embedding, validated.k)

    return similarFacts.map((sf) =>
      RankedResultSchema.parse({
        entry: createMemoryEntry("semantic", sf.fact.id, sf.fact),
        score: sf.similarity,
        factors: {
          recency: 0.5,
          relevance: sf.similarity,
          confidence: sf.fact.confidence,
          sensitivity: 0.5,
          provenance: 0.5,
        },
      }),
    )
  }

  /**
   * Classify an entry for layer assignment
   */
  export function classify(entry: unknown): Classification {
    // Simple heuristic classification
    // In production, would use ML model or rules engine
    if (typeof entry === "string" && entry.length < 100) {
      return ClassificationSchema.parse({
        layer: "working",
        sensitivity: "medium",
        confidence: 0.9,
        reasoning: "Short string - likely operational context",
      })
    }

    if (typeof entry === "object" && entry !== null) {
      const obj = entry as Record<string, unknown>

      // Check for task-like structure
      if (obj.taskId || obj.taskDescription) {
        return ClassificationSchema.parse({
          layer: "episodic",
          sensitivity: "medium",
          confidence: 0.8,
          reasoning: "Task-like structure - episodic memory",
        })
      }

      // Check for procedure-like structure
      if (obj.steps || obj.name) {
        return ClassificationSchema.parse({
          layer: "procedural",
          sensitivity: "low",
          confidence: 0.7,
          reasoning: "Procedure-like structure - procedural memory",
        })
      }

      // Check for fact-like structure
      if (obj.subject || obj.predicate) {
        return ClassificationSchema.parse({
          layer: "semantic",
          sensitivity: "medium",
          confidence: 0.85,
          reasoning: "Fact-like structure - semantic memory",
        })
      }
    }

    // Default to working memory
    return ClassificationSchema.parse({
      layer: "working",
      sensitivity: "medium",
      confidence: 0.5,
      reasoning: "Default classification - working memory",
    })
  }

  /**
   * Apply retention policy
   */
  export function retain(entry: MemoryEntry, policy: RetentionPolicy): void {
    const validated = RetentionPolicySchema.parse(policy)

    // Store policy for later enforcement
    // In production, would track policies in persistent storage
    log.debug("retention policy applied", {
      layer: entry.layer,
      key: entry.key,
      policy: validated,
    })
  }

  /**
   * Purge a memory entry
   */
  export async function purge(entryId: MemoryId, reason: PurgeReason): Promise<void> {
    log.info("purging memory entry", { entryId, reason })

    // In production, would remove from persistent storage
    // and add to audit log
  }

  /**
   * Get retention policy for a layer
   */
  export function getRetentionPolicy(layer: Layer): RetentionPolicy {
    return DEFAULT_RETENTION[layer]
  }

  /**
   * Clear all memory layers
   */
  export function clearAll(): void {
    workingMemory.clear()
    episodicMemory.clear()
    semanticMemory.clear()
    proceduralMemory.clear()
    log.info("all memory layers cleared")
  }
}

// Helper to create memory entries
function createMemoryEntry(layer: Layer, key: string, value: unknown): MemoryEntry {
  return MemoryEntrySchema.parse({
    id: `mem_${crypto.randomUUID()}` as MemoryId,
    layer,
    key,
    value,
    sensitivity: "medium",
    category: "session",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
}

// Simple text to embedding conversion (same as in semantic.ts)
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

// Export as MemoryBroker interface
export const memoryBroker: IMemoryBroker = {
  working: MemoryBroker.working,
  episodic: MemoryBroker.episodic,
  semantic: MemoryBroker.semantic,
  procedural: MemoryBroker.procedural,
  write: MemoryBroker.write,
  read: MemoryBroker.read,
  search: MemoryBroker.search,
  classify: MemoryBroker.classify,
  retain: MemoryBroker.retain,
  purge: MemoryBroker.purge,
}

/**
 * Memory Adapter - Wires MemoryBrokerV2 into the orchestrator
 *
 * Provides a MemoryBroker interface compatible with CoreOrchestrator
 * when KILO_EXPERIMENTAL_MEMORY_V2 is enabled.
 *
 * Also provides helpers for lifecycle operations to use V2 when enabled.
 */

import { Flag } from "@/flag/flag"
import { MemoryBrokerV2 } from "./memory/memory.broker.v2"
import { memoryBroker as legacyBroker } from "./memory/broker"
import type { MemoryEntry, MemoryId, PurgeReason } from "./memory/types"

// MemoryBroker interface - defined locally to avoid circular dependency with orchestrator
export interface MemoryBroker {
  read(key: string): Promise<unknown>
  write(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
  list(prefix: string): Promise<string[]>
}

const store = new Map<string, unknown>()

/**
 * Get memory broker for orchestrator
 * Returns V2 broker when enabled, otherwise uses in-memory store
 */
export function getOrchestratorMemory(): MemoryBroker {
  if (Flag.KILO_EXPERIMENTAL_MEMORY_V2) {
    return {
      async read(key: string): Promise<unknown> {
        const result = await MemoryBrokerV2.working().get(key)
        return result
      },
      async write(key: string, value: unknown): Promise<void> {
        await MemoryBrokerV2.working().set(key, value)
      },
      async delete(key: string): Promise<void> {
        await MemoryBrokerV2.working().delete(key)
      },
      async list(prefix: string): Promise<string[]> {
        const items = await MemoryBrokerV2.read({ layer: "working" })
        return items.filter((item: any) => item.key?.startsWith(prefix)).map((item: any) => item.key)
      },
    }
  }

  // Legacy fallback - use in-memory store
  return {
    async read(key: string): Promise<unknown> {
      return store.get(key)
    },
    async write(key: string, value: unknown): Promise<void> {
      store.set(key, value)
    },
    async delete(key: string): Promise<void> {
      store.delete(key)
    },
    async list(prefix: string): Promise<string[]> {
      return [...store.keys()].filter((k) => k.startsWith(prefix))
    },
  }
}

/**
 * Write a memory entry using V2 or legacy based on flag
 */
export async function writeEntry(entry: MemoryEntry): Promise<void> {
  if (Flag.KILO_EXPERIMENTAL_MEMORY_V2) {
    await MemoryBrokerV2.write({
      layer: entry.layer,
      key: entry.key,
      value: entry.value,
      sensitivity: entry.sensitivity,
      ttlMs: entry.expiresAt ? new Date(entry.expiresAt).getTime() - Date.now() : undefined,
    })
  } else {
    await legacyBroker.write(entry)
  }
}

/**
 * Read memory entries using V2 or legacy based on flag
 */
export async function readEntries(query: {
  layer?: "working" | "episodic" | "semantic" | "procedural"
  limit?: number
  sensitivityMax?: string
}): Promise<MemoryEntry[]> {
  if (Flag.KILO_EXPERIMENTAL_MEMORY_V2) {
    return await MemoryBrokerV2.read(query)
  } else {
    return await legacyBroker.read(query as any)
  }
}

/**
 * Purge a memory entry using V2 or legacy based on flag
 */
export async function purgeEntry(entryId: MemoryId, reason: PurgeReason): Promise<void> {
  if (Flag.KILO_EXPERIMENTAL_MEMORY_V2) {
    const { MemoryRetention } = await import("./memory/memory.retention")

    const layer = inferLayer(entryId)
    const map = {
      expired: "expired",
      right_to_forget: "right_to_forget",
      policy_breach: "policy_breach",
      manual: "manual",
      migration: "migration",
    } as const

    const result = await MemoryRetention.purgeEntries("default", [
      {
        layer,
        id: entryId,
        reason: map[reason],
      },
    ])

    if (result.failed > 0) {
      throw new Error(result.errors[0]?.reason ?? `failed to purge memory entry ${entryId}`)
    }
  } else {
    await legacyBroker.purge(entryId, reason)
  }
}

function inferLayer(id: string): "working" | "episodic" | "semantic" | "procedural" {
  if (id.startsWith("wk_") || id.startsWith("mem_")) return "working"
  if (id.startsWith("ep_") || id.startsWith("ev_")) return "episodic"
  if (id.startsWith("fact_") || id.startsWith("vec_")) return "semantic"
  return "procedural"
}

import { Log } from "@/util/log"
import { MemoryBrokerV2 } from "./memory.broker.v2"
import { memoryBroker as legacyBroker } from "./broker"
import { MemoryMetrics } from "./memory.metrics"

const log = Log.create({ service: "kiloclaw.memory.shadow" })

export namespace MemoryShadow {
  export async function compare(query: string, limit: number = 20): Promise<{
    mismatch: number
    legacyCount: number
    v2Count: number
    overlap: number
  }> {
    const [legacy, v2] = await Promise.all([
      legacyBroker.search({ text: query, k: limit }),
      MemoryBrokerV2.retrieve({ query, limit }),
    ])

    const legacyIds = new Set(legacy.map((x) => String(x.entry.id)))
    const v2Ids = new Set(v2.items.map((x) => String((x.item as any).id ?? (x.item as any).key ?? "")))

    let overlap = 0
    for (const id of v2Ids) {
      if (legacyIds.has(id)) overlap++
    }

    const base = Math.max(1, Math.max(legacyIds.size, v2Ids.size))
    const mismatch = 1 - overlap / base

    MemoryMetrics.observeShadow(query, mismatch)

    const out = {
      mismatch,
      legacyCount: legacyIds.size,
      v2Count: v2Ids.size,
      overlap,
    }

    log.info("shadow comparison", out)
    return out
  }
}

import { Log } from "@/util/log"

const log = Log.create({ service: "kiloclaw.memory.metrics" })

type RetrievalPoint = {
  latencyMs: number
  tokenUsage: number
  count: number
  ts: number
}

type PurgePoint = {
  purged: number
  failed: number
  ts: number
}

type ShadowPoint = {
  query: string
  mismatch: number
  ts: number
}

const retrieval: RetrievalPoint[] = []
const purge: PurgePoint[] = []
const shadow: ShadowPoint[] = []

const MAX = 5000

export namespace MemoryMetrics {
  export function observeRetrieval(latencyMs: number, tokenUsage: number, count: number): void {
    retrieval.push({ latencyMs, tokenUsage, count, ts: Date.now() })
    trim(retrieval)
  }

  export function observePurge(purged: number, failed: number): void {
    purge.push({ purged, failed, ts: Date.now() })
    trim(purge)
  }

  export function observeShadow(query: string, mismatch: number): void {
    shadow.push({ query, mismatch, ts: Date.now() })
    trim(shadow)
  }

  export function snapshot() {
    const p95 = percentile(retrieval.map((x) => x.latencyMs), 95)
    const avgTokens = avg(retrieval.map((x) => x.tokenUsage))
    const avgCount = avg(retrieval.map((x) => x.count))
    const purgeFailures = purge.reduce((acc, x) => acc + x.failed, 0)
    const purgeTotal = purge.reduce((acc, x) => acc + x.purged + x.failed, 0)
    const mismatchAvg = avg(shadow.map((x) => x.mismatch))

    return {
      retrieval: {
        samples: retrieval.length,
        p95LatencyMs: p95,
        avgTokenUsage: avgTokens,
        avgResultCount: avgCount,
      },
      purge: {
        events: purge.length,
        failureRate: purgeTotal > 0 ? purgeFailures / purgeTotal : 0,
      },
      shadow: {
        samples: shadow.length,
        avgMismatch: mismatchAvg,
      },
      slo: {
        retrievalP95Ok: p95 <= 300,
        purgeFailureRateOk: purgeTotal === 0 ? true : purgeFailures / purgeTotal === 0,
        shadowMismatchOk: mismatchAvg <= 0.5,
      },
    }
  }

  export function logSnapshot(): void {
    const snap = snapshot()
    log.info("memory metrics snapshot", snap)
  }
}

function trim<T>(arr: T[]): void {
  if (arr.length <= MAX) return
  const extra = arr.length - MAX
  arr.splice(0, extra)
}

function avg(values: number[]): number {
  if (values.length === 0) return 0
  const sum = values.reduce((acc, x) => acc + x, 0)
  return sum / values.length
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]
}

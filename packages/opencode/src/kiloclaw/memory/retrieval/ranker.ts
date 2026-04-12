import type { MemoryEntry, RankedResult } from "../types.js"

const SENS_ORDER: Record<MemoryEntry["sensitivity"], number> = {
  low: 1,
  medium: 0.75,
  high: 0.35,
  critical: 0.1,
}

export interface RankWeights {
  readonly recency?: number
  readonly relevance?: number
  readonly confidence?: number
  readonly sensitivity?: number
  readonly provenance?: number
}

export namespace MemoryRanker {
  export function rank(input: {
    entries: MemoryEntry[]
    query?: string
    now?: number
    weights?: RankWeights
  }): RankedResult[] {
    const now = input.now ?? Date.now()
    const weights = {
      recency: input.weights?.recency ?? 0.3,
      relevance: input.weights?.relevance ?? 0.35,
      confidence: input.weights?.confidence ?? 0.2,
      sensitivity: input.weights?.sensitivity ?? 0.1,
      provenance: input.weights?.provenance ?? 0.05,
    }

    const rows = input.entries.map((entry) => {
      const recency = scoreRecency(entry, now)
      const relevance = scoreRelevance(entry, input.query)
      const confidence = scoreConfidence(entry)
      const sensitivity = SENS_ORDER[entry.sensitivity]
      const provenance = scoreProvenance(entry)
      const score =
        recency * weights.recency +
        relevance * weights.relevance +
        confidence * weights.confidence +
        sensitivity * weights.sensitivity +
        provenance * weights.provenance

      return {
        entry,
        score,
        factors: {
          recency,
          relevance,
          confidence,
          sensitivity,
          provenance,
        },
      } satisfies RankedResult
    })

    return rows.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      const timeA = Date.parse(a.entry.updatedAt)
      const timeB = Date.parse(b.entry.updatedAt)
      if (timeB !== timeA) return timeB - timeA
      return a.entry.id.localeCompare(b.entry.id)
    })
  }
}

function scoreRecency(entry: MemoryEntry, now: number): number {
  const age = Math.max(0, now - Date.parse(entry.updatedAt))
  const halfLife = 24 * 60 * 60 * 1000
  return 1 / (1 + age / halfLife)
}

function scoreRelevance(entry: MemoryEntry, query?: string): number {
  if (!query || query.trim().length === 0) return 0.5
  const q = query.toLowerCase()
  const key = entry.key.toLowerCase()
  const text = JSON.stringify(entry.value).toLowerCase()
  if (key.includes(q)) return 1
  if (text.includes(q)) return 0.8
  return 0.2
}

function scoreConfidence(entry: MemoryEntry): number {
  const value = entry.metadata?.confidence
  if (typeof value === "number") {
    if (value < 0) return 0
    if (value > 1) return 1
    return value
  }
  return 0.5
}

function scoreProvenance(entry: MemoryEntry): number {
  const source = entry.metadata?.source
  if (typeof source === "string" && source.trim().length > 0) return 1
  return 0.4
}

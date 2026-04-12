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

type RecallGatePoint = {
  decision: "recall" | "shadow" | "skip"
  confidence: number
  lang: string
  reasons: string[]
  ts: number
}

type SemanticTriggerPoint = {
  triggerType: "semantic" | "bm25_fallback" | "keyword_legacy"
  semanticScore: number
  topEpisodeSimilarity: number
  episodesCompared: number
  lmStudioAvailable: boolean
  decision: "recall" | "shadow" | "skip"
  confidence: number
  fallbackUsed: boolean
  fallbackReason?: string
  latencyMs: number
  ts: number
}

type InjectionPoint = {
  mode: "minimal" | "standard" | "proactive"
  tokens: number
  count: number
  diversity: number
  ts: number
}

const retrieval: RetrievalPoint[] = []
const purge: PurgePoint[] = []
const shadow: ShadowPoint[] = []
const gate: RecallGatePoint[] = []
const inject: InjectionPoint[] = []
const semanticTrigger: SemanticTriggerPoint[] = []

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

  export function observeGate(input: {
    decision: "recall" | "shadow" | "skip"
    confidence: number
    lang: string
    reasons: string[]
  }): void {
    gate.push({
      decision: input.decision,
      confidence: input.confidence,
      lang: input.lang,
      reasons: input.reasons,
      ts: Date.now(),
    })
    trim(gate)
  }

  export function observeInjection(input: {
    mode: "minimal" | "standard" | "proactive"
    tokens: number
    count: number
    diversity: number
  }): void {
    inject.push({
      mode: input.mode,
      tokens: input.tokens,
      count: input.count,
      diversity: input.diversity,
      ts: Date.now(),
    })
    trim(inject)
  }

  export function observeSemanticTrigger(input: {
    triggerType: "semantic" | "bm25_fallback" | "keyword_legacy"
    semanticScore?: number
    topEpisodeSimilarity?: number
    episodesCompared?: number
    lmStudioAvailable?: boolean
    decision: "recall" | "shadow" | "skip"
    confidence: number
    fallbackUsed: boolean
    fallbackReason?: string
    latencyMs?: number
  }): void {
    semanticTrigger.push({
      triggerType: input.triggerType,
      semanticScore: input.semanticScore ?? 0,
      topEpisodeSimilarity: input.topEpisodeSimilarity ?? 0,
      episodesCompared: input.episodesCompared ?? 0,
      lmStudioAvailable: input.lmStudioAvailable ?? false,
      decision: input.decision,
      confidence: input.confidence,
      fallbackUsed: input.fallbackUsed,
      fallbackReason: input.fallbackReason,
      latencyMs: input.latencyMs ?? 0,
      ts: Date.now(),
    })
    trim(semanticTrigger)
  }

  export function snapshot() {
    const p95 = percentile(
      retrieval.map((x) => x.latencyMs),
      95,
    )
    const avgTokens = avg(retrieval.map((x) => x.tokenUsage))
    const avgCount = avg(retrieval.map((x) => x.count))
    const purgeFailures = purge.reduce((acc, x) => acc + x.failed, 0)
    const purgeTotal = purge.reduce((acc, x) => acc + x.purged + x.failed, 0)
    const mismatchAvg = avg(shadow.map((x) => x.mismatch))
    const recallRate = ratio(gate.filter((x) => x.decision === "recall").length, gate.length)
    const shadowRate = ratio(gate.filter((x) => x.decision === "shadow").length, gate.length)
    const avgGateConfidence = avg(gate.map((x) => x.confidence))
    const avgInjectedTokens = avg(inject.map((x) => x.tokens))
    const avgInjectedCount = avg(inject.map((x) => x.count))
    const avgInjectedDiversity = avg(inject.map((x) => x.diversity))
    const semanticRecallRate = ratio(
      semanticTrigger.filter((x) => x.decision === "recall").length,
      semanticTrigger.length,
    )
    const semanticFallbackRate = ratio(semanticTrigger.filter((x) => x.fallbackUsed).length, semanticTrigger.length)
    const avgSemanticLatencyMs = avg(semanticTrigger.map((x) => x.latencyMs))
    const avgSemanticScore = avg(semanticTrigger.map((x) => x.semanticScore))

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
      gate: {
        samples: gate.length,
        recallRate,
        shadowRate,
        avgConfidence: avgGateConfidence,
      },
      injection: {
        samples: inject.length,
        avgTokens: avgInjectedTokens,
        avgCount: avgInjectedCount,
        avgDiversity: avgInjectedDiversity,
      },
      semanticTrigger: {
        samples: semanticTrigger.length,
        recallRate: semanticRecallRate,
        fallbackRate: semanticFallbackRate,
        avgLatencyMs: avgSemanticLatencyMs,
        avgScore: avgSemanticScore,
      },
      slo: {
        retrievalP95Ok: p95 <= 300,
        purgeFailureRateOk: purgeTotal === 0 ? true : purgeFailures / purgeTotal === 0,
        shadowMismatchOk: mismatchAvg <= 0.5,
        gateConfidenceOk: avgGateConfidence >= 0.5,
        injectionWasteRiskOk: avgInjectedTokens <= 1200,
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

function ratio(n: number, d: number): number {
  if (d === 0) return 0
  return n / d
}

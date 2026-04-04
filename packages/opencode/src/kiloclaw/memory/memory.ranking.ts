/**
 * Memory Ranking - Multi-factor scoring for memory retrieval
 * Based on ADR-005 ranking formula
 */

import { Log } from "@/util/log"

const log = Log.create({ service: "kiloclaw.memory.ranking" })

// =============================================================================
// Ranking Configuration
// =============================================================================

export interface RankingWeights {
  relevanceVector: number // 0.30 default
  recencyNorm: number // 0.20 default
  confidence: number // 0.15 default
  successSignal: number // 0.15 default
  provenanceQuality: number // 0.10 default
  userPreferenceMatch: number // 0.10 default
  sensitivityPenalty: number // -0.20 default
  contradictionPenalty: number // -0.10 default
}

export const DEFAULT_WEIGHTS: RankingWeights = {
  relevanceVector: 0.3,
  recencyNorm: 0.2,
  confidence: 0.15,
  successSignal: 0.15,
  provenanceQuality: 0.1,
  userPreferenceMatch: 0.1,
  sensitivityPenalty: -0.2,
  contradictionPenalty: -0.1,
}

// =============================================================================
// Score Factors
// =============================================================================

export interface ScoreFactors {
  relevanceVector: number // 0-1 cosine similarity
  recencyNorm: number // 0-1 normalized age (1 = fresh, 0 = old)
  confidence: number // 0-1 from fact/procedure confidence
  successSignal: number // 0-1 historical success rate
  provenanceQuality: number // 0-1 source reliability
  userPreferenceMatch: number // 0-1 user preference alignment
  sensitivityPenalty: number // 0-1 sensitivity level
  contradictionPenalty: number // 0-1 contradiction detection
}

export interface RankedItem<T = unknown> {
  item: T
  score: number
  factors: ScoreFactors
  explain: string[]
  excluded?: boolean
  exclusionReason?: string
}

// =============================================================================
// Ranking Thresholds
// =============================================================================

export interface RankingThresholds {
  minConfidence: number // Minimum confidence to include (default 0.3)
  minScore: number // Minimum score to include (default 0.1)
  maxItems: number // Maximum items to return (default 50)
  sensitivityMax: string // Maximum sensitivity level allowed
}

export const DEFAULT_THRESHOLDS: RankingThresholds = {
  minConfidence: 0.3,
  minScore: 0.1,
  maxItems: 50,
  sensitivityMax: "high", // Don't include "critical" by default
}

// =============================================================================
// Sensitivity Levels
// =============================================================================

const SENSITIVITY_ORDER = ["low", "medium", "high", "critical"]
const SENSITIVITY_PENALTY: Record<string, number> = {
  low: 0,
  medium: 0.1,
  high: 0.3,
  critical: 0.6,
}

// =============================================================================
// Main Ranking Function
// =============================================================================

export function rank<T>(
  items: Array<{
    item: T
    relevanceVector?: number
    timestamp?: number
    ageMs?: number
    confidence?: number
    successRate?: number
    provenance?: string
    sensitivity?: string
    userPreferenceMatch?: number
    contradictions?: number
  }>,
  weights: RankingWeights = DEFAULT_WEIGHTS,
  thresholds: RankingThresholds = DEFAULT_THRESHOLDS,
): RankedItem<T>[] {
  const now = Date.now()
  const results: RankedItem<T>[] = []

  for (const raw of items) {
    const factors = computeFactors(raw, now)
    const explain: string[] = []

    // Check sensitivity threshold
    if (raw.sensitivity) {
      const sensitivityIdx = SENSITIVITY_ORDER.indexOf(raw.sensitivity)
      const maxIdx = SENSITIVITY_ORDER.indexOf(thresholds.sensitivityMax)
      if (sensitivityIdx > maxIdx) {
        results.push({
          item: raw.item,
          score: 0,
          factors,
          excluded: true,
          exclusionReason: `Sensitivity ${raw.sensitivity} exceeds threshold ${thresholds.sensitivityMax}`,
          explain: [`Excluded: sensitivity threshold`],
        })
        continue
      }
    }

    // Check minimum confidence
    if (factors.confidence < thresholds.minConfidence) {
      results.push({
        item: raw.item,
        score: 0,
        factors,
        excluded: true,
        exclusionReason: `Confidence ${factors.confidence.toFixed(2)} below minimum ${thresholds.minConfidence}`,
        explain: [`Excluded: confidence below ${thresholds.minConfidence}`],
      })
      continue
    }

    // Compute score
    const score = computeScore(factors, weights, explain)

    // Check minimum score
    if (score < thresholds.minScore) {
      results.push({
        item: raw.item,
        score,
        factors,
        excluded: true,
        exclusionReason: `Score ${score.toFixed(3)} below minimum ${thresholds.minScore}`,
        explain,
      })
      continue
    }

    results.push({
      item: raw.item,
      score,
      factors,
      explain,
    })
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score)

  // Limit results
  return results.slice(0, thresholds.maxItems)
}

// =============================================================================
// Factor Computation
// =============================================================================

function computeFactors(
  raw: {
    relevanceVector?: number
    timestamp?: number
    ageMs?: number
    confidence?: number
    successRate?: number
    provenance?: string
    sensitivity?: string
    userPreferenceMatch?: number
    contradictions?: number
  },
  now: number,
): ScoreFactors {
  return {
    relevanceVector: clamp(raw.relevanceVector ?? 0.5, 0, 1),
    recencyNorm: computeRecencyNorm(now, raw.timestamp, raw.ageMs),
    confidence: clamp(raw.confidence ?? 0.5, 0, 1),
    successSignal: clamp(raw.successRate ?? 0.5, 0, 1),
    provenanceQuality: computeProvenanceQuality(raw.provenance),
    userPreferenceMatch: clamp(raw.userPreferenceMatch ?? 0.5, 0, 1),
    sensitivityPenalty: raw.sensitivity ? (SENSITIVITY_PENALTY[raw.sensitivity] ?? 0) : 0,
    contradictionPenalty: clamp(raw.contradictions ?? 0, 0, 1),
  }
}

function computeRecencyNorm(now: number, timestamp?: number, ageMs?: number): number {
  // If we have explicit timestamp
  if (timestamp) {
    ageMs = now - timestamp
  }

  // If no age data, assume middle-aged
  if (!ageMs) {
    return 0.5
  }

  // Exponential decay with half-life of 1 hour for working memory
  // and 7 days for persistent memory
  const halfLifeMs = 60 * 60 * 1000 // 1 hour
  const decay = Math.exp(-(ageMs / halfLifeMs) * Math.LN2)

  return clamp(decay, 0, 1)
}

function computeProvenanceQuality(provenance?: string): number {
  if (!provenance) return 0.5

  // Source quality scores
  const sourceQuality: Record<string, number> = {
    user_direct: 1.0,
    user_feedback: 0.9,
    task_result: 0.8,
    agent_inference: 0.6,
    system_default: 0.4,
    unknown: 0.3,
  }

  const normalized = provenance.toLowerCase().trim()
  return sourceQuality[normalized] ?? 0.5
}

// =============================================================================
// Score Computation
// =============================================================================

function computeScore(factors: ScoreFactors, weights: RankingWeights, explain: string[]): number {
  let score = 0

  // Positive factors
  const relevanceContrib = weights.relevanceVector * factors.relevanceVector
  score += relevanceContrib
  if (relevanceContrib > 0.1) explain.push(`relevance:${relevanceContrib.toFixed(2)}`)

  const recencyContrib = weights.recencyNorm * factors.recencyNorm
  score += recencyContrib
  if (recencyContrib > 0.05) explain.push(`recency:${recencyContrib.toFixed(2)}`)

  const confidenceContrib = weights.confidence * factors.confidence
  score += confidenceContrib
  if (confidenceContrib > 0.03) explain.push(`confidence:${confidenceContrib.toFixed(2)}`)

  const successContrib = weights.successSignal * factors.successSignal
  score += successContrib
  if (successContrib > 0.03) explain.push(`success:${successContrib.toFixed(2)}`)

  const provenanceContrib = weights.provenanceQuality * factors.provenanceQuality
  score += provenanceContrib
  if (provenanceContrib > 0.02) explain.push(`provenance:${provenanceContrib.toFixed(2)}`)

  const prefContrib = weights.userPreferenceMatch * factors.userPreferenceMatch
  score += prefContrib
  if (prefContrib > 0.02) explain.push(`preference:${prefContrib.toFixed(2)}`)

  // Negative factors
  const sensitivityContrib = weights.sensitivityPenalty * factors.sensitivityPenalty
  score += sensitivityContrib
  if (sensitivityContrib < -0.01) explain.push(`sensitivity_penalty:${sensitivityContrib.toFixed(2)}`)

  const contradictionContrib = weights.contradictionPenalty * factors.contradictionPenalty
  score += contradictionContrib
  if (contradictionContrib < -0.01) explain.push(`contradiction_penalty:${contradictionContrib.toFixed(2)}`)

  return Math.max(0, score)
}

// =============================================================================
// Utility Functions
// =============================================================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

// =============================================================================
// Ranking with Deduplication
// =============================================================================

export interface DeduplicationKey {
  fingerprint: string
  content?: string
}

export function rankAndDeduplicate<T extends DeduplicationKey>(
  items: Array<{
    item: T
    relevanceVector?: number
    timestamp?: number
    ageMs?: number
    confidence?: number
    successRate?: number
    provenance?: string
    sensitivity?: string
    userPreferenceMatch?: number
    contradictions?: number
  }>,
  weights?: RankingWeights,
  thresholds?: RankingThresholds,
): RankedItem<T>[] {
  // First pass: rank all items
  const ranked = rank(items, weights, thresholds)

  // Deduplicate by fingerprint
  const seen = new Set<string>()
  const results: RankedItem<T>[] = []

  for (const entry of ranked) {
    const key = entry.item.fingerprint
    if (!seen.has(key)) {
      seen.add(key)
      results.push(entry)
    } else {
      log.debug("deduplicated", { fingerprint: key, score: entry.score })
    }
  }

  return results
}

// =============================================================================
// Budget-Aware Ranking
// =============================================================================

export interface TokenBudget {
  working: number // 20%
  episodic: number // 25%
  semantic: number // 35%
  procedural: number // 15%
  reserve: number // 5%
}

export const DEFAULT_BUDGET: TokenBudget = {
  working: 0.2,
  episodic: 0.25,
  semantic: 0.35,
  procedural: 0.15,
  reserve: 0.05,
}

export function applyBudget<T>(
  rankedItems: RankedItem<T>[],
  budget: TokenBudget,
  maxTokens: number,
): { selected: RankedItem<T>[]; tokenUsage: number } {
  const byLayer = new Map<string, { items: RankedItem<T>[]; budgetTokens: number }>()

  // Group by layer
  for (const entry of rankedItems) {
    const layer = (entry.item as any).layer ?? "unknown"
    if (!byLayer.has(layer)) {
      byLayer.set(layer, { items: [], budgetTokens: 0 })
    }
    byLayer.get(layer)!.items.push(entry)
  }

  const selected: RankedItem<T>[] = []
  let totalTokens = 0

  // Allocate tokens per layer
  for (const [layer, data] of byLayer) {
    const layerBudget = budget[layer as keyof TokenBudget] ?? 0.05
    const layerTokens = Math.floor(maxTokens * layerBudget)

    for (const entry of data.items) {
      const itemTokens = estimateTokens(entry.item)

      if (totalTokens + itemTokens <= maxTokens && data.budgetTokens + itemTokens <= layerTokens) {
        selected.push(entry)
        totalTokens += itemTokens
        data.budgetTokens += itemTokens
      }
    }
  }

  return { selected, tokenUsage: totalTokens }
}

function estimateTokens(item: unknown): number {
  // Rough estimation: 1 token ≈ 4 characters for English
  const json = JSON.stringify(item)
  return Math.ceil(json.length / 4)
}

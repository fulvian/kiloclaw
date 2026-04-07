/**
 * Semantic Memory Trigger Policy
 *
 * Decides WHETHER to recall using ONLY semantic similarity.
 * ZERO hardcoded keywords - works for ALL languages automatically.
 *
 * Algorithm:
 * 1. Embed user query
 * 2. Fetch N most recent episodes
 * 3. Embed each episode text
 * 4. Compute cosine similarity between query and each episode
 * 5. If max_similarity > threshold → recall/shadow
 *
 * Fallback: If LM Studio unavailable, use BM25 lexical similarity
 *
 * Reference: Based on ReMe paper (Hybrid retrieval Vector 0.7 + BM25 0.3)
 * https://github.com/agentscope-ai/ReMe
 */

import { Log } from "@/util/log"
import { Flag } from "@/flag/flag"
import { MemoryEmbedding } from "./memory.embedding"
import { EpisodicMemory } from "./episodic"
import { MemoryMetrics } from "./memory.metrics"
import type { EpisodeId } from "./types"

const log = Log.create({ service: "kiloclaw.memory.semantic-trigger" })

// Configurazione tramite env (valori di default dal piano)
const SEMANTIC_THRESHOLD_RECALL = Flag.KILOCLAW_SEMANTIC_THRESHOLD_RECALL
const SEMANTIC_THRESHOLD_SHADOW = Flag.KILOCLAW_SEMANTIC_THRESHOLD_SHADOW
const RECENT_EPISODES_COUNT = Flag.KILOCLAW_SEMANTIC_EPISODES_COUNT
const FALLBACK_BM25_THRESHOLD = 0.35

export type SemanticTriggerResult = {
  shouldRecall: boolean
  decision: "recall" | "shadow" | "skip"
  confidence: number
  topSimilarity: number
  topEpisodeId: EpisodeId | null
  episodesCompared: number
  fallbackUsed: boolean
  fallbackReason?: string
}

export namespace SemanticTriggerPolicy {
  /**
   * Decide WHETHER to recall using ONLY semantic similarity.
   * ZERO hardcoded keywords - works for ALL languages automatically.
   */
  export async function evaluate(
    query: string,
    options?: {
      episodeCount?: number
      signal?: AbortSignal
    },
  ): Promise<SemanticTriggerResult> {
    const start = performance.now()
    const count = options?.episodeCount ?? RECENT_EPISODES_COUNT

    // Step 1: Fetch recent episodes (already stored from previous sessions)
    let episodes: any[] = []
    try {
      episodes = await EpisodicMemory.getRecentEpisodes(count)
    } catch (err) {
      log.warn("failed to fetch episodes for semantic trigger", { err: String(err) })
      return {
        shouldRecall: false,
        decision: "skip",
        confidence: 0,
        topSimilarity: 0,
        topEpisodeId: null,
        episodesCompared: 0,
        fallbackUsed: false,
      }
    }

    if (episodes.length === 0) {
      log.debug("no episodes found for semantic trigger")
      return {
        shouldRecall: false,
        decision: "skip",
        confidence: 0,
        topSimilarity: 0,
        topEpisodeId: null,
        episodesCompared: 0,
        fallbackUsed: false,
      }
    }

    // Step 2: Embed query
    let queryEmbedding: number[]
    let lmStudioAvailable = true
    try {
      queryEmbedding = await MemoryEmbedding.embed(query)
    } catch (err) {
      lmStudioAvailable = false
      log.warn("LM Studio unavailable for semantic trigger, using BM25 fallback", { err: String(err) })
      return evaluateWithBM25Fallback(query, episodes)
    }

    // Step 3: Compute similarities
    const similarities: Array<{ episodeId: EpisodeId; similarity: number; text: string }> = []

    for (const ep of episodes) {
      const text = `${ep.task_description ?? ""} ${ep.outcome ?? ""}`.trim()
      if (!text) continue

      try {
        // For efficiency, we could batch-embed, but for trigger we want simplicity
        const epEmbedding = await MemoryEmbedding.embed(text)
        const similarity = cosineSimilarity(queryEmbedding, epEmbedding)

        similarities.push({
          episodeId: ep.id,
          similarity,
          text: text.slice(0, 200),
        })
      } catch (err) {
        log.warn("failed to embed episode", { episodeId: ep.id, err: String(err) })
      }
    }

    // Step 4: Find max similarity
    similarities.sort((a, b) => b.similarity - a.similarity)
    const top = similarities[0]
    const topSimilarity = top?.similarity ?? 0

    // Step 5: Decision based on threshold
    let decision: "recall" | "shadow" | "skip"
    let shouldRecall: boolean

    if (topSimilarity >= SEMANTIC_THRESHOLD_RECALL) {
      decision = "recall"
      shouldRecall = true
    } else if (topSimilarity >= SEMANTIC_THRESHOLD_SHADOW) {
      decision = Flag.KILO_MEMORY_RECALL_TRI_STATE || Flag.KILO_MEMORY_SHADOW_MODE ? "shadow" : "skip"
      shouldRecall = decision === "shadow"
    } else {
      decision = "skip"
      shouldRecall = false
    }

    const elapsed = performance.now() - start

    const result: SemanticTriggerResult = {
      shouldRecall,
      decision,
      confidence: topSimilarity,
      topSimilarity,
      topEpisodeId: top?.episodeId ?? null,
      episodesCompared: similarities.length,
      fallbackUsed: false,
    }

    // Log metric
    MemoryMetrics.observeSemanticTrigger({
      triggerType: "semantic",
      semanticScore: topSimilarity,
      topEpisodeSimilarity: topSimilarity,
      episodesCompared: similarities.length,
      lmStudioAvailable,
      decision,
      confidence: topSimilarity,
      fallbackUsed: false,
      latencyMs: elapsed,
    })

    log.debug("semantic trigger evaluated", {
      query: query.slice(0, 50),
      decision,
      confidence: topSimilarity.toFixed(3),
      topEpisodeId: top?.episodeId,
      episodesCompared: similarities.length,
      elapsedMs: elapsed.toFixed(1),
    })

    return result
  }

  /**
   * BM25 Fallback when LM Studio is unavailable.
   * Uses lexical matching as fallback - still better than hardcoded keywords.
   */
  function evaluateWithBM25Fallback(query: string, episodes: any[]): SemanticTriggerResult {
    if (!Flag.KILOCLAW_SEMANTIC_TRIGGER_BM25_FALLBACK) {
      return {
        shouldRecall: false,
        decision: "skip",
        confidence: 0,
        topSimilarity: 0,
        topEpisodeId: null,
        episodesCompared: 0,
        fallbackUsed: true,
        fallbackReason: "bm25_fallback_disabled",
      }
    }

    const queryTerms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2)

    const scores: Array<{ episodeId: EpisodeId; score: number; text: string }> = []

    for (const ep of episodes) {
      const text = `${ep.task_description ?? ""} ${ep.outcome ?? ""}`.toLowerCase().trim()
      if (!text) continue

      // Simple TF-based scoring (simplified BM25)
      let score = 0
      for (const term of queryTerms) {
        const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")
        const matches = text.match(regex)
        if (matches) {
          score += matches.length / text.split(/\s+/).length
        }
      }

      if (score > 0) {
        scores.push({
          episodeId: ep.id,
          score: score / Math.max(queryTerms.length, 1),
          text: text.slice(0, 200),
        })
      }
    }

    scores.sort((a, b) => b.score - a.score)
    const top = scores[0]
    const topScore = top?.score ?? 0

    let decision: "recall" | "shadow" | "skip"
    let shouldRecall: boolean

    if (topScore >= FALLBACK_BM25_THRESHOLD) {
      decision = "recall"
      shouldRecall = true
    } else if (topScore >= FALLBACK_BM25_THRESHOLD * 0.7) {
      decision = Flag.KILO_MEMORY_RECALL_TRI_STATE || Flag.KILO_MEMORY_SHADOW_MODE ? "shadow" : "skip"
      shouldRecall = decision === "shadow"
    } else {
      decision = "skip"
      shouldRecall = false
    }

    MemoryMetrics.observeSemanticTrigger({
      triggerType: "bm25_fallback",
      semanticScore: topScore,
      topEpisodeSimilarity: topScore,
      episodesCompared: episodes.length,
      lmStudioAvailable: false,
      decision,
      confidence: topScore,
      fallbackUsed: true,
      fallbackReason: "lm_studio_unavailable",
      latencyMs: 0,
    })

    log.debug("semantic trigger evaluated (BM25 fallback)", {
      query: query.slice(0, 50),
      decision,
      confidence: topScore.toFixed(3),
      topEpisodeId: top?.episodeId,
      episodesCompared: episodes.length,
    })

    return {
      shouldRecall,
      decision,
      confidence: topScore,
      topSimilarity: topScore,
      topEpisodeId: top?.episodeId ?? null,
      episodesCompared: episodes.length,
      fallbackUsed: true,
      fallbackReason: "lm_studio_unavailable",
    }
  }
}

/**
 * Compute cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0,
    normA = 0,
    normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const na = Math.sqrt(normA)
  const nb = Math.sqrt(normB)
  return na === 0 || nb === 0 ? 0 : dot / (na * nb)
}

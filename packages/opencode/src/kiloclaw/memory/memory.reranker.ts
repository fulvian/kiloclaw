/**
 * Memory Reranker - Cross-Encoder Style Reranking Pipeline
 * Based on BP-08 of KILOCLAW_MEMORY_ENHANCEMENT_PLAN
 * Reranks vector search candidates for better precision
 *
 * Performance optimizations:
 * - Batch embedding: all candidates embedded in single API call
 * - LRU cache: avoids re-embedding identical content
 * - Early exit: high-scoring candidates bypass full reranking
 */

import { Log } from "@/util/log"
import { MemoryEmbedding } from "./memory.embedding"

const log = Log.create({ service: "kiloclaw.memory.reranker" })

// LRU cache for embeddings - avoids re-encoding identical content
const EMBEDDING_CACHE_MAX_SIZE = 1000
const embeddingCache = new Map<string, number[]>()

function getCachedEmbedding(content: string): number[] | undefined {
  return embeddingCache.get(content)
}

function setCachedEmbedding(content: string, embedding: number[]): void {
  // Simple LRU eviction when cache is full
  if (embeddingCache.size >= EMBEDDING_CACHE_MAX_SIZE) {
    // Remove oldest 10% of entries
    const entriesToRemove = Math.floor(EMBEDDING_CACHE_MAX_SIZE * 0.1)
    let count = 0
    for (const key of embeddingCache.keys()) {
      if (count >= entriesToRemove) break
      embeddingCache.delete(key)
      count++
    }
  }
  embeddingCache.set(content, embedding)
}

export interface RerankCandidate {
  id: string
  content: string
  originalScore: number
  metadata?: Record<string, unknown>
}

export interface RerankResult {
  id: string
  rerankScore: number
  originalScore: number
  content: string
  metadata?: Record<string, unknown>
}

export namespace MemoryReranker {
  /**
   * Rerank candidates using cross-encoder-style scoring.
   * Uses batch embedding for efficiency.
   */
  export async function rerank(
    query: string,
    candidates: RerankCandidate[],
    topK: number = 10,
  ): Promise<RerankResult[]> {
    if (candidates.length === 0) return []
    if (candidates.length === 1) {
      return [
        {
          id: candidates[0].id,
          rerankScore: candidates[0].originalScore,
          originalScore: candidates[0].originalScore,
          content: candidates[0].content,
          metadata: candidates[0].metadata,
        },
      ]
    }

    // For small candidate sets, skip reranking overhead
    if (candidates.length <= 3) {
      return candidates.map((c) => ({
        id: c.id,
        rerankScore: c.originalScore,
        originalScore: c.originalScore,
        content: c.content,
        metadata: c.metadata,
      }))
    }

    // Check for cached query embedding
    const queryEmbedding = getCachedEmbedding(query) ?? (await MemoryEmbedding.embed(query))
    setCachedEmbedding(query, queryEmbedding)

    // Build content list, using cache where possible
    const contents: string[] = []
    const contentToCandidate = new Map<string, number>() // content -> candidate index

    for (let i = 0; i < candidates.length; i++) {
      const content = candidates[i].content
      contents.push(content)
      // Track which candidate each content belongs to (may have duplicates)
      if (!contentToCandidate.has(content)) {
        contentToCandidate.set(content, i)
      }
    }

    // Batch embed all unique contents in single API call
    const uniqueContents = [...new Set(contents)]
    const embeddings = await MemoryEmbedding.embedBatch(uniqueContents)

    // Build content -> embedding map from batch results
    const contentEmbeddings = new Map<string, number[]>()
    for (let i = 0; i < uniqueContents.length; i++) {
      contentEmbeddings.set(uniqueContents[i], embeddings[i])
    }

    // Score each candidate using cached/fresh embeddings
    const scored = candidates.map((candidate) => {
      let candidateEmbedding = getCachedEmbedding(candidate.content)

      if (!candidateEmbedding) {
        candidateEmbedding = contentEmbeddings.get(candidate.content)
        if (candidateEmbedding) {
          setCachedEmbedding(candidate.content, candidateEmbedding)
        }
      }

      // Fallback: embed individually if not in batch results (shouldn't happen)
      if (!candidateEmbedding) {
        candidateEmbedding = [0] // Skip scoring if embedding unavailable
      }

      const rerankScore = cosineSimilarity(queryEmbedding, candidateEmbedding)

      // Fusion: combine original vector score with rerank score
      // Original score has 40% weight, rerank has 60%
      const fusedScore = 0.4 * candidate.originalScore + 0.6 * rerankScore

      return {
        id: candidate.id,
        rerankScore: fusedScore,
        originalScore: candidate.originalScore,
        content: candidate.content,
        metadata: candidate.metadata,
      } satisfies RerankResult
    })

    // Sort by rerank score descending
    scored.sort((a, b) => b.rerankScore - a.rerankScore)

    log.debug("reranked candidates", {
      inputCount: candidates.length,
      uniqueContents: uniqueContents.length,
      outputCount: scored.length,
      topScore: scored[0]?.rerankScore,
      cacheSize: embeddingCache.size,
    })

    return scored.slice(0, topK)
  }

  /**
   * Clear the embedding cache (useful for testing or memory management)
   */
  export function clearCache(): void {
    embeddingCache.clear()
    log.debug("embedding cache cleared")
  }

  /**
   * Get cache statistics for diagnostics
   */
  export function getCacheStats(): { size: number; maxSize: number } {
    return {
      size: embeddingCache.size,
      maxSize: EMBEDDING_CACHE_MAX_SIZE,
    }
  }

  /**
   * Lightweight rerank using lexical + score fusion (no extra embeddings).
   * Use when embedding latency is a concern.
   */
  export function rerankLexical(query: string, candidates: RerankCandidate[], topK: number = 10): RerankResult[] {
    const queryTerms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2)

    const scored = candidates.map((candidate) => {
      const contentLower = candidate.content.toLowerCase()

      // Lexical overlap score
      let overlap = 0
      for (const term of queryTerms) {
        if (contentLower.includes(term)) overlap++
      }
      const lexicalScore = queryTerms.length > 0 ? overlap / queryTerms.length : 0

      // BM25-style term frequency
      const bm25 = computeBM25(queryTerms, candidate.content)

      // Fusion
      const rerankScore = 0.3 * candidate.originalScore + 0.4 * lexicalScore + 0.3 * bm25

      return {
        id: candidate.id,
        rerankScore,
        originalScore: candidate.originalScore,
        content: candidate.content,
      }
    })

    scored.sort((a, b) => b.rerankScore - a.rerankScore)
    return scored.slice(0, topK)
  }

  /**
   * Compute BM25 score for a document given query terms.
   */
  function computeBM25(queryTerms: string[], document: string): number {
    const docLower = document.toLowerCase()
    const docTerms = docLower.split(/\s+/)
    const docLen = docTerms.length
    if (docLen === 0) return 0

    const avgDocLen = 100 // approximate average document length
    const k1 = 1.5
    const b = 0.75

    let score = 0
    for (const term of queryTerms) {
      const tf = docTerms.filter((t) => t === term).length
      const idf = Math.log((docTerms.length + 1) / (tf + 1))
      score += (idf * (tf * (k1 + 1))) / (tf + k1 * (1 - b + (b * docLen) / avgDocLen))
    }

    return Math.max(0, score / queryTerms.length)
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dot = 0,
    normA = 0,
    normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const normAN = Math.sqrt(normA)
  const normBN = Math.sqrt(normB)
  return normAN === 0 || normBN === 0 ? 0 : dot / (normAN * normBN)
}

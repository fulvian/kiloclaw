/**
 * Hybrid Memory Retriever
 *
 * Combines Vector search (semantic) + BM25 (lexical) retrieval.
 * Based on ReMe paper: Vector 0.7 + BM25 0.3
 * Reference: https://github.com/agentscope-ai/ReMe
 *
 * Algorithm:
 * 1. Vector search: embed query + find similar facts/episodes
 * 2. BM25 search: lexical match for exact terms
 * 3. Fusion: weighted sum (default 0.7 vector + 0.3 BM25)
 * 4. Deduplication: merge results from same source
 * 5. Rerank: refine ordering
 */

import { Log } from "@/util/log"
import { Flag } from "@/flag/flag"
import { MemoryEmbedding } from "./memory.embedding"
import { MemoryReranker, type RerankCandidate } from "./memory.reranker"
import { SemanticMemoryRepo, EpisodicMemoryRepo, WorkingMemoryRepo, ProceduralMemoryRepo } from "./memory.repository"
import type { RerankCandidate as RerankCandidateType } from "./memory.reranker"

const log = Log.create({ service: "kiloclaw.memory.hybrid-retriever" })

// Hybrid weights - configurable via env (default from ReMe paper)
const VECTOR_WEIGHT = Flag.KILOCLAW_HYBRID_VECTOR_WEIGHT
const BM25_WEIGHT = Flag.KILOCLAW_HYBRID_BM25_WEIGHT
const TENANT = "default"

export interface HybridRetrievalOptions {
  query: string
  limit?: number
  layers?: Array<"working" | "episodic" | "semantic" | "procedural">
  weights?: {
    vector?: number
    bm25?: number
  }
}

export interface HybridRetrievalResult {
  items: HybridItem[]
  tokenUsage: number
  vectorHits: number
  bm25Hits: number
}

export interface HybridItem {
  item: any
  layer: string
  vectorScore: number
  bm25Score: number
  hybridScore: number
}

export namespace HybridRetriever {
  /**
   * Hybrid retrieval combining Vector search (semantic) + BM25 (lexical).
   */
  export async function retrieve(options: HybridRetrievalOptions): Promise<HybridRetrievalResult> {
    const { query, limit = 20, layers = ["working", "episodic", "semantic", "procedural"] } = options
    const vectorW = options.weights?.vector ?? VECTOR_WEIGHT
    const bm25W = options.weights?.bm25 ?? BM25_WEIGHT

    const candidates: Map<string, HybridItem> = new Map()
    let vectorHits = 0
    let bm25Hits = 0

    // Step 1: Vector search (semantic similarity)
    if (vectorW > 0) {
      try {
        const queryEmbedding = await MemoryEmbedding.embed(query)

        // Search semantic layer (facts have embeddings)
        const semanticResults = await SemanticMemoryRepo.similaritySearch(queryEmbedding, limit * 2, TENANT)
        for (const row of semanticResults) {
          const existing = candidates.get(row.fact.id)
          const hybridScore = row.similarity * vectorW + (existing?.bm25Score ?? 0) * bm25W

          candidates.set(row.fact.id, {
            item: row.fact,
            layer: "semantic",
            vectorScore: row.similarity,
            bm25Score: existing?.bm25Score ?? 0,
            hybridScore,
          })
          vectorHits++
        }
      } catch (err) {
        log.warn("vector search failed", { err: String(err) })
      }
    }

    // Step 2: BM25 lexical search (across all layers)
    if (bm25W > 0) {
      const bm25Candidates = await bm25Search(query, layers, limit * 2)

      for (const candidate of bm25Candidates) {
        const existing = candidates.get(candidate.id)
        const hybridScore = (existing?.vectorScore ?? 0) * vectorW + candidate.bm25Score * bm25W

        candidates.set(candidate.id, {
          item: candidate.item,
          layer: candidate.layer,
          vectorScore: existing?.vectorScore ?? 0,
          bm25Score: candidate.bm25Score,
          hybridScore,
        })
        bm25Hits++
      }
    }

    // Step 3: Sort by hybrid score and apply limit
    const sorted = [...candidates.values()].sort((a, b) => b.hybridScore - a.hybridScore).slice(0, limit)

    // Step 4: Optional reranking using MemoryReranker
    if (sorted.length > 3 && query.length > 0) {
      try {
        const rerankCandidates: RerankCandidateType[] = sorted.map((item, idx) => ({
          id: item.item.id ?? String(idx),
          content: extractContent(item.item, item.layer),
          originalScore: item.hybridScore,
          metadata: { layer: item.layer, hybridScore: item.hybridScore },
        }))

        const reranked = await MemoryReranker.rerank(query, rerankCandidates, limit)

        // Rebuild sorted list from reranked results
        const rerankedMap = new Map(reranked.map((r) => [r.id, r]))
        const rerankedHybrid: HybridItem[] = []

        for (const item of sorted) {
          const id = item.item.id ?? String(Math.random())
          const rerankedResult = rerankedMap.get(id)
          if (rerankedResult) {
            rerankedHybrid.push({
              ...item,
              hybridScore: rerankedResult.rerankScore,
            })
          }
        }

        rerankedHybrid.sort((a, b) => b.hybridScore - a.hybridScore)

        return {
          items: rerankedHybrid.slice(0, limit),
          tokenUsage: estimateTokens(rerankedHybrid),
          vectorHits,
          bm25Hits,
        }
      } catch (err) {
        log.warn("reranking failed, using hybrid scores", { err: String(err) })
      }
    }

    return {
      items: sorted,
      tokenUsage: estimateTokens(sorted),
      vectorHits,
      bm25Hits,
    }
  }

  /**
   * BM25-style lexical search across memory layers.
   */
  async function bm25Search(
    query: string,
    layers: string[],
    limit: number,
  ): Promise<Array<{ id: string; item: any; layer: string; bm25Score: number }>> {
    const results: Array<{ id: string; item: any; layer: string; bm25Score: number }> = []
    const queryTerms = query
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 2)

    if (queryTerms.length === 0) return results

    // Search each layer
    for (const layer of layers) {
      if (layer === "semantic") {
        // Already covered by vector search mostly - add fallback for exact matches
        try {
          const facts = await SemanticMemoryRepo.queryFacts(TENANT, { minConfidence: 30 })
          for (const fact of facts.slice(0, limit)) {
            const text = `${fact.subject ?? ""} ${fact.predicate ?? ""} ${String(fact.object ?? "")}`.toLowerCase()
            const score = computeSimpleBM25(queryTerms, text)
            if (score > 0) {
              results.push({
                id: fact.id,
                item: fact,
                layer: "semantic",
                bm25Score: score,
              })
            }
          }
        } catch (err) {
          log.warn("BM25 semantic search failed", { err: String(err) })
        }
        continue
      }

      if (layer === "episodic") {
        try {
          const episodes = await EpisodicMemoryRepo.getRecentEpisodes(TENANT, limit * 2)
          for (const ep of episodes) {
            const text = `${ep.task_description ?? ""} ${ep.outcome ?? ""}`.toLowerCase()
            const score = computeSimpleBM25(queryTerms, text)
            if (score > 0) {
              results.push({
                id: ep.id,
                item: { layer: "episodic", ...ep },
                layer: "episodic",
                bm25Score: score,
              })
            }
          }
        } catch (err) {
          log.warn("BM25 episodic search failed", { err: String(err) })
        }
        continue
      }

      if (layer === "working") {
        try {
          const items = await WorkingMemoryRepo.getMany(TENANT, [])
          for (const [key, value] of Object.entries(items)) {
            const text = `${key} ${String(value)}`.toLowerCase()
            const score = computeSimpleBM25(queryTerms, text)
            if (score > 0) {
              results.push({
                id: key,
                item: { layer: "working", key, value },
                layer: "working",
                bm25Score: score,
              })
            }
          }
        } catch (err) {
          log.warn("BM25 working search failed", { err: String(err) })
        }
        continue
      }

      if (layer === "procedural") {
        try {
          const procs = await ProceduralMemoryRepo.list(TENANT, { status: "active" })
          for (const proc of procs) {
            const text = `${proc.name ?? ""} ${proc.description ?? ""}`.toLowerCase()
            const score = computeSimpleBM25(queryTerms, text)
            if (score > 0) {
              results.push({
                id: proc.id,
                item: { layer: "procedural", ...proc },
                layer: "procedural",
                bm25Score: score,
              })
            }
          }
        } catch (err) {
          log.warn("BM25 procedural search failed", { err: String(err) })
        }
        continue
      }
    }

    return results.sort((a, b) => b.bm25Score - a.bm25Score).slice(0, limit)
  }

  /**
   * Simple BM25 scoring (simplified - no IDF component for simplicity)
   */
  function computeSimpleBM25(queryTerms: string[], text: string): number {
    if (queryTerms.length === 0 || !text.trim()) return 0

    const textTerms = text.split(/\s+/).filter((t) => t.length > 2)
    if (textTerms.length === 0) return 0

    let score = 0
    for (const term of queryTerms) {
      // Escape special regex characters
      const safeTerm = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      const regex = new RegExp(safeTerm, "gi")
      const matches = text.match(regex)
      if (matches) {
        // TF component (term frequency normalized by document length)
        const tf = matches.length / textTerms.length
        // Add to score with a saturation function
        score += tf / (tf + 1)
      }
    }

    // Normalize by query terms
    return score / Math.max(queryTerms.length, 1)
  }
}

/**
 * Extract searchable content from a memory item based on its layer
 */
function extractContent(item: any, layer: string): string {
  switch (layer) {
    case "episodic":
      return `${item.task_description ?? ""} ${item.outcome ?? ""}`
    case "semantic":
      return `${item.subject ?? ""} ${item.predicate ?? ""} ${String(item.object ?? "")}`
    case "procedural":
      return `${item.name ?? ""} ${item.description ?? ""}`
    case "working":
      return `${item.key ?? ""} ${String(item.value ?? "")}`
    default:
      return JSON.stringify(item)
  }
}

/**
 * Estimate token count for items (rough approximation)
 */
function estimateTokens(items: HybridItem[]): number {
  return items.reduce((sum, item) => sum + extractContent(item.item, item.layer).length / 4, 0)
}

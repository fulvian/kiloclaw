// CapabilityExtractor - Extract capabilities from intent using embeddings
// Based on SEMANTIC_ROUTER_V2_CAPABILITY_BASED.md

import { Log } from "@/util/log"
import { MemoryEmbedding } from "@/kiloclaw/memory"
import { CapabilityRegistry } from "./capability-registry"
import type { Intent, CapabilityMatch } from "./types"
import { cosineSimilarity, hybridScore } from "./utils"

const log = Log.create({ service: "kiloclaw.semantic.capability-extractor" })

// Default capability keywords for fast matching (can be overridden)
// NOTE: IDs here must match registered capability IDs from bootstrap
const DEFAULT_CAPABILITY_KEYWORDS: Record<string, string[]> = {
  search: [
    "search",
    "find",
    "look up",
    "query",
    "retrieve",
    "cerca",
    "cercami",
    "ricerca",
    "web",
    "annuncio",
    "annunci",
    "macbook",
    "pro",
    "silicon",
    "apple",
    "processor",
  ],
  information_gathering: ["information", "gather", "collect", "find", "research", "informazioni"],
  synthesis: ["synthesis", "synthesize", "combine", "merge", "sintesi"],
  web_scraping: ["scrape", "scraping", "extract", "crawl"],
  product_research: [
    "product",
    "products",
    "price",
    "prices",
    "annuncio",
    "annunci",
    "listino",
    "prodotto",
    "buy",
    "sell",
    "purchase",
    "used",
    "usato",
    "new",
    "nuovo",
  ],
  fact_verification: ["verify", "check", "confirm", "fact", "facts", "verifica", "conferma"],
  source_checking: ["source", "sources", "citation", "cite", "reference"],
  claim_validation: ["claim", "claims", "validate", "validation"],
  code_generation: ["code", "generate", "create", "write", "program", "codice", "crea"],
  code_review: ["review", "check", "examine", "assess", "code review", "revisione"],
  debugging: ["debug", "bug", "fix", "error", "issue", "problema", "risolvi"],
  testing: ["test", "testing", "verify", "validate", "tdd"],
  planning: ["plan", "planning", "schedule", "organize", "pianifica"],
  analysis: ["analyze", "analysis", "examine", "investigate", "analizza"],
  summarization: ["summarize", "summary", "brief", "condensed"],
  explanation: ["explain", "explanation", "understand", "spiega"],
  nutrition_analysis: ["nutrition", "nutrients", "calories", "diet", "nutrizione", "calorie", "dieta"],
  recipe_search: ["recipe", "recipes", "cook", "ricetta", "cuocere"],
  meal_planning: ["meal", "plan", "meals", "pasto", "piani"],
  weather_query: ["weather", "temperature", "forecast", "meteo", "previsioni", "temperatura"],
}

export class CapabilityExtractor {
  private registry: CapabilityRegistry
  private embeddingWeight = 0.7
  private keywordBoost = 0.2

  constructor(registry: CapabilityRegistry) {
    this.registry = registry
  }

  /**
   * Extract capabilities from an intent
   */
  async extract(intent: Intent): Promise<CapabilityMatch[]> {
    const text = intent.description

    // First try embedding-based matching
    try {
      const queryEmbedding = await MemoryEmbedding.embed(text)
      const embeddingMatches = await this.registry.findSimilar(queryEmbedding)

      // Also get keyword matches
      const keywords = this.extractKeywords(text)
      const keywordMatches = this.registry.findByKeywords(keywords)

      // Combine results using hybrid scoring
      return this.combineMatches(embeddingMatches, keywordMatches)
    } catch (err) {
      log.warn("embedding extraction failed, using keyword fallback", { err: String(err) })
      // Fallback to keyword-only matching
      const keywords = this.extractKeywords(text)
      return this.registry.findByKeywords(keywords)
    }
  }

  /**
   * Extract capabilities using only keywords (no embeddings)
   */
  extractFromKeywords(intent: Intent): CapabilityMatch[] {
    const keywords = this.extractKeywords(intent.description)
    return this.registry.findByKeywords(keywords)
  }

  /**
   * Extract keywords from text for capability matching
   */
  private extractKeywords(text: string): string[] {
    const words = text.toLowerCase().split(/\s+/)
    const keywords: string[] = []

    // Add bigrams and trigrams for better matching
    const tokens = text.toLowerCase().split(/\s+/)
    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i].length > 2) keywords.push(tokens[i])
      if (i < tokens.length - 1 && tokens[i + 1].length > 2) {
        keywords.push(`${tokens[i]} ${tokens[i + 1]}`)
      }
      if (i < tokens.length - 2 && tokens[i + 2].length > 2) {
        keywords.push(`${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`)
      }
    }

    // Also check against known capability keywords
    for (const [capId, capKeywords] of Object.entries(DEFAULT_CAPABILITY_KEYWORDS)) {
      for (const keyword of capKeywords) {
        if (text.toLowerCase().includes(keyword.toLowerCase())) {
          // Add the capability ID as a potential match
          const capability = this.registry.get(capId)
          if (capability) {
            keywords.push(capId)
          }
          break
        }
      }
    }

    return keywords
  }

  /**
   * Combine embedding and keyword matches using hybrid scoring
   */
  private combineMatches(embeddingMatches: CapabilityMatch[], keywordMatches: CapabilityMatch[]): CapabilityMatch[] {
    const combined = new Map<string, CapabilityMatch>()

    // Add embedding matches
    for (const match of embeddingMatches) {
      combined.set(match.capability.id, { ...match, matchType: "embedding" })
    }

    // Add or boost keyword matches
    for (const match of keywordMatches) {
      const existing = combined.get(match.capability.id)
      if (existing) {
        // Combine scores
        const combinedScore = hybridScore(
          existing.confidence,
          match.confidence + this.keywordBoost,
          this.embeddingWeight,
        )
        combined.set(match.capability.id, {
          ...existing,
          confidence: combinedScore,
          matchType: "hybrid",
        })
      } else {
        // Add with keyword boost
        combined.set(match.capability.id, {
          ...match,
          confidence: Math.min(match.confidence + this.keywordBoost, 1.0),
          matchType: "keyword",
        })
      }
    }

    // Sort by confidence descending
    return Array.from(combined.values()).sort((a, b) => b.confidence - a.confidence)
  }

  /**
   * Set the embedding weight for hybrid scoring
   */
  setEmbeddingWeight(weight: number): void {
    this.embeddingWeight = Math.max(0, Math.min(1, weight))
  }

  /**
   * Set the keyword boost for hybrid scoring
   */
  setKeywordBoost(boost: number): void {
    this.keywordBoost = Math.max(0, Math.min(0.5, boost))
  }
}

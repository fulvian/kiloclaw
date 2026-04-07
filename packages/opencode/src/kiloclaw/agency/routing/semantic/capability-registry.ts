// CapabilityRegistry - Central registry for capabilities with embedding support
// Based on SEMANTIC_ROUTER_V2_CAPABILITY_BASED.md

import { Log } from "@/util/log"
import { MemoryEmbedding } from "@/kiloclaw/memory"
import { CapabilityDescriptorSchema, type CapabilityDescriptor, type CapabilityMatch } from "./types"
import { cosineSimilarity } from "./utils"

const log = Log.create({ service: "kiloclaw.semantic.capability-registry" })

export class CapabilityRegistry {
  private capabilities = new Map<string, CapabilityDescriptor>()
  private capabilitiesByDomain = new Map<string, Set<string>>()
  private embeddingIndex: Map<string, number[]> = new Map()

  // Default similarity threshold for embedding-based matching
  private similarityThreshold = 0.6

  register(capability: CapabilityDescriptor): void {
    const parsed = CapabilityDescriptorSchema.parse(capability)

    if (this.capabilities.has(parsed.id)) {
      throw new Error(`Capability ${parsed.id} already registered`)
    }

    this.capabilities.set(parsed.id, parsed)

    // Index by domain
    if (!this.capabilitiesByDomain.has(parsed.domain)) {
      this.capabilitiesByDomain.set(parsed.domain, new Set())
    }
    this.capabilitiesByDomain.get(parsed.domain)!.add(parsed.id)

    // Store embedding if available
    if (parsed.embedding) {
      this.embeddingIndex.set(parsed.id, parsed.embedding)
    }

    log.debug("capability registered", { id: parsed.id, domain: parsed.domain })
  }

  unregister(capabilityId: string): boolean {
    const cap = this.capabilities.get(capabilityId)
    if (!cap) return false

    this.capabilities.delete(capabilityId)
    this.capabilitiesByDomain.get(cap.domain)?.delete(capabilityId)
    this.embeddingIndex.delete(capabilityId)

    log.debug("capability unregistered", { id: capabilityId })
    return true
  }

  get(capabilityId: string): CapabilityDescriptor | undefined {
    return this.capabilities.get(capabilityId)
  }

  getAll(): CapabilityDescriptor[] {
    return Array.from(this.capabilities.values())
  }

  getByDomain(domain: string): CapabilityDescriptor[] {
    const ids = this.capabilitiesByDomain.get(domain)
    if (!ids) return []
    return Array.from(ids)
      .map((id) => this.capabilities.get(id)!)
      .filter(Boolean)
  }

  /**
   * Find similar capabilities using embedding similarity
   */
  async findSimilar(queryEmbedding: number[], threshold?: number): Promise<CapabilityMatch[]> {
    const thresh = threshold ?? this.similarityThreshold
    const matches: CapabilityMatch[] = []

    for (const [id, embedding] of this.embeddingIndex) {
      const capability = this.capabilities.get(id)!
      const similarity = cosineSimilarity(queryEmbedding, embedding)

      if (similarity >= thresh) {
        matches.push({
          capability,
          confidence: similarity,
          matchType: "embedding",
        })
      }
    }

    // Sort by confidence descending
    matches.sort((a, b) => b.confidence - a.confidence)
    return matches
  }

  /**
   * Find similar capabilities using text query (computes embedding on the fly)
   */
  async findSimilarByText(query: string, threshold?: number): Promise<CapabilityMatch[]> {
    try {
      const queryEmbedding = await MemoryEmbedding.embed(query)
      return this.findSimilar(queryEmbedding, threshold)
    } catch (err) {
      log.warn("embedding failed, falling back to keyword match", { err: String(err) })
      // Fallback to keyword matching
      return this.findByKeywords(query.split(/\s+/), threshold)
    }
  }

  /**
   * Find capabilities by keyword matching (fallback when embeddings unavailable)
   */
  findByKeywords(keywords: string[], threshold = 0.3): CapabilityMatch[] {
    const matches: CapabilityMatch[] = []
    const queryLower = keywords.map((k) => k.toLowerCase())

    for (const capability of this.capabilities.values()) {
      let keywordMatches = 0
      const capKeywordsLower = capability.keywords.map((k) => k.toLowerCase())

      for (const queryWord of queryLower) {
        for (const capWord of capKeywordsLower) {
          if (capWord.includes(queryWord) || queryWord.includes(capWord)) {
            keywordMatches++
            break
          }
        }
      }

      if (keywordMatches > 0) {
        // Confidence is what fraction of the query words matched
        const confidence = keywordMatches / queryLower.length
        if (confidence >= threshold) {
          matches.push({
            capability,
            confidence,
            matchType: "keyword",
          })
        }
      }
    }

    matches.sort((a, b) => b.confidence - a.confidence)
    return matches
  }

  /**
   * Pre-compute and store embeddings for all capabilities that don't have them
   */
  async bootstrapEmbeddings(): Promise<void> {
    const capabilitiesWithoutEmbeddings = Array.from(this.capabilities.values()).filter((cap) => !cap.embedding)

    if (capabilitiesWithoutEmbeddings.length === 0) {
      log.debug("all capabilities already have embeddings")
      return
    }

    log.info("bootstrapping embeddings for capabilities", { count: capabilitiesWithoutEmbeddings.length })

    // Batch embed capability descriptions
    const descriptions = capabilitiesWithoutEmbeddings.map((cap) => cap.description)

    try {
      const embeddings = await MemoryEmbedding.embedBatch(descriptions)

      for (let i = 0; i < capabilitiesWithoutEmbeddings.length; i++) {
        const capability = capabilitiesWithoutEmbeddings[i]
        const embedding = embeddings[i]

        // Update the capability with the computed embedding
        capability.embedding = embedding
        this.embeddingIndex.set(capability.id, embedding)

        log.debug("embedding computed", { id: capability.id })
      }

      log.info("embeddings bootstrapped successfully", { count: capabilitiesWithoutEmbeddings.length })
    } catch (err) {
      log.error("failed to bootstrap embeddings", { err: String(err) })
      throw err
    }
  }

  /**
   * Set the similarity threshold for embedding-based matching
   */
  setSimilarityThreshold(threshold: number): void {
    this.similarityThreshold = threshold
  }

  clear(): void {
    this.capabilities.clear()
    this.capabilitiesByDomain.clear()
    this.embeddingIndex.clear()
    log.debug("registry cleared")
  }

  size(): number {
    return this.capabilities.size
  }
}

// Singleton instance
let registryInstance: CapabilityRegistry | null = null

export function getCapabilityRegistry(): CapabilityRegistry {
  if (!registryInstance) {
    registryInstance = new CapabilityRegistry()
  }
  return registryInstance
}

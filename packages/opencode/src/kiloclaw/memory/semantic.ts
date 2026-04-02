import { Log } from "@/util/log"
import type {
  Fact,
  FactId,
  EntityId,
  EmbeddingId,
  EmbeddingMetadata,
  SimilarFact,
  Relation,
  ConsolidationResult,
  EpisodeId,
  MemoryId,
} from "./types.js"
import { FactSchema, FactIdFactory, EmbeddingMetadataSchema, SimilarFactSchema, RelationSchema } from "./types.js"
import type { SemanticMemory as ISemanticMemory } from "./types.js"

const log = Log.create({ service: "kiloclaw.memory.semantic" })

// Module-level state
const facts = new Map<FactId, Fact>()
const subjectIndex = new Map<string, FactId[]>()
const predicateIndex = new Map<string, FactId[]>()

// Embeddings storage (simulated - in production would use vector DB)
const embeddings = new Map<
  EmbeddingId,
  {
    content: string
    embedding: number[]
    metadata: EmbeddingMetadata
    createdAt: string
  }
>()

// Entity embeddings index
const entityEmbeddings = new Map<EntityId, EmbeddingId[]>()

// Graph relations
const relations = new Map<EntityId, Relation[]>()

// Connected entities index (bidirectional)
const connectedEntities = new Map<EntityId, Set<EntityId>>()

// Simple embedding similarity (cosine similarity)
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  if (normA === 0 || normB === 0) return 0
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

// Simple hash function for text to generate pseudo-embeddings
// In production, would use actual embeddings from ML models
function textToEmbedding(text: string): number[] {
  const dimension = 128
  const embedding = new Array(dimension).fill(0)

  // Simple hash-based embedding
  let hash = 0
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0
  }

  // Seeded pseudo-random for consistency
  const seed = Math.abs(hash)
  for (let i = 0; i < dimension; i++) {
    const nextSeed = (seed * 1103515245 + 12345) & 0x7fffffff
    embedding[i] = (nextSeed % 1000) / 1000 - 0.5
  }

  // Normalize
  const norm = Math.sqrt(embedding.reduce((sum, v) => sum + v * v, 0))
  return norm > 0 ? embedding.map((v) => v / norm) : embedding
}

export namespace SemanticMemory {
  /**
   * Assert a new fact
   */
  export async function assert(fact: Omit<Fact, "id" | "createdAt" | "updatedAt">): Promise<FactId> {
    const id = FactIdFactory.create()
    const now = new Date().toISOString()

    const fullFact: Fact = FactSchema.parse({
      ...fact,
      id,
      createdAt: now,
      updatedAt: now,
    })

    // Store fact
    facts.set(id, fullFact)

    // Index by subject
    const subjectFacts = subjectIndex.get(fullFact.subject) || []
    subjectFacts.push(id)
    subjectIndex.set(fullFact.subject, subjectFacts)

    // Index by predicate
    const predicateFacts = predicateIndex.get(fullFact.predicate) || []
    predicateFacts.push(id)
    predicateIndex.set(fullFact.predicate, predicateFacts)

    log.debug("fact asserted", { factId: id, subject: fullFact.subject })
    return id
  }

  /**
   * Retract a fact
   */
  export async function retract(factId: FactId): Promise<void> {
    const fact = facts.get(factId)
    if (!fact) return

    // Remove from subject index
    const subjectFacts = subjectIndex.get(fact.subject) || []
    subjectIndex.set(
      fact.subject,
      subjectFacts.filter((id) => id !== factId),
    )

    // Remove from predicate index
    const predicateFacts = predicateIndex.get(fact.predicate) || []
    predicateIndex.set(
      fact.predicate,
      predicateFacts.filter((id) => id !== factId),
    )

    // Remove fact
    facts.delete(factId)
    log.debug("fact retracted", { factId })
  }

  /**
   * Update a fact's value
   */
  export async function update(factId: FactId, newValue: unknown): Promise<void> {
    const fact = facts.get(factId)
    if (!fact) return

    fact.object = newValue
    fact.updatedAt = new Date().toISOString()
    facts.set(factId, fact)
    log.debug("fact updated", { factId })
  }

  /**
   * Query facts by subject and/or predicate
   */
  export async function query(subject?: string, predicate?: string): Promise<Fact[]> {
    if (!subject && !predicate) {
      return Array.from(facts.values())
    }

    let resultIds: FactId[] = []

    if (subject && predicate) {
      // Both specified - intersect results
      const subjectIds = subjectIndex.get(subject) || []
      const predicateIds = predicateIndex.get(predicate) || []
      resultIds = subjectIds.filter((id) => predicateIds.includes(id))
    } else if (subject) {
      resultIds = subjectIndex.get(subject) || []
    } else if (predicate) {
      resultIds = predicateIndex.get(predicate) || []
    }

    return resultIds.map((id) => facts.get(id)!).filter(Boolean)
  }

  /**
   * Embed and store content
   */
  export async function embedAndStore(content: string, metadata: EmbeddingMetadata): Promise<EmbeddingId> {
    const id = `emb_${crypto.randomUUID()}` as EmbeddingId
    const embedding = textToEmbedding(content)

    const embeddingData = {
      content,
      embedding,
      metadata: EmbeddingMetadataSchema.parse(metadata),
      createdAt: new Date().toISOString(),
    }

    embeddings.set(id, embeddingData)

    // Index by entity if present
    if (metadata.entityId) {
      const entityEmbs = entityEmbeddings.get(metadata.entityId) || []
      entityEmbs.push(id)
      entityEmbeddings.set(metadata.entityId, entityEmbs)
    }

    log.debug("content embedded", { embeddingId: id })
    return id
  }

  /**
   * Similarity search using embeddings
   */
  export async function similaritySearch(embedding: number[], k: number): Promise<SimilarFact[]> {
    const results: SimilarFact[] = []

    for (const [id, data] of embeddings.entries()) {
      const similarity = cosineSimilarity(embedding, data.embedding)

      // Find corresponding fact if metadata has entityId
      let fact: Fact | undefined
      if (data.metadata.entityId) {
        const factIds = subjectIndex.get(data.metadata.entityId) || []
        for (const factId of factIds) {
          const f = facts.get(factId)
          if (f) {
            fact = f
            break
          }
        }
      }

      if (fact) {
        results.push(
          SimilarFactSchema.parse({
            fact,
            similarity,
            rank: 0,
          }),
        )
      }
    }

    // Sort by similarity descending
    results.sort((a, b) => b.similarity - a.similarity)

    // Assign ranks
    for (let i = 0; i < results.length; i++) {
      results[i].rank = i + 1
    }

    return results.slice(0, k)
  }

  /**
   * Link two entities with a relation
   */
  export async function link(
    sourceId: EntityId,
    relation: string,
    targetId: EntityId,
    weight: number = 1,
  ): Promise<void> {
    const rel: Relation = RelationSchema.parse({
      sourceId,
      relation,
      targetId,
      weight,
    })

    // Store relation
    const sourceRels = relations.get(sourceId) || []
    sourceRels.push(rel)
    relations.set(sourceId, sourceRels)

    // Update connected entities (bidirectional)
    const connected = connectedEntities.get(sourceId) || new Set()
    connected.add(targetId)
    connectedEntities.set(sourceId, connected)

    const reverseConnected = connectedEntities.get(targetId) || new Set()
    reverseConnected.add(sourceId)
    connectedEntities.set(targetId, reverseConnected)

    log.debug("entities linked", { sourceId, relation, targetId })
  }

  /**
   * Get relations for an entity
   */
  export async function getRelations(entityId: EntityId): Promise<Relation[]> {
    return relations.get(entityId) || []
  }

  /**
   * Get entities connected to an entity
   */
  export async function getConnected(entityId: EntityId, relation?: string): Promise<EntityId[]> {
    if (relation) {
      // Filter by relation type
      const rels = relations.get(entityId) || []
      return rels.filter((r) => r.relation === relation).map((r) => r.targetId)
    }

    // Return all connected
    const connected = connectedEntities.get(entityId)
    return connected ? Array.from(connected) : []
  }

  /**
   * Consolidate episodes into semantic knowledge
   */
  export async function consolidate(episodeIds: EpisodeId[]): Promise<ConsolidationResult> {
    // Placeholder for consolidation logic
    // In production, would analyze episodes and extract facts

    return {
      sourceEpisodes: episodeIds,
      targetEntry: {
        id: `mem_${crypto.randomUUID()}` as MemoryId,
        layer: "semantic",
        key: "consolidated",
        value: { episodeIds },
        sensitivity: "medium",
        category: "system",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      confidence: 0.8,
    }
  }

  /**
   * Clear all semantic memory (for testing)
   */
  export function clear(): void {
    facts.clear()
    subjectIndex.clear()
    predicateIndex.clear()
    embeddings.clear()
    entityEmbeddings.clear()
    relations.clear()
    connectedEntities.clear()
    log.debug("semantic memory cleared")
  }
}

// Export as interface implementation
export const semanticMemory: ISemanticMemory = {
  assert: SemanticMemory.assert,
  retract: SemanticMemory.retract,
  update: SemanticMemory.update,
  query: SemanticMemory.query,
  embedAndStore: SemanticMemory.embedAndStore,
  similaritySearch: SemanticMemory.similaritySearch,
  link: SemanticMemory.link,
  getRelations: SemanticMemory.getRelations,
  getConnected: SemanticMemory.getConnected,
  consolidate: SemanticMemory.consolidate,
  clear: SemanticMemory.clear,
}

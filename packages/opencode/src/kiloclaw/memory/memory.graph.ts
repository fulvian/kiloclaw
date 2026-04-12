import { Log } from "@/util/log"
import { GraphMemoryRepo } from "./memory.repository"

const log = Log.create({ service: "kiloclaw.memory.graph" })
const TENANT = "default"

// Traversal cache for graph queries
const traverseCache = new Map<string, { ids: string[]; ts: number }>()
const TRAVERSE_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

export namespace MemoryGraph {
  export async function upsertEntity(input: {
    name: string
    type: string
    metadata?: Record<string, unknown>
  }): Promise<string> {
    const id = `ent_${crypto.randomUUID()}`
    const result = await GraphMemoryRepo.upsertEntity({
      id,
      tenant_id: TENANT,
      name: input.name,
      entity_type: input.type,
      metadata_json: input.metadata,
      created_at: Date.now(),
      updated_at: Date.now(),
    })
    // Invalidate traversal cache when entities are modified
    clearTraverseCache()
    return result
  }

  export async function addRelation(input: {
    sourceId: string
    relation: string
    targetId: string
    weight?: number
    metadata?: Record<string, unknown>
  }): Promise<string> {
    const id = `edge_${crypto.randomUUID()}`
    const clamped = Math.max(0, Math.min(100, Math.round(input.weight ?? 100)))
    await GraphMemoryRepo.addEdge({
      id,
      tenant_id: TENANT,
      source_id: input.sourceId,
      relation: input.relation,
      target_id: input.targetId,
      weight: clamped,
      metadata_json: input.metadata,
      created_at: Date.now(),
    })
    // Invalidate traversal cache when edges are modified
    clearTraverseCache()
    return id
  }

  export async function getConnected(entityId: string, relation?: string) {
    return GraphMemoryRepo.getConnected(TENANT, entityId, relation)
  }

  export async function resolveEntities(names: string[]) {
    return GraphMemoryRepo.resolveEntities(TENANT, names)
  }

  export async function getEntitiesByIds(ids: string[]) {
    return GraphMemoryRepo.getEntitiesByIds(TENANT, ids)
  }

  export async function traverse(startEntityId: string, hops = 2): Promise<string[]> {
    const maxHops = Math.max(1, Math.min(4, hops))
    const cacheKey = `${startEntityId}:${maxHops}`

    // Check cache first
    const cached = traverseCache.get(cacheKey)
    if (cached && Date.now() - cached.ts < TRAVERSE_CACHE_TTL_MS) {
      log.debug("traverse cache hit", { startEntityId, hops: maxHops, count: cached.ids.length })
      return cached.ids
    }

    // Cache miss - perform traversal
    const ids = await GraphMemoryRepo.traverse(TENANT, startEntityId, maxHops)
    traverseCache.set(cacheKey, { ids, ts: Date.now() })

    log.debug("graph traverse", { startEntityId, hops: maxHops, count: ids.length })
    return ids
  }

  /**
   * Clear the traversal cache
   * Call this when graph structure changes significantly
   */
  export function clearTraverseCache(): void {
    traverseCache.clear()
    log.debug("traverse cache cleared")
  }
}

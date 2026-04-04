import { Log } from "@/util/log"
import { GraphMemoryRepo } from "./memory.repository"

const log = Log.create({ service: "kiloclaw.memory.graph" })
const TENANT = "default"

export namespace MemoryGraph {
  export async function upsertEntity(input: {
    name: string
    type: string
    metadata?: Record<string, unknown>
  }): Promise<string> {
    const id = `ent_${crypto.randomUUID()}`
    return GraphMemoryRepo.upsertEntity({
      id,
      tenant_id: TENANT,
      name: input.name,
      entity_type: input.type,
      metadata_json: input.metadata,
      created_at: Date.now(),
      updated_at: Date.now(),
    })
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
    const ids = await GraphMemoryRepo.traverse(TENANT, startEntityId, maxHops)
    log.debug("graph traverse", { startEntityId, hops: maxHops, count: ids.length })
    return ids
  }
}

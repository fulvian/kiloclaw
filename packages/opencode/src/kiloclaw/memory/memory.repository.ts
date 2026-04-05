/**
 * Memory Repository - Persistence Layer for Memory System
 * Based on ADR-005 and memory.schema.sql.ts
 * Uses Drizzle with SQLite for MVP
 */

import { eq, and, or, gt, lt, desc, asc, inArray, like, sql } from "drizzle-orm"
import { type SQLiteBunDatabase } from "drizzle-orm/bun-sqlite"
import {
  WorkingStateTable,
  MemoryEventTable,
  EpisodeTable,
  FactTable,
  FactVectorTable,
  EntityTable,
  MemoryEdgeTable,
  ProcedureTable,
  ProcedureVersionTable,
  UserProfileTable,
  FeedbackEventTable,
  MemoryAuditLogTable,
  type WorkingState,
  type NewWorkingState,
  type MemoryEvent,
  type NewMemoryEvent,
  type Episode,
  type NewEpisode,
  type Fact,
  type NewFact,
  type FactVector,
  type NewFactVector,
  type Entity,
  type NewEntity,
  type MemoryEdge,
  type NewMemoryEdge,
  type Procedure,
  type NewProcedure,
  type ProcedureVersion,
  type NewProcedureVersion,
  type UserProfile,
  type NewUserProfile,
  type FeedbackEvent,
  type NewFeedbackEvent,
  type MemoryAuditLog,
  type NewMemoryAuditLog,
} from "./memory.schema.sql.js"
import { Log } from "@/util/log"

const log = Log.create({ service: "kiloclaw.memory.repository" })

// Database instance type
type MemoryDb = SQLiteBunDatabase<any>

/**
 * Get the vector search provider based on environment configuration
 */
function getVectorSearchProvider(): "sqlite" | "postgres" {
  return (process.env["KILO_MEMORY_PROVIDER"] as "sqlite" | "postgres") ?? "sqlite"
}

// State for lazy initialization
let _db: MemoryDb | undefined

/**
 * Initialize memory database with provided instance
 * Called during app startup
 */
export function initMemoryRepository(db: MemoryDb): void {
  _db = db
  log.info("memory repository initialized")
}

/**
 * Get database instance
 */
function db(): MemoryDb {
  if (!_db) {
    throw new Error("Memory repository not initialized. Call initMemoryRepository() first.")
  }
  return _db
}

// =============================================================================
// Working Memory Repository
// =============================================================================

export const WorkingMemoryRepo = {
  async set(
    tenantId: string,
    key: string,
    value: unknown,
    options?: {
      userId?: string
      sessionId?: string
      sensitivity?: string
      ttlMs?: number
    },
  ): Promise<void> {
    const expiresAt = options?.ttlMs ? Date.now() + options.ttlMs : null

    await db()
      .insert(WorkingStateTable)
      .values({
        tenant_id: tenantId,
        user_id: options?.userId ?? null,
        session_id: options?.sessionId ?? null,
        key,
        value: JSON.stringify(value),
        sensitivity: options?.sensitivity ?? "medium",
        expires_at: expiresAt,
      })
    log.debug("working state set", { tenantId, key })
  },

  async get(tenantId: string, key: string, userId?: string): Promise<unknown | null> {
    const now = Date.now()

    const conditions = [eq(WorkingStateTable.tenant_id, tenantId), eq(WorkingStateTable.key, key)]

    if (userId) {
      conditions.push(eq(WorkingStateTable.user_id, userId))
    }

    const result = await db()
      .select()
      .from(WorkingStateTable)
      .where(and(...conditions))
      .limit(1)

    if (result.length === 0) return null

    const row = result[0]

    // Check expiration
    if (row.expires_at && row.expires_at < now) {
      return null
    }

    try {
      return JSON.parse(row.value as string)
    } catch {
      return row.value
    }
  },

  async delete(tenantId: string, key: string, userId?: string): Promise<void> {
    const conditions = [eq(WorkingStateTable.tenant_id, tenantId), eq(WorkingStateTable.key, key)]

    if (userId) {
      conditions.push(eq(WorkingStateTable.user_id, userId))
    }

    await db()
      .delete(WorkingStateTable)
      .where(and(...conditions))
  },

  async getMany(tenantId: string, keys: string[], userId?: string): Promise<Record<string, unknown>> {
    const now = Date.now()

    const conditions = [eq(WorkingStateTable.tenant_id, tenantId)]
    if (keys.length > 0) {
      conditions.push(inArray(WorkingStateTable.key, keys))
    }

    if (userId) {
      conditions.push(eq(WorkingStateTable.user_id, userId))
    }

    const result = await db()
      .select()
      .from(WorkingStateTable)
      .where(and(...conditions))

    const record: Record<string, unknown> = {}
    for (const row of result) {
      // Skip expired
      if (row.expires_at && row.expires_at < now) continue

      try {
        record[row.key] = JSON.parse(row.value as string)
      } catch {
        record[row.key] = row.value
      }
    }
    return record
  },

  async cleanupExpired(): Promise<number> {
    const now = Date.now()
    // Get count before delete
    const toDelete = await db()
      .select()
      .from(WorkingStateTable)
      .where(and(gt(WorkingStateTable.expires_at, 0), lt(WorkingStateTable.expires_at, now)))

    const count = toDelete.length

    if (count > 0) {
      await db()
        .delete(WorkingStateTable)
        .where(and(gt(WorkingStateTable.expires_at, 0), lt(WorkingStateTable.expires_at, now)))
    }

    return count
  },

  async count(tenantId: string, userId?: string): Promise<number> {
    const conditions = [eq(WorkingStateTable.tenant_id, tenantId)]
    if (userId) conditions.push(eq(WorkingStateTable.user_id, userId))

    const rows = await db()
      .select({ id: WorkingStateTable.id })
      .from(WorkingStateTable)
      .where(and(...conditions))
    return rows.length
  },

  async listOldest(tenantId: string, limit: number, userId?: string): Promise<Array<{ id: string; key: string }>> {
    const conditions = [eq(WorkingStateTable.tenant_id, tenantId)]
    if (userId) conditions.push(eq(WorkingStateTable.user_id, userId))

    return db()
      .select({ id: WorkingStateTable.id, key: WorkingStateTable.key })
      .from(WorkingStateTable)
      .where(and(...conditions))
      .orderBy(WorkingStateTable.created_at)
      .limit(limit)
  },
}

// =============================================================================
// Episodic Memory Repository
// =============================================================================

export const EpisodicMemoryRepo = {
  async recordEvent(input: NewMemoryEvent): Promise<string> {
    await db().insert(MemoryEventTable).values(input)
    return input.id as string
  },

  async getEvents(
    tenantId: string,
    options?: {
      userId?: string
      sessionId?: string
      correlationId?: string
      eventType?: string
      since?: number
      until?: number
      limit?: number
    },
  ): Promise<MemoryEvent[]> {
    const conditions = [eq(MemoryEventTable.tenant_id, tenantId)]

    if (options?.userId) conditions.push(eq(MemoryEventTable.user_id, options.userId))
    if (options?.sessionId) conditions.push(eq(MemoryEventTable.session_id, options.sessionId))
    if (options?.correlationId) conditions.push(eq(MemoryEventTable.correlation_id, options.correlationId))
    if (options?.eventType) conditions.push(eq(MemoryEventTable.event_type, options.eventType))
    if (options?.since) conditions.push(gt(MemoryEventTable.ts, options.since))
    if (options?.until) conditions.push(lt(MemoryEventTable.ts, options.until))

    return db()
      .select()
      .from(MemoryEventTable)
      .where(and(...conditions))
      .orderBy(desc(MemoryEventTable.ts))
      .limit(options?.limit ?? 100)
  },

  async recordEpisode(input: NewEpisode): Promise<string> {
    await db().insert(EpisodeTable).values(input)
    return input.id as string
  },

  async getEpisode(episodeId: string): Promise<Episode | null> {
    const result = await db().select().from(EpisodeTable).where(eq(EpisodeTable.id, episodeId)).limit(1)
    return result[0] ?? null
  },

  async getRecentEpisodes(tenantId: string, count: number, since?: number): Promise<Episode[]> {
    const conditions = [eq(EpisodeTable.tenant_id, tenantId)]
    if (since) conditions.push(gt(EpisodeTable.completed_at, since))

    return db()
      .select()
      .from(EpisodeTable)
      .where(and(...conditions))
      .orderBy(desc(EpisodeTable.completed_at))
      .limit(count)
  },

  async getTimeline(
    tenantId: string,
    options?: {
      userId?: string
      agencyId?: string
      agentId?: string
      outcome?: string
      since?: number
      until?: number
      limit?: number
    },
  ): Promise<Episode[]> {
    const conditions = [eq(EpisodeTable.tenant_id, tenantId)]

    if (options?.userId) conditions.push(eq(EpisodeTable.user_id, options.userId))
    if (options?.agencyId) conditions.push(eq(EpisodeTable.agency_id, options.agencyId))
    if (options?.agentId) conditions.push(eq(EpisodeTable.agent_id, options.agentId))
    if (options?.outcome) conditions.push(eq(EpisodeTable.outcome, options.outcome))
    if (options?.since) conditions.push(gt(EpisodeTable.started_at, options.since))
    if (options?.until) conditions.push(lt(EpisodeTable.completed_at, options.until))

    return db()
      .select()
      .from(EpisodeTable)
      .where(and(...conditions))
      .orderBy(desc(EpisodeTable.completed_at))
      .limit(options?.limit ?? 50)
  },

  async cleanupExpired(): Promise<number> {
    const now = Date.now()
    const toDelete = await db()
      .select()
      .from(EpisodeTable)
      .where(and(gt(EpisodeTable.expires_at, 0), lt(EpisodeTable.expires_at, now)))

    const count = toDelete.length

    if (count > 0) {
      await db()
        .delete(EpisodeTable)
        .where(and(gt(EpisodeTable.expires_at, 0), lt(EpisodeTable.expires_at, now)))
    }

    return count
  },

  async count(tenantId: string, userId?: string): Promise<number> {
    const conditions = [eq(EpisodeTable.tenant_id, tenantId)]
    if (userId) conditions.push(eq(EpisodeTable.user_id, userId))

    const rows = await db()
      .select({ id: EpisodeTable.id })
      .from(EpisodeTable)
      .where(and(...conditions))
    return rows.length
  },

  async countEvents(tenantId: string, userId?: string): Promise<number> {
    const conditions = [eq(MemoryEventTable.tenant_id, tenantId)]
    if (userId) conditions.push(eq(MemoryEventTable.user_id, userId))

    const rows = await db()
      .select({ id: MemoryEventTable.id })
      .from(MemoryEventTable)
      .where(and(...conditions))
    return rows.length
  },

  async listOldest(tenantId: string, limit: number, userId?: string): Promise<Array<{ id: string }>> {
    const conditions = [eq(EpisodeTable.tenant_id, tenantId)]
    if (userId) conditions.push(eq(EpisodeTable.user_id, userId))

    return db()
      .select({ id: EpisodeTable.id })
      .from(EpisodeTable)
      .where(and(...conditions))
      .orderBy(EpisodeTable.completed_at)
      .limit(limit)
  },

  async deleteEvent(eventId: string): Promise<void> {
    await db().delete(MemoryEventTable).where(eq(MemoryEventTable.id, eventId))
  },

  async deleteEpisode(episodeId: string): Promise<void> {
    await db().delete(EpisodeTable).where(eq(EpisodeTable.id, episodeId))
  },
}

// =============================================================================
// Semantic Memory Repository
// =============================================================================

export const SemanticMemoryRepo = {
  async assertFact(input: NewFact): Promise<string> {
    await db().insert(FactTable).values(input)
    return input.id as string
  },

  async deleteFact(factId: string): Promise<void> {
    await db().delete(FactTable).where(eq(FactTable.id, factId))
    await db().delete(FactVectorTable).where(eq(FactVectorTable.fact_id, factId))
  },

  async retractFact(factId: string): Promise<void> {
    await db().update(FactTable).set({ valid_to: Date.now() }).where(eq(FactTable.id, factId))
  },

  async updateFact(factId: string, newValue: unknown): Promise<void> {
    await db()
      .update(FactTable)
      .set({
        object: JSON.stringify(newValue),
        updated_at: Date.now(),
      })
      .where(eq(FactTable.id, factId))
  },

  async queryFacts(
    tenantId: string,
    options?: {
      userId?: string
      subject?: string
      predicate?: string
      minConfidence?: number
      includeExpired?: boolean
      // BP-09: Metadata filtering
      actorType?: string
      actorId?: string
      since?: number
      until?: number
    },
  ): Promise<Fact[]> {
    const conditions = [eq(FactTable.tenant_id, tenantId)]

    if (options?.userId) conditions.push(eq(FactTable.user_id, options.userId))
    if (options?.subject) conditions.push(like(FactTable.subject, `%${options.subject}%`))
    if (options?.predicate) conditions.push(like(FactTable.predicate, `%${options.predicate}%`))
    if (options?.minConfidence) conditions.push(sql`${FactTable.confidence} >= ${options.minConfidence}`)

    // BP-09: Actor filtering
    if (options?.actorType) conditions.push(eq(FactTable.actor_type, options.actorType))
    if (options?.actorId) conditions.push(eq(FactTable.actor_id, options.actorId))

    // BP-09: Time range filtering
    if (options?.since) conditions.push(sql`${FactTable.created_at} >= ${options.since}`)
    if (options?.until) conditions.push(sql`${FactTable.created_at} <= ${options.until}`)

    // Exclude expired by default
    if (!options?.includeExpired) {
      conditions.push(sql`${FactTable.valid_to} IS NULL`)
    }

    return db()
      .select()
      .from(FactTable)
      .where(and(...conditions))
      .orderBy(desc(FactTable.confidence))
  },

  async getFact(factId: string): Promise<Fact | null> {
    const result = await db().select().from(FactTable).where(eq(FactTable.id, factId)).limit(1)
    return result[0] ?? null
  },

  async count(tenantId: string, userId?: string): Promise<number> {
    const conditions = [eq(FactTable.tenant_id, tenantId)]
    if (userId) conditions.push(eq(FactTable.user_id, userId))

    const rows = await db()
      .select({ id: FactTable.id })
      .from(FactTable)
      .where(and(...conditions))
    return rows.length
  },

  async storeVector(input: NewFactVector): Promise<string> {
    await db().insert(FactVectorTable).values(input)
    return input.id as string
  },

  async getVectors(factId: string): Promise<FactVector[]> {
    return db().select().from(FactVectorTable).where(eq(FactVectorTable.fact_id, factId))
  },

  async similaritySearch(
    embedding: number[],
    k: number,
    tenantId: string,
  ): Promise<{ fact: Fact; similarity: number }[]> {
    const provider = getVectorSearchProvider()

    if (provider === "postgres") {
      // Use PostgreSQL pgvector for fast ANN search
      return postgresSimilaritySearch(embedding, k, tenantId)
    }

    // Fallback to SQLite implementation (current MVP code)
    return sqliteSimilaritySearch(embedding, k, tenantId)
  },
}

/**
 * SQLite implementation - loads all vectors and computes similarity in-memory
 */
async function sqliteSimilaritySearch(
  embedding: number[],
  k: number,
  tenantId: string,
): Promise<{ fact: Fact; similarity: number }[]> {
  const rows = await db()
    .select()
    .from(FactVectorTable)
    .innerJoin(FactTable, eq(FactVectorTable.fact_id, FactTable.id))
    .where(eq(FactTable.tenant_id, tenantId))

  const results: { fact: Fact; similarity: number }[] = []

  for (const row of rows) {
    try {
      const storedEmbedding = JSON.parse(row.fact_vectors.embedding)
      const similarity = cosineSimilarity(embedding, storedEmbedding)
      if (similarity > 0) {
        results.push({ fact: row.facts, similarity })
      }
    } catch {
      // Skip invalid embeddings
    }
  }

  results.sort((a, b) => b.similarity - a.similarity)
  return results.slice(0, k)
}

/**
 * PostgreSQL implementation using pgvector for fast ANN search
 * Note: Requires KILO_MEMORY_PROVIDER=postgres and pgvector extension
 */
async function postgresSimilaritySearch(
  embedding: number[],
  k: number,
  tenantId: string,
): Promise<{ fact: Fact; similarity: number }[]> {
  // pgvector implementation - uses HNSW index for fast cosine similarity search
  // The embedding is sent as a JSON array, pgvector parses it as vector(1536)
  const embeddingStr = JSON.stringify(embedding)

  try {
    // Use raw SQL with pgvector's <=> (cosine distance) operator
    // The HNSW index will be used automatically for ANN search
    const rows = await db()
      .select({
        fact: FactTable,
        distance: sql<string>`(fv.embedding <=> ${embeddingStr}::vector)`,
      })
      .from(FactVectorTable)
      .innerJoin(FactTable, eq(FactVectorTable.fact_id, FactTable.id))
      .where(
        and(
          eq(FactTable.tenant_id, tenantId),
          sql`fv.embedding <=> ${embeddingStr}::vector < 1`, // Only get results with similarity > 0
        ),
      )
      .orderBy(sql`fv.embedding <=> ${embeddingStr}::vector`)
      .limit(k)

    return rows.map((row) => ({
      fact: row.fact,
      similarity: 1 - parseFloat(row.distance), // Convert cosine distance to similarity
    }))
  } catch (err) {
    // If PostgreSQL query fails (e.g., pgvector not available), fall back to SQLite
    log.warn("postgres similarity search failed, falling back to sqlite", { err })
    return sqliteSimilaritySearch(embedding, k, tenantId)
  }
}

// =============================================================================
// Graph Memory Repository
// =============================================================================

export const GraphMemoryRepo = {
  async upsertEntity(input: NewEntity): Promise<string> {
    const existing = await db()
      .select({ id: EntityTable.id })
      .from(EntityTable)
      .where(
        and(
          eq(EntityTable.tenant_id, input.tenant_id),
          eq(EntityTable.name, input.name),
          eq(EntityTable.entity_type, input.entity_type),
        ),
      )
      .limit(1)

    if (existing.length > 0) {
      await db()
        .update(EntityTable)
        .set({
          metadata_json: input.metadata_json ?? null,
          updated_at: Date.now(),
        })
        .where(eq(EntityTable.id, existing[0].id))
      return existing[0].id
    }

    await db().insert(EntityTable).values(input)
    return input.id as string
  },

  async addEdge(input: NewMemoryEdge): Promise<string> {
    await db().insert(MemoryEdgeTable).values(input).onConflictDoNothing()
    return input.id as string
  },

  async getConnected(
    tenantId: string,
    entityId: string,
    relation?: string,
  ): Promise<Array<{ edge: MemoryEdge; entity: Entity }>> {
    const sourceConditions = [eq(MemoryEdgeTable.tenant_id, tenantId), eq(MemoryEdgeTable.source_id, entityId)]
    if (relation) sourceConditions.push(eq(MemoryEdgeTable.relation, relation))

    const targetConditions = [eq(MemoryEdgeTable.tenant_id, tenantId), eq(MemoryEdgeTable.target_id, entityId)]
    if (relation) targetConditions.push(eq(MemoryEdgeTable.relation, relation))

    const outgoing = await db()
      .select({ edge: MemoryEdgeTable, entity: EntityTable })
      .from(MemoryEdgeTable)
      .innerJoin(EntityTable, eq(MemoryEdgeTable.target_id, EntityTable.id))
      .where(and(...sourceConditions))

    const incoming = await db()
      .select({ edge: MemoryEdgeTable, entity: EntityTable })
      .from(MemoryEdgeTable)
      .innerJoin(EntityTable, eq(MemoryEdgeTable.source_id, EntityTable.id))
      .where(and(...targetConditions))

    return [...outgoing, ...incoming]
  },

  async resolveEntities(tenantId: string, names: string[]): Promise<Entity[]> {
    if (names.length === 0) return []

    const clauses = names.map((name) => sql`lower(${EntityTable.name}) = lower(${name})`)
    return db()
      .select()
      .from(EntityTable)
      .where(and(eq(EntityTable.tenant_id, tenantId), or(...clauses)))
  },

  async getEntitiesByIds(tenantId: string, ids: string[]): Promise<Entity[]> {
    if (ids.length === 0) return []

    return db()
      .select()
      .from(EntityTable)
      .where(and(eq(EntityTable.tenant_id, tenantId), inArray(EntityTable.id, ids)))
  },

  async traverse(tenantId: string, startEntityId: string, hops: number): Promise<string[]> {
    const visited = new Set<string>()
    const maxHops = Math.max(1, hops)
    let frontier = [startEntityId]

    for (let hop = 0; hop < maxHops; hop++) {
      if (frontier.length === 0) break

      // Single query for all frontier nodes in this hop (batch query optimization)
      const clauses = frontier.map((id) => or(eq(MemoryEdgeTable.source_id, id), eq(MemoryEdgeTable.target_id, id)))

      const edges = await db()
        .select({ source_id: MemoryEdgeTable.source_id, target_id: MemoryEdgeTable.target_id })
        .from(MemoryEdgeTable)
        .where(and(eq(MemoryEdgeTable.tenant_id, tenantId), or(...clauses)))

      const next: string[] = []
      for (const edge of edges) {
        if (!visited.has(edge.source_id)) {
          visited.add(edge.source_id)
          next.push(edge.source_id)
        }
        if (!visited.has(edge.target_id)) {
          visited.add(edge.target_id)
          next.push(edge.target_id)
        }
      }

      frontier = [...new Set(next)]
    }

    return [...visited]
  },
}

// =============================================================================
// Procedural Memory Repository
// =============================================================================

export const ProceduralMemoryRepo = {
  async register(input: NewProcedure): Promise<string> {
    await db().insert(ProcedureTable).values(input)
    return input.id as string
  },

  async deleteByUser(tenantId: string, userId: string): Promise<number> {
    const rows = await db()
      .select({ id: ProcedureTable.id })
      .from(ProcedureTable)
      .where(and(eq(ProcedureTable.tenant_id, tenantId), eq(ProcedureTable.user_id, userId)))

    if (rows.length === 0) return 0

    await db()
      .delete(ProcedureTable)
      .where(and(eq(ProcedureTable.tenant_id, tenantId), eq(ProcedureTable.user_id, userId)))

    return rows.length
  },

  async get(procedureId: string): Promise<Procedure | null> {
    const result = await db().select().from(ProcedureTable).where(eq(ProcedureTable.id, procedureId)).limit(1)
    return result[0] ?? null
  },

  async list(
    tenantId: string,
    options?: {
      userId?: string
      scope?: string
      name?: string
      status?: string
    },
  ): Promise<Procedure[]> {
    const conditions = [eq(ProcedureTable.tenant_id, tenantId)]

    if (options?.userId) conditions.push(eq(ProcedureTable.user_id, options.userId))
    if (options?.scope) conditions.push(eq(ProcedureTable.scope, options.scope))
    if (options?.name) conditions.push(like(ProcedureTable.name, `%${options.name}%`))
    if (options?.status) conditions.push(eq(ProcedureTable.status, options.status))

    return db()
      .select()
      .from(ProcedureTable)
      .where(and(...conditions))
  },

  async updateStats(procedureId: string, success: boolean): Promise<void> {
    const proc = await ProceduralMemoryRepo.get(procedureId)
    if (!proc) return

    const newUsageCount = proc.usage_count + 1
    const newSuccessRate = success
      ? Math.round((proc.success_rate * proc.usage_count + 100) / newUsageCount)
      : Math.round((proc.success_rate * proc.usage_count) / newUsageCount)

    await db()
      .update(ProcedureTable)
      .set({
        usage_count: newUsageCount,
        success_rate: newSuccessRate,
        updated_at: Date.now(),
      })
      .where(eq(ProcedureTable.id, procedureId))
  },

  async addVersion(input: NewProcedureVersion): Promise<string> {
    await db().insert(ProcedureVersionTable).values(input)
    return input.id as string
  },

  async getVersionHistory(procedureId: string): Promise<ProcedureVersion[]> {
    return db()
      .select()
      .from(ProcedureVersionTable)
      .where(eq(ProcedureVersionTable.procedure_id, procedureId))
      .orderBy(desc(ProcedureVersionTable.created_at))
  },

  async count(tenantId: string, userId?: string): Promise<number> {
    const conditions = [eq(ProcedureTable.tenant_id, tenantId)]
    if (userId) conditions.push(eq(ProcedureTable.user_id, userId))

    const rows = await db()
      .select({ id: ProcedureTable.id })
      .from(ProcedureTable)
      .where(and(...conditions))
    return rows.length
  },
}

// =============================================================================
// User Profile Repository
// =============================================================================

export const UserProfileRepo = {
  async upsert(input: NewUserProfile): Promise<void> {
    const existing = await db()
      .select()
      .from(UserProfileTable)
      .where(and(eq(UserProfileTable.tenant_id, input.tenant_id), eq(UserProfileTable.user_id, input.user_id)))
      .limit(1)

    // Ensure JSON fields are objects (Drizzle handles serialization)
    const prefsJson =
      typeof input.preferences_json === "string" ? JSON.parse(input.preferences_json) : input.preferences_json
    const constraintsJson =
      typeof input.constraints_json === "string" ? JSON.parse(input.constraints_json) : input.constraints_json

    if (existing.length > 0) {
      await db()
        .update(UserProfileTable)
        .set({
          preferences_json: prefsJson as Record<string, unknown>,
          communication_style: input.communication_style ?? "neutral",
          constraints_json: constraintsJson as Record<string, unknown>,
          updated_at: Date.now(),
        })
        .where(eq(UserProfileTable.id, existing[0].id))
    } else {
      await db()
        .insert(UserProfileTable)
        .values({
          ...input,
          preferences_json: prefsJson as Record<string, unknown>,
          constraints_json: constraintsJson as Record<string, unknown>,
        })
    }
  },

  async get(tenantId: string, userId: string): Promise<UserProfile | null> {
    const result = await db()
      .select()
      .from(UserProfileTable)
      .where(and(eq(UserProfileTable.tenant_id, tenantId), eq(UserProfileTable.user_id, userId)))
      .limit(1)
    return result[0] ?? null
  },

  async delete(tenantId: string, userId: string): Promise<number> {
    const rows = await db()
      .select({ id: UserProfileTable.id })
      .from(UserProfileTable)
      .where(and(eq(UserProfileTable.tenant_id, tenantId), eq(UserProfileTable.user_id, userId)))

    if (rows.length === 0) return 0

    await db()
      .delete(UserProfileTable)
      .where(and(eq(UserProfileTable.tenant_id, tenantId), eq(UserProfileTable.user_id, userId)))

    return rows.length
  },
}

// =============================================================================
// Feedback Repository
// =============================================================================

export const FeedbackRepo = {
  async record(input: NewFeedbackEvent): Promise<string> {
    await db().insert(FeedbackEventTable).values(input)
    return input.id as string
  },

  async deleteByUser(tenantId: string, userId: string): Promise<number> {
    const rows = await db()
      .select({ id: FeedbackEventTable.id })
      .from(FeedbackEventTable)
      .where(and(eq(FeedbackEventTable.tenant_id, tenantId), eq(FeedbackEventTable.user_id, userId)))

    if (rows.length === 0) return 0

    await db()
      .delete(FeedbackEventTable)
      .where(and(eq(FeedbackEventTable.tenant_id, tenantId), eq(FeedbackEventTable.user_id, userId)))

    return rows.length
  },

  async getByTarget(targetType: string, targetId: string): Promise<FeedbackEvent[]> {
    return db()
      .select()
      .from(FeedbackEventTable)
      .where(and(eq(FeedbackEventTable.target_type, targetType), eq(FeedbackEventTable.target_id, targetId)))
      .orderBy(desc(FeedbackEventTable.ts))
  },

  async getByTenant(tenantId: string, limit?: number): Promise<FeedbackEvent[]> {
    return db()
      .select()
      .from(FeedbackEventTable)
      .where(eq(FeedbackEventTable.tenant_id, tenantId))
      .orderBy(desc(FeedbackEventTable.ts))
      .limit(limit ?? 100)
  },
}

// =============================================================================
// Audit Log Repository
// =============================================================================

export const AuditRepo = {
  async log(input: NewMemoryAuditLog): Promise<string> {
    // Compute hash for chain integrity
    const previousEntry = input.previous_hash
      ? await db().select().from(MemoryAuditLogTable).where(eq(MemoryAuditLogTable.hash, input.previous_hash)).limit(1)
      : []

    const hashInput = JSON.stringify({
      actor: input.actor,
      action: input.action,
      target_type: input.target_type,
      target_id: input.target_id,
      reason: input.reason,
      correlation_id: input.correlation_id,
      previous_hash: previousEntry[0]?.hash ?? null,
      ts: input.ts,
      metadata: input.metadata_json,
    })

    const hash = await computeHash(hashInput)

    await db()
      .insert(MemoryAuditLogTable)
      .values({
        ...input,
        hash,
      })

    return input.id as string
  },

  async getByTarget(targetType: string, targetId: string): Promise<MemoryAuditLog[]> {
    return db()
      .select()
      .from(MemoryAuditLogTable)
      .where(and(eq(MemoryAuditLogTable.target_type, targetType), eq(MemoryAuditLogTable.target_id, targetId)))
      .orderBy(desc(MemoryAuditLogTable.ts))
  },

  async getByActor(actor: string, limit?: number): Promise<MemoryAuditLog[]> {
    return db()
      .select()
      .from(MemoryAuditLogTable)
      .where(eq(MemoryAuditLogTable.actor, actor))
      .orderBy(desc(MemoryAuditLogTable.ts))
      .limit(limit ?? 100)
  },

  async verifyChain(): Promise<{ valid: boolean; errors: string[] }> {
    const entries = await db().select().from(MemoryAuditLogTable).orderBy(asc(MemoryAuditLogTable.ts))

    const errors: string[] = []

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      const expectedPreviousHash = i > 0 ? entries[i - 1].hash : null

      if (entry.previous_hash !== expectedPreviousHash) {
        errors.push(
          `Chain broken at entry ${entry.id}: expected previous_hash ${expectedPreviousHash}, got ${entry.previous_hash}`,
        )
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  },
}

// =============================================================================
// Utility Functions
// =============================================================================

async function computeHash(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(input)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

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

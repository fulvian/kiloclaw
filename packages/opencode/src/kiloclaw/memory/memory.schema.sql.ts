import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core"

// ID generator using crypto
function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`
}

// =============================================================================
// Memory Schema - Kiloclaw Persistent Memory System
// Based on ADR-005: Memory Persistence Refoundation
// Uses SQLite for MVP, interfaces ready for Postgres+pgvector migration
// =============================================================================

// Tenant isolation
export const TenantTable = sqliteTable("tenant", {
  id: text().primaryKey(),
  name: text().notNull(),
  plan: text().notNull().default("free"),
  created_at: integer()
    .notNull()
    .$default(() => Date.now()),
})

// =============================================================================
// Working Memory - Short-term operational state
// =============================================================================

export const WorkingStateTable = sqliteTable(
  "working_state",
  {
    id: text()
      .primaryKey()
      .$default(() => createId("wk")),
    tenant_id: text().notNull(),
    user_id: text(),
    session_id: text(),
    key: text().notNull(),
    value: text({ mode: "json" }).notNull(),
    sensitivity: text().notNull().default("medium"), // low, medium, high, critical
    expires_at: integer(), // Unix timestamp ms, null = no expiry
    created_at: integer()
      .notNull()
      .$default(() => Date.now()),
    updated_at: integer()
      .notNull()
      .$onUpdate(() => Date.now()),
  },
  (table) => [
    index("working_tenant_user_idx").on(table.tenant_id, table.user_id),
    index("working_session_idx").on(table.session_id),
    index("working_expires_idx").on(table.expires_at),
  ],
)

// =============================================================================
// Episodic Memory - Conversational events and task history
// =============================================================================

export const MemoryEventTable = sqliteTable(
  "memory_events",
  {
    id: text()
      .primaryKey()
      .$default(() => createId("ev")),
    tenant_id: text().notNull(),
    user_id: text(),
    session_id: text(),
    correlation_id: text(),
    event_type: text().notNull(), // task_start, task_complete, tool_call, etc.
    payload: text({ mode: "json" }).notNull(),
    sensitivity: text().notNull().default("medium"),
    actor_type: text(), // 'user', 'agent', 'system', 'tool'
    actor_id: text(),
    ts: integer()
      .notNull()
      .$default(() => Date.now()),
    created_at: integer()
      .notNull()
      .$default(() => Date.now()),
  },
  (table) => [
    index("event_tenant_user_ts_idx").on(table.tenant_id, table.user_id, table.ts),
    index("event_correlation_idx").on(table.correlation_id),
    index("event_type_idx").on(table.event_type),
    index("event_actor_idx").on(table.actor_type, table.actor_id),
  ],
)

export const EpisodeTable = sqliteTable(
  "episodes",
  {
    id: text()
      .primaryKey()
      .$default(() => createId("ep")),
    tenant_id: text().notNull(),
    user_id: text(),
    task_id: text(),
    task_description: text().notNull(),
    outcome: text().notNull(), // success, failure, partial, cancelled
    started_at: integer().notNull(),
    completed_at: integer().notNull(),
    correlation_id: text(),
    agency_id: text(),
    agent_id: text(),
    actor_type: text(), // 'user', 'agent', 'system', 'tool'
    actor_id: text(),
    source_event_ids: text({ mode: "json" }).$type<string[]>().default([]),
    artifacts: text({ mode: "json" }).$type<Record<string, unknown>>(),
    confidence: integer().notNull().default(80), // 0-100
    expires_at: integer(), // Unix timestamp ms, null = no expiry
    created_at: integer()
      .notNull()
      .$default(() => Date.now()),
  },
  (table) => [
    index("episode_tenant_user_idx").on(table.tenant_id, table.user_id),
    index("episode_correlation_idx").on(table.correlation_id),
    index("episode_expires_idx").on(table.expires_at),
    index("episode_completed_idx").on(table.completed_at),
    index("episode_actor_idx").on(table.actor_type, table.actor_id),
  ],
)

// =============================================================================
// Semantic Memory - Consolidated facts and knowledge
// =============================================================================

export const FactTable = sqliteTable(
  "facts",
  {
    id: text()
      .primaryKey()
      .$default(() => createId("fact")),
    tenant_id: text().notNull(),
    user_id: text(),
    subject: text().notNull(),
    predicate: text().notNull(),
    object: text({ mode: "json" }).notNull(),
    confidence: integer().notNull().default(50), // 0-100 scale
    provenance: text(), // Source reference
    extraction_source: text(), // 'extracted', 'user_direct', 'broker_v2'
    actor_type: text(), // 'user', 'agent', 'system'
    actor_id: text(),
    source_event_ids: text({ mode: "json" }).$type<string[]>().default([]),
    valid_from: integer()
      .notNull()
      .$default(() => Date.now()),
    valid_to: integer(), // null = current, set on retraction
    created_at: integer()
      .notNull()
      .$default(() => Date.now()),
    updated_at: integer()
      .notNull()
      .$onUpdate(() => Date.now()),
  },
  (table) => [
    index("fact_tenant_user_idx").on(table.tenant_id, table.user_id),
    index("fact_subject_idx").on(table.subject),
    index("fact_predicate_idx").on(table.predicate),
    index("fact_confidence_idx").on(table.confidence),
    index("fact_valid_to_idx").on(table.valid_to), // null = current
    index("fact_actor_idx").on(table.actor_type, table.actor_id),
  ],
)

// Vector embeddings stored separately for hybrid search
// Note: For production with pgvector, this would be a separate table with vector type
export const FactVectorTable = sqliteTable(
  "fact_vectors",
  {
    id: text()
      .primaryKey()
      .$default(() => createId("vec")),
    fact_id: text()
      .notNull()
      .references(() => FactTable.id, { onDelete: "cascade" }),
    content: text().notNull(), // Original text content
    embedding: text().notNull(), // JSON array of floats (128 dimensions for MVP)
    model: text().notNull().default("text-embedding-mxbai-embed-large-v1"), // embedding model identifier
    norm: integer(), // Pre-computed norm for cosine similarity
    metadata_json: text({ mode: "json" }).$type<Record<string, unknown>>(),
    created_at: integer()
      .notNull()
      .$default(() => Date.now()),
  },
  (table) => [index("vector_fact_idx").on(table.fact_id)],
)

// =============================================================================
// Graph Memory - Entity/relation structure for multi-hop retrieval
// =============================================================================

export const EntityTable = sqliteTable(
  "memory_entities",
  {
    id: text()
      .primaryKey()
      .$default(() => createId("ent")),
    tenant_id: text().notNull(),
    name: text().notNull(),
    entity_type: text().notNull(), // user, project, task, technology, concept
    metadata_json: text({ mode: "json" }).$type<Record<string, unknown>>(),
    created_at: integer()
      .notNull()
      .$default(() => Date.now()),
    updated_at: integer()
      .notNull()
      .$onUpdate(() => Date.now()),
  },
  (table) => [
    index("entity_tenant_type_idx").on(table.tenant_id, table.entity_type),
    index("entity_name_idx").on(table.name),
    uniqueIndex("entity_tenant_name_type_uq").on(table.tenant_id, table.name, table.entity_type),
  ],
)

export const MemoryEdgeTable = sqliteTable(
  "memory_edges",
  {
    id: text()
      .primaryKey()
      .$default(() => createId("edge")),
    tenant_id: text().notNull(),
    source_id: text()
      .notNull()
      .references(() => EntityTable.id, { onDelete: "cascade" }),
    relation: text().notNull(), // uses, depends_on, related_to, part_of
    target_id: text()
      .notNull()
      .references(() => EntityTable.id, { onDelete: "cascade" }),
    weight: integer().notNull().default(100), // 0-100
    metadata_json: text({ mode: "json" }).$type<Record<string, unknown>>(),
    created_at: integer()
      .notNull()
      .$default(() => Date.now()),
  },
  (table) => [
    index("edge_tenant_source_idx").on(table.tenant_id, table.source_id),
    index("edge_tenant_target_idx").on(table.tenant_id, table.target_id),
    index("edge_relation_idx").on(table.relation),
    uniqueIndex("edge_unique_uq").on(table.tenant_id, table.source_id, table.relation, table.target_id),
  ],
)

// =============================================================================
// Procedural Memory - Operational strategies and preferences
// =============================================================================

export const ProcedureTable = sqliteTable(
  "procedures",
  {
    id: text()
      .primaryKey()
      .$default(() => createId("proc")),
    tenant_id: text().notNull(),
    user_id: text(),
    scope: text().notNull().default("global"), // global, agency, skill, user
    name: text().notNull(),
    description: text(),
    status: text().notNull().default("active"), // active, archived, deprecated
    current_version: text().notNull().default("1.0.0"),
    success_rate: integer().notNull().default(0), // 0-100
    usage_count: integer().notNull().default(0),
    // BP-07: Enhanced procedural memory fields
    pattern_tags: text({ mode: "json" }).$type<string[]>(), // JSON array of pattern tags
    steps: text({ mode: "json" }).$type<string[]>(), // JSON array of steps
    prerequisites: text({ mode: "json" }).$type<string[]>(), // JSON array of prerequisites
    created_at: integer()
      .notNull()
      .$default(() => Date.now()),
    updated_at: integer()
      .notNull()
      .$onUpdate(() => Date.now()),
  },
  (table) => [
    index("proc_tenant_user_idx").on(table.tenant_id, table.user_id),
    index("proc_scope_idx").on(table.scope),
    index("proc_name_idx").on(table.name),
    index("proc_status_idx").on(table.status),
  ],
)

export const ProcedureVersionTable = sqliteTable(
  "procedure_versions",
  {
    id: text()
      .primaryKey()
      .$default(() => createId("pv")),
    procedure_id: text()
      .notNull()
      .references(() => ProcedureTable.id, { onDelete: "cascade" }),
    version: text().notNull(),
    steps_json: text({ mode: "json" }).notNull(),
    triggers_json: text({ mode: "json" }).$type<Record<string, unknown>>(),
    confidence: integer().notNull().default(50),
    created_at: integer()
      .notNull()
      .$default(() => Date.now()),
    created_by: text(),
    reason: text(),
  },
  (table) => [index("procver_procedure_idx").on(table.procedure_id), index("procver_version_idx").on(table.version)],
)

// =============================================================================
// User Profile - Preferences and communication style
// =============================================================================

export const UserProfileTable = sqliteTable(
  "user_profile",
  {
    id: text()
      .primaryKey()
      .$default(() => createId("prof")),
    tenant_id: text().notNull(),
    user_id: text().notNull(),
    preferences_json: text({ mode: "json" }).$type<Record<string, unknown>>().default({}),
    communication_style: text().default("neutral"), // formal, neutral, casual
    constraints_json: text({ mode: "json" }).$type<Record<string, unknown>>().default({}),
    updated_at: integer()
      .notNull()
      .$onUpdate(() => Date.now()),
    created_at: integer()
      .notNull()
      .$default(() => Date.now()),
  },
  (table) => [index("profile_tenant_user_idx").on(table.tenant_id, table.user_id)],
)

// =============================================================================
// Feedback Events - User feedback on responses
// =============================================================================

export const FeedbackEventTable = sqliteTable(
  "feedback_events",
  {
    id: text()
      .primaryKey()
      .$default(() => createId("fb")),
    tenant_id: text().notNull(),
    user_id: text(),
    target_type: text().notNull(), // fact, procedure, response, episode
    target_id: text().notNull(),
    vote: text().notNull(), // up, down
    reason: text(), // wrong_fact, irrelevant, too_verbose, style_mismatch, unsafe, other
    correction_text: text(),
    ts: integer()
      .notNull()
      .$default(() => Date.now()),
    created_at: integer()
      .notNull()
      .$default(() => Date.now()),
  },
  (table) => [
    index("feedback_target_idx").on(table.target_type, table.target_id),
    index("feedback_tenant_user_idx").on(table.tenant_id, table.user_id),
    index("feedback_ts_idx").on(table.ts),
  ],
)

// =============================================================================
// Audit Log - Immutable operation trail
// =============================================================================

export const MemoryAuditLogTable = sqliteTable(
  "memory_audit_log",
  {
    id: text()
      .primaryKey()
      .$default(() => createId("audit")),
    actor: text().notNull(), // user_id, system, agent_id
    action: text().notNull(), // create, read, update, delete, purge
    target_type: text().notNull(), // fact, episode, procedure, working, etc.
    target_id: text(),
    reason: text(), // User-specified or system reason code
    correlation_id: text(),
    previous_hash: text(), // Hash chain for immutability
    hash: text().notNull(), // SHA-256 of this entry
    metadata_json: text({ mode: "json" }).$type<Record<string, unknown>>(),
    ts: integer()
      .notNull()
      .$default(() => Date.now()),
    created_at: integer()
      .notNull()
      .$default(() => Date.now()),
  },
  (table) => [
    index("audit_target_idx").on(table.target_type, table.target_id),
    index("audit_actor_idx").on(table.actor),
    index("audit_ts_idx").on(table.ts),
    index("audit_hash_idx").on(table.hash),
  ],
)

// =============================================================================
// Type exports for use in application code
// =============================================================================

export type Tenant = typeof TenantTable.$inferSelect
export type NewTenant = typeof TenantTable.$inferInsert

export type WorkingState = typeof WorkingStateTable.$inferSelect
export type NewWorkingState = typeof WorkingStateTable.$inferInsert

export type MemoryEvent = typeof MemoryEventTable.$inferSelect
export type NewMemoryEvent = typeof MemoryEventTable.$inferInsert

export type Episode = typeof EpisodeTable.$inferSelect
export type NewEpisode = typeof EpisodeTable.$inferInsert

export type Fact = typeof FactTable.$inferSelect
export type NewFact = typeof FactTable.$inferInsert

export type FactVector = typeof FactVectorTable.$inferSelect
export type NewFactVector = typeof FactVectorTable.$inferInsert

export type Entity = typeof EntityTable.$inferSelect
export type NewEntity = typeof EntityTable.$inferInsert

export type MemoryEdge = typeof MemoryEdgeTable.$inferSelect
export type NewMemoryEdge = typeof MemoryEdgeTable.$inferInsert

export type Procedure = typeof ProcedureTable.$inferSelect
export type NewProcedure = typeof ProcedureTable.$inferInsert

export type ProcedureVersion = typeof ProcedureVersionTable.$inferSelect
export type NewProcedureVersion = typeof ProcedureVersionTable.$inferInsert

export type UserProfile = typeof UserProfileTable.$inferSelect
export type NewUserProfile = typeof UserProfileTable.$inferInsert

export type FeedbackEvent = typeof FeedbackEventTable.$inferSelect
export type NewFeedbackEvent = typeof FeedbackEventTable.$inferInsert

export type MemoryAuditLog = typeof MemoryAuditLogTable.$inferSelect
export type NewMemoryAuditLog = typeof MemoryAuditLogTable.$inferInsert

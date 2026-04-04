import z from "zod"
import { fn } from "@/util/fn"
import { AgencyId, AgentId, SkillId, CorrelationId, Duration } from "../types"

// =============================================================================
// Base Memory Types
// =============================================================================

// Memory identifier types
export const MemoryId = z.string().brand<"MemoryId">()
export type MemoryId = z.infer<typeof MemoryId>

export const EpisodeId = z.string().brand<"EpisodeId">()
export type EpisodeId = z.infer<typeof EpisodeId>

export const EventId = z.string().brand<"EventId">()
export type EventId = z.infer<typeof EventId>

export const FactId = z.string().brand<"FactId">()
export type FactId = z.infer<typeof FactId>

export const EmbeddingId = z.string().brand<"EmbeddingId">()
export type EmbeddingId = z.infer<typeof EmbeddingId>

export const EntityId = z.string().brand<"EntityId">()
export type EntityId = z.infer<typeof EntityId>

export const ProcedureId = z.string().brand<"ProcedureId">()
export type ProcedureId = z.infer<typeof ProcedureId>

export const PatternId = z.string().brand<"PatternId">()
export type PatternId = z.infer<typeof PatternId>

export const VersionId = z.string().brand<"VersionId">()
export type VersionId = z.infer<typeof VersionId>

// Memory layers
export const Layer = z.enum(["working", "episodic", "semantic", "procedural"])
export type Layer = z.infer<typeof Layer>

// Sensitivity levels (P0 = highest, P3 = lowest)
export const SensitivityLevel = z.enum(["critical", "high", "medium", "low"])
export type SensitivityLevel = z.infer<typeof SensitivityLevel>

// Data categories
export const DataCategory = z.enum(["user", "system", "session", "audit"])
export type DataCategory = z.infer<typeof DataCategory>

// Encryption levels
export const EncryptionLevel = z.enum(["none", "standard", "strong", "maximum"])
export type EncryptionLevel = z.infer<typeof EncryptionLevel>

// =============================================================================
// Memory Entry Structure
// =============================================================================

export const MemoryEntrySchema = z.object({
  id: MemoryId,
  layer: Layer,
  key: z.string(),
  value: z.unknown(),
  sensitivity: SensitivityLevel.default("medium"),
  category: DataCategory.default("session"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  correlationId: CorrelationId.optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
export type MemoryEntry = z.infer<typeof MemoryEntrySchema>

// =============================================================================
// Classification Types
// =============================================================================

export const ClassificationSchema = z.object({
  layer: Layer,
  sensitivity: SensitivityLevel,
  confidence: z.number().min(0).max(1),
  reasoning: z.string().optional(),
})
export type Classification = z.infer<typeof ClassificationSchema>

// =============================================================================
// Retention Policy
// =============================================================================

export const RetentionPolicySchema = z.object({
  layer: Layer,
  ttlMs: Duration.optional(),
  maxEntries: z.number().int().positive().optional(),
  encryption: EncryptionLevel.default("standard"),
  compress: z.boolean().default(false),
})
export type RetentionPolicy = z.infer<typeof RetentionPolicySchema>

// Purge reasons
export const PurgeReason = z.enum(["expired", "right_to_forget", "policy_breach", "manual", "migration"])
export type PurgeReason = z.infer<typeof PurgeReason>

// =============================================================================
// Retrieval Types
// =============================================================================

export const MemoryQuerySchema = z.object({
  layer: Layer.optional(),
  keys: z.array(z.string()).optional(),
  sensitivityMax: SensitivityLevel.optional(),
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
  limit: z.number().int().positive().default(100),
  correlationId: CorrelationId.optional(),
})
export type MemoryQuery = z.infer<typeof MemoryQuerySchema>

export const SemanticQuerySchema = z.object({
  text: z.string().optional(),
  embedding: z.array(z.number()).optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
  k: z.number().int().positive().default(10),
})
export type SemanticQuery = z.infer<typeof SemanticQuerySchema>

// Retrieval context for ranking
export const RetrievalContextSchema = z.object({
  agencyId: AgencyId.optional(),
  agentId: AgentId.optional(),
  skillId: SkillId.optional(),
  task: z.string().optional(),
  recencyWeight: z.number().min(0).max(1).default(0.3),
  relevanceWeight: z.number().min(0).max(1).default(0.4),
  confidenceWeight: z.number().min(0).max(1).default(0.2),
  sensitivityWeight: z.number().min(0).max(1).default(0.1),
})
export type RetrievalContext = z.infer<typeof RetrievalContextSchema>

// Ranked result
export const RankedResultSchema = z.object({
  entry: MemoryEntrySchema,
  score: z.number(),
  factors: z.object({
    recency: z.number(),
    relevance: z.number(),
    confidence: z.number(),
    sensitivity: z.number(),
    provenance: z.number(),
  }),
})
export type RankedResult = z.infer<typeof RankedResultSchema>

// =============================================================================
// Event Types (for Episodic Memory)
// =============================================================================

export const EventType = z.enum([
  "task_start",
  "task_complete",
  "task_fail",
  "tool_call",
  "tool_result",
  "agent_action",
  "agency_action",
  "policy_decision",
  "user_interaction",
  "system_event",
])
export type EventType = z.infer<typeof EventType>

export const MemoryEventSchema = z.object({
  id: EventId,
  type: EventType,
  timestamp: z.string().datetime(),
  correlationId: CorrelationId,
  agencyId: AgencyId.optional(),
  agentId: AgentId.optional(),
  skillId: SkillId.optional(),
  data: z.record(z.string(), z.unknown()),
})
export type MemoryEvent = z.infer<typeof MemoryEventSchema>

// Task outcome
export const OutcomeSchema = z.enum(["success", "failure", "partial", "cancelled"])
export type Outcome = z.infer<typeof OutcomeSchema>

// Episode (completed task)
export const EpisodeSchema = z.object({
  id: EpisodeId,
  taskId: z.string(),
  taskDescription: z.string(),
  outcome: OutcomeSchema,
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  correlationId: CorrelationId,
  agencyId: AgencyId,
  agentId: AgentId.optional(),
  events: z.array(EventId),
  artifacts: z.record(z.string(), z.unknown()).optional(),
})
export type Episode = z.infer<typeof EpisodeSchema>

// Timeline filter
export const TimelineFilterSchema = z.object({
  since: z.string().datetime().optional(),
  until: z.string().datetime().optional(),
  agencyId: AgencyId.optional(),
  agentId: AgentId.optional(),
  outcome: OutcomeSchema.optional(),
  limit: z.number().int().positive().default(50),
})
export type TimelineFilter = z.infer<typeof TimelineFilterSchema>

// =============================================================================
// Semantic Memory Types
// =============================================================================

// Fact for semantic memory
export const FactSchema = z.object({
  id: FactId,
  subject: z.string(),
  predicate: z.string(),
  object: z.unknown(),
  confidence: z.number().min(0).max(1),
  source: z.string().optional(),
  actorType: z.enum(["user", "agent", "system"]).optional(),
  actorId: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type Fact = z.infer<typeof FactSchema>

// Embedding metadata
export const EmbeddingMetadataSchema = z.object({
  content: z.string().optional(), // Optional since content is passed separately
  entityType: z.string().optional(),
  entityId: EntityId.optional(),
  agencyId: AgencyId.optional(),
  tags: z.array(z.string()).optional(),
})
export type EmbeddingMetadata = z.infer<typeof EmbeddingMetadataSchema>

// Similarity result
export const SimilarFactSchema = z.object({
  fact: FactSchema,
  similarity: z.number(),
  rank: z.number(),
})
export type SimilarFact = z.infer<typeof SimilarFactSchema>

// Relation in graph
export const RelationSchema = z.object({
  sourceId: EntityId,
  relation: z.string(),
  targetId: EntityId,
  weight: z.number().min(0).max(1).default(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
})
export type Relation = z.infer<typeof RelationSchema>

// =============================================================================
// Procedural Memory Types
// =============================================================================

// Procedure (strategy, playbook, policy)
export const ProcedureSchema = z.object({
  id: ProcedureId,
  name: z.string(),
  description: z.string(),
  version: z.string(),
  agencyId: AgencyId.optional(),
  skillId: SkillId.optional(),
  steps: z.array(
    z.object({
      id: z.string(),
      action: z.string(),
      parameters: z.record(z.string(), z.unknown()).optional(),
      next: z.string().optional(),
    }),
  ),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type Procedure = z.infer<typeof ProcedureSchema>

// Version entry
export const VersionSchema = z.object({
  id: VersionId,
  procedureId: ProcedureId,
  version: z.string(),
  procedure: ProcedureSchema,
  createdAt: z.string().datetime(),
  createdBy: z.string(),
  reason: z.string().optional(),
})
export type Version = z.infer<typeof VersionSchema>

// Skill pattern
export const SkillPatternSchema = z.object({
  id: PatternId,
  skillId: SkillId,
  name: z.string(),
  description: z.string(),
  steps: z.array(z.string()),
  usageCount: z.number().default(0),
  successRate: z.number().default(0),
  lastUsed: z.string().datetime().optional(),
})
export type SkillPattern = z.infer<typeof SkillPatternSchema>

// Procedure filter
export const ProcedureFilterSchema = z.object({
  agencyId: AgencyId.optional(),
  skillId: SkillId.optional(),
  name: z.string().optional(),
  version: z.string().optional(),
})
export type ProcedureFilter = z.infer<typeof ProcedureFilterSchema>

// =============================================================================
// Lifecycle Types
// =============================================================================

// Run artifacts for capture
export const RunArtifactsSchema = z.object({
  intent: z.string(),
  plan: z.string().optional(),
  evidences: z.array(z.string()).default([]),
  outcome: z.string(),
  durationMs: Duration,
})
export type RunArtifacts = z.infer<typeof RunArtifactsSchema>

// Consolidation result
export const ConsolidationResultSchema = z.object({
  sourceEpisodes: z.array(EpisodeId),
  targetEntry: MemoryEntrySchema,
  confidence: z.number().min(0).max(1),
})
export type ConsolidationResult = z.infer<typeof ConsolidationResultSchema>

// Purge result
export const PurgeResultSchema = z.object({
  purged: z.number(),
  failed: z.number(),
  errors: z.array(
    z.object({
      id: MemoryId,
      reason: z.string(),
    }),
  ),
})
export type PurgeResult = z.infer<typeof PurgeResultSchema>

// =============================================================================
// Memory Broker Interface
// =============================================================================

export interface MemoryBroker {
  // Layer access
  working(): WorkingMemory
  episodic(): EpisodicMemory
  semantic(): SemanticMemory
  procedural(): ProceduralMemory

  // Unified operations
  write(entry: MemoryEntry): Promise<void>
  read(query: MemoryQuery): Promise<MemoryEntry[]>
  search(query: SemanticQuery): Promise<RankedResult[]>

  // Lifecycle
  classify(entry: unknown): Classification
  retain(entry: MemoryEntry, policy: RetentionPolicy): void
  purge(entryId: MemoryId, reason: PurgeReason): Promise<void>
}

// =============================================================================
// Memory Lifecycle Interface
// =============================================================================

export interface MemoryLifecycle {
  capture(run: RunArtifacts): MemoryEntry[]
  classify(artifacts: MemoryEntry[]): Classification[]
  applyRetentionPolicy(layer: Layer, domain?: string): RetentionPolicy
  consolidate(sourceEpisodes: EpisodeId[]): Promise<ConsolidationResult>
  purge(entryId: MemoryId, reason: PurgeReason): Promise<void>
  purgeBatch(entryIds: MemoryId[], reason: PurgeReason): Promise<PurgeResult>
  getStats(): Promise<{
    working: { size: number; keys: string[] }
    episodic: { totalEpisodes: number; totalEvents: number }
    semantic: { totalFacts: number }
    procedural: { totalProcedures: number; totalPatterns: number }
  }>
}

// =============================================================================
// Layer Interfaces
// =============================================================================

export interface WorkingMemory {
  // Context management
  set(key: string, value: unknown, ttlMs?: number): void
  get(key: string): unknown
  remove(key: string): void
  delete(key: string): void
  clear(): void
  cleanup(): void

  // Session continuity
  snapshot(): Map<string, unknown>
  restore(snapshot: Map<string, unknown>): void

  // Batch operations
  setMany(entries: Record<string, unknown>, ttlMs?: number): void
  getMany(keys: string[]): Record<string, unknown>

  // Utility
  stats(): { size: number; keys: string[] }
}

// =============================================================================
// Episodic Memory Interface
// =============================================================================

export interface EpisodicMemory {
  // Event capture
  record(event: MemoryEvent): Promise<EventId>
  recordTask(
    taskId: string,
    taskDescription: string,
    outcome: Outcome,
    startedAt: Date,
    correlationId: string,
    agencyId: string,
    agentId?: string,
    artifacts?: Record<string, unknown>,
  ): Promise<EpisodeId>

  // Retrieval
  getEpisode(episodeId: EpisodeId): Promise<Episode | null>
  getRecentEpisodes(count: number, since?: Date): Promise<Episode[]>
  getEventsByType(type: EventType, since?: Date): Promise<MemoryEvent[]>

  // Timeline
  getTimeline(filter?: TimelineFilter): Promise<Episode[]>

  // Maintenance
  clear(): void

  // Statistics
  getStats(): Promise<{
    totalEpisodes: number
    totalEvents: number
    byOutcome: Record<Outcome, number>
    byAgency: Record<string, number>
  }>
}

// =============================================================================
// Semantic Memory Interface
// =============================================================================

export interface SemanticMemory {
  // Knowledge operations
  assert(fact: Omit<Fact, "id" | "createdAt" | "updatedAt">): Promise<FactId>
  retract(factId: FactId): Promise<void>
  update(factId: FactId, newValue: unknown): Promise<void>

  // Query
  query(subject?: string, predicate?: string): Promise<Fact[]>

  // Vector search
  embedAndStore(content: string, metadata: EmbeddingMetadata): Promise<EmbeddingId>
  similaritySearch(embedding: number[], k: number): Promise<SimilarFact[]>

  // Graph operations
  link(sourceId: EntityId, relation: string, targetId: EntityId, weight?: number): Promise<void>
  getRelations(entityId: EntityId): Promise<Relation[]>
  getConnected(entityId: EntityId, relation?: string): Promise<EntityId[]>

  // Maintenance
  clear(): void
  consolidate(episodeIds: EpisodeId[]): Promise<ConsolidationResult>
}

// =============================================================================
// Procedural Memory Interface
// =============================================================================

export interface ProceduralMemory {
  // Procedure storage
  register(procedure: Omit<Procedure, "id" | "createdAt" | "updatedAt">): Promise<ProcedureId>
  get(procedureId: ProcedureId): Promise<Procedure | null>
  list(filter?: ProcedureFilter): Promise<Procedure[]>
  update(procedureId: ProcedureId, procedure: Partial<Procedure>): Promise<void>

  // Versioning
  getVersionHistory(procedureId: ProcedureId): Promise<Version[]>
  rollback(procedureId: ProcedureId, versionId: VersionId): Promise<void>

  // Patterns
  registerPattern(pattern: Omit<SkillPattern, "id">): Promise<PatternId>
  findPattern(skillId: SkillId): Promise<SkillPattern | null>
  updatePatternStats(patternId: PatternId, success: boolean): Promise<void>

  // Maintenance
  clear(): void
}

// =============================================================================
// Factory Functions
// =============================================================================

export const MemoryIdFactory = {
  create: (): MemoryId => crypto.randomUUID() as MemoryId,
}

export const EpisodeIdFactory = {
  create: (): EpisodeId => `ep_${crypto.randomUUID()}` as EpisodeId,
}

export const EventIdFactory = {
  create: (): EventId => `ev_${crypto.randomUUID()}` as EventId,
}

export const FactIdFactory = {
  create: (): FactId => `fact_${crypto.randomUUID()}` as FactId,
}

export const ProcedureIdFactory = {
  create: (): ProcedureId => `proc_${crypto.randomUUID()}` as ProcedureId,
}

export const VersionIdFactory = {
  create: (): VersionId => `v_${crypto.randomUUID()}` as VersionId,
}

# ADR-002: Memory 4-Layer Architecture

> **Status**: Draft  
> **Date**: 2026-04-02  
> **Deciders**: Architect, Orchestrator

## Context

Kiloclaw requires a sophisticated memory system that supports:

- Short-term operational context (working memory)
- Session-scoped episodic memory for recent events
- Long-term semantic memory for consolidated knowledge
- Versioned procedural memory for strategies and policies

The memory system must:

- Provide isolation between layers with independent storage
- Support lifecycle policies (TTL, retention, purge)
- Enable retrieval with multi-factor ranking
- Maintain audit trail for compliance

## Decision

Implement a 4-layer memory architecture with unified broker access.

### Layer Definitions

| Layer          | Purpose                                         | TTL/Retention                  | Storage                     | Primary Access           |
| -------------- | ----------------------------------------------- | ------------------------------ | --------------------------- | ------------------------ |
| **Working**    | Live operational context                        | Minutes/hours                  | In-memory + local cache     | Agent runtime            |
| **Episodic**   | Completed events and tasks                      | 30-180 days                    | Append-only event store     | Orchestrator + analytics |
| **Semantic**   | Consolidated facts and user/system knowledge    | Long-term with periodic review | Vector + Graph + Docs store | Cross-agency retrieval   |
| **Procedural** | Strategies, playbooks, policies, skill patterns | Versioned, no auto-expiry      | Versioned registry          | Planner + skill engine   |

### Memory Broker Interface

```typescript
interface MemoryBroker {
  // Layer-specific access
  working(): WorkingMemory
  episodic(): EpisodicMemory
  semantic(): SemanticMemory
  procedural(): ProceduralMemory

  // Unified operations
  write(entry: MemoryEntry): Promise<void>
  read(query: MemoryQuery): Promise<MemoryResult[]>
  search(query: SemanticQuery): Promise<SearchResult[]>

  // Lifecycle
  classify(entry: unknown): Classification
  retain(entry: MemoryEntry, policy: RetentionPolicy): void
  purge(entryId: MemoryId, reason: PurgeReason): Promise<void>
}
```

### Working Memory

```typescript
interface WorkingMemory {
  // Context management
  set(key: string, value: unknown): void
  get(key: string): unknown
  delete(key: string): void

  // Session continuity
  snapshot(): WorkingSnapshot
  restore(snapshot: WorkingSnapshot): void

  // TTL-based expiration
  setTTL(key: string, ttl: Duration): void
}
```

### Episodic Memory

```typescript
interface EpisodicMemory {
  // Event capture
  record(event: MemoryEvent): Promise<EventId>
  recordTask(task: Task, outcome: Outcome): Promise<EpisodeId>

  // Retrieval
  getEpisode(episodeId: EpisodeId): Promise<Episode>
  getRecentEpisodes(count: number, window: TimeWindow): Promise<Episode[]>
  getEventsByType(type: EventType, window: TimeWindow): Promise<MemoryEvent[]>

  // Timeline operations
  getTimeline(filter?: TimelineFilter): Promise<TimelineEntry[]>
}
```

### Semantic Memory

```typescript
interface SemanticMemory {
  // Knowledge operations
  assert(fact: Fact): Promise<FactId>
  retract(factId: FactId): Promise<void>
  update(factId: FactId, newValue: unknown): Promise<void>

  // Query
  query(pattern: FactPattern): Promise<Fact[]>

  // Vector search
  embedAndStore(content: string, metadata: Metadata): Promise<EmbeddingId>
  similaritySearch(embedding: EmbeddingVector, k: number): Promise<SimilarFact[]>

  // Graph operations
  link(sourceId: EntityId, relation: Relation, targetId: EntityId): Promise<void>
  getRelations(entityId: EntityId): Promise<Relation[]>
}
```

### Procedural Memory

```typescript
interface ProceduralMemory {
  // Strategy/policy storage
  registerProcedure(procedure: Procedure): Promise<ProcedureId>
  getProcedure(procedureId: ProcedureId): Promise<Procedure>
  listProcedures(filter?: ProcedureFilter): Promise<Procedure[]>

  // Versioning
  updateProcedure(procedureId: ProcedureId, newVersion: Procedure): Promise<VersionId>
  getVersionHistory(procedureId: ProcedureId): Promise<Version[]>
  rollback(procedureId: ProcedureId, versionId: VersionId): Promise<void>

  // Pattern management
  registerPattern(pattern: SkillPattern): Promise<PatternId>
  findPattern(skillId: SkillId): Promise<SkillPattern | null>
}
```

### Lifecycle Management

```typescript
interface MemoryLifecycle {
  // Capture: every run produces minimal artifacts
  capture(run: Run): MemoryArtifacts

  // Classify: broker assigns layer, sensitivity, confidence
  classify(artifacts: MemoryArtifacts): Classifications

  // Retain: policy per layer, domain, data type
  applyRetentionPolicy(layer: Layer, domain: Domain): RetentionResult

  // Refresh: periodic consolidation (episodic → semantic/procedural)
  consolidate(source: EpisodeId[], target: SemanticEntry): Promise<void>

  // Purge: secure deletion by expiry, right-to-forgiveness, or policy breach
  purge(entryId: MemoryId, reason: PurgeReason): Promise<void>
  purgeBatch(entryIds: MemoryId[], reason: PurgeReason): Promise<PurgeResult>
}
```

### Retrieval Policy

```typescript
interface RetrievalPolicy {
  // Multi-factor ranking
  rank(candidates: MemoryResult[], context: RetrievalContext): RankedResult[]

  // Factor weights (configurable)
  readonly weights: {
    recency: number // 0-1, temporal relevance
    relevance: number // 0-1, semantic similarity
    confidence: number // 0-1, source reliability
    sensitivity: number // 0-1, data classification (lower = more accessible)
    provenance: number // 0-1, evidence quality
  }
}
```

### Data Classification

```typescript
enum SensitivityLevel {
  P0 = "critical", // Highest sensitivity, minimal retention
  P1 = "high", // High sensitivity, restricted access
  P2 = "medium", // Standard sensitivity
  P3 = "low", // Minimal sensitivity, broad access
}

interface DataClassification {
  sensitivity: SensitivityLevel
  category: "user" | "system" | "session" | "audit"
  retention: RetentionPolicy
  encryption: EncryptionLevel
}
```

## Consequences

### Positive

- Clear separation enables independent scaling and retention policies
- Multi-layer retrieval provides rich contextual access
- Versioned procedural memory supports audit and rollback
- Classification enables data minimization

### Negative

- Complexity in cross-layer consistency
- Potential latency in semantic search
- Storage costs for long-term layers

### Mitigations

- Optimistic locking for concurrent updates
- Benchmark-driven indexing optimization
- Configurable retention based on sensitivity

## References

- KILOCLAW_BLUEPRINT.md Section 4
- KILOCLAW_FOUNDATION_PLAN.md Phase 3 (Memory)

# Memory 4-Layer Architecture

> **Status**: Implemented + Enhanced  
> **Date**: 2026-04-05  
> **Last Updated**: 2026-04-06 (Recall Policy + Preference Reuse)  
> **ADR**: ADR-002, ADR-005  
> **Implementation**: Phase 3 (Base) + KILOCLAW_MEMORY_ENHANCEMENT_PLAN (SOTA)

## Overview

Kiloclaw implements a 4-layer memory architecture as defined in the Blueprint and ADR-002. Each layer is designed for specific memory use cases with independent storage, retention policies, and retrieval mechanisms.

## Layer Definitions

| Layer          | Purpose                              | TTL/Retention             | Storage                     | Primary Access           |
| -------------- | ------------------------------------ | ------------------------- | --------------------------- | ------------------------ |
| **Working**    | Live operational context             | Minutes/hours             | In-memory + local cache     | Agent runtime            |
| **Episodic**   | Completed events and tasks           | 30-180 days               | Append-only event store     | Orchestrator + analytics |
| **Semantic**   | Consolidated facts and knowledge     | Long-term with review     | Vector + Graph + Docs store | Cross-agency retrieval   |
| **Procedural** | Strategies, policies, skill patterns | Versioned, no auto-expiry | Versioned registry          | Planner + skill engine   |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MEMORY BROKER                             │
│  Unified interface for all layers                           │
│  - write() / read() / search()                             │
│  - classify() / retain() / purge()                         │
└─────────────────────────────────────────────────────────────┘
         │           │           │           │
         ▼           ▼           ▼           ▼
┌─────────────┐ ┌───────────┐ ┌──────────┐ ┌─────────────┐
│   WORKING   │ │ EPISODIC  │ │ SEMANTIC │ │ PROCEDURAL  │
│             │ │           │ │          │ │             │
│ In-memory   │ │ Event     │ │ Facts    │ │ Procedures  │
│ KV store    │ │ store     │ │ Embed-   │ │ Versioned   │
│ TTL-based   │ │ Episodes  │ │ dings    │ │ registry    │
│ expiration  │ │ Timeline   │ │ Graph    │ │ Patterns    │
└─────────────┘ └───────────┘ └──────────┘ └─────────────┘
```

## SOTA Enhancements (All 15 Best Practices)

The memory system has been enhanced with 15 state-of-the-art best practices across 4 phases:

| BP        | Name                    | Module                      | Description                                                      |
| --------- | ----------------------- | --------------------------- | ---------------------------------------------------------------- |
| BP-01     | Unified Error Taxonomy  | `memory.errors.ts`          | `NamedError` hierarchy with structured error codes               |
| BP-02     | Confidence Scoring      | `memory.confidence.ts`      | Source reliability × evidence quality × staleness decay          |
| BP-03     | Provenance Tracking     | `memory.provenance.ts`      | Evidence chain from observation to retrieval                     |
| BP-04     | Privacy Tiers           | `memory.privacy.ts`         | P0-P3 sensitivity with tier-specific handling                    |
| BP-05     | Privacy Enforcement     | `memory.privacy.ts`         | Automatic redaction, aggregation, filtering by tier              |
| BP-06     | Cross-Agency Bridging   | `memory.privacy.ts`         | Agency ID + session ID tagging for audit trails                  |
| BP-07     | Hybrid Storage          | `memory.config.ts`          | SQLite + file backup with automatic fallback                     |
| BP-08     | Unified API             | `broker.ts`                 | Single `MemoryBroker` interface across all layers                |
| BP-09     | Vector + Graph Store    | `semantic.ts`               | Hybrid FAISS + NetworkX for semantic retrieval                   |
| BP-10     | Temporal Decay          | `semantic.ts`               | `1 / (1 + age_in_days * decay_factor)` confidence decay          |
| BP-11     | Memory Lifecycle        | `lifecycle.ts`              | Capture → Classify → Retain → Consolidate → Purge                |
| **BP-12** | **Memory Maintenance**  | **`memory.maintenance.ts`** | **Automated deduplication, stale deletion, refresh**             |
| BP-13     | Retention Policies      | `lifecycle.ts`              | Per-layer TTL, compression, encryption settings                  |
| BP-14     | Tiered Retrieval        | `semantic.ts`               | BM25 + cosine + Graph traversal fusion                           |
| **BP-15** | **Tiered Architecture** | **`memory.tier.ts`**        | **5-tier system (Context→Working→Episodic→Semantic→Procedural)** |

## Module Structure

```
src/kiloclaw/memory/
├── index.ts            # Barrel exports
├── types.ts            # Type definitions and interfaces
├── working.ts          # Working memory implementation
├── episodic.ts         # Episodic memory implementation
├── semantic.ts         # Semantic memory implementation
├── procedural.ts       # Procedural memory implementation
├── broker.ts           # Memory broker (unified interface)
├── lifecycle.ts        # Lifecycle management (BP-11, BP-13)
├── errors.ts           # Unified error taxonomy (BP-01)
├── confidence.ts       # Confidence scoring (BP-02)
├── provenance.ts       # Provenance tracking (BP-03)
├── privacy.ts          # Privacy tiers + enforcement (BP-04, BP-05, BP-06)
├── config.ts           # Hybrid storage config (BP-07)
├── reranker.ts         # Tiered retrieval with batch embedding + LRU cache (BP-14)
├── maintenance.ts      # Memory maintenance scheduler (BP-12)
├── tier.ts             # 5-tier architecture definitions (BP-15)
└── state.ts            # Instance state with maintenance scheduler + graceful shutdown
```

## Memory Broker

The `MemoryBroker` provides a unified interface for all memory operations:

```typescript
interface MemoryBroker {
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
```

## Working Memory

Purpose: Live operational context for agent runtime.

**Features:**

- Key-value store with TTL-based expiration
- Snapshot/restore for session continuity
- Batch operations for efficiency
- Automatic cleanup of expired entries

**Usage:**

```typescript
WorkingMemory.set("context:current_task", { taskId: "123", status: "running" })
const context = WorkingMemory.get("context:current_task")
WorkingMemory.setMany({ key1: value1, key2: value2 })
const snapshot = WorkingMemory.snapshot()
```

## Episodic Memory

Purpose: Store completed events and tasks for analytics and context.

**Features:**

- Event recording with type-based indexing
- Episode recording for completed tasks
- Timeline queries with filters
- Statistics by outcome and agency

**Usage:**

```typescript
await EpisodicMemory.record({
  id: "ev_123",
  type: "task_complete",
  timestamp: new Date().toISOString(),
  correlationId: "corr_456",
  agencyId: "agency_dev",
  data: { result: "success" },
})

const episodes = await EpisodicMemory.getRecentEpisodes(10)
const timeline = await EpisodicMemory.getTimeline({ limit: 50 })
```

## Semantic Memory

Purpose: Long-term knowledge storage with vector similarity search.

**Features:**

- Fact storage with subject-predicate indexing
- Text embedding and similarity search
- Graph relations between entities
- Consolidation from episodic memory

**Usage:**

```typescript
const factId = await SemanticMemory.assert({
  subject: "user_preference",
  predicate: "theme",
  object: "dark",
  confidence: 0.9,
  source: "user_settings",
})

await SemanticMemory.link("user_123", "prefers", "dark_theme")
const connected = await SemanticMemory.getConnected("user_123")
```

## Procedural Memory

Purpose: Versioned storage for strategies, policies, and skill patterns.

**Features:**

- Procedure registration with versioning
- Version history with rollback capability
- Skill pattern tracking with success rates
- Agency and skill-based indexing

**Usage:**

```typescript
const procedureId = await ProceduralMemory.register({
  name: "code_review_workflow",
  description: "Standard code review process",
  version: "1.0.0",
  agencyId: "agency_dev",
  steps: [
    { id: "1", action: "lint", next: "2" },
    { id: "2", action: "test", next: "3" },
    { id: "3", action: "approve" },
  ],
})

const history = await ProceduralMemory.getVersionHistory(procedureId)
```

## Memory Maintenance (BP-12)

The `memory.maintenance.ts` module provides automated maintenance to keep memory healthy:

**Operations:**

- **Deduplication**: Keeps highest confidence fact per subject+predicate
- **Stale deletion**: Removes old facts with low confidence
- **Low-confidence refresh**: Boosts high-provenance facts
- **Health check**: Diagnostic for memory system health

**Usage:**

```typescript
import { MemoryMaintenance } from "./memory"

// Run maintenance manually
const result = await MemoryMaintenance.run()
console.log(result)

// Check scheduled interval
const schedule = MemoryMaintenance.getSchedule()
console.log(schedule) // { intervalHours: 6, nextRun: Date }

// Get health diagnostics
const health = await MemoryMaintenance.healthCheck()
console.log(health)
/*
{
  deduplication: { removed: 5, remaining: 120 },
  staleFacts: { removed: 2, remaining: 15 },
  lowConfidenceFacts: { candidates: 3, refreshed: 1 },
  score: 0.95,
  status: "healthy"
}
*/
```

**Automatic Scheduling:**

Maintenance runs automatically via `MemoryState.startMaintenanceScheduler()`:

- Initial run: 5 minutes after startup
- Interval: Every 6 hours
- Graceful shutdown stops the scheduler

## Tiered Architecture (BP-15)

The `memory.tier.ts` module defines a 5-tier memory hierarchy:

```typescript
enum MemoryTier {
  Tier0_Context = 0, // Active agent context (no persistence)
  Tier1_Working = 1, // Session-short term (minutes to hours)
  Tier2_Episodic = 2, // Completed events (days to months)
  Tier3_Semantic = 3, // Consolidated facts (long-term)
  Tier4_Procedural = 4, // Procedures (versioned, no auto-expiry)
}
```

**Tier Configurations:**

| Tier           | TTL         | Max Items | Embedding | Vector Dim |
| -------------- | ----------- | --------- | --------- | ---------- |
| 0 - Context    | None        | Unlimited | No        | N/A        |
| 1 - Working    | 1h-24h      | 10,000    | No        | N/A        |
| 2 - Episodic   | 30-180 days | 100,000   | No        | N/A        |
| 3 - Semantic   | None        | 1,000,000 | Yes       | 1536       |
| 4 - Procedural | None        | 10,000    | Yes       | 768        |

**Usage:**

```typescript
import { MemoryTier, TIER_CONFIGS, getTierStats, getTierHealth } from "./memory"

// Get statistics for all tiers
const stats = await getTierStats()
console.log(stats)
/*
{
  tiers: {
    [MemoryTier.Tier0_Context]: { items: 42, ttl: null },
    [MemoryTier.Tier1_Working]: { items: 128, ttl: "1h" },
    [MemoryTier.Tier2_Episodic]: { items: 56, ttl: "90d" },
    [MemoryTier.Tier3_Semantic]: { items: 1024, ttl: null },
    [MemoryTier.Tier4_Procedural]: { items: 23, ttl: null },
  },
  total: 1273
}
*/

// Check tier health
const health = await getTierHealth()
console.log(health)
/*
{
  scores: {
    [MemoryTier.Tier0_Context]: 1.0,
    [MemoryTier.Tier1_Working]: 0.95,
    [MemoryTier.Tier2_Episodic]: 0.88,
    [MemoryTier.Tier3_Semantic]: 0.92,
    [MemoryTier.Tier4_Procedural]: 1.0,
  },
  overall: 0.95,
  status: "healthy"
}
*/

// Get recommended actions for underperforming tiers
const actions = await getRecommendedActions()
console.log(actions)
/*
[
  { tier: MemoryTier.Tier2_Episodic, action: "compact", reason: "items approaching maxCapacity" },
]
*/
```

## Lifecycle Management

The `MemoryLifecycle` module handles memory data lifecycle:

**Operations:**

- **Capture**: Extract artifacts from runs
- **Classify**: Assign layer, sensitivity, confidence
- **Retain**: Apply retention policies
- **Consolidate**: Move episodic → semantic/procedural
- **Purge**: Secure deletion by expiry or policy

**Retention Policies (BP-13):**

| Layer      | Default TTL | Encryption | Compression |
| ---------- | ----------- | ---------- | ----------- |
| Working    | 1 hour      | None       | No          |
| Episodic   | 90 days     | Standard   | Yes         |
| Semantic   | None        | Strong     | No          |
| Procedural | None        | Strong     | No          |

**Production Integration:**

The `memory.state.ts` module provides production-ready lifecycle management:

```typescript
import { MemoryState } from "./memory"

// Start the maintenance scheduler (auto-runs after 5 min, then every 6 hours)
MemoryState.startMaintenanceScheduler()

// Graceful shutdown (stops scheduler, flushes queues, closes DB)
await MemoryState.memoryShutdown()
```

**Shutdown Behavior:**

1. Stops the maintenance scheduler
2. Flushes writeback queue (pending semantic writes)
3. Drains background embedding queue
4. Closes SQLite database connection

## Retrieval Policy

Multi-factor ranking for memory retrieval:

```typescript
interface RetrievalPolicy {
  weights: {
    recency: number // 0-1, temporal relevance
    relevance: number // 0-1, semantic similarity
    confidence: number // 0-1, source reliability
    sensitivity: number // 0-1, data classification
    provenance: number // 0-1, evidence quality
  }
}
```

## Data Classification

Sensitivity levels for data handling:

```typescript
enum SensitivityLevel {
  P0 = "critical", // Highest sensitivity, minimal retention
  P1 = "high", // High sensitivity, restricted access
  P2 = "medium", // Standard sensitivity
  P3 = "low", // Minimal sensitivity, broad access
}
```

## Usage Example

```typescript
import { MemoryBroker, MemoryLifecycle } from "./memory"

// Create memory entry
const entry = {
  id: "mem_123",
  layer: "working",
  key: "current_task",
  value: { taskId: "task_456", status: "running" },
  sensitivity: "medium" as SensitivityLevel,
  category: "session" as DataCategory,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
}

// Write to memory
await MemoryBroker.write(entry)

// Query memory
const results = await MemoryBroker.read({
  layer: "working",
  limit: 10,
})

// Search semantic memory
const searchResults = await MemoryBroker.search({
  text: "user preferences",
  k: 5,
})

// Apply retention policy
const policy = MemoryLifecycle.applyRetentionPolicy("episodic", "audit")
MemoryBroker.retain(entry, policy)
```

## Context Plugin (Memory Recall)

The `memory/plugin.ts` provides runtime memory integration via two hooks:

### `chat.message` hook

Automatically captures every user turn into memory:

- **Working memory**: stores `session:{id}:last_user_query` with 6h TTL
- **Episodic memory**: records episode with task description, outcome, agent, timestamps

### `experimental.chat.messages.transform` hook

Intercepts queries matching recall patterns and injects context:

- **Patterns**: "ultime conversazioni", "cronologia", "what did we talk about", "previous conversation", "remember our past"
- **Retrieval**: queries `MemoryBrokerV2.retrieve()` for relevant semantic/episodic hits
- **Session history**: fetches recent sessions with titles and last user message snippets
- **Injection**: appends `<system-reminder>` block with recovered context to user message

This enables the router agent to answer questions about previous conversations by recovering context from the 4-layer memory system.

### Recall Policy Engine (2026-04-06)

The recall policy determines when memory context should be injected into prompts.

#### Intent Classification (`memory.intent.ts`)

Five intent kinds with priority order:

| Intent             | Pattern                                               | Score Boost |
| ------------------ | ----------------------------------------------------- | ----------- |
| `preference_reuse` | "in base ai miei gusti", "consigliami", "what i like" | +0.16       |
| `explicit_recall`  | "di cosa abbiamo discusso", "what did we talk about"  | +0.18       |
| `continuation`     | "riprendi", "continue from where we left off"         | +0.10       |
| `project_context`  | Default fallback for project-related queries          | 0           |
| `none`             | Score < 0.36 → skip                                   | 0           |

#### Explicit Recall Patterns (high lexical signal = 0.95)

```typescript
/di\s+cosa\s+abbiamo\s+(?:parlato|discusso|trattato)/i
/cosa\s+abbiamo\s+(?:fatto|detto)\s+(?:ultimamente|nelle\s+ultime\s+chat|nelle\s+ultime\s+sessioni)/i
/di\s+cosa\s+si\s+è\s+parlato/i
/what\s+did\s+we\s+(?:talk\s+about|discuss)\s+(?:recently|in\s+the\s+last\s+sessions?)/i
/what\s+have\s+we\s+been\s+(?:working\s+on|discussing)/i
```

#### Preference Reuse Hard-Recall Patterns

Force `decision: recall` when score ≥ 0.72:

```typescript
/in\s+base\s+ai\s+miei\s+gusti/i
/sulla\s+base\s+dei\s+miei\s+gusti/i
/in\s+base\s+alle\s+mie\s+preferenze/i
/based\s+on\s+my\s+tastes?/i
/based\s+on\s+my\s+preferences/i
/what\s+i\s+like/i
```

#### Decision Thresholds

| Decision | Condition       | Description                     |
| -------- | --------------- | ------------------------------- |
| `recall` | score ≥ 0.55    | Full memory context injection   |
| `shadow` | score 0.40–0.54 | Observational only (flag-gated) |
| `skip`   | score < 0.40    | No injection                    |

#### Session Retrieval Scope

Global session history is fetched without directory filter to enable cross-project recall:

```typescript
Session.listGlobal({ roots: true, limit: 12 })
```

#### Memory Extractor (`memory.extractor.ts`)

Selective semantic extraction from user input. Minimum content length: 20 chars.

Extraction rules:

- **likes**: "mi piace", "i like" → `subject: user, predicate: likes`
- **dislikes**: "non mi piace", "i don't like" → `subject: user, predicate: dislikes`
- **preference_context**: "in base ai miei gusti" → `subject: user, predicate: preference_context`

This enables persistent storage of user preferences (TV series tastes, etc.) for future recall.

## Testing

```bash
# Core memory tests
bun test test/kiloclaw/memory.test.ts

# Persistence tests (restart recovery)
bun test test/kiloclaw/memory-persistence.test.ts

# No-stub gate (no placeholder code in production paths)
bun test test/kiloclaw/memory-no-stub.test.ts

# Retention enforcement tests
bun test test/kiloclaw/memory-retention.test.ts

# Retrieval benchmark (requires KILO_RUN_MEMORY_BENCHMARK=true)
KILO_RUN_MEMORY_BENCHMARK=true bun test test/kiloclaw/memory-retrieval-benchmark.test.ts

# Full V2 integration
bun test test/kiloclaw/
```

## References

- [ADR-002: Memory 4-Layer Architecture](../adr/ADR-002_Memory_4_Layer.md)
- [ADR-005: Memory Error Taxonomy](../adr/ADR-005_Memory_Error_Taxonomy.md)
- [Blueprint Section 4](../foundation/KILOCLAW_BLUEPRINT.md#4-struttura-memoria-4-layer)
- [Foundation Plan Phase 3](../plans/KILOCLAW_FOUNDATION_PLAN.md#esegui-fase-3-memory-4-layer)
- [Memory Enhancement Plan (All 15 BPs)](../plans/KILOCLAW_MEMORY_ENHANCEMENT_PLAN_2026-04-04.md)
- [PostgreSQL + pgvector Migration Plan](../plans/POSTGRES_PGVECTOR_MIGRATION_PLAN.md)

# Memory 4-Layer Architecture

> **Status**: Implemented  
> **Date**: 2026-04-02  
> **ADR**: ADR-002  
> **Implementation**: Phase 3

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
│ expiration  │ │ Timeline  │ │ Graph    │ │ Patterns    │
└─────────────┘ └───────────┘ └──────────┘ └─────────────┘
```

## Module Structure

```
src/kiloclaw/memory/
├── index.ts        # Barrel exports
├── types.ts        # Type definitions and interfaces
├── working.ts      # Working memory implementation
├── episodic.ts     # Episodic memory implementation
├── semantic.ts     # Semantic memory implementation
├── procedural.ts   # Procedural memory implementation
├── broker.ts       # Memory broker (unified interface)
└── lifecycle.ts    # Lifecycle management
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

## Lifecycle Management

The `MemoryLifecycle` module handles memory data lifecycle:

**Operations:**

- **Capture**: Extract artifacts from runs
- **Classify**: Assign layer, sensitivity, confidence
- **Retain**: Apply retention policies
- **Consolidate**: Move episodic → semantic/procedural
- **Purge**: Secure deletion by expiry or policy

**Retention Policies:**

| Layer      | Default TTL | Encryption | Compression |
| ---------- | ----------- | ---------- | ----------- |
| Working    | 1 hour      | None       | No          |
| Episodic   | 90 days     | Standard   | Yes         |
| Semantic   | None        | Strong     | No          |
| Procedural | None        | Strong     | No          |

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

## Testing

Run memory layer tests:

```bash
bun test test/kiloclaw/memory.test.ts
```

## References

- [ADR-002: Memory 4-Layer Architecture](../adr/ADR-002_Memory_4_Layer.md)
- [Blueprint Section 4](../foundation/KILOCLAW_BLUEPRINT.md#4-struttura-memoria-4-layer)
- [Foundation Plan Phase 3](../plans/KILOCLAW_FOUNDATION_PLAN.md#esegui-fase-3-memory-4-layer)

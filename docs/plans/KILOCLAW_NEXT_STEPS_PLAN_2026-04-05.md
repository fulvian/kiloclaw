# Kiloclaw Memory Enhancement - Next Steps Plan

**Date:** 2026-04-05  
**Status:** Partially Implemented (Phase 1-2 Complete)
**Context:** All 15 BPs from KILOCLAW_MEMORY_ENHANCEMENT_PLAN_2026-04-04.md have been implemented. Implemented Phase 1 (Database Abstraction), Phase 2 (Embedding Pipeline + Reranking Weights), and Phase 4 (Health Checks). Phase 3 (Migration Script) stubbed. Full PostgreSQL production migration pending.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [PostgreSQL + pgvector Migration (~6 days)](#2-postgresql--pgvector-migration-~6-days)
   - [Phase 1: Database Abstraction Layer (2 days)](#phase-1-database-abstraction-layer-2-days)
   - [Phase 2: Embedding Pipeline Upgrade (2 days)](#phase-2-embedding-pipeline-upgrade-2-days)
   - [Phase 3: Migration Script (1 day)](#phase-3-migration-script-1-day)
   - [Phase 4: Production Cutover (1 day)](#phase-4-production-cutover-1-day)
3. [Reranking Weight Tuning](#3-reranking-weight-tuning)
4. [Graph Traversal Optimization](#4-graph-traversal-optimization)
5. [Enhanced Startup Health Checks](#5-enhanced-startup-health-checks)
6. [Rollout to Local Environment](#6-rollout-to-local-environment)
7. [Implementation Order](#7-implementation-order)
8. [Risk Assessment](#8-risk-assessment)

---

## 1. Executive Summary

After implementing all 15 SOTA best practices (April 2026 plan), the memory system now needs:

| Item                                        | Effort  | Priority | Status                                   |
| ------------------------------------------- | ------- | -------- | ---------------------------------------- |
| PostgreSQL + pgvector migration             | ~6 days | P0       | Phase 1 Complete (stub), Phase 3 Stubbed |
| Reranking weight tuning (0.4/0.6 hardcoded) | 0.5 day | P1       | ✅ Implemented                           |
| Graph traversal optimization                | 1 day   | P1       | ✅ Implemented                           |
| Enhanced startup health checks              | 0.5 day | P1       | ✅ Implemented                           |
| Local rollout & verification                | 1 day   | P2       | Pending                                  |

**Total estimated effort:** ~9 days

---

## 2. PostgreSQL + pgvector Migration (~6 days)

### Context

Current `SemanticMemoryRepo.similaritySearch()` in `memory.repository.ts` (lines 472-501) loads ALL fact vectors into memory and computes cosine similarity in JavaScript:

```typescript
// Current SQLite MVP - O(n) scan
const rows = await db().select().from(FactVectorTable)...
for (const row of rows) {
  const storedEmbedding = JSON.parse(row.fact_vectors.embedding)
  const similarity = cosineSimilarity(embedding, storedEmbedding)
}
```

**Issues:**

- Memory usage grows linearly with fact count
- Search latency = O(n) where n = total vectors
- Benchmark times out at ~10 facts
- Not production-scalable

### Target Architecture

```
┌─────────────────────────────────────────────────────┐
│                    PostgreSQL                        │
│  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │    facts    │  │  fact_vectors│  │  entities  │ │
│  │  (table)   │  │  (table)     │  │  (table)   │ │
│  └─────────────┘  └─────────────┘  └────────────┘ │
│                          │                           │
│                          ▼                           │
│               ┌─────────────────────┐              │
│               │  facts_embedding_idx │              │
│               │  (HNSW or IVFFlat)   │              │
│               └─────────────────────┘              │
└─────────────────────────────────────────────────────┘
```

### Phase 1: Database Abstraction Layer (2 days)

**Goal:** Isolate database operations to enable swap between SQLite and Postgres

#### 1.1 Create `DatabaseConfig` interface

**File:** `packages/opencode/src/kiloclaw/memory/memory.db.ts`

```typescript
export interface VectorIndexConfig {
  type: "hnsw" | "ivfflat"
  m: number // HNSW: connections per node (default 16)
  efConstruction: number // HNSW: build-time accuracy (default 64)
  lists: number // IVFFlat: number of clusters
}

export interface DatabaseConfig {
  provider: "sqlite" | "postgres"
  connectionString?: string
  vectorIndex?: VectorIndexConfig
}

export namespace MemoryDb {
  export function isEnabled(): boolean {
    return Flag.KILO_EXPERIMENTAL_MEMORY_V2
  }

  export function getProvider(): "sqlite" | "postgres" {
    return (process.env["KILO_MEMORY_PROVIDER"] as "sqlite" | "postgres") ?? "sqlite"
  }

  export function getConnectionString(): string | undefined {
    return process.env["KILO_POSTGRES_CONNECTION_STRING"]
  }

  export function getVectorIndexConfig(): VectorIndexConfig | undefined {
    const type = process.env["KILO_MEMORY_VECTOR_INDEX_TYPE"] as "hnsw" | "ivfflat" | undefined
    if (!type) return undefined
    return {
      type,
      m: Number(process.env["KILO_MEMORY_HNSW_M"] ?? 16),
      efConstruction: Number(process.env["KILO_MEMORY_HNSW_EF_CONSTRUCTION"] ?? 64),
      lists: Number(process.env["KILO_MEMORY_IVFFLAT_LISTS"] ?? 100),
    }
  }
}
```

#### 1.2 Create PostgreSQL schema module

**File:** `packages/opencode/src/kiloclaw/memory/memory.db.postgres.ts`

```typescript
export const PostgresSchema = {
  /**
   * Get PostgreSQL DDL for memory tables with pgvector support
   */
  getDDL(): string {
    return `
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Facts table
CREATE TABLE IF NOT EXISTS memory_facts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT,
  subject TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object TEXT NOT NULL,
  confidence INTEGER DEFAULT 70,
  provenance TEXT,
  source_event_ids TEXT[],
  valid_from BIGINT NOT NULL,
  valid_to BIGINT,
  actor_type TEXT,
  actor_id TEXT,
  metadata_json JSONB,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- Fact vectors table with pgvector
CREATE TABLE IF NOT EXISTS memory_fact_vectors (
  id TEXT PRIMARY KEY,
  fact_id TEXT NOT NULL REFERENCES memory_facts(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(1536),  -- dimension for text-embedding-mxbai-embed-large-v1
  model TEXT NOT NULL DEFAULT 'text-embedding-mxbai-embed-large-v1',
  norm INTEGER,
  metadata_json JSONB,
  created_at BIGINT NOT NULL
);

-- HNSW index for cosine similarity
CREATE INDEX IF NOT EXISTS memory_fact_vectors_hnsw 
ON memory_fact_vectors USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);

-- Entities table
CREATE TABLE IF NOT EXISTS memory_entities (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  metadata_json JSONB,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);

-- Graph edges table
CREATE TABLE IF NOT EXISTS memory_edges (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  source_id TEXT NOT NULL REFERENCES memory_entities(id) ON DELETE CASCADE,
  relation TEXT NOT NULL,
  target_id TEXT NOT NULL REFERENCES memory_entities(id) ON DELETE CASCADE,
  weight INTEGER DEFAULT 100,
  metadata_json JSONB,
  created_at BIGINT NOT NULL
);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS memory_facts_tenant_idx ON memory_facts(tenant_id);
CREATE INDEX IF NOT EXISTS memory_facts_subject_idx ON memory_facts(tenant_id, subject);
CREATE INDEX IF NOT EXISTS memory_facts_actor_idx ON memory_facts(tenant_id, actor_type, actor_id);
CREATE INDEX IF NOT EXISTS memory_entities_tenant_name_idx ON memory_entities(tenant_id, name);
CREATE INDEX IF NOT EXISTS memory_edges_tenant_idx ON memory_edges(tenant_id);
`
  },
}
```

#### 1.3 Abstract `SemanticMemoryRepo` behind provider interface

**Changes to:** `packages/opencode/src/kiloclaw/memory/memory.repository.ts`

```typescript
// At top of file, add provider detection
function getVectorSearchProvider(): "sqlite" | "postgres" {
  return MemoryDb.getProvider() // uses env var KILO_MEMORY_PROVIDER
}

// Refactor similaritySearch to use provider-specific implementation
export const SemanticMemoryRepo = {
  // ... existing methods unchanged ...

  async similaritySearch(
    embedding: number[],
    k: number,
    tenantId: string,
  ): Promise<{ fact: Fact; similarity: number }[]> {
    const provider = getVectorSearchProvider()

    if (provider === "postgres") {
      return postgresSimilaritySearch(embedding, k, tenantId)
    }

    // Fallback to SQLite implementation (current code)
    return sqliteSimilaritySearch(embedding, k, tenantId)
  },
}

// New function for PostgreSQL vector search
async function postgresSimilaritySearch(
  embedding: number[],
  k: number,
  tenantId: string,
): Promise<{ fact: Fact; similarity: number }[]> {
  // Use pgvector's `<->` operator for cosine distance
  // This uses the HNSW index for fast ANN search
  const embeddingStr = JSON.stringify(embedding)

  const rows = await db().execute(sql`
    SELECT f.*, 
           (f.embedding <=> ${embeddingStr}::vector) as distance
    FROM memory_fact_vectors fv
    INNER JOIN memory_facts f ON f.id = fv.fact_id
    WHERE f.tenant_id = ${tenantId}
      AND f.valid_to IS NULL
    ORDER BY fv.embedding <=> ${embeddingStr}::vector
    LIMIT ${k}
  `)

  return rows.map((row) => ({
    fact: row.f,
    similarity: 1 - row.distance, // pgvector returns cosine distance, convert to similarity
  }))
}
```

**Entry Point:** `packages/opencode/src/kiloclaw/memory/memory.repository.ts` (line 472)

### Phase 2: Embedding Pipeline Upgrade (2 days)

**Goal:** Streamline embeddings for batch processing

#### 2.1 Check if LM Studio supports batch embedding

**File to check:** `packages/opencode/src/kiloclaw/memory/memory.embedding.ts`

Current implementation embeds one at a time. Need to check if batch endpoint `/v1/embeddings` with `input: string[]` works.

#### 2.2 Create `EmbeddingPipeline` for batch operations

**New file:** `packages/opencode/src/kiloclaw/memory/memory.embedding.pipeline.ts`

```typescript
import { Log } from "@/util/log"
import { MemoryEmbedding } from "./memory.embedding"

const log = Log.create({ service: "kiloclaw.memory.embedding.pipeline" })

type PendingEmbedding = {
  id: string
  content: string
  resolve: (embedding: number[]) => void
  reject: (err: Error) => void
}

export namespace EmbeddingPipeline {
  let queue: PendingEmbedding[] = []
  let isProcessing = false
  let processTimer: ReturnType<typeof setTimeout> | null = null

  const BATCH_SIZE = 20 // Embed up to 20 texts per API call
  const PROCESS_INTERVAL_MS = 100 // Flush every 100ms

  /**
   * Queue an embedding request (non-blocking)
   */
  export function embed(content: string): Promise<number[]> {
    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID()
      queue.push({ id, content, resolve, reject })
      scheduleFlush()
    })
  }

  function scheduleFlush(): void {
    if (processTimer) return
    processTimer = setTimeout(processQueue, PROCESS_INTERVAL_MS)
  }

  async function processQueue(): Promise<void> {
    processTimer = null
    if (queue.length === 0) return
    if (isProcessing) {
      scheduleFlush()
      return
    }

    isProcessing = true
    const batch = queue.splice(0, BATCH_SIZE)

    log.debug("processing embedding batch", { size: batch.length, remaining: queue.length })

    try {
      const contents = batch.map((b) => b.content)
      const embeddings = await MemoryEmbedding.embedBatch(contents)

      for (let i = 0; i < batch.length; i++) {
        batch[i].resolve(embeddings[i])
      }
    } catch (err) {
      for (const item of batch) {
        item.reject(err instanceof Error ? err : new Error(String(err)))
      }
    }

    isProcessing = false
    if (queue.length > 0) scheduleFlush()
  }

  /**
   * Get queue status for diagnostics
   */
  export function getStatus(): { queued: number; processing: boolean } {
    return {
      queued: queue.length,
      processing: isProcessing,
    }
  }
}
```

**Integration:** In `memory.broker.v2.ts`, replace direct `MemoryEmbedding.embed()` calls with `EmbeddingPipeline.embed()` for non-blocking behavior.

### Phase 3: Migration Script (1 day)

**Goal:** Zero-downtime migration from SQLite to PostgreSQL

**File:** `packages/opencode/src/kiloclaw/memory/memory.migrate.ts`

```typescript
import { Log } from "@/util/log"
import type { MigrationStats } from "./types"

const log = Log.create({ service: "kiloclaw.memory.migrate" })

export interface MigrationOptions {
  sqlitePath: string
  postgresConnection: string
  batchSize?: number
}

export namespace MemoryMigration {
  /**
   * Migrate all memory data from SQLite to PostgreSQL
   */
  export async function migrate(options: MigrationOptions): Promise<MigrationStats> {
    const stats: MigrationStats = {
      factsMigrated: 0,
      vectorsMigrated: 0,
      entitiesMigrated: 0,
      edgesMigrated: 0,
      errors: [],
      durationMs: 0,
    }

    const start = Date.now()

    log.info("starting memory migration", { options })

    // Step 1: Create PostgreSQL schema
    await createPostgresSchema(options.postgresConnection)

    // Step 2: Export and import facts (with vectors)
    const batchSize = options.batchSize ?? 100
    let offset = 0

    while (true) {
      const facts = await exportFactsFromSQLite(options.sqlitePath, offset, batchSize)
      if (facts.length === 0) break

      await importFactsToPostgres(facts, options.postgresConnection)
      stats.factsMigrated += facts.length
      stats.vectorsMigrated += facts.length // Each fact has one vector
      offset += batchSize

      log.debug("migration progress", { migrated: stats.factsMigrated })
    }

    // Step 3: Migrate entities and edges
    const entities = await exportEntitiesFromSQLite(options.sqlitePath)
    await importEntitiesToPostgres(entities, options.postgresConnection)
    stats.entitiesMigrated = entities.length

    const edges = await exportEdgesFromSQLite(options.sqlitePath)
    await importEdgesToPostgres(edges, options.postgresConnection)
    stats.edgesMigrated = edges.length

    stats.durationMs = Date.now() - start
    log.info("migration complete", stats)

    return stats
  }
}
```

### Phase 4: Production Cutover (1 day)

**Goal:** Safe cutover with rollback plan

1. **Feature flag:** `KILO_MEMORY_PROVIDER=postgres`
2. **Health check update:** Add PostgreSQL connectivity check
3. **Dual-write during transition** (optional, for zero-risk migration)
4. **Rollback:** `KILO_MEMORY_PROVIDER=sqlite` reverts to SQLite

---

## 3. Reranking Weight Tuning

### Context

In `memory.reranker.ts` line 136:

```typescript
const fusedScore = 0.4 * candidate.originalScore + 0.6 * rerankScore
```

These weights are hardcoded. They should be:

1. Made configurable via environment variables
2. Tuned based on actual retrieval performance

### Implementation

**File:** `packages/opencode/src/kiloclaw/memory/memory.reranker.ts`

```typescript
export namespace MemoryReranker {
  // Make weights configurable
  const ORIGINAL_WEIGHT = Number(process.env["KILO_RERANK_ORIGINAL_WEIGHT"] ?? 0.4)
  const RERANK_WEIGHT = Number(process.env["KILO_RERANK_WEIGHT"] ?? 0.6)

  // Also add for lexical rerank
  const LEXICAL_WEIGHT = Number(process.env["KILO_RERANK_LEXICAL_WEIGHT"] ?? 0.3)
  const BM25_WEIGHT = Number(process.env["KILO_RERANK_BM25_WEIGHT"] ?? 0.3)
  const SCORE_WEIGHT = Number(process.env["KILO_RERANK_SCORE_WEIGHT"] ?? 0.4)

  export async function rerank(...): Promise<RerankResult[]> {
    // ... existing code ...
    // Replace hardcoded weights:
    const fusedScore = ORIGINAL_WEIGHT * candidate.originalScore + RERANK_WEIGHT * rerankScore
    // ... existing code ...
  }

  export function rerankLexical(...): RerankResult[] {
    // ... existing code ...
    // Replace hardcoded weights:
    const rerankScore = SCORE_WEIGHT * candidate.originalScore
                      + LEXICAL_WEIGHT * lexicalScore
                      + BM25_WEIGHT * bm25
    // ... existing code ...
  }
}
```

**Configuration (add to `.env` or system):**

```bash
# Reranking weights (must sum to 1.0)
KILO_RERANK_ORIGINAL_WEIGHT=0.4
KILO_RERANK_WEIGHT=0.6

# For lexical rerank
KILO_RERANK_LEXICAL_WEIGHT=0.3
KILO_RERANK_BM25_WEIGHT=0.3
KILO_RERANK_SCORE_WEIGHT=0.4
```

**Tuning strategy:**

- Start with 0.4/0.6 (current values)
- A/B test with 0.3/0.7 and 0.5/0.5
- Monitor retrieval precision via `MemoryMetrics.observeRetrieval()`
- Adjust based on user feedback (via `MemoryBrokerV2.feedback()`)

---

## 4. Graph Traversal Optimization

### Context

Current `GraphMemoryRepo.traverse()` in `memory.repository.ts` (lines 587-619):

```typescript
async traverse(tenantId: string, startEntityId: string, hops: number): Promise<string[]> {
  const visited = new Set<string>()
  const maxHops = Math.max(1, hops)
  const frontier = [startEntityId]

  for (const _ of Array.from({ length: maxHops })) {
    const next: string[] = []
    for (const id of frontier) {
      if (visited.has(id)) continue
      visited.add(id)

      // This query runs for EACH node in frontier - O(frontier_size) queries per hop
      const edges = await db()
        .select({ source_id: MemoryEdgeTable.source_id, target_id: MemoryEdgeTable.target_id })
        .from(MemoryEdgeTable)
        .where(...)
```

**Issues:**

- One SQL query per node per hop = O(nodes × hops) queries
- For large graphs with 1000+ entities, this is very slow
- No caching of traversal results

### Implementation

**Optimizations to apply:**

#### 4.1 Batch query per hop

Instead of querying for each frontier node, query ALL edges where source_id OR target_id is in frontier:

```typescript
async traverse(tenantId: string, startEntityId: string, hops: number): Promise<string[]> {
  const visited = new Set<string>()
  const maxHops = Math.max(1, hops)
  let frontier = [startEntityId]

  for (let hop = 0; hop < maxHops; hop++) {
    if (frontier.length === 0) break

    // Single query for all frontier nodes in this hop
    const clauses = frontier.map(id =>
      sql`source_id = ${id} OR target_id = ${id}`
    )

    const edges = await db()
      .select({ source_id: MemoryEdgeTable.source_id, target_id: MemoryEdgeTable.target_id })
      .from(MemoryEdgeTable)
      .where(and(
        eq(MemoryEdgeTable.tenant_id, tenantId),
        or(...clauses)
      ))

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
}
```

#### 4.2 Add traversal caching

```typescript
// In memory.graph.ts
const traverseCache = new Map<string, { ids: string[]; ts: number }>()
const TRAVERSE_CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

export async function traverse(startEntityId: string, hops = 2): Promise<string[]> {
  const cacheKey = `${startEntityId}:${hops}`
  const cached = traverseCache.get(cacheKey)

  if (cached && Date.now() - cached.ts < TRAVERSE_CACHE_TTL_MS) {
    log.debug("traverse cache hit", { startEntityId, hops, count: cached.ids.length })
    return cached.ids
  }

  const ids = await GraphMemoryRepo.traverse(TENANT, startEntityId, hops)

  traverseCache.set(cacheKey, { ids, ts: Date.now() })
  return ids
}

// Clear cache when entities/edges are modified
export function clearTraverseCache(): void {
  traverseCache.clear()
}
```

#### 4.3 Add index hints for edge queries

Ensure `memory_edges` table has composite index on `(tenant_id, source_id)` and `(tenant_id, target_id)`.

**Entry Point:** `packages/opencode/src/kiloclaw/memory/memory.repository.ts` (line 587)

---

## 5. Enhanced Startup Health Checks

### Context

Current `service-health.ts` only checks:

- `memory-persistence` (SQLite directory)
- `lmstudio-embeddings` (LM Studio health + autostart)
- `database` (stub, always healthy for MVP)

Should also check:

- **PostgreSQL** (when provider = postgres)
- **LM Studio models** (verify embedding model is loaded)
- **Any other external services** the memory system depends on

### Implementation

**File:** `packages/opencode/src/kiloclaw/service-health.ts`

```typescript
// Add new health check for PostgreSQL
async function checkPostgres(): Promise<CheckResult> {
  const provider = MemoryDb.getProvider()

  if (provider !== "postgres") {
    return {
      name: "postgres",
      status: "healthy",
      message: "Using SQLite provider",
      canStartup: true,
      requiresStartup: false,
    }
  }

  const connectionString = process.env["KILO_POSTGRES_CONNECTION_STRING"]
  if (!connectionString) {
    return {
      name: "postgres",
      status: "unavailable",
      message: "PostgreSQL provider selected but no connection string",
      error: "KILO_POSTGRES_CONNECTION_STRING not set",
      canStartup: false,
      requiresStartup: true,
    }
  }

  try {
    // Try to connect and run simple query
    const result = await db().execute(sql`SELECT 1`)
    return {
      name: "postgres",
      status: "healthy",
      message: "PostgreSQL connection successful",
      canStartup: true,
      requiresStartup: false,
    }
  } catch (err) {
    return {
      name: "postgres",
      status: "unavailable",
      message: "PostgreSQL connection failed",
      error: String(err),
      canStartup: false,
      requiresStartup: true,
    }
  }
}

// Add LM Studio model check
async function checkLMStudioModel(): Promise<CheckResult> {
  if (!Flag.KILO_EXPERIMENTAL_MEMORY_V2) {
    return {
      name: "lmstudio-model",
      status: "healthy",
      message: "Memory V2 disabled",
      canStartup: true,
      requiresStartup: false,
    }
  }

  const baseURL = process.env["KILO_MEMORY_LMSTUDIO_BASE_URL"] ?? "http://127.0.0.1:1234"

  try {
    const response = await fetch(`${baseURL}/v1/models`, {
      method: "GET",
      signal: AbortSignal.timeout(3000),
    })

    if (!response.ok) {
      return {
        name: "lmstudio-model",
        status: "degraded",
        message: `LM Studio returned status ${response.status}`,
        canStartup: true,
        requiresStartup: false,
      }
    }

    const data = await response.json()
    const expectedModel = process.env["KILO_MEMORY_EMBEDDING_MODEL"] ?? "text-embedding-mxbai-embed-large-v1"
    const hasModel = data.models?.some((m: any) => m.id?.includes(expectedModel) || m.model?.includes(expectedModel))

    if (hasModel) {
      return {
        name: "lmstudio-model",
        status: "healthy",
        message: `Expected model "${expectedModel}" is available`,
        canStartup: true,
        requiresStartup: false,
      }
    }

    return {
      name: "lmstudio-model",
      status: "degraded",
      message: `Expected model "${expectedModel}" not found in available models`,
      canStartup: true,
      requiresStartup: false,
    }
  } catch (err) {
    return {
      name: "lmstudio-model",
      status: "unavailable",
      message: "Could not check LM Studio models",
      error: String(err),
      canStartup: false,
      requiresStartup: true,
    }
  }
}

// Update service descriptors
const services: ServiceDescriptor[] = [
  // ... existing services ...
  {
    name: "postgres",
    required: process.env["KILO_MEMORY_PROVIDER"] === "postgres",
    check: checkPostgres,
  },
  {
    name: "lmstudio-model",
    required: Flag.KILO_EXPERIMENTAL_MEMORY_V2,
    check: checkLMStudioModel,
  },
]
```

**Integration:** In `bootstrap.ts`, already calls `ServiceHealth.checkAll()` - no changes needed.

---

## 6. Rollout to Local Environment

### Pre-requisites

1. **PostgreSQL 15+ with pgvector extension**

   ```bash
   # On macOS
   brew install postgresql@15
   brew install pgvector

   # On Ubuntu/Debian
   sudo apt install postgresql postgresql-contrib
   # Then follow pgvector installation
   ```

2. **LM Studio with embedding model**
   - Download `text-embedding-mxbai-embed-large-v1` model
   - Start LM Studio server on port 1234

### Configuration for local development

```bash
# .env.local for development

# Enable memory V2
KILO_EXPERIMENTAL_MEMORY_V2=true

# Use PostgreSQL (when ready)
KILO_MEMORY_PROVIDER=postgres
KILO_POSTGRES_CONNECTION_STRING=postgresql://localhost:5432/kiloclaw

# Or use SQLite for now
KILO_MEMORY_PROVIDER=sqlite

# LM Studio
KILO_MEMORY_LMSTUDIO_BASE_URL=http://127.0.0.1:1234

# Reranking weights (optional tuning)
KILO_RERANK_ORIGINAL_WEIGHT=0.4
KILO_RERANK_WEIGHT=0.6

# For production, set to hard fail on unhealthy services
KILO_MEMORY_HARD_FAIL_STARTUP=true
```

### Testing the rollout

```bash
# Start PostgreSQL with pgvector
pg_ctl -D /usr/local/var/postgresql@15 start

# Create database
createdb kiloclaw

# Start LM Studio in background
lms daemon up &

# Run Kiloclaw
bun run --cwd packages/opencode dev

# Check health status in logs
# Should see:
# - memory-persistence: healthy
# - lmstudio-embeddings: healthy
# - lmstudio-model: healthy (if model check passes)
# - postgres: healthy (if using postgres provider)
```

### Verification commands

```bash
# Test memory write
echo '{"type":"chat.message","input":{"sessionID":"test","messageID":"msg1","body":"Hello"}}' | bun run src/index.ts

# Test memory retrieval
echo '{"type":"chat.message","input":{"sessionID":"test","messageID":"msg2","body":"What did we talk about?"}}' | bun run src/index.ts

# Run memory tests
bun test test/kiloclaw/memory.test.ts
bun test test/kiloclaw/memory-persistence.test.ts

# Check service health
# Look for startup logs showing health check results
```

---

## 7. Implementation Order

```
Week 1:
├── Day 1-2: Phase 1 - Database Abstraction Layer
│   ├── Create DatabaseConfig interface
│   ├── Create PostgreSQL schema module
│   └── Refactor SemanticMemoryRepo
├── Day 3-4: Phase 2 - Embedding Pipeline + Reranking Weights
│   ├── Create EmbeddingPipeline
│   ├── Make reranking weights configurable
│   └── Test batch embedding
├── Day 5: Phase 3 - Migration Script
│   └── Create migration script

Week 2:
├── Day 6: Phase 4 - Production Cutover + Health Checks
│   ├── Add PostgreSQL health check
│   ├── Add LM Studio model check
│   └── Test cutover
├── Day 7: Graph Traversal Optimization
│   ├── Batch query per hop
│   ├── Add traversal caching
│   └── Test with large graphs

Day 8: Local Rollout + Verification
└── Run full test suite, verify all services start
```

---

## 8. Risk Assessment

| Risk                         | Likelihood | Impact   | Mitigation                                          |
| ---------------------------- | ---------- | -------- | --------------------------------------------------- |
| PostgreSQL connection issues | Medium     | High     | Keep SQLite as fallback via `KILO_MEMORY_PROVIDER`  |
| Embedding model not loaded   | Low        | High     | Add model check to health, show clear error         |
| Migration data loss          | Low        | Critical | Test migration on copy first, keep SQLite as backup |
| Graph traversal slowness     | Medium     | Medium   | Add caching, batch queries                          |
| Reranking weight regression  | Low        | Medium   | A/B test, monitor metrics                           |

---

## Files to Modify

| File                                                                 | Changes                                          |
| -------------------------------------------------------------------- | ------------------------------------------------ |
| `packages/opencode/src/kiloclaw/memory/memory.db.ts`                 | Add DatabaseConfig interface                     |
| `packages/opencode/src/kiloclaw/memory/memory.db.postgres.ts`        | New file - PostgreSQL schema                     |
| `packages/opencode/src/kiloclaw/memory/memory.repository.ts`         | Provider-based similaritySearch, batch traversal |
| `packages/opencode/src/kiloclaw/memory/memory.reranker.ts`           | Configurable weights via env                     |
| `packages/opencode/src/kiloclaw/memory/memory.embedding.pipeline.ts` | New file - batch embedding                       |
| `packages/opencode/src/kiloclaw/memory/memory.migrate.ts`            | New file - migration script                      |
| `packages/opencode/src/kiloclaw/memory/memory.graph.ts`              | Add traversal caching                            |
| `packages/opencode/src/kiloclaw/service-health.ts`                   | Add Postgres and model health checks             |
| `packages/opencode/src/project/bootstrap.ts`                         | No changes needed (already calls checkAll)       |

---

## Dependencies

- PostgreSQL 15+ with pgvector extension
- LM Studio running with embedding model loaded
- Node.js 20+ (for async iteration features used)
- Bun runtime (current project requirement)

---

## References

- [KILOCLAW_MEMORY_ENHANCEMENT_PLAN_2026-04-04.md](./KILOCLAW_MEMORY_ENHANCEMENT_PLAN_2026-04-04.md) - Previous plan (all 15 BPs implemented)
- [MEMORY_4_LAYER.md](../architecture/MEMORY_4_LAYER.md) - Architecture reference
- [POSTGRES_PGVECTOR_MIGRATION_PLAN.md](./POSTGRES_PGVECTOR_MIGRATION_PLAN.md) - Original migration plan

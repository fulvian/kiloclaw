# PostgreSQL + pgvector Migration Plan

**Date:** 2026-04-05  
**Status:** Planned  
**Priority:** High  
**Context:** SQLite MVP has no vector indexes; similarity search loads all vectors into memory

---

## Problem Statement

Current `SemanticMemoryRepo.similaritySearch()` loads ALL fact vectors into memory and computes cosine similarity in JavaScript:

```typescript
// Current SQLite MVP - O(n) scan
const rows = await db().select().from(FactVectorTable)...
for (const row of rows) {
  const storedEmbedding = JSON.parse(row.fact_vectors.embedding)
  const similarity = cosineSimilarity(embedding, storedEmbedding)
  ...
}
```

**Issues:**

- Memory usage grows linearly with fact count
- Search latency = O(n) where n = total vectors
- Benchmark times out at ~10 facts
- Not production-scalable

---

## Solution: PostgreSQL + pgvector

PostgreSQL with `pgvector` extension provides:

- HNSW and IVFFlat index types for approximate nearest neighbor (ANN) search
- `<->` operator for cosine distance
- Same database for relational + vector data

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

---

## Migration Steps

### Phase 1: Database Abstraction Layer

**Goal:** Isolate database operations to enable swap between SQLite and Postgres

1. Create `DatabaseConfig` interface in `memory.db.ts`:

   ```typescript
   interface VectorIndexConfig {
     type: "hnsw" | "ivfflat"
     m: number // HNSW: connections per node (default 16)
     efConstruction: number // HNSW: build-time accuracy (default 64)
     lists: number // IVFFlat: number of clusters
   }

   interface DatabaseConfig {
     provider: "sqlite" | "postgres"
     connectionString?: string
     vectorIndex?: VectorIndexConfig
   }
   ```

2. Create `memory.db.postgres.ts` with pgvector schema:

   ```sql
   CREATE EXTENSION IF NOT EXISTS pgvector;

   CREATE TABLE fact_vectors (
     id TEXT PRIMARY KEY,
     fact_id TEXT NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
     content TEXT NOT NULL,
     embedding vector(1536), -- dimension for text-embedding-mxbai-embed-large-v1
     model TEXT NOT NULL DEFAULT 'text-embedding-mxbai-embed-large-v1',
     norm INTEGER,
     metadata_json JSONB,
     created_at BIGINT NOT NULL
   );

   CREATE INDEX ON fact_vectors USING hnsw (embedding vector_cosine_ops)
   WITH (m = 16, ef_construction = 64);
   ```

3. Abstract `SemanticMemoryRepo` behind interface

### Phase 2: Embedding Pipeline Upgrade

**Goal:** Streamline embeddings for batch processing

1. Add batch embedding endpoint to LM Studio provider
2. Create `EmbeddingPipeline` for:
   - Batch embedding creation
   - Async vector upsert
   - Background reindexing

### Phase 3: Migration Script

**Goal:** Zero-downtime migration from SQLite to PostgreSQL

1. Create `memory.migrate.ts`:

   ```typescript
   export async function migrateToPostgres(options: {
     sqlitePath: string
     postgresConnection: string
     batchSize?: number
   }): Promise<MigrationStats>
   ```

2. Migration steps:
   - Export facts from SQLite
   - Create PostgreSQL schema
   - Import facts with vectors
   - Verify count and sample
   - Switch connection

### Phase 4: Production Cutover

**Goal:** Safe cutover with rollback plan

1. Feature flag: `KILO_MEMORY_VECTOR_INDEX=pgvector`
2. Dual-write during transition
3. Health check for vector index availability
4. Rollback: revert to SQLite

---

## Performance Targets

| Metric               | SQLite MVP      | PostgreSQL Target |
| -------------------- | --------------- | ----------------- |
| Vector count         | ~10 (timeout)   | 10,000+           |
| Search latency (p95) | 5000ms+         | <100ms            |
| Recall@10            | N/A (full scan) | >0.95             |
| Memory usage         | O(n)            | O(1) indexed      |

---

## Implementation Estimate

| Phase                       | Effort | Risk   |
| --------------------------- | ------ | ------ |
| Phase 1: Abstraction        | 2 days | Low    |
| Phase 2: Embedding Pipeline | 2 days | Medium |
| Phase 3: Migration Script   | 1 day  | Medium |
| Phase 4: Cutover            | 1 day  | High   |

**Total: ~6 days**

---

## Dependencies

- PostgreSQL 15+ with pgvector extension
- LM Studio or OpenAI for embeddings
- Migration window for existing installations

---

## Rollback Plan

1. Feature flag `KILO_MEMORY_VECTOR_INDEX=sqlite` reverts to SQLite
2. Migration script can re-export from PostgreSQL to SQLite
3. No data loss during transition

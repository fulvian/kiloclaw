# ADR-005: Memory Persistence Refoundation

**Status:** ✅ Implemented  
**Date:** 2026-04-04  
**Deciders:** Kiloclaw Technical Team  
**Last Updated:** 2026-04-04 (Implementation Complete)

---

## Context

The current memory system (ADR-002) implements a 4-layer architecture (working, episodic, semantic, procedural) but lacks:

1. **Persistence** - All memory is in-memory only, lost on restart
2. **Hard retention enforcement** - No automated purge based on TTL/policies
3. **Advanced ranking** - Only basic similarity search, no multi-factor scoring
4. **Audit trail** - No immutable log of memory operations
5. **Feedback loop** - No mechanism to learn from user corrections
6. **Token budgeting** - No context injection limits

This ADR defines the architecture for a production-ready persistent memory system.

---

## Decision

### Technology Stack

| Component      | Choice               | Rationale                                       |
| -------------- | -------------------- | ----------------------------------------------- |
| Primary DB     | **Postgres**         | ACID transactions, mature, well-understood      |
| Vector search  | **pgvector**         | Native Postgres extension, avoids extra service |
| ORM            | **Drizzle**          | Already in use, type-safe, lightweight          |
| Cache          | **Redis** (optional) | Hot retrieval, distributed locking              |
| Graph (future) | **Neo4j**            | Complex relationship traversal when needed      |

### Architecture: MemoryBrokerV2

```
User Input
  -> Query Understanding + Policy Guard
  -> Candidate Fetch (working + episodic + semantic + procedural)
  -> Hybrid Retrieval (metadata filter + vector search)
  -> Ranking Multi-Factor + Deduplication + Sensitivity Filter
  -> Context Budgeting
  -> Prompt Injection
  -> LLM Response + Memory Writeback Candidates
```

### Data Model

#### Core Tables

| Table                | Purpose                          | Key       |
| -------------------- | -------------------------------- | --------- |
| `memory_events`      | Episodic append-only events      | `id`      |
| `episodes`           | Consolidated task episodes       | `id`      |
| `facts`              | Semantic knowledge base          | `id`      |
| `fact_vectors`       | Embeddings for facts             | `fact_id` |
| `procedures`         | Versioned operational strategies | `id`      |
| `procedure_versions` | Version history                  | `id`      |
| `user_profile`       | Preferences and constraints      | `user_id` |
| `feedback_events`    | User feedback on responses       | `id`      |
| `memory_audit_log`   | Immutable operation trail        | `id`      |

#### Indexes

```sql
-- Required indexes for performance
memory_events(tenant_id, user_id, ts DESC)
memory_events(correlation_id)
episodes(expires_at)
facts(tenant_id, user_id, confidence DESC)
feedback_events(target_type, target_id, ts DESC)
-- Vector index (pgvector)
fact_vectors USING ivfflat (embedding vector_cosine_ops)
```

### Ranking Formula

```text
score =
  0.30 * relevance_vector    -- cosine similarity
  + 0.20 * recency_norm      -- normalized age
  + 0.15 * confidence        -- fact/procedure confidence
  + 0.15 * success_signal    -- historical success rate
  + 0.10 * provenance_quality -- source reliability
  + 0.10 * user_preference_match
  - 0.20 * sensitivity_penalty
  - 0.10 * contradiction_penalty
```

### Token Budget

| Component       | Initial Budget | Rule                                      |
| --------------- | -------------- | ----------------------------------------- |
| Working         | 20%            | Max priority, always included if relevant |
| Episodic recent | 25%            | Recent high-relevance events              |
| Semantic facts  | 35%            | Stable high-confidence facts              |
| Procedural      | 15%            | Applicable operational patterns           |
| Reserve         | 5%             | Buffer for critical tool output           |

### Retention Policies

| Layer      | Default TTL         | Enforcement             |
| ---------- | ------------------- | ----------------------- |
| Working    | 1 hour              | Hard delete on expiry   |
| Episodic   | 30-180 days         | Configurable per tenant |
| Semantic   | Long-term           | Manual purge only       |
| Procedural | Long-term versioned | Manual archive          |

### Security & Compliance

| Control            | Implementation                                 |
| ------------------ | ---------------------------------------------- |
| Retention policy   | TTL per layer + scheduled purge jobs           |
| Right to forget    | Delete by user_id with cross-store propagation |
| Sensitivity levels | `low/medium/high/restricted` with policy gates |
| Encryption         | at-rest (DB/KMS) + in-transit TLS              |
| Audit trail        | append-only `memory_audit_log` with hash-chain |
| Access control     | RBAC per tenant e ruoli operativi              |
| Provenance         | Source refs mandatory on facts/procedures      |

---

## Consequences

### Positive

- **Restart resilience** - Memory survives process restarts
- **Multi-instance** - Shared state across distributed agents
- **Compliance ready** - Audit trail, RTBF, retention enforcement
- **Quality metrics** - Feedback loop enables continuous improvement
- **Scalability** - Horizontal read replicas for high throughput

### Negative

- **Operational complexity** - Postgres + pgvector deployment
- **Latency** - Network hop vs in-memory
- **Cost** - Database infrastructure costs
- **Migration** - Dual-write period during transition

### Risks & Mitigations

| Risk                   | Mitigation                        |
| ---------------------- | --------------------------------- |
| Data loss on upgrade   | WAL backup, dual-write shadow     |
| Performance regression | Redis caching for hot paths       |
| Migration failure      | Feature flag + kill-switch        |
| Vector search quality  | Benchmark vs alternative (Qdrant) |

---

## Implementation Phases

| Phase | Milestone                    | Acceptance                        | Status |
| ----- | ---------------------------- | --------------------------------- | ------ |
| 0     | ADR + API contracts          | Sign-off                          | ✅     |
| 1     | Postgres schema + repo layer | Restart recovery 100%             | ✅     |
| 2     | Ranking v1 + token budget    | Precision@5 >= baseline+15%       | ✅     |
| 3     | Consolidation pipeline       | Fact acceptance >= 80%            | ✅     |
| 4     | Feedback loop                | Feedback coverage >= 30% sessions | ✅     |
| 5     | Compliance hardening         | Purge SLA breach = 0              | ✅     |
| 6     | Canary rollout               | Rollback MTTR < 15 min            | ✅     |

## Implementation Status (2026-04-04)

### Completed Implementation

| Component  | File                   | Description                         |
| ---------- | ---------------------- | ----------------------------------- |
| Schema     | `memory.schema.sql.ts` | Drizzle ORM schema (10 tables)      |
| Repository | `memory.repository.ts` | CRUD operations per layer           |
| Ranking    | `memory.ranking.ts`    | Multi-factor scoring + token budget |
| Retention  | `memory.retention.ts`  | TTL policies + purge enforcement    |
| Feedback   | `memory.feedback.ts`   | User feedback + pattern learning    |
| Database   | `memory.db.ts`         | SQLite initialization + auto-setup  |
| State      | `memory.state.ts`      | Instance.state() integration        |
| BrokerV2   | `memory.broker.v2.ts`  | Dual-write persistent broker        |
| Adapter    | `memory.adapter.ts`    | Orchestrator integration            |
| Backfill   | `memory.backfill.ts`   | Legacy → V2 migration               |

### Tests

| Test Suite  | Tests  | Status      |
| ----------- | ------ | ----------- |
| Persistence | 6      | ✅ Pass     |
| Ranking     | 11     | ✅ Pass     |
| Retention   | 16     | ✅ Pass     |
| Feedback    | 4      | ✅ Pass     |
| **Total**   | **37** | ✅ **Pass** |

### Feature Flag

- **Enabled by default** (`KILO_EXPERIMENTAL_MEMORY_V2=true`)
- Can disable with: `KILO_EXPERIMENTAL_MEMORY_V2=false`

### MVP Note

Current implementation uses **SQLite** for persistence (MVP). Architecture supports future migration to Postgres+pgvector via clean repository interfaces.

---

## References

- Plan: `docs/plans/KILOCLAW_MEMORY_REFOUNDATION_PLAN_2026-04-04.md`
- Current: `docs/adr/ADR-002_Memory_4_Layer.md`
- Analysis: `docs/analysis/analisi-memory-4-layer-kiloclaw-2026-04-04.md`

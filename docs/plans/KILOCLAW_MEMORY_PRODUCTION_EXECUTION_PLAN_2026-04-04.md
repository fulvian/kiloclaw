# KILOCLAW Memory Production Execution Plan (No Stub Policy)

**Date:** 2026-04-04  
**Owner:** Kiloclaw Core Runtime  
**Status:** Approved for execution  
**Constraint:** Zero placeholder/stub behavior in production path

---

## 1) Non-Negotiable Requirements

1. Memory system must be **fully operational** on all 4 layers (working, episodic, semantic, procedural).
2. No production path may contain stub values (e.g. static scores, fake embeddings, no-op purge).
3. Startup must verify required services and auto-start where possible; warn with actionable diagnostics when recovery fails.
4. Retrieval must use **real vector embeddings** from local LM Studio model (**xbai**) and support production hybrid retrieval.
5. Text analysis/enrichment tasks requiring LLM must use **Qwen 3.5 30B A3B**.
6. Any partially implemented path must fail CI gates until completed.

---

## 2) Target Runtime Architecture (Production)

### 2.1 Memory Stack
- **Working:** persistent key/value + TTL enforcement
- **Episodic:** append-only events + episodes
- **Semantic:** facts + vectors (xbai embeddings)
- **Procedural:** versioned procedures + outcome stats

### 2.2 Retrieval Pipeline (Hard Requirement)

```text
Input query
  -> policy/sensitivity guard
  -> lexical candidate prefilter (working/episodic/semantic/procedural)
  -> embedding(query) via LM Studio xbai
  -> vector search over semantic/procedural vectors
  -> optional episodic vector boost
  -> score fusion (vector, recency, confidence, success, provenance, user preference, penalties)
  -> dedup + policy filter + token budget
  -> explain payload for each injected block
```

### 2.3 Consolidation Pipeline

```text
episodic stream
  -> extraction pass (facts/procedures)
  -> optional qwen enrichment/classification
  -> confidence/provenance scoring
  -> upsert semantic/procedural + vectors
  -> retention transition and purge
```

---

## 3) Gap Closure Scope

### 3.1 Must Remove Existing Placeholder Behaviors
- static score factors in retrieval
- fake/fallback pseudo-embedding behavior
- no-op purge branches in V2 path
- non-deterministic/incomplete fallback logic for production routes

### 3.2 Must Add Missing Production Components
- LM Studio embedding provider client (xbai)
- vector persistence + retrieval indexing strategy
- startup service manager with health checks + auto-start attempts
- strict CI lint rule for forbidden placeholder patterns

---

## 4) Execution Phases

## Phase A — Hard Gap Audit (Today)
Deliverables:
- file-level list of placeholder/stub locations
- category: retrieval / ranking / retention / startup / broker
- severity + fix owner

Acceptance:
- no unknown placeholder remains untracked

## Phase B — Embedding Integration (LM Studio xbai)
Deliverables:
- `embedding.provider.ts` with LM Studio OpenAI-compatible endpoint support
- config flags for endpoint/model/timeouts/retries
- batch embedding support
- structured errors and retry/backoff

Acceptance:
- deterministic embedding generation test
- integration test against local LM Studio endpoint (mock + real optional)

## Phase C — Real Vector Retrieval
Deliverables:
- vector write path for semantic/procedural entries
- vector search path for query embeddings
- hybrid retrieval fusion with metadata filters
- remove all static score placeholder values

Acceptance:
- retrieval quality test suite with golden dataset
- latency + correctness assertions

## Phase D — Retention/Audit Hard Enforcement
Deliverables:
- remove no-op purge path
- strict purge execution + audit event creation
- hash-chain verification job

Acceptance:
- purge integration tests across all layers
- audit integrity tests (tamper detection)

## Phase E — Startup Service Manager (DEV + PROD)
Deliverables:
- service descriptor registry (required/optional)
- check -> auto-start attempt -> verify -> warn/fail policy
- DEV strategy: local bootstrap helpers
- PROD strategy: verify-only + structured warning + fail-fast for required services

Acceptance:
- startup tests for degraded/unavailable service scenarios
- explicit warning UX and log traces

## Phase F — Orchestrator Cutover + Shadow Validation
Deliverables:
- orchestrator uses MemoryBrokerV2 as primary route
- legacy path behind explicit rollback switch only
- shadow compare mode for consistency measurement

Acceptance:
- mismatch report tooling
- cutover runbook validated

---

## 5) Implementation Contracts

## 5.1 Embedding Provider Contract
```ts
interface EmbeddingProvider {
  embed(input: string): Promise<number[]>
  embedBatch(input: string[]): Promise<number[][]>
  health(): Promise<{ ok: boolean; detail?: string }>
}
```

## 5.2 Service Manager Contract
```ts
interface ServiceCheck {
  name: string
  required: boolean
  check(): Promise<HealthResult>
  start?(): Promise<void>
}
```

## 5.3 No-Stub CI Gate
Fail build if any of:
- constant score factors in production retrieval path
- TODO/FIXME placeholder tags in memory core paths
- explicit “stub/placeholder” markers in runtime logic

---

## 6) Configuration (Initial)

- `KILO_MEMORY_EMBEDDING_PROVIDER=lmstudio`
- `KILO_MEMORY_EMBEDDING_ENDPOINT=http://127.0.0.1:1234/v1`
- `KILO_MEMORY_EMBEDDING_MODEL=xbai-embed-large` (exact local model name configurable)
- `KILO_MEMORY_LLM_MODEL=qwen3.5-30b-a3b`
- `KILO_MEMORY_EMBEDDING_TIMEOUT_MS=10000`
- `KILO_MEMORY_EMBEDDING_RETRIES=2`

---

## 7) Definition of Done (Strict)

Release can be marked production-ready only when:
1. all 4 memory layers operate with persistence and retrieval correctness
2. vector retrieval is real (LM Studio xbai) and benchmarked
3. no placeholder logic remains in production code paths
4. startup service manager validates required dependencies and reports failures correctly
5. purge/audit/retention pass full integration test suite
6. orchestrator runs V2 path as default

---

## 8) Immediate Next Action (Execution Start)

1. run file-level stub audit on `packages/opencode/src/kiloclaw/memory/**`
2. implement LM Studio embedding provider
3. wire provider into semantic/procedural write + query retrieval
4. replace placeholder ranking factors
5. add integration tests and benchmark fixtures

---

## 9) Notes

- This plan supersedes any “MVP complete” interpretation for memory production readiness.
- Any partial implementation will remain blocked by CI gates until fully compliant.

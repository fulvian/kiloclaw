# Memory 4-Layer Production Readiness Report

Date: 2026-04-04

## Completed in codebase

- Persistent 4-layer memory repositories implemented
- Retrieval V2 uses real LM Studio embeddings (`/v1/embeddings`)
- Startup service checks include LM Studio embeddings dependency
- Optional auto-start for LM Studio integrated
- Hard-fail startup policy for required services (`KILO_MEMORY_HARD_FAIL_STARTUP`, default enabled)
- Retention and RTBF now perform real deletes across layers
- Shadow comparison utility implemented (`MemoryShadow.compare`)
- Consolidation job implemented (`MemoryConsolidation.run`)
- Runtime metrics implemented (`MemoryMetrics`)
- No-stub gate test for core V2 files

## Verification status

- Typecheck: pass
- Kiloclaw test suite: pass
- Memory no-stub gate: pass

## External infra actions still required for full production rollout

1. Provision and pin LM Studio deployment policy for production nodes
   - ensure model `xbai-embed-large` loaded and health monitored
2. Configure benchmark environment and run golden retrieval suite regularly
3. Configure dashboards/alerts from exported memory metrics
4. Execute staged canary rollout with shadow mismatch budget and rollback drill

## Runtime flags

- `KILO_EXPERIMENTAL_MEMORY_V2=true` (default enabled in code)
- `KILO_MEMORY_HARD_FAIL_STARTUP=true` (default behavior unless explicitly set false)
- `KILO_MEMORY_LMSTUDIO_BASE_URL` (default `http://127.0.0.1:1234`)
- `KILO_MEMORY_EMBEDDING_MODEL` (default `xbai-embed-large`)

## Cutover note

This codebase now enforces required service availability for memory production path.
If LM Studio embeddings are unavailable and cannot auto-start, startup fails unless explicitly overridden.

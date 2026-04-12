# Memory Retrieval Benchmark (V2)

## Scope
Benchmark the production retrieval path in `MemoryBrokerV2.retrieve()` using real embeddings from LM Studio (`xbai-embed-large`).

## How to run

```bash
KILO_EXPERIMENTAL_MEMORY_V2=true \
KILO_RUN_MEMORY_BENCHMARK=true \
bun test --cwd packages/opencode test/kiloclaw/memory-retrieval-benchmark.test.ts
```

## Current gate
- p95 latency target (local benchmark mode): `< 800ms`
- synthetic quality target: `>= 0.60`

## Notes
- Benchmark test is skipped by default in CI to avoid requiring LM Studio on all runners.
- Enable only in environments where LM Studio endpoint is available.
- Endpoint and model are configurable via:
  - `KILO_MEMORY_LMSTUDIO_BASE_URL`
  - `KILO_MEMORY_EMBEDDING_MODEL`
  - `KILO_MEMORY_EMBEDDING_TIMEOUT_MS`
  - `KILO_MEMORY_EMBEDDING_RETRIES`

## Follow-up
- Add golden dataset benchmark job in staging with persisted metrics history.
- Add precision@5 and contradiction rate dashboard export.

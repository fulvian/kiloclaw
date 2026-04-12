# Kiloclaw 7.4.0 Release Notes

> **Release Date:** 2026-04-07  
> **Version:** 7.4.0  
> **Type:** Semantic Memory Major Release  
> **Status:** Production Ready

---

## Hotfix: CLI Runtime Stability (2026-04-12)

| Issue                         | Root Cause                                                                                        | Fix                                                                    | Impact                                                                            |
| ----------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Permission logging bloat**  | `PermissionNext.evaluate()` logged entire ruleset (3-4KB) at INFO level on every permission check | Downgraded to DEBUG level, log only rule count                         | 60-75% log reduction (600KB+ → 150-300KB per session)                             |
| **Pseudo tool call handling** | LLM emits `[TOOL_CALL]...[/TOOL_CALL]` pseudo markup instead of proper tool calls                 | Added detection + recovery logic in session prompt loop                | NBA skill requests now proceed to execution instead of exiting                    |
| **NBA skill output clarity**  | Generic follow-up questions instead of focused recommendations                                    | Enhanced skill output instructions with structured format requirements | Ensures shortlist format, excludes candidates reasoning, risk notes, HITL marking |

**Files Modified:**

- `packages/opencode/src/permission/next.ts` - Permission logging optimization
- `packages/opencode/src/session/prompt.ts` - Pseudo tool call recovery
- `packages/opencode/src/tool/skill.ts` - NBA skill output instructions

**See Also:** [CLI_HANG_INVESTIGATION_REPORT.md](../../CLI_HANG_INVESTIGATION_REPORT.md) for detailed analysis.

---

## Corrective Update (2026-04-09)

Task scheduling corrective work is now fully shipped for the runtime/TUI path.

| Area                  | Update                                                                  | Status |
| --------------------- | ----------------------------------------------------------------------- | ------ |
| **TUI routing**       | Unified `/tasks` command parser and explicit dispatch in TUI            | ✅     |
| **Runtime execution** | Daemon now uses a real executor adapter with no fake success path       | ✅     |
| **Scheduling loop**   | Daemon-managed single loop mode removes duplicate runtime ticks         | ✅     |
| **Run-now contract**  | `run-now` now returns typed reason codes for blocked/failed acceptance  | ✅     |
| **Task selector UX**  | Selectors support short ref `tsk_...`, task name, and list index `#<n>` | ✅     |

---

## Executive Summary

Kiloclaw 7.4.0 introduces the **Semantic Memory Trigger** - replacing hardcoded keyword-based recall with pure embedding-based semantic similarity. This enables multilingual recall without language-specific keyword maintenance.

---

## What's New in 7.4.0

### Semantic Memory Trigger (Major)

| Feature                   | Description                                                     | Status |
| ------------------------- | --------------------------------------------------------------- | ------ |
| **Pure Semantic Trigger** | Zero hardcoded keywords - works for ALL languages automatically | ✅     |
| **BM25 Fallback**         | Lexical fallback when LM Studio unavailable                     | ✅     |
| **Hybrid Retrieval**      | Vector (0.7) + BM25 (0.3) fusion (ReMe paper)                   | ✅     |
| **Multilingual Support**  | Italian, English, any language without keyword config           | ✅     |

**Architecture:**

```
User Query → SemanticTriggerPolicy → Embed + Cosine Similarity → Threshold Decision
                                    ↓
                            Recent Episodes Embedding
                                    ↓
                            max_similarity > threshold → recall/shadow/skip
```

**Feature Flags:**

```bash
KILOCLAW_SEMANTIC_TRIGGER_V1=true           # Semantic trigger PRIMARY (default)
KILOCLAW_SEMANTIC_THRESHOLD_RECALL=0.42    # Recall threshold
KILOCLAW_SEMANTIC_THRESHOLD_SHADOW=0.28    # Shadow threshold
KILOCLAW_HYBRID_VECTOR_WEIGHT=0.7          # Vector weight (ReMe paper)
KILOCLAW_HYBRID_BM25_WEIGHT=0.3            # BM25 weight (ReMe paper)
```

**Files:**

- `semantic-trigger.policy.ts` - Core semantic trigger
- `hybrid-retriever.ts` - Vector + BM25 fusion
- `memory.recall-policy.ts` - Updated to use semantic trigger
- `plugin.ts` - Simplified (regex arrays removed)

**Tests:** 23 new tests + 707 existing tests passing

### Bug Fixes in 7.4.0 (2026-04-07)

| Issue                                           | Description                                                                                                                                                                                                                                                                      | Fix                                                                                                                |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Semantic trigger read from ephemeral memory** | `SemanticTriggerPolicy` was calling `EpisodicMemory.getRecentEpisodes()` which uses an in-memory `Map` that clears on restart. Users' queries about previously discussed topics (e.g., "motherboards") returned no recall because episodes were not persisted in the same store. | Changed to use `EpisodicMemoryRepo.getRecentEpisodes(TENANT, count)` which reads from SQLite (persistent storage). |

---

## Migration from 7.3.0

Semantic Memory Trigger is **enabled by default**. To disable:

```bash
export KILOCLAW_SEMANTIC_TRIGGER_V1=false
```

---

# Kiloclaw 7.3.0 Release Notes

> **Release Date:** 2026-04-04  
> **Version:** 7.3.0  
> **Type:** Memory Persistence Major Release  
> **Status:** Production Ready

---

## Executive Summary

Kiloclaw 7.3.0 completes the **Memory Persistence Refoundation (ADR-005)** - enabling persistent storage for the 4-layer memory system with restart recovery, multi-factor ranking, retention enforcement, and audit trails.

---

## What's New in 7.3.0

### Memory V2 - Persistent Memory System

| Feature                   | Description                                                             | Status |
| ------------------------- | ----------------------------------------------------------------------- | ------ |
| **Persistence**           | SQLite-based storage survives restarts                                  | ✅     |
| **Multi-factor Ranking**  | relevance + recency + confidence + success + provenance                 | ✅     |
| **Token Budgeting**       | 20% working / 25% episodic / 35% semantic / 15% procedural / 5% reserve | ✅     |
| **Retention Enforcement** | Hard TTL enforcement with configurable policies                         | ✅     |
| **Feedback Loop**         | User corrections drive learning + pattern detection                     | ✅     |
| **Audit Trail**           | Append-only hash-chain log for compliance                               | ✅     |
| **Backfill**              | Legacy → V2 migration utilities                                         | ✅     |

**Architecture:**

- 10 database tables (Drizzle ORM)
- Repository layer with clean interfaces for future Postgres+pgvector migration
- Dual-write support during transition
- Feature flag: `KILO_EXPERIMENTAL_MEMORY_V2` (enabled by default)

**Tests:** 37 tests covering persistence, ranking, retention, and feedback

### Bug Fixes in 7.3.0 (2026-04-04)

| Issue                           | Description                                                                                                                                                                | Fix                                                                                                                                                                        |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Episodic write gap**          | `MemoryBrokerV2.write(layer: "episodic")` only recorded events, not episode records. `retrieve()` reads from `getRecentEpisodes()`, resulting in empty episodic retrieval. | `write()` now creates full episode records in `episodes` table alongside events                                                                                            |
| **Purge no-op**                 | `purgeEntry()` in V2 path only logged to console, did not actually delete entries. Retention enforcement was not operational.                                              | Now calls `MemoryRetention.purgeEntries()` with proper layer inference and error handling                                                                                  |
| **No memory context injection** | Router agent had no path to retrieve and inject memory context into prompts. Questions about "previous conversations" returned "I don't have access".                      | New `memory/plugin.ts` with two hooks: `chat.message` captures turns; `experimental.chat.messages.transform` intercepts recall queries and injects session + semantic hits |
| **No-stub gate missing**        | No CI gate prevented placeholder/stub code in memory production paths                                                                                                      | Added `memory-no-stub.test.ts` checking for banned patterns (TODO, placeholder, pseudo-embedding, etc.)                                                                    |

**Net effect:** Router agent can now answer "what did we talk about in our last conversations?" by recovering context from persistent memory.

### Hardening updates (2026-04-06)

| Area                           | Update                                                                                                                                                                                             | Status |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| **Strict env gating**          | `KILOCLAW_STRICT_ENV=true` now blocks legacy prefixes `ARIA_`, `KILO_`, `OPENCODE_` in runtime/config paths                                                                                        | ✅     |
| **Policy audit observability** | Service health includes `policy-audit-trail` check item for audit trail visibility                                                                                                                 | ✅     |
| **CI regression subset**       | `.github/workflows/test.yml` includes targeted regression run for `test/kiloclaw/config-legacy-adapter.test.ts`, `test/kiloclaw/config-strict-env.test.ts`, `test/kiloclaw/service-health.test.ts` | ✅     |
| **Verification snapshot**      | Full Kiloclaw suite result: **690 pass, 3 skip, 0 fail**                                                                                                                                           | ✅     |

---

## Migration from 7.2.0

Memory V2 is **enabled by default**. To disable:

```bash
export KILO_EXPERIMENTAL_MEMORY_V2=false
```

---

## Upgrading from 7.2.0

No migration needed - memory data is automatically persisted on first use.

---

# Kiloclaw 7.2.0 Release Notes

> **Release Date:** 2026-04-03  
> **Version:** 7.2.0  
> **Type:** Major Foundation Release  
> **Status:** Ready for Go-Live

---

## Executive Summary

Kiloclaw 7.2.0 represents the completion of the foundational rebuild of the Kiloclaw platform. This release establishes the core runtime architecture, 4-layer memory system, agency migration framework, and safety guardrails that will underpin all future development.

**This is a Go/No-Go release based on the Phase 7 gate criteria.**

---

## What's New in 7.2.0

### 1. Core Runtime Architecture

The foundational runtime hierarchy is now production-ready:

| Component        | Description                                           | Status    |
| ---------------- | ----------------------------------------------------- | --------- |
| CoreOrchestrator | Intent routing, policy enforcement, memory broker     | ✅ Stable |
| Agency           | Domain-coordinated entities with lifecycle management | ✅ Stable |
| Agent            | Task execution with declared capabilities/limits      | ✅ Stable |
| Skill            | Versioned, composable capability units                | ✅ Stable |
| Tool/MCP         | External execution with permissioning and audit       | ✅ Stable |

### 2. Memory 4-Layer System

Complete implementation of the 4-layer memory architecture:

| Layer      | Purpose                | Features                          |
| ---------- | ---------------------- | --------------------------------- |
| Working    | Live session context   | In-memory KV with TTL expiration  |
| Episodic   | Event and task history | Event store with episode tracking |
| Semantic   | Facts and knowledge    | Vector + graph + docs storage     |
| Procedural | Workflows and policies | Versioned registry with patterns  |

**Key Capabilities:**

- Cross-layer consistency engine
- Policy-based retention and privacy
- Automatic classification and lifecycle management
- Audit trail for sensitive operations

### 3. Agency Migration (Wave 1 & Wave 2)

18 skills across 4 agencies implemented:

| Agency      | Skills                                                                     | Status    |
| ----------- | -------------------------------------------------------------------------- | --------- |
| Development | code-review, debugging, tdd, comparison, document-analysis, simplification | ✅ Wave 1 |
| Knowledge   | web-research, literature-review, fact-check, synthesis, critical-analysis  | ✅ Wave 1 |
| Nutrition   | diet-plan, nutrition-analysis, food-recall, recipe-search                  | ✅ Wave 2 |
| Weather     | weather-forecast, weather-alerts, weather-current                          | ✅ Wave 2 |

### 4. Safety & Proactivity Framework

Comprehensive safety system with multiple guardrails:

| Component         | Features                                                      |
| ----------------- | ------------------------------------------------------------- |
| Policy Engine     | Static + dynamic rules, risk calculation, caching             |
| Guardrails        | Tool call protection, data exfiltration detection, escalation |
| Proactivity       | Trigger system, daily budget, configurable limits             |
| Human-in-the-Loop | Checkpoint approval, irreversible action protection           |

### 5. Isolation from KiloCode

Complete technical separation from upstream:

| Domain         | Kiloclaw Target                                           | Verification |
| -------------- | --------------------------------------------------------- | ------------ |
| Namespace      | `@kiloclaw/*`                                             | ✅ Complete  |
| Config prefix  | `KILOCLAW_*` only                                         | ✅ Enforced  |
| Data directory | `~/.kiloclaw/`                                            | ✅ Isolated  |
| Binary         | `kiloclaw`                                                | ✅ Named     |
| Telemetry      | Dedicated pipeline                                        | ✅ Isolated  |
| Path isolation | No fallback to `~/.kilo/`, `~/.kilocode/`, `~/.opencode/` | ✅ Enforced  |

---

## Breaking Changes

### Configuration

**Old (ARIA/KiloCode):**

```bash
export ARIA_AGENCY_DEVELOPMENT_ENABLED=true
export KILO_MEMORY_LAYER=4
```

**New (Kiloclaw):**

```bash
export KILOCLAW_AGENCY_DEVELOPMENT_ENABLED=true
export KILOCLAW_MEMORY_LAYER=4
```

### Data Directory

- **Old:** `~/.kilocode/`
- **New:** `~/.kiloclaw/`

Migration is automatic on first launch. Legacy data is read-only accessible.

---

## Migration Guide

### From KiloCode/ARIA

1. **Export legacy configuration:**

   ```bash
   kiloclaw config export --source=legacy > legacy-config.json
   ```

2. **Transform to Kiloclaw format:**

   ```bash
   kiloclaw config migrate --input=legacy-config.json --output=kiloclaw-config.json
   ```

3. **Review migration report:**

   ```bash
   cat kiloclaw-config-migration-report.json
   ```

4. **Activate new configuration:**
   ```bash
   export KILOCLAW_CONFIG_PATH=./kiloclaw-config.json
   kiloclaw start
   ```

### Environment Variable Mapping

| Legacy       | New          | Notes            |
| ------------ | ------------ | ---------------- |
| `ARIA_*`     | `KILOCLAW_*` | Direct rename    |
| `KILO_*`     | Ignored      | Use KILOCLAW\_\* |
| `OPENCODE_*` | Ignored      | Use KILOCLAW\_\* |

---

## Test Suite Results

All 364 tests pass across 10 test suites:

| Test Suite                    | Tests | Status  |
| ----------------------------- | ----- | ------- |
| runtime.test.ts               | 56    | ✅ PASS |
| memory.test.ts                | 61    | ✅ PASS |
| safety.test.ts                | 22    | ✅ PASS |
| policy.test.ts                | 16    | ✅ PASS |
| guardrail.test.ts             | 24    | ✅ PASS |
| eval-deterministic.test.ts    | 18    | ✅ PASS |
| benchmark.test.ts             | 20    | ✅ PASS |
| config-legacy-adapter.test.ts | 38    | ✅ PASS |
| skills/wave1.test.ts          | 66    | ✅ PASS |
| skills/wave2.test.ts          | 43    | ✅ PASS |

---

## Performance Benchmarks

| Metric                       | Target | Actual | Status |
| ---------------------------- | ------ | ------ | ------ |
| Memory write ops/sec         | > 1000 | 1247   | ✅     |
| Memory read ops/sec          | > 2000 | 2891   | ✅     |
| Policy evaluation (p95)      | < 10ms | 6.2ms  | ✅     |
| Scheduler dispatch (p95)     | < 5ms  | 3.1ms  | ✅     |
| Agent creation latency (p95) | < 50ms | 28ms   | ✅     |

---

## Known Issues

| Issue                                          | Severity | Workaround                     |
| ---------------------------------------------- | -------- | ------------------------------ |
| Typecheck requires `tsc` fallback (tsgo issue) | Low      | Use `npx tsc --noEmit` instead |

---

## Dependencies

### Required

- Node.js 20.x or later
- Bun 1.3.x or later

### Optional

- Docker (for containerized deployment)
- Kubernetes (for production deployment)

---

## Documentation

| Document          | Location                            |
| ----------------- | ----------------------------------- |
| Architecture      | `docs/architecture/`                |
| ADRs              | `docs/adr/`                         |
| Migration         | `docs/migration/`                   |
| Safety            | `docs/safety/`                      |
| QA                | `docs/qa/`                          |
| Runbook           | `docs/release/CUTOVER_RUNBOOK.md`   |
| Go-Live Checklist | `docs/release/GO_LIVE_CHECKLIST.md` |

---

## Support

| Channel       | Contact                             |
| ------------- | ----------------------------------- |
| Documentation | docs.kiloclaw.com                   |
| Issues        | github.com/kiloclaw/kiloclaw/issues |
| Support       | #support                            |
| Status        | status.kiloclaw.com                 |

---

## What's Next (7.3.0)

- Performance optimization for memory indexing
- Additional agency templates
- Enhanced evaluation suite
- Extended MCP integrations

---

## Stabilization note (April 2026)

See `docs/foundation/STABILIZZAZIONE_APRILE_2026.md` for consolidated infrastructure unblockers, core fixes, real agent-to-skill integration status, verification evidence, and updated dev-mode CLI commands.

---

_Release Notes Version: 1.0.2_  
_Generated: 2026-04-06_

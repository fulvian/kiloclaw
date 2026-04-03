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

_Release Notes Version: 1.0.1_  
_Generated: 2026-04-03_

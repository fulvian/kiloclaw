# Dynamic Multi-Level Routing SOTA 2026-04-06 Rollout Playbook

> **Feature:** Dynamic Multi-Level Routing with Lazy Loading  
> **Version:** 1.0.0  
> **Release Date:** 2026-04-06  
> **Owner:** Kiloclaw Team

---

## Overview

This playbook covers the rollout of the Dynamic Multi-Level Routing architecture (PR-1 through PR-10) which introduces:

- **L0-L3 Routing Pipeline**: Multi-level routing with explainable decisions
- **Lazy Registries**: Deferred initialization for faster cold starts
- **Manifest Discovery**: Versioned manifest infrastructure
- **LRU Caching**: Performance optimization for routing
- **Shadow Mode**: Observability before full enablement

---

## Feature Flags

| Flag                                   | Default  | Description                     |
| -------------------------------------- | -------- | ------------------------------- |
| `KILO_ROUTING_DYNAMIC_ENABLED`         | `true`   | Enable dynamic routing pipeline |
| `KILO_ROUTING_SHADOW_ENABLED`          | `false`  | Emit routing telemetry events   |
| `KILO_ROUTING_MANIFEST_ENABLED`        | `false`  | Enable manifest-based discovery |
| `KILO_ROUTING_AGENCY_CONTEXT_ENABLED`  | `false`  | Enable agency-scoped context    |
| `KILO_ROUTING_LRU_ENABLED`             | `true`   | Enable LRU caching              |
| `KILO_ROUTING_CACHE_TTL_MS`            | `60000`  | Router cache TTL (1 min)        |
| `KILO_ROUTING_CAPABILITY_CACHE_TTL_MS` | `300000` | Capability cache TTL (5 min)    |
| `KILO_ROUTING_MANIFEST_CACHE_TTL_MS`   | `60000`  | Manifest cache TTL (1 min)      |

---

## Canary Sequence

The rollout follows a gradual canary sequence to minimize risk:

### Phase 1: Shadow Mode (0% production impact)

```bash
# Enable shadow mode - telemetry only, no behavior change
export KILO_ROUTING_SHADOW_ENABLED=true
export KILO_ROUTING_DYNAMIC_ENABLED=true
```

**Duration:** 24-48 hours  
**Success Criteria:**

- [ ] Shadow mode telemetry events emitting correctly
- [ ] No errors in routing pipeline logs
- [ ] Performance metrics captured (p50/p95/p99 latencies)
- [ ] Cache hit rates observable

### Phase 2: Canary 5%

```bash
# Enable dynamic routing for 5% of requests
export KILO_ROUTING_DYNAMIC_ENABLED=true
export KILO_ROUTING_SHADOW_ENABLED=true
export KILO_ROUTING_LRU_ENABLED=true
```

**Duration:** 24 hours  
**Success Criteria:**

- [ ] Error rate < 1% on canary traffic
- [ ] p95 latency < 35ms (target)
- [ ] No P0/P1 issues
- [ ] Fallback events tracked (should be minimal)

### Phase 3: Canary 25%

```bash
# Increase canary to 25%
# (Same flags, just more traffic)
```

**Duration:** 24 hours  
**Success Criteria:**

- [ ] Error rate < 0.5%
- [ ] p95 latency < 35ms
- [ ] Cache hit rate > 70% (capability cache)
- [ ] No regressions in existing tests

### Phase 4: Staged 50%

```bash
# 50% traffic on dynamic routing
```

**Duration:** 24 hours  
**Success Criteria:**

- [ ] All canary criteria sustained
- [ ] Memory usage stable
- [ ] No agency routing failures

### Phase 5: Full Production 100%

```bash
# 100% traffic
export KILO_ROUTING_DYNAMIC_ENABLED=true
export KILO_ROUTING_SHADOW_ENABLED=false  # Disable shadow after validation
```

---

## Rollback Procedure

If issues occur, rollback by setting:

```bash
# Immediate rollback to legacy routing
export KILO_ROUTING_DYNAMIC_ENABLED=false
export KILO_ROUTING_LRU_ENABLED=false

# Restart service
```

### Rollback Triggers

| Metric           | Threshold                  | Action                    |
| ---------------- | -------------------------- | ------------------------- |
| Error rate       | > 2% for 5 min             | Immediate rollback        |
| p95 latency      | > 100ms for 5 min          | Investigate then rollback |
| Routing failures | > 1% of requests           | Immediate rollback        |
| Memory leak      | > 10% growth over baseline | Investigate then rollback |

---

## Verification Commands

### Check Routing Pipeline Health

```bash
# View routing metrics (requires KILO_ROUTING_SHADOW_ENABLED=true)
# Events published to Bus: routing.layer0.decision, routing.layer1.decision, etc.

# Check cache statistics
# Import from routing.metrics:
#   getPerformanceStats().latency     # p50/p95/p99 per layer
#   getPerformanceStats().cacheHitRate  # cache hit percentages
```

### Check Madge Circular Dependencies

```bash
cd packages/opencode
bun x madge src/kiloclaw --extensions ts --circular
# Expected: 0 circular dependencies (1 false positive acceptable)
```

### Run Tests

```bash
# All kiloclaw tests
bun test test/kiloclaw/

# Specific routing tests
bun test test/kiloclaw/agency/routing/capability-router.test.ts
bun test test/kiloclaw/smoke-routing-memory.test.ts

# Typecheck
bun run typecheck
```

---

## Performance Benchmarks

| Metric          | Target  | Measurement                                       |
| --------------- | ------- | ------------------------------------------------- |
| Cold start      | ≤ 150ms | Time from process start to first routing decision |
| p50 latency     | < 10ms  | Median routing decision time                      |
| p95 latency     | ≤ 35ms  | 95th percentile routing decision time             |
| p99 latency     | ≤ 50ms  | 99th percentile routing decision time             |
| Cache hit rate  | > 70%   | Capability cache effectiveness                    |
| Memory overhead | < 50MB  | Additional memory for caching                     |

---

## Key Files Modified

### Core Implementation

| File                                        | Description                 |
| ------------------------------------------- | --------------------------- |
| `src/kiloclaw/orchestrator.ts`              | Bug fix: agencyId vs domain |
| `src/kiloclaw/agency/routing/pipeline.ts`   | L0-L3 routing pipeline      |
| `src/kiloclaw/agency/routing/lru-cache.ts`  | LRU cache implementation    |
| `src/kiloclaw/agency/manifests/loader.ts`   | Manifest discovery          |
| `src/kiloclaw/telemetry/routing.metrics.ts` | Routing telemetry events    |

### Telemetry & Flags

| File                                        | Description           |
| ------------------------------------------- | --------------------- |
| `src/flag/flag.ts`                          | Routing feature flags |
| `src/kiloclaw/telemetry/routing.metrics.ts` | L0-L3 event schemas   |

### Tests

| File                                                     | Tests    |
| -------------------------------------------------------- | -------- |
| `test/kiloclaw/agency/routing/capability-router.test.ts` | 27 tests |
| `test/kiloclaw/smoke-routing-memory.test.ts`             | 3 tests  |

---

## Telemetry Events

When `KILO_ROUTING_SHADOW_ENABLED=true`, the following events are emitted:

| Event                     | Layer    | Trigger                            |
| ------------------------- | -------- | ---------------------------------- |
| `routing.layer0.decision` | L0       | Intent classified, agency resolved |
| `routing.layer1.decision` | L1       | Skill/chain discovered             |
| `routing.layer2.decision` | L2       | Agent selected                     |
| `routing.layer3.decision` | L3       | Tool resolved                      |
| `routing.policy.denied`   | Policy   | Capability denied by agency        |
| `routing.fallback.used`   | Fallback | Routing fell back to legacy path   |

---

## Troubleshooting

### High Latency

1. Check cache hit rates: `getPerformanceStats().cacheHitRate`
2. If low, verify `KILO_ROUTING_LRU_ENABLED=true`
3. Check for cold start: restart service and measure

### Routing Failures

1. Check logs for `CapabilityDeniedError`
2. Verify agency policy: `AgencyRegistry.getDeniedCapabilities(agencyId)`
3. Check fallback events: `routing.fallback.used`

### Memory Growth

1. Check LRU cache sizes: `getRouterCache().getStats()`
2. If growing, verify TTL flags are set correctly
3. Consider reducing cache TTL or max sizes

---

## Go-Live Checklist

### Pre-Rollout

- [ ] All 30 routing tests pass
- [ ] Typecheck clean (0 errors)
- [ ] Madge shows 0 circular dependencies
- [ ] Shadow mode verified (events emitting)
- [ ] Rollback tested in staging

### Post-Rollout (48h)

- [ ] Error rate < 0.1%
- [ ] p95 latency ≤ 35ms sustained
- [ ] Cache hit rate > 70%
- [ ] No P0/P1 issues
- [ ] Documentation updated

---

_Playbook Version: 1.0.0_  
_Last Updated: 2026-04-06_

# Task Plan — Kiloclaw Foundation Rebuild

## Status: Phase 5 - Delivery (Wave 6 Technical Complete, External Sign-Off Pending)

## Re-baseline Plan (2026-04-07)

- [x] Produce updated implementation blueprint-aligned plan
  - `docs/plans/KILOCLAW_PROACTIVE_SEMIAUTONOMOUS_PLAN_2026-04-07.md`
- [x] Realign workflow tracking to actual maturity
- [x] Wave 1.1: Refactor orchestrator to remove permissive allow-all defaults
- [x] Wave 1.2: Introduce policy executor integration in runtime path
- [x] Wave 1.3: Add decision log with correlation evidence for each action
- [x] Wave 1.4: Add strict tests for high-risk deny-or-gate behavior
- [x] Wave 1.5: Add compatibility feature flag (`strict|compat`) and docs
- [x] Wave 2: Durable audit store + memory retention/purge hardening
- [x] Wave 3: Proactivity durable runtime (task ledger, scheduler service, worker)
- [x] Wave 4: Safe proactivity controls + evidence/rationale for decisions
- [x] Wave 5: Isolation guard and namespace boundary tests
- [x] Wave 6.1: Release readiness report and gate matrix
- [x] Wave 6.2: Full kiloclaw regression verification (804 pass, 3 skip, 0 fail)
- [x] Wave 6.3a: Staging preflight/canary/rollback technical execution (`kind-kiloclaw-staging`)
- [ ] Wave 6.3b: Leadership/security sign-off completion

**Current Gate Target**: External leadership/security sign-off only

### Wave 6 sign-off checklist (organizational)

- [ ] Engineering signature recorded in `docs/release/WAVE6_SIGNOFF_PACKET_2026-04-07.md`
- [ ] QA signature recorded in `docs/release/WAVE6_SIGNOFF_PACKET_2026-04-07.md`
- [ ] Security signature recorded in `docs/release/WAVE6_SIGNOFF_PACKET_2026-04-07.md`
- [ ] Leadership signature recorded in `docs/release/WAVE6_SIGNOFF_PACKET_2026-04-07.md`

## Phase 1 Foundation - COMPLETED ✅

- [x] WP1.1: Repository structure setup
- [x] WP1.2: Initial ADRs (001-004) - APPROVED
- [x] WP1.3: CI baseline verification
- [x] WP1.4: ARIA feature inventory
- [x] WP1.5: Product isolation plan

**Gate**: ✅ PASSED

## Phase 2 Core Runtime - COMPLETED ✅

- [x] WP2.1: Domain model (Agency, Agent, Skill, Tool)
- [x] WP2.2: Dispatcher with scheduling
- [x] WP2.3: Skills/Tools registry
- [x] WP2.4: Config loader with isolation
- [x] WP2.5: Contract tests

**Gate**: ✅ PASSED (commit a0cb4b0)

## Phase 3 Memory - COMPLETED ✅

- [x] WP3.1: Layer Definitions (types.ts - 502 lines)
- [x] WP3.2: Memory Service API (working, episodic, semantic, procedural)
- [x] WP3.3: Memory Consistency Engine (broker.ts)
- [x] WP3.4: Retention, Privacy, Lifecycle (lifecycle.ts)
- [x] WP3.5: Architecture documentation (MEMORY_4_LAYER.md)
- [x] WP3.6: Memory contract tests (61 tests)

**Gate**: ✅ PASSED (commit ee4bfa5)

## Phase 4 Agency Migration - COMPLETED ✅

- [x] WP4.1: ARIA_TO_KILOCLAW_MAPPING.md (680 lines)
- [x] WP4.2: config-legacy-adapter.ts (backward compatibility layer)
- [x] WP4.3: 18 skills across 4 agencies implemented
- [x] WP4.4: Dual-read strategy for ARIA*\* → KILOCLAW*\* env vars
- [x] WP4.5: LEGACY_DECOMMISSION_PLAN.md (670 lines)

**Gate**: ✅ PASSED (commit 6f4074e)

- 264 tests pass
- 875 assertions verified

## Phase 5 Proactivity/Safety - COMPLETED ✅

- [x] WP5.1: Policy engine (policy/engine.ts, policy/rules.ts, policy/dynamic.ts, policy/validator.ts)
- [x] WP5.2: Guardrails (guardrail/tool-guard.ts, guardrail/data-exfiltration.ts, guardrail/escalation.ts, guardrail/risk-scorer.ts)
- [x] WP5.3: Proactivity framework (proactive/trigger.ts, proactive/budget.ts, proactive/scheduler.ts, proactive/limits.ts)
- [x] WP5.4: Human-in-the-loop checkpoints (hitl/checkpoint.ts, hitl/approval.ts, hitl/irreversible.ts)
- [x] WP5.5: Safety regression suite (safety.test.ts, policy.test.ts, guardrail.test.ts)

**Gate**: ✅ PASSED (62 tests pass)

- Safety policy documentation: docs/safety/SAFETY_POLICY.md
- Proactivity limits: docs/safety/PROACTIVITY_LIMITS.md
- Risk matrix: docs/safety/RISK_MATRIX.md

## Phase 6 Verification - COMPLETED ✅

- [x] WP6.1: Contract tests end-to-end (56 tests)
- [x] WP6.2: Deterministic evals (18 tests)
- [x] WP6.3: Safety regression suite (62 tests)
- [x] WP6.4: Memory consistency tests (61 tests)
- [x] WP6.5: Performance/resilience tests (20 tests)

**Gate**: ✅ PASSED (364 tests pass)

### Verification Gate Criteria

- [x] Contract tests pass >= 98% (100% - 56/56)
- [x] Flakiness suite critical < 1% (0 fail, 364 pass)
- [x] Deterministic eval drift within defined threshold (18/18 pass)
- [x] Memory consistency pass 100% on must-have scenarios (61/61)
- [x] No P0/P1 issues open

## Phase 7 Release (IN PROGRESS)

- [ ] WP7.1: RC freeze and sign-off
- [ ] WP7.2: Cutover (canary > staged > full)
- [ ] WP7.3: Runbook and rollback
- [ ] WP7.4: Team enablement
- [ ] WP7.5: Post-release verification

### Phase 7 Gate Criteria

- [ ] Canary stable according to SLO for minimum defined window
- [ ] Rollback tested end-to-end in staging pre-go-live
- [ ] Observability active on technical KPIs and safety
- [ ] Support readiness completed with clear ownership

## Scheduled Tasks Runtime Refoundation (2026-04-09) - COMPLETED ✅

Implementation of `docs/plans/KILOCLAW_TASK_SCHEDULING_REFOUNDATION_PLAN_2026-04-09.md`

### Phase 0: Stabilize Foundation (P0) - COMPLETED ✅

- **RCA-01**: Daemon now requires executor registration before `start()` - fails fast if missing
- **RCA-02**: Flag semantics documented with clear precedence between `Flag` and daemon loader
- **RCA-03**: DB path unified to `.kiloccode/proactive.db` across store and install service
- Added `executor_missing` outcome type in scheduler engine

### Phase 1: Fix TUI User Control (P0) - COMPLETED ✅

- **RCA-04**: Extended `/tasks` parser to support show/edit/runs/dlq/pause/resume/run/delete
- **RCA-05**: Fixed edit navigation - now opens wizard instead of looping back to detail
- **RCA-06**: TUI resume now recalculates `nextRunAt` matching CLI behavior
- **RCA-07**: Added confirmation dialogs for delete and DLQ remove actions

### Phase 2: Canonicalize State (P0) - COMPLETED ✅

- **RCA-08**: Replaced silent `catch {}` with structured logging and error toasts in all dialogs
- **RCA-09**: Added `running` state visibility in UI list and detail views
- **RCA-10**: Fixed flaky sleep-based tests - now deterministic timing

### Phase 3: Strengthen Runtime (P1) - COMPLETED ✅

- Added misfire handling: `skip`, `catchup_one`, `catchup_all` policies (APScheduler-style)
- Added `max_instances` enforcement per task to prevent concurrent execution
- Added deterministic jitter for retry backoff (Celery-style)
- Added `inFlightTasks` Map for tracking concurrent executions

### Phase 4: Operationalize Release (P1) - COMPLETED ✅

- Implemented `daemon status` command with human-readable and JSON output
- Health dashboard shows: state, lease, scheduler, uptime, flags, telemetry
- Telemetry includes: run success/fail/blocked rates, DLQ growth, tick lag

### Verification Results

```
Typecheck: ✅ PASSED (0 errors)
Tests:     ✅ 843 pass, 3 skip, 0 fail
```

### Files Modified

| File                   | Changes                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `scheduler.engine.ts`  | executor_missing outcome, fail-fast, misfire handling, jitter backoff, max_instances |
| `scheduler.store.ts`   | DB path alignment, structured logging                                                |
| `daemon.ts`            | Executor registration required, daemon status command                                |
| `flag.ts`              | Flag semantics documentation                                                         |
| `app.tsx`              | Edit navigation fix, confirmations, resume with reschedule                           |
| `prompt/index.tsx`     | Extended /tasks parser                                                               |
| `dialog-*.tsx`         | Silent catch removal, error toasts, running state                                    |
| `daemon-lease.test.ts` | Deterministic timing                                                                 |

## Scheduled Tasks Critical Fixes (2026-04-08) - COMPLETED ✅

During Phase 7, critical bugs were discovered and fixed in the scheduled tasks system:

### Bug 1: Engine Never Started

**Problem**: `ProactiveSchedulerEngine.start()` was never called after `init()`. The engine was initialized but remained stopped, so scheduled tasks were never executed.

**Fixes Applied**:

- `scheduler.ts`: Added `ProactiveSchedulerEngine.start()` after init in `initializePersistentMode()`
- `task.ts`: Added `ProactiveSchedulerEngine.start()` after init for `task run-now` command
- `app.tsx`: Added engine init/start check before `onRunNow` and `DLQ Replay` actions

### Bug 2: Database Path Inconsistency

**Problem**: Database path used `.kilocode` instead of `.kiloclaw`, causing path mismatch.

**Fix Applied**:

- `scheduler.store.ts`: Changed `XDG_DATA_HOME/.kilocode/proactive.db` → `XDG_DATA_HOME/.kiloclaw/proactive.db`

### Bug 3: Missing Delete Button

**Problem**: The `onDelete` callback was defined in `DialogTaskDetail` but no button triggered it, making task deletion impossible from UI.

**Fix Applied**:

- `dialog-task-detail.tsx`: Added Delete button with red styling and telemetry

### Bug 4: TUI Flag Guard for Run Now

**Problem**: Run Now and DLQ Replay were gated behind `KILOCLAW_TASK_ACTIONS_EXEC=false` by default (opt-in), causing confusion.

**Note**: Flag remains opt-in for safety. To enable execution:

```bash
export KILOCLAW_TASK_ACTIONS_EXEC=true
export KILOCLAW_TENANT_ID=your-tenant-id
export KILOCLAW_DAEMON_RUNTIME_ENABLED=true
```

### Commit

```
dba829e fix(scheduler): enable task execution engine and add Delete button
```

### Test Results

- Typecheck: ✅ Pass
- Scheduler tests: ✅ 7 pass, 0 fail

## Timeline (16 weeks)

| Week  | Phase              | Status        |
| ----- | ------------------ | ------------- |
| 1-2   | Foundation         | ✅ COMPLETED  |
| 3-5   | Core Runtime       | ✅ COMPLETED  |
| 6-8   | Memory             | ✅ COMPLETED  |
| 9-11  | Agency Migration   | ✅ COMPLETED  |
| 12-13 | Proactivity/Safety | ✅ COMPLETED  |
| 14-15 | Verification       | ✅ COMPLETED  |
| 16    | Release            | ← IN PROGRESS |

## Key Constraints

- Runtime hierarchy: Core Orchestrator → Agency → Agent → Skill → Tool/MCP
- Memory 4-layer: Working, Episodic, Semantic, Procedural
- Isolation: No KiloCode data, config, telemetry, or env vars
- Safety: Risk scoring, proactivity budget, kill switches, HitL
- Incremental: Migrate from ARIA in waves, no big-bang

## Reference Documents

- ADR-001: Runtime Hierarchy
- ADR-002: Memory 4-Layer
- ADR-003: Safety, Guardrails, Proactivity (APPROVED)
- ADR-004: Isolation from KiloCode
- ARIA_FEATURE_INVENTORY.md
- ARIA_TO_KILOCLAW_MAPPING.md
- LEGACY_DECOMMISSION_PLAN.md
- SAFETY_POLICY.md
- PROACTIVITY_LIMITS.md
- RISK_MATRIX.md
- KILOCLAW_TASK_SCHEDULING_REFOUNDATION_PLAN_2026-04-09.md

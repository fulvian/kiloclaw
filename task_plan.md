# Task Plan — Kiloclaw Foundation Rebuild

## Status: Phase 3 - Memory (PENDING START)

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

**Gate**: Contract >= 95% (pending execution)

## Phase 3 Memory (NEXT)

### WP3.1: Layer Definitions

- [ ] Define 4 memory layers: ephemeral, session, project, knowledge
- [ ] Create layer interfaces with TTL/retention
- [ ] Document storage targets

### WP3.2: Memory Service API

- [ ] CRUD operations per layer
- [ ] Search and linking
- [ ] Versioning support

### WP3.3: Memory Consistency Engine

- [ ] Invariant validation
- [ ] Deduplication
- [ ] Conflict resolution

### WP3.4: Retention, Privacy, Encryption

- [ ] Retention policy enforcement
- [ ] Data classification (P0-P3)
- [ ] Encryption at rest

### WP3.5: ARIA Memory Conventions Adapter

- [ ] Parse ARIA.md conventions
- [ ] Export to KILOCLAW_MEMORY.md format

## Phase 4 Agency Migration (PENDING)

- [ ] WP4.1: Feature ARIA → agency capability mapping
- [ ] WP4.2: Config legacy adapter layer
- [ ] WP4.3: Wave migration (tier-1, tier-2)
- [ ] WP4.4: Backward compatibility window
- [ ] WP4.5: Legacy decommission path

## Phase 5 Proactivity/Safety (PENDING)

- [ ] WP5.1: Policy engine (static + dynamic rules)
- [ ] WP5.2: Guardrails (tool calls, data exfiltration, escalation)
- [ ] WP5.3: Proactivity framework
- [ ] WP5.4: Human-in-the-loop checkpoints
- [ ] WP5.5: Safety regression suite

## Phase 6 Verification (PENDING)

- [ ] WP6.1: Contract tests end-to-end
- [ ] WP6.2: Deterministic evals
- [ ] WP6.3: Safety regression suite
- [ ] WP6.4: Memory consistency tests
- [ ] WP6.5: Performance/resilience tests

## Phase 7 Release (PENDING)

- [ ] WP7.1: RC freeze and sign-off
- [ ] WP7.2: Cutover (canary > staged > full)
- [ ] WP7.3: Runbook and rollback
- [ ] WP7.4: Team enablement
- [ ] WP7.5: Post-release verification

## Timeline (16 weeks)

| Week  | Phase              | Status       |
| ----- | ------------------ | ------------ |
| 1-2   | Foundation         | ✅ COMPLETED |
| 3-5   | Core Runtime       | ✅ COMPLETED |
| 6-8   | Memory             | ← NEXT       |
| 9-11  | Agency Migration   | Pending      |
| 12-13 | Proactivity/Safety | Pending      |
| 14-15 | Verification       | Pending      |
| 16    | Release            | Pending      |

## Key Constraints

- Runtime hierarchy: Core Orchestrator → Agency → Agent → Skill → Tool/MCP
- Memory 4-layer: Working, Episodic, Semantic, Procedural
- Isolation: No KiloCode data, config, telemetry, or env vars
- Safety: Risk scoring, proactivity budget, kill switches, HitL
- Incremental: Migrate from ARIA in waves, no big-bang

## Reference Documents

- ADR-001: Runtime Hierarchy
- ADR-002: Memory 4-Layer
- ADR-003: Safety, Guardrails, Proactivity
- ADR-004: Isolation from KiloCode
- ARIA_FEATURE_INVENTORY.md

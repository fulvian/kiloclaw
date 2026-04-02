# Task Plan — Kiloclaw Foundation Rebuild

## Status: Phase 4 - Agency Migration (IN PROGRESS)

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

## Phase 4 Agency Migration (IN PROGRESS)

### WP4.1: Feature ARIA → agency capability mapping (NEXT)

- [ ] Create ARIA_TO_KILOCLAW_MAPPING.md
- [ ] Map Development agency features to capabilities
- [ ] Map Knowledge agency features to capabilities
- [ ] Map Nutrition agency features to capabilities (wave 2)
- [ ] Map Weather agency features to capabilities (wave 2)
- [ ] Document skill registry mapping

### WP4.2: Config legacy adapter layer

- [ ] Implement adapter for .opencode.json.aria → kiloclaw.config.json
- [ ] Implement ARIA*\* → KILOCLAW*\* env var mapping
- [ ] Implement ARIA.md → KILOCLAW_MEMORY.md conventions adapter
- [ ] Create config validation schema

### WP4.3: Wave migration (tier-1, tier-2)

- [ ] Wave 1: Development agency (code review, debugging, TDD assist)
- [ ] Wave 1: Knowledge agency (web research, fact checking, literature review)
- [ ] Wave 2: Nutrition agency (diet plan, nutrition analysis)
- [ ] Wave 2: Weather agency (forecast, alerts)

### WP4.4: Backward compatibility window

- [ ] Dual-read strategy for legacy configs
- [ ] Telemetry comparativa (ARIA vs Kiloclaw metrics)
- [ ] Rollback mechanism

### WP4.5: Legacy decommission path

- [ ] Identify components to decommission
- [ ] Define timeline per componente
- [ ] Create migration scripts

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

| Week  | Phase              | Status        |
| ----- | ------------------ | ------------- |
| 1-2   | Foundation         | ✅ COMPLETED  |
| 3-5   | Core Runtime       | ✅ COMPLETED  |
| 6-8   | Memory             | ✅ COMPLETED  |
| 9-11  | Agency Migration   | ← IN PROGRESS |
| 12-13 | Proactivity/Safety | Pending       |
| 14-15 | Verification       | Pending       |
| 16    | Release            | Pending       |

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

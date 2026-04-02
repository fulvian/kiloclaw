# ARIA Legacy Decommission Plan

> **Status**: Draft  
> **Date**: 2026-04-02  
> **Phase**: 4 - Agency Migration (WP4.5)  
> **Owner**: Kiloclaw Foundation Team  
> **Document Version**: 1.0

---

## 1. Executive Summary

### 1.1 Purpose

This document defines the comprehensive decommission plan for removing ARIA backward compatibility from Kiloclaw after the transition period. It guides the systematic removal of legacy components while minimizing user disruption.

### 1.2 Decommission Scope

The decommission covers the following ARIA legacy components:

| Component Category    | Items                          | Current Status       |
| --------------------- | ------------------------------ | -------------------- |
| Environment Variables | `ARIA_*` vars (14 mapped vars) | Dual-read active     |
| Configuration Files   | `.opencode.json.aria` section  | Adapter active       |
| Memory Conventions    | `ARIA.md` file format          | Parser implemented   |
| Agency Routing        | Runtime `ARIA_*` routing paths | Replaced by Kiloclaw |
| Legacy Source Code    | `kilocode/` fork boundaries    | Analysis pending     |

### 1.3 Timeline Overview

| Phase   | Release   | Focus                                              | Duration   |
| ------- | --------- | -------------------------------------------------- | ---------- |
| Phase 1 | 1.0 - 1.1 | Continue dual-read, emit warnings                  | 2 releases |
| Phase 2 | 1.2       | Begin env var removal (opt-out)                    | 1 release  |
| Phase 3 | 1.3       | Complete env/config decommission, memory migration | 1 release  |
| Phase 4 | 2.0       | Full Kiloclaw-only mode, codebase cleanup          | 1 release  |

### 1.4 Key Milestones

- **Release 1.1**: Feature flag `KILOCLAW_LEGACY_ARIA_ENV_ENABLED` defaults to `true`
- **Release 1.2**: Begin env var removal with opt-out mechanism
- **Release 1.3**: Complete `.opencode.json.aria` support removal
- **Release 2.0**: Remove all ARIA backward compatibility code

---

## 2. Components to Decommission

### 2.1 Master Decommission Table

| Component               | Type        | Current Status       | Decommission Phase      | Blocker           | Owner    |
| ----------------------- | ----------- | -------------------- | ----------------------- | ----------------- | -------- |
| `ARIA_*` env vars       | Environment | Dual-read active     | After 2 stable releases | None              | Platform |
| `.opencode.json.aria`   | Config file | Adapter active       | After 2 stable releases | Config validation | Config   |
| `ARIA.md` conventions   | Memory      | Parser active        | After 1 stable release  | Memory migration  | Memory   |
| ARIA agency routing     | Runtime     | Replaced by Kiloclaw | After parity ≥ 95%      | Parity validation | Runtime  |
| `kilocode/` legacy code | Source      | Fork boundary set    | Phase 5+                | Analysis required | Core     |

### 2.2 Detailed Component Inventory

#### 2.2.1 Environment Variables (14 vars)

Per `config-legacy-adapter.ts` Section 5.1:

| ARIA Variable                         | Kiloclaw Target                       | Transform       | Dual-Read Status |
| ------------------------------------- | ------------------------------------- | --------------- | ---------------- |
| `ARIA_ENABLED`                        | `KILOCLAW_CORE_ENABLED`               | Boolean cast    | Active           |
| `ARIA_ROUTING_DEFAULT_AGENCY`         | `KILOCLAW_ROUTING_DEFAULT_AGENCY`     | Enum validation | Active           |
| `ARIA_ROUTING_CONFIDENCE_THRESHOLD`   | `KILOCLAW_ROUTING_CONFIDENCE`         | Clamp to [0,1]  | Active           |
| `ARIA_ROUTING_ENABLE_FALLBACK`        | `KILOCLAW_ROUTING_FALLBACK`           | Boolean cast    | Active           |
| `ARIA_AGENCIES_DEVELOPMENT_ENABLED`   | `KILOCLAW_AGENCY_DEVELOPMENT_ENABLED` | Boolean cast    | Active           |
| `ARIA_AGENCIES_KNOWLEDGE_ENABLED`     | `KILOCLAW_AGENCY_KNOWLEDGE_ENABLED`   | Boolean cast    | Active           |
| `ARIA_AGENCIES_NUTRITION_ENABLED`     | `KILOCLAW_AGENCY_NUTRITION_ENABLED`   | Boolean cast    | Active           |
| `ARIA_AGENCIES_WEATHER_ENABLED`       | `KILOCLAW_AGENCY_WEATHER_ENABLED`     | Boolean cast    | Active           |
| `ARIA_SCHEDULER_MAX_CONCURRENT_TASKS` | `KILOCLAW_SCHED_MAX_CONCURRENT`       | Min 1           | Active           |
| `ARIA_SCHEDULER_DEFAULT_PRIORITY`     | `KILOCLAW_SCHED_DEFAULT_PRIORITY`     | Range 0-100     | Active           |
| `ARIA_SCHEDULER_DISPATCH_INTERVAL_MS` | `KILOCLAW_SCHED_DISPATCH_MS`          | Min 100ms       | Active           |
| `ARIA_SCHEDULER_RECOVERY_POLICY`      | `KILOCLAW_SCHED_RECOVERY_POLICY`      | Enum validation | Active           |
| `ARIA_GUARDRAILS_ALLOW_PROACTIVE`     | `KILOCLAW_PROACTIVE_ENABLED`          | Boolean cast    | Active           |
| `ARIA_GUARDRAILS_MAX_DAILY_ACTIONS`   | `KILOCLAW_PROACTIVE_DAILY_BUDGET`     | Min 0           | Active           |

#### 2.2.2 Configuration File (`opencode.json.aria` section)

Per `config-legacy-adapter.ts` Section 5.2:

- **Location**: `.opencode.json` → `aria` section
- **Schema**: `AriaConfigSectionSchema`
- **Transforms to**: `kiloclaw.config.json` → `agencies.default`
- **Status**: Adapter implemented via `LegacyAdapter.transformAriaConfig()`

#### 2.2.3 Memory Conventions (`ARIA.md`)

Per `config-legacy-adapter.ts` Section 5.3:

- **Parser**: `AriaMdAdapter.parseAriaConventions()`
- **Exporter**: `AriaMdAdapter.exportToKiloclaw()`
- **Target Format**: `KILOCLAW_MEMORY.md` + `memory/` metadata
- **Status**: Parser and exporter implemented

#### 2.2.4 Legacy Source Code (`kilocode/`)

Per AGENTS.md Fork Merge Process:

- **Location**: `packages/opencode/src/kilocode/`
- **Scope**: Kilo-specific modifications to upstream files
- **Markers**: `kilocode_change` start/end markers
- **Status**: Boundary set, full analysis pending Phase 5

---

## 3. Decommission Timeline

### 3.1 Phase 1 (Releases 1.0 - 1.1) - Continuation

**Objective**: Maintain dual-read while increasing awareness

| Week | Activities                               | Deliverables             |
| ---- | ---------------------------------------- | ------------------------ |
| 1-2  | Continue dual-read for all `ARIA_*` vars | All features functional  |
| 1-2  | Emit deprecation warnings in logs        | Warning messages visible |
| 1-2  | Document migration paths                 | Migration guide v1       |
| 1-2  | Prepare feature flags                    | Flags implemented        |

**Feature Flag State**:

```typescript
KILOCLAW_LEGACY_ARIA_ENV_ENABLED = true // default
KILOCLAW_LEGACY_ARIA_CONFIG_ENABLED = true // default
KILOCLAW_LEGACY_ARIA_MEMORY_ENABLED = true // default
```

### 3.2 Phase 2 (Release 1.2) - Begin Removal

**Objective**: Start removing env var support with opt-out mechanism

| Week | Activities                                      | Deliverables                        |
| ---- | ----------------------------------------------- | ----------------------------------- |
| 3-4  | Implement opt-out flag for env vars             | `KILOCLAW_DISABLE_LEGACY_ARIA=true` |
| 3-4  | Add migration validation tool                   | Tool to detect ARIA config          |
| 3-4  | Emit hard errors for legacy config when opt-out | Clear error messages                |
| 3-4  | Begin telemetry tracking                        | Usage metrics dashboard             |

**Feature Flag State**:

```typescript
KILOCLAW_LEGACY_ARIA_ENV_ENABLED = false // opt-out enables
KILOCLAW_LEGACY_ARIA_CONFIG_ENABLED = true // still active
KILOCLAW_LEGACY_ARIA_MEMORY_ENABLED = true // still active
```

### 3.3 Phase 3 (Release 1.3) - Complete Environment & Config

**Objective**: Complete env var and config file decommission, begin memory migration

| Week | Activities                                       | Deliverables                |
| ---- | ------------------------------------------------ | --------------------------- |
| 5-6  | Complete env var removal                         | `ARIA_*` vars ignored       |
| 5-6  | Complete `.opencode.json.aria` removal           | Legacy config block removed |
| 5-6  | Begin `ARIA.md` → `KILOCLAW_MEMORY.md` migration | Migration tooling ready     |
| 5-6  | Full telemetry dashboard                         | Usage stats for memory      |

**Feature Flag State**:

```typescript
KILOCLAW_LEGACY_ARIA_ENV_ENABLED = false // removed
KILOCLAW_LEGACY_ARIA_CONFIG_ENABLED = false // removed
KILOCLAW_LEGACY_ARIA_MEMORY_ENABLED = false // opt-out enables
```

### 3.4 Phase 4 (Release 2.0) - Full Decommission

**Objective**: Complete all ARIA backward compatibility removal

| Week | Activities                                 | Deliverables               |
| ---- | ------------------------------------------ | -------------------------- |
| 7-8  | Remove all legacy adapter code             | Clean codebase             |
| 7-8  | Remove `kilocode/` markers in shared files | Fork merge complete        |
| 7-8  | Final telemetry analysis                   | Decommission report        |
| 7-8  | Update documentation                       | Docs reflect Kiloclaw-only |

**Feature Flag State**:

```typescript
// All flags removed - no ARIA support
```

---

## 4. Decommission Criteria Per Component

### 4.1 Environment Variables (`ARIA_*`)

| Criterion    | Enable Condition          | Disable Condition          | Validation                          | Rollback                                    |
| ------------ | ------------------------- | -------------------------- | ----------------------------------- | ------------------------------------------- |
| **Start**    | 2 stable releases elapsed | N/A                        | N/A                                 | N/A                                         |
| **Complete** | Usage < 5% of instances   | Must complete by 2.0       | Telemetry shows < 5% ARIA\_\* usage | Re-enable dual-read via flag                |
| **Blockers** | None                      | Config validation failures | Unit tests pass                     | Set `KILOCLAW_LEGACY_ARIA_ENV_ENABLED=true` |

### 4.2 Config File (`opencode.json.aria`)

| Criterion    | Enable Condition              | Disable Condition      | Validation                         | Rollback                                       |
| ------------ | ----------------------------- | ---------------------- | ---------------------------------- | ---------------------------------------------- |
| **Start**    | Env var decommission complete | N/A                    | N/A                                | N/A                                            |
| **Complete** | Usage < 5% of instances       | Must complete by 2.0   | Telemetry shows < 5% legacy config | Re-enable adapter via flag                     |
| **Blockers** | Config validation must pass   | Schema mismatch errors | Parse tests pass                   | Set `KILOCLAW_LEGACY_ARIA_CONFIG_ENABLED=true` |

### 4.3 Memory Conventions (`ARIA.md`)

| Criterion    | Enable Condition                   | Disable Condition    | Validation                         | Rollback                                       |
| ------------ | ---------------------------------- | -------------------- | ---------------------------------- | ---------------------------------------------- |
| **Start**    | Migration tooling ready            | N/A                  | N/A                                | N/A                                            |
| **Complete** | Usage < 5% of instances            | Must complete by 2.0 | Telemetry shows < 5% ARIA.md usage | Re-enable parser via flag                      |
| **Blockers** | Memory migration must be validated | Data loss risk       | Consistency tests pass             | Set `KILOCLAW_LEGACY_ARIA_MEMORY_ENABLED=true` |

### 4.4 Agency Routing

| Criterion    | Enable Condition                | Disable Condition        | Validation            | Rollback                |
| ------------ | ------------------------------- | ------------------------ | --------------------- | ----------------------- |
| **Start**    | Parity ≥ 95% achieved           | N/A                      | N/A                   | N/A                     |
| **Complete** | Parity ≥ 98% with no P0/P1 gaps | Must complete by 2.0     | Full test suite pass  | Revert to mixed routing |
| **Blockers** | Parity validation               | Critical bugs in routing | All parity tests pass | Revert routing changes  |

### 4.5 Legacy Source Code (`kilocode/`)

| Criterion    | Enable Condition                | Disable Condition | Validation                           | Rollback        |
| ------------ | ------------------------------- | ----------------- | ------------------------------------ | --------------- |
| **Start**    | Phase 5 initiated               | N/A               | N/A                                  | N/A             |
| **Complete** | All shared file markers removed | Phase 6+          | No `kilocode_change` in shared files | Restore markers |
| **Blockers** | Analysis of dependencies        | Conflict risk     | Merge tests pass                     | Keep markers    |

---

## 5. Feature Flags

### 5.1 Flag Specification

```typescript
// ============================================================================
// ARIA Legacy Decommission Feature Flags
// ============================================================================

/**
 * Controls ARIA_* environment variable dual-read behavior
 * - true (default through 1.1): Dual-read active, emit warnings
 * - false (1.2+): ARIA_* vars ignored, Kiloclaw vars required
 */
export const KILOCLAW_LEGACY_ARIA_ENV_ENABLED = {
  default: true,
  deprecationTarget: "1.2",
  description: "Enable ARIA environment variable backward compatibility",
  removalTarget: "2.0",
}

/**
 * Controls .opencode.json.aria config file parsing
 * - true (default through 1.2): Parse and transform legacy config
 * - false (1.3+): Legacy config block ignored
 */
export const KILOCLAW_LEGACY_ARIA_CONFIG_ENABLED = {
  default: true,
  deprecationTarget: "1.3",
  description: "Enable ARIA config section backward compatibility",
  removalTarget: "2.0",
}

/**
 * Controls ARIA.md memory conventions parsing
 * - true (default through 1.2): Parse and convert ARIA.md
 * - false (1.3+): Only KILOCLAW_MEMORY.md supported
 */
export const KILOCLAW_LEGACY_ARIA_MEMORY_ENABLED = {
  default: true,
  deprecationTarget: "1.3",
  description: "Enable ARIA.md memory conventions backward compatibility",
  removalTarget: "2.0",
}
```

### 5.2 Flag Transition Timeline

| Flag                                  | 1.0-1.1 | 1.2               | 1.3               | 2.0     |
| ------------------------------------- | ------- | ----------------- | ----------------- | ------- |
| `KILOCLAW_LEGACY_ARIA_ENV_ENABLED`    | `true`  | `false` (opt-out) | Removed           | N/A     |
| `KILOCLAW_LEGACY_ARIA_CONFIG_ENABLED` | `true`  | `true`            | `false` (opt-out) | Removed |
| `KILOCLAW_LEGACY_ARIA_MEMORY_ENABLED` | `true`  | `true`            | `false` (opt-out) | Removed |

### 5.3 Flag Override Mechanism

```typescript
// Users can early-opt-out of legacy support
KILOCLAW_DISABLE_LEGACY_ARIA = true // Disables all legacy support immediately
```

---

## 6. Migration Path for Users

### 6.1 Step-by-Step Migration Guide

#### Step 1: Update Environment Variables

**From ARIA:**

```bash
export ARIA_ENABLED=true
export ARIA_ROUTING_DEFAULT_AGENCY=development
export ARIA_ROUTING_CONFIDENCE_THRESHOLD=0.75
export ARIA_AGENCIES_DEVELOPMENT_ENABLED=true
```

**To Kiloclaw:**

```bash
export KILOCLAW_CORE_ENABLED=true
export KILOCLAW_ROUTING_DEFAULT_AGENCY=development
export KILOCLAW_ROUTING_CONFIDENCE=0.75
export KILOCLAW_AGENCY_DEVELOPMENT_ENABLED=true
```

**Mapping Reference**: See Section 2.2.1 for complete variable mapping

#### Step 2: Migrate Configuration File

**From `.opencode.json`:**

```json
{
  "aria": {
    "agencies": [{ "id": "development", "domain": "development", "enabled": true }],
    "routing": {
      "defaultAgency": "development",
      "confidenceThreshold": 0.75
    }
  }
}
```

**To `kiloclaw.config.json`:**

```json
{
  "agencies": [{ "id": "development", "domain": "development", "enabled": true }],
  "routing": {
    "defaultAgency": "development",
    "confidence": 0.75
  }
}
```

#### Step 3: Migrate Memory Conventions

**From `ARIA.md`:**

```markdown
# ARIA Memory Conventions

## Layers

### Working Memory

- enabled: true
- retention: session
- ttl: 1h
```

**To `KILOCLAW_MEMORY.md`:**

```markdown
# Kiloclaw Memory Configuration

## Memory Layers

### Working Memory

- **enabled**: true
- **retention**: session
- **ttl**: 1h
```

**Migration Tool**:

```bash
kiloclaw migrate memory --from aria.md --to KILOCLAW_MEMORY.md
```

#### Step 4: Update Agency Routing Calls

**From ARIA routing:**

```typescript
// ARIA-style routing
const result = await aria.route({ agency: "development", task })
```

**To Kiloclaw routing:**

```typescript
// Kiloclaw-style routing
const result = await kiloclaw.orchestrator.dispatch({
  agency: "development",
  task,
})
```

#### Step 5: Validate Migration

**Run migration validation:**

```bash
kiloclaw validate --config kiloclaw.config.json
kiloclaw doctor  # Check all systems operational
```

### 6.2 Migration Validation Checklist

- [ ] All `ARIA_*` env vars replaced with `KILOCLAW_*` equivalents
- [ ] `.opencode.json` no longer contains `aria` section
- [ ] `ARIA.md` converted to `KILOCLAW_MEMORY.md`
- [ ] Agency routing calls updated to Kiloclaw API
- [ ] `kiloclaw doctor` passes all checks
- [ ] No deprecation warnings in logs

---

## 7. Telemetry for Decommission Monitoring

### 7.1 Key Metrics

| Metric                                  | Current               | Target      | Alert Threshold |
| --------------------------------------- | --------------------- | ----------- | --------------- |
| `aria_env_vars_usage_percent`           | ~100% (pre-migration) | < 5% by 1.2 | > 50% after 1.2 |
| `aria_config_file_usage_percent`        | ~100% (pre-migration) | < 5% by 1.3 | > 30% after 1.3 |
| `aria_memory_conventions_usage_percent` | ~100% (pre-migration) | < 5% by 1.3 | > 30% after 1.3 |
| `legacy_config_error_rate`              | < 1%                  | < 0.1%      | > 5%            |
| `migration_validation_success_rate`     | N/A                   | > 95%       | < 80%           |

### 7.2 Telemetry Events

```typescript
// Events to track during decommission
const LEGACY_EVENTS = {
  ARIA_ENV_READ: "legacy.aria_env.read",
  ARIA_ENV_DUAL_READ: "legacy.aria_env.dual_read",
  ARIA_CONFIG_PARSED: "legacy.aria_config.parsed",
  ARIA_MEMORY_PARSED: "legacy.aria_memory.parsed",
  MIGRATION_COMPLETED: "migration.completed",
  DECOMMISSION_WARNING: "decommission.warning",
  DECOMMISSION_ERROR: "decommission.error",
}
```

### 7.3 Dashboard Requirements

Create decommission monitoring dashboard with:

1. **Usage Trends**: Line chart showing ARIA\_\* usage over time (should decrease)
2. **Error Rates**: Bar chart of legacy config errors (should remain < 1%)
3. **Migration Progress**: Funnel showing users completing migration steps
4. **Geographic Distribution**: Heatmap of legacy usage by region
5. **Alert Summary**: Real-time alerts when thresholds exceeded

---

## 8. Risk Assessment

### 8.1 Risk Matrix

| Risk                                           | Likelihood | Impact   | Mitigation                                                     |
| ---------------------------------------------- | ---------- | -------- | -------------------------------------------------------------- |
| Users not aware of migration                   | Medium     | High     | Release notes, in-cli warnings, direct communication           |
| Breaking existing workflows                    | High       | High     | Extended dual-read (2 releases), opt-out mechanism             |
| Incomplete migration causing data loss         | Low        | Critical | Validation tools, backup before migration, rollback procedures |
| Config validation rejecting valid ARIA configs | Medium     | Medium   | Comprehensive schema validation, lenient parsing in Phase 1    |
| Performance regression during adapter removal  | Low        | Medium   | Performance benchmarks in CI, gradual removal                  |
| Users on air-gapped environments stuck         | Low        | High     | Maintain migration tooling offline-capable                     |

### 8.2 Risk Mitigation Actions

| Risk               | Mitigation Action                                    | Owner    | Deadline |
| ------------------ | ---------------------------------------------------- | -------- | -------- |
| Awareness          | Publish migration guide, release notes, CLI warnings | Docs     | 1.0      |
| Breaking workflows | Implement `KILOCLAW_DISABLE_LEGACY_ARIA` opt-out     | Platform | 1.1      |
| Data loss          | Backup mechanism before migration, validation tests  | Core     | 1.1      |
| Config validation  | Add comprehensive test suite for edge cases          | Config   | 1.1      |
| Performance        | Add perf benchmarks to CI gate                       | DevOps   | 1.2      |
| Air-gapped         | Document offline migration procedure                 | Docs     | 1.2      |

---

## 9. Communication Plan

### 9.1 Communication Channels

| Channel         | Audience               | Frequency      | Content                              |
| --------------- | ---------------------- | -------------- | ------------------------------------ |
| Release Notes   | All users              | Per release    | Deprecation notices, migration steps |
| Migration Guide | Users with ARIA config | Ongoing        | Step-by-step migration instructions  |
| CLI Warnings    | All users              | Continuous     | Warnings when legacy config detected |
| Blog Post       | External users         | Major releases | Migration announcements              |
| Direct Email    | Enterprise users       | As needed      | Personalized migration assistance    |

### 9.2 Deprecation Message Templates

**CLI Warning (when ARIA env var detected):**

```
[DEPRECATION WARNING] Detected ARIA_* environment variable: {variable_name}
ARIA_* environment variables are deprecated and will be removed in release 2.0.
Please migrate to KILOCLAW_* equivalents.
See: https://docs.kiloclaw.io/migration/aria-to-kiloclaw
```

**CLI Warning (when ARIA config detected):**

```
[DEPRECATION WARNING] Detected legacy config in .opencode.json
The "aria" section is deprecated and will be removed in release 2.0.
Please migrate to kiloclaw.config.json format.
See: https://docs.kiloclaw.io/migration/aria-to-kiloclaw
```

### 9.3 Timeline for Communications

| Date       | Release | Communication Action                              |
| ---------- | ------- | ------------------------------------------------- |
| 2026-04-15 | 1.0     | Initial deprecation notice in release notes       |
| 2026-05-01 | 1.1     | CLI warnings enabled, migration guide published   |
| 2026-05-15 | 1.2     | Opt-out mechanism available, blog post            |
| 2026-06-01 | 1.3     | Final warning for env var/config users            |
| 2026-06-15 | 2.0     | Removal announcement, thank you to migrated users |

---

## 10. Rollback Procedures

### 10.1 Phase 1 Rollback (Release 1.0-1.1)

**Trigger**: Critical bugs discovered in dual-read logic

**Procedure**:

```bash
# Re-enable full dual-read (emergency)
export KILOCLAW_LEGACY_ARIA_ENV_ENABLED=true
export KILOCLAW_LEGACY_ARIA_CONFIG_ENABLED=true
export KILOCLAW_LEGACY_ARIA_MEMORY_ENABLED=true
```

**Expected User Impact**: None (dual-read continues)

**Detection**: CI failures, customer reports

### 10.2 Phase 2 Rollback (Release 1.2)

**Trigger**: Users unable to migrate due to edge-case configs

**Procedure**:

```bash
# Full rollback to Phase 1 behavior
export KILOCLAW_DISABLE_LEGACY_ARIA=false  # Default: re-enable legacy
# OR
export KILOCLAW_LEGACY_ARIA_ENV_ENABLED=true  # Selective enable
```

**Expected User Impact**: Users who opted-out will revert to dual-read mode

**Detection**: Support tickets, telemetry spike

### 10.3 Phase 3 Rollback (Release 1.3)

**Trigger**: Memory migration causing data inconsistency

**Procedure**:

```bash
# Re-enable memory conventions parsing
export KILOCLAW_LEGACY_ARIA_MEMORY_ENABLED=true
# Restore ARIA.md from backup
cp ~/.kiloclaw/backup/ARIA.md ~/.kiloclaw/memory/
```

**Data Recovery**:

```bash
# Restore from backup made before migration
kiloclaw memory restore --from ~/.kiloclaw/backup/memory/
```

**Expected User Impact**: Memory settings revert to ARIA.md format

**Detection**: Memory consistency tests failing, user reports

### 10.4 Phase 4 Rollback (Release 2.0)

**Trigger**: Critical bugs post-full-decommission

**Procedure**: Emergency hotfix to re-enable minimal legacy support

```typescript
// Emergency flag in config-legacy-adapter.ts
const EMERGENCY_LEGACY_ENABLED = true // Set to false after fix
```

**Expected User Impact**: Significant (full revert may be needed)

**Detection**: P0 incidents, widespread user impact

**Note**: Phase 4 rollback is last resort. Full codebase cleanup in 2.0 is intentional.

---

## 11. Appendices

### Appendix A: Environment Variable Mapping Reference

See Section 2.2.1 for complete mapping table.

### Appendix B: Configuration Schema Migration

| ARIA Schema                      | Kiloclaw Schema                                    | Transform       |
| -------------------------------- | -------------------------------------------------- | --------------- |
| `.opencode.json.aria.agencies`   | `kiloclaw.config.json.agencies`                    | Direct map      |
| `.opencode.json.aria.routing`    | `kiloclaw.config.json.routing`                     | Field rename    |
| `.opencode.json.aria.scheduler`  | `kiloclaw.config.json.agencies[].config.scheduler` | Restructure     |
| `.opencode.json.aria.guardrails` | `kiloclaw.config.json.guardrails`                  | Direct map      |
| `.opencode.json.aria.telemetry`  | `kiloclaw.config.json.telemetry`                   | Direct map      |
| `.opencode.json.aria.memory`     | `KILOCLAW_MEMORY.md`                               | New file format |

### Appendix C: Test Suite Requirements

| Test Category            | Required Coverage            | Gate |
| ------------------------ | ---------------------------- | ---- |
| Dual-read parsing        | 100% of ARIA\_\* vars        | Pass |
| Config transform         | 100% of ARIA config patterns | Pass |
| Memory conventions parse | 100% of ARIA.md patterns     | Pass |
| Error handling           | All error cases              | Pass |
| Rollback procedures      | All rollback scenarios       | Pass |

### Appendix D: Glossary

| Term         | Definition                                                   |
| ------------ | ------------------------------------------------------------ |
| Dual-read    | Reading both ARIA*\* and KILOCLAW*\* vars, preferring latter |
| Decommission | Systematic removal of legacy ARIA support                    |
| Feature flag | Runtime toggle for controlling legacy behavior               |
| Migration    | User action to move from ARIA to Kiloclaw configuration      |
| Rollback     | Reverting to previous state after issues discovered          |

---

## 12. References

- [KILOCLAW_FOUNDATION_PLAN.md](../plans/KILOCLAW_FOUNDATION_PLAN.md) - Section 8 for migration configurations
- [ARIA_TO_KILOCLAW_MAPPING.md](./ARIA_TO_KILOCLAW_MAPPING.md) - Section 9 for backward compatibility matrix
- [ISOLATION_PLAN.md](./ISOLATION_PLAN.md) - Isolation boundaries reference
- [config-legacy-adapter.ts](../../../packages/opencode/src/kiloclaw/config-legacy-adapter.ts) - Current implementation
- [ADR-001..003](../adr/) - Architecture decisions affecting decommission

---

## 13. Document History

| Version | Date       | Author          | Changes                 |
| ------- | ---------- | --------------- | ----------------------- |
| 1.0     | 2026-04-02 | Foundation Team | Initial draft for WP4.5 |

---

_This document will be updated as the decommission progresses. Last update: 2026-04-02_

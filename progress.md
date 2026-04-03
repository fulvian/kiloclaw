# Progress Log — Kiloclaw Foundation

## 2026-04-02

### Morning Session

- Loaded planning-with-files skill and initialized planning artifacts.
- Analyzed ARIA foundation blueprint and ARIA architecture modules.
- Analyzed KiloCode core architecture (agent, session prompt, tool, config).
- Completed gap analysis and migration direction definition.
- Created `docs/foundation/KILOCLAW_BLUEPRINT.md`.
- Created `docs/plans/KILOCLAW_FOUNDATION_PLAN.md`.
- Updated `.workflow/state.md` with current phase and artifacts.

### Foundation Phase Implementation

- Created directory structure under `docs/`:
  - `docs/adr/` - Architecture Decision Records
  - `docs/migration/` - Migration artifacts
  - `docs/architecture/` - Architecture documentation
  - `docs/safety/` - Safety policies
  - `docs/qa/` - QA verification docs
  - `docs/release/` - Release runbooks

### ADRs Created and Approved

1. **ADR-001** `docs/adr/ADR-001_Runtime_Hierarchy.md` - ✅ APPROVED
2. **ADR-002** `docs/adr/ADR-002_Memory_4_Layer.md` - ✅ APPROVED
3. **ADR-003** `docs/adr/ADR-003_Safety_Guardrails_Proactivity.md` - ✅ APPROVED
4. **ADR-004** `docs/adr/ADR-004_Isolation_from_KiloCode.md` - ✅ APPROVED

### Migration Documents Created

- **ARIA Feature Inventory** `docs/migration/ARIA_FEATURE_INVENTORY.md`
- **Isolation Plan** `docs/migration/ISOLATION_PLAN.md`

### CI Baseline Verification

- Verified existing CI infrastructure operational

## Foundation Gate: ✅ PASSED

---

## Phase 2 Core Runtime - COMPLETED

### Implementation Summary

- Created 11 TypeScript source files (~1,285 lines)
- Created 1 test file (~796 lines)
- Total: ~2,081 lines

### Files Created

**Domain Model (WP2.1)**

- `src/kiloclaw/types.ts` (115 lines)
  - Brand types: AgencyId, AgentId, SkillId, ToolId, CorrelationId
  - Status types: AgencyStatus, AgentStatus, TaskStatus
  - Domain enum: development, knowledge, nutrition, weather, custom
  - Permission scopes, capability/limit sets
  - Intent/Action/Policy types

- `src/kiloclaw/agency.ts` (188 lines)
  - Agency interface with lifecycle (start, stop, pause)
  - Agent registration/deregistration
  - Task execution and result synthesis
  - createAgency factory function

- `src/kiloclaw/agent.ts` (71 lines)
  - Agent interface with capabilities and limits
  - Task execution with ExecutionContext

- `src/kiloclaw/skill.ts` (72 lines)
  - Skill interface with version, input/output schemas
  - Capability metadata and tags

- `src/kiloclaw/tool.ts` (66 lines)
  - Tool interface with permission scopes
  - Health check method

- `src/kiloclaw/orchestrator.ts` (121 lines)
  - CoreOrchestrator interface
  - Intent routing, policy enforcement, memory broker, scheduler, audit

**Dispatcher (WP2.2)**

- `src/kiloclaw/dispatcher.ts` (143 lines)
  - Priority queue implementation
  - Task enqueue/dequeue/cancel
  - Pause/resume functionality
  - CorrelationId generation

- `src/kiloclaw/router.ts` (161 lines)
  - Intent routing with domain scoring
  - Keyword matching
  - Custom domain handlers

**Registry (WP2.3)**

- `src/kiloclaw/registry.ts` (158 lines)
  - Versioned skill/tool registry
  - Capability-based lookup
  - Registration and retrieval

**Config (WP2.4)**

- `src/kiloclaw/config.ts` (178 lines)
  - KILOCLAW*\* prefix only (blocks KILO*\_, OPENCODE\_\_, ARIA\_\*)
  - Override hierarchy: global > agency > env
  - Telemetry isolation configured

**Tests (WP2.5)**

- `test/kiloclaw/runtime.test.ts` (796 lines)
  - Happy path contract tests
  - Failure path tests
  - Error taxonomy coverage

### Next Actions

1. Run typecheck: `bun run --cwd packages/opencode typecheck`
2. Run tests: `bun run --cwd packages/opencode test test/kiloclaw/runtime.test.ts`
3. Proceed to Phase 3: Memory Implementation

---

## Phase 3 Memory 4-Layer - COMPLETED ✅

### Implementation Summary

- Created 8 TypeScript source files in `src/kiloclaw/memory/`
- Created memory contract tests
- Total: 61 tests pass

### Files Created

**Memory Layers (WP3.1-3.4)**

- `src/kiloclaw/memory/types.ts` (502 lines)
  - Memory layer types: WorkingMemory, EpisodicMemory, SemanticMemory, ProceduralMemory
  - MemoryEntry, MemoryQuery, MemoryResult types
  - Lifecycle operations: capture, classify, retain, consolidate, purge

- `src/kiloclaw/memory/working.ts` (167 lines)
  - Working memory: in-memory KV store with TTL expiration

- `src/kiloclaw/memory/episodic.ts` (189 lines)
  - Episodic memory: event store with episode tracking

- `src/kiloclaw/memory/semantic.ts` (214 lines)
  - Semantic memory: fact storage with embeddings and graph relations

- `src/kiloclaw/memory/procedural.ts` (165 lines)
  - Procedural memory: versioned procedure registry with patterns

- `src/kiloclaw/memory/broker.ts` (203 lines)
  - Memory broker: unified interface for all layers
  - Cross-layer consistency and query routing

- `src/kiloclaw/memory/lifecycle.ts` (210 lines)
  - Policy retention, privacy, classification
  - Capture, consolidate, purge operations

- `src/kiloclaw/memory/index.ts` - Barrel exports

**Documentation (WP3.5)**

- `docs/architecture/MEMORY_4_LAYER.md` - Architecture documentation

### Test Results

- 61 memory tests pass
- 56 runtime tests pass (Phase 2)
- Total: 117 tests pass across 2 test files

### Commit

- `ee4bfa550b9ffda8d654b1289d4927699d03aa5e` - feat(kiloclaw): complete Phase 3 - Memory 4-Layer implementation

---

## Phase 4 Agency Migration - COMPLETED ✅

### Implementation Summary

- WP4.1: Feature mapping document created
- WP4.2: Config legacy adapter implemented (38 tests)
- WP4.3: Wave 1 + Wave 2 skills implemented (109 tests)
- WP4.4: Backward compatibility window implemented (dual-read, deprecation warnings)
- WP4.5: Legacy decommission plan created

### Files Created

**WP4.1 - Feature Mapping:**

- `docs/migration/ARIA_TO_KILOCLAW_MAPPING.md` (680 lines)

**WP4.2 - Config Legacy Adapter:**

- `packages/opencode/src/kiloclaw/config-legacy-adapter.ts` (~860 lines)
- `packages/opencode/test/kiloclaw/config-legacy-adapter.test.ts` (~513 lines, 38 tests)

**WP4.3 - Wave 1 Skills (Development + Knowledge):**

- `packages/opencode/src/kiloclaw/skills/development/` (6 skills)
  - code-review.ts, debugging.ts, tdd.ts, comparison.ts, document-analysis.ts, simplification.ts
- `packages/opencode/src/kiloclaw/skills/knowledge/` (5 skills)
  - web-research.ts, literature-review.ts, fact-check.ts, synthesis.ts, critical-analysis.ts

**WP4.3 - Wave 2 Skills (Nutrition + Weather):**

- `packages/opencode/src/kiloclaw/skills/nutrition/` (4 skills)
  - diet-plan.ts, nutrition-analysis.ts, food-recall.ts, recipe-search.ts
- `packages/opencode/src/kiloclaw/skills/weather/` (3 skills)
  - weather-forecast.ts, weather-alerts.ts, weather-current.ts
- `packages/opencode/src/kiloclaw/skills/index.ts` (barrel exports)

**WP4.3 - Tests:**

- `packages/opencode/test/kiloclaw/skills/wave1.test.ts` (66 tests)
- `packages/opencode/test/kiloclaw/skills/wave2.test.ts` (43 tests)

**WP4.4 - Backward Compatibility:**

- Implemented in `config-legacy-adapter.ts`
- Dual-read strategy for ARIA*\* → KILOCLAW*\* env vars
- Deprecation warnings logged when legacy config detected

**WP4.5 - Legacy Decommission Plan:**

- `docs/migration/LEGACY_DECOMMISSION_PLAN.md` (670 lines)

### Test Results

- 264 tests pass across 5 test files
- 18 skills implemented (6 Development + 5 Knowledge + 4 Nutrition + 3 Weather)
- 875 assertions verified

### Agency Skills Summary

| Agency      | Skill ID             | Capabilities                                                      |
| ----------- | -------------------- | ----------------------------------------------------------------- |
| Development | `code-review`        | code_analysis, style_check, best_practices                        |
| Development | `debugging`          | bug_detection, root_cause, error_analysis                         |
| Development | `tdd`                | test_generation, test_execution, tdd_workflow                     |
| Development | `comparison`         | diff_analysis, conflict_resolution, change_tracking               |
| Development | `document-analysis`  | parsing, extraction, summarization, structure_analysis            |
| Development | `simplification`     | complexity_analysis, refactoring, code_quality                    |
| Knowledge   | `web-research`       | search, synthesis, web_scraping, information_gathering            |
| Knowledge   | `literature-review`  | paper_search, summarization, academic_research, citation_analysis |
| Knowledge   | `fact-check`         | verification, cross_reference, claim_analysis, source_grounding   |
| Knowledge   | `synthesis`          | multi_doc, insight_extraction, summarization, theme_detection     |
| Knowledge   | `critical-analysis`  | reasoning, counter_arguments, logical_analysis, critical_thinking |
| Nutrition   | `diet-plan`          | plan_generation, personalization, meal_planning                   |
| Nutrition   | `nutrition-analysis` | food_analysis, macro_calculation, nutritional_scoring             |
| Nutrition   | `food-recall`        | monitoring, alerting, safety_tracking                             |
| Nutrition   | `recipe-search`      | search, nutrition_data, ingredient_matching                       |
| Weather     | `weather-forecast`   | prediction, multi_day, weather_analysis                           |
| Weather     | `weather-alerts`     | warning_detection, notification, severity_assessment              |
| Weather     | `weather-current`    | current_conditions, temperature, weather_state                    |

### Next Actions

1. Proceed to Phase 5: Proactivity/Safety
2. Implement policy engine with static + dynamic rules
3. Implement guardrails for tool calls, data exfiltration, escalation

---

## 2026-04-03 - Flexible Agency Architecture Integration

### Morning Session

- Reviewed FLEXIBLE_AGENCY_ARCHITECTURE_PLAN.md (architecture refactoring plan)
- Reviewed KILOCLAW_BLUEPRINT.md (foundation document)
- Identified alignment between architecture plan and blueprint

### Updates to KILOCLAW_BLUEPRINT.md

**Section 3 - Architecture Target Updates:**

1. **New Layer Hierarchy** (Section 3):
   - Added Intent layer at top (natural language input)
   - Added CapabilityRouter to Core Orchestrator
   - Updated diagram to show new flow: Intent → Core → Agencies → Agents → Skill Registry → Tools/MCP

2. **New Section 3.1** - Definisci responsabilità gerarchiche:
   - Added Intent type with context (domain, urgency, preferences, correlationId)
   - Added CapabilityRouter description

3. **New Section 3.2** - Tipi Flessibili (Capability-Based):
   - Added TaskIntent type (flexible intent instead of closed enum)
   - Added SkillDefinition with capability tags
   - Added SkillChain for composition

4. **New Section 3.3** - Routing Architettura:
   - Added CapabilityRouter class definition
   - Added findSkillsForCapabilities, findAgentsForCapabilities, composeChain, matchScore methods

5. **New Section 3.4** - Percorso Migrazione:
   - 5-phase migration path table

6. **New Section 3.5** - Ciclo Esecuzione with Capability Routing:
   - Updated execution cycle with capability-based routing

7. **New Section 3.6** - Struttura File (Nuovi Moduli):
   - Added registry/ and routing/ directories

**Section 7 - Agency Updates:**

1. **Section 7 intro** - Added reference to capability registry
2. **Section 7.2** - Added Capability Tags column for future agencies
3. **New Section 7.3** - Agency Domain Flessibile:
   - Agency domain as flexible string (not enum)

**Section 9.3 - Acceptance Criteria:**

Added new criteria:

- CapabilityRouter active
- SkillChain composition supported
- Runtime registration (Phase 4)

### Next Actions

1. Complete verification of blueprint vs architecture plan alignment
2. Proceed to Phase 7 Release completion

---

## 2026-04-03 - Legacy AgentRegistry Deprecation

### Deprecation Work Completed

**Problem:** `FlexibleAgentRegistry` (new) conflicted naming with `AgentRegistry` (old legacy class in `types.ts`).

**Solution:** Deprecated the old `AgentRegistry` completely and updated documentation.

### Files Modified

| File                                             | Change                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------- |
| `agency/types.ts`                                | Added `@deprecated` JSDoc to `AgentRegistry` class and `getAgentRegistry()` |
| `agency/factory.ts`                              | Added `@deprecated` header noting migration path                            |
| `agency/index.ts`                                | Added deprecation block comment around legacy exports                       |
| `docs/plans/FLEXIBLE_AGENCY_ARCHITECTURE_TDD.md` | Updated sections 4.2, 7, 8.4, 9.2-9.4 to reflect naming and deprecation     |

### Deprecation Notice Added

```typescript
/**
 * @deprecated Use FlexibleAgentRegistry from "./registry/agent-registry" instead.
 * This class uses TaskType-based routing which is being replaced by capability-based routing.
 * Migration: Use FlexibleAgentRegistry.findByCapabilities() with TaskIntent.
 */
export class AgentRegistry { ... }
```

### Documentation Updated

- Section 4.2 renamed to "FlexibleAgentRegistry (Replaces Legacy AgentRegistry)"
- Section 7 file structure updated with deprecation notes
- Section 8.4 renamed to "FlexibleAgentRegistry Tests"
- Section 9.2-9.4 added Deprecation Strategy table and warning messages

### Next Steps

1. Phase 3: CapabilityRouter implementation
2. Update all usages of `getAgentRegistry()` to use `FlexibleAgentRegistry`

---

## 2026-04-03 - TypeScript Error Resolution in Test Suite

### Problem

All test files in `packages/opencode/test/kiloclaw/` had TypeScript errors due to:

1. **Branded Types Issue (TS2769)**: `AgencyId`, `SkillId`, etc. are branded Zod types. When comparing with `expect(result).toBe("plain-string")`, the branded type doesn't match plain string.

2. **CorrelationId Namespace vs Type Conflict**: Two conflicting definitions:
   - `types.ts`: `export const CorrelationId = z.string().brand<"CorrelationId">()` (a schema/value)
   - `dispatcher.ts`: `export namespace CorrelationId { export type CorrelationId = ... }` (a namespace)

3. **Skill.execute() Returns Promise<unknown>**: `Skill` interface defines `execute(input: unknown, context: SkillContext): Promise<unknown>`. Tests accessing `result.score`, `result.issues` etc. failed because TypeScript saw these as `unknown`.

4. **Type Assertion Issues (TS2709)**: Tests tried invalid type assertions like `CorrelationId["CorrelationId"]` where CorrelationId is a const schema, not a namespace.

### Solution Applied

**Pattern 1: Branded Type Assertions**

```typescript
// Before
expect(CodeReviewSkill.id).toBe("code-review") // TS2769

// After
expect(CodeReviewSkill.id as string).toBe("code-review") // OK
```

**Pattern 2: Result Type Interfaces + Casting**

```typescript
// Created result type interfaces
interface CodeReviewResult {
  issues: Array<{ rule: string; message: string; line?: number }>
  score: number
}

// Cast skill execute results
const result = (await CodeReviewSkill.execute(input, context)) as CodeReviewResult
```

**Pattern 3: Implicit Any Callbacks**

```typescript
// Before
result.issues.some((i) => i.rule === "no-var") // TS7006

// After
result.issues.some((i: { rule: string }) => i.rule === "no-var")
```

### Files Fixed

| File              | Errors Fixed | Approach                                                                                 |
| ----------------- | ------------ | ---------------------------------------------------------------------------------------- |
| `runtime.test.ts` | ~10 errors   | Fixed CorrelationId namespace conflict, branded type assertions                          |
| `wave1.test.ts`   | ~110 errors  | Added result type interfaces, cast skill.execute() results, fixed implicit any callbacks |
| `wave2.test.ts`   | ~50 errors   | Same pattern as wave1.test.ts                                                            |

### TypeScript Result

```bash
$ node node_modules/.bin/tsgo --noEmit -p packages/opencode/tsconfig.json
# 0 errors
```

---

## 2026-04-03 - Phase 6: Integration (Tests)

### Implementation Summary

Created missing test files for Phase 6: Integration as specified in `docs/plans/FLEXIBLE_AGENCY_ARCHITECTURE_TDD.md`.

### Files Created

| File                               | Test Cases | Description                                                |
| ---------------------------------- | ---------- | ---------------------------------------------------------- |
| `registry/skill-registry.test.ts`  | 13 tests   | SkillRegistry namespace tests                              |
| `registry/agent-registry.test.ts`  | 14 tests   | FlexibleAgentRegistry namespace tests                      |
| `registry/agency-registry.test.ts` | 12 tests   | AgencyRegistry namespace tests                             |
| `registry/chain-registry.test.ts`  | 11 tests   | ChainRegistry namespace tests                              |
| `routing/types.test.ts`            | 17 tests   | TaskIntentSchema, RouteResultSchema, migrateLegacyTaskType |

### Test Results

```
97 pass
0 fail
141 expect() calls
Ran 97 tests across 5 files
```

### Test Coverage Summary

| Component              | Test Cases |
| ---------------------- | ---------- |
| SkillRegistry          | 13         |
| FlexibleAgentRegistry  | 14         |
| AgencyRegistry         | 12         |
| ChainRegistry          | 11         |
| TaskIntent/RouteResult | 17         |
| **Total**              | **97**     |

### Acceptance Criteria Status

All Phase 6 acceptance criteria from FLEXIBLE_AGENCY_ARCHITECTURE_TDD.md:

- ✅ Type Safety: All new types have Zod schemas
- ✅ Non-Breaking: Tests maintain backwards compatibility
- ✅ Capability Matching: findByCapabilities() works correctly
- ✅ Agent Matching: findByCapabilities() with agency filter works
- ✅ Chain Composition: findChainForCapabilities() works
- ✅ Legacy Migration: migrateLegacyTaskType() works for all types
- ✅ Registry Operations: All CRUD operations verified
- ✅ Error Handling: Invalid inputs throw appropriate errors
- ✅ Typecheck Passes: 0 errors

### Commit

- `f5dbefe` chore: improve TypeScript LSP configuration and add test tsconfig
- `f9c9331` docs: update FLEXIBLE_AGENCY_ARCHITECTURE_TDD.md - mark Phase 6 complete
- `84ef050` feat(tests): complete Phase 6 integration tests for Flexible Agency Architecture
- `efe8d3d` fix(tests): resolve all TypeScript errors in kiloclaw test suite

---

## 2026-04-03 - Environment PATH Fix

### Problem

The PATH environment variable was corrupted with a literal `$PATH` string:

```
/usr/local/bin:/home/fulvio/coding/kiloclaw/packages/opencode:$PATH:/home/fulvio/.lmstudio/bin
```

This happened because `export PATH="...:$PATH"` was executed when `$PATH` was empty/unset, resulting in the literal string `$PATH` being stored.

### Root Cause

The corruption happened because of a non-interactive bash shell where:

1. `case $- in *i*) ;; *) return;; esac` exits `.bashrc` early in non-interactive mode
2. The PATH fix code was placed AFTER this check, so it never executed

### Solution

Moved the PATH corruption fix to the VERY FIRST LINE of `.bashrc`, before the interactive check:

```bash
# ~/.bashrc
# ROBUST PATH FIX: Must run FIRST, before the interactive return check
case "$PATH" in
    *:\$PATH:*|*\$PATH*)
        _fixed_path="/usr/local/bin:/usr/bin:/bin"
        for _dir in "$HOME/.bun/bin" "$HOME/.cargo/bin" "$HOME/.local/bin" "$HOME/bin"; do
            if [ -d "$_dir" ]; then
                case ":$_fixed_path:" in
                    *":$_dir:"*) ;;
                    *) _fixed_path="$_fixed_path:$_dir" ;;
                esac
            fi
        done
        export PATH="$_fixed_path"
        unset _fixed_path _dir
        ;;
esac

# If not running interactively, don't do anything
case $- in
    *i*) ;;
      *) return;;
esac
```

### Verification

```
PATH=/usr/local/bin:/usr/bin:/bin:/home/fulvio/.bun/bin:...
bun --version: 1.3.11
typecheck: PASSED (0 errors)
tests: 97 pass, 0 fail
```

### Additional Configuration

Added VS Code settings for better TypeScript LSP support:

- `typescript.enablePromptUseWorkspaceTsdk`: true
- `typescript.suggest.autoImports`: true
- `typescript.tsserver.maxTsServerMemory`: 8192
- `typescript.tsserver.experimental.enableProjectDiagnostics`: true

Added `packages/opencode/test/tsconfig.json` for test file type-checking.

### Problem

All test files in `packages/opencode/test/kiloclaw/` had TypeScript errors due to:

1. **Branded Types Issue (TS2769)**: `AgencyId`, `SkillId`, etc. are branded Zod types. When comparing with `expect(result).toBe("plain-string")`, the branded type doesn't match plain string.

2. **CorrelationId Namespace vs Type Conflict**: Two conflicting definitions:
   - `types.ts`: `export const CorrelationId = z.string().brand<"CorrelationId">()` (a schema/value)
   - `dispatcher.ts`: `export namespace CorrelationId { export type CorrelationId = ... }` (a namespace)

3. **Skill.execute() Returns Promise<unknown>**: `Skill` interface defines `execute(input: unknown, context: SkillContext): Promise<unknown>`. Tests accessing `result.score`, `result.issues` etc. failed because TypeScript saw these as `unknown`.

4. **Type Assertion Issues (TS2709)**: Tests tried invalid type assertions like `CorrelationId["CorrelationId"]` where CorrelationId is a const schema, not a namespace.

### Solution Applied

**Pattern 1: Branded Type Assertions**

```typescript
// Before
expect(CodeReviewSkill.id).toBe("code-review") // TS2769

// After
expect(CodeReviewSkill.id as string).toBe("code-review") // OK
```

**Pattern 2: Result Type Interfaces + Casting**

```typescript
// Created result type interfaces
interface CodeReviewResult {
  issues: Array<{ rule: string; message: string; line?: number }>
  score: number
}

// Cast skill execute results
const result = (await CodeReviewSkill.execute(input, context)) as CodeReviewResult
```

**Pattern 3: Implicit Any Callbacks**

```typescript
// Before
result.issues.some((i) => i.rule === "no-var") // TS7006

// After
result.issues.some((i: { rule: string }) => i.rule === "no-var")
```

### Files Fixed

| File              | Errors Fixed | Approach                                                                                 |
| ----------------- | ------------ | ---------------------------------------------------------------------------------------- |
| `runtime.test.ts` | ~10 errors   | Fixed CorrelationId namespace conflict, branded type assertions                          |
| `wave1.test.ts`   | ~110 errors  | Added result type interfaces, cast skill.execute() results, fixed implicit any callbacks |
| `wave2.test.ts`   | ~50 errors   | Same pattern as wave1.test.ts                                                            |

### TypeScript Result

```bash
$ node node_modules/.bin/tsgo --noEmit -p packages/opencode/tsconfig.json
# 0 errors
```

### Commit

- `d0a04a2` fix(tests): correct import paths and types in agency routing tests
- Previous commit: `139bcb6` feat(agency): implement Flexible Agency Architecture phases 1-5

---

## 2026-04-03 - Complete KiloCode → Kiloclaw Directory Migration

### Problem

The system identity responded with "Sono Kilo..." instead of "Sono Kiloclaw..." when users asked "chi sei?" in dev mode. This was due to:

1. `soul.txt` pointing to KiloCode identity instead of Kiloclaw
2. Provider prompts redefining identity with "You are Kilo..."
3. Directory migration incomplete - imports pointed to `kilocode/` but files needed to be in `kilocaw/`

### Solution Applied

**Phase 1: Identity Fix**

1. Created `kilocaw/soul.txt` with proper Kiloclaw identity:
   - "You are Kiloclaw, a versatile AI virtual assistant designed to help you accomplish a wide range of tasks."
2. Updated `session/system.ts` to import from `../kilocaw/soul.txt`
3. Removed "You are Kilo..." redefinition from 6 provider prompts:
   - `anthropic.txt`, `beast.txt`, `gemini.txt`, `codex_header.txt`, `qwen.txt`, `trinity.txt`
4. Updated review prompts in `review.ts` (2 places)
5. Updated `native-mode-defaults.ts` (6 roleDefinition updates)

**Phase 2: Directory Migration**

Created 31 files in `packages/opencode/src/kilocaw/`:

| Category       | Files                                                                                                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Core           | `soul.txt`, `paths.ts`, `kilocode-compat.ts`, `const.ts`                                                                                                                                                                                                           |
| Utilities      | `kilo-errors.ts`, `editor-context.ts`, `enhance-prompt.ts`, `plan-followup.ts`, `bash-hierarchy.ts`, `paste-summary.ts`, `cloud-session.ts`, `provider-options.ts`, `ts-check.ts`, `ts-client.ts`, `snapshot.ts`, `bell.ts`, `project-id.ts`, `config-injector.ts` |
| Migrators      | `modes-migrator.ts`, `rules-migrator.ts`, `workflows-migrator.ts`, `mcp-migrator.ts`, `ignore-migrator.ts`                                                                                                                                                         |
| Permission     | `permission/drain.ts`, `permission/config-paths.ts`                                                                                                                                                                                                                |
| Review         | `review/review.ts`, `review/worktree-diff.ts`, `review/command.ts`, `review/types.ts`                                                                                                                                                                              |
| Session-Import | `session-import/routes.ts`, `session-import/service.ts`, `session-import/types.ts`                                                                                                                                                                                 |
| Components     | `remote-tui.tsx`, `kilo-commands.tsx`, `components/*.tsx` (9 files)                                                                                                                                                                                                |
| Skills         | `skills/builtin.ts`                                                                                                                                                                                                                                                |

### Verification Results

- ✅ Zero `@/kilocode/` imports remain in TypeScript files
- ✅ Zero `@/kilocode/` imports remain in TSX files
- ✅ Only reference to `../kilocode/` is a comment in `kilocode-compat.ts` (legitimate)
- ✅ All 31 files created in `kilocaw/` directory

### Files Updated (Import Path Changes)

- `session/system.ts` - Changed import to `../kilocaw/soul.txt`
- `session/llm.ts` - `@/kilocode/const` → `@/kilocaw/const`
- `session/prompt.ts` - `@/kilocode/plan-followup` → `@/kilocaw/`
- `session/retry.ts` - `@/kilocode/kilo-errors` → `@/kilocaw/`
- `provider/provider.ts` - `@/kilocode/const` → `@/kilocaw/`
- `provider/transform.ts` - `@/kilocode/provider-options` → `@/kilocaw/`
- `permission/next.ts` - `@/kilocode/permission/*` → `@/kilocaw/permission/*`
- And 30+ other files

### Key Changes in Content

1. **soul.txt** (identity): "You are Kilo..." → "You are Kiloclaw..."
2. **const.ts**: `kilocode.ai` → `kiloclaw.ai`, `Kilo Code` → `Kiloclaw`
3. **review.ts** (review prompts): "You are Kilo Code" → "You are Kiloclaw"
4. **builtin.ts** (skills): "Kilo CLI" → "Kiloclaw CLI"
5. **paths.ts**: `KilocodePaths` namespace → `KiloclawPaths` namespace
6. **permission/config-paths.ts**: Fixed reference to `KilocodePaths.globalDirs()` → `KilocawPaths.globalDirs()`

### Legitimate KiloCode References (NOT Changed)

These references are intentionally kept as they refer to external systems:

- VS Code storage paths: `kilocode.kilo-code` (extension storage)
- Package names: `@kilocode/kilo-gateway`, `@kilocode/sdk`
- API operation IDs: `kilocode.removeSkill`, `kilocode.sessionImport.*`
- Kilo Gateway integration strings
- Migration terminology: "loaded kilocode MCP servers", "kilocode MCP migration warning"

### Next Steps

1. User can test by running dev mode and asking "chi sei?"
2. All imports now correctly resolve to `kilocaw/` directory
3. Identity correctly reports as "Kiloclaw"

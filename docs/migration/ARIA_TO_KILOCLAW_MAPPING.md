# ARIA to Kiloclaw Mapping Document

> **Status**: Draft  
> **Date**: 2026-04-02  
> **Phase**: 4 - Agency Migration (WP4.1)  
> **Source**: ARIA Feature Inventory, Kiloclaw Blueprint, Foundation Plan, Implementation Source  
> **Purpose**: Complete feature mapping from ARIA to Kiloclaw with migration status and implementation guidance

---

## 1. Executive Summary

### 1.1 Migration Scope

This document provides a comprehensive mapping of all ARIA features to Kiloclaw capabilities across four functional domains (agencies), infrastructure components, and configuration systems. The mapping serves as the authoritative reference for Phase 4 Agency Migration work.

**Migration Scope Summary:**

- **4 Agencies**: Development, Knowledge, Nutrition, Weather
- **18 Core Features**: Across all agencies
- **7 Infrastructure Components**: Orchestrator, Pipeline, Router, Memory, Guardrail, Tool Governance, Permission System
- **5 Configuration Mappings**: Environment variables and file-based config
- **24 Skills**: Registered capability modules across all agencies

### 1.2 Wave 1 vs Wave 2 Prioritization Rationale

**Wave 1 (Weeks 9-10)** targets high-value, lower-risk features that leverage existing KiloCode foundations:

| Rationale          | Development Agency                      | Knowledge Agency                           |
| ------------------ | --------------------------------------- | ------------------------------------------ |
| **Complexity**     | Medium (code patterns familiar)         | Medium (web search adaption)               |
| **Risk**           | Medium (wrapping existing agent system) | Low (new infrastructure but standard APIs) |
| **Business Value** | Core coding assistance                  | Research and synthesis capabilities        |
| **Dependency**     | Core Runtime (done)                     | Semantic Router (in progress)              |

**Wave 2 (Weeks 10-11)** targets domain-specific agencies requiring specialized infrastructure:

| Rationale          | Nutrition Agency                   | Weather Agency                      |
| ------------------ | ---------------------------------- | ----------------------------------- |
| **Complexity**     | Medium (domain-specific KB)        | Low (external API integration)      |
| **Risk**           | Medium (food database integration) | Low (weather APIs are standardized) |
| **Business Value** | Contextual nutrition assistance    | Proactive weather awareness         |
| **Dependency**     | Knowledge Agency (for synthesis)   | External API only                   |

---

## 2. Agency-by-Agency Mapping

### 2.1 Development Agency (Wave 1)

**Location**: `internal/aria/agency/development.go` → `packages/opencode/src/kiloclaw/agency.ts`

**Agency ID**: `development`  
**Domain**: `development`  
**Priority**: P0  
**Migration Status**: Not Migrated

#### Feature Mapping Table

| ARIA Feature      | Kiloclaw Capability                                        | Skill/Module                  | Migration Status | Implementation Location | Notes                                               |
| ----------------- | ---------------------------------------------------------- | ----------------------------- | ---------------- | ----------------------- | --------------------------------------------------- |
| Code Review       | Automated code analysis with style/best-practice detection | `skills/code-review.ts`       | Not migrated     | New implementation      | Leverages KiloCode tool system; needs skill wrapper |
| Debugging         | Intelligent bug detection and root cause analysis          | `skills/debugging.ts`         | Not migrated     | New implementation      | Requires session memory integration for context     |
| TDD Assist        | Test-driven development workflow assistance                | `skills/tdd.ts`               | Not migrated     | New implementation      | Coordinate with test execution tools                |
| Code Comparison   | Diff analysis and merge conflict resolution                | `skills/comparison.ts`        | Not migrated     | New implementation      | Uses git tools; needs conflict detection            |
| Document Analysis | Technical documentation processing and extraction          | `skills/document-analysis.ts` | Not migrated     | New implementation      | Markdown/ASCII doc parsing                          |
| Simplification    | Code complexity reduction and refactoring suggestions      | `skills/simplification.ts`    | Not migrated     | New implementation      | AST-based refactoring                               |

#### Skill Registry Mapping

| ARIA Skill File              | Target Kiloclaw Interface                 | Dependencies                  | Complexity | Risk   |
| ---------------------------- | ----------------------------------------- | ----------------------------- | ---------- | ------ |
| `skill/code_review.go`       | `packages/opencode/src/kiloclaw/skill.ts` | Tool registry, memory broker  | Medium     | Medium |
| `skill/debugging.go`         | `packages/opencode/src/kiloclaw/skill.ts` | Session memory, tool registry | High       | Medium |
| `skill/tdd.go`               | `packages/opencode/src/kiloclaw/skill.ts` | Test runner tools             | Medium     | Low    |
| `skill/comparison.go`        | `packages/opencode/src/kiloclaw/skill.ts` | Git tools                     | Medium     | Low    |
| `skill/document_analysis.go` | `packages/opencode/src/kiloclaw/skill.ts` | File system tools             | Medium     | Low    |
| `skill/simplification.go`    | `packages/opencode/src/kiloclaw/skill.ts` | AST parser, code metrics      | High       | Medium |

#### Sub-Agency Structure (Knowledge)

ARIA has sub-agents within Knowledge Agency. Development Agency uses flat agent structure in KiloCode.

| ARIA Sub-Agent       | Kiloclaw Equivalent | Notes                                         |
| -------------------- | ------------------- | --------------------------------------------- |
| N/A (flat structure) | `Agent.create()`    | Development uses single-level agent hierarchy |

---

### 2.2 Knowledge Agency (Wave 1)

**Location**: `internal/aria/agency/knowledge/` → New implementation required

**Agency ID**: `knowledge`  
**Domain**: `knowledge`  
**Priority**: P0  
**Migration Status**: Not Migrated

#### Feature Mapping Table

| ARIA Feature        | Kiloclaw Capability                                 | Skill/Module                  | Migration Status | Implementation Location | Notes                                 |
| ------------------- | --------------------------------------------------- | ----------------------------- | ---------------- | ----------------------- | ------------------------------------- |
| Web Research        | Multi-source web search and synthesis               | `skills/web-research.ts`      | Not migrated     | New implementation      | Requires Tavily/Firecrawl integration |
| Literature Review   | Academic paper search and summarization             | `skills/literature-review.ts` | Not migrated     | New implementation      | arXiv/PubMed API integration needed   |
| Fact Checking       | Cross-reference verification against known sources  | `skills/fact-check.ts`        | Not migrated     | New implementation      | Semantic memory for source grounding  |
| Knowledge Synthesis | Multi-document summarization and insight extraction | `skills/synthesis.ts`         | Not migrated     | New implementation      | Uses Knowledge Critic pattern         |
| Critical Analysis   | Deep analysis with counter-arguments                | `skills/critical-analysis.ts` | Not migrated     | New implementation      | Requires reasoning trace              |

#### Knowledge Sub-Agents Mapping

ARIA has a multi-agent supervisor pattern. Kiloclaw implements this via the Orchestrator hierarchy.

| ARIA Sub-Agent            | Kiloclaw Equivalent                              | Migration Notes               |
| ------------------------- | ------------------------------------------------ | ----------------------------- |
| `knowledge_supervisor.go` | `packages/opencode/src/kiloclaw/orchestrator.ts` | Orchestrator handles routing  |
| `knowledge_execution.go`  | `packages/opencode/src/kiloclaw/agent.ts`        | Agent namespace for execution |
| `knowledge_synthesis.go`  | `Agency.synthesizeResults()`                     | Built into agency interface   |
| `knowledge_critic.go`     | New `critic.ts` skill                            | Validation pattern            |
| `knowledge_task_state.go` | `packages/opencode/src/kiloclaw/memory/`         | Memory broker manages state   |

#### Skill Registry Mapping

| ARIA Skill File                        | Target Kiloclaw Interface                 | Dependencies                | Complexity | Risk   |
| -------------------------------------- | ----------------------------------------- | --------------------------- | ---------- | ------ |
| `skill/knowledge/literature_review.go` | `packages/opencode/src/kiloclaw/skill.ts` | Academic APIs, PDF parsing  | Medium     | Low    |
| `skill/knowledge/web_research.go`      | `packages/opencode/src/kiloclaw/skill.ts` | Web search API (Tavily)     | Medium     | Low    |
| `skill/knowledge/fact_check.go`        | `packages/opencode/src/kiloclaw/skill.ts` | Semantic memory, web search | High       | Medium |
| `skill/knowledge/summarization.go`     | `packages/opencode/src/kiloclaw/skill.ts` | LLM summarization           | Medium     | Low    |
| `skill/knowledge/synthesis.go`         | `packages/opencode/src/kiloclaw/skill.ts` | Multi-doc processing        | High       | Medium |
| `skill/knowledge/examples.go`          | `packages/opencode/src/kiloclaw/skill.ts` | Example retrieval           | Low        | Low    |

---

### 2.3 Nutrition Agency (Wave 2)

**Location**: `internal/aria/agency/nutrition/` → New implementation required

**Agency ID**: `nutrition`  
**Domain**: `nutrition`  
**Priority**: P1  
**Migration Status**: Not Migrated

#### Feature Mapping Table

| ARIA Feature           | Kiloclaw Capability                 | Skill/Module                   | Migration Status | Implementation Location | Notes                             |
| ---------------------- | ----------------------------------- | ------------------------------ | ---------------- | ----------------------- | --------------------------------- |
| Diet Plan Generation   | Personalized nutrition planning     | `skills/diet-plan.ts`          | Not migrated     | New implementation      | Requires nutrition knowledge base |
| Nutrition Analysis     | Food and meal nutritional analysis  | `skills/nutrition-analysis.ts` | Not migrated     | New implementation      | Food database integration         |
| Food Recall Monitoring | Safety monitoring for food products | `skills/food-recall.ts`        | Not migrated     | New implementation      | FDA API integration               |
| Recipe Search          | Recipe lookup with nutritional data | `skills/recipe-search.ts`      | Not migrated     | New implementation      | Recipe API + nutrition data       |

#### Skill Registry Mapping

| ARIA Skill File                   | Target Kiloclaw Interface                 | Dependencies                   | Complexity | Risk   |
| --------------------------------- | ----------------------------------------- | ------------------------------ | ---------- | ------ |
| `skill/diet_plan_generation.go`   | `packages/opencode/src/kiloclaw/skill.ts` | Nutrition KB, user preferences | Medium     | Medium |
| `skill/nutrition_analysis.go`     | `packages/opencode/src/kiloclaw/skill.ts` | Food database API              | Medium     | Medium |
| `skill/food_recall_monitoring.go` | `packages/opencode/src/kiloclaw/skill.ts` | FDA API, semantic memory       | Low        | Low    |
| `skill/recipe_search.go`          | `packages/opencode/src/kiloclaw/skill.ts` | Recipe API, nutrition data     | Low        | Low    |

---

### 2.4 Weather Agency (Wave 2)

**Location**: `internal/aria/agency/weather.go` → New implementation required

**Agency ID**: `weather`  
**Domain**: `weather`  
**Priority**: P0  
**Migration Status**: Not Migrated

#### Feature Mapping Table

| ARIA Feature       | Kiloclaw Capability                       | Skill/Module                 | Migration Status | Implementation Location | Notes                                |
| ------------------ | ----------------------------------------- | ---------------------------- | ---------------- | ----------------------- | ------------------------------------ |
| Weather Forecast   | Multi-day weather predictions             | `skills/weather-forecast.ts` | Not migrated     | New implementation      | Weather API integration              |
| Weather Alerts     | Severe weather warnings and notifications | `skills/weather-alerts.ts`   | Not migrated     | New implementation      | Requires notification infrastructure |
| Current Conditions | Real-time weather data                    | `skills/weather-current.ts`  | Not migrated     | New implementation      | Weather API simple fetch             |

#### Skill Registry Mapping

| ARIA Skill File             | Target Kiloclaw Interface                 | Dependencies                     | Complexity | Risk |
| --------------------------- | ----------------------------------------- | -------------------------------- | ---------- | ---- |
| `skill/weather_forecast.go` | `packages/opencode/src/kiloclaw/skill.ts` | Weather API (OpenWeather)        | Low        | Low  |
| `skill/weather_alerts.go`   | `packages/opencode/src/kiloclaw/skill.ts` | Weather API, notification system | Low        | Low  |
| `skill/weather_current.go`  | `packages/opencode/src/kiloclaw/skill.ts` | Weather API                      | Low        | Low  |

---

## 3. Skill Registry Mapping

### 3.1 Complete Skill Registry

| Skill ID             | Agency      | Capabilities                                         | Input Schema                                   | Output Schema                                   | Dependencies         | Complexity | Risk   |
| -------------------- | ----------- | ---------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------- | -------------------- | ---------- | ------ |
| `code-review`        | development | `["code_analysis", "style_check", "best_practices"]` | `{ code: string, language: string }`           | `{ issues: Issue[], score: number }`            | Tool registry        | Medium     | Medium |
| `debugging`          | development | `["bug_detection", "root_cause"]`                    | `{ code: string, error: string }`              | `{ diagnosis: string, steps: string[] }`        | Session memory       | High       | Medium |
| `tdd`                | development | `["test_generation", "test_execution"]`              | `{ code: string, framework: string }`          | `{ tests: string[], passed: boolean }`          | Test runners         | Medium     | Low    |
| `comparison`         | development | `["diff_analysis", "conflict_resolution"]`           | `{ before: string, after: string }`            | `{ diff: Diff[], conflicts: Conflict[] }`       | Git tools            | Medium     | Low    |
| `document-analysis`  | development | `["parsing", "extraction"]`                          | `{ content: string, format: string }`          | `{ sections: Section[], summary: string }`      | FS tools             | Medium     | Low    |
| `simplification`     | development | `["complexity_analysis", "refactoring"]`             | `{ code: string }`                             | `{ simplified: string, metrics: Metrics }`      | AST parser           | High       | Medium |
| `web-research`       | knowledge   | `["search", "synthesis"]`                            | `{ query: string, sources: number }`           | `{ results: Result[], summary: string }`        | Web search API       | Medium     | Low    |
| `literature-review`  | knowledge   | `["paper_search", "summarization"]`                  | `{ topic: string, count: number }`             | `{ papers: Paper[], summary: string }`          | Academic APIs        | Medium     | Low    |
| `fact-check`         | knowledge   | `["verification", "cross_reference"]`                | `{ claim: string }`                            | `{ verified: boolean, sources: Source[] }`      | Semantic memory      | High       | Medium |
| `synthesis`          | knowledge   | `["multi_doc", "insight_extraction"]`                | `{ documents: Document[] }`                    | `{ synthesis: string, insights: string[] }`     | Multi-doc processing | High       | Medium |
| `critical-analysis`  | knowledge   | `["reasoning", "counter_arguments"]`                 | `{ claim: string }`                            | `{ analysis: string, counter_args: string[] }`  | Reasoning trace      | High       | Medium |
| `diet-plan`          | nutrition   | `["plan_generation", "personalization"]`             | `{ user_profile: Profile, goals: Goal[] }`     | `{ plan: MealPlan, macros: Macros }`            | Nutrition KB         | Medium     | Medium |
| `nutrition-analysis` | nutrition   | `["food_analysis", "macro_calculation"]`             | `{ food_item: string, serving: string }`       | `{ macros: Macros, score: number }`             | Food database        | Medium     | Medium |
| `food-recall`        | nutrition   | `["monitoring", "alerting"]`                         | `{ product: string }`                          | `{ recalls: Recall[], severity: string }`       | FDA API              | Low        | Low    |
| `recipe-search`      | nutrition   | `["search", "nutrition_data"]`                       | `{ ingredients: string[], filters: Filter[] }` | `{ recipes: Recipe[], nutrition: Nutrition[] }` | Recipe API           | Low        | Low    |
| `weather-forecast`   | weather     | `["prediction", "multi_day"]`                        | `{ location: string, days: number }`           | `{ forecast: DayForecast[] }`                   | Weather API          | Low        | Low    |
| `weather-alerts`     | weather     | `["warning_detection", "notification"]`              | `{ location: string }`                         | `{ alerts: Alert[], severity: string }`         | Weather API          | Low        | Low    |
| `weather-current`    | weather     | `["current_conditions"]`                             | `{ location: string }`                         | `{ conditions: Current, temp: number }`         | Weather API          | Low        | Low    |

### 3.2 Skill Implementation Complexity Summary

| Complexity | Count | Skills                                                                                                                                                          |
| ---------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Low        | 9     | `comparison`, `document-analysis`, `web-research`, `literature-review`, `food-recall`, `recipe-search`, `weather-forecast`, `weather-alerts`, `weather-current` |
| Medium     | 7     | `code-review`, `tdd`, `simplification`, `synthesis`, `diet-plan`, `nutrition-analysis`                                                                          |
| High       | 3     | `debugging`, `fact-check`, `critical-analysis`                                                                                                                  |

### 3.3 Skill Risk Assessment Summary

| Risk   | Count | Skills                                                                                                                                                                 |
| ------ | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Low    | 9     | `tdd`, `comparison`, `document-analysis`, `literature-review`, `web-research`, `food-recall`, `recipe-search`, `weather-forecast`, `weather-alerts`, `weather-current` |
| Medium | 7     | `code-review`, `debugging`, `simplification`, `fact-check`, `synthesis`, `diet-plan`, `nutrition-analysis`                                                             |
| High   | 0     | -                                                                                                                                                                      |

---

## 4. Infrastructure Component Mapping

### 4.1 Core Orchestrator

**Location**: `internal/aria/core/` → `packages/opencode/src/kiloclaw/orchestrator.ts`

| ARIA Component  | Kiloclaw Target                    | Implementation Status | Migration Notes                           |
| --------------- | ---------------------------------- | --------------------- | ----------------------------------------- |
| Orchestrator    | `orchestrator.ts`                  | Implemented           | Central routing and coordination in place |
| Pipeline        | `dispatcher.ts`                    | Implemented           | Execution pipeline management             |
| Plan            | `orchestrator.ts` (task planning)  | Implemented           | Task decomposition via orchestrator       |
| Decision        | `orchestrator.ts` (decision logic) | Implemented           | Decision-making via agency routing        |
| Routing Learner | New component needed               | Not migrated          | ML-based routing not yet implemented      |
| Telemetry       | `packages/kilo-telemetry/`         | Implemented           | Metrics and monitoring via PostHog        |

### 4.2 Memory System

**Location**: `internal/aria/memory/` → `packages/opencode/src/kiloclaw/memory/`

| ARIA Component     | Kiloclaw Target         | Implementation Status | Migration Notes              |
| ------------------ | ----------------------- | --------------------- | ---------------------------- |
| Memory Service     | `memory/broker.ts`      | Implemented           | Phase 3 complete             |
| Episodic Memory    | `memory/episodic.ts`    | Implemented           | Session-scoped event storage |
| Memory Integration | `memory/` (cross-layer) | Implemented           | Consistency engine in place  |

### 4.3 Routing & Scheduling

**Location**: `internal/aria/routing/`, `internal/aria/scheduler/` → `packages/opencode/src/kiloclaw/`

| ARIA Component  | Kiloclaw Target | Implementation Status | Migration Notes                  |
| --------------- | --------------- | --------------------- | -------------------------------- |
| Semantic Router | `router.ts`     | Implemented           | Intent classification functional |
| Task Scheduler  | `dispatcher.ts` | Implemented           | Priority-based scheduling        |
| Registry        | `registry.ts`   | Implemented           | Agent/agency registration        |

### 4.4 Safety & Governance

**Location**: `internal/aria/guardrail/`, `internal/aria/toolgovernance/`, `internal/aria/permission/` → `packages/opencode/src/kiloclaw/`

| ARIA Component    | Kiloclaw Target              | Implementation Status | Migration Notes                        |
| ----------------- | ---------------------------- | --------------------- | -------------------------------------- |
| Guardrail         | `config.ts` (policy)         | Implemented           | Runtime safety enforcement via config  |
| Tool Governance   | `tool.ts` (permission scope) | Implemented           | Tool permissioning via PermissionScope |
| Permission System | `types.ts` (PermissionSet)   | Implemented           | Capability-based access control        |

### 4.5 Infrastructure Migration Status Summary

| Component       | Status                | Blockers                   |
| --------------- | --------------------- | -------------------------- |
| Orchestrator    | ✅ Complete           | None                       |
| Pipeline        | ✅ Complete           | None                       |
| Semantic Router | ✅ Complete           | None                       |
| Memory Service  | ✅ Complete (Phase 3) | None                       |
| Guardrail       | ✅ Complete           | None                       |
| Tool Governance | ✅ Complete           | None                       |
| Routing Learner | ⏳ Not migrated       | Requires ML infrastructure |
| Telemetry       | ✅ Complete           | None                       |

---

## 5. Configuration Migration Mapping

### 5.1 Environment Variable Mapping

Per the Foundation Plan Section 8.1:

| ARIA Config                           | Kiloclaw Config                       | Transform Rule         | Validation                                         |
| ------------------------------------- | ------------------------------------- | ---------------------- | -------------------------------------------------- |
| `ARIA_ENABLED`                        | `KILOCLAW_CORE_ENABLED`               | Boolean cast direct    | `boolean`                                          |
| `ARIA_ROUTING_DEFAULT_AGENCY`         | `KILOCLAW_ROUTING_DEFAULT_AGENCY`     | Enum validation        | `enum(development\|knowledge\|nutrition\|weather)` |
| `ARIA_ROUTING_CONFIDENCE_THRESHOLD`   | `KILOCLAW_ROUTING_CONFIDENCE`         | Clamp to `[0,1]`       | `number [0,1]`                                     |
| `ARIA_ROUTING_ENABLE_FALLBACK`        | `KILOCLAW_ROUTING_FALLBACK`           | Boolean cast direct    | `boolean`                                          |
| `ARIA_AGENCIES_DEVELOPMENT_ENABLED`   | `KILOCLAW_AGENCY_DEVELOPMENT_ENABLED` | Boolean cast direct    | `boolean`                                          |
| `ARIA_AGENCIES_KNOWLEDGE_ENABLED`     | `KILOCLAW_AGENCY_KNOWLEDGE_ENABLED`   | Boolean cast direct    | `boolean`                                          |
| `ARIA_AGENCIES_NUTRITION_ENABLED`     | `KILOCLAW_AGENCY_NUTRITION_ENABLED`   | Boolean cast direct    | `boolean`                                          |
| `ARIA_AGENCIES_WEATHER_ENABLED`       | `KILOCLAW_AGENCY_WEATHER_ENABLED`     | Boolean cast direct    | `boolean`                                          |
| `ARIA_SCHEDULER_MAX_CONCURRENT_TASKS` | `KILOCLAW_SCHED_MAX_CONCURRENT`       | Min 1, max policy      | `integer >= 1`                                     |
| `ARIA_SCHEDULER_DEFAULT_PRIORITY`     | `KILOCLAW_SCHED_DEFAULT_PRIORITY`     | Range 0-100            | `integer [0,100]`                                  |
| `ARIA_SCHEDULER_DISPATCH_INTERVAL_MS` | `KILOCLAW_SCHED_DISPATCH_MS`          | Min 100ms              | `integer >= 100`                                   |
| `ARIA_SCHEDULER_RECOVERY_POLICY`      | `KILOCLAW_SCHED_RECOVERY_POLICY`      | Enum strict validation | `enum`                                             |
| `ARIA_GUARDRAILS_ALLOW_PROACTIVE`     | `KILOCLAW_PROACTIVE_ENABLED`          | Boolean + policy gate  | `boolean`                                          |
| `ARIA_GUARDRAILS_MAX_DAILY_ACTIONS`   | `KILOCLAW_PROACTIVE_DAILY_BUDGET`     | Min 0                  | `integer >= 0`                                     |

### 5.2 File-Based Configuration

| ARIA Config           | Kiloclaw Config                             | Transform Rule                                       | Compatibility                             |
| --------------------- | ------------------------------------------- | ---------------------------------------------------- | ----------------------------------------- |
| `.opencode.json.aria` | `kiloclaw.config.json` → `agencies.default` | Schema transformation with JSON Schema v1 validation | Adapter automatico + warning deprecazione |
| `ARIA.md` conventions | `KILOCLAW_MEMORY.md` + `memory/` metadata   | Parser legacy → exporter formato nuovo               | Report migrazione con diff                |

### 5.3 Configuration Migration Dependencies

```
Config Migration (WP4.2)
    ↑
Memory 4-layer (Phase 3 - ✅ DONE)
    ↑
Core Runtime (Phase 2 - ✅ DONE)
```

---

## 6. Migration Wave Plan

### 6.1 Wave 1 (Weeks 9-10)

**Objective**: Migrate tier-1 features - Development and Knowledge agencies core capabilities

#### Week 9 Tasks

| Task                            | Agency      | Dependency     | Deliverable                   |
| ------------------------------- | ----------- | -------------- | ----------------------------- |
| Setup agency scaffolding        | All         | Core Runtime   | Agency modules initialized    |
| Migrate code-review skill       | Development | Tool registry  | `skills/code-review.ts`       |
| Migrate debugging skill         | Development | Session memory | `skills/debugging.ts`         |
| Migrate tdd skill               | Development | Test runners   | `skills/tdd.ts`               |
| Migrate web-research skill      | Knowledge   | Web search API | `skills/web-research.ts`      |
| Migrate literature-review skill | Knowledge   | Academic APIs  | `skills/literature-review.ts` |

#### Week 10 Tasks

| Task                            | Agency      | Dependency          | Deliverable                   |
| ------------------------------- | ----------- | ------------------- | ----------------------------- |
| Migrate fact-check skill        | Knowledge   | Semantic memory     | `skills/fact-check.ts`        |
| Migrate knowledge synthesis     | Knowledge   | Multi-doc processor | `skills/synthesis.ts`         |
| Migrate critical-analysis skill | Knowledge   | Reasoning trace     | `skills/critical-analysis.ts` |
| Migrate comparison skill        | Development | Git tools           | `skills/comparison.ts`        |
| Migrate document-analysis skill | Development | FS tools            | `skills/document-analysis.ts` |
| Integration testing wave 1      | All         | All wave 1 skills   | Parity test suite             |

#### Wave 1 Exit Criteria

- [ ] All 11 wave 1 skills implemented
- [ ] Development agency parity ≥ 80% with ARIA
- [ ] Knowledge agency parity ≥ 80% with ARIA
- [ ] No P0/P1 blockers

### 6.2 Wave 2 (Weeks 10-11)

**Objective**: Migrate tier-2 features - Nutrition and Weather agencies

#### Week 10 (continued) - Early Wave 2

| Task                           | Agency  | Dependency          | Deliverable                  |
| ------------------------------ | ------- | ------------------- | ---------------------------- |
| Migrate weather-forecast skill | Weather | Weather API         | `skills/weather-forecast.ts` |
| Migrate weather-current skill  | Weather | Weather API         | `skills/weather-current.ts`  |
| Migrate weather-alerts skill   | Weather | Notification system | `skills/weather-alerts.ts`   |

#### Week 11 Tasks

| Task                             | Agency    | Dependency        | Deliverable                    |
| -------------------------------- | --------- | ----------------- | ------------------------------ |
| Migrate diet-plan skill          | Nutrition | Nutrition KB      | `skills/diet-plan.ts`          |
| Migrate nutrition-analysis skill | Nutrition | Food database     | `skills/nutrition-analysis.ts` |
| Migrate food-recall skill        | Nutrition | FDA API           | `skills/food-recall.ts`        |
| Migrate recipe-search skill      | Nutrition | Recipe API        | `skills/recipe-search.ts`      |
| Integration testing wave 2       | All       | All wave 2 skills | Parity test suite              |
| Full system parity validation    | All       | All agencies      | Parity report ≥ 95%            |

#### Wave 2 Exit Criteria

- [ ] All 18 features implemented
- [ ] Overall parity ≥ 95% with ARIA
- [ ] No P0/P1 blockers
- [ ] Rollback procedure validated

### 6.3 Timeline Alignment

Per Foundation Plan Section 3, the 16-week timeline maps as:

| Week  | Phase              | Focus                   | Output      |
| ----- | ------------------ | ----------------------- | ----------- |
| 1-2   | Foundation         | Setup + inventory       | ✅ Complete |
| 3-5   | Core Runtime       | Runtime hierarchy       | ✅ Complete |
| 6-8   | Memory             | 4-layer memory          | ✅ Complete |
| 9-10  | Agency Migration   | Wave 1 + partial Wave 2 | Current     |
| 11    | Agency Migration   | Wave 2 completion       | Pending     |
| 12-13 | Proactivity/Safety | Guardrails + policy     | Pending     |
| 14-15 | Verification       | QA SOTA 2026            | Pending     |
| 16    | Release            | Cutover                 | Pending     |

---

## 7. Gap Analysis

### 7.1 Features in ARIA but NOT in Current Kiloclaw

| Feature                          | Category       | Gap Description                                                      | Mitigation                                   |
| -------------------------------- | -------------- | -------------------------------------------------------------------- | -------------------------------------------- |
| Multi-agency routing             | Infrastructure | KiloCode has agent-centric model; ARIA has agency coordination layer | Implement agency coordinator in orchestrator |
| Semantic task routing (ML-based) | Routing        | ARIA uses ML-based routing; current router uses rule-based           | Roadmap ML routing for Phase 5+              |
| Nutrition domain                 | Agency         | Unique to ARIA, requires specialized knowledge base                  | New implementation with food API integration |
| Weather domain                   | Agency         | Unique to ARIA, requires external API                                | New implementation with weather API          |
| Proactive guardrails             | Safety         | ARIA has dynamic safety system; current is static config             | Implement in Phase 5                         |

### 7.2 Features Requiring New Infrastructure

| Feature                | Required Infrastructure                        | Priority |
| ---------------------- | ---------------------------------------------- | -------- |
| Fact Checking          | Semantic memory layer with source grounding    | P0       |
| Critical Analysis      | Reasoning trace and counter-argument framework | P1       |
| Food Recall Monitoring | FDA API integration + notification system      | P2       |
| Weather Alerts         | Notification infrastructure                    | P1       |

### 7.3 Lower Priority Features (Document but Defer)

| Feature                      | Reason for Deferral            | Future Phase |
| ---------------------------- | ------------------------------ | ------------ |
| Routing Learner              | Requires ML infrastructure     | Phase 5+     |
| Document Analysis            | Lower immediate business value | Phase 5      |
| Simplification (refactoring) | Requires AST infrastructure    | Phase 5      |

### 7.4 Gap Summary

| Category        | Total | Implemented | In Progress | Not Started |
| --------------- | ----- | ----------- | ----------- | ----------- |
| Agency Features | 18    | 0           | 0           | 18          |
| Infrastructure  | 8     | 6           | 0           | 2           |
| Skills          | 24    | 0           | 0           | 24          |
| Config Mappings | 14    | 0           | 0           | 14          |

---

## 8. Dependencies

### 8.1 Critical Path

```
Phase 3: Memory Service (DONE ✅)
         │
         ▼
Phase 2: Core Orchestrator (DONE ✅)
         │
         ▼
Phase 2: Semantic Router (DONE ✅)
         │
         ├──► Development Agency ──► Knowledge Agency
         │           │                    │
         │           ▼                    ▼
         │    Tool Governance       Web Research
         │    Skill Registry        Semantic Memory
         │
         └──► Wave 2 Agencies
                   │
                   ▼
            Nutrition Agency
            Weather Agency
```

### 8.2 Dependency Matrix

| Component          | Depends On                            | Blocks          | Status  |
| ------------------ | ------------------------------------- | --------------- | ------- |
| Development Agency | Core Runtime, Registry                | Wave 1 features | Pending |
| Knowledge Agency   | Core Runtime, Semantic Router, Memory | Wave 1 features | Pending |
| Nutrition Agency   | Core Runtime, Knowledge (synthesis)   | Wave 2 features | Pending |
| Weather Agency     | Core Runtime, External APIs           | Wave 2 features | Pending |
| Skill Registry     | Core Runtime                          | All agencies    | Pending |
| Tool Governance    | Core Runtime                          | All agencies    | Pending |
| Guardrail          | Core Runtime, Memory                  | Proactivity     | Pending |

### 8.3 External Dependencies

| Dependency     | Source       | Used By           | Status               |
| -------------- | ------------ | ----------------- | -------------------- |
| Web Search API | Tavily       | Knowledge Agency  | Requires API key     |
| Academic APIs  | arXiv/PubMed | Literature Review | Requires credentials |
| Weather API    | OpenWeather  | Weather Agency    | Requires API key     |
| Food Database  | USDA/Edamam  | Nutrition Agency  | Requires API key     |
| Recipe API     | Spoonacular  | Recipe Search     | Requires API key     |
| FDA API        | openFDA      | Food Recall       | Requires API key     |

---

## 9. Backward Compatibility

### 9.1 ARIA Legacy Support

Per Foundation Plan Section 8.3, backward compatibility is maintained via:

1. **Dual-read period**: Both ARIA and Kiloclaw configs read during transition
2. **Adapter layer**: Automatic transformation of legacy configs
3. **Deprecation warnings**: Clear indicators when legacy config is used
4. **Migration tooling**: Automated report of mapping changes

### 9.2 Compatibility Matrix

| Feature            | ARIA Support          | Kiloclaw Support       | Dual-Read Window |
| ------------------ | --------------------- | ---------------------- | ---------------- |
| Environment vars   | Full                  | Full (renamed)         | 2 releases       |
| File config        | `.opencode.json.aria` | `kiloclaw.config.json` | 2 releases       |
| Memory conventions | `ARIA.md`             | `KILOCLAW_MEMORY.md`   | 1 release        |
| Agency routing     | `ARIA_ROUTING_*`      | `KILOCLAW_ROUTING_*`   | 2 releases       |

---

## 10. Verification Checklist

### 10.1 Pre-Migration Verification

- [ ] All source ARIA features catalogued in ARIA_FEATURE_INVENTORY.md
- [ ] All target Kiloclaw interfaces defined in `packages/opencode/src/kiloclaw/`
- [ ] Configuration mapping documented in Section 5
- [ ] Wave plan aligned with 16-week timeline

### 10.2 Post-Migration Verification (per Wave)

#### Wave 1 Verification

- [ ] Development agency 6 features implemented
- [ ] Knowledge agency 5 features implemented
- [ ] Development parity ≥ 80%
- [ ] Knowledge parity ≥ 80%
- [ ] No P0/P1 blockers

#### Wave 2 Verification

- [ ] Nutrition agency 4 features implemented
- [ ] Weather agency 3 features implemented
- [ ] Overall parity ≥ 95%
- [ ] Rollback procedure tested
- [ ] No P0/P1 blockers

### 10.3 Final Verification

- [ ] All 18 features migrated
- [ ] All 24 skills registered
- [ ] All 14 config mappings functional
- [ ] Parity report ≥ 95%
- [ ] No P0/P1 open issues
- [ ] Decommission plan approved

---

## Appendix A: Type Interface Reference

### A.1 Core Types (from `types.ts`)

```typescript
// Agency and Agent identifiers
AgencyId: z.string().brand<"AgencyId">
AgentId: z.string().brand<"AgentId">
SkillId: z.string().brand<"SkillId">
ToolId: z.string().brand<"ToolId">()

// Domain enum matches 4 agencies
Domain: z.enum(["development", "knowledge", "nutrition", "weather", "custom"])

// Status tracking
AgencyStatus: z.enum(["idle", "running", "paused", "stopped", "error"])
AgentStatus: z.enum(["idle", "busy", "error", "unavailable"])
TaskStatus: z.enum(["pending", "running", "completed", "failed", "cancelled", "timeout"])

// Permission scopes for tool governance
PermissionScope: z.enum(["read", "write", "execute", "network", "external_api", "filesystem"])
```

### A.2 Agency Types (from `agency.ts`)

```typescript
// Task and result types
Task: {
  ;(id, type, input, priority, deadline, skills, context)
}
TaskResult: {
  ;(taskId, status, output, error, duration)
}
AgentResult: {
  ;(agentId, taskId, status, output, evidence)
}
Synthesis: {
  ;(summary, confidence, outputs, recommendations)
}

// Execution context
ExecutionContext: {
  ;(correlationId, agencyId, taskId, deadline, metadata)
}
SkillContext: {
  ;(correlationId, agencyId, agentId, skillId, metadata)
}
```

### A.3 Skill Types (from `skill.ts`)

```typescript
Skill: {
  id: SkillId
  version: SemanticVersion
  name: string
  inputSchema: JsonSchema
  outputSchema: JsonSchema
  capabilities: string[]
  tags: string[]
  execute(input: unknown, context: SkillContext): Promise<unknown>
}
```

### A.4 Tool Types (from `tool.ts`)

```typescript
Tool: {
  id: ToolId
  name: string
  permissionScope: PermissionScope[]
  execute(input: unknown, permissions: PermissionScope[]): Promise<ToolResult>
  health(): Promise<ToolHealth>
}
```

---

## Appendix B: File Location Reference

### B.1 Source Documents

| Document               | Path                                       |
| ---------------------- | ------------------------------------------ |
| ARIA Feature Inventory | `docs/migration/ARIA_FEATURE_INVENTORY.md` |
| Kiloclaw Blueprint     | `docs/foundation/KILOCLAW_BLUEPRINT.md`    |
| Foundation Plan        | `docs/plans/KILOCLAW_FOUNDATION_PLAN.md`   |

### B.2 Target Implementation

| Component         | Path                                                  |
| ----------------- | ----------------------------------------------------- |
| Core Types        | `packages/opencode/src/kiloclaw/types.ts`             |
| Agency            | `packages/opencode/src/kiloclaw/agency.ts`            |
| Agent             | `packages/opencode/src/kiloclaw/agent.ts`             |
| Skill             | `packages/opencode/src/kiloclaw/skill.ts`             |
| Tool              | `packages/opencode/src/kiloclaw/tool.ts`              |
| Registry          | `packages/opencode/src/kiloclaw/registry.ts`          |
| Orchestrator      | `packages/opencode/src/kiloclaw/orchestrator.ts`      |
| Router            | `packages/opencode/src/kiloclaw/router.ts`            |
| Dispatcher        | `packages/opencode/src/kiloclaw/dispatcher.ts`        |
| Config            | `packages/opencode/src/kiloclaw/config.ts`            |
| Memory Broker     | `packages/opencode/src/kiloclaw/memory/broker.ts`     |
| Working Memory    | `packages/opencode/src/kiloclaw/memory/working.ts`    |
| Episodic Memory   | `packages/opencode/src/kiloclaw/memory/episodic.ts`   |
| Semantic Memory   | `packages/opencode/src/kiloclaw/memory/semantic.ts`   |
| Procedural Memory | `packages/opencode/src/kiloclaw/memory/procedural.ts` |

---

_Document Version: 1.0_  
_Last Updated: 2026-04-02_  
_Phase: 4 - Agency Migration_

# ARIA Feature Inventory

> **Status**: Draft  
> **Date**: 2026-04-02  
> **Source**: `/home/fulvio/coding/aria/internal/aria/`  
> **Purpose**: Inventory of ARIA features for migration to Kiloclaw

## Overview

ARIA features are organized into 4 functional domains (agencies), each with specialized skills and capabilities. This document catalogs all features for migration prioritization.

## Agency: Development (Wave 1)

**Location**: `internal/aria/agency/development.go`

### Core Features

| Feature           | Description                                                 | Priority | Migration Status |
| ----------------- | ----------------------------------------------------------- | -------- | ---------------- |
| Code Review       | Automated code review with style and best practice analysis | P0       | Not migrated     |
| Debugging         | Intelligent bug detection and root cause analysis           | P0       | Not migrated     |
| TDD Assist        | Test-driven development workflow assistance                 | P1       | Not migrated     |
| Code Comparison   | Diff analysis and merge conflict resolution                 | P1       | Not migrated     |
| Document Analysis | Technical documentation processing and extraction           | P2       | Not migrated     |
| Simplification    | Code complexity reduction and refactoring suggestions       | P2       | Not migrated     |

### Skill Registry (Development)

```go
// Skills identified in skill/registry.go
- code_review.go
- debugging.go
- tdd.go
- comparison.go
- document_analysis.go
- simplification.go
- data_analysis.go
```

## Agency: Knowledge (Wave 1)

**Location**: `internal/aria/agency/knowledge/`

### Core Features

| Feature             | Description                                         | Priority | Migration Status |
| ------------------- | --------------------------------------------------- | -------- | ---------------- |
| Web Research        | Multi-source web search and synthesis               | P0       | Not migrated     |
| Literature Review   | Academic paper search and summarization             | P0       | Not migrated     |
| Fact Checking       | Cross-reference verification against known sources  | P0       | Not migrated     |
| Knowledge Synthesis | Multi-document summarization and insight extraction | P1       | Not migrated     |
| Critical Analysis   | Deep analysis with counter-arguments                | P1       | Not migrated     |

### Knowledge Sub-Agents

| Agent                | File                      | Purpose                           |
| -------------------- | ------------------------- | --------------------------------- |
| Knowledge Supervisor | `knowledge_supervisor.go` | Orchestrates knowledge tasks      |
| Knowledge Execution  | `knowledge_execution.go`  | Executes knowledge workflows      |
| Knowledge Synthesis  | `knowledge_synthesis.go`  | Synthesizes results               |
| Knowledge Critic     | `knowledge_critic.go`     | Validates and challenges findings |
| Task State           | `knowledge_task_state.go` | Manages task state                |

### Skill Registry (Knowledge)

```go
// Skills in skill/knowledge/
- literature_review.go
- web_research.go
- fact_check.go
- summarization.go
- synthesis.go
- examples.go
```

## Agency: Nutrition (Wave 2)

**Location**: `internal/aria/agency/nutrition/`

### Core Features

| Feature                | Description                         | Priority | Migration Status |
| ---------------------- | ----------------------------------- | -------- | ---------------- |
| Diet Plan Generation   | Personalized nutrition planning     | P0       | Not migrated     |
| Nutrition Analysis     | Food and meal nutritional analysis  | P0       | Not migrated     |
| Food Recall Monitoring | Safety monitoring for food products | P1       | Not migrated     |
| Recipe Search          | Recipe lookup with nutritional data | P2       | Not migrated     |

### Skill Registry (Nutrition)

```go
// Skills in skill/
- diet_plan_generation.go
- nutrition_analysis.go
- food_recall_monitoring.go
- recipe_search.go
```

## Agency: Weather (Wave 2)

**Location**: `internal/aria/agency/weather.go`

### Core Features

| Feature            | Description                               | Priority | Migration Status |
| ------------------ | ----------------------------------------- | -------- | ---------------- |
| Weather Forecast   | Multi-day weather predictions             | P0       | Not migrated     |
| Weather Alerts     | Severe weather warnings and notifications | P0       | Not migrated     |
| Current Conditions | Real-time weather data                    | P1       | Not migrated     |

### Skill Registry (Weather)

```go
// Skills in skill/
- weather_forecast.go
- weather_alerts.go
- weather_current.go
```

## Infrastructure Components

### Core Orchestrator

**Location**: `internal/aria/core/`

| Component       | Description                        | Migration Priority |
| --------------- | ---------------------------------- | ------------------ |
| Orchestrator    | Central routing and coordination   | P0                 |
| Pipeline        | Execution pipeline management      | P0                 |
| Plan            | Task planning and decomposition    | P1                 |
| Decision        | Decision-making logic              | P1                 |
| Routing Learner | Adaptive routing based on learning | P2                 |
| Telemetry       | Metrics and monitoring             | P1                 |

### Memory System

**Location**: `internal/aria/memory/`

| Component          | Description                  | Migration Priority |
| ------------------ | ---------------------------- | ------------------ |
| Memory Service     | Core memory operations       | P0                 |
| Episodic Memory    | Session-scoped event storage | P0                 |
| Memory Integration | Cross-layer consistency      | P1                 |

### Routing & Scheduling

**Location**: `internal/aria/routing/`, `internal/aria/scheduler/`

| Component       | Description                       | Migration Priority |
| --------------- | --------------------------------- | ------------------ |
| Semantic Router | Intent classification and routing | P0                 |
| Task Scheduler  | Priority-based task scheduling    | P1                 |
| Registry        | Agent/Agency registration         | P1                 |

### Safety & Governance

**Location**: `internal/aria/guardrail/`, `internal/aria/toolgovernance/`, `internal/aria/permission/`

| Component         | Description                     | Migration Priority |
| ----------------- | ------------------------------- | ------------------ |
| Guardrail         | Runtime safety enforcement      | P0                 |
| Tool Governance   | Tool permissioning and audit    | P0                 |
| Permission System | Capability-based access control | P1                 |

## Feature Priority Matrix

### Tier 1: Wave 1 (Weeks 3-5)

| Feature           | Agency         | Complexity | Risk   |
| ----------------- | -------------- | ---------- | ------ |
| Web Research      | Knowledge      | Medium     | Low    |
| Literature Review | Knowledge      | Medium     | Low    |
| Fact Checking     | Knowledge      | High       | Medium |
| Code Review       | Development    | Medium     | Medium |
| Debugging         | Development    | High       | Medium |
| Memory Service    | Infrastructure | High       | High   |
| Semantic Router   | Infrastructure | Medium     | Medium |
| Guardrail         | Safety         | High       | High   |

### Tier 2: Wave 2 (Weeks 6-8)

| Feature              | Agency      | Complexity | Risk   |
| -------------------- | ----------- | ---------- | ------ |
| TDD Assist           | Development | Medium     | Low    |
| Knowledge Synthesis  | Knowledge   | High       | Medium |
| Diet Plan Generation | Nutrition   | Medium     | Medium |
| Nutrition Analysis   | Nutrition   | Medium     | Medium |
| Weather Forecast     | Weather     | Low        | Low    |
| Orchestrator         | Core        | High       | High   |

### Tier 3: Future (Weeks 9+)

| Feature                | Agency         | Complexity | Risk   |
| ---------------------- | -------------- | ---------- | ------ |
| Code Comparison        | Development    | Medium     | Low    |
| Food Recall Monitoring | Nutrition      | Low        | Low    |
| Weather Alerts         | Weather        | Low        | Low    |
| Routing Learner        | Infrastructure | High       | Medium |
| Document Analysis      | Development    | Medium     | Low    |

## Gap Analysis

### Features NOT in KiloCode (to be migrated from ARIA)

1. **Multi-agency routing** - KiloCode has agent-centric model, ARIA has agency model
2. **4-layer memory** - KiloCode has session-based memory, ARIA has layered memory
3. **Semantic task routing** - ARIA has ML-based routing
4. **Nutrition domain** - Unique to ARIA
5. **Weather domain** - Unique to ARIA
6. **Proactive guardrails** - ARIA has dynamic safety system

### Features in KiloCode (reference implementations)

1. **Tool system** - Well-developed in KiloCode, reference for migration
2. **Agent execution** - Mature in KiloCode, adapt for agency model
3. **Session management** - KiloCode pattern, extend for episodic memory
4. **Skill registry** - KiloCode has basic version, ARIA has advanced

## Migration Notes

### Development Agency

- Base implementation exists in KiloCode agent system
- Need to wrap with agency coordination layer
- Skills can be ported with minimal modification

### Knowledge Agency

- Requires new infrastructure (web search, document processing)
- ML-based routing needs reimplementation or integration
- Synthesis patterns are novel, high value

### Nutrition Agency

- Domain-specific, requires nutrition knowledge base
- Integration with food databases needed
- Lower priority, validate market need

### Weather Agency

- External API integration straightforward
- Alert system requires notification infrastructure
- Lower priority for initial release

## Dependencies

```
Core Infrastructure
├── Memory Service (blocks all agencies)
├── Orchestrator (blocks all agencies)
└── Semantic Router (blocks knowledge agency)

Development Agency
├── Core Infrastructure
├── Tool Governance
└── Skill Registry

Knowledge Agency
├── Core Infrastructure
├── Memory Service
├── Semantic Router
└── Web Research Tools

Nutrition Agency
├── Core Infrastructure
└── Knowledge Agency (for synthesis)

Weather Agency
├── Core Infrastructure
└── External Weather API
```

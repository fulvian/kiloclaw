# Kiloclaw PRD — Agency-Based AI Agent System

**Version:** 1.0  
**Date:** 2026-04-03  
**Status:** Draft  
**Reference:** ARIA source at `/home/fulvio/coding/aria`, Blueprint at `docs/foundation/KILOCLAW_BLUEPRINT.md`

---

## 1. Problem Statement

Kiloclaw currently implements a **flat agent model** (inherited from KiloCode) with only generic agents (`code`, `plan`, `debug`, `ask`, `orchestrator`). This approach:

1. **Lacks domain specialization** — No specialized agents for knowledge research, development, nutrition analysis, weather queries
2. **No agency hierarchy** — No `Agency → Agent → Skill → Tool`分层架构
3. **Limited web search** — Only Exa MCP available; no Tavily, Brave, Perplexity, or academic providers
4. **No skill registry** — Skills are loosely coupled; no domain-specific skill catalogs
5. **No memory hierarchy** — Single-layer session state; no 4-layer memory (Working/Episodic/Semantic/Procedural)
6. **No provider governance** — No tool governance, risk scoring, or audit trail for AI actions

**User expectation vs. reality**: Users expect specialized agents (system-analyst, architect, coder, etc.) selectable in the UI. The AGENTS.md routing matrix describes an aspirational flat-agent system that doesn't exist in code.

---

## 2. Goals

### 2.1 Primary Goal

Port the **agency-based architecture** from ARIA (Go) to TypeScript for Kiloclaw, implementing the full `Agency → Agent → Skill → Tools/MCP` hierarchy with:

- **4 initial agencies**: knowledge, development, nutrition, weather
- **Skill registry** with 30+ domain skills
- **19 search/academic providers** integrated natively
- **4-layer memory system**
- **Full isolation** from KiloCode (`kiloclaw` namespace, `~/.kiloclaw/` data dir)

### 2.2 Secondary Goals

- Replace Exa-only search with multi-provider search (Tavily, Brave, Perplexity, academic databases)
- Make specialized agents selectable in chat UI
- Implement tool governance and risk scoring
- Maintain strict backward compatibility with KiloCode flat agents

---

## 3. Functional Requirements

### 3.1 Agency Layer

| ID   | Requirement                                                                             | Priority |
| ---- | --------------------------------------------------------------------------------------- | -------- |
| F1.1 | `Agency` interface with lifecycle (Start/Stop/Pause/Resume)                             | MUST     |
| F1.2 | `AgencyCatalog` — central registry for agencies, agents, skills, tools, providers       | MUST     |
| F1.3 | `BootstrapDefaultCatalog()` — populates 4 initial agencies with their agents and skills | MUST     |
| F1.4 | Thread-safe registry (readers/writers)                                                  | MUST     |
| F1.5 | `AgencyName` enum: `knowledge`, `development`, `nutrition`, `weather`                   | MUST     |

### 3.2 Agent Layer

| ID   | Requirement                                                                 | Priority |
| ---- | --------------------------------------------------------------------------- | -------- |
| F2.1 | `Agent` interface with `Execute(task)`, `CanHandle(task)`, `Capabilities()` | MUST     |
| F2.2 | Agents scoped to agencies (not global)                                      | MUST     |
| F2.3 | Knowledge Agency agents: `researcher`, `educator`, `analyst`                | MUST     |
| F2.4 | Development Agency agents: `coder`, `code-reviewer`, `debugger`, `planner`  | MUST     |
| F2.5 | Nutrition Agency agents: `nutritionist`, `recipe-searcher`, `diet-planner`  | MUST     |
| F2.6 | Weather Agency agents: `weather-current`, `forecaster`, `alerter`           | MUST     |
| F2.7 | Agent routing based on task domain                                          | MUST     |

### 3.3 Skill Layer

| ID   | Requirement                                                                                         | Priority |
| ---- | --------------------------------------------------------------------------------------------------- | -------- |
| F3.1 | `Skill` interface with `Execute()`, `RequiredTools()`, `RequiredMCPs()`, `CanExecute()`             | MUST     |
| F3.2 | `SkillRegistry` with registration, lookup, `FindByTool()`, `FindByMCP()`                            | MUST     |
| F3.3 | Knowledge skills: `web-research`, `fact-check`, `summarization`, `data-analysis`, `academic-search` | MUST     |
| F3.4 | Development skills: `code-review`, `TDD`, `debugging`, `refactoring`                                | MUST     |
| F3.5 | Nutrition skills: `recipe-search`, `nutrition-analysis`, `diet-plan-generation`                     | MUST     |
| F3.6 | Weather skills: `weather-current`, `weather-forecast`, `weather-alerts`                             | MUST     |

### 3.4 Tools / Providers

| ID    | Requirement                                                   | Priority |
| ----- | ------------------------------------------------------------- | -------- |
| F4.1  | Tavily search provider (tavily-search, tavily-extract)        | MUST     |
| F4.2  | Brave search provider (brave-web-search, brave-news-search)   | MUST     |
| F4.3  | DuckDuckGo search provider                                    | MUST     |
| F4.4  | Wikipedia provider                                            | MUST     |
| F4.5  | Academic providers: PubMed, arXiv, Semantic Scholar, CrossRef | MUST     |
| F4.6  | News providers: NewsData, GNews                               | MUST     |
| F4.7  | Perplexity API integration (requires user auth)               | SHOULD   |
| F4.8  | USDA nutrition database                                       | MUST     |
| F4.9  | OpenFoodFacts                                                 | MUST     |
| F4.10 | Weather API                                                   | MUST     |
| F4.11 | Tool governance: risk scoring, audit trail                    | SHOULD   |

### 3.5 Memory Layer

| ID   | Requirement                                     | Priority |
| ---- | ----------------------------------------------- | -------- |
| F5.1 | Working Memory (minutes-hours TTL)              | MUST     |
| F5.2 | Episodic Memory (30-180 days)                   | MUST     |
| F5.3 | Semantic Memory (long-term knowledge)           | MUST     |
| F5.4 | Procedural Memory (versioned skills/procedures) | MUST     |
| F5.5 | Memory stores scoped to agency                  | MUST     |

### 3.6 CLI / UI Integration

| ID   | Requirement                                  | Priority |
| ---- | -------------------------------------------- | -------- |
| F6.1 | `/agency` command to list available agencies | MUST     |
| F6.2 | `/agent <name>` to invoke specific agent     | MUST     |
| F6.3 | Agency selector in VS Code chat UI           | MUST     |
| F6.4 | Skill discovery via `/skills` command        | MUST     |

### 3.7 Configuration

| ID   | Requirement                                          | Priority |
| ---- | ---------------------------------------------------- | -------- |
| F7.1 | `~/.kiloclaw/config.yaml` for agency config          | MUST     |
| F7.2 | `KILOCLAW_DATA_DIR` env var (default `~/.kiloclaw/`) | MUST     |
| F7.3 | `KILOCLAW_API_KEY` env var for provider auth         | SHOULD   |
| F7.4 | Provider enable/disable in config                    | MUST     |
| F7.5 | Agency enable/disable in config                      | MUST     |

---

## 4. Non-Functional Requirements

| ID  | Requirement                                                              |
| --- | ------------------------------------------------------------------------ |
| N1  | All agency code under `packages/opencode/src/kiloclaw/` namespace        |
| N2  | Strict isolation from KiloCode — no shared state without explicit bridge |
| N3  | TypeScript-first — no `any` types in agency contracts                    |
| N4  | Zod schemas for all input validation                                     |
| N5  | Async/await throughout — no callback patterns                            |
| N6  | Backward compatible with existing flat agents                            |
| N7  | Graceful degradation — if a provider fails, agency still functions       |

---

## 5. Directory Structure

```
packages/opencode/src/kiloclaw/
├── contracts/           # Type definitions (Agency, Agent, Task, Result, Skill, Event)
│   └── types.ts
├── agency/              # Agency implementations
│   ├── agency.ts        # Agency interface
│   ├── catalog.ts       # AgencyCatalog + BootstrapDefaultCatalog
│   ├── knowledge.ts     # Knowledge Agency
│   ├── development.ts   # Development Agency
│   ├── nutrition.ts     # Nutrition Agency
│   └── weather.ts       # Weather Agency
├── agent/               # Agent implementations
│   ├── base.ts          # BaseAgent abstract class
│   ├── knowledge/       # Knowledge agency agents
│   │   ├── researcher.ts
│   │   ├── educator.ts
│   │   └── analyst.ts
│   ├── development/     # Development agency agents
│   │   ├── coder.ts
│   │   ├── code-reviewer.ts
│   │   ├── debugger.ts
│   │   └── planner.ts
│   ├── nutrition/      # Nutrition agency agents
│   └── weather/        # Weather agency agents
├── skill/               # Skill implementations
│   ├── skill.ts         # Skill interface
│   ├── registry.ts      # DefaultSkillRegistry
│   ├── knowledge/       # Knowledge skills
│   │   ├── web-research.ts
│   │   ├── fact-check.ts
│   │   ├── summarization.ts
│   │   └── data-analysis.ts
│   ├── development/     # Development skills
│   │   ├── code-review.ts
│   │   ├── tdd.ts
│   │   ├── debugging.ts
│   │   └── refactoring.ts
│   ├── nutrition/       # Nutrition skills
│   └── weather/         # Weather skills
├── memory/              # 4-layer memory system
│   ├── memory.ts        # MemoryService interface
│   ├── working.ts       # Working memory
│   ├── episodic.ts      # Episodic memory
│   ├── semantic.ts      # Semantic memory
│   └── procedural.ts   # Procedural memory
├── tools/               # Tool implementations
│   ├── providers/       # Search/academic providers
│   │   ├── tavily.ts
│   │   ├── brave.ts
│   │   ├── ddg.ts
│   │   ├── wikipedia.ts
│   │   ├── pubmed.ts
│   │   ├── arxiv.ts
│   │   └── ...
│   └── domain/          # Domain tools (weather, nutrition)
├── core/                # Orchestrator, decision engine, planner
│   ├── orchestrator.ts
│   ├── decision-engine.ts
│   ├── planner.ts
│   ├── executor.ts
│   └── reviewer.ts
├── guardrail/           # Safety, risk scoring, audit
│   ├── guardrail.ts
│   ├── risk-scorer.ts
│   └── audit.ts
├── scheduler/           # Task scheduling
│   ├── scheduler.ts
│   ├── dispatcher.ts
│   └── worker.ts
└── config/              # Configuration loading
    └── config.ts
```

---

## 6. Dependencies

### 6.1 Existing Dependencies

- `zod` — input validation (already in use)
- `bun` — runtime (already in use)
- `@kilocode/plugin` — tool interface definitions

### 6.2 New Dependencies

| Package | Purpose             | Priority |
| ------- | ------------------- | -------- |
| `yaml`  | Config file parsing | MUST     |

### 6.3 External APIs (read-only, user must provide keys)

| API            | Env Var                  | Purpose                              |
| -------------- | ------------------------ | ------------------------------------ |
| Tavily         | `TAVILY_API_KEY`         | Web search                           |
| Brave          | `BRAVE_API_KEY`          | Web search                           |
| Perplexity     | `PERPLEXITY_API_KEY`     | AI web research (requires user auth) |
| PubMed/NCBI    | `PUBMED_API_KEY`         | Academic search                      |
| OpenWeatherMap | `OPENWEATHERMAP_API_KEY` | Weather data                         |
| USDA FoodData  | (free)                   | Nutrition database                   |
| OpenFoodFacts  | (free)                   | Product nutrition                    |

---

## 7. Out of Scope (v1)

- Creative Agency (wave 3)
- Personal Agency (wave 3)
- Analytics Agency (wave 3)
- Productivity Agency (wave 3)
- MCP server mode (agency as server for other clients)
- Multi-agent negotiation protocols
- Distributed agency deployment

---

## 8. Risks & Mitigations

| Risk                            | Likelihood | Impact | Mitigation                                                  |
| ------------------------------- | ---------- | ------ | ----------------------------------------------------------- |
| API key management complexity   | HIGH       | MEDIUM | Clear documentation, env var defaults, graceful degradation |
| Provider rate limits            | MEDIUM     | MEDIUM | Circuit breaker pattern, caching in memory layer            |
| Breaking KiloCode compatibility | LOW        | HIGH   | Strict namespace isolation, no shared state                 |
| Memory storage growth           | MEDIUM     | MEDIUM | TTL-based eviction, episodic memory auto-cleanup            |
| Too many parallel providers     | MEDIUM     | LOW    | Agency-scoped provider lists, user config                   |

---

## 9. Acceptance Criteria

| ID   | Criterion                                                          | Verification                  |
| ---- | ------------------------------------------------------------------ | ----------------------------- |
| AC1  | `/agency list` returns 4 agencies with descriptions                | Manual CLI test               |
| AC2  | `/agent researcher` routes to Knowledge Agency researcher          | Manual CLI test               |
| AC3  | Tavily search returns results via `web-research` skill             | Manual test with real query   |
| AC4  | Agency selector appears in VS Code chat UI                         | Visual verification           |
| AC5  | 4 memory layers store and retrieve data correctly                  | Unit tests                    |
| AC6  | Skill registry `FindByTool("tavily")` returns `web-research` skill | Unit test                     |
| AC7  | `~/.kiloclaw/config.yaml` loads without errors                     | Manual test with valid config |
| AC8  | Existing flat agents (`/code`, `/ask`) still work                  | Regression test               |
| AC9  | Graceful degradation when Tavily API key missing                   | Manual test                   |
| AC10 | TypeScript compilation passes with zero errors                     | `bun run typecheck`           |

---

## 10. References

- ARIA implementation: `/home/fulvio/coding/aria/internal/aria/`
- Blueprint: `docs/foundation/KILOCLAW_BLUEPRINT.md`
- Existing KiloCode agents: `packages/opencode/src/agent/agent.ts`
- Existing KiloCode skills: `packages/opencode/src/skill/skill.ts`

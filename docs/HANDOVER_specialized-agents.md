# KILOCLAW: Specialized Agents — Session Handover

**Created:** 2026-04-03T09:41:51+02:00  
**Status:** Ready for next session  
**Author:** AI Orchestrator (General Manager)

---

## Contesto dell'Architettura

Kiloclaw implementa un sistema agency-based estratto da ARIA (Go) e portato in TypeScript.

### Gerarchia (ORDINE INVERSO rispetto a quanto pensato inizialmente)

```
AGENCY (dominio/super-agency)
    ├── AGENTS (attori specializzati)
    │       ├── Possono appartenere a PIÙ AGENCIES (multi-agency)
    │       ├── Definiti da TASK e RESPONSABILITÀ specifiche
    │       └── Orchestrano SKILLS e usano TOOLS
    ├── SKILLS (competenze)
    │       ├── Derivano dai compiti dell'agency
    │       └── Usano PROVIDERS (API keys)
    └── PROVIDERS (API/Tavily, Firecrawl, Brave, etc.)
            └── Gestiti da KEY-POOL con rotation
```

### Agency = Dominio Organizzativo + Agenti + Skills

Un'agency NON è solo un contenitore — è un **dominio organizzativo** con:

- **Mandato**: cosa fa
- **Agenti**: chi la popola (e possono essere multi-agency)
- **Skills**: quali competenze fornisce
- **Providers**: quali API usa

---

## Agencies Implementate (Wave 1-2)

| Agency        | Dominio               | Agenti                                          | Skills                                                                                  |
| ------------- | --------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| `knowledge`   | Ricerca web/academica | **researcher**, educator, analyst               | web-research, fact-check, summarization, literature-review, academic-search             |
| `development` | Coding/Code review    | **coder**, code-reviewer, debugger, planner     | code-review, tdd, debugging, refactoring, simplification, document-analysis, comparison |
| `nutrition`   | Cibo/Dietetica        | **nutritionist**, recipe-searcher, diet-planner | recipe-search, nutrition-analysis, diet-plan, food-recall                               |
| `weather`     | Meteo                 | **weather-current**, forecaster, alerter        | weather-current, weather-forecast, weather-alerts                                       |

---

## Agenti: Definizione Formale

### Ogni Agente ha:

1. **AgencyOwner**: agency primaria di appartenenza
2. **AgencyCross**: lista di altre agencies in cui può lavorare (può essere vuoto)
3. **TaskTypes**: compiti specifici che può eseguire
4. **SkillsRequired**: skills necessarie per i suoi compiti
5. **Capabilities**: cosa sa fare (derivato da skills)

### Esempio — ResearcherAgent

```typescript
const ResearcherAgent = {
  id: "researcher",
  name: "Researcher",
  agencyOwner: "knowledge", // Agency PRIMARIA
  agencyCross: ["development"], // Può lavorare anche in DEVELOPMENT
  // (per ricercare best practices, documentazione)
  taskTypes: ["web-search", "academic-research", "fact-checking", "source-verification"],
  skills: ["web-research", "fact-check", "academic-search"],
  capabilities: ["search", "synthesis", "information_gathering"],
  description: "Agente di ricerca specializzato in ricerche web e accademiche",
}
```

### Esempio — CoderAgent

```typescript
const CoderAgent = {
  id: "coder",
  name: "Coder",
  agencyOwner: "development",
  agencyCross: ["knowledge"], // Può fare ricerche in KNOWLEDGE
  // (documentazione API, best practices)
  taskTypes: ["code-generation", "code-modification", "bug-fixing"],
  skills: ["code-generation", "debugging"],
  capabilities: ["coding", "debugging"],
  description: "Agente specializzato in generazione e modifica codice",
}
```

### Esempio — Multi-Agency: DietPlannerAgent

```typescript
const DietPlannerAgent = {
  id: "diet-planner",
  name: "Diet Planner",
  agencyOwner: "nutrition",
  agencyCross: ["knowledge", "weather"],  // 3 agencies!
                                             // - knowledge: ricerca nutrizionale
                                             // - weather: condizioni meteo
                                             //   influenzano dieta (es. freddo = più calorie)
  taskTypes: [
    "meal-planning",
    "diet-generation",
    "calorie-calculation"
  ],
  skills: ["diet-plan", "nutrition-analysis", "weather-current"],
  description: "Agente che pianifica diete basandosi su nutrizione,
                condizioni meteo e preferenze"
}
```

---

## Struttura Dati Proposta

```typescript
// packages/opencode/src/kiloclaw/agent/types.ts

export const AgentDefinition = z.object({
  id: AgentId,
  name: string,
  agencyOwner: AgencyName, // Agency PRIMARIA
  agencyCross: z.array(AgencyName), // Altre agencies (può essere vuoto)
  taskTypes: z.array(TaskType), // Compiti specifici
  skills: z.array(SkillName), // Skills richieste
  capabilities: z.array(string), // Capacità (derivato da skills)
  description: string,
  version: SemanticVersion,
})

// TaskType = compito atomico che un agente può fare
export const TaskType = z.enum([
  "web-search",
  "academic-research",
  "fact-checking",
  "code-generation",
  "code-review",
  "debugging",
  "meal-planning",
  "weather-query",
  // ... altri
])
```

---

## Flusso di Esecuzione

```
User Intent
    │
    ▼
┌─────────────────────────────────────┐
│        ORCHESTRATOR                 │
│  1. Classifica il task type        │
│  2. Seleziona agency appropriata     │
│  3. Seleziona agente (o multi-)    │
│  4. Delega a skills/providers       │
└─────────────────────────────────────┘
    │
    ▼
Task[ type: "web-search", agency: "knowledge" ]
    │
    ▼
┌─────────────────────────────────────┐
│  KNOWLEDGE AGENCY (dominio)        │
│                                     │
│  Agenti:                            │
│  ├── researcher (owner)             │
│  ├── educator (owner)               │
│  └── analyst (owner)                 │
│                                     │
│  Skills: web-research, fact-check   │
└─────────────────────────────────────┘
    │
    ▼
ResearcherAgent.execute(task)
    │
    ├── web-research (skill)
    │       │
    │       └── Tavily/Firecrawl/Brave providers
    │               │
    │               └── KeyPool (rotation)
    │
    └── fact-check (skill)
            └── Wikipedia/DDG providers
```

---

## Cosa Implementare

### 1. Agent Registry (`packages/opencode/src/kiloclaw/agency/agents/`)

```typescript
// Ogni agente come modulo separato
export const researcherAgent: Agent
export const coderAgent: Agent
export const nutritionistAgent: Agent
// etc.

// packages/opencode/src/kiloclaw/agency/agents/index.ts
export const agentRegistry: AgentRegistry
export function registerAgent(agent: AgentDefinition): void
export function getAgent(id: AgentId): AgentDefinition | undefined
export function listAgentsByAgency(agency: AgencyName): AgentDefinition[]
export function findAgentsForTask(taskType: TaskType): AgentDefinition[]
```

### 2. AgentFactory con Multi-Agency Support

```typescript
// Selector basato su task + agency
selectAgent(task: Task): Agent {
  // 1. Cerca agenti nella agency owner
  // 2. Verifica agencyCross (multi-agency)
  // 3. Match su taskTypes
  // 4. Fallback a agente generico
}
```

### 3. CLI Extension

```bash
kiloclaw agent list                    # Tutti gli agenti
kiloclaw agent list --agency=knowledge  # Filtra per agency
kiloclaw agent info researcher          # Dettagli agente
kiloclaw agent tasks researcher        # Task che può fare
```

### 4. Agenti Core da Implementare

| Agente            | Agency Owner | Agency Cross       | Task Types                                   |
| ----------------- | ------------ | ------------------ | -------------------------------------------- |
| `researcher`      | knowledge    | development        | web-search, academic-research, fact-checking |
| `educator`        | knowledge    | -                  | summarization, explanation                   |
| `analyst`         | knowledge    | development        | data-analysis, comparison                    |
| `coder`           | development  | knowledge          | code-generation, bug-fixing                  |
| `code-reviewer`   | development  | knowledge          | code-review, fact-checking                   |
| `debugger`        | development  | knowledge          | debugging, root-cause-analysis               |
| `planner`         | development  | -                  | task-planning, code-planning                 |
| `nutritionist`    | nutrition    | knowledge          | nutrition-analysis, food-analysis            |
| `recipe-searcher` | nutrition    | knowledge          | recipe-search                                |
| `diet-planner`    | nutrition    | knowledge, weather | meal-planning, diet-generation               |
| `weather-current` | weather      | nutrition          | weather-query, location-analysis             |
| `forecaster`      | weather      | -                  | weather-forecast                             |
| `alerter`         | weather      | -                  | weather-alerts, notifications                |

---

## Domande Aperte

1. **Multi-agency design**: un agente in `agencyCross` ha accesso completo a tutte le skills dell'altra agency o solo subset?

2. **Skill delegation**: se `researcher` (knowledge) lavora per `development`, può usare TUTTE le knowledge skills o solo quelle rilevanti per coding (es. `web-research` ma non `academic-search`)?

3. **Agent specializzati vs generalisti**: creare agenti iper-specializzati (es. "web-searcher") vs generalisti (es. "researcher" che fa tutto)?

4. **Nuove Agencies future** (Wave 3): creative, productivity, personal, analytics — come influenzano gli agenti esistenti?

5. **API Key isolation**: ogni agency/provider deve avere keys separate o condivise? (Attualmente TAVILY e FIRECRAWL sono entrambi in KNOWLEDGE)

---

## Stato Implementazione Attuale

### ✅ Completato

- [x] Agency layer (`AgencyCatalog`, `AgencyInfo`)
- [x] Skills system (18 skills)
- [x] KeyPool + KeyManager per API rotation
- [x] Provider Firecrawl (6 chiavi) + Tavily (8 chiavi)
- [x] CLI commands (`kiloclaw agency/skill/provider/keys`)
- [x] 4-layer memory system
- [x] Test suite (364 pass)
- [x] AgentDefinition types + schema (`packages/opencode/src/kiloclaw/agency/types.ts`)
- [x] AgentRegistry con multi-agency support
- [x] Specialized agents (13 agenti implementati):
  - ResearcherAgent (knowledge)
  - EducatorAgent (knowledge)
  - AnalystAgent (knowledge)
  - CoderAgent (development)
  - CodeReviewerAgent (development)
  - DebuggerAgent (development)
  - PlannerAgent (development)
  - NutritionistAgent (nutrition)
  - RecipeSearcherAgent (nutrition)
  - DietPlannerAgent (nutrition)
  - WeatherCurrentAgent (weather)
  - ForecasterAgent (weather)
  - AlerterAgent (weather)
- [x] AgentFactory per task-to-agent routing
- [x] CLI extension (`kiloclaw agent list/info/tasks`)

### 🔲 Da Implementare

- [ ] UI integration (VS Code chat agency selector)
- [ ] Integrazione agenti con skills (collegare agenti ai skills esistenti)
- [ ] Test per AgentRegistry e AgentFactory

---

## Riferimenti

| File                                                | Descrizione                   |
| --------------------------------------------------- | ----------------------------- |
| `docs/PRD.md`                                       | Product Requirements Document |
| `docs/TDD.md`                                       | Technical Design Document     |
| `packages/opencode/src/kiloclaw/agency/catalog.ts`  | Agency catalog + providers    |
| `packages/opencode/src/kiloclaw/agency/key-pool.ts` | API key rotation              |
| `packages/opencode/src/kiloclaw/agency/types.ts`    | Agent types + TaskType enum   |
| `packages/opencode/src/kiloclaw/agency/factory.ts`  | AgentFactory + routing        |
| `packages/opencode/src/kiloclaw/agency/agents/`     | Specialized agents (13)       |
| `packages/opencode/src/kiloclaw/skills/`            | Skills implementations        |
| `packages/opencode/src/kiloclaw/memory/`            | 4-layer memory system         |
| `/home/fulvio/coding/aria/internal/aria/agency/`    | ARIA reference (Go)           |
| `/home/fulvio/coding/aria/AGENTS.md`                | ARIA agents documentation     |

---

## Obiettivo Prossima Sessione

1. Integrare gli agenti con i skills esistenti:
   - ResearcherAgent → WebResearchSkill, FactCheckSkill
   - CoderAgent → TddSkill, DebuggingSkill
   - NutritionistAgent → NutritionAnalysisSkill, DietPlanSkill
   - WeatherCurrentAgent → WeatherCurrentSkill

2. Implementare UI integration (VS Code chat agency selector)

3. Aggiungere test per:
   - AgentRegistry
   - AgentFactory.selectAgent()
   - Agenti individuali

**Nota**: Gli agenti devono essere definiti dai loro **compiti** (task types) e dall'**organizzazione delle agencies sovra-stanti** — non sono semplici wrapper attorno a skills.

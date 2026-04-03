# Kiloclaw TDD — Technical Design Document

**Version:** 1.0  
**Date:** 2026-04-03  
**Status:** Draft  
**Parent:** `docs/PRD.md`

---

## 1. Overview

This document specifies the **TypeScript implementation design** for the agency-based agent system, ported from the ARIA Go reference. It covers:

1. Type definitions (Zod schemas + TypeScript interfaces)
2. Module architecture and file layout
3. API surface for each component
4. Integration points with existing KiloCode
5. Implementation patterns

**Design principle**: Mirror ARIA's Go architecture in TypeScript, using Zod for validation (instead of Go's native types), and Bun/BunFile for I/O (instead of Go's stdlib).

---

## 2. Contracts / Type Definitions

**File:** `packages/opencode/src/kiloclaw/contracts/types.ts`

### 2.1 Core Enums

```typescript
export const AgencyName = {
  knowledge: "knowledge",
  development: "development",
  nutrition: "nutrition",
  weather: "weather",
} as const
export type AgencyName = (typeof AgencyName)[keyof typeof AgencyName]

export const AgentName = {
  // Knowledge agency
  researcher: "researcher",
  educator: "educator",
  analyst: "analyst",
  // Development agency
  coder: "coder",
  codeReviewer: "code-reviewer",
  debugger: "debugger",
  planner: "planner",
  // Nutrition agency
  nutritionist: "nutritionist",
  recipeSearcher: "recipe-searcher",
  dietPlanner: "diet-planner",
  // Weather agency
  weatherCurrent: "weather-current",
  forecaster: "forecaster",
  alerter: "alerter",
} as const
export type AgentName = (typeof AgentName)[keyof typeof AgentName]

export const SkillName = {
  // Knowledge
  webResearch: "web-research",
  factCheck: "fact-check",
  summarization: "summarization",
  dataAnalysis: "data-analysis",
  academicSearch: "academic-search",
  // Development
  codeReview: "code-review",
  tdd: "tdd",
  debugging: "debugging",
  refactoring: "refactoring",
  // Nutrition
  recipeSearch: "recipe-search",
  nutritionAnalysis: "nutrition-analysis",
  dietPlanGeneration: "diet-plan-generation",
  foodRecallMonitoring: "food-recall-monitoring",
  mealPlanning: "meal-planning",
  // Weather
  weatherCurrent: "weather-current",
  weatherForecast: "weather-forecast",
  weatherAlerts: "weather-alerts",
} as const
export type SkillName = (typeof SkillName)[keyof typeof SkillName]
```

### 2.2 Task & Result

```typescript
import { z } from "zod"

export const TaskPriority = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
} as const
export type TaskPriority = (typeof TaskPriority)[keyof typeof TaskPriority]

export const TaskStatus = {
  pending: "pending",
  running: "running",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
} as const
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus]

export const TaskSchema = z.object({
  id: z.string().uuid(),
  agency: AgencyNameSchema,
  agent: AgentNameSchema.optional(),
  skill: SkillNameSchema.optional(),
  type: z.string(),
  description: z.string(),
  input: z.record(z.unknown()),
  priority: TaskPrioritySchema.default("medium"),
  status: TaskStatusSchema.default("pending"),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
  result: ResultSchema.optional(),
  error: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
})
export type Task = z.infer<typeof TaskSchema>

export const ResultSchema = z.object({
  success: z.boolean(),
  output: z.unknown(),
  artifacts: z
    .array(
      z.object({
        type: z.string(),
        uri: z.string(),
        metadata: z.record(z.unknown()).optional(),
      }),
    )
    .optional(),
  metrics: z
    .object({
      durationMs: z.number(),
      tokensUsed: z.number().optional(),
      providersUsed: z.array(z.string()).optional(),
    })
    .optional(),
  metadata: z.record(z.unknown()).optional(),
})
export type Result = z.infer<typeof ResultSchema>
```

### 2.3 Event & Feedback

```typescript
export const EventType = {
  taskCreated: "task:created",
  taskStarted: "task:started",
  taskCompleted: "task:completed",
  taskFailed: "task:failed",
  agentHeartbeat: "agent:heartbeat",
  skillExecuted: "skill:executed",
  toolInvoked: "tool:invoked",
  memoryStored: "memory:stored",
} as const
export type EventType = (typeof EventType)[keyof typeof EventType]

export const EventSchema = z.object({
  id: z.string().uuid(),
  type: EventTypeSchema,
  agency: AgencyNameSchema,
  agent: AgentNameSchema.optional(),
  taskId: z.string().uuid().optional(),
  timestamp: z.string().datetime(),
  payload: z.record(z.unknown()),
})
export type Event = z.infer<typeof EventSchema>

export const FeedbackSchema = z.object({
  taskId: z.string().uuid(),
  rating: z.number().min(1).max(5),
  comment: z.string().optional(),
  improvementSuggestions: z.array(z.string()).optional(),
})
export type Feedback = z.infer<typeof FeedbackSchema>
```

### 2.4 Capability

```typescript
export const CapabilitySchema = z.object({
  skill: SkillNameSchema,
  tools: z.array(z.string()),
  mcps: z.array(z.string()).optional(),
  description: z.string(),
  examples: z.array(z.string()).optional(),
})
export type Capability = z.infer<typeof CapabilitySchema>
```

---

## 3. Agency Module

**File:** `packages/opencode/src/kiloclaw/agency/agency.ts`

### 3.1 Agency Interface

```typescript
export interface Agency {
  readonly name: AgencyName
  readonly description: string
  readonly agents: AgentName[]
  readonly skills: SkillName[]
  readonly capabilities: Capability[]

  // Lifecycle
  start(): Promise<void>
  stop(): Promise<void>
  pause(): Promise<void>
  resume(): Promise<void>
  readonly status: AgencyStatus

  // Domain memory (4-layer)
  memory: MemoryService

  // Task execution
  execute(task: Task): Promise<Result>
  canHandle(task: Task): boolean

  // Event publishing
  events: EventBus
}

export type AgencyStatus = "starting" | "running" | "paused" | "stopped" | "error"

export interface EventBus {
  publish(event: Event): void
  subscribe(handler: (event: Event) => void): () => void
}
```

### 3.2 Agency State Machine

```
[none] --> starting --> running --> paused --> stopped
                      |         ^         |
                      |         |---------+
                      |                   |
                      +---------> error --+
```

---

## 4. Agency Catalog

**File:** `packages/opencode/src/kiloclaw/agency/catalog.ts`

### 4.1 Catalog Entry Types

```typescript
export const CatalogEntryType = {
  agency: "agency",
  agent: "agent",
  skill: "skill",
  tool: "tool",
  provider: "provider",
} as const
export type CatalogEntryType = (typeof CatalogEntryType)[keyof typeof CatalogEntryType]

export interface CatalogEntry<T = unknown> {
  type: CatalogEntryType
  name: string
  version: string
  description: string
  data: T
  enabled: boolean
  tags: string[]
}

export class AgencyCatalog {
  // Registration
  registerAgency(agency: Agency): void
  registerAgent(agent: Agent): void
  registerSkill(skill: Skill): void
  registerTool(tool: Tool): void
  registerProvider(name: string, provider: Provider): void

  // Queries
  getAgency(name: AgencyName): Agency | undefined
  getAgent(name: AgentName): Agent | undefined
  getSkill(name: SkillName): Skill | undefined
  getTool(name: string): Tool | undefined
  getProvider(name: string): Provider | undefined

  listAgencies(): AgencyName[]
  listAgents(agency?: AgencyName): AgentName[]
  listSkills(agency?: AgencyName): SkillName[]
  listProviders(agency?: AgencyName): string[]

  // Tool/MCP lookup
  findByTool(toolName: string): Skill | undefined
  findByMCP(mcpName: string): Skill | undefined

  // Enable/disable
  enable(entryType: CatalogEntryType, name: string): void
  disable(entryType: CatalogEntryType, name: string): void

  // Bootstrap
  bootstrapDefaultCatalog(): void
}
```

### 4.2 BootstrapDefaultCatalog

Populates the catalog with:

**Knowledge Agency**:

- Agents: researcher, educator, analyst
- Skills: web-research, fact-check, summarization, data-analysis, academic-search
- Providers: tavily, brave, ddg, wikipedia, pubmed, arxiv, semanticscholar, openalex, gdelt, wayback, jina, crossref, bgpt, newsdata, gnews

**Development Agency**:

- Agents: coder, code-reviewer, debugger, planner
- Skills: code-review, tdd, debugging, refactoring

**Nutrition Agency**:

- Agents: nutritionist, recipe-searcher, diet-planner
- Skills: recipe-search, nutrition-analysis, diet-plan-generation, food-recall-monitoring, meal-planning
- Providers: nutrition_usda, openfoodfacts, mealdb

**Weather Agency**:

- Agents: weather-current, forecaster, alerter
- Skills: weather-current, weather-forecast, weather-alerts
- Providers: openweathermap, weatherapi

---

## 5. Skill Module

**File:** `packages/opencode/src/kiloclaw/skill/skill.ts`

### 5.1 Skill Interface

```typescript
export interface Skill {
  readonly name: SkillName
  readonly description: string
  readonly agency: AgencyName
  readonly requiredTools: string[]
  readonly requiredMCPs: string[]
  readonly capabilities: Capability[]

  canExecute(context: ExecutionContext): boolean
  execute(context: ExecutionContext, input: unknown): Promise<SkillResult>
}

export interface ExecutionContext {
  task: Task
  agency: Agency
  agent: Agent
  memory: MemoryService
  tools: ToolRegistry
  events: EventBus
  config: AgencyConfig
}

export interface SkillResult {
  success: boolean
  output: unknown
  artifacts?: Artifact[]
  metrics?: SkillMetrics
}

export interface SkillMetrics {
  durationMs: number
  tokensUsed?: number
  providersUsed?: string[]
  cacheHits?: number
}
```

### 5.2 Skill Registry

```typescript
export class DefaultSkillRegistry implements SkillRegistry {
  private skills = new Map<SkillName, Skill>()
  private skillsByTool = new Map<string, SkillName>()
  private skillsByMCP = new Map<string, SkillName[]>()

  register(skill: Skill): void
  get(name: SkillName): Skill | undefined
  list(agency?: AgencyName): Skill[]
  findByTool(toolName: string): Skill | undefined
  findByMCP(mcpName: string): Skill[]
  canExecute(skillName: SkillName, context: ExecutionContext): boolean
}
```

---

## 6. Memory Module

**File:** `packages/opencode/src/kiloclaw/memory/memory.ts`

### 6.1 Memory Service Interface

```typescript
export interface MemoryService {
  // Working memory (minutes-hours)
  working: WorkingMemory

  // Episodic memory (30-180 days)
  episodic: EpisodicMemory

  // Semantic memory (long-term)
  semantic: SemanticMemory

  // Procedural memory (versioned skills)
  procedural: ProceduralMemory

  // Cross-layer queries
  search(query: MemoryQuery): Promise<MemoryResult[]>
  store(event: MemoryEvent): Promise<void>
  clear(agency: AgencyName): Promise<void>
}

export interface MemoryEntry {
  id: string
  agency: AgencyName
  layer: MemoryLayer
  key: string
  value: unknown
  createdAt: string
  expiresAt?: string
  tags: string[]
  metadata: Record<string, unknown>
}

export type MemoryLayer = "working" | "episodic" | "semantic" | "procedural"

export interface MemoryQuery {
  agency?: AgencyName
  layer?: MemoryLayer
  key?: string
  tags?: string[]
  text?: string // For semantic search
  limit?: number
  since?: string
}

export interface MemoryResult {
  entry: MemoryEntry
  score: number
  layer: MemoryLayer
}
```

### 6.2 Storage Backends

| Layer      | Storage                                                      | TTL       | Eviction   |
| ---------- | ------------------------------------------------------------ | --------- | ---------- |
| Working    | In-memory Map                                                | 1 hour    | LRU        |
| Episodic   | JSON file (`~/.kiloclaw/memory/episodic/`)                   | 90 days   | Time-based |
| Semantic   | JSON file (`~/.kilocraw/memory/semantic/`)                   | Permanent | Manual     |
| Procedural | Versioned JSON (`~/.kiloclaw/memory/procedural/v{version}/`) | Permanent | Versioned  |

---

## 7. Provider / Tool Implementations

**Files:**

- `packages/opencode/src/kiloclaw/tools/providers/tavily.ts`
- `packages/opencode/src/kiloclaw/tools/providers/brave.ts`
- `packages/opencode/src/kiloclaw/tools/providers/ddg.ts`
- `packages/opencode/src/kiloclaw/tools/providers/wikipedia.ts`
- `packages/opencode/src/kiloclaw/tools/providers/pubmed.ts`
- `packages/opencode/src/kiloclaw/tools/providers/arxiv.ts`
- `packages/opencode/src/kiloclaw/tools/providers/nutrition_usda.ts`
- `packages/opencode/src/kiloclaw/tools/providers/openfoodfacts.ts`
- `packages/opencode/src/kiloclaw/tools/providers/weather.ts`

### 7.1 Provider Interface

```typescript
export interface Provider {
  readonly name: string
  readonly agency: AgencyName
  readonly rateLimit: RateLimit

  search(query: SearchQuery): Promise<SearchResult[]>
  extract(urls: string[], query: string): Promise<ExtractedContent[]>
  health(): Promise<boolean>
}

export interface RateLimit {
  requestsPerMinute: number
  requestsPerDay: number
  concurrentRequests: number
}

export interface SearchQuery {
  query: string
  limit?: number
  domains?: string[]
  since?: string
  language?: string
}

export interface SearchResult {
  title: string
  url: string
  description: string
  publishedAt?: string
  provider: string
  score?: number
}

export interface ExtractedContent {
  url: string
  title: string
  content: string
  publishedAt?: string
}
```

### 7.2 Tavily Provider Implementation Pattern

```typescript
// Pattern for all providers
export class TavilyProvider implements Provider {
  readonly name = "tavily"
  readonly agency = "knowledge"
  readonly rateLimit = { requestsPerMinute: 15, requestsPerDay: 500, concurrentRequests: 3 }

  private apiKey: string

  constructor(config: { apiKey: string }) {
    this.apiKey = config.apiKey
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: query.query,
        search_depth: "basic",
        max_results: query.limit ?? 10,
      }),
    })

    if (!response.ok) {
      throw new Error(`Tavily API error: ${response.status}`)
    }

    const data = await response.json()
    return data.results.map((r: any) => ({
      title: r.title,
      url: r.url,
      description: r.content,
      publishedAt: r.published_date,
      provider: "tavily",
      score: r.score,
    }))
  }

  async extract(urls: string[], query: string): Promise<ExtractedContent[]> {
    const response = await fetch("https://api.tavily.com/extract", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ urls, query }),
    })

    const data = await response.json()
    return data.results.map((r: any) => ({
      url: r.url,
      title: r.title,
      content: r.raw_content,
      publishedAt: r.published_date,
    }))
  }

  async health(): Promise<boolean> {
    try {
      await this.search({ query: "health check", limit: 1 })
      return true
    } catch {
      return false
    }
  }
}
```

---

## 8. Agent Implementations

**Files:**

- `packages/opencode/src/kiloclaw/agent/base.ts`
- `packages/opencode/src/kiloclaw/agent/knowledge/researcher.ts`
- `packages/opencode/src/kiloclaw/agent/knowledge/educator.ts`
- `packages/opencode/src/kiloclaw/agent/knowledge/analyst.ts`
- `packages/opencode/src/kiloclaw/agent/development/coder.ts`
- etc.

### 8.1 Base Agent

```typescript
export abstract class BaseAgent implements Agent {
  abstract readonly name: AgentName
  abstract readonly agency: AgencyName
  abstract readonly description: string
  abstract readonly capabilities: Capability[]

  protected catalog: AgencyCatalog
  protected skillRegistry: DefaultSkillRegistry

  constructor(catalog: AgencyCatalog, skillRegistry: DefaultSkillRegistry) {
    this.catalog = catalog
    this.skillRegistry = skillRegistry
  }

  canHandle(task: Task): boolean {
    return task.agency === this.agency && this.capabilities.some((c) => c.skill === task.skill)
  }

  async execute(task: Task): Promise<Result> {
    const skill = task.skill ? this.skillRegistry.get(task.skill) : this.selectSkill(task)

    if (!skill) {
      return { success: false, output: null, error: "No suitable skill found" }
    }

    const context: ExecutionContext = {
      task,
      agency: this.catalog.getAgency(this.agency)!,
      agent: this,
      memory: this.getMemory(),
      tools: this.getToolRegistry(),
      events: this.getEventBus(),
      config: this.getConfig(),
    }

    if (!skill.canExecute(context)) {
      return { success: false, output: null, error: "Skill cannot execute in current context" }
    }

    return await skill.execute(context, task.input)
  }

  protected abstract selectSkill(task: Task): Skill | undefined
  protected abstract getMemory(): MemoryService
  protected abstract getToolRegistry(): ToolRegistry
  protected abstract getEventBus(): EventBus
  protected abstract getConfig(): AgencyConfig
}
```

### 8.2 Researcher Agent (Knowledge Agency)

```typescript
export class ResearcherAgent extends BaseAgent {
  readonly name = "researcher"
  readonly agency = "knowledge"
  readonly description = "Performs deep web research using multiple search providers"

  readonly capabilities: Capability[] = [
    {
      skill: "web-research",
      tools: ["tavily", "brave", "ddg", "wikipedia"],
      description: "Comprehensive web search across multiple providers",
      examples: ["Research quantum computing developments", "Find latest AI research papers"],
    },
    {
      skill: "academic-search",
      tools: ["pubmed", "arxiv", "semanticscholar", "crossref"],
      description: "Search academic databases for peer-reviewed research",
      examples: ["Find papers on machine learning in healthcare", "Search PubMed for COVID treatments"],
    },
  ]

  protected selectSkill(task: Task): Skill | undefined {
    if (task.type === "academic") {
      return this.skillRegistry.get("academic-search")
    }
    return this.skillRegistry.get("web-research")
  }
}
```

---

## 9. Core Orchestrator

**File:** `packages/opencode/src/kiloclaw/core/orchestrator.ts`

```typescript
export class Orchestrator {
  private catalog: AgencyCatalog
  private memory: MemoryService
  private guardrail: GuardrailService
  private scheduler: TaskScheduler

  async execute(task: Task): Promise<Result> {
    // 1. Risk check
    const riskLevel = await this.guardrail.assess(task)
    if (riskLevel === "blocked") {
      return { success: false, output: null, error: "Task blocked by guardrail" }
    }

    // 2. Select agency
    const agency = this.catalog.getAgency(task.agency)
    if (!agency) {
      return { success: false, output: null, error: `Unknown agency: ${task.agency}` }
    }

    // 3. Select agent (or use task.agent)
    const agentName = task.agent ?? this.selectAgent(task, agency)
    const agent = this.catalog.getAgent(agentName)
    if (!agent) {
      return { success: false, output: null, error: `Unknown agent: ${agentName}` }
    }

    // 4. Execute
    const result = await agency.execute(task)

    // 5. Store in episodic memory
    await this.memory.episodic.store({
      taskId: task.id,
      result,
      timestamp: new Date().toISOString(),
    })

    // 6. Publish completion event
    this.publishEvent(result.success ? "task:completed" : "task:failed", task, result)

    return result
  }

  private selectAgent(task: Task, agency: Agency): AgentName {
    // Decision logic: match task type to agent capabilities
    const agents = agency.agents.map((name) => this.catalog.getAgent(name)).filter((a) => a?.canHandle(task))

    return agents[0]?.name ?? "coder" // fallback
  }
}
```

---

## 10. Guardrail Service

**File:** `packages/opencode/src/kiloclaw/guardrail/guardrail.ts`

```typescript
export type RiskLevel = "low" | "medium" | "high" | "blocked"

export interface RiskAssessment {
  level: RiskLevel
  reasons: string[]
  suggestedMitigations: string[]
}

export class GuardrailService {
  private policies: Policy[]

  async assess(task: Task): Promise<RiskAssessment> {
    let level: RiskLevel = "low"
    const reasons: string[] = []
    const mitigations: string[] = []

    for (const policy of this.policies) {
      const result = await policy.evaluate(task)
      if (result.blocked) {
        return { level: "blocked", reasons: result.reasons, suggestedMitigations: result.mitigations }
      }
      if (result.level === "high") {
        level = "high"
        reasons.push(...result.reasons)
        mitigations.push(...result.mitigations)
      } else if (result.level === "medium" && level !== "high") {
        level = "medium"
      }
    }

    return { level, reasons, suggestedMitigations: mitigations }
  }
}

// Default policies:
// - RateLimitPolicy: max 10 tasks/minute per agency
// - ContentFilterPolicy: block PII requests
// - ToolWhitelistPolicy: only allow registered tools
// - BudgetPolicy: max API spend per day
```

---

## 11. Configuration

**File:** `packages/opencode/src/kiloclaw/config/config.ts`

```yaml
# ~/.kiloclaw/config.yaml structure
agencies:
  knowledge:
    enabled: true
    providers:
      tavily:
        enabled: true
        apiKey: ${TAVILY_API_KEY}
      brave:
        enabled: true
        apiKey: ${BRAVE_API_KEY}
      ddg:
        enabled: true
  development:
    enabled: true
  nutrition:
    enabled: true
    providers:
      usda:
        enabled: true
      openfoodfacts:
        enabled: true
  weather:
    enabled: true
    providers:
      openweathermap:
        enabled: true
        apiKey: ${OPENWEATHERMAP_API_KEY}

memory:
  working:
    maxEntries: 1000
    ttlMinutes: 60
  episodic:
    maxEntries: 10000
    ttlDays: 90
  semantic:
    maxEntries: 50000

guardrail:
  enabled: true
  maxTasksPerMinute: 10
  maxDailySpend: 10.0
  blockedTools: []

logging:
  level: info
  agencies: true
  tasks: true
```

---

## 12. Integration Points

### 12.1 Existing KiloCode Integration

The agency system **wraps** existing KiloCode flat agents:

```typescript
// packages/opencode/src/kiloclaw/bridge/kilocode-bridge.ts

export class KiloCodeBridge {
  // Wrap flat agent as skill under appropriate agency
  wrapAgent(name: string, agency: AgencyName): Skill {
    return {
      name: `${name}-skill` as SkillName,
      agency,
      execute: async (ctx, input) => {
        // Call original KiloCode agent
        return await this.kilocodeAgents[name].execute(input)
      },
    }
  }
}
```

### 12.2 CLI Integration

New commands in `packages/opencode/src/cli/cmd/agency.ts`:

```bash
kiloclaw agency list              # List all agencies
kiloclaw agency info <name>       # Show agency details
kiloclaw agent list [agency]      # List agents
kiloclaw agent info <name>        # Show agent details
kiloclaw skill list [agency]      # List skills
kiloclaw skill info <name>        # Show skill details
kiloclaw provider list [agency]   # List providers
kiloclaw provider health <name>   # Check provider status
```

### 12.3 VS Code Extension Integration

Agency selector in chat UI (`AgentManagerProvider.ts`):

```typescript
// Add agency分组 to chat participant
const agencyGroup = new AgencyChatParticipant("kiloclaw", {
  name: "Kiloclaw",
  description: "Multi-agency AI assistant",
  agencies: catalog.listAgencies(),
})
```

---

## 13. Error Handling

| Error Type                | Handling Strategy                           |
| ------------------------- | ------------------------------------------- |
| Provider timeout          | Circuit breaker, fallback to next provider  |
| Provider 429 (rate limit) | Exponential backoff, queue task             |
| Invalid API key           | Log error, disable provider, notify user    |
| Skill execution failure   | Log to episodic memory, return error result |
| Memory store failure      | Fall back to in-memory, retry on next write |
| Unknown agency            | Return error, suggest similar agency names  |

---

## 14. Testing Strategy

### 14.1 Unit Tests

- `catalog.test.ts`: Registration, lookup, bootstrap
- `skill-registry.test.ts`: Registration, FindByTool, FindByMCP
- `memory/*.test.ts`: Each memory layer CRUD + TTL
- `guardrail.test.ts`: Risk assessments
- `providers/*.test.ts`: Provider search, extract, health

### 14.2 Integration Tests

- `agency.test.ts`: Full task execution flow
- `orchestrator.test.ts`: Agency + agent selection, error handling

### 14.3 E2E Tests

- CLI agency commands
- VS Code agency selector

---

## 15. Implementation Phases

| Phase | Components                    | Files                                            |
| ----- | ----------------------------- | ------------------------------------------------ |
| 1     | Contracts, enums, Zod schemas | `contracts/types.ts`                             |
| 2     | Memory layer (all 4 types)    | `memory/*.ts`                                    |
| 3     | Skill interface + registry    | `skill/skill.ts`, `skill/registry.ts`            |
| 4     | Agency interface + catalog    | `agency/agency.ts`, `agency/catalog.ts`          |
| 5     | Tavily provider               | `tools/providers/tavily.ts`                      |
| 6     | Base agent + researcher       | `agent/base.ts`, `agent/knowledge/researcher.ts` |
| 7     | Knowledge agency bootstrap    | `agency/knowledge.ts`                            |
| 8     | Orchestrator                  | `core/orchestrator.ts`                           |
| 9     | CLI commands                  | `cli/cmd/agency.ts`                              |
| 10    | Remaining providers           | `tools/providers/*.ts`                           |
| 11    | Remaining agents              | `agent/**/*.ts`                                  |
| 12    | Guardrail                     | `guardrail/*.ts`                                 |
| 13    | VS Code integration           | `kilo-vscode/src/agent-manager/`                 |

---

## 16. Reference: ARIA Go Files to Port

| ARIA File                    | TSL Destination             |
| ---------------------------- | --------------------------- |
| `contracts/contracts.go`     | `contracts/types.ts`        |
| `agency/agency.go`           | `agency/agency.ts`          |
| `agency/catalog.go`          | `agency/catalog.ts`         |
| `skill/skill.go`             | `skill/skill.ts`            |
| `skill/registry.go`          | `skill/registry.ts`         |
| `memory/*.go`                | `memory/*.ts`               |
| `llm/tools/tavily.go`        | `tools/providers/tavily.ts` |
| `llm/tools/brave.go`         | `tools/providers/brave.ts`  |
| `llm/tools/ddg.go`           | `tools/providers/ddg.ts`    |
| `llm/tools/pubmed.go`        | `tools/providers/pubmed.ts` |
| `llm/tools/arxiv.go`         | `tools/providers/arxiv.ts`  |
| `agency/knowledge.go`        | `agency/knowledge.ts`       |
| `agency/knowledge_agents.go` | `agent/knowledge/*.ts`      |
| `core/orchestrator.go`       | `core/orchestrator.ts`      |
| `guardrail/*.go`             | `guardrail/*.ts`            |
| `scheduler/*.go`             | `scheduler/*.ts`            |

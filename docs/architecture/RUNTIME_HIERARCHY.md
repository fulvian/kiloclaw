# Runtime Hierarchy

> **Status**: Approved
> **Date**: 2026-04-02
> **Phase**: Core Runtime (Phase 2)

## Overview

Kiloclaw implements a 5-level hierarchical runtime architecture: **Core Orchestrator → Agency → Agent → Skill → Tool/MCP**

This hierarchy enforces clear separation of concerns between orchestration, domain coordination, and task execution, while supporting multiple agencies with isolated governance.

## Level 1: Core Orchestrator

The Core Orchestrator is the central nervous system that:

1. **Intent Routing**: Classifies incoming user intents and events, assigns to appropriate agency
2. **Policy Engine**: Enforces global policies (compliance, safety, privacy) before action
3. **Memory Broker**: Unifies access to 4-layer memory system across all agencies
4. **Scheduler**: Manages task scheduling, priority, and resource allocation
5. **Observability**: Centralized logging, audit trails, and correlation IDs

### Implementation

```typescript
// packages/opencode/src/kiloclaw/orchestrator.ts
export interface CoreOrchestrator {
  routeIntent(intent: Intent): Promise<AgencyAssignment>
  enforcePolicy(action: Action, context: PolicyContext): PolicyResult
  memory(): MemoryBroker
  scheduler(): Scheduler
  audit(): AuditLogger
}
```

## Level 2: Agency

An Agency coordinates a functional domain with limited operational autonomy:

- **Domain Focus**: Owns a specific domain (development, knowledge, nutrition, weather, custom)
- **Policy Compliance**: Operates within agency-specific policies derived from global policy
- **Agent Coordination**: Manages lifecycle of agents within its domain
- **Result Synthesis**: Aggregates results from multiple agents into coherent responses

### Implementation

```typescript
// packages/opencode/src/kiloclaw/agency.ts
export interface Agency {
  readonly id: AgencyId
  readonly domain: Domain
  readonly status: AgencyStatus
  start(): Promise<void>
  stop(): Promise<void>
  pause(): Promise<void>
  registerAgent(agent: Agent): void
  deregisterAgent(agentId: AgentId): void
  getAgents(): ReadonlyArray<Agent>
  executeTask(task: Task): Promise<TaskResult>
  synthesizeResults(results: AgentResult[]): Synthesis
}
```

### Supported Domains

| Domain        | Keywords                              | Use Case                   |
| ------------- | ------------------------------------- | -------------------------- |
| `development` | code, debug, test, build, deploy, git | Software development tasks |
| `knowledge`   | search, find, query, research         | Information retrieval      |
| `nutrition`   | food, diet, recipe, calories          | Dietary planning           |
| `weather`     | forecast, temperature, climate        | Weather queries            |
| `custom`      | user-defined                          | Custom domain handling     |

## Level 3: Agent

An Agent executes specialized tasks with declared capabilities and limits:

- **Specialization**: Fixed capability set defined at registration
- **Limit Declaration**: Explicit boundaries on what the agent can/cannot do
- **Task Execution**: Runs tasks within assigned skills
- **Evidence Collection**: Collects and reports evidence for verification

### Implementation

```typescript
// packages/opencode/src/kiloclaw/agent.ts
export interface Agent {
  readonly id: AgentId
  readonly agency: AgencyId
  readonly capabilities: CapabilitySet
  readonly limits: LimitSet
  execute(task: Task, context: ExecutionContext): Promise<ExecutionResult>
  getStatus(): AgentStatus
}
```

## Level 4: Skill

A Skill is a versioned, composable capability reusable across agents:

- **Versioned**: Immutable version identifier for audit and rollback
- **Composable**: Can be chained in pipelines
- **Declarative**: Input/output contracts defined explicitly
- **Registry**: Centralized registry for discovery and management

### Implementation

```typescript
// packages/opencode/src/kiloclaw/skill.ts
export interface Skill {
  readonly id: SkillId
  readonly version: SemanticVersion
  readonly name: string
  readonly inputSchema: JsonSchema
  readonly outputSchema: JsonSchema
  execute(input: unknown, context: SkillContext): Promise<unknown>
  readonly capabilities: string[]
  readonly tags: string[]
}
```

## Level 5: Tool/MCP

Tool/MCP is the external execution layer with permissioning and audit:

- **Permission Scope**: Read, Write, Execute, Network, External API
- **Audit Trail**: Every call logged with correlation ID
- **Fallback**: Graceful degradation when tools unavailable
- **MCP Compliance**: Support for Model Context Protocol integrations

### Implementation

```typescript
// packages/opencode/src/kiloclaw/tool.ts
export interface Tool {
  readonly id: ToolId
  readonly name: string
  readonly permissionScope: PermissionScope[]
  execute(input: unknown, permissions: PermissionSet): Promise<ToolResult>
  health(): Promise<ToolHealth>
}
```

## Supporting Components

### Dispatcher

Task dispatcher with priority queue and scheduling:

```typescript
// packages/opencode/src/kiloclaw/dispatcher.ts
export interface TaskDispatcher {
  enqueue(task: Task, correlationId: CorrelationId): void
  dequeue(): { task: Task; correlationId: CorrelationId } | undefined
  cancel(taskId: string): boolean
  pause(): void
  resume(): void
  getStats(): Dispatcher.Stats
}
```

### Registry

Central registry for skills and tools with capability metadata:

```typescript
// packages/opencode/src/kiloclaw/registry.ts
export interface Registry {
  registerSkill(skill: Skill): void
  unregisterSkill(skillId: SkillId): boolean
  getSkill(skillId: SkillId, version?: SemanticVersion): Skill | undefined
  listSkills(): Skill[]
  findSkillsByCapability(capability: string): Skill[]
  registerTool(tool: Tool): void
  unregisterTool(toolId: ToolId): boolean
  getTool(toolId: ToolId): Tool | undefined
  listTools(): Tool[]
  getStats(): Registry.Stats
}
```

### Router

Intent routing with domain classification:

```typescript
// packages/opencode/src/kiloclaw/router.ts
export interface IntentRouter {
  route(intent: Intent): Promise<Router.RoutingResult>
  registerDomainHandler(domain: Domain, handler: (intent: Intent) => Promise<AgencyId>): void
  unregisterDomainHandler(domain: Domain): void
}
```

### Config

Unified config loader with override hierarchy (global > agency > env):

```typescript
// packages/opencode/src/kiloclaw/config.ts
export interface ConfigLoader {
  config: Config.ConfigInfo
  getAgencyConfig(agencyId: string): Partial<Config.ConfigInfo>
  reload(): void
}
```

## Execution Cycle

```
[User/Event]
    → [Intent+Risk Scoring]
    → [Agency Routing (Core)]
    → [Agent Plan (Agency)]
    → [Skill Chain (Agent)]
    → [Tool/MCP Calls]
    → [Evidence Check]
    → [Policy Gate (Core)]
    → [Response/Action]
    → [Memory Writeback + Audit Log]
```

## Type System

Brand types ensure type safety at boundaries:

```typescript
// packages/opencode/src/kiloclaw/types.ts
export const AgencyId = z.string().brand<"AgencyId">()
export const AgentId = z.string().brand<"AgentId">()
export const SkillId = z.string().brand<"SkillId">()
export const ToolId = z.string().brand<"ToolId">()
export const CorrelationId = z.string().brand<"CorrelationId">()
```

## Contract Tests

See `packages/opencode/test/kiloclaw/runtime.test.ts` for full contract test coverage.

## References

- [ADR-001: Runtime Hierarchy](../adr/ADR-001_Runtime_Hierarchy.md)
- [Foundation Plan](../plans/KILOCLAW_FOUNDATION_PLAN.md) - Phase 2
- [Blueprint](../../foundation/KILOCLAW_BLUEPRINT.md)

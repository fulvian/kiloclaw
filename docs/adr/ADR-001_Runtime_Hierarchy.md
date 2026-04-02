# ADR-001: Runtime Hierarchy

> **Status**: Draft  
> **Date**: 2026-04-02  
> **Deciders**: Architect, Orchestrator

## Context

Kiloclaw requires a hierarchical runtime architecture that enforces clear separation of concerns between orchestration, domain coordination, and task execution. The system must support multiple agencies with isolated governance while sharing common infrastructure like memory and policy enforcement.

The architecture must support:

- Clear intent routing from user/events to appropriate agency
- Composable skills that can be chained across agencies
- Tool/MCP execution with permissioning and audit
- Dynamic guardrails and policy enforcement at each level

## Decision

Implement a 5-level hierarchy: **Core Orchestrator → Agency → Agent → Skill → Tool/MCP**

### Level 1: Core Orchestrator

The Core Orchestrator is the central nervous system that:

1. **Intent Routing**: Classifies incoming user intents and events, assigns to appropriate agency
2. **Policy Engine**: Enforces global policies (compliance, safety, privacy) before action
3. **Memory Broker**: Unifies access to 4-layer memory system across all agencies
4. **Scheduler**: Manages task scheduling, priority, and resource allocation
5. **Observability**: Centralized logging, audit trails, and correlation IDs

```typescript
interface CoreOrchestrator {
  // Intent classification and agency routing
  routeIntent(intent: Intent): Promise<AgencyAssignment>

  // Policy enforcement gate
  enforcePolicy(action: Action, context: PolicyContext): PolicyResult

  // Memory access unified
  memory(): MemoryBroker

  // Task scheduling
  scheduler(): Scheduler

  // Audit and observability
  audit(): AuditLogger
}
```

### Level 2: Agency

An Agency coordinates a functional domain with limited operational autonomy:

- **Domain Focus**: Owns a specific domain (development, knowledge, nutrition, weather)
- **Policy Compliance**: Operates within agency-specific policies derived from global policy
- **Agent Coordination**: Manages lifecycle of agents within its domain
- **Result Synthesis**: Aggregates results from multiple agents into coherent responses

```typescript
interface Agency {
  readonly id: AgencyId
  readonly domain: Domain
  readonly status: AgencyStatus

  // Lifecycle
  start(): Promise<void>
  stop(): Promise<void>
  pause(): Promise<void>

  // Agent management
  registerAgent(agent: Agent): void
  deregisterAgent(agentId: AgentId): void
  getAgents(): ReadonlyArray<Agent>

  // Execution
  executeTask(task: Task): Promise<TaskResult>
  synthesizeResults(results: AgentResult[]): Synthesis
}
```

### Level 3: Agent

An Agent executes specialized tasks with declared capabilities and limits:

- **Specialization**: Fixed capability set defined at registration
- **Limit Declaration**: Explicit boundaries on what the agent can/cannot do
- **Task Execution**: Runs tasks within assigned skills
- **Evidence Collection**: Collects and reports evidence for verification

```typescript
interface Agent {
  readonly id: AgentId
  readonly agency: AgencyId
  readonly capabilities: CapabilitySet
  readonly limits: LimitSet

  // Execute a task using skills
  execute(task: Task, context: ExecutionContext): Promise<ExecutionResult>

  // Report capabilities and status
  getStatus(): AgentStatus
}
```

### Level 4: Skill

A Skill is a versioned, composable capability reusable across agents:

- **Versioned**: Immutable version identifier for audit and rollback
- **Composable**: Can be chained in pipelines
- **Declarative**: Input/output contracts defined explicitly
- **Registry**: Centralized registry for discovery and management

```typescript
interface Skill {
  readonly id: SkillId
  readonly version: SemanticVersion
  readonly name: string

  // Input/output contracts
  readonly inputSchema: JsonSchema
  readonly outputSchema: JsonSchema

  // Execution
  execute(input: unknown, context: SkillContext): Promise<unknown>

  // Metadata
  readonly capabilities: string[]
  readonly tags: string[]
}
```

### Level 5: Tool/MCP

Tool/MCP is the external execution layer with permissioning and audit:

- **Permission Scope**: Read, Write, Execute, Network, External API
- **Audit Trail**: Every call logged with correlation ID
- **Fallback**: Graceful degradation when tools unavailable
- **MCP Compliance**: Support for Model Context Protocol integrations

```typescript
interface Tool {
  readonly id: ToolId
  readonly name: string
  readonly permissionScope: PermissionScope[]

  // Execute with permission check
  execute(input: unknown, permissions: PermissionSet): Promise<ToolResult>

  // Health and availability
  health(): Promise<ToolHealth>
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

## Consequences

### Positive

- Clear separation of concerns enables independent agency evolution
- Policy enforcement at Core level ensures global consistency
- Skills become reusable across agencies, reducing duplication
- Audit trail spans entire hierarchy with correlation IDs

### Negative

- Additional latency from policy gates at each level
- Complexity in cross-agency skill composition
- Need for robust error propagation across boundaries

### Mitigations

- Policy caching for repeated actions
- Async execution where possible
- Circuit breakers for failing components

## References

- KILOCLAW_BLUEPRINT.md Section 3
- KILOCLAW_FOUNDATION_PLAN.md Phase 2 (Core Runtime)

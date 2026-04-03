# Kiloclaw: Flexible Agency Architecture Plan

**Created:** 2026-04-03T11:37:48+02:00  
**Status:** Draft - Pending Review  
**Type:** Architecture Refactoring

---

## Context

After implementing the initial specialized agents system (as per HANDOVER_specialized-agents.md), concerns were raised about architectural rigidity:

### Current Problems Identified

1. **TaskType is a closed enum** - Adding new tasks requires code changes + recompilation
2. **SkillName is a closed enum** - Same rigidity issue
3. **Static string mapping** - Agent → Skills via string arrays, no dynamic discovery
4. **No capability descriptors** - "web-search" is just a string, no metadata
5. **Rigid hierarchy** - TaskType → SkillName → Skill.execute() is one-way and inflexible

### Research Findings

From research on industry patterns (CrewAI, LangChain, AWS Agentic AI, MCP):

| Pattern                      | Description                                            |
| ---------------------------- | ------------------------------------------------------ |
| **Horizontal Multi-Agent**   | Agents of equal rank collaborate (Researcher + Writer) |
| **Vertical Multi-Agent**     | Hierarchical delegation (Supervisor → Specialist)      |
| **Capability-Based Routing** | Agents/skills matched by capabilities, not fixed types |
| **Skill Composition**        | Skills chain together dynamically                      |

Key insight from AWS: **Agencies serve as governance boundaries with policies, not rigid containers**.

---

## Goals

1. Replace closed enums with flexible, extensible types
2. Implement capability-based routing instead of TaskType matching
3. Enable skill composition (pipelines)
4. Support runtime registration of new skills/agents
5. Maintain backwards compatibility during migration

---

## Architecture Overview

### Proposed Layer Hierarchy

```
Intent (natural language)
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│                 KILOCLAW CORE ORCHESTRATOR                  │
│  Intent Classifier │ Capability Router │ Policy Engine    │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│                      AGENCIES                               │
│  Governance boundaries with:                               │
│  - Policies (allowed/denied capabilities)                  │
│  - Providers (API keys, rate limits)                       │
│  - Domain context                                          │
│  - Audit trail                                             │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│                    AGENTS                                   │
│  Capability bundles that:                                   │
│  - Can belong to multiple agencies (cross-agency)          │
│  - Declare capabilities (not rigid task types)              │
│  - Use skills dynamically based on context                  │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│                  SKILL REGISTRY (Dynamic)                  │
│  Versioned capabilities with:                              │
│  - Input/output schemas (JSON Schema)                       │
│  - Capability tags (flexible strings)                       │
│  - Composition support (chains)                            │
│  - Runtime registration                                     │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│                    TOOL/MCP LAYER                          │
│  Tavily │ Brave │ Firecrawl │ USDA │ OpenWeatherMap │ MCP │
└─────────────────────────────────────────────────────────────┘
```

---

## Type Definitions

### 1. TaskIntent (instead of TaskType enum)

```typescript
// Flexible task intent with schema validation
const TaskIntent = z.object({
  intent: z.string(), // "search", "analyze", "generate", ANY
  parameters: z.record(z.unknown()), // Dynamic parameters
  context: z.object({
    domain: z.string().optional(), // Agency domain context
    urgency: z.enum(["low", "medium", "high"]).optional(),
    preferences: z.record(z.unknown()).optional(),
    correlationId: z.string().optional(),
  }),
})
```

### 2. AgencyDefinition (Flexible Governance)

```typescript
const AgencyDefinition = z.object({
  id: AgencyId,
  name: z.string(),

  // Flexible domain - any string, not just enum
  domain: z.string(), // "knowledge", "development", "nutrition", "custom"

  // Governance policies
  policies: z.object({
    allowedCapabilities: z.array(z.string()), // What this agency allows
    deniedCapabilities: z.array(z.string()), // What this agency denies
    maxRetries: z.number(),
    requiresApproval: z.boolean(),
    dataClassification: z.enum(["public", "internal", "confidential", "restricted"]),
  }),

  // Provider ownership
  providers: z.array(z.string()), // Provider IDs (e.g., ["tavily", "firecrawl"])

  // Extensible metadata
  metadata: z.record(z.unknown()),
})
```

### 3. SkillDefinition (Versioned Capability)

```typescript
const SkillDefinition = z.object({
  id: SkillId,
  name: z.string(),
  version: SemanticVersion,
  description: z.string(),

  // JSON Schema for validation
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,

  // FLEXIBLE capability tags
  capabilities: z.array(z.string()),         // ["search", "web", "information_retrieval"]
  tags: z.array(z.string()),               // ["knowledge", "research"]

  // Optional dependencies
  requires: z.array(z.string()).optional(),        // Other skill IDs needed
  providesContext: z.array(z.string()).optional(),

  // Execution
  execute(input: unknown, context: SkillContext): Promise<unknown>
})
```

### 4. AgentDefinition (Capability Bundle)

```typescript
const AgentDefinition = z.object({
  id: AgentId,
  name: z.string(),

  // Agency membership (flexible)
  primaryAgency: z.string(), // Agency ID
  secondaryAgencies: z.array(z.string()), // Cross-agency membership

  // Capabilities - FLEXIBLE (instead of taskTypes)
  capabilities: z.array(z.string()), // ["coding", "debugging", "review"]
  skills: z.array(z.string()), // Skill IDs this agent can use

  // Constraints
  constraints: z.object({
    maxConcurrentTasks: z.number().optional(),
    timeoutMs: z.number().optional(),
    allowedDomains: z.array(z.string()).optional(),
  }),

  version: SemanticVersion,
})
```

### 5. SkillChain (Composition)

```typescript
const SkillChain = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),

  steps: z.array(
    z.object({
      skillId: z.string(),
      inputTransform: z.function().optional(), // Transform previous output
      outputTransform: z.function().optional(), // Prepare for next step
      condition: z.string().optional(), // When to execute this step
    }),
  ),

  outputSchema: JsonSchema,
  version: SemanticVersion,
})
```

---

## Routing Architecture

### CapabilityRouter (instead of TaskType router)

```typescript
class CapabilityRouter {
  // Find skills matching required capabilities
  findSkillsForCapabilities(required: string[]): SkillDefinition[]

  // Find agents with required capabilities
  findAgentsForCapabilities(required: string[], agency?: string): AgentDefinition[]

  // Compose skill chain if single skill insufficient
  composeChain(taskIntent: TaskIntent): SkillChain | SkillDefinition

  // Match score for ranking
  matchScore(agent: AgentDefinition, required: string[]): number
}
```

### Routing Algorithm

```typescript
function routeTask(taskIntent: TaskIntent, agency?: string): RouteResult {
  // 1. Find all skills matching intent capabilities
  const matchingSkills = capabilityRouter.findSkillsForCapabilities(extractCapabilities(taskIntent.intent))

  // 2. If single skill sufficient, return it
  if (matchingSkills.length === 1) {
    return { type: "skill", skill: matchingSkills[0] }
  }

  // 3. Try to compose chain
  const chain = capabilityRouter.composeChain(taskIntent)
  if (chain) {
    return { type: "chain", chain }
  }

  // 4. Find best agent for multi-skill task
  const agents = capabilityRouter.findAgentsForCapabilities(extractCapabilities(taskIntent.intent), agency)

  return { type: "agent", agent: agents[0] }
}
```

---

## Migration Path

### Phase 1: Add Capability Tags (Non-Breaking)

- Add `capabilities: string[]` to existing SkillDefinition
- Keep TaskType enum but mark as deprecated
- Add `CapabilityRouter` alongside existing router

### Phase 2: Make TaskType Flexible (Gradual)

- Replace `z.enum([...])` with `z.string()` + validation
- Maintain backwards compat via type coercion
- Add deprecation warnings

### Phase 3: Implement Skill Chains

- Create `SkillChainRegistry`
- Add composition logic to router
- Update CLI to show capabilities

### Phase 4: Runtime Registration

- Add `registerSkill()`, `registerAgent()`, `registerAgency()`
- Support YAML/JSON configuration files
- Add migration commands to CLI

### Phase 5: Legacy Removal (Optional)

- Remove deprecated TaskType enum
- Full flexible routing

---

## File Structure Changes

```
packages/opencode/src/kiloclaw/
├── agency/
│   ├── catalog.ts           # Keep
│   ├── key-pool.ts          # Keep
│   ├── index.ts             # Update exports
│   ├── types.ts             # REFACTOR: Add flexible types
│   │
│   ├── registry/            # NEW: Dynamic registries
│   │   ├── skill-registry.ts
│   │   ├── agent-registry.ts
│   │   ├── agency-registry.ts
│   │   └── chain-registry.ts
│   │
│   ├── routing/             # NEW: Capability routing
│   │   ├── capability-router.ts
│   │   ├── intent-classifier.ts
│   │   └── chain-composer.ts
│   │
│   └── agents/              # Keep existing agents, update types
│       ├── researcher.ts
│       ├── coder.ts
│       └── ...
│
├── skills/                  # Keep, add capability tags
│   ├── knowledge/
│   │   └── web-research.ts
│   └── ...
│
└── cli/cmd/
    └── kiloclaw.ts         # Update agent commands
```

---

## Backwards Compatibility

### Legacy Types (Deprecated)

```typescript
// @deprecated - Use TaskIntent instead
const LegacyTaskType = z.enum([...])

// Still works but logs deprecation warning
function legacyRouter(task: LegacyTaskType): Agent { ... }
```

### Migration Helper

```typescript
// Convert legacy task to new intent
function migrateTaskType(taskType: string): TaskIntent {
  const mapping = {
    "web-search": { intent: "search", capabilities: ["search", "web"] },
    "academic-research": { intent: "research", capabilities: ["academic", "search"] },
    // ...
  }
  return mapping[taskType] || { intent: taskType, capabilities: [] }
}
```

---

## Open Questions

1. **Do we keep TaskType enum for backwards compatibility?** (Recommended: Yes, deprecated)

2. **Should Agency domain be any string or stay as enum?** (Recommended: Any string)

3. **How do we handle skill version evolution?** (Recommended: Semver + schema migration)

4. **Should we adopt MCP for tool integration?** (Recommended: Yes, emerging standard)

5. **Who owns skill chain composition?** Agent? Orchestrator? User? (Recommended: Orchestrator with Agent input)

6. **How do we validate capability matching?** (Recommended: Score-based with threshold)

---

## References

| Source         | Key Insight                                                               |
| -------------- | ------------------------------------------------------------------------- |
| CrewAI Docs    | Agents = Role + Goal + Backstory + Tools; Tasks have context/dependencies |
| AWS Agentic AI | Agencies = governance boundaries; Multi-agent collaboration patterns      |
| LangChain      | Built on LangGraph for durability; Composition over rigid hierarchies     |
| MCP            | USB-C for AI; Standardized tool integration                               |

---

## Next Steps

1. Review and approve this architecture plan
2. Create detailed implementation spec (TDD)
3. Implement Phase 1: Add capability tags to existing skills
4. Implement Phase 2: Add CapabilityRouter
5. Test with existing agent workflows
6. Iterate based on real usage

---

**Author:** AI Orchestrator (General Manager)  
**Reviewers:** Pending

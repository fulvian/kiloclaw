# Technical Design Document: Flexible Agency Architecture

**Project:** Kiloclaw Flexible Agency Architecture  
**Document Type:** Test-Driven Development Specification  
**Status:** Draft  
**Created:** 2026-04-03  
**Author:** Architect Subagent

---

## 1. Overview

### 1.1 Project Summary

This TDD specifies the implementation of a capability-based routing system that replaces closed enums (`TaskType`, `SkillName`) with flexible, extensible types. The architecture enables runtime registration of skills, agents, and agencies while maintaining backwards compatibility.

### 1.2 Architecture Summary

The system uses a layered architecture: **Intent → Capability Router → Agency Policy Gate → Skill Chain Execution → Tool/MCP Layer**. Routing is based on capability matching rather than fixed task type enumeration.

### 1.3 Technology Stack

| Layer      | Technology    | Version | Rationale                           |
| ---------- | ------------- | ------- | ----------------------------------- |
| Language   | TypeScript    | 5.x     | Type safety, existing codebase      |
| Validation | Zod           | 3.x     | Schema validation, existing pattern |
| Registry   | In-memory Map | -       | Runtime registration support        |
| Logging    | Log (custom)  | -       | Existing logging infrastructure     |

---

## 2. Type Definitions

### 2.1 TaskIntent (Replaces TaskType Enum)

```typescript
// File: packages/opencode/src/kiloclaw/agency/routing/types.ts

export const TaskIntentSchema = z.object({
  intent: z.string().min(1), // "search", "analyze", "generate", ANY string
  parameters: z.record(z.string(), z.unknown()).default({}),
  context: z
    .object({
      domain: z.string().optional(), // Agency domain context
      urgency: z.enum(["low", "medium", "high"]).default("medium"),
      preferences: z.record(z.string(), z.unknown()).optional(),
      correlationId: z.string().optional(),
    })
    .default({}),
})

export type TaskIntent = z.infer<typeof TaskIntentSchema>
```

### 2.2 SkillDefinition (Versioned Capability)

```typescript
export const SkillDefinitionSchema = z.object({
  id: z.string().min(1), // Unique skill identifier
  name: z.string().min(1), // Human-readable name
  version: SemanticVersion, // e.g., "1.2.3"
  description: z.string(),

  // JSON Schema for validation
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,

  // FLEXIBLE capability tags
  capabilities: z.array(z.string()).min(1), // ["search", "web", "information_retrieval"]
  tags: z.array(z.string()).default([]), // ["knowledge", "research"]

  // Optional dependencies
  requires: z.array(z.string()).optional(), // Other skill IDs needed
  providesContext: z.array(z.string()).optional(),

  // Execution
  execute: z.function().optional(), // Skip for interface-only definitions
})

export type SkillDefinition = z.infer<typeof SkillDefinitionSchema>
```

### 2.3 SkillChain (Composition)

```typescript
export const SkillChainStepSchema = z.object({
  skillId: z.string(),
  inputTransform: z.string().optional(), // JS expression for transform
  outputTransform: z.string().optional(), // JS expression for transform
  condition: z.string().optional(), // When to execute this step
})

export const SkillChainSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(""),

  steps: z.array(SkillChainStepSchema).min(1),

  outputSchema: JsonSchema,
  version: SemanticVersion,
})

export type SkillChain = z.infer<typeof SkillChainSchema>
```

### 2.4 AgencyDefinition (Flexible Governance)

```typescript
export const AgencyPoliciesSchema = z.object({
  allowedCapabilities: z.array(z.string()).default([]),
  deniedCapabilities: z.array(z.string()).default([]),
  maxRetries: z.number().int().nonnegative().default(3),
  requiresApproval: z.boolean().default(false),
  dataClassification: z.enum(["public", "internal", "confidential", "restricted"]).default("internal"),
})

export const AgencyDefinitionSchema = z.object({
  id: AgencyId,
  name: z.string(),
  domain: z.string(), // "knowledge", "development", "nutrition", "custom:anything"

  policies: AgencyPoliciesSchema,

  providers: z.array(z.string()).default([]), // Provider IDs

  metadata: z.record(z.unknown()).default({}),
})

export type AgencyDefinition = z.infer<typeof AgencyDefinitionSchema>
```

### 2.5 AgentDefinition (Capability Bundle)

```typescript
export const AgentConstraintsSchema = z.object({
  maxConcurrentTasks: z.number().int().positive().optional(),
  timeoutMs: Duration.optional(),
  allowedDomains: z.array(z.string()).optional(),
})

export const AgentDefinitionSchema = z.object({
  id: AgentId,
  name: z.string(),

  primaryAgency: z.string(), // Agency ID
  secondaryAgencies: z.array(z.string()).default([]),

  capabilities: z.array(z.string()).min(1), // ["coding", "debugging", "review"]
  skills: z.array(z.string()).default([]), // Skill IDs this agent can use

  constraints: AgentConstraintsSchema.default({}),

  version: SemanticVersion,
})

export type AgentDefinition = z.infer<typeof AgentDefinitionSchema>
```

### 2.6 RouteResult

```typescript
export const RouteResultSchema = z.object({
  type: z.enum(["skill", "chain", "agent"]),
  skill: SkillDefinitionSchema.optional(),
  chain: SkillChainSchema.optional(),
  agent: AgentDefinitionSchema.optional(),
  confidence: z.number().min(0).max(1),
  reason: z.string().optional(),
})

export type RouteResult = z.infer<typeof RouteResultSchema>
```

---

## 3. CapabilityRouter Class

### 3.1 Class Specification

```typescript
// File: packages/opencode/src/kiloclaw/agency/routing/capability-router.ts

export class CapabilityRouter {
  private skillRegistry: SkillRegistry
  private agentRegistry: AgentRegistry
  private chainRegistry: ChainRegistry

  constructor(skillRegistry: SkillRegistry, agentRegistry: AgentRegistry, chainRegistry: ChainRegistry)

  findSkillsForCapabilities(required: string[]): SkillDefinition[]
  findAgentsForCapabilities(required: string[], agency?: string): AgentDefinition[]
  composeChain(taskIntent: TaskIntent): SkillChain | SkillDefinition | null
  matchScore(agent: AgentDefinition, required: string[]): number
  routeTask(taskIntent: TaskIntent, agency?: string): RouteResult
}
```

### 3.2 Matching Algorithm

```typescript
function matchScore(skill: SkillDefinition, required: string[]): number {
  const matched = skill.capabilities.filter((cap) => required.includes(cap))
  return matched.length / required.length
}

function findBestSkill(skills: SkillDefinition[], required: string[]): SkillDefinition | null {
  const scored = skills.map((s) => ({ skill: s, score: matchScore(s, required) }))
  scored.sort((a, b) => b.score - a.score)
  return scored[0]?.score >= 0.5 ? scored[0].skill : null
}
```

---

## 4. Registry Specifications

### 4.1 SkillRegistry

```typescript
// File: packages/opencode/src/kiloclaw/agency/registry/skill-registry.ts

export class SkillRegistry {
  private skills = new Map<SkillId, SkillDefinition>()
  private capabilitiesIndex = new Map<string, Set<SkillId>>()

  register(skill: SkillDefinition): void
  get(id: SkillId): SkillDefinition | undefined
  list(): SkillDefinition[]
  findByCapabilities(capabilities: string[]): SkillDefinition[]
  findByTag(tag: string): SkillDefinition[]
  remove(id: SkillId): boolean
}
```

### 4.2 FlexibleAgentRegistry (Replaces Legacy AgentRegistry)

```typescript
// File: packages/opencode/src/kiloclaw/agency/registry/agent-registry.ts
// NOTE: Named FlexibleAgentRegistry to avoid conflict with deprecated legacy AgentRegistry

/**
 * @deprecated Legacy AgentRegistry in "./types.ts" is deprecated.
 * Use FlexibleAgentRegistry for new code.
 * Migration: See migration guide in Section 9.
 */

export namespace FlexibleAgentRegistry {
  // Capability-based agent registration and lookup
  // Replaces TaskType-based legacy AgentRegistry

  export function register(agent: FlexibleAgentDefinition): void
  export function unregister(agentId: AgentId): boolean
  export function get(agentId: AgentId): FlexibleAgentDefinition | undefined
  export function list(): FlexibleAgentDefinition[]
  export function findByCapabilities(capabilities: string[]): FlexibleAgentDefinition[]
  export function getAgentsByAgency(agencyId: string): FlexibleAgentDefinition[]
  export function clear(): void
}
```

### 4.3 AgencyRegistry

```typescript
// File: packages/opencode/src/kiloclaw/agency/registry/agency-registry.ts

export class AgencyRegistry {
  private agencies = new Map<AgencyId, AgencyDefinition>()
  private domainIndex = new Map<string, AgencyId>()

  register(agency: AgencyDefinition): void
  get(id: AgencyId): AgencyDefinition | undefined
  getByDomain(domain: string): AgencyDefinition | undefined
  list(): AgencyDefinition[]
  remove(id: AgencyId): boolean
}
```

### 4.4 ChainRegistry

```typescript
// File: packages/opencode/src/kiloclaw/agency/registry/chain-registry.ts

export class ChainRegistry {
  private chains = new Map<string, SkillChain>()
  private capabilitiesIndex = new Map<string, Set<string>>()

  register(chain: SkillChain): void
  get(id: string): SkillChain | undefined
  list(): SkillChain[]
  findByCapabilities(capabilities: string[]): SkillChain[]
  remove(id: string): boolean
}
```

---

## 5. Intent Classifier

### 5.1 Specification

```typescript
// File: packages/opencode/src/kiloclaw/agency/routing/intent-classifier.ts

export class IntentClassifier {
  constructor()

  classify(input: string | TaskIntent): TaskIntent
  extractCapabilities(intent: string | TaskIntent): string[]
  isLegacyTaskType(input: unknown): boolean
  migrateLegacyTaskType(taskType: string): TaskIntent
}
```

---

## 6. Chain Composer

### 6.1 Specification

```typescript
// File: packages/opencode/src/kiloclaw/agency/routing/chain-composer.ts

export class ChainComposer {
  constructor(skillRegistry: SkillRegistry)

  canCompose(requiredCapabilities: string[]): boolean
  compose(requiredCapabilities: string[]): SkillChain | null
  estimateChainSteps(requiredCapabilities: string[]): number
}
```

---

## 7. File Structure

```
packages/opencode/src/kiloclaw/
├── agency/
│   ├── index.ts                     # Updated exports (deprecated legacy exports marked)
│   ├── types.ts                     # DEPRECATED: Legacy AgentRegistry + TaskType/SkillName enums
│   │                                # New code should use ./registry/agent-registry.ts
│   │
│   ├── registry/                    # NEW: Dynamic registries (use these)
│   │   ├── skill-registry.ts        # SkillRegistry namespace
│   │   ├── skill-registry.test.ts   # TDD tests
│   │   ├── agent-registry.ts        # FlexibleAgentRegistry namespace (replaces legacy)
│   │   ├── agent-registry.test.ts   # TDD tests
│   │   ├── agency-registry.ts       # AgencyRegistry namespace
│   │   ├── agency-registry.test.ts  # TDD tests
│   │   ├── chain-registry.ts        # ChainRegistry namespace
│   │   └── chain-registry.test.ts   # TDD tests
│   │
│   └── routing/                     # NEW: Capability routing
│       ├── types.ts                 # TaskIntent, RouteResult, etc.
│       ├── types.test.ts            # Zod schema validation tests
│       ├── capability-router.ts     # CapabilityRouter namespace
│       ├── capability-router.test.ts # TDD tests
│       ├── intent-classifier.ts     # IntentClassifier namespace
│       ├── intent-classifier.test.ts # TDD tests
│       ├── chain-composer.ts        # ChainComposer namespace
│       └── chain-composer.test.ts   # TDD tests
```

---

## 8. Test Specifications

### 8.1 TaskIntent Schema Tests

#### test_given_valid_intent_string_when_validate_then_succeeds

**Given:** A valid intent object with intent="search", parameters={query: "test"}
**When:** TaskIntentSchema.parse() is called
**Then:** Returns valid TaskIntent object with intent="search", parameters={query: "test"}

#### test_given_empty_intent_when_validate_then_throws

**Given:** An intent object with empty string intent=""
**When:** TaskIntentSchema.parse() is called
**Then:** Throws ZodValidationError with "String must contain at least 1 character"

#### test_given_intent_with_all_context_fields_when_validate_then_succeeds

**Given:** An intent with domain="knowledge", urgency="high", preferences={lang: "en"}, correlationId="123"
**When:** TaskIntentSchema.parse() is called
**Then:** Returns valid TaskIntent with all context fields populated

### 8.2 SkillDefinition Schema Tests

#### test_given_valid_skill_definition_when_validate_then_succeeds

**Given:** A valid SkillDefinition with id="web-search", name="Web Search", version="1.0.0", capabilities=["search", "web"]
**When:** SkillDefinitionSchema.parse() is called
**Then:** Returns valid SkillDefinition

#### test_given_skill_without_capabilities_when_validate_then_throws

**Given:** A SkillDefinition with empty capabilities array
**When:** SkillDefinitionSchema.parse() is called
**Then:** Throws ZodValidationError "Array must contain at least 1 element(s)"

#### test_given_skill_with_invalid_version_when_validate_then_throws

**Given:** A SkillDefinition with version="latest" (not semver)
**When:** SkillDefinitionSchema.parse() is called
**Then:** Throws ZodValidationError "Must be semver format (x.y.z)"

### 8.3 SkillRegistry Tests

#### test_given_empty_registry_when_register_then_can_retrieve

**Given:** An empty SkillRegistry instance
**When:** register(skill) is called with a valid SkillDefinition
**Then:** get(skill.id) returns the registered skill

#### test_given_skills_with_capabilities_when_findByCapabilities_then_returns_matching

**Given:** Three skills registered: web-search(capabilities=["search","web"]), code-gen(capabilities=["coding","generation"]), fact-check(capabilities=["fact-checking","verification"])
**When:** findByCapabilities(["search"]) is called
**Then:** Returns only web-search skill

#### test_given_skills_with_overlapping_capabilities_when_findByCapabilities_then_returns_intersection

**Given:** Two skills with overlapping capabilities: skill1(capabilities=["search","analysis"]), skill2(capabilities=["analysis","synthesis"])
**When:** findByCapabilities(["search","analysis"]) is called
**Then:** Returns both skill1 and skill2

#### test_given_multiple_skills_when_findByCapabilities_with_threshold_then_filters

**Given:** Skills with partial matches: skill1(3/4 match), skill2(2/4 match), skill3(1/4 match)
**When:** findByCapabilities with required=["a","b","c","d"] and threshold=0.6 is called
**Then:** Returns only skill1

### 8.4 FlexibleAgentRegistry Tests

> **NOTE:** Legacy `AgentRegistry` in `types.ts` is deprecated. These tests cover `FlexibleAgentRegistry`.

#### test_given_empty_registry_when_register_then_can_retrieve

**Given:** An empty FlexibleAgentRegistry instance
**When:** register(agent) is called
**Then:** get(agent.id) returns the registered agent

#### test_given_agents_in_multiple_agencies_when_listByAgency_then_filters_correctly

**Given:** Three agents: dev-agent(primaryAgency="development"), research-agent(primaryAgency="knowledge"), cross-agent(primaryAgency="development", secondaryAgencies=["knowledge"])
**When:** listByAgency("knowledge") is called
**Then:** Returns research-agent and cross-agent

#### test_given_agents_with_capabilities_when_findByCapabilities_then_scores_and_ranks

**Given:** Two agents: coder(capabilities=["coding","review","debugging"]), reviewer(capabilities=["review","analysis"])
**When:** findByCapabilities(["coding","review","debugging","testing"]) is called
**Then:** Returns coder first (3/4 match), reviewer second (1/4 match)

#### test_given_agents_when_findByCapabilitiesInAgency_then_combines_filters

**Given:** Three agents: dev-coder(primaryAgency="development", capabilities=["coding"]), research-coder(primaryAgency="knowledge", capabilities=["coding","research"]), dev-reviewer(primaryAgency="development", capabilities=["review"])
**When:** findByCapabilitiesInAgency(["coding"], "development") is called
**Then:** Returns only dev-coder

### 8.5 CapabilityRouter Tests

#### test_given_single_matching_skill_when_routeTask_then_returns_skill

**Given:** SkillRegistry with web-search skill matching "search" capability, no chains
**When:** routeTask({intent: "search", parameters: {query: "test"}}) is called
**Then:** Returns RouteResult with type="skill", skill=web-search, confidence=1.0

#### test_given_multiple_matching_skills_when_routeTask_then_returns_best_match

**Given:** Two skills with different match scores for "coding,debugging": coder(2/2 match), generalist(1/2 match)
**When:** routeTask({intent: "code-debug", capabilities: ["coding","debugging"]}) is called
**Then:** Returns RouteResult with type="skill", skill=coder

#### test_given_chain_possible_when_routeTask_then_returns_chain

**Given:** Skills that can compose: search-skill(capabilities=["search"]), analyze-skill(capabilities=["analysis"]), and a chain exists for search+analysis
**When:** routeTask({intent: "research", capabilities: ["search","analysis"]}) is called
**Then:** Returns RouteResult with type="chain", chain=<composed chain>

#### test_given_no_matching_skill_or_chain_when_routeTask_then_returns_agent

**Given:** No single skill or chain matches, but agents exist with matching capabilities
**When:** routeTask({intent: "complex-task"}) is called
**Then:** Returns RouteResult with type="agent", agent=<best matching agent>

#### test_given_agency_context_when_routeTask_then_respects_agency_policies

**Given:** A task requiring "network" capability, but agency="development" with deniedCapabilities=["network"]
**When:** routeTask(taskIntent, agency) is called
**Then:** Throws CapabilityDeniedError or returns filtered results per policy

### 8.6 IntentClassifier Tests

#### test_given_legacy_task_type_string_when_migrate_then_converts_to_task_intent

**Given:** Legacy taskType="web-search"
**When:** migrateLegacyTaskType("web-search") is called
**Then:** Returns TaskIntent with intent="search", capabilities=["search","web"]

#### test_given_unknown_legacy_task_type_when_migrate_then_uses_raw_intent

**Given:** Legacy taskType="custom-unknown-task"
**When:** migrateLegacyTaskType("custom-unknown-task") is called
**Then:** Returns TaskIntent with intent="custom-unknown-task", capabilities=[]

#### test_given_natural_language_when_classify_then_extracts_capabilities

**Given:** Natural language input="I need to search the web and analyze the results"
**When:** extractCapabilities(input) is called
**Then:** Returns ["search", "web", "analysis"]

### 8.7 ChainComposer Tests

#### test_given_composable_skills_when_compose_then_returns_chain

**Given:** skill1(capabilities=["search"]), skill2(capabilities=["analysis"]) registered, no existing chain
**When:** compose(["search","analysis"]) is called
**Then:** Returns SkillChain with steps=[skill1, skill2]

#### test_given_no_composable_skills_when_compose_then_returns_null

**Given:** No skills that can be composed for required capabilities
**When:** compose(["nonexistent-capability"]) is called
**Then:** Returns null

#### test_given_existing_chain_when_compose_then_prefers_existing

**Given:** Existing chain with id="search-analyze" matching ["search","analysis"]
**When:** compose(["search","analysis"]) is called
**Then:** Returns the existing chain, not a new composition

### 8.8 ChainRegistry Tests

#### test_given_chain_when_register_then_can_retrieve

**Given:** A valid SkillChain with id="search-analyze", steps=[{skillId: "search"}, {skillId: "analyze"}]
**When:** register(chain) is called
**Then:** get("search-analyze") returns the registered chain

#### test_given_chains_with_capabilities_when_findByCapabilities_then_returns_matching

**Given:** Chain1(capabilities=["search","analysis"]), Chain2(capabilities=["generate","review"])
**When:** findByCapabilities(["search","analysis"]) is called
**Then:** Returns Chain1

### 8.9 AgencyRegistry Tests

#### test_given_agency_when_register_then_can_retrieve_by_id_and_domain

**Given:** AgencyDefinition with id="knowledge-agency", domain="knowledge"
**When:** register(agency) is called
**Then:** get("knowledge-agency") returns agency AND getByDomain("knowledge") returns agency

#### test_given_multiple_agencies_with_same_domain_when_register_then_throws

**Given:** Existing agency with domain="knowledge"
**When:** register(newAgency with domain="knowledge") is called
**Then:** Throws Error "Domain 'knowledge' already registered"

---

## 9. Backwards Compatibility

### 9.1 Legacy Type Deprecation

```typescript
// File: packages/opencode/src/kiloclaw/agency/types.ts

// @deprecated - Use TaskIntentSchema instead
export const LegacyTaskType = TaskType

// @deprecated - Use TaskIntent instead
export type LegacyTaskType = TaskType

// Migration helper
export function migrateTaskType(taskType: string): TaskIntent {
  const mapping: Record<string, { intent: string; capabilities: string[] }> = {
    "web-search": { intent: "search", capabilities: ["search", "web"] },
    "academic-research": { intent: "research", capabilities: ["academic", "search"] },
    "fact-checking": { intent: "verify", capabilities: ["fact-checking", "verification"] },
    "code-generation": { intent: "generate", capabilities: ["coding", "generation"] },
    "code-review": { intent: "review", capabilities: ["review", "analysis"] },
    debugging: { intent: "debug", capabilities: ["debugging", "diagnosis"] },
    // ... other mappings
  }

  return mapping[taskType] || { intent: taskType, capabilities: [] }
}
```

### 9.2 Dual Registry Support

The legacy `AgentRegistry` (class in `./types.ts`) and new `FlexibleAgentRegistry` must coexist during migration:

```typescript
// Both registries operate in parallel
const legacyRegistry = getAgentRegistry() // Old TaskType-based - DEPRECATED
const newRegistry = FlexibleAgentRegistry // New capability-based

// WARNING: Do not use getAgentRegistry() for new code
// It will log deprecation warnings when called
```

### 9.3 Deprecation Strategy

| Legacy Type           | Replacement                       | Migration Action                       |
| --------------------- | --------------------------------- | -------------------------------------- |
| `AgentRegistry` class | `FlexibleAgentRegistry` namespace | Use `FlexibleAgentRegistry.register()` |
| `getAgentRegistry()`  | Direct module functions           | Use `FlexibleAgentRegistry.list()`     |
| `TaskType` enum       | `TaskIntent.intent`               | Use `migrateLegacyTaskType()`          |
| `SkillName` enum      | `SkillDefinition.capabilities[]`  | Use `migrateLegacyTaskType()`          |

### 9.4 Deprecation Warnings

```typescript
// getAgentRegistry() logs deprecation warning when called
function getAgentRegistry(): AgentRegistry {
  console.warn(
    "[DEPRECATED] getAgentRegistry() is deprecated. Use FlexibleAgentRegistry from './registry/agent-registry' instead.",
  )
  // ... returns legacy instance
}
```

---

## 10. Integration Points

### 10.1 Existing Agency Catalog

The `AgencyCatalog` class in `catalog.ts` must be updated to use the new registries:

```typescript
// In AgencyCatalog - Updated to use new registries
private skillRegistry: SkillRegistry
private agentRegistry: FlexibleAgentRegistry  // Was: AgentRegistry (deprecated)
private agencyRegistry: AgencyRegistry
private chainRegistry: ChainRegistry
```

### 10.2 Existing Skill Interface

The `Skill` interface in `skill.ts` must remain compatible:

```typescript
// skill.ts - existing interface remains
export interface Skill {
  readonly id: SkillId
  readonly version: SemanticVersion
  readonly name: string
  readonly inputSchema: JsonSchema
  readonly outputSchema: JsonSchema
  execute(input: unknown, context: SkillContext): Promise<unknown>
  readonly capabilities: string[] // Already exists
  readonly tags: string[] // Already exists
}
```

### 10.3 Migration Path

| Phase   | Actions                                             | Compatibility    |
| ------- | --------------------------------------------------- | ---------------- |
| Phase 1 | Add `capabilities: string[]` to SkillDefinition     | Non-breaking     |
| Phase 2 | Create SkillRegistry, AgentRegistry, AgencyRegistry | Dual operation   |
| Phase 3 | Implement CapabilityRouter alongside legacy router  | Dual operation   |
| Phase 4 | Implement ChainComposer and ChainRegistry           | New feature      |
| Phase 5 | Add deprecation warnings to legacy methods          | Backwards compat |
| Phase 6 | Remove legacy (optional, major version bump)        | Breaking         |

---

## 11. Error Handling

### 11.1 Error Types

```typescript
// File: packages/opencode/src/kiloclaw/agency/routing/errors.ts

export class CapabilityRouterError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message)
    this.name = "CapabilityRouterError"
  }
}

export class CapabilityDeniedError extends CapabilityRouterError {
  constructor(capability: string, agency: string) {
    super(`Capability '${capability}' denied by agency '${agency}'`, "CAPABILITY_DENIED")
    this.name = "CapabilityDeniedError"
  }
}

export class NoMatchingCapabilityError extends CapabilityRouterError {
  constructor(required: string[]) {
    super(`No skills or agents found matching capabilities: ${required.join(", ")}`, "NO_MATCH")
    this.name = "NoMatchingCapabilityError"
  }
}

export class ChainCompositionError extends CapabilityRouterError {
  constructor(reason: string) {
    super(`Cannot compose chain: ${reason}`, "CHAIN_COMPOSITION_FAILED")
    this.name = "ChainCompositionError"
  }
}
```

---

## 12. Implementation Phases

### Phase 1: Type Definitions & Schemas

- Create `TaskIntentSchema`, `SkillDefinitionSchema`, `AgentDefinitionSchema`, `AgencyDefinitionSchema`, `SkillChainSchema`, `RouteResultSchema`
- Add Zod tests for all schemas
- Verify type safety with existing Skill interface

### Phase 2: Core Registries

- Implement `SkillRegistry` with capability indexing
- Implement `AgentRegistry` with capability and agency indexing
- Implement `AgencyRegistry` with domain indexing
- Write unit tests for all registries

### Phase 3: CapabilityRouter ✅ COMPLETE

- Implement `CapabilityRouter` class ✅
- Implement `findSkillsForCapabilities()`, `findAgentsForCapabilities()`, `matchScore()` ✅
- Implement `routeTask()` function ✅
- Write comprehensive unit tests ✅

### Phase 4: Chain Composition ✅ COMPLETE

- Implement `ChainRegistry` ✅ (from Phase 2)
- Implement `ChainComposer` ✅
- Integrate chain finding into `CapabilityRouter.composeChain()` ✅
- Write unit tests ✅

### Phase 5: Intent Classification ✅ COMPLETE

- Implement `IntentClassifier` ✅
- Add legacy TaskType migration helpers ✅
- Add deprecation warnings ✅
- Write unit tests ✅

### Phase 6: Integration

- Update `AgencyCatalog` to use new registries
- Update exports in `agency/index.ts`
- Run full typecheck
- Run existing integration tests

---

## 13. Acceptance Criteria

1. **Type Safety**: All new types have Zod schemas with 100% test coverage
2. **Non-Breaking**: Phase 1-3 maintain backwards compatibility with existing code
3. **Capability Matching**: `findSkillsForCapabilities(["search"])` returns skills with "search" in capabilities array
4. **Agent Matching**: `findAgentsForCapabilities(["coding","review"])` returns agents scored by match percentage
5. **Chain Composition**: Given skills ["search", "analyze"], `composeChain()` returns a valid SkillChain
6. **Legacy Migration**: `migrateLegacyTaskType("web-search")` returns `{ intent: "search", capabilities: ["search", "web"] }`
7. **Registry Operations**: All CRUD operations (register, get, list, remove) work correctly
8. **Error Handling**: Custom errors are thrown with appropriate codes and messages
9. **Typecheck Passes**: `bun run --cwd packages/opencode typecheck` passes with no errors

---

## 14. Test Count Summary

| Component              | Test Cases |
| ---------------------- | ---------- |
| TaskIntent Schema      | 3          |
| SkillDefinition Schema | 3          |
| SkillRegistry          | 5          |
| FlexibleAgentRegistry  | 5          |
| CapabilityRouter       | 7          |
| IntentClassifier       | 17         |
| ChainComposer          | 16         |
| ChainRegistry          | 3          |
| AgencyRegistry         | 2          |
| **Total**              | **61**     |

## 15. Implementation Notes

### Phase 3 Tests (CapabilityRouter)

- findSkillsForCapabilities: 5 tests
- findAgentsForCapabilities: 5 tests
- matchScore: 4 tests
- composeChain: 4 tests
- routeTask: 7 tests

### Phase 4 Tests (ChainComposer)

- canCompose: 5 tests
- compose: 6 tests
- estimateChainSteps: 4 tests
- findBestChain: 3 tests
- ChainRegistry.findChainForCapabilities: 3 tests

### Phase 5 Tests (IntentClassifier)

- classify: 5 tests
- extractCapabilities: 5 tests
- isLegacyTaskTypeInput: 3 tests
- migrateLegacy: 2 tests
- getCapabilityKeywords: 1 test
- migrateLegacyTaskType (from types): 4 tests

---

**Document Status:** Implementation Complete (Phases 1-5)  
**Last Updated:** 2026-04-03  
**Implementation Status:**

- ✅ Phase 1: Type Definitions & Schemas
- ✅ Phase 2: Core Registries
- ✅ Phase 3: CapabilityRouter
- ✅ Phase 4: Chain Composition
- ✅ Phase 5: Intent Classification
- ⏳ Phase 6: Integration (Pending)

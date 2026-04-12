# Flexible Agents Routing Fix

**Date**: 2026-04-04  
**Issue**: `Unknown agent type: researcher is not a valid agent type`  
**Severity**: High - Blocks subagent invocation  
**Status**: Resolved

## Problem

When users attempted to invoke subagents via the Task tool (e.g., `researcher`, `coder`, `debugger`), the system threw an error indicating the agent type was unknown, even though these agents were properly defined in `agency-definitions.ts`.

## Root Cause (Multi-Layer Analysis)

Four issues compounded to cause the failure:

### Issue 1: Lazy Catalog Bootstrap

`AgencyCatalog` is a lazy singleton - it was only instantiated when `getCatalog()` was called explicitly. The `FlexibleAgentRegistry` (where flexible agents are registered) was populated only during `bootstrapDefaultCatalog()`, which was called manually in CLI commands like `list-agencies`.

**Fix**: Modified `getCatalog()` to auto-bootstrap on first access:

```typescript
let defaultCatalogBootstrapped = false
export function getCatalog(): AgencyCatalog {
  if (!catalogInstance) {
    catalogInstance = new AgencyCatalog()
  }
  if (!defaultCatalogBootstrapped) {
    catalogInstance.bootstrapDefaultCatalog()
    defaultCatalogBootstrapped = true
  }
  return catalogInstance
}
```

### Issue 2: TaskTool Assumed Native Agent Always Existed

Even when `flexibleAgent` was found in `FlexibleAgentRegistry`, the code used `agent.name` and `agent.model` which were undefined for flexible-only agents. This caused `TypeError: undefined is not an object (evaluating 'agent.name')` and `agent.variant`.

**Fix**: TaskTool now handles flexible-only agents correctly:

```typescript
const flexibleAgent = FlexibleAgentRegistry.getAgent(params.subagent_type)
const agent = await Agent.get(params.subagent_type)
if (!agent && !flexibleAgent) {
  throw new Error(`Unknown agent type: ${params.subagent_type}...`)
}

// Safe access for both native and flexible-only agents
const agentName = agent?.name ?? flexibleAgent!.id
const agentTitle = agent?.name ?? flexibleAgent!.name
const agentPermission = flexibleAgent?.permission ?? agent!.permission
const model = agent?.model ?? {
  modelID: msg.info.modelID,
  providerID: msg.info.providerID,
}
```

### Issue 3: Subagent Listing Used Wrong Field

The TaskTool description listed subagents using `a.name` (display name like "Researcher") instead of `a.id` (identifier like "researcher"). Since `subagent_type` expects IDs, this caused a mismatch.

**Fix**: Changed listing to use `a.id` for the name field:

```typescript
flexibleAgents
  .filter((a) => a.mode !== "primary")
  .map((a) => ({
    name: a.id, // Use ID, not display name
    description: a.description ?? `Flexible agent: ${a.name}`,
    mode: "subagent" as const,
  }))
```

### Issue 4: Agent.get() Didn't Know About Flexible Agents

`Agent.get()` only looked in native agent state, never checking `FlexibleAgentRegistry`. Added fallback:

```typescript
export async function get(agent: string) {
  const effectiveAgent = agent === "build" ? "code" : agent
  const nativeAgent = await state().then((x) => x[effectiveAgent])
  if (nativeAgent) return nativeAgent

  // Fallback: check FlexibleAgentRegistry
  getCatalog()
  const flexibleAgent = FlexibleAgentRegistry.getAgent(effectiveAgent)
  if (!flexibleAgent) return nativeAgent // return undefined if not found anywhere

  // Return compatible Agent.Info object
  return {
    name: flexibleAgent.id,
    displayName: flexibleAgent.name,
    description: flexibleAgent.description ?? `Flexible agent: ${flexibleAgent.id}`,
    mode: (flexibleAgent.mode ?? "subagent") as "primary" | "subagent" | "all",
    native: false,
    hidden: false,
    deprecated: false,
    permission: flexibleAgent.permission ?? [],
    topP: undefined,
    temperature: undefined,
    color: undefined,
    model: undefined,
    variant: undefined,
    prompt: flexibleAgent.prompt,
    options: {},
    steps: undefined,
  }
}
```

## Files Modified

| File                                               | Change                                                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `packages/opencode/src/kiloclaw/agency/catalog.ts` | Auto-bootstrap catalog on `getCatalog()` first call                                         |
| `packages/opencode/src/tool/task.ts`               | Handle flexible-only agents; use `a.id` for subagent names                                  |
| `packages/opencode/src/agent/agent.ts`             | `Agent.get()` falls back to FlexibleAgentRegistry; `Agent.list()` initializes catalog first |

## Verification

```bash
bun run --cwd packages/opencode --conditions=browser src/index.ts run \
  "Use the Task tool with subagent_type 'researcher' and prompt 'Reply with ok'."
```

**Result**: ✅ SUCCESS

```
> router · MiniMax-M2.7
• Simple researcher task Researcher Agent
✓ Simple researcher task Researcher Agent
The researcher agent replied with: ok
```

## Available Flexible Agents

| Agent ID          | Name            | Primary Agency | Capabilities                                                                           |
| ----------------- | --------------- | -------------- | -------------------------------------------------------------------------------------- |
| `researcher`      | Researcher      | knowledge      | search, synthesis, information_gathering, web-search, academic-research, fact-checking |
| `coder`           | Coder           | development    | coding, debugging, refactoring, code-generation, code-modification, bug-fixing         |
| `debugger`        | Debugger        | development    | debugging, root-cause-analysis, troubleshooting                                        |
| `planner`         | Planner         | development    | task-planning, code-planning, roadmapping                                              |
| `code-reviewer`   | Code Reviewer   | development    | code-review, quality-assurance                                                         |
| `analyst`         | Analyst         | knowledge      | data-analysis, comparison, evaluation                                                  |
| `educator`        | Educator        | knowledge      | explanation, summarization, teaching                                                   |
| `nutritionist`    | Nutritionist    | nutrition      | nutrition-analysis, food-analysis, dietary-assessment                                  |
| `weather-current` | Weather         | weather        | weather-query, current-weather                                                         |
| `forecaster`      | Forecaster      | weather        | weather-forecast, weather-prediction                                                   |
| `recipe-searcher` | Recipe Searcher | nutrition      | recipe-search, meal-ideas                                                              |
| `diet-planner`    | Diet Planner    | nutrition      | meal-planning, diet-generation, nutrition-planning                                     |
| `alerter`         | Alerter         | weather        | weather-alerts, notifications                                                          |

## Related Files

- `packages/opencode/src/kiloclaw/agency/catalog.ts` - AgencyCatalog singleton with `getCatalog()`
- `packages/opencode/src/kiloclaw/agency/agency-definitions.ts` - Flexible agent definitions
- `packages/opencode/src/kiloclaw/agency/registry/agent-registry.ts` - FlexibleAgentRegistry implementation

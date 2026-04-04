# Flexible Agents Routing Fix

**Date**: 2026-04-04  
**Issue**: `Unknown agent type: researcher is not a valid agent type`  
**Severity**: High - Blocks subagent invocation  
**Status**: Resolved

## Problem

When users attempted to invoke subagents via the Task tool (e.g., `researcher`, `coder`, `debugger`), the system threw an error indicating the agent type was unknown, even though these agents were properly defined in `agency-definitions.ts`.

## Root Cause

The `FlexibleAgentRegistry` maintains internal state (a `Map`) where flexible agents are registered via `registerFlexibleAgents()`. This registration function is called **only** within the `AgencyCatalog` constructor.

`AgencyCatalog` is a **lazy singleton** - it's only instantiated when `getCatalog()` is called explicitly. However, `getCatalog()` was only being called in explicit CLI commands (`list-agencies`, `info`, etc.), **NOT** during:
- Normal interactive chat CLI usage
- When the TaskTool is invoked to execute a subagent

This meant the `FlexibleAgentRegistry` was empty when users tried to invoke subagents, causing the "Unknown agent type" error.

## Solution

Added explicit initialization of the `AgencyCatalog` before accessing the `FlexibleAgentRegistry` in two locations:

### 1. `packages/opencode/src/tool/task.ts`

```typescript
import { getCatalog } from "../kiloclaw/agency/catalog"

async execute(params: z.infer<typeof parameters>, ctx) {
  const config = await Config.get()

  // Ensure flexible agents are registered before attempting to use them
  getCatalog()
  // ... rest of execute
}
```

### 2. `packages/opencode/src/agent/agent.ts`

```typescript
import { getCatalog } from "../kiloclaw/agency/catalog" // kilocode_change

export async function list() {
  // ...
  // Ensure catalog is initialized first to register all flexible agents
  getCatalog()
  const flexibleAgents = FlexibleAgentRegistry.getAllAgents()
  // ...
}
```

## Files Modified

| File | Change |
|------|--------|
| `packages/opencode/src/tool/task.ts` | Added `getCatalog()` call in `execute()` |
| `packages/opencode/src/agent/agent.ts` | Added `getCatalog()` call in `list()` |

## Available Flexible Agents

| Agent ID | Name | Primary Agency | Capabilities |
|----------|------|---------------|--------------|
| `researcher` | Researcher | knowledge | search, synthesis, information_gathering, web-search, academic-research, fact-checking |
| `coder` | Coder | development | coding, debugging, refactoring, code-generation, code-modification, bug-fixing |
| `debugger` | Debugger | development | debugging, root-cause-analysis, troubleshooting |
| `planner` | Planner | development | task-planning, code-planning, roadmapping |
| `code-reviewer` | Code Reviewer | development | code-review, quality-assurance |
| `analyst` | Analyst | knowledge | data-analysis, comparison, evaluation |
| `educator` | Educator | knowledge | explanation, summarization, teaching |
| `nutritionist` | Nutritionist | nutrition | nutrition-analysis, food-analysis, dietary-assessment |
| `weather-current` | Weather | weather | weather-query, current-weather |
| `forecaster` | Forecaster | weather | weather-forecast, weather-prediction |
| `recipe-searcher` | Recipe Searcher | nutrition | recipe-search, meal-ideas |
| `diet-planner` | Diet Planner | nutrition | meal-planning, diet-generation, nutrition-planning |
| `alerter` | Alerter | weather | weather-alerts, notifications |

## Verification

- TypeScript typecheck: ✅ PASS
- Test suite: ✅ 1848 pass, 11 skip, 210 fail (pre-existing failures unrelated to routing)

## Related Files

- `packages/opencode/src/kiloclaw/agency/catalog.ts` - AgencyCatalog singleton with `getCatalog()`
- `packages/opencode/src/kiloclaw/agency/agency-definitions.ts` - Flexible agent definitions
- `packages/opencode/src/kiloclaw/agency/registry/agent-registry.ts` - FlexibleAgentRegistry implementation

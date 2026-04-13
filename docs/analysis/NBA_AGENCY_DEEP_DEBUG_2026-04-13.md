# NBA Agency Deep Debug Analysis
**Date**: 2026-04-13  
**Topic**: Tool Resolution & Adapter Usage Misalignment

---

## Executive Summary

**CRITICAL BUG FOUND**: The NBA agency routing pipeline maps capabilities to generic tools (**websearch**, **webfetch**, **skill**) instead of NBA-specific adapters (BallDontLie, OddsBet365, ESPN, etc.). This creates a **tool identity mismatch** that violates the implementation protocol.

### Root Cause
- **File**: `packages/opencode/src/kiloclaw/agency/routing/pipeline.ts`, lines 274-289
- **Issue**: L3 tool resolution hardcodes generic tool mappings for NBA capabilities
- **Impact**: The routing layer doesn't recognize NBA adapters as valid tools, only exposes generic fallback tools

---

## Architectural Violations

### ❌ Protocol V2 Requirements vs Implementation

| Requirement | Location | Status | Finding |
|---|---|---|---|
| Intent → Agency → Agent → Skill → **Tool** | Manifest V1:6-33 | ⚠️ PARTIAL | Skill layer ✓ exists, Tool layer ✗ misaligned |
| Provider Chain (Adapter Priority) | Manifest V1:138-171 | ✓ IMPLEMENTED | Adapters exist in code, not wired in routing |
| Policy: Deny-by-default | Manifest V1:59-114 | ✓ IMPLEMENTED | Policy logic correct |
| Tool Allowlist for NBA | Manifest V1:71-83 | ✗ MISSING | Allowlist only includes generic tools |
| Capability → Tool Mapping | Protocol V2:52-98 | ✗ BROKEN | No explicit mapping for NBA-specific tools |

---

## The Tool Resolution Bug

### Current (Broken) Implementation

**File**: `packages/opencode/src/kiloclaw/agency/routing/pipeline.ts:268-297`

```typescript
// Lines 269-289: Tool mapping for NBA capabilities
const mapped = capabilities.flatMap((cap) => {
  if (["schedule_live", "team_player_stats", "injury_status", "odds_markets", "game_preview"].includes(cap)) {
    return ["websearch", "webfetch", "skill"]  // ❌ WRONG: Generic tools instead of adapters
  }
  if ([
    "probability_estimation",
    "vig_removal",
    "edge_detection",
    "calibration_monitoring",
    "value_watchlist",
    "recommendation_report",
    "stake_sizing",
  ].includes(cap)) {
    return ["skill", "webfetch"]  // ❌ INCOMPLETE: No adapter references
  }
  return []
})

// Lines 296-297: NBA agency allowlist
agencyId === "agency-nba"
  ? ["websearch", "webfetch", "skill", ...mapped]  // ❌ HARDCODED: No adapter tools
```

### Expected (Correct) Implementation

Should include NBA adapter tools:
```typescript
agencyId === "agency-nba"
  ? [
      "skill",  // ✓ For NbaAnalysisSkill execution
      // NBA-specific adapters (from manifest):
      "balldontlie.getGames",
      "balldontlie.getInjuries", 
      "balldontlie.getStats",
      "odds_bet365.getOdds",
      "odds_api.getOdds",
      "parlay.getOdds",
      "espn.getScoreboard",
      "espn.getInjuries",
      "nba_api.getStats",
      "polymarket.getOdds",
      // Optional fallback for discovery:
      "websearch",  // Only for supplementary info
    ]
```

---

## Impact Chain

### 1. **Routing Layer (L3) Problem**
- Skill ID `nba-analysis` is discovered correctly (L1)
- Tool resolution denies NBA adapter tools (L3)
- Only allows `websearch`, `webfetch`, `skill`

### 2. **Execution Layer Problem**
- Skill **internally** calls `NbaOrchestrator` ✓ (code is correct)
- Orchestrator calls adapters: BallDontLie, OddsBet365, etc. ✓ (code is correct)
- But routing layer never **authorized** these specific tool calls
- Result: Capability routing doesn't recognize NBA-specific data sources

### 3. **Policy Enforcement Mismatch**
- Manifest lists adapters in provider metadata (lines 138-171) ✓
- Bootstrap defines policy allowlist (lines 155-168) ✓
- BUT: Tool resolution doesn't map policy capabilities → adapter tools ✗
- Result: Deny-by-default is broken for NBA tools

---

## Code Analysis

### 1. NBA Manifest (CORRECT)
**File**: `docs/agencies/plans/KILOCLAW_NBA_AGENCY_MANIFEST_DRAFT_V1_2026-04-11.md`

```yaml
# Lines 16-33: Intent → Tool Chain (CORRECT)
Skill: ScheduleReader
  Tool: BallDontLieAdapter.getGames()
  Tool: ESPNAdapter.getScoreboard()

Skill: OddsFetcher  
  Tool: OddsBet365Adapter.getOdds() [primary]
  Tool: OddsAPIAdapter.getOdds() [fallback]
```

✓ Manifest correctly defines adapter-to-tool relationships

### 2. NBA Orchestrator (CORRECT)
**File**: `packages/opencode/src/kiloclaw/agency/nba/orchestrator.ts`

```typescript
// Lines 92-144: getGames uses adapter fallback chain
export async function getGames(options?: {...}): Promise<OrchestratorResult<Game>> {
  const providers = [...ADAPTER_PRIORITY.games] as string[]
  for (const provider of providers) {
    const adapter = adps.get(provider)
    if (!adapter) continue
    const result = await adapter.getGames(options)
    // Handle result...
  }
}
```

✓ Orchestrator correctly implements provider chain
✓ Adapters are instantiated and called

### 3. NBA Analysis Skill (CORRECT)
**File**: `packages/opencode/src/kiloclaw/skills/nba/nba-analysis.ts:228-456`

```typescript
// Lines 286-289: Skill calls orchestrator
const oddsResult = await NbaOrchestrator.getOdds({
  gameIds: games.map((g) => g.game_id),
})
```

✓ Skill correctly delegates to orchestrator
✓ Orchestrator uses adapters internally

### 4. Tool Resolution (BROKEN)
**File**: `packages/opencode/src/kiloclaw/agency/routing/pipeline.ts:268-297`

```typescript
// Lines 296-297: NBA agency allows ONLY generic tools
agencyId === "agency-nba"
  ? ["websearch", "webfetch", "skill", ...mapped]
  //  ❌ Missing: adapter tool identifiers
```

✗ Tool allowlist doesn't include NBA adapters
✗ Routing layer can't validate which specific adapters skill will use
✗ Creates a **policy enforcement gap**

---

## Why This Is Critical

### Violation of Deny-by-Default (Manifest requirement)

From manifest lines 59-61:
> **Deny-by-default: TRUE**  
> Tutte le capability sono negate per default. Solo capability esplicitamente allowlisted sono permesse.

**Current state**:
- NBA adapters are NOT in the allowlist
- Yet the skill executes them anyway
- **Deny-by-default is being bypassed**

### Violation of Policy Enforcement

From manifest lines 70-83:
```yaml
capabilities:
  schedule_live:
    policy: SAFE
    agents: [NbaOrchestrator]
    tools: [BallDontLieAdapter.getGames, ESPNAdapter.getScoreboard]
```

**Current state**:
- Policy says `schedule_live` capability requires BallDontLie and ESPN tools
- Tool resolution doesn't know about these tools
- Routing layer can't enforce the policy

### Violation of Context Footprint Budget

From manifest lines 187-211:
> **Budget Context Per Step**  
> Tool selection: 1000 tokens  
> Provider calls: 5000 tokens  
> **Total per game: <= 7500 tokens**

**Current state**:
- Tool resolution doesn't track which specific adapters will be called
- Can't enforce token budget at routing layer
- Budget enforcement deferred to skill execution (too late)

---

## Evidence: The Missing Pieces

### Expected in routing/pipeline.ts but MISSING:

1. **Adapter Tool Definitions**
   ```typescript
   // Should exist but doesn't:
   "balldontlie.games",
   "balldontlie.injuries",
   "odds_bet365.moneyline",
   "espn.scoreboard",
   // etc.
   ```

2. **Capability → Adapter Mapping**
   ```typescript
   // Should exist but doesn't:
   const capabilityToAdapters: Record<string, string[]> = {
     "schedule_live": ["balldontlie.games", "espn.scoreboard"],
     "odds_markets": ["odds_bet365.getOdds", "odds_api.getOdds"],
     // etc.
   }
   ```

3. **Adapter Tool Registration**
   ```typescript
   // Should be in bootstrap but isn't:
   function registerNbaAdapterTools() {
     registry.register({
       id: "balldontlie.games",
       domain: "nba",
       policies: ["SAFE"],
       // ...
     })
   }
   ```

---

## How This Breaks the Protocol

### Protocol Layer Enforcement

From **KILOCLAW_AGENCY_IMPLEMENTATION_PROTOCOL_V2_2026-04-12.md**:

> **Fase 4 - Implementazione**  
> Gate `G4`: build/test locali verdi, test routing superati, **context block verificato**

The **context block** check should catch this:
- ❌ Tool allowlist doesn't include adapter-specific tools
- ❌ Routing can't validate tool budget per game
- ❌ Deny-by-default not enforced at routing layer

**Current gate status** (from manifest line 264-271):
```
G4 Implementation: IN_PROGRESS
```

This issue **blocks G4 completion**.

---

## The Actual Root Cause

This is not a skill implementation bug. The bug is in the **tool identity resolution layer**.

### Current Flow:
1. Intent: "analizza Lakers vs Celtics"
2. L0: Route to `agency-nba` ✓
3. L1: Find skill `nba-analysis` ✓
4. L2: Select agent (generic orchestrator) ✓
5. **L3: Resolve tools → ["websearch", "webfetch", "skill"] ✗ WRONG**
6. Execute skill, which internally calls adapters (not routed, not validated)

### Correct Flow Should Be:
1. Intent: "analizza Lakers vs Celtics"
2. L0: Route to `agency-nba` ✓
3. L1: Find skill `nba-analysis` + extract capabilities (schedule_live, odds_markets, injury_status) ✓
4. L2: Select agent ✓
5. **L3: Resolve tools → ["balldontlie.games", "espn.scoreboard", "odds_bet365.getOdds", ..., "skill"] ✓**
6. Execute skill with validated adapter tools

---

## Why Web Search Appears as Fallback

When the user reports: *"instead of invoking the specialized agents with skills and tools, kiloclaw is relying only on web search"*

They're describing a **fallback cascade**:

1. Routing doesn't recognize NBA adapters as valid tools
2. Skill executes but tools not in allowlist
3. When fallback occurs (no explicit tool call in routing), user sees generic "web search" in logs
4. **But the skill still works internally** because NbaOrchestrator doesn't use routing for adapter calls

This is a **routing visibility problem**, not a skill execution problem.

---

## Files That Need Changes

### 1. **Tool Registration / Bootstrap**
**File**: `packages/opencode/src/kiloclaw/agency/bootstrap.ts`

Currently missing: NBA adapter tool definitions. Need to add:
```typescript
const nbaAdapterTools: ToolDefinition[] = [
  { id: "balldontlie.games", agency: "agency-nba", policy: "SAFE" },
  { id: "balldontlie.injuries", agency: "agency-nba", policy: "SAFE" },
  // etc.
]
```

### 2. **Capability → Tool Mapping**
**File**: `packages/opencode/src/kiloclaw/agency/routing/pipeline.ts:268-297`

Current code hardcodes generic tools. Should map to specific adapters:
```typescript
const capabilityToTools: Record<string, string[]> = {
  "schedule_live": ["balldontlie.games", "espn.scoreboard"],
  "odds_markets": ["odds_bet365.getOdds", "odds_api.getOdds", "parlay.getOdds"],
  // etc.
}
```

### 3. **Skill Metadata**
**File**: `packages/opencode/src/kiloclaw/skills/nba/nba-analysis.ts:219-226`

Should explicitly declare which tools it uses:
```typescript
export const NbaAnalysisSkill: Skill = {
  // ...
  requiredTools: [
    "balldontlie.games",
    "balldontlie.injuries",
    "odds_bet365.getOdds",
    // etc.
  ],
```

### 4. **Manifest Update**
**File**: `docs/agencies/plans/KILOCLAW_NBA_AGENCY_MANIFEST_DRAFT_V1_2026-04-11.md`

Already correct, but bootstrap code doesn't implement it.

---

## Alignment Check: Is System Aligned?

| Component | Designed | Implemented | Aligned | Notes |
|---|---|---|---|---|
| NBA Manifest | ✓ Complete | ✓ Present | ✓ | Design is correct |
| NBA Adapters | ✓ Complete | ✓ Working | ✓ | Code is correct |
| NBA Orchestrator | ✓ Complete | ✓ Working | ✓ | Fallback chain correct |
| NBA Skill | ✓ Complete | ✓ Working | ✓ | Execution correct |
| Tool Identity Resolution | ✓ Designed | ✗ Missing | **✗** | Routing doesn't use adapter tools |
| Policy Enforcement (L3) | ✓ Designed | ✗ Incomplete | **✗** | Hardcoded generic tools |
| Capability → Tool Mapping | ✓ Designed | ✗ Missing | **✗** | No registry for adapter tools |

**Verdict**: System has a **routing layer gap**. Skills and adapters are correct, but routing doesn't validate them.

---

## Recommended Fix Priority

### P0 (Gate G4 Blocker)
1. Register NBA adapter tools in bootstrap
2. Create capability → tool mapping
3. Update L3 tool resolution to use mapping
4. Add tests for tool resolution

### P1 (Protocol Compliance)
5. Verify other agencies don't have same issue (finance, gworkspace)
6. Document tool identity resolution in routing docs

### P2 (Observability)
7. Add telemetry for tool allowlist vs. skill-used tools
8. Audit logs showing adapter invocations

---

## Next Steps

1. **Verify assumption**: Check if other agencies (finance, gworkspace) have the same tool resolution issue
2. **Review**: Compare manifest design with bootstrap implementation
3. **Fix**: Implement NBA-specific tool registration and mapping
4. **Test**: Add routing-level validation tests for tool resolution
5. **Gate**: Verify G4 completion criteria with fixed implementation


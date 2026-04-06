# Handoff Document: Knowledge Agency Verification & Scalability Analysis

**Generated**: 2026-04-06T19:57:51+02:00  
**Context**: Kiloclaw CLI - Knowledge Agency Implementation (Phases 1-4 Complete)  
**For**: GPT 5.3 Codex (or equivalent LLM with code analysis + reasoning capabilities)  
**Objective**: Verify implementation, assess blueprint adherence, propose 2026 best practices for scalable modular agency architecture

---

## 1. Executive Summary

We have implemented a Knowledge Agency system in Kiloclaw CLI (a KiloCode fork) with 4 phases completed:

1. **Phase 1**: Orchestrator routing (Router + CapabilityRouter integration)
2. **Phase 2**: WebSearchTool enabled for all providers (removed gating)
3. **Phase 3**: Academic providers (arXiv, PubMed, CrossRef) integrated in LiteratureReviewSkill
4. **Phase 4**: SkillChain composition with 4 predefined chains and executor

**Critical Concern**: The current implementation registers ALL skills, agents, and chains at bootstrap time. As we add more agencies (creative, productivity, personal, analytics per blueprint), this will bloat the LLM context and payload. We need a **dynamic multi-level retrieval system**.

---

## 2. Implementation Verification Tasks

### 2.1 Verify Implementation Files

**Core Files Created/Modified**:

```
packages/opencode/src/
├── kiloclaw/
│   ├── agency/
│   │   ├── bootstrap.ts          # NEW - Registry initialization
│   │   ├── chain-executor.ts    # NEW - Chain execution engine
│   │   ├── index.ts             # MODIFIED - Export additions
│   │   ├── registry/            # EXISTING - Capability-based registries
│   │   │   ├── skill-registry.ts
│   │   │   ├── agent-registry.ts
│   │   │   ├── agency-registry.ts
│   │   │   └── chain-registry.ts
│   │   └── routing/
│   │       ├── capability-router.ts  # EXISTING - Capability-based routing
│   │       └── chain-composer.ts    # EXISTING - Chain composition
│   ├── orchestrator.ts          # MODIFIED - Full routing implementation
│   └── skills/knowledge/
│       ├── literature-review.ts # MODIFIED - Real API integration
│       ├── web-research.ts      # EXISTING
│       ├── fact-check.ts        # EXISTING
│       ├── synthesis.ts         # EXISTING
│       └── critical-analysis.ts # EXISTING
├── tool/
│   ├── registry.ts             # MODIFIED - Removed websearch gating
│   └── websearch.ts            # MODIFIED - Enhanced provider handling
└── flag/
    └── flag.ts                 # MODIFIED - KILOCLAW_KNOWLEDGE_FORCE_PROVIDER
```

**Your Task**: Verify each file exists, contains correct implementation, and compiles without errors.

### 2.2 Verify Routing Flow

```
User Query (e.g., "search ASUS ProArt TRX40")
    │
    ▼
CoreOrchestrator.routeIntent()
    ├── Router.route() → Domain: "knowledge" (keyword-based)
    ├── CapabilityRouter.routeTask() → Capability: "search"
    └── Returns: AgencyAssignment { agencyId: "agency-knowledge", confidence: 0.x }
            │
            ▼
    CapabilityRouter.findSkillsForCapabilities(["search"])
            │
            ▼
    ChainRegistry.findChainForCapabilities(["search"])
            │
            ▼
    executeChain() → WebResearchSkill → SynthesisSkill → FactCheckSkill
```

**Your Task**: Trace through code to verify this flow works end-to-end.

### 2.3 Verify Blueprint Adherence

From `docs/foundation/KILOCLAW_BLUEPRINT.md`, verify these acceptance criteria:

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Avvio Kiloclaw senza leggere config KiloCode | ✅ COMPLETE | src/kilocode/ eliminated |
| 2 | Routing gerarchico Core → Agency → Agent | ⚠️ PARTIAL | Orchestrator done, agent routing needs verification |
| 3 | **CapabilityRouter attivo** | ✅ COMPLETE | capability-router.ts implemented |
| 4 | Memoria 4-layer attiva | ✅ COMPLETE | memory/ directory exists |
| 5 | Audit trail completo per azioni high-impact | ⏳ IN CORSO | Needs verification |
| 6 | Migrazione ARIA config | ⏳ IN CORSO | env mapping exists |
| 7 | Guardrail proattivi con budget e kill-switch | ⏳ IN CORSO | guardrail/ directory exists |
| 8 | Telemetria/branding separati | ✅ COMPLETE* | Separated but @kilocode/ deps remain |
| 9 | **SkillChain composition** | ✅ COMPLETE | 4 chains registered |
| 10 | **Runtime registration** | ⏳ IN CORSO | Bootstrap exists, dynamic registration not yet |

**Your Task**: For each criterion, verify implementation and identify gaps.

---

## 3. Scalability Analysis & Problem Statement

### 3.1 Current Problem: Monolithic Bootstrap

**Current Implementation** (`bootstrap.ts`):

```typescript
export function bootstrapRegistries(): void {
  // Registers ALL agencies, skills, agents, chains at startup
  for (const agency of agencyDefinitions) { /* ... */ }
  for (const skill of allSkills) { /* ... */ }
  for (const chain of chainDefinitions) { /* ... */ }
  registerFlexibleAgents()  // 14 agents
}
```

**18 Skills** registered:
- Development: 6 (code-review, debugging, tdd, comparison, document-analysis, simplification)
- Knowledge: 5 (web-research, literature-review, fact-check, synthesis, critical-analysis)
- Nutrition: 4 (diet-plan, nutrition-analysis, food-recall, recipe-search)
- Weather: 3 (weather-forecast, weather-alerts, weather-current)

**14 Agents** registered (from agency-definitions.ts)

**Scalability Issue**: When we add 4 more agencies (creative, productivity, personal, analytics), we'll have:
- ~30+ Skills
- ~30+ Agents
- ~15+ Chains

All loaded in memory, all potentially exposed to LLM context even when not needed.

### 3.2 Desired: Dynamic Multi-Level Retrieval

```
┌─────────────────────────────────────────────────────────────┐
│                    LAYER 0: Agency Routing                   │
│  "Which agency handles this intent?"                        │
│  → Only load agency metadata, not full skills/agents        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    LAYER 1: Skill Discovery                  │
│  "Which skills does this agency have for this capability?" │
│  → Only load skill manifests for matching capabilities     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    LAYER 2: Agent Selection                 │
│  "Which agent can execute this skill?"                     │
│  → Only load agent definitions for selected skills         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    LAYER 3: Tool Resolution                  │
│  "Which tools does this agent need?"                       │
│  → Only load tool definitions when agent executes          │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 2026 Best Practices to Evaluate

Based on current architecture trends and the blueprint requirements, evaluate implementing:

#### A. Lazy Loading with Registry Proxy

```typescript
// Instead of: const skills = SkillRegistry.getAllSkills()
// Implement: Proxy that loads on demand

class LazySkillRegistry {
  private cache = new Map<string, Skill>()
  private manifest: SkillManifest[] = []  // Lightweight metadata
  
  async getSkill(skillId: string): Promise<Skill> {
    if (!this.cache.has(skillId)) {
      const manifest = this.manifest.find(m => m.id === skillId)
      if (manifest) {
        const module = await import(manifest.modulePath)
        this.cache.set(skillId, module[manifest.exportName])
      }
    }
    return this.cache.get(skillId)
  }
  
  async findByCapabilities(caps: string[]): Promise<SkillManifest[]> {
    // Query manifest only, no module loading
    return this.manifest.filter(m => 
      caps.some(c => m.capabilities.includes(c))
    )
  }
}
```

#### B. Manifest-Based Discovery

```typescript
// skill-manifest.json - loaded at startup (lightweight)
{
  "skills": [
    {
      "id": "web-research",
      "agency": "knowledge",
      "capabilities": ["search", "web", "information_gathering"],
      "module": "./skills/knowledge/web-research.js",
      "export": "WebResearchSkill",
      "version": "1.0.0",
      "tags": ["knowledge", "research"]
    }
  ]
}
```

#### C. Tiered Capability Index

```typescript
// Capability Index - hierarchical
const capabilityIndex = {
  "knowledge": {
    "search": ["web-research", "literature-review", "recipe-search"],
    "synthesis": ["synthesis"],
    "verification": ["fact-check", "source-verification"]
  },
  "development": {
    "coding": ["tdd", "debugging"],
    "review": ["code-review", "critical-analysis"]
  }
}
```

#### D. Agency-Scoped Context Windows

When LLM receives context, only include:
1. Agency policy for current domain
2. Skill manifests for requested capabilities
3. Relevant agent prompts (not all 14)

---

## 4. Verification Checklist for Codex

### 4.1 Code Integrity

- [ ] All modified files compile without errors (`bun run typecheck`)
- [ ] All tests pass (`bun test test/kiloclaw/agency/` - 164 tests)
- [ ] No circular dependencies in import graph
- [ ] Type safety maintained (no `any` leaks)

### 4.2 Routing Verification

- [ ] `Router.route()` correctly classifies knowledge queries
- [ ] `CapabilityRouter.routeTask()` finds appropriate skills
- [ ] `ChainRegistry.findChainForCapabilities()` returns chains
- [ ] Orchestrator falls back correctly on errors

### 4.3 Provider Integration

- [ ] arXiv API call works (no API key required)
- [ ] PubMed API call works (rate limited, no key required)
- [ ] CrossRef API call works (no API key required)
- [ ] WebSearchTool falls back to DDG when Tavily unavailable

### 4.4 Scalability Assessment

- [ ] Current bootstrap is functional
- [ ] Identify which components would fail at 10x scale
- [ ] Propose specific changes for lazy loading
- [ ] Evaluate manifest vs. full module loading tradeoffs

---

## 5. Questions for Codex to Answer

1. **Architecture**: Is the current 4-layer registry (Agency → Agent → Skill → Tool) the right abstraction, or should we flatten?

2. **Retrieval**: Should capability lookup be:
   - Synchronous (in-memory index) - fast but memory-heavy
   - Asynchronous (manifest query) - slower but scalable
   - Hybrid (hot cache + cold manifest)?

3. **LLM Context**: What's the best way to handle skill/agent selection in prompts without loading everything?
   - Option A: Pre-selection in orchestrator, only relevant in context
   - Option B: LLM receives full registry, decides itself
   - Option C: Two-phase (LLM selects category, then specific skill)

4. **Versioning**: How should we handle skill version compatibility when agencies evolve independently?

5. **Testing**: What integration tests would verify dynamic loading without loading everything?

---

## 6. Blueprint Reference

Full blueprint at: `docs/foundation/KILOCLAW_BLUEPRINT.md`

Key sections:
- Section 3: Architecture hierarchy (Intent → Core → Agencies → Agents → Skills → Tools)
- Section 3.2: Flexible capability-based types replacing enums
- Section 3.3: CapabilityRouter design
- Section 7: Agency expansion matrix
- Section 9: Anti-patterns to avoid (tool sprawl, config contamination)

---

## 7. Environment Details

```
Repository: /home/fulvio/coding/kiloclaw
Package: packages/opencode/
Branch: refactor/kilocode-elimination
Node: v20.18.0
Bun: v1.3.11
Test Results: 674 pass, 5 fail (pre-existing memory-persistence failures)
Typecheck: Pass (tsgo --noEmit)
```

---

## 8. Handoff Instructions

**For the next engineer/agent:**

1. Run `bun test test/kiloclaw/agency/` to verify core functionality
2. Execute `bun run typecheck` to ensure no compile errors
3. Review `bootstrap.ts` to understand current monolithic loading
4. Analyze `capability-router.ts` for routing logic
5. Propose lazy-loading architecture based on 2026 best practices
6. Create implementation plan for dynamic multi-level retrieval

**Deliverable**: 
- Gap analysis vs. blueprint acceptance criteria
- Architecture recommendation for scalable agency system
- Implementation plan with priority ordering

---

*This document is for internal handoff. Do not distribute externally.*

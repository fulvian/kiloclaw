# KiloClaw Agent Rules

**MANDATORY REFERENCE**: All coding agents MUST read and follow this file and the referenced operational documents before implementing any agency, agent, skill, or tool.

**Reference Documents (in order of precedence)**:

1. `docs/guide/KILOCLAW_AGENCY_AGENT_SKILL_TOOL_IMPLEMENTATION_GUIDE_2026-04-07.md` — Implementation Playbook
2. `docs/agencies/plans/KILOCLAW_AGENCY_IMPLEMENTATION_PROTOCOL_V2_2026-04-12.md` — Implementation Protocol
3. `docs/protocols/KILOCLAW_SYSTEM_CHECKUP_PROTOCOL_V1_2026-04-12.md` — System Checkup Protocol

---

## Phase Enforcement (CRITICAL)

**NEVER skip phases.** Implementation requires completing ALL gates in order:

| Phase          | Gate | Mandatory Before |
| -------------- | ---- | ---------------- |
| Discovery      | G1   | Research, Design |
| Research       | G2   | Tool Decision    |
| Design         | G3   | Implementation   |
| Implementation | G4   | Verification     |
| Verification   | G5   | Rollout          |
| Rollout        | G6   | Go-Live          |

**Blockers that halt progress**:

- `BLOCKER`: deny-by-default not implemented in session path
- `BLOCKER`: MCP not passing through central policy filter
- `BLOCKER`: provider/fallback metadata missing in search-like tool output
- `BLOCKER`: missing anti-regression test for the bug being fixed
- `BLOCKER`: naming/UI regression that masks the real provider

---

## The 5 Files Rule (MANDATORY for Every New Agency)

For each new agency, exactly **5 files** must be modified:

### 1. `packages/opencode/src/kiloclaw/agency/bootstrap.ts`

Add agency definition to `agencyDefinitions[]`.

### 2. `packages/opencode/src/kiloclaw/agency/routing/semantic/bootstrap.ts`

Add `bootstrap[Nome]Capabilities()` function and call it in `bootstrapAllCapabilities()`.

**CRITICAL BOOTSTRAP ORDER**:

```
1. bootstrapRegistries() — agencies, skills, agents, chains
2. bootstrapAllCapabilities() — capabilities for routing
```

Inverting this order causes silent routing failures.

### 3. `packages/opencode/src/kiloclaw/router.ts`

Add keywords to `DOMAIN_KEYWORDS` (50-100 per domain) and `CORE_KEYWORDS` (15-25 high-specificity).

### 4. `packages/opencode/src/session/prompt.ts` (~line 900)

Add agency context block with `CRITICAL TOOL INSTRUCTIONS`.

**CRITICAL ALIGNMENT**: Context block in `prompt.ts` MUST align with `tool-policy.ts` allowlist. If context block says "use skill X" but `tool-policy.ts` does not include skill X in the allowlist, the model will NOT have access to the tool.

### 5. `packages/opencode/src/session/tool-policy.ts`

Add tool allowlist and `map[Nome]CapabilitiesToTools()` mapping function.

---

## Implementation Protocol (BINDING)

Every agency/agent/skill/tool implementation MUST follow this protocol:

### Phase 1: Discovery (G1)

- Clarify real needs, constraints, risks, operational boundaries
- Output: `Discovery Brief` approved by stakeholder
- Gate G1: unambiguous requirements, measurable KPIs, signed risk limits

### Phase 2: Research (G2)

- Compare native vs MCP tools with scorecard (performance, token cost, reliability, security, maintenance)
- Output: `Tool Decision Record` with score and rationale
- Gate G2: tool decision with verifiable score and rationale

### Phase 3: Design (G3)

- Define Intent → Agency → Agent → Skill → Tool mapping and runtime policy
- Output: `Agency Manifest Draft` + flow diagram + policy
- Gate G3: deny-by-default active, explicit allowlist, defined fallback provider

### Phase 4: Implementation (G4)

- Implement minimal necessary components per approved design
- Output: code, config, manifest, migrations, operational notes
- Gate G4: green local build/test, passing routing tests, verified context block

### Phase 5: Verification (G5)

- Validate functionality, regressions, telemetry, operational security
- Output: test report + telemetry contract evidences
- Gate G5: complete minimum checklist and acceptance criteria satisfied

### Phase 6: Rollout (DIRECT) (G6)

- Full release to binary and user experience
- Output: changelog, runbook, on-call owner
- Gate G6: go-live authorized + post-release metrics within threshold

---

## Runtime Verification (OBLIGATORY after G5)

Before proceeding to G6, run this command and verify ALL 9 criteria:

```bash
bun run dev -- --print-logs --log-level DEBUG run "[domain-specific-query]"
```

**Required Criteria (9/9 must pass)**:

| #   | Criterion                            | Log Pattern                                     |
| --- | ------------------------------------ | ----------------------------------------------- |
| 1   | Agency routed correctly              | `agencyId=agency-[domain]`                      |
| 2   | Confidence ≥ 40%                     | `confidence=0.x` where x ≥ 0.4                  |
| 3   | Policy applied correctly             | `allowedTools=[...]` and correct `blockedTools` |
| 4   | Policy enforced = true               | `policyEnforced=true`                           |
| 5   | allowedTools contains only permitted | `allowedTools=[...]` only includes allowed      |
| 6   | blockedTools not invoked             | `blockedTools` contains only non-permitted      |
| 7   | Correct L1 capabilities              | `capabilities=[...]`                            |
| 8   | No "no tools resolved"               | absent from logs                                |
| 9   | Fallback NOT used in L3              | `L3.fallbackUsed=false`                         |

**Failure Protocol**: If ANY criterion fails:

1. Do NOT proceed to G6
2. Return to G4 with log evidence
3. Fix the failing component
4. Repeat runtime test after fix
5. Document root cause in Go/No-Go Review

---

## System Checkup Protocol (PERIODIC)

All agents MUST run periodic verification following `docs/protocols/KILOCLAW_SYSTEM_CHECKUP_PROTOCOL_V1_2026-04-12.md`.

### Daily Health Check (Automated)

```bash
# From project root
cd packages/opencode && bun test test/kiloclaw/ -- --grep "health" && \
bun run -e 'import{ServiceHealth}from"./src/kiloclaw/service-health";const r=await ServiceHealth.checkAll();console.log(r.allRequiredHealthy?"PASS":"FAIL")'
```

### Weekly Deep Check (Full Routing)

```bash
# Test all agency domains
for domain in knowledge development nutrition weather gworkspace nba; do
  bun run dev -- --print-logs --log-level DEBUG run "[test query for $domain]" | \
  grep -q "agencyId=agency-$domain" || { echo "FAIL: $domain"; exit 1; }
done
```

### Registry Consistency Check

```bash
cd packages/opencode && bun run -e '
import{AgencyRegistry}from"./src/kiloclaw/agency/registry/agency-registry"
import{SkillRegistry}from"./src/kiloclaw/agency/registry/skill-registry"
import{FlexibleAgentRegistry}from"./src/kiloclaw/agency/registry/agent-registry"
const agencies=AgencyRegistry.getAllAgencies()
const skills=SkillRegistry.getAllSkills()
const agents=FlexibleAgentRegistry.getAllAgents()
const domains=agencies.map(a=>a.domain)
if(domains.length!==new Set(domains).size)throw new Error("Duplicate domains")
if(skills.length<30)throw new Error("Too few skills:"+skills.length)
if(agents.length<10)throw new Error("Too few agents:"+agents.length)
console.log("PASS - A:"+agencies.length+" S:"+skills.length+" Ag:"+agents.length)
'
```

---

## Agency Component Verification (MANDATORY per Component)

### Agency Registry

- [ ] Registered in `AgencyRegistry` via `registerAgency()`
- [ ] Unique domain (no duplicates in `domainIndex`)
- [ ] `deny-by-default` policy active
- [ ] `allowedCapabilities` defined and non-empty
- [ ] `deniedCapabilities` defined
- [ ] `dataClassification` set (public|internal|confidential)
- [ ] `maxRetries` defined
- [ ] `requiresApproval` boolean correct

### Agent Registry

- [ ] Registered in `FlexibleAgentRegistry`
- [ ] Unique `id`
- [ ] `primaryAgency` points to existing agency
- [ ] `secondaryAgencies` point to existing agencies (if present)
- [ ] `capabilities` aligned with agency policy

### Skill Registry

- [ ] Registered in `SkillRegistry`
- [ ] Unique `id`
- [ ] `version` in semver format
- [ ] `inputSchema` validated
- [ ] `outputSchema` validated
- [ ] `capabilities` array non-empty
- [ ] `tags` array non-empty
- [ ] `findByCapabilities()` works
- [ ] `findByTag()` works

### Tool Registry

- [ ] Registered in `ToolRegistry`
- [ ] `id` unique
- [ ] `description` present
- [ ] `parameters` schema Zod validated
- [ ] `execute()` function implemented
- [ ] Present in allowlist for authorized agencies
- [ ] Blocked for unauthorized agencies

---

## Policy Levels (STANDARD - Use for All Agencies)

```typescript
export type PolicyLevel = "SAFE" | "NOTIFY" | "CONFIRM" | "HITL" | "DENY"
```

| Level   | When to Use                    | Examples                            |
| ------- | ------------------------------ | ----------------------------------- |
| SAFE    | Read-only ops, no side effects | Read data, search files             |
| NOTIFY  | Reversible side effects        | Send draft email, create temp files |
| CONFIRM | Significant impact             | Send final email, delete files      |
| HITL    | Irreversible or high risk      | Betting, trading, permanent changes |
| DENY    | Never allowed                  | Auto-bet, illegal operations        |

---

## API Keys Rule (STRICT)

**ALL KiloClaw API keys reside in ONE file only:**

```
~/.local/share/kiloclaw/.env
```

**Golden Rule**: NEVER any other `.env` file with API keys anywhere in the project.

To add a new provider:

1. Add keys to `.env`
2. Register provider in `key-pool.ts`
3. Verify with: `DOTENV_CONFIG_PATH=~/.local/share/kiloclaw/.env bun -e '...'`

---

## Anti-Patterns (FORBIDDEN)

### 1. Policy in Prompt (DO NOT)

```ts
// BAD - soft instruction, no hard gate
if (agencyId === "agency-knowledge") {
  prompt += "Usa websearch"
}
```

```ts
// GOOD - hard policy gate
const policy = resolveAgencyAllowedTools({ agencyId, enabled: Flag.KILO_ROUTING_AGENCY_CONTEXT_ENABLED, capabilities })
if (policy.enabled && !policy.allowedTools.includes(tool.id)) return
```

### 2. Duplicate Allowlists (DO NOT)

Maintain tool mapping in multiple disconnected files — causes divergence in production.

### 3. Vendor-Coupled Core (DO NOT)

Write `if provider === "X"` in orchestrator or pipeline.

### 4. Opaque Fallback (DO NOT)

Hide fallback chain and provider errors in metadata.

### 5. Incomplete Testing (DO NOT)

Stop at green unit test when bug was end-to-end.

---

## Best Practices from First Implementations

### 1. Bootstrap Order is Critical

If registries bootstrap before capabilities, routing fails silently. Always verify order.

### 2. Context Block + Tool Policy Alignment

Context block says "use skill X" but tool-policy.ts does not include skill X → model has no access. Verify alignment for every change.

### 3. Confidence Score ≠ Correct Routing

Confidence ≥ 40% does NOT guarantee correct routing. Model might ignore routing and use websearch. Always verify with runtime test that:

- Agency routed is correct
- Non-permitted tools are actually blocked (check logs: `blockedTools`)

### 4. Skill Loaded ≠ Skill Used

Even if skill is in context block, model might not use it. Explicit instructions like "use ONLY the 'skill' tool" are more effective than "you have access to X skill".

### 5. Keyword Coverage Balance

Too many keywords → other domains match accidentally.
Too few keywords → false negatives.
Target: 50-100 keywords per domain, 15-25 CORE_KEYWORDS high-specificity.

---

## Observability and Audit (MANDATORY)

### Telemetry Events (Required for All Routing Decisions)

- `routing.layer0`: agencyId, confidence, domain
- `routing.layer1`: capabilities, skillsFound
- `routing.layer2`: agentsFound, bestAgent
- `routing.layer3`: toolsResolved, toolsDenied
- `policy.denied`: agencyId, capability
- `policy.approved`: agencyId, capability

### Metrics (Minimum Required)

- p50/p95/p99 latency per layer L0-L3
- cache hit/miss for router and capability
- fallback ratio per layer
- `toolsDenied` and `blockedTools` count
- provider distribution and fallback chain depth

### Correlation ID

Every event must be correlatable with a unique `correlationId` end-to-end.

---

## Testing Requirements (MANDATORY)

### Suite Minimum

```
packages/opencode/test/session/tool-policy.test.ts
packages/opencode/test/kiloclaw/routing-pipeline.test.ts
packages/opencode/test/tool/websearch.test.ts
new domain-specific tests in packages/opencode/test/kiloclaw/
```

### Verification Commands

```bash
bun run --cwd packages/opencode typecheck
bun test --cwd packages/opencode test/session/tool-policy.test.ts test/kiloclaw/routing-pipeline.test.ts test/tool/websearch.test.ts
```

---

## Definition of Done (PR Merge Requirements)

Before any merge, confirm ALL of:

- [ ] Runtime hard policy blocks out-of-allowlist tools in all paths
- [ ] Core remains agnostic, providers resolved via catalog
- [ ] Audit chain L0-L3 present with reason and correlation
- [ ] Tests green and at least one regression-specific test added
- [ ] Documentation updated in `docs/` with operational impacts and rollout notes

---

## Rollout Strategy

### Sequence (after V2 Protocol)

1. `hard-gate canary`: enforcement on limited traffic
2. `full rollout`: expand after two cycles without regressions
3. `stabilize`: consolidate golden tests and regression suite

### Rollback

Immediate rollback via flag toggle without code rollback.

---

## Quick Reference: Adding New Agency

```
1. Edit bootstrap.ts                   → add agency definition
2. Edit semantic/bootstrap.ts          → add bootstrap[Nome]Capabilities()
3. Edit router.ts                      → add DOMAIN_KEYWORDS + CORE_KEYWORDS
4. Edit prompt.ts (~line 900)          → add agency context block
5. Edit tool-policy.ts                 → add allowlist + map[Nome]CapabilitiesToTools()
6. Add routing test for domain         → test/kiloclaw/routing-[domain].test.ts
7. Run runtime verification            → bun run dev -- --print-logs --log-level DEBUG run "[query]"
8. Verify 9/9 criteria pass            → all must be YES
9. Complete G5 checklist              → all items checked
10. Proceed to G6 if all pass          → go-live authorized
```

---

## Debugging Rules

- **NEVER** try to restart the app or server process.
- Use `--print-logs --log-level DEBUG` for detailed runtime info.
- Check `blockedTools` in logs to verify policy enforcement.
- Check `allowedTools` to verify correct tool exposure.

---

## Local Dev Notes

- `opencode dev web` proxies `https://app.opencode.ai` — local UI/CSS changes will NOT show there.
- For local UI changes, run backend and app separately:
  - Backend: `bun run --conditions=browser ./src/index.ts serve --port 4096` (from `packages/opencode`)
  - App: `bun dev -- --port 4444` (from `packages/app`)
  - Open `http://localhost:4444` → targets `http://localhost:4096`

---

## SolidJS Guidelines

- Always prefer `createStore` over multiple `createSignal` calls

---

## Tool Calling

- **ALWAYS USE PARALLEL TOOLS WHEN APPLICABLE**

---

## Browser Automation

Use `agent-browser` for web automation. Run `agent-browser --help` for all commands.

**Core workflow**:

1. `agent-browser open <url>` — Navigate to page
2. `agent-browser snapshot -i` — Get interactive elements with refs (@e1, @e2)
3. `agent-browser click @e1` / `fill @e2 "text"` — Interact using refs
4. Re-snapshot after page changes

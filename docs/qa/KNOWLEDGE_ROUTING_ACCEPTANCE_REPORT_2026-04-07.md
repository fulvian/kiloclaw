# Knowledge Routing Acceptance Report

Date: 2026-04-07
Scope: `docs/plans/KILOCLAW_KNOWLEDGE_ROUTING_RCA_PLAN_2026-04-07.md`
Status: Ready for commit/PR

## Acceptance Criteria Mapping

### 1) Web query routes to knowledge with visible provider metadata

- Routing and context propagation:
  - `packages/opencode/src/session/prompt.ts`
  - `packages/opencode/src/kiloclaw/agency/routing/pipeline.ts`
- Provider metadata surfaced by websearch:
  - `packages/opencode/src/tool/websearch.ts`
- Verified by tests:
  - `packages/opencode/test/kiloclaw/routing-pipeline.test.ts`
  - `packages/opencode/test/tool/websearch.test.ts`

Result: PASS

### 2) Unauthorized Exa/MCP-like search tools blocked in knowledge agency

- Hard gate in session tool resolution for native + MCP tools:
  - `packages/opencode/src/session/prompt.ts`
  - `packages/opencode/src/session/tool-policy.ts`
- L3 routing policy result with blocked/denied tools:
  - `packages/opencode/src/kiloclaw/agency/routing/pipeline.ts`
  - `packages/opencode/src/kiloclaw/telemetry/routing.metrics.ts`
- Verified by tests:
  - `packages/opencode/test/session/tool-policy.test.ts`
  - `packages/opencode/test/kiloclaw/routing-pipeline.test.ts`

Result: PASS

### 3) No runtime CLI string "Exa Web Search"

- Updated runtime labels:
  - `packages/opencode/src/cli/cmd/run.ts`
  - `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx`
  - `packages/opencode/src/cli/cmd/tui/routes/session/permission.tsx`
- Related docs/prompt cleanup:
  - `packages/opencode/src/tool/websearch.txt`
  - `packages/opencode/src/command/template/review.txt`
- Verified by grep (runtime path): no matches for `Exa Web Search`

Result: PASS

### 4) Routing knowledge tests green

Executed:

```bash
bun test test/kiloclaw/routing-pipeline.test.ts test/kiloclaw/router-typo.test.ts test/kiloclaw/agency/routing/intent-classifier.test.ts test/session/tool-policy.test.ts test/tool/websearch.test.ts
```

Observed: 32 pass, 0 fail.

Result: PASS

### 5) Audit trail includes L0-L3 and reason chain

- Session-level routing audit log with L0/L1/L2/L3 payload:
  - `packages/opencode/src/session/prompt.ts`
- L0-L3 telemetry events:
  - `packages/opencode/src/kiloclaw/telemetry/routing.metrics.ts`

Result: PASS

## Additional Hardening Completed

- Typo and multilingual tolerance added for routing/classification:
  - `packages/opencode/src/kiloclaw/router.ts`
  - `packages/opencode/src/kiloclaw/agency/routing/intent-classifier.ts`
- Core L3 policy made more agnostic (requested tool candidates are input-driven):
  - `packages/opencode/src/kiloclaw/agency/routing/pipeline.ts`

## Verification Commands

```bash
bun run --cwd packages/opencode typecheck
bun test --cwd packages/opencode test/kiloclaw/routing-pipeline.test.ts test/kiloclaw/router-typo.test.ts test/kiloclaw/agency/routing/intent-classifier.test.ts test/session/tool-policy.test.ts test/tool/websearch.test.ts
```

Status: Verified locally.

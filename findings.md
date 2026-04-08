# Findings — Kiloclaw Foundation

## Current KiloCode Baseline (kiloclaw clone)

- TS monorepo con core in `packages/opencode`
- Sistema agenti già presente (`Agent.Info`, prompt per `code/plan/debug/ask/orchestrator`)
- Tooling unificato via `Tool.define` e `TaskTool` (subagent spawning)
- Config multilayer con compatibilità `kilo.json(c)` + `opencode.json(c)`
- Modalità legacy migration da `.kilocode` verso config corrente

## ARIA Capabilities to Migrate

- Orchestrator gerarchico con agency routing (domain-aware)
- Memoria 4-layer:
  - Working (contesto sessione)
  - Episodic (episodi con outcome/feedback)
  - Semantic (facts/knowledge)
  - Procedural (workflows appresi)
- Agency catalog/registry/persistence
- Config isolata ARIA\_\* + moduli dominio (knowledge/nutrition/weather)
- Skill registry esteso (knowledge/dev/nutrition/weather)
- Knowledge agency multi-provider con fallback
- Guardrails/proactivity budgeting
- Scheduler task persistente

## Architectural Gap Summary

- KiloCode ha agent framework pronto ma non un layer "Agency domain OS" completo
- KiloCode non espone nativamente un memory model 4-layer robusto
- KiloCode usa configurazione general-purpose, ARIA ha config dominio e provider-specific
- ARIA è Go; Kiloclaw target è TS: necessaria migrazione concettuale, non porting 1:1 codice

## Integration Direction

- Implementare in Kiloclaw un "ARIA Runtime Layer" in TS sopra i primitive già presenti (Agent/Tool/Session)
- Evitare hard-fork fragile: estendere con namespace/moduli dedicati (`src/aria/**` o `src/claw/**`)
- Allineare persistenza memoria a DB/session store esistente, aggiungendo collection/tabelle nuove

## Reassessment Findings (2026-04-07)

- `orchestrator.ts` still contains permissive defaults (default route and allow-all policy path).
- Proactivity controls (`trigger`, `budget`, `scheduler`, `limits`) are mostly local/in-memory and not durable end-to-end.
- Memory lifecycle has explicit production placeholders in broker/lifecycle code.
- Knowledge skills `web-research` and `literature-review` include mock placeholders, reducing verifiability.
- Existing tests validate contracts and happy paths well, but do not yet prove durable recovery and strict policy-first enforcement.
- `.workflow/state.md` and planning artifacts required re-baselining to align declared phase with observed runtime maturity.

## Implementation Findings (2026-04-07, Wave 1-5)

- Policy mode split (`strict|compat`) is now explicit and traceable with correlation evidence on each decision.
- Append-only audit store and query layer provide durable event recovery across orchestrator re-instantiation.
- Proactivity runtime now includes durable task ledger FSM and reconciliation path for stale running tasks (`lost`).
- Isolation enforcement now has strict blocking and compat reporting mode for blocked namespaces (`KILO_`, `OPENCODE_`, `ARIA_`).
- Knowledge skills now return provider-based citations/evidence instead of placeholder content, with offline-safe fallback behavior.

## Runtime Isolation Findings (2026-04-07, Dev Startup)

- Root `bun run dev` behavior was affected by legacy config/skill discovery from both project `.kilocode/` and home `~/.kilocode/`.
- Branding fix alone (`KILO_BRAND_NAME=kiloclaw`) was insufficient to prevent legacy behavioral contamination.
- Effective root-cause fix required explicit legacy discovery gate (`KILO_DISABLE_KILOCODE_LEGACY`) plus filtering in config and skill path resolution.
- With isolated XDG runtime dirs and legacy gate enabled, `debug skill` no longer surfaces `.kilocode`-sourced skill locations in dev runtime output.

## Stabilization Findings (2026-04-07, Recovery Finalization)

- Recovery integration on `refactor/kilocode-elimination` is stable and keeps `bun run dev` in Kiloclaw mode.
- Full Kiloclaw suite now passes after integration hardening: `797 pass, 3 skip, 0 fail` (`bun run --cwd packages/opencode test test/kiloclaw/`).
- Wave 6 staging gate script completes with local verification green and active staging context checks passing.

## Scheduled Tasks Persistence Fix (2026-04-08)

### Bug: Tasks Lost Between CLI Sessions

**Symptom**: Tasks created in the TUI wizard appear during the same session but disappear after restarting the CLI.

**Root Cause**: Multiple read functions in `scheduler.store.ts` were missing `initDb()` call:

- `list()`, `getPending()`, `getRun()`, `getRuns()`, `getDLQEntry()`, `getDLQ()`
- These functions checked `if (_sqlite)` without first ensuring `initDb()` was called
- If `list()` was called FIRST (before any write operation), `_sqlite` remained `null`
- The database path was correct (XDG-compliant), but queries never reached it

**Fix**: Added `if (!_dbInitialized) initDb()` to all read functions missing it.

**Files Changed**: `packages/opencode/src/kiloclaw/proactive/scheduler.store.ts`

**Commit**: Fixed in `scheduler.store.ts` - added missing `initDb()` calls to read functions

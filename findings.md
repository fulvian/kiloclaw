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
- Config isolata ARIA_* + moduli dominio (knowledge/nutrition/weather)
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

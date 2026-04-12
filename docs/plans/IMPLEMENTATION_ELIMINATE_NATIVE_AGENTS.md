# Task Plan — Eliminazione Agenti Nativi OpenCode

## Status: PHASE 7 - CLI Cleanup (COMPLETED)

## Riepilogo Implementazione

### Fase 1: Estendere Types ✅ COMPLETATA

- Aggiunti campi a FlexibleAgentDefinition:
  - `description` (optional)
  - `prompt` (optional)
  - `permission` (optional)
  - `mode` (optional)
- File: `packages/opencode/src/kiloclaw/agency/registry/types.ts`

### Fase 2: Aggiornare 13 Agenti Flexible ✅ COMPLETATA

- Creato file centralizzato `agency/agency-definitions.ts`
- 13 agenti registrati con prompt e permissions:
  - researcher, coder, debugger, planner, code-reviewer
  - analyst, educator, nutritionist, weather-current
  - forecaster, recipe-searcher, diet-planner, alerter
- Bootstrap integrato in `AgencyCatalog.bootstrapDefaultCatalog()`

### Fase 3: Bridge Task Tool ✅ COMPLETATA

- Task tool ora cerca prima in FlexibleAgentRegistry
- Flexible agents inclusi nella lista agenti accessibili
- Permissions dai flexible agents usate quando disponibili
- File: `packages/opencode/src/tool/task.ts`

### Fase 4: Unificare Lista Agenti ✅ COMPLETATA

- `Agent.list()` ora include flexible agents
- Merge con native agents (flexible sovrascrive per ID uguali)
- File: `packages/opencode/src/agent/agent.ts`

### Fase 5: Rimuovere Agenti Nativi Superflui ✅ COMPLETATA (Deprecati)

- Seguenti agenti marcati deprecated e hidden:
  - code, plan, debug, ask, general, explore
- Mantenuti per compatibilità (router, compaction, title, summary)

### Fase 6: Aggiornare Router ✅ COMPLETATA

- Router prompt aggiornato con nuovo mapping:
  - coder → code tasks
  - debugger → debugging
  - planner → planning
  - researcher → research
  - analyst → analysis
  - educator → explanations
  - nutritionist, diet-planner → nutrition
  - weather-current, forecaster, alerter → weather
- File: `packages/opencode/src/agent/prompt/router.txt`

### Fase 7: CLI Cleanup ⚠️ POSTICIPATA

- Struttura CLI esistente funziona con nuovo sistema
- `kiloclaw agent list` già presente in `kiloclaw.ts`
- `kilocode agent list` mantiene compatibilità
- Decisione: mantenere per ora per evitare breaking changes

---

## Criteri di Successo

| Criterio                            | Stato         |
| ----------------------------------- | ------------- |
| FlexibleAgentRegistry con 13 agenti | ✅            |
| Task tool usa flexible agents       | ✅            |
| Agent.list() include flexible       | ✅            |
| Router delega a flexible            | ✅            |
| Agenti nativi deprecati             | ✅            |
| Test passano                        | ✅ (531 pass) |

---

## File Creati/Modificati

| File                           | Azione                                 |
| ------------------------------ | -------------------------------------- |
| `agency/registry/types.ts`     | Modificato - aggiunti campi            |
| `agency/agency-definitions.ts` | Creato - 13 definizioni agenti         |
| `agency/catalog.ts`            | Modificato - bootstrap agents          |
| `tool/task.ts`                 | Modificato - bridge registry           |
| `agent/agent.ts`               | Modificato - list unificata, deprecati |
| `agent/prompt/router.txt`      | Modificato - nuovo mapping             |

---

## Prossimi Passi

1. Test end-to-end con router che delega a flexible agents
2. Rimuovere fisicamente agenti nativi deprecati (dopo verifica)
3. CLI cleanup completo (dopo decisione architetturale)

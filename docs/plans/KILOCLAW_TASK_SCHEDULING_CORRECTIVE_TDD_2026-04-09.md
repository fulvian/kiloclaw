---
title: "Technical Design Correttivo - Task Scheduling"
description: "Correzione strutturale di routing TUI, runtime execution e coerenza control/data plane"
date: "2026-04-09"
status: "completato"
depends_on:
  - "docs/analysis/KILOCLAW_PROACTIVITY_SCHEDULING_SYSTEM_AUDIT_2026-04-09.md"
---

# KILOCLAW Task Scheduling - Technical Design Correttivo (TDD)

## 0. Esito implementazione

Correttivo completato il 2026-04-09 con chiusura dei difetti P0/P1 pianificati.

- parser unico di routing `/tasks` in TUI
- executor adapter reale in daemon, con stop ai `success` fittizi
- modalita daemon-managed a loop singolo per scheduling
- `run-now` con reason code tipizzati
- selettore task allineato su `tsk_...`, nome task e `#index`

## 1. Obiettivo

Correggere in modo definitivo i difetti P0/P1 del sistema task scheduling, con priorita su:

- modifica task da TUI realmente operativa
- esecuzione task reale e verificabile (no success fittizi)
- comportamento coerente tra CLI, TUI, daemon, engine e store
- riduzione del rischio regressioni tramite test automatici mirati

Vincolo: intervento incrementale, senza redesign totale del sottosistema proattivita.

## 2. Problemi da risolvere (input design)

1. Routing slash `/tasks ...` non allineato al command registry (comandi dinamici non risolti).
2. Executor daemon non implementa lavoro reale (placeholder), con run potenzialmente marcate come success.
3. `run-now` CLI/TUI invocabile in configurazioni senza executor valido.
4. Doppio loop di scheduling nello stesso processo (daemon tick + engine tick).
5. Modello stato `status/state` incoerente e incompleto.
6. Copertura test insufficiente su flussi TUI task.

## 3. Principi tecnici

1. **Single dispatch authority**: un solo loop autorevole per dispatch task in runtime persistente.
2. **No fake success**: se non esiste executor operativo, la run fallisce con reason code tecnico.
3. **Control plane unificato**: stessa semantica mutazioni task in CLI e TUI.
4. **Backward compatibility controllata**: mantenere `status` in read/write transitorio, ma convergere su `state`.
5. **Observable by default**: ogni path di errore produce segnale utente + log strutturato.

## 4. Architettura target correttiva

## 4.1 Control plane

Introdurre un servizio applicativo unico per mutazioni task:

- nuovo modulo: `packages/opencode/src/kiloclaw/proactive/scheduler-control.service.ts`
- API minime:
  - `createTask(input)`
  - `updateTask(taskId, patch)`
  - `pauseTask(taskId)`
  - `resumeTask(taskId)`
  - `runNow(taskId, runType="manual")`
  - `deleteTask(taskId, opts)`
  - `replayDlq(entryId)`

CLI (`cli/cmd/task.ts`) e TUI (`cli/cmd/tui/app.tsx`) devono chiamare questo servizio, non manipolare store/engine in modo divergente.

## 4.2 Task command routing TUI

Sostituire routing implicito dinamico con parser e dispatch espliciti:

- nuovo modulo: `packages/opencode/src/cli/cmd/tui/task-command-router.ts`
- contratto:
  - `parseTasksCommand(input: string): TaskCommandIntent`
  - `dispatch(intent, handlers): void`

Intent supportati:

- `list`, `new`, `help`, `show(taskId)`, `edit(taskId)`, `runs(taskId)`, `dlq`, `pause(taskId)`, `resume(taskId)`, `run(taskId)`, `delete(taskId)`

In `prompt/index.tsx` eliminare trigger `task.<azione>.<id>` non registrati e delegare al router con chiamata diretta ai callback app-level.

## 4.3 Runtime execution

Definire adapter executor reale:

- nuovo modulo: `packages/opencode/src/kiloclaw/proactive/task-executor-adapter.ts`
- responsabilita:
  - validare `triggerConfig`
  - risolvere azione da eseguire (prompt/action pipeline)
  - emettere risultato strutturato (`ok`, `errorCode`, `errorMessage`, `evidenceRefs`)

Daemon:

- `runtime/daemon.ts` registra sempre l'adapter reale quando `executionEnabled=true`
- se adapter non disponibile: `start()` fallisce con log esplicito e stato `error`

Engine:

- mantenere outcome tecnico `executor_missing`
- vietare transizione a `success` in qualunque path senza lavoro eseguito

## 4.4 Eliminazione doppio loop

Decisione correttiva:

- **Daemon e unico scheduler loop autorevole**
- Engine usato come libreria di esecuzione (`executeTask`, `processDLQ`) senza `setInterval` interni in modalita daemon-managed

Implementazione:

- `scheduler.engine.ts`: aggiungere modalita `start({ mode: "standalone" | "daemon" })`
  - `standalone`: comportamento attuale (tick interni)
  - `daemon`: nessun timer interno; solo stato engine + metodi invocabili
- `runtime/daemon.ts`: chiamare `start({ mode: "daemon" })`

## 4.5 Stato canonico task

Fase correttiva (non migrazione completa):

- estendere `UpdateTaskInputSchema` per accettare `state`
- su update mutativo, dual-write controllato:
  - `state -> status` mapping compat
  - `status` deprecato per query runtime
- `getPending()` usa `state='active'` come primaria, con fallback compat su `status` per record legacy

## 4.6 Run-now coerente

`run-now` deve transitare da `SchedulerControlService.runNow`:

- verifica prerequisiti executor
- crea run con `runType="manual"`
- ritorna esito typed (`accepted`, `reasonCode`, `runId`)
- messaggistica utente esplicita su blocchi (executor assente, policy denied, budget exceeded)

## 5. File plan (modifiche previste)

## 5.1 Nuovi file

- `packages/opencode/src/kiloclaw/proactive/scheduler-control.service.ts`
- `packages/opencode/src/kiloclaw/proactive/task-executor-adapter.ts`
- `packages/opencode/src/cli/cmd/tui/task-command-router.ts`
- `packages/opencode/test/cli/tui-task-command-router.test.ts`
- `packages/opencode/test/kiloclaw/scheduler-control.service.test.ts`

## 5.2 File da modificare

- `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`
- `packages/opencode/src/cli/cmd/tui/app.tsx`
- `packages/opencode/src/cli/cmd/tui/ui/dialog-task-help.tsx`
- `packages/opencode/src/cli/cmd/task.ts`
- `packages/opencode/src/kiloclaw/proactive/runtime/daemon.ts`
- `packages/opencode/src/kiloclaw/proactive/scheduler.engine.ts`
- `packages/opencode/src/kiloclaw/proactive/scheduler.store.ts`
- `packages/opencode/test/cli/task-command.test.ts`
- `packages/opencode/test/kiloclaw/scheduled-task-runtime.test.ts`

## 6. Sequenza di implementazione

## Fase A (P0) - Routing TUI + Help + Edit

Deliverable:

- router slash centralizzato
- `/tasks edit <id>` apre wizard con `taskId`
- `/tasks help` apre dialog help reale

Verifica:

- test parser/dispatch green
- smoke manuale TUI: `new -> list -> show -> edit`

## Fase B (P0) - Executor reale + run-now affidabile

Deliverable:

- adapter executor in daemon
- `run-now` CLI/TUI via `SchedulerControlService`
- error handling tipizzato su prerequisiti mancanti

Verifica:

- test integrazione run-now con executor presente/assente
- nessun caso di `success` senza execution evidence

## Fase C (P0/P1) - Single loop scheduling

Deliverable:

- engine mode `daemon`
- rimozione duplicazione dispatch timers in daemon runtime path

Verifica:

- test su no doppio execute nello stesso tick window
- test leader lease + tick behavior

## Fase D (P1) - Stato canonico compat

Deliverable:

- `state` aggiornabile via store
- pending query guidata da `state`
- compat mapping verso `status`

Verifica:

- test transizioni `active/running/paused/dlq`
- UI mostra `running` su eventi reali

## 7. Strategia test

## 7.1 Unit

- router TUI: parsing e dispatch di tutti i comandi `/tasks`
- scheduler control service: mutazioni e reason codes
- store: dual-write `state/status` e query pending

## 7.2 Integration

- CLI `task run-now` con executor disponibile/non disponibile
- daemon start in `executionEnabled=true` senza adapter -> fail-fast
- daemon start con adapter valido -> execute reale e run persistita

## 7.3 E2E TUI (target minimo)

- `tasks new -> list -> show -> edit -> save -> show`
- `pause/resume/run/delete` con conferme e toasts corretti

## 8. SLO e acceptance correttiva

La fase correttiva e completata quando:

1. `/tasks edit <id>` funziona in TUI senza workaround.
2. `run-now` fallisce esplicitamente se executor non disponibile, senza false success.
3. Daemon non esegue doppio dispatch loop.
4. Nessuna run `success` senza evidenza di execution adapter.
5. Tutti i nuovi test P0 passano stabilmente in CI.

## 9. Rollout e rollback

Feature flags coinvolte:

- `KILOCLAW_TASK_ACTIONS_EXEC`
- `KILOCLAW_DAEMON_RUNTIME_ENABLED`
- `KILOCLAW_DAEMON_EXECUTION_ENABLED`
- `KILOCLAW_TASK_STATE_V2`

Rollout:

1. Ring locale maintainer
2. Canary interna
3. Attivazione progressiva default

Rollback rapido:

- disattivare execution runtime via env
- mantenere control plane read-only (list/show/runs/dlq)

## 10. Rischi residui

1. Coupling tra adapter e pipeline action non ancora standardizzata.
2. Legacy moduli scheduler/service/worker ancora presenti nel codebase.
3. Migrazione completa a `state` richiede step successivo oltre questa correzione.

## 11. Decisioni architetturali esplicite

1. Non introdurre nuove dipendenze esterne (YAGNI).
2. Non rifare l'intero sistema proattivita in questa iterazione.
3. Correggere prima affidabilita operativa, poi ottimizzare osservabilita avanzata.

## 12. Output atteso della fase tecnica

Alla fine dell'implementazione correttiva, il sistema deve offrire:

- UX TUI task coerente e completa per i comandi dichiarati
- runtime con esecuzione reale verificabile
- semantica allineata CLI/TUI
- base stabile per successiva rifondazione completa `state` e timeline

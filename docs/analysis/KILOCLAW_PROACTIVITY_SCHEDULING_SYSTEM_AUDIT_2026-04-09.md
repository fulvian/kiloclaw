# KiloClaw Proactivity & Task Scheduling - Audit sistemico (stato reale)

Data: 2026-04-09  
Autore: audit tecnico statico su codice sorgente (`packages/opencode/src`) e test (`packages/opencode/test`)

## 1) Obiettivo e contesto

Questo documento analizza in modo sistematico l'architettura e l'implementazione reale del sistema di proattivita e scheduling task di KiloClaw, con focus su:

- gestione task (create/list/show/edit/pause/resume/run/delete)
- esecuzione runtime (daemon + scheduler engine)
- coerenza control plane (CLI/TUI) vs data plane (engine/store)
- osservabilita, testabilita, operabilita

Baseline di confronto: `docs/plans/KILOCLAW_TASK_SCHEDULING_REFOUNDATION_PLAN_2026-04-09.md`.

## 2) Executive summary

Stato complessivo: **criticita alta (P0)** per affidabilita runtime e gestione operativa da TUI.

Il sistema ha ricevuto miglioramenti importanti (es. path DB canonico, dialog di conferma delete, separazione wizard route), ma rimangono blocchi strutturali che spiegano i sintomi riportati dagli utenti:

1. **Modalita modifica task da slash non realmente funzionante**: `/tasks edit <id>` viene triggerato ma non esiste un comando registrato corrispondente, quindi l'azione non parte.
2. **Task "eseguiti" senza lavoro reale**: l'executor del daemon e un placeholder/no-op; i run possono risultare successful senza eseguire business logic.
3. **Esecuzione manuale (`run-now`) fragile o nulla**: CLI/TUI inizializzano l'engine senza registrare executor, con outcome `executor_missing`.
4. **Doppio loop di scheduling nello stesso processo (daemon tick + engine tick)**: rischio di semantica confusa e comportamento non deterministico.
5. **Gap test elevato su TUI slash/task-flow**: regressioni sui comandi `/tasks ...` non intercettate.

## 3) Metodo di analisi

Analisi statica del codice e delle interazioni tra moduli:

- Runtime: `runtime/daemon.ts`, `scheduler.engine.ts`, `scheduler.store.ts`
- Control plane: `cli/cmd/task.ts`, `cli/cmd/daemon.ts`, TUI (`app.tsx`, parser prompt, dialog task)
- Health/operabilita: `service-health.ts`, `runtime/service-manager.ts`
- Testing: `task-command.test.ts`, `scheduled-task-runtime.test.ts`, `daemon-lease.test.ts`

## 4) Architettura reale attuale

### 4.1 Control plane

- CLI task CRUD/ops presente in `packages/opencode/src/cli/cmd/task.ts`.
- TUI task UI presente in `packages/opencode/src/cli/cmd/tui/ui/*task*.tsx`.
- Parser slash `/tasks ...` locale in `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx:625`.

### 4.2 Data plane

- Store SQLite con tabelle task/runs/dlq/lease in `packages/opencode/src/kiloclaw/proactive/scheduler.store.ts:213`.
- Scheduler engine in `packages/opencode/src/kiloclaw/proactive/scheduler.engine.ts`.
- Daemon runtime in `packages/opencode/src/kiloclaw/proactive/runtime/daemon.ts`.

### 4.3 Overlay legacy

Coesistono componenti legacy/alternative (`scheduler.ts`, `scheduler-service.ts`, `worker.ts`) non integrate nel percorso principale TUI/CLI. Questo aumenta complessita e rischio divergenza semantica.

## 5) Evidenze principali (con impatto diretto)

## 5.1 `/tasks edit/show/runs/...` da prompt non instradati correttamente (P0)

**Evidenze**

- Parser slash triggera valori dinamici: `task.show.<id>`, `task.edit.<id>`, `task.runs.<id>`, `task.delete.confirm.<id>`, ecc. in `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx:638`.
- Command dispatcher matcha solo valore esatto (`option.value === name`) in `packages/opencode/src/cli/cmd/tui/component/dialog-command.tsx:74`.
- In app sono registrati solo `task.list` e `task.new` (`packages/opencode/src/cli/cmd/tui/app.tsx:417`, `packages/opencode/src/cli/cmd/tui/app.tsx:431`).

**Conseguenza**

- Da slash, molte azioni task risultano no-op (inclusa edit), quindi l'utente percepisce assenza di modalita modifica/cancellazione.

## 5.2 Help `/tasks` non raggiungibile operativamente (P1)

**Evidenze**

- Parser triggera `task.help` in `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx:643`.
- `DialogTaskHelp` esiste ma non risulta collegato a un comando registrato: `packages/opencode/src/cli/cmd/tui/ui/dialog-task-help.tsx:7`.

**Conseguenza**

- L'help e presente come componente ma non attivabile via command registry standard.

## 5.3 Esecuzione task: executor daemon placeholder/no-op (P0)

**Evidenze**

- Daemon registra un executor che in shadow logga e ritorna; in execution mode fa solo `log.debug("executor called")`, senza esecuzione payload (`packages/opencode/src/kiloclaw/proactive/runtime/daemon.ts:295`).
- Engine considera `await taskExecutor(...)` come successo operativo e aggiorna run/task (`packages/opencode/src/kiloclaw/proactive/scheduler.engine.ts:507`, `packages/opencode/src/kiloclaw/proactive/scheduler.engine.ts:535`).

**Conseguenza**

- Anche con run registrate, il lavoro utente puo non avvenire mai.
- Sintomo coerente: "task non si e avviato / non e successo niente".

## 5.4 Doppio loop di scheduling nel daemon (P0)

**Evidenze**

- Daemon avvia engine (`ProactiveSchedulerEngine.start()`) in `packages/opencode/src/kiloclaw/proactive/runtime/daemon.ts:317`.
- Engine avvia il proprio tick interval in `packages/opencode/src/kiloclaw/proactive/scheduler.engine.ts:286`.
- Daemon avvia anche un tick loop separato (`startTickLoop`) in `packages/opencode/src/kiloclaw/proactive/runtime/daemon.ts:326`.

**Conseguenza**

- Due meccanismi concorrenti tentano dispatch nello stesso processo, con semantica confusa e rischio di race/logica duplicata.

## 5.5 Shadow mode non realmente "read-only" (P0)

**Evidenze**

- Daemon tick in shadow mode ritorna prima di eseguire (`packages/opencode/src/kiloclaw/proactive/runtime/daemon.ts:217`).
- Ma engine tick resta attivo e invoca executor no-op; outcome puo diventare success e avanzare schedule (`packages/opencode/src/kiloclaw/proactive/scheduler.engine.ts:390`, `packages/opencode/src/kiloclaw/proactive/scheduler.engine.ts:535`).

**Conseguenza**

- Modalita shadow puo alterare stato/run invece di limitarsi a simulazione/log.

## 5.6 `run-now` CLI/TUI con executor assente (P0)

**Evidenze**

- CLI `task run-now` fa `init()+start()` engine ma non fa `setExecutor(...)` (`packages/opencode/src/cli/cmd/task.ts:277`).
- Engine non parte senza executor (`packages/opencode/src/kiloclaw/proactive/scheduler.engine.ts:274`).
- TUI run-now ha stesso pattern (`packages/opencode/src/cli/cmd/tui/app.tsx:906`).

**Conseguenza**

- Esecuzione manuale puo fallire sistematicamente o restituire outcome non utile all'utente.

## 5.7 Gate feature flag con semantiche incoerenti (P1)

**Evidenze**

- `Flag.KILOCLAW_DAEMON_RUNTIME_ENABLED` richiede opt-in (`truthy`) in `packages/opencode/src/flag/flag.ts:150`.
- Loader daemon usa `env !== "false"`, quindi default runtime-enabled in `packages/opencode/src/kiloclaw/proactive/runtime/daemon.ts:56`.

**Conseguenza**

- Divergenza tra health/control plane e comportamento runtime reale.

## 5.8 Stato canonico incompleto: `status` prevale su `state` (P1)

**Evidenze**

- Schema include `state` (`packages/opencode/src/kiloclaw/proactive/scheduler.store.ts:27`), ma update non accetta `state` (`packages/opencode/src/kiloclaw/proactive/scheduler.store.ts:124`).
- Pending query filtra solo `status='active'` (`packages/opencode/src/kiloclaw/proactive/scheduler.store.ts:686`).
- UI usa parzialmente `state===running` (`packages/opencode/src/cli/cmd/tui/ui/dialog-task-list.tsx:214`), ma engine non setta mai `state=running`.

**Conseguenza**

- Stato running/non-running non e affidabile end-to-end.

## 5.9 Path DB: gap piano precedente risolto (chiusura parziale)

**Evidenze**

- Store usa path canonico `.kilocode/proactive.db` sotto `XDG_DATA_HOME/.../kiloclaw` (`packages/opencode/src/kiloclaw/proactive/scheduler.store.ts:298`).
- Service install imposta stesso path (`packages/opencode/src/cli/cmd/daemon.ts:380`, `packages/opencode/src/cli/cmd/daemon.ts:469`).

**Conseguenza**

- La divergenza `.kiloclaw` vs `.kilocode` indicata nel piano appare risolta nel codice attuale.

## 6) Matrice gap: piano vs stato reale

| Area                   | Piano rifondazione             | Stato attuale                                         | Esito               |
| ---------------------- | ------------------------------ | ----------------------------------------------------- | ------------------- |
| Path DB canonico       | Unificare                      | Unificato su `.kilocode/proactive.db`                 | Parzialmente chiuso |
| Edit flow TUI          | Separare edit/show             | Route wizard separata, ma slash edit non instradato   | Aperto critico      |
| Delete safety          | Conferma distruttiva           | Presente su delete task e remove DLQ                  | Chiuso              |
| Executor required      | Fail-fast e no success fittizi | Start richiede executor, ma daemon usa executor no-op | Aperto critico      |
| Runtime execution      | Esecuzione reale affidabile    | Placeholder/no-op, run potenzialmente "success"       | Aperto critico      |
| State machine canonica | `state` unico                  | dual status/state ancora dominante                    | Aperto              |
| Parser/help allineati  | Coerenza completa              | parser esteso, ma trigger non registrati              | Aperto critico      |
| Test TUI E2E           | Gate obbligatori               | assenti per `/tasks` flow                             | Aperto critico      |

## 7) RCA aggiornate (focus incidenti utente)

### RCA-A - "Non posso modificare task"

- Causa prossima: trigger slash dinamici non risolti dal dispatcher a match esatto.
- Causa sistemica: assenza di un command router parametrico (`task.edit.<id>` non normalizzato).

### RCA-B - "Task non partito"

Possibili rami concorrenti, tutti presenti nel codice:

1. Daemon non attivo (nessun worker persistente operativo).
2. Daemon attivo ma executor no-op (nessuna azione reale).
3. Run-now invocato senza executor registrato.
4. TUI action gated da `KILOCLAW_TASK_ACTIONS_EXEC` false di default (`packages/opencode/src/flag/flag.ts:166`).

### RCA-C - "Stato task confuso/incoerente"

- Causa: dual model `status/state`, update/query centrati su `status`, UI parzialmente su `state`.

## 8) Analisi test e qualita

Copertura attuale sbilanciata verso CLI/store:

- CLI lifecycle test presente (`packages/opencode/test/cli/task-command.test.ts:6`) ma non verifica semantica forte di esecuzione reale.
- Runtime test engine presenti (`packages/opencode/test/kiloclaw/scheduled-task-runtime.test.ts:6`), ma con executor finto e senza validazione E2E control-plane.
- Nessun test dedicato a parser slash `/tasks` TUI e command routing dinamico.

Rischio: regressioni UX e runtime non rilevate in CI.

## 9) Debito tecnico prioritizzato

## P0 (bloccanti)

- Introdurre command routing parametrico per `/tasks <azione> <id>` (o registrazioni esplicite complete).
- Sostituire executor daemon placeholder con adapter reale e contratti di esecuzione.
- Eliminare doppio scheduling loop (scegliere un solo loop autorevole).
- Correggere `run-now` CLI/TUI per registrare executor valido o rifiutare esplicitamente con errore guidato.

## P1 (stabilita)

- Uniformare semantica flag runtime tra `Flag` e loader daemon.
- Portare store/engine a state machine canonica (`state`) con compat layer controllato.
- Rendere shadow mode veramente non mutante.

## P2 (hardening)

- Estendere telemetria con reason-code per no-op/placeholder.
- Ridurre sovrapposizione moduli legacy non usati nel percorso principale.

## 10) Raccomandazioni operative immediate

1. **Hotfix TUI routing**: mappare i trigger `/tasks show|edit|runs|pause|resume|run|delete|help` a handler reali in `app.tsx` o introdurre parser dedicato con dispatch diretto a `handleTaskNavigate`.
2. **Hotfix run-now**: bloccare con errore user-facing se executor non disponibile, evitando false aspettative.
3. **Runtime guardrail**: impedire run-success quando executor e placeholder/no-op non operativo.
4. **Freeze su nuove feature scheduling** finche i P0 sopra non sono chiusi e coperti da test automatici.

## 11) Piano test minimo consigliato per uscita dal rischio P0

- Test unitario command-dispatch su `/tasks edit <id>` e `/tasks delete <id>`.
- Test integrazione TUI: `new -> list -> show -> edit -> save -> show`.
- Test integrazione runtime: task due + daemon + executor reale + evidenza side effect.
- Test run-now CLI/TUI con e senza executor.

## 12) Conclusione

Il sistema ha una base piu solida rispetto allo stato descritto nel piano iniziale (alcuni gap sono stati chiusi), ma **non e ancora affidabile per gestione/esecuzione task in produzione**. Le cause dei problemi riportati dagli utenti sono riproducibili direttamente dalla logica di routing TUI e dalla pipeline runtime/executor corrente.

Fino alla chiusura dei P0, lo scheduling resta operativamente fragile: l'interfaccia espone capacita che il data plane non garantisce in modo coerente.

---
title: "Rifondazione scheduling"
description: "Allinea runtime, UX e affidabilita operativa end-to-end"
date: "2026-04-09"
status: "proposto"
---

## Sintetizza quadro esecutivo

Il runtime dei task pianificati ha oggi una frattura tra piano di controllo (CLI/TUI) e piano di esecuzione (daemon/engine), con effetti diretti: task non eseguiti, stati incoerenti e UX incompleta.
La rifondazione proposta unifica stato, percorso di esecuzione e osservabilita con un modello semplice: un solo contratto scheduler, un solo state machine canonico e superfici di gestione coerenti.

- Evidenza primaria: il daemon puo girare in shadow mode e marcare run come successo senza executor registrato (`packages/opencode/src/kiloclaw/proactive/runtime/daemon.ts:214`, `packages/opencode/src/kiloclaw/proactive/scheduler.engine.ts:389`, `packages/opencode/src/kiloclaw/proactive/scheduler.engine.ts:392`)
- Evidenza primaria: default flag disallineati tra `Flag` e runtime loader (`packages/opencode/src/flag/flag.ts:146`, `packages/opencode/src/kiloclaw/proactive/runtime/daemon.ts:53`)
- Evidenza primaria: path DB divergente tra store e install service (`packages/opencode/src/kiloclaw/proactive/scheduler.store.ts:299`, `packages/opencode/src/cli/cmd/daemon.ts:266`)
- Evidenza primaria: parser `/tasks` TUI supporta solo subset mentre help dichiara molto di piu (`packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx:632`, `packages/opencode/src/cli/cmd/tui/ui/dialog-task-help.tsx:48`)
- Evidenza primaria: rotta `show|edit` collassata, quindi edit non raggiunge wizard (`packages/opencode/src/cli/cmd/tui/app.tsx:849`, `packages/opencode/src/cli/cmd/tui/app.tsx:861`)

---

## Delimita perimetro

Questo piano copre runtime task schedulati, comandi CLI `task`, parser `/tasks` in TUI, viste list/detail/runs/dlq, store SQLite, scheduler engine, daemon, health di servizio, bootstrap e flag.
Non copre redesign completo dell'agency stack, migrazione provider, o modifica di semantiche non legate ai task pianificati.

**Includi**
- Percorso CLI: registrazione comando, sottocomandi CRUD/operativi, semantica pause/resume/run-now (`packages/opencode/src/index.ts:202`, `packages/opencode/src/cli/cmd/task.ts:500`)
- Percorso TUI: slash parser, command registry, dialog list/detail/runs/dlq/wizard (`packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx:625`, `packages/opencode/src/cli/cmd/tui/app.tsx:415`)
- Percorso runtime: daemon lifecycle, lease, tick, engine execute/retry/dlq (`packages/opencode/src/kiloclaw/proactive/runtime/daemon.ts:273`, `packages/opencode/src/kiloclaw/proactive/scheduler.engine.ts:317`)
- Percorso dati: schema task/runs/dlq/lease, default path, WAL setup (`packages/opencode/src/kiloclaw/proactive/scheduler.store.ts:206`, `packages/opencode/src/kiloclaw/proactive/scheduler.store.ts:329`)

**Escludi**
- Rifacimento totale dei modelli `TaskLedger` legacy non usati dal path principale TUI/CLI (`packages/opencode/src/kiloclaw/proactive/scheduler-service.ts:21`)
- Cambi di UX globali non task-related nella TUI
- Nuove dipendenze distribuite esterne (Kafka, Redis, ecc.) in fase iniziale

---

## Mappa codice profondo

L'architettura reale e oggi composta da piu rami parzialmente sovrapposti, con responsabilita duplicate tra engine, scheduler legacy e azioni TUI locali.
La mappa seguente evidenzia i rami critici e i punti di frizione.

**Traccia ingresso CLI**
- Entrypoint registra sia `task` sia `daemon` (`packages/opencode/src/index.ts:202`, `packages/opencode/src/index.ts:203`)
- Comando `task` espone `create/list/show/pause/resume/run-now/delete/update/runs/dlq` (`packages/opencode/src/cli/cmd/task.ts:500`)
- `run-now` inizializza engine ad hoc e invoca esecuzione immediata (`packages/opencode/src/cli/cmd/task.ts:277`)
- `resume` in CLI ricalcola `nextRunAt` con `nextRuns`, quindi ha semantica diversa dalla TUI (`packages/opencode/src/cli/cmd/task.ts:529`, `packages/opencode/src/cli/cmd/task.ts:539`)

**Traccia parser TUI `/tasks`**
- Parser locale intercetta `/tasks` e non invia al server (`packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx:625`)
- Supporto effettivo: `/tasks`, `/tasks list`, `/tasks new`, `/tasks help` (`packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx:632`)
- Help testuale dichiara comandi extra (`show/edit/runs/dlq/pause/resume/run/delete/replay`) non realmente parsati (`packages/opencode/src/cli/cmd/tui/ui/dialog-task-help.tsx:48`)

**Traccia viste TUI**
- Registry comandi collega `task.list` e `task.new` (`packages/opencode/src/cli/cmd/tui/app.tsx:415`, `packages/opencode/src/cli/cmd/tui/app.tsx:430`)
- List -> Detail (`show`) via callback selezione (`packages/opencode/src/cli/cmd/tui/ui/dialog-task-list.tsx:209`)
- Detail -> Runs via "View all" ma il label puo essere letto come "tutti i task" invece di "tutte le run" (`packages/opencode/src/cli/cmd/tui/ui/dialog-task-detail.tsx:203`)
- Detail -> Edit ricade su `handleTaskNavigate("edit")` ma `edit` e collassato su detail stesso (`packages/opencode/src/cli/cmd/tui/app.tsx:849`)
- DLQ view supporta replay/remove entry ma senza conferma distruttiva (`packages/opencode/src/cli/cmd/tui/ui/dialog-task-dlq.tsx:81`)

**Traccia store dati**
- Tabelle: `proactive_tasks`, `proactive_task_runs`, `proactive_dlq`, `proactive_runtime_lease` (`packages/opencode/src/kiloclaw/proactive/scheduler.store.ts:206`)
- Stato persistito sdoppiato tra `status` e `state` (`packages/opencode/src/kiloclaw/proactive/scheduler.store.ts:218`, `packages/opencode/src/kiloclaw/proactive/scheduler.store.ts:219`)
- `getPending` filtra solo su `status='active'`, ignorando `state` (`packages/opencode/src/kiloclaw/proactive/scheduler.store.ts:670`)
- DB init imposta WAL ma senza gestione esplicita checkpoint/backpressure (`packages/opencode/src/kiloclaw/proactive/scheduler.store.ts:329`)

**Traccia engine**
- Engine ha gate, retry, DLQ replay e metadati run (`packages/opencode/src/kiloclaw/proactive/scheduler.engine.ts:345`)
- Se executor non registrato: warning, poi outcome success e avanzamento schedule (`packages/opencode/src/kiloclaw/proactive/scheduler.engine.ts:389`, `packages/opencode/src/kiloclaw/proactive/scheduler.engine.ts:392`, `packages/opencode/src/kiloclaw/proactive/scheduler.engine.ts:403`)
- `recoverPendingTasks` non muta stato, conta soltanto (`packages/opencode/src/kiloclaw/proactive/scheduler.engine.ts:233`)

**Traccia daemon**
- Feature flags runtime: `runtimeEnabled` true salvo `=false`, `executionEnabled` solo se `=true` (`packages/opencode/src/kiloclaw/proactive/runtime/daemon.ts:53`)
- Tick loop in shadow mode logga "would execute" senza eseguire (`packages/opencode/src/kiloclaw/proactive/runtime/daemon.ts:214`)
- Daemon non registra executor verso engine nel lifecycle `start()` (`packages/opencode/src/kiloclaw/proactive/runtime/daemon.ts:285`)

**Traccia health/operabilita**
- Service manager verifica servizi e puo tentare autostart daemon (`packages/opencode/src/kiloclaw/proactive/runtime/service-manager.ts:351`, `packages/opencode/src/kiloclaw/proactive/runtime/service-manager.ts:379`)
- Funzioni health non risultano integrate in bootstrap/commands principali oltre all'export barrel (`packages/opencode/src/kiloclaw/proactive/runtime/index.ts:7`)

---

## Confronta gap

| Dominio | Stato attuale | Gap critico | Impatto | Priorita |
|---|---|---|---|---|
| Runtime | Daemon avviabile ma con modalita shadow e senza executor | Esecuzione reale non garantita anche con run registrate | Task persi, falsa affidabilita | P0 |
| Dati | Path DB incoerente e stato doppio (`status/state`) | Divergenza storage + semantica stato fragile | Debug difficile, rischio corruzione logica | P0 |
| UX | `/tasks` parziale, edit non funziona, delete senza conferma | Controllo utente incompleto e non prevedibile | Errori operativi e sfiducia | P0 |
| Osservabilita | Mancano stati running robusti e segnali failure chiari | Diagnosi lenta, failure mascherati | MTTR alto | P0 |
| Test | Copertura TUI task quasi assente, test con sleep deboli | Regressioni non intercettate | Rischio rilascio alto | P0 |
| Operabilita | Health manager non consolidato nel bootstrap runtime | Startup e self-healing non uniformi | Avvii fragili in prod | P1 |

---

## Cataloga RCA con prove

**RCA-01: task non eseguiti anche se runtime "up"**
- Causa prossima: `executionEnabled` default false e shadow mode attivo (`packages/opencode/src/kiloclaw/proactive/runtime/daemon.ts:54`, `packages/opencode/src/kiloclaw/proactive/runtime/daemon.ts:214`)
- Causa di design: nessun executor registrato nel path daemon->engine (`packages/opencode/src/kiloclaw/proactive/runtime/daemon.ts:285`, `packages/opencode/src/kiloclaw/proactive/scheduler.engine.ts:389`)
- Effetto: run marcata success anche senza lavoro reale (`packages/opencode/src/kiloclaw/proactive/scheduler.engine.ts:392`)

**RCA-02: default flag contraddittori**
- `Flag.KILOCLAW_DAEMON_RUNTIME_ENABLED` richiede true esplicito (`packages/opencode/src/flag/flag.ts:146`)
- `loadFeatureFlags.runtimeEnabled` e true salvo false esplicito (`packages/opencode/src/kiloclaw/proactive/runtime/daemon.ts:53`)
- Effetto: comportamento diverso tra superfici di controllo e runtime reale

**RCA-03: incoerenza path DB**
- Store default su `.kiloclaw/proactive.db` (`packages/opencode/src/kiloclaw/proactive/scheduler.store.ts:299`)
- Install service setta `.kilocode/proactive.db` su Linux/macOS (`packages/opencode/src/cli/cmd/daemon.ts:266`, `packages/opencode/src/cli/cmd/daemon.ts:355`)
- Effetto: daemon e CLI/TUI possono leggere DB diversi

**RCA-04: parser `/tasks` non allineato con documentazione UI**
- Parser accetta subset minimo (`packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx:632`)
- Help espone comandi aggiuntivi non implementati (`packages/opencode/src/cli/cmd/tui/ui/dialog-task-help.tsx:48`)
- Effetto: aspettative utente violate e workflow bloccati

**RCA-05: edit non raggiungibile**
- Router tratta `show` e `edit` nello stesso ramo detail (`packages/opencode/src/cli/cmd/tui/app.tsx:849`)
- Callback `onEdit` richiama di nuovo `edit`, creando loop funzionale (`packages/opencode/src/cli/cmd/tui/app.tsx:861`)
- Effetto: pulsante Edit non apre wizard

**RCA-06: resume incoerente tra CLI e TUI**
- TUI resume imposta solo `status: active` (`packages/opencode/src/cli/cmd/tui/app.tsx:872`)
- CLI resume ricalcola `nextRunAt` e aggiorna config (`packages/opencode/src/cli/cmd/task.ts:529`, `packages/opencode/src/cli/cmd/task.ts:540`)
- Effetto: resume TUI puo lasciare task attivo ma non schedulato

**RCA-07: azioni distruttive senza safety rail**
- Delete TUI rimuove immediatamente senza dialog conferma (`packages/opencode/src/cli/cmd/tui/app.tsx:905`)
- Remove DLQ entry anch'esso senza conferma (`packages/opencode/src/cli/cmd/tui/app.tsx:972`)
- Effetto: perdita dati operativa non reversibile dall'utente medio

**RCA-08: failure mascherate da silent catch**
- Dialog list/detail/runs/dlq fanno `catch { return []|null }` (`packages/opencode/src/cli/cmd/tui/ui/dialog-task-list.tsx:41`, `packages/opencode/src/cli/cmd/tui/ui/dialog-task-detail.tsx:44`, `packages/opencode/src/cli/cmd/tui/ui/dialog-task-runs.tsx:31`, `packages/opencode/src/cli/cmd/tui/ui/dialog-task-dlq.tsx:26`)
- Migrazioni colonne nello store ignorano errori senza log strutturato (`packages/opencode/src/kiloclaw/proactive/scheduler.store.ts:359`, `packages/opencode/src/kiloclaw/proactive/scheduler.store.ts:377`)
- Effetto: incidenti latenti e debug post-mortem povero

**RCA-09: visibilita stato running incompleta**
- Stato esteso include `running` (`packages/opencode/src/kiloclaw/proactive/scheduler.store.ts:27`)
- UI status usa solo mapping su `status` senza `running` (`packages/opencode/src/cli/cmd/tui/ui/dialog-task-detail.tsx:9`)
- Effetto: nessuna visibilita robusta del lifecycle in esecuzione

**RCA-10: gap test e flakiness**
- Copertura task concentrata su CLI command test, non su TUI `/tasks` (`packages/opencode/test/cli/task-command.test.ts:5`)
- Test lease usa `Bun.sleep(...)` non atteso (`packages/opencode/test/kiloclaw/daemon-lease.test.ts:84`, `packages/opencode/test/kiloclaw/daemon-lease.test.ts:111`)
- Effetto: regressioni temporali e UX parser non intercettate

---

## Allinea principi SOTA 2026

La rifondazione adotta pratiche consolidate da APScheduler, Temporal, SQLite e Celery, ma adattate al vincolo locale/embedded di questo repo.
Il principio guida e "robustezza minima sufficiente": at-least-once + idempotenza forte + controllo utente esplicito.

**Applica da APScheduler (official docs)**
- Persistenza come fonte di verita, con operazioni `modify/remove/pause/resume` coerenti e auditabili
- Gestione misfire esplicita (`skip`, `catchup_one`, `catchup_all`) + coalescing definito
- `max_instances` per task e listener eventi per stato run
- Riferimento: https://apscheduler.readthedocs.io/en/stable/userguide.html

**Applica da Temporal (official docs)**
- Idempotenza lato activity/task handler come requisito, non opzionale
- Retry policy deterministica separata da logica business
- Correlation/idempotency key persistite in run history
- Riferimento: https://docs.temporal.io/activity-definition

**Applica da SQLite WAL (official docs)**
- WAL abilitato con policy checkpoint misurabile (`wal_autocheckpoint` + checkpoint manuali in manutenzione)
- Budget I/O e lock timeout espliciti per concorrenza daemon + CLI/TUI
- Version pinning e canary su aggiornamenti SQLite per mitigare rischio regressioni WAL, inclusa nota 2026 su reset WAL da tracciare nei changelog upstream
- Riferimento: https://sqlite.org/wal.html

**Applica da Celery (official docs)**
- Task idempotenti con retry a backoff esponenziale + jitter
- Tracking stato started/running/failure con reason codes consistenti
- Distinzione tra replay tecnico e rerun utente
- Riferimento: https://docs.celeryq.dev/en/stable/userguide/tasks.html

---

## Progetta architettura target

L'obiettivo e separare chiaramente control plane e data plane, mantenendo una superficie locale semplice e operabile.
Il contratto scheduler deve essere unico per CLI, TUI e daemon.

**Definisci control plane**
- Comandi utente e API locali: create/edit/pause/resume/delete/run-now/replay + query list/detail/runs/dlq
- Validazione input e autorizzazioni, mai esecuzione diretta di business payload
- Emissione eventi osservabili (UI + log + metriche)

**Definisci data plane**
- Daemon unico leader con lease fencing
- Engine con executor obbligatorio registrato prima di `start`
- Persistenza run-first: ogni transizione critica produce record run/event prima di mutare stato task

**Definisci state machine canonica**
- `draft` (solo wizard) -> `active` -> `running` -> (`active` | `paused` | `dlq` | `completed` | `archived`)
- `status` deprecato gradualmente in favore di `state`, mantenendo compat layer temporaneo
- Transizioni invalide rifiutate a livello store/service con error code typed

**Definisci contratto scheduler**
- `schedule_next(task, reason)` restituisce `nextRunAt`, `misfireDecision`, `coalescedCount`
- `execute(task, slot)` richiede `idempotencyKey`, `correlationId`, `traceId`, `fenceToken`
- `complete/fail/retry/dlq/replay` sempre con `runType` (`scheduled|manual|replay`) e reason codificato

**Mappa flusso target**
```text
CLI/TUI (control plane)
  -> SchedulerControlService
  -> ProactiveTaskStore (canonical state + runs + dlq + lease)
Daemon leader (data plane)
  -> SchedulerEngine (executor required)
  -> TaskExecutorAdapter (idempotent)
  -> Run events + metrics + task transitions
```

---

## Pianifica roadmap

La roadmap e incrementale per ridurre rischio operativo, con flag di protezione per ogni fase e rollback rapido.
Ogni fase ha deliverable verificabili e criterio di uscita rigido.

**Fase 0: Stabilizza fondazione (P0, 3-5 giorni)**
- Unifica default flag daemon e documenta precedence env
- Blocca `start()` daemon se executor non registrato
- Allinea path DB `.kilocode` vs `.kiloclaw` con decisione unica e migration helper
- Deliverable: RFC tecnica + patch guardrail + smoke test runtime
- Flag: `KILOCLAW_DAEMON_RUNTIME_ENABLED`, `KILOCLAW_DAEMON_EXECUTION_ENABLED` con semantics coerente
- Rischio: regressione ambienti esistenti, mitigata da compat env alias per 1 release

**Fase 1: Correggi controllo utente TUI (P0, 4-6 giorni)**
- Estendi parser `/tasks` ai comandi dichiarati o riduci help a set reale
- Separa route `edit` da `show` e collega edit al wizard
- Aggiungi conferma su delete/remove DLQ e fix resume con reschedule esplicito
- Deliverable: flusso end-to-end TUI completo
- Flag: `KILOCLAW_SCHEDULED_TASKS_VIEWS_ENABLED`, `KILOCLAW_TASK_ACTIONS_EXEC`
- Rischio: aumento complessita UI, mitigato con componenti conferma riusabili

**Fase 2: Canonicalizza stato e osservabilita (P0/P1, 5-8 giorni)**
- Introdurre state machine unica (`state`) e mapping backward compat da `status`
- Aggiungere stato `running` reale in UI list/detail/runs
- Rimuovere silent catches o sostituirli con toasts/error banner e log strutturati
- Deliverable: timeline run robusta e diagnosi immediata
- Flag: `KILOCLAW_TASK_STATE_V2`, `KILOCLAW_TASK_TIMELINE_V1`
- Rischio: migration dati, mitigata con script idempotente e dual-write temporaneo

**Fase 3: Rafforza runtime e concorrenza (P1, 5-7 giorni)**
- Policy misfire/coalescing/max-instances conforme contratto
- Retry backoff+jitter deterministico e replay semantics distinta
- WAL tuning + checkpoint policy + lock timeout/telemetria DB
- Deliverable: runtime resiliente a restart e burst
- Flag: `KILOCLAW_SCHEDULER_NEXTRUN_UNIFIED`
- Rischio: variazione timing run, mitigata con shadow metrics e canary

**Fase 4: Operazionalizza rilascio (P1, 3-4 giorni)**
- Dashboard health minima (CLI `daemon status` + metriche run/dlq/lag)
- Playbook rollout/rollback e incident runbook
- Hard gate pre-release su test/soak/concurrency
- Deliverable: rilascio production-ready con rollback < 5 minuti

---

## Definisci test pre-deploy

Il programma test deve coprire semantica, concorrenza e UX reale, non solo happy path CLI.
Le seguenti suite diventano gate bloccanti.

**Unit**
- Store: transizioni stato valide/invalid, migrazioni colonne, lease fencing
- Engine: executor required, misfire policies, retry+jitter deterministico, idempotency key
- Parser: `/tasks` command grammar completa e backward compat

**Integration**
- CLI->store->engine su DB reale SQLite WAL
- Daemon start/stop/drain con lease renew failure e recovery
- Resume semantics allineata tra CLI e TUI

**E2E TUI**
- Scenario completo: `/tasks new -> list -> detail -> edit -> pause -> resume -> run-now -> runs -> dlq -> delete`
- Assertioni su UI state + effetti persistiti DB
- Copertura specifica bug edit loop e confirm delete

**Chaos/restart**
- Kill -9 daemon durante `running` e verifica reconcile al reboot
- Lease contention con due daemon concorrenti
- Simulazione lock DB e retry policy su write contention

**Concurrency/soak**
- 1k run sintetiche, mix success/failure/replay, osservando drift schedule e crescita WAL
- Soak 24h con checkpoint periodici e budget memory stabile

**Gate rigidi**
- Nessun test con sleep non atteso nei path critici di scheduling
- Flaky rate < 0.5% su 20 run CI consecutive
- 100% pass su suite task runtime + TUI e2e + restart chaos prima del merge

---

## Governa rollout e rollback

Il rollout procede per anelli con telemetria comparativa tra comportamento legacy e rifondato.
Il rollback e sempre one-command via flag gating.

**Rollout**
- Ring 0: maintainer locale con `executionEnabled=true` e dashboard debug
- Ring 1: team interno con canary 10% workspaces
- Ring 2: default on progressivo dopo 7 giorni senza regressioni P1+

**Rollback**
- Disattiva esecuzione daemon con flag runtime dedicata
- Ripristina parser/help subset coerente se necessario
- Mantieni migration backward-safe per riaprire DB con versione precedente

**Playbook minimo**
- Trigger rollback: run success rate < SLO o DLQ growth > soglia 2x baseline
- Tempo obiettivo rollback: < 5 minuti
- Post-rollback: esporta run audit e reason codes per RCA

---

## Misura SLO e criteri

Gli SLO sono orientati a affidabilita percepita utente e integrita operativa.
I KPI sono misurati per tenant e aggregati globali.

**SLO operativi**
- SLO-1: >= 99.5% run pianificate iniziano entro `starting_deadline_ms`
- SLO-2: <= 0.5% run con outcome `failed` non recuperate entro retry budget
- SLO-3: MTTR incident task runtime < 15 minuti
- SLO-4: coerenza stato (task/runs/dlq) >= 99.99% su verifiche giornaliere

**KPI prodotto**
- Tempo mediano da `/tasks` a creazione task completata
- Percentuale utenti che usano edit/pause/resume senza errore
- Tasso delete annullate da dialog conferma (segnale safety efficace)

**Acceptance criteria rilascio**
- Nessun caso noto di "run success senza executor"
- Nessuna divergenza path DB tra daemon e CLI/TUI
- Parser `/tasks` e help totalmente allineati
- Copertura E2E TUI task in CI stabile

---

## Gestisci rischi aperti

I rischi residui sono controllabili con policy conservative e osservabilita forte.
Ogni rischio ha un owner tecnico e una mitigazione pronta.

- Rischio versioning SQLite/WAL: pin versione runtime e canary su upgrade, con fallback rapido alla build precedente
- Rischio dual-state (`status/state`) durante migrazione: dual-write + checker notturno + cutover data-driven
- Rischio regressione UX TUI: golden flow e2e obbligatorio prima di ogni release
- Rischio contesa lease multi-process: fencing token obbligatorio in tutte le write di run critiche
- Rischio mismatch CLI/TUI semantics: introdurre `SchedulerControlService` unico per mutazioni task

---

## Pianifica backlog concreto

Il backlog e organizzato per file per velocizzare review e merge incrementali.
Le issue P0 devono essere aperte e assegnate nella stessa iterazione.

- `packages/opencode/src/kiloclaw/proactive/runtime/daemon.ts`
- `packages/opencode/src/kiloclaw/proactive/scheduler.engine.ts`
- `packages/opencode/src/kiloclaw/proactive/scheduler.store.ts`
- `packages/opencode/src/flag/flag.ts`
- `packages/opencode/src/cli/cmd/daemon.ts`
- `packages/opencode/src/cli/cmd/task.ts`
- `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`
- `packages/opencode/src/cli/cmd/tui/app.tsx`
- `packages/opencode/src/cli/cmd/tui/ui/dialog-task-help.tsx`
- `packages/opencode/src/cli/cmd/tui/ui/dialog-task-list.tsx`
- `packages/opencode/src/cli/cmd/tui/ui/dialog-task-detail.tsx`
- `packages/opencode/src/cli/cmd/tui/ui/dialog-task-runs.tsx`
- `packages/opencode/src/cli/cmd/tui/ui/dialog-task-dlq.tsx`
- `packages/opencode/test/cli/task-command.test.ts`
- `packages/opencode/test/kiloclaw/scheduled-task-runtime.test.ts`
- `packages/opencode/test/kiloclaw/daemon-lease.test.ts`

**Dettaglia P0 per file**
- `packages/opencode/src/kiloclaw/proactive/runtime/daemon.ts`: rendere `executionEnabled` esplicito nel log startup, registrare executor obbligatorio e fail-fast se assente
- `packages/opencode/src/kiloclaw/proactive/scheduler.engine.ts`: rifiutare success path quando executor mancante, introdurre outcome tecnico `executor_missing`
- `packages/opencode/src/flag/flag.ts`: allineare semantica default runtime con daemon loader e documentare precedence
- `packages/opencode/src/kiloclaw/proactive/scheduler.store.ts`: unificare default DB path deciso, introdurre helper centralizzato per data dir
- `packages/opencode/src/cli/cmd/daemon.ts`: install service con path DB canonico unico e check preflight
- `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`: parser `/tasks` completo o routing a command registry unico
- `packages/opencode/src/cli/cmd/tui/app.tsx`: separare `edit` da `show`, aggiungere confirm delete/remove DLQ, resume con reschedule
- `packages/opencode/src/cli/cmd/tui/ui/dialog-task-help.tsx`: sincronizzare help con comandi realmente supportati
- `packages/opencode/test/kiloclaw/daemon-lease.test.ts`: correggere sleep non attesi e rendere test deterministic time

---

## Concludi traiettoria

Questo piano rifonda il scheduling runtime senza sovra-ingegneria, mantenendo semplicita locale ma portando robustezza da produzione.
L'esecuzione raccomandata e iniziare subito dalla Fase 0 e chiudere i P0 prima di ogni ulteriore espansione funzionale.

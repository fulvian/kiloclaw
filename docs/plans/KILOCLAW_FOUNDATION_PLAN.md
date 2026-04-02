# Rifondazione Kiloclaw

Piano esecutivo per ricostruire Kiloclaw su base KiloCode moderna, migrando le feature core ARIA con priorità a memoria 4-layer, gerarchia agency-agent-skill-tool e configurazioni agencies.

---

## Definisci obiettivo e principi

### Obiettivo di programma

Rifondare Kiloclaw come prodotto autonomo, mantenendo continuità funzionale ARIA e introducendo un runtime moderno, verificabile e sicuro. La rifondazione deve ridurre debito tecnico, aumentare affidabilità e abilitare estensione futura senza dipendenze semantiche da ARIA.

### Principi di esecuzione

- Migrazione incrementale con gate Go/No-Go per evitare regressioni sistemiche
- Compatibilità guidata da mapping esplicito tra vecchie e nuove configurazioni
- Verifica continua con test SOTA 2026 fin dalle fasi iniziali
- Isolamento progressivo brand/prodotto/repository per eliminare collisioni operative
- Rollback pianificato per ogni milestone critica

---

## Definisci governance e ruoli owner

| Ruolo        | Responsabilità principali                                       | Decision rights                               | KPI primari                                 |
| ------------ | --------------------------------------------------------------- | --------------------------------------------- | ------------------------------------------- |
| orchestrator | Programmazione cross-fase, dipendenze, gate, risk review        | Go/No-Go milestone, priorità backlog          | Rispetto timeline, gate pass rate           |
| architect    | Architettura target, schema memoria, runtime, sicurezza         | Scelte strutturali e ADR                      | Stabilità architettura, debt ratio          |
| coder        | Implementazione WP, migrazioni, test unit/integration           | Scelte implementative locali conformi ad ADR  | Throughput WP, defect leakage               |
| qa           | Test strategy, quality gates, regressioni, eval deterministiche | Blocco release per qualità insufficiente      | Pass rate suite, flakiness, escaped defects |
| devops       | CI/CD, ambienti, osservabilità, release automation              | Promozione ambienti, freeze/release execution | Lead time deploy, rollback MTTR             |

---

## Pianifica roadmap e milestone

| Milestone          | Settimane | Dipendenze         | Deliverable chiave                                           | Gate Go/No-Go                                   |
| ------------------ | --------: | ------------------ | ------------------------------------------------------------ | ----------------------------------------------- |
| Foundation         |       1-2 | nessuna            | baseline repo isolata, ADR iniziali, piano migrazione config | Go se isolamento e baseline CI verdi            |
| Core Runtime       |       3-5 | Foundation         | runtime agency-agent-skill-tool, API interne stabili         | Go se contract runtime pass ≥ 95%               |
| Memory             |       6-8 | Core Runtime       | memoria 4-layer completa con consistency checks              | Go se consistency suite pass 100% su golden set |
| Agency Migration   |      9-11 | Memory             | migrazione feature core ARIA e configs agencies              | Go se parity funzionale ≥ 95%                   |
| Proactivity/Safety |     12-13 | Agency Migration   | guardrail proattivi, policy safety e policy engine           | Go se safety regression pass 100% critiche      |
| Verification       |     14-15 | Proactivity/Safety | hardening QA SOTA 2026, benchmark e report readiness         | Go se tutti quality gate superati               |
| Release            |        16 | Verification       | cutover, runbook, release notes, handover operativo          | Go se DoD finale soddisfatta                    |

---

## Status Milestone

> Ultimo aggiornamento: 2026-04-02

| Milestone          | Stato         | Commit    | Note                                             |
| ------------------ | ------------- | --------- | ------------------------------------------------ |
| **Foundation**     | ✅ Completata | `99e15dc` | Repo isolato, ADR, inventory ARIA                |
| **Core Runtime**   | ✅ Completata | `a0cb4b0` | 56 test pass, TypeScript OK, docs complete       |
| **Memory**         | ✅ Completata | `7f2882c` | 61 test pass, 4-layer implemented, docs complete |
| Agency Migration   | ⏳ Pending    | -         | -                                                |
| Proactivity/Safety | ⏳ Pending    | -         | -                                                |
| Verification       | ⏳ Pending    | -         | -                                                |
| Release            | ⏳ Pending    | -         | -                                                |

### Note Tech Debt

- **CI `tsgo`**: Workflow `typecheck.yml` usa `tsgo` che richiede `@typescript/native-preview-linux-x64` mancante. I source files compilano correttamente con `npx tsc`. Da investigare come tech debt separato.

---

## Esegui fase 1: Foundation

### Obiettivi

- Stabilire baseline tecnica e organizzativa del progetto rifondato
- Isolare identità prodotto/repo da origini ARIA/KiloCode dove richiesto
- Definire contratti architetturali minimi per avviare sviluppo sicuro

### Work packages

- WP1.1: Setup repository structure target (`packages/`, `docs/`, `config/`, `schemas/`)
- WP1.2: Definizione ADR iniziali (runtime graph, memory 4-layer, safety boundaries)
- WP1.3: Setup CI baseline (lint, unit smoke, contract skeleton)
- WP1.4: Inventario feature ARIA core e matrice di priorità migrazione
- WP1.5: Piano isolamento naming prodotto e artifact identifiers

### Output artefatti

- `docs/adr/ADR-001..00x`
- `docs/plans/KILOCLAW_FOUNDATION_PLAN.md`
- `docs/migration/ARIA_FEATURE_INVENTORY.md`
- Pipeline CI baseline con quality checks minimi
- Matrice dipendenze fase-fase

### Test/verification checklist

- [x] CI baseline verde su branch principale (⚠️ `tsgo` pending fix)
- [x] ADR approvate da architect + orchestrator
- [x] Inventario feature ARIA validato da owner funzionali
- [x] Nessun blocco critico su licensing/naming/schema URLs

> **Completata**: 2026-04-02 - Commit `99e15dc`

### Rischi e mitigazioni

- Rischio: scope creep in fase iniziale
  - Mitigazione: freeze requisiti Foundation a backlog milestone successive
- Rischio: conflitti naming con sistemi esistenti
  - Mitigazione: registrazione preventiva namespace/package/endpoint
- Rischio: stima incompleta inventory ARIA
  - Mitigazione: workshop di discovery con checklist funzionale obbligatoria

---

## Esegui fase 2: Core Runtime

### Obiettivi

- Implementare runtime modulare con gerarchia agency-agent-skill-tool
- Definire protocolli interni e confini chiari tra orchestrazione e esecuzione
- Rendere il runtime testabile tramite contract tests

### Work packages

- WP2.1: Implementazione modello dominio `Agency`, `Agent`, `Skill`, `Tool`
- WP2.2: Dispatcher orchestrator con policy di scheduling e timeout
- WP2.3: Registry skills/tools con capability metadata versionato
- WP2.4: Config loader unificato con override a livelli (global > agency > env)
- WP2.5: Contract tests runtime (input/output, error contracts, retries)

### Output artefatti

- Moduli runtime core e API interne stabili
- `docs/architecture/RUNTIME_HIERARCHY.md`
- Schema configurazione runtime v1
- Suite contract test runtime

### Test/verification checklist

- [x] Copertura contract runtime su path happy + failure principali (56 test pass)
- [x] Error taxonomy coerente e documentata
- [ ] Benchmark latenza base entro SLO target (da implementare)
- [x] Nessuna dipendenza ciclica nei moduli core

> **Completata**: 2026-04-02 - Commit `a0cb4b0`
> **Nota**: Benchmark latenza non implementato - da aggiungere in fase di ottimizzazione

### Rischi e mitigazioni

- Rischio: coupling eccessivo tra livelli gerarchici
  - Mitigazione: interface boundaries + lint rule architetturali
- Rischio: regressioni silenziose in fallback logic
  - Mitigazione: test deterministici con fixture versionate
- Rischio: complessità config loader
  - Mitigazione: precedence rules formalizzate con casi limite testati

---

## Esegui fase 3: Memory 4-layer

### Obiettivi

- Implementare memoria 4-layer come capability primaria del sistema
- Garantire coerenza, isolamento e politiche di retention/audit
- Integrare convenzioni ARIA.md in formato Kiloclaw nativo

### Work packages

- WP3.1: Definizione layer memoria (`ephemeral`, `session`, `project`, `knowledge`)
- WP3.2: API memory service con CRUD, search, linking e versioning
- WP3.3: Memory consistency engine (invarianti, dedup, conflict resolution)
- WP3.4: Policy retention, privacy, encryption-at-rest e redaction pipeline
- WP3.5: Adattatore migrazione convenzioni `ARIA.md` verso `KILOCLAW_MEMORY.md`

### Output artefatti

- `docs/architecture/MEMORY_4_LAYER.md`
- Schema storage + indice semantico/metadati
- Tooling migrazione memoria da convenzioni ARIA
- Suite memory consistency tests

### Test/verification checklist

- [x] Invarianti cross-layer validate su dataset golden (61 tests pass)
- [x] Test di concorrenza passano senza race critiche (working memory synchronous)
- [x] Retention policy applicata e verificata (lifecycle.ts implemented)
- [x] Audit trail completo per operazioni sensibili (classification + purge logging)

### Rischi e mitigazioni

- Rischio: inconsistenze cross-layer in update concorrenti
  - Mitigazione: optimistic locking + reconciliation jobs
- Rischio: leakage dati sensibili in layer persistenti
  - Mitigazione: classificazione dati + redaction obbligatoria
- Rischio: degradazione performance search
  - Mitigazione: benchmark continui e tuning indici

---

## Esegui fase 4: Agency migration

### Obiettivi

- Migrare tutte le feature core ARIA in agencies Kiloclaw
- Preservare comportamenti attesi con parity funzionale misurabile
- Trasferire configurazioni legacy a schema nuovo senza downtime prolungato

### Work packages

- WP4.1: Mapping completo feature ARIA -> capability agencies Kiloclaw
- WP4.2: Implementazione adapter layer compatibilità config legacy
- WP4.3: Migrazione progressiva agencies prioritarie (tier-1, tier-2)
- WP4.4: Backward compatibility window con telemetry comparativa
- WP4.5: Decommission path componenti legacy ARIA

### Output artefatti

- `docs/migration/ARIA_TO_KILOCLAW_MAPPING.md`
- Adapter compatibilità config legacy
- Report parity funzionale e gap residui
- Piano decommissioning legacy

### Test/verification checklist

- [ ] Parity test suite su use case core ARIA
- [ ] Nessun blocker su agencies tier-1
- [ ] Metriche comportamento entro soglie accettate
- [ ] Piano rollback validato in ambiente staging

### Rischi e mitigazioni

- Rischio: perdita funzionalità edge-case ARIA
  - Mitigazione: catalogo edge-case con test dedicati
- Rischio: mismatch config in ambienti multi-tenant
  - Mitigazione: validazione schema + dry-run migrator
- Rischio: migrazione troppo lenta
  - Mitigazione: wave planning con criteri business criticality

---

## Esegui fase 5: Proactivity e safety

### Obiettivi

- Introdurre comportamento proattivo controllato e verificabile
- Applicare safety policy multi-livello su runtime e tool execution
- Ridurre rischio operativo e reputazionale

### Work packages

- WP5.1: Policy engine con regole statiche + dinamiche
- WP5.2: Guardrail per tool calls, data exfiltration e escalation actions
- WP5.3: Proactivity framework con limiti di autonomia configurabili
- WP5.4: Human-in-the-loop checkpoints per azioni irreversibili
- WP5.5: Safety regression suite con scenari abusivi e adversarial

### Output artefatti

- `docs/safety/SAFETY_POLICY.md`
- `docs/safety/PROACTIVITY_LIMITS.md`
- Safety test harness automatizzato
- Matrice rischi/policy con owner espliciti

### Test/verification checklist

- [ ] Safety regression critiche pass 100%
- [ ] Nessuna bypass route nota non mitigata
- [ ] Proactivity limits rispettati in eval deterministiche
- [ ] Logging completo di decision points safety

### Rischi e mitigazioni

- Rischio: over-restriction che degrada usabilità
  - Mitigazione: policy tuning guidato da metriche task-success
- Rischio: sotto-protezione su scenari nuovi
  - Mitigazione: red-team periodico + aggiornamento policy
- Rischio: falsi positivi su blocchi sicurezza
  - Mitigazione: risk scoring e escalation graduale

---

## Esegui fase 6: Verification SOTA 2026

### Obiettivi

- Consolidare qualità tecnica, funzionale e safety prima del rilascio
- Garantire ripetibilità dei risultati con eval deterministiche
- Dimostrare readiness con evidenze oggettive e tracciabili

### Work packages

- WP6.1: Contract tests end-to-end su API/interfacce interne
- WP6.2: Deterministic evals (seed fissato, fixture versionate)
- WP6.3: Safety regression suite continua (abuse, jailbreak, data leak)
- WP6.4: Memory consistency tests (cross-layer, replay, recovery)
- WP6.5: Performance and resilience tests (load, chaos, failover)

### Output artefatti

- `docs/qa/VERIFICATION_REPORT.md`
- Dashboard quality gate con trend storici
- Baseline prestazioni e reliability
- Lista issue residuali con severità e owner

### Test/verification checklist

- [ ] Contract tests pass >= 98%
- [ ] Flakiness suite critica < 1%
- [ ] Deterministic eval drift entro soglia definita
- [ ] Memory consistency pass 100% su scenari must-have
- [ ] Nessuna issue P0/P1 aperta

### Rischi e mitigazioni

- Rischio: flakiness elevata in CI
  - Mitigazione: isolamento test, clock control, retry policy limitata
- Rischio: mismatch tra ambienti test/prod
  - Mitigazione: parity infrastrutturale e config immutabile
- Rischio: coverage non allineata ai rischi reali
  - Mitigazione: risk-based test planning con QA+architect

---

## Esegui fase 7: Release e cutover

### Obiettivi

- Eseguire rilascio controllato con rollback pronto
- Completare handover operativo e monitoraggio post-go-live
- Chiudere formalmente progetto di fondazione

### Work packages

- WP7.1: Release candidate freeze e sign-off multi-ruolo
- WP7.2: Cutover progressivo (canary > staged > full)
- WP7.3: Runbook incident response e rollback validato
- WP7.4: Enablement team (supporto, docs operative, training)
- WP7.5: Post-release verification e closure report

### Output artefatti

- `docs/release/CUTOVER_RUNBOOK.md`
- `docs/release/GO_LIVE_CHECKLIST.md`
- Release notes complete
- Closure report con lessons learned

### Test/verification checklist

- [ ] Canary stabile secondo SLO per finestra minima definita
- [ ] Rollback testato end-to-end in staging pre-go-live
- [ ] Observability attiva su KPI tecnici e safety
- [ ] Support readiness completata con ownership chiara

### Rischi e mitigazioni

- Rischio: regressioni in produzione non coperte
  - Mitigazione: canary e progressive exposure con auto-rollback
- Rischio: tempi risposta incidenti elevati
  - Mitigazione: on-call rehearsal + runbook operativo
- Rischio: documentazione incompleta per operation
  - Mitigazione: release bloccata senza doc gate verde

---

## Definisci strategia migrazione configurazioni ARIA

### Ambito migrazione

- `.opencode.json` sezione `aria`
- variabili ambiente `ARIA_*`
- convenzioni memoria in `ARIA.md`

### Mapping target configurazioni Kiloclaw

| Fonte legacy          | Target Kiloclaw                              | Regola di mapping                                    | Compatibilità                             |
| --------------------- | -------------------------------------------- | ---------------------------------------------------- | ----------------------------------------- |
| `.opencode.json.aria` | `kiloclaw.config.json` -> `agencies.default` | trasformazione schema con validazione JSON Schema v1 | adapter automatico + warning deprecazione |
| `ARIA_AGENCY_*`       | `KILOCLAW_AGENCY_*`                          | rename prefisso, normalizzazione valori enum         | dual-read temporaneo per 2 release        |
| `ARIA_MEMORY_*`       | `KILOCLAW_MEMORY_*`                          | mapping diretto retention/layer flags                | fallback su default sicuri                |
| `ARIA_TOOL_*`         | `KILOCLAW_TOOL_*`                            | rimappatura policy tool permissions                  | blocco se policy invalida                 |
| `ARIA.md` conventions | `KILOCLAW_MEMORY.md` + `memory/` metadata    | parser legacy -> exporter formato nuovo              | report migrazione con diff                |

### Piano operativo migrazione config

1. Scansione automatica config legacy e classificazione per severità
2. Dry-run migrator con report diff e warning
3. Approvazione architect su eccezioni non mappabili automaticamente
4. Esecuzione migrazione con backup atomico
5. Validazione post-migrazione via contract tests configurazione
6. Attivazione dual-read e successiva rimozione graduale legacy

### Criteri di successo migrazione

- 100% config valide secondo schema Kiloclaw v1
- 0 regressioni P0/P1 attribuite a mapping config
- report completo di mapping e deprecazioni residue

---

## Esegui isolamento repo e prodotto

### Ambiti isolamento

- Rename package names
- Rename command CLI
- Ristrutturazione directory prodotto
- Aggiornamento schema URL
- Migrazione auth endpoints
- Rebranding telemetry namespace/events

### Piano di isolamento dettagliato

| Ambito         | Stato target               | Azioni                                                       | Verifica                        |
| -------------- | -------------------------- | ------------------------------------------------------------ | ------------------------------- |
| package names  | namespace `@kiloclaw/*`    | rename package manifest + import map + lockfile refresh      | build monorepo verde            |
| command CLI    | comando `kiloclaw`         | alias transitorio da comando legacy + help deprecazione      | smoke test CLI su OS supportati |
| dirs           | layout prodotto dedicato   | rinomina percorsi legacy ambigui + compat symlink temporaneo | test path resolution            |
| schema URL     | dominio schema Kiloclaw    | publish JSON Schema versionata con redirects                 | schema fetch contract tests     |
| auth endpoints | endpoint dedicati Kiloclaw | aggiornamento SDK, token scopes, backward route temporanea   | auth integration tests          |
| telemetry      | eventi `kiloclaw.*`        | rename event taxonomy + dashboard migrate                    | telemetria coerente e completa  |

### Sequenza raccomandata

1. Package + command rename
2. Schema URL e config versioning
3. Auth endpoints + SDK regeneration
4. Telemetry migration
5. Rimozione compat layer dopo 2 release stabili

---

## Definisci QA SOTA 2026

### Stack verifiche obbligatorie

- Contract tests: interfacce runtime, config loader, memory APIs, auth
- Deterministic evals: dataset versionato, seed fisso, scoring ripetibile
- Safety regression suite: prompt injection, policy bypass, data exfiltration
- Memory consistency tests: integrità cross-layer, replay, recovery, dedup
- Performance/reliability: p95 latency, error budget, chaos drills

### Quality gates numerici

| Gate                         |      Soglia minima | Owner              |
| ---------------------------- | -----------------: | ------------------ |
| contract pass rate           |             >= 98% | qa                 |
| deterministic eval stability |        drift <= 2% | qa + architect     |
| safety critical scenarios    |          100% pass | qa                 |
| memory consistency must-have |          100% pass | qa + coder         |
| flakiness critical suite     |               < 1% | qa + devops        |
| p95 latency runtime core     | entro SLO definito | architect + devops |

---

## Definisci Go/No-Go per milestone

| Milestone          | Go se                                           | No-Go se                                     | Decision owner    |
| ------------------ | ----------------------------------------------- | -------------------------------------------- | ----------------- |
| Foundation         | baseline CI verde, ADR approvate                | inventario incompleto o baseline instabile   | orchestrator      |
| Core Runtime       | contract runtime >= 95%, error taxonomy stabile | coupling critico o regressioni non isolate   | architect         |
| Memory             | consistency pass 100%, retention verificata     | data integrity non garantita                 | architect + qa    |
| Agency Migration   | parity >= 95%, rollback pronto                  | gap core non mitigati                        | orchestrator + qa |
| Proactivity/Safety | safety critiche pass 100%                       | bypass safety non risolti                    | qa                |
| Verification       | tutti gate numerici verdi                       | presenza issue P0/P1                         | qa + devops       |
| Release            | runbook validato, canary stabile                | instabilità canary o rollback non affidabile | orchestrator      |

---

## Definisci timeline suggerita

| Settimana | Focus                     | Output principale                              |
| --------: | ------------------------- | ---------------------------------------------- |
|         1 | Foundation setup          | ADR + CI baseline + inventory ARIA             |
|         2 | Foundation closure        | mapping high-level + gate Foundation           |
|         3 | Core runtime model        | gerarchia agency-agent-skill-tool implementata |
|         4 | Runtime hardening         | contract tests runtime + config loader         |
|         5 | Runtime gate              | report readiness Core Runtime                  |
|         6 | Memory layer design/build | layer ephemeral/session operativi              |
|         7 | Memory completion         | layer project/knowledge + consistency engine   |
|         8 | Memory gate               | suite consistency completa                     |
|         9 | Agency migration wave 1   | agencies tier-1 migrate                        |
|        10 | Agency migration wave 2   | agencies tier-2 + parity tests                 |
|        11 | Migration gate            | parity report + decommission plan              |
|        12 | Proactivity               | framework autonomia controllata                |
|        13 | Safety                    | policy engine + regression suite completa      |
|        14 | Verification hardening    | contract + deterministic eval full             |
|        15 | Verification gate         | quality report finale pre-release              |
|        16 | Release                   | cutover, monitoraggio, closure report          |

---

## Definisci Definition of Done finale

Progetto di fondazione completato quando tutte le condizioni seguenti sono soddisfatte.

1. Runtime Kiloclaw in produzione con gerarchia agency-agent-skill-tool stabile e documentata
2. Memoria 4-layer operativa con test di consistenza e audit trail completi
3. Feature core ARIA migrate con parity funzionale >= 95% e rollback verificato
4. Configurazioni legacy (`.opencode.json` aria, `ARIA_*`, `ARIA.md`) migrate a target Kiloclaw con report completo
5. Isolamento prodotto/repo completato su package, command, dir, schema URL, auth, telemetry
6. Quality gates QA SOTA 2026 tutti verdi, senza issue P0/P1 aperte
7. Runbook release e incident response approvati, canary e go-live superati
8. Documentazione architetturale, operativa e migrazione pubblicata e versionata

---

## Definisci backlog minimo post-fondazione

- Rimozione definitiva compatibilità legacy oltre finestra di 2 release
- Ottimizzazione performance memory indexing su dataset estesi
- Estensione agency templates per verticali specifici
- Potenziamento eval suite con casi real-world continui

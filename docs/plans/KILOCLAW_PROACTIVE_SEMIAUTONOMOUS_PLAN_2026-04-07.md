---
title: "Piano proattivo"
description: "Roadmap tecnica per autonomia sicura e verificabile"
---
# Piano proattivo
## Allinea obiettivo
Questo piano definisce la transizione di Kiloclaw da assistente CLI reattivo a assistente proattivo/semi-autonomo con guardrail rigorosi.
Target principale: `packages/opencode`, in allineamento esplicito con `docs/foundation/KILOCLAW_BLUEPRINT.md`.
Obiettivi 2026:
- Abilitare proattivita sicura con execution durabile
- Eliminare percorsi permissivi impliciti nel core
- Rendere policy, audit e memoria elementi operativi
- Garantire isolamento runtime e verificabilita end-to-end
Vincoli non negoziabili:
- Nessuna azione irreversibile in modalita silente
- Ogni azione proattiva deve avere decisione policy e audit trail
- Ogni rollout deve avere rollback verificato
---
## Valuta stato attuale
### Evidenze locali principali
Core orchestrator:
- `packages/opencode/src/kiloclaw/orchestrator.ts`: `routeIntent` ritorna default `agency-default`
- `packages/opencode/src/kiloclaw/orchestrator.ts`: `enforcePolicy` ritorna `allowed: true` in modo permissivo
- `packages/opencode/src/kiloclaw/orchestrator.ts`: memory/scheduler/audit in-memory
Routing:
- `packages/opencode/src/kiloclaw/router.ts`: routing keyword-based (`DOMAIN_KEYWORDS`)
- `packages/opencode/src/kiloclaw/router.ts`: fallback `custom` senza decisioning da evidenze
Proattivita:
- `packages/opencode/src/kiloclaw/proactive/scheduler.ts`: registry task volatile (`Map`) e log locale
- `packages/opencode/src/kiloclaw/proactive/trigger.ts`: evaluator locale, senza persistenza
- `packages/opencode/src/kiloclaw/proactive/budget.ts`: budget in-memory con singleton di processo
- `packages/opencode/src/kiloclaw/proactive/limits.ts`: `isProactionAllowed()` ritorna sempre `true`
Memoria 4-layer:
- `packages/opencode/src/kiloclaw/memory/broker.ts`: commenti "In production, would ..."
- `packages/opencode/src/kiloclaw/memory/lifecycle.ts`: retention enforcement incompleto
- `packages/opencode/src/kiloclaw/memory/lifecycle.ts`: metriche semantic/procedural placeholder
Skills knowledge:
- `packages/opencode/src/kiloclaw/skills/knowledge/web-research.ts`: mock placeholder
- `packages/opencode/src/kiloclaw/skills/knowledge/literature-review.ts`: mock placeholder
Testing:
- `packages/opencode/test/kiloclaw/runtime.test.ts`: forte su contracts/happy path
- `packages/opencode/test/kiloclaw/runtime.test.ts`: non copre durable replay/recovery end-to-end
Workflow maturity mismatch:
- `.workflow/state.md` dichiara fasi avanzate complete
- Evidenza codice mostra maturita parziale su policy/proactivity/memory lifecycle
### Diagnosi sintetica
La modellazione e buona, ma l'enforcement operativo non e ancora adeguato per semi-autonomia in produzione.
Rischio primario: confondere completezza strutturale con maturity runtime.
---
## Analizza pattern OpenClaw
Pattern utili da adottare in Kiloclaw:
1) Distinguere scheduling da task ledger
- Fonti: `docs/automation/index.md`, `docs/automation/tasks.md`
- Pattern: tasks come ledger auditabile del lavoro detached
- Adozione: task ledger persistente con query/audit native
2) Scheduler service con ownership runtime
- Fonti: `docs/automation/cron-jobs.md`, `src/cron/service.ts`
- Pattern: scheduler dedicato, stato persistito, run history
- Adozione: separare scheduler service da orchestrator
3) FSM task formalizzata
- Fonti: `src/tasks/task-registry.types.ts`, `src/tasks/task-executor-policy.ts`
- Pattern: stati `queued/running/succeeded/failed/timed_out/cancelled/lost`
- Adozione: stessa FSM per proactivity runtime
4) Precedence/trust policy sulle estensioni
- Fonti: `docs/automation/hooks.md`, `src/hooks/policy.ts`
- Pattern: precedence esplicita, opt-in per sorgenti meno trusted
- Adozione: trust tiers su trigger/skills/tools proattivi
5) Standing orders con authority boundaries
- Fonte: `docs/automation/standing-orders.md`
- Pattern: authority + trigger + approval gate + escalation
- Adozione: safe proactivity guidata da programmi policy-bound
Conclusione:
- OpenClaw privilegia separazione di responsabilita, durabilita e audit.
- Kiloclaw deve convergere su questi assi con rollout incrementale.
---
## Applica best practice 2026
### Sintesi delle fonti esterne
Anthropic - Building Effective Agents:
- Preferire pattern semplici e composabili
- Aumentare complessita solo se misurata
- Esplicitare planning e migliorare agent-tool interface
LangGraph - Durable Execution:
- Checkpointing obbligatorio per resume
- Side effects idempotenti e isolati in task
- Replay deterministico con identity di run/thread
AWS Security Blog (Apr 2026):
- Controlli deterministici esterni al loop di reasoning
- Least privilege, isolamento compute, IAM rigorosa
- Autonomia guadagnata gradualmente tramite valutazione
OWASP Top 10 LLM:
- Priorita su LLM01, LLM02, LLM08
- Copertura su LLM05 e LLM06 come baseline
### Principi operativi derivati
- `P1` Policy-first orchestration
- `P2` Durable execution by default
- `P3` Human checkpointing risk-based
- `P4` Auditability immutabile end-to-end
- `P5` Least-privilege per agency/agent/skill/tool
- `P6` Rollout incrementale con rollback testato
---
## Mappa blueprint
Mappatura esplicita a `docs/foundation/KILOCLAW_BLUEPRINT.md`.
| Blueprint | Requisito | Stato attuale | Target piano |
|---|---|---|---|
| Sez. 4 Memory 4-layer | lifecycle completo e retrieval policy | parziale | wave 2-3 |
| Sez. 5 Policy engine | static + dynamic enforcement reale | permissivo nel core | wave 1-2 |
| Sez. 5.4 Safe proactivity | trigger consentiti + suggest-then-act | locale/in-memory | wave 3-4 |
| Sez. 6 Isolation | separazione hard config/runtime/storage | incompleta | wave 5 |
| Sez. 5.3 Auditability | event log immutabile correlato | audit locale | wave 2 |
Conformita stimata oggi:
- Memory 4-layer: 45%
- Policy enforcement: 30%
- Safe proactivity: 25%
- Isolation invariants: 60%
- Auditability: 35%
---
## Gap Analysis: Blueprint vs Stato Attuale
### Gap 1 - Orchestrator permissivo
Evidenza:
- `packages/opencode/src/kiloclaw/orchestrator.ts` usa default routing e policy allow-all
Rischio:
- Violazione compliance-first e safe proactivity
Intervento:
- Refactor orchestrator in policy-first runtime
- Decision log obbligatorio per ogni action
### Gap 2 - Proattivita non durabile
Evidenza:
- scheduler/trigger/budget/limits in-memory e non integrati end-to-end
Rischio:
- perdita stato su crash/restart e azioni duplicate
Intervento:
- task ledger persistente + worker + reconciliation
### Gap 3 - Memory lifecycle parziale
Evidenza:
- commenti "In production, would ..." in `memory/broker.ts` e `memory/lifecycle.ts`
Rischio:
- retention/purge incompleti e compliance debole
Intervento:
- persistence engine e retention jobs per tutti i layer
### Gap 4 - Skills knowledge mock
Evidenza:
- `web-research.ts` e `literature-review.ts` usano placeholder
Rischio:
- output non verificabile
Intervento:
- provider reali + evidence packaging + citation policy
### Gap 5 - Test non orientati a resilienza
Evidenza:
- suite attuale centrata su contracts/happy path
Rischio:
- regressioni su safety/durability in produzione
Intervento:
- suite dedicate a policy enforcement, crash recovery, replay idempotente
---
## Definisci architettura target
Moduli suggeriti in `packages/opencode`.
Core:
- `packages/opencode/src/kiloclaw/runtime/orchestrator-runtime.ts`
- `packages/opencode/src/kiloclaw/policy/executor.ts`
- `packages/opencode/src/kiloclaw/policy/decision-log.ts`
Proattivita:
- `packages/opencode/src/kiloclaw/proactive/task-ledger.ts`
- `packages/opencode/src/kiloclaw/proactive/scheduler-service.ts`
- `packages/opencode/src/kiloclaw/proactive/worker.ts`
- `packages/opencode/src/kiloclaw/proactive/store/sqlite.ts`
Memoria:
- `packages/opencode/src/kiloclaw/memory/persistence/sqlite-store.ts`
- `packages/opencode/src/kiloclaw/memory/jobs/retention.ts`
- `packages/opencode/src/kiloclaw/memory/retrieval/ranker.ts`
Audit e isolamento:
- `packages/opencode/src/kiloclaw/audit/store.ts`
- `packages/opencode/src/kiloclaw/audit/query.ts`
- `packages/opencode/src/kiloclaw/isolation/guard.ts`
- `packages/opencode/src/kiloclaw/isolation/paths.ts`
Skills knowledge:
- `packages/opencode/src/kiloclaw/skills/knowledge/providers/`
- `packages/opencode/src/kiloclaw/skills/knowledge/evidence.ts`
Test:
- `packages/opencode/test/kiloclaw/policy-enforcement.test.ts`
- `packages/opencode/test/kiloclaw/proactivity-runtime.test.ts`
- `packages/opencode/test/kiloclaw/durable-recovery.test.ts`
---
## Piano esecutivo in 6 wave
### Wave 1 - Stabilizzare core policy-first
Obiettivo:
- Rimuovere comportamento permissivo di default
Deliverable:
- Orchestrator instradato tramite policy executor
- Deny/gate su high risk senza approvazione
- Decision log con correlation id
Dipendenze:
- Nessuna
Gate di verifica:
- Suite policy enforcement verde
- Nessuna high-risk action passa senza gate
Rollback:
- Feature flag `KILOCLAW_POLICY_ENFORCEMENT=strict|compat`
KPI:
- `% high-risk blocked-or-gated >= 99%`
- `% decision events correlated = 100%`
Acceptance criteria:
- `orchestrator.ts` non ritorna allow-all
- Ogni action produce decision evidence
### Wave 2 - Rendere durabili audit e memory lifecycle
Obiettivo:
- Portare persistenza reale su audit e lifecycle memoria
Deliverable:
- Audit append-only store
- Retention/purge jobs operativi
- Metriche memory reali
Dipendenze:
- Wave 1
Gate di verifica:
- Restart test senza perdita audit
- Retention tests su casi limite
Rollback:
- Dual-write con switch `memory|sqlite`
KPI:
- `audit durability success = 100%`
- `retention job success >= 99%`
Acceptance criteria:
- Rimossi placeholder critici "In production, would ..."
- Lifecycle completo su tutti i layer
### Wave 3 - Industrializzare proattivita runtime
Obiettivo:
- Integrare trigger/budget/limits con esecuzione durabile
Deliverable:
- Task ledger FSM persistente
- Scheduler service con retry/backoff/timeout
- Reconciliation runtime-aware
Dipendenze:
- Wave 1, Wave 2
Gate di verifica:
- Crash recovery su task running
- Test anti-duplicazione con idempotency key
Rollback:
- Modalita `suggest_only`
- Toggle `KILOCLAW_PROACTIVE_ENABLED=false`
KPI:
- `task replay correctness >= 99.5%`
- `duplicate action rate <= 0.1%`
Acceptance criteria:
- Task sopravvivono al riavvio
- Stato `lost` gestito con grace period
### Wave 4 - Attivare safe proactivity e HITL
Obiettivo:
- Applicare "suggest then act" e approvazioni risk-based
Deliverable:
- Risk matrix operativa per proaction type
- Checkpoint obbligatori su azioni irreversibili
- Escalation path user/admin/audit
Dipendenze:
- Wave 3
Gate di verifica:
- Scenario tests su path low/high risk
- Test anti prompt-injection su policy boundaries
Rollback:
- Forzatura `confirmationMode=explicit_approval`
KPI:
- `% irreversible with explicit approval = 100%`
- `false autonomy incidents = 0`
Acceptance criteria:
- `isProactionAllowed` non e piu permissivo costante
- Ogni proaction ha rationale e evidence
### Wave 5 - Chiudere isolamento e observability
Obiettivo:
- Rendere hard-enforced isolamento stack e visibilita operativa
Deliverable:
- Isolation guard con prefisso `KILOCLAW_*`
- Boundary tests anti contaminazione legacy
- Dashboard KPI sicurezza/affidabilita
Dipendenze:
- Wave 2, Wave 4
Gate di verifica:
- Negative tests su `KILO_*` e `OPENCODE_*`
- Audit query completezza e coerenza
Rollback:
- Compat mode log-only temporaneo
KPI:
- `isolation violations allowed = 0`
- `audit query completeness >= 99%`
Acceptance criteria:
- Nessun fallback implicito verso namespace legacy
- Violazioni isolamento bloccate e tracciate
### Wave 6 - Validare release readiness
Obiettivo:
- Rilasciare progressivamente con rollback certo
Deliverable:
- Canary + staged rollout plan
- Runbook incident + rollback
- KPI baseline vs target firmati
Dipendenze:
- Wave 1-5
Gate di verifica:
- Drills failover/restart/timeout
- Suite OWASP-aligned pass
Rollback:
- Rollback one-command su feature flags
- Nessun rollback distruttivo su audit append-only
KPI:
- `MTTR incidenti proattivi < 30m`
- `policy gate bypass = 0`
- `pilot trust score >= 4/5`
Acceptance criteria:
- Gate di rilascio firmati da leadership tecnica e security
- Rollback testato in staging prima del go-live
---
## Definisci gate trasversali
Gate minimi per tutte le wave:
- `G1` Quality: test pass >= 95%
- `G2` Security: zero regressioni critiche
- `G3` Observability: metriche e log completi
- `G4` Rollback: prova rollback eseguita
Gate extra per wave 3-6:
- Replay deterministico verificato
- Idempotenza side effects verificata
- Approval HITL verificata su path irreversibili
---
## Misura KPI
KPI globali:
- Policy Enforcement Coverage
- Proactive Safety Compliance
- Durable Recovery Success
- Audit Completeness
- Isolation Integrity
Target fine programma:
- Policy Enforcement Coverage >= 98%
- Proactive Safety Compliance >= 99%
- Durable Recovery Success >= 99.5%
- Audit Completeness >= 99%
- Isolation Integrity = 100%
---
## Definition of Done
Il programma e concluso quando:
- orchestrator opera in modalita policy-first senza percorsi permissivi impliciti
- proattivita usa task runtime durabile con replay e reconciliation
- memoria 4-layer ha retention/purge/consolidation operativi e verificati
- policy engine applica static + dynamic controls su tutte le azioni eseguibili
- azioni irreversibili richiedono sempre checkpoint umano
- isolamento runtime/config/storage e enforced con boundary tests
- audit trail e immutabile, queryabile e correlato end-to-end
- skills knowledge non usano mock placeholder in produzione
- `.workflow/state.md` e riallineato allo stato reale con evidenze verificabili
---
## Rischi principali + mitigazioni
1) Regressioni da refactor core
- Mitigazione: feature flags, canary progressivo, contract tests
2) Duplicazioni in recovery
- Mitigazione: idempotency keys, lock FSM, replay tests
3) Policy troppo restrittive
- Mitigazione: modalita consultiva controllata e tuning da metriche
4) Excessive agency (OWASP LLM08)
- Mitigazione: budget hard, approval gates, escalation automatica
5) Prompt injection su tool boundaries (OWASP LLM01)
- Mitigazione: controlli esterni deterministici, allowlist strumenti, output validation
6) Sensitive data disclosure (OWASP LLM06)
- Mitigazione: classification, redaction audit, retention/purge enforce
7) Overreliance operativa (OWASP LLM09)
- Mitigazione: evidence-first outputs, review sampling, fallback consultivo
---
## Prioritizza backlog
P0 (bloccanti):
- Refactor policy-first di `orchestrator.ts`
- Task ledger persistente per proattivita
- Audit append-only con query API
- Chiusura placeholder critici memory lifecycle
P1 (alto impatto):
- Integrazione reale in `web-research.ts`
- Integrazione reale in `literature-review.ts`
- HITL risk-based nel policy executor
- Nuove suite resilience e recovery
P2 (hardening):
- Dashboard KPI sicurezza/proattivita
- Chaos drills scheduler runtime
- Drift detection su policy behavior
P3 (ottimizzazione):
- Routing ibrido keyword + learned ranking
- Adaptive budgeting per profilo rischio
---
## Pianifica dipendenze
| Workstream | Dipende da | Blocca |
|---|---|---|
| Policy-first core | nessuno | Proactivity runtime, HITL |
| Audit + persistence | Policy-first core | Memory lifecycle completo |
| Proactivity runtime | Policy-first core, Audit + persistence | Safe proactivity |
| Safe proactivity HITL | Proactivity runtime | Release readiness |
| Isolation enforcement | Policy-first core, Audit + persistence | Go-live |
| Release readiness | tutte | produzione |
Timeline proposta (9 sprint):
- Sprint 1-2: Wave 1
- Sprint 3-4: Wave 2
- Sprint 5-6: Wave 3
- Sprint 7: Wave 4
- Sprint 8: Wave 5
- Sprint 9: Wave 6
---
## Conferma governance
Cadence consigliata:
- Weekly engineering review su KPI e gate
- Bi-weekly security review su risk register e bypass attempts
- Monthly leadership review su readiness e decisioni di rollout
Artefatti richiesti:
- KPI report per wave
- Audit sampling report
- Incident/near miss report
- Aggiornamento mappatura blueprint
---
## Sorgenti esterne considerate
OpenClaw:
- https://github.com/openclaw/openclaw/blob/main/docs/automation/index.md
- https://github.com/openclaw/openclaw/blob/main/docs/automation/tasks.md
- https://github.com/openclaw/openclaw/blob/main/docs/automation/cron-jobs.md
- https://github.com/openclaw/openclaw/blob/main/docs/automation/standing-orders.md
- https://github.com/openclaw/openclaw/blob/main/docs/automation/hooks.md
- https://github.com/openclaw/openclaw/blob/main/src/tasks/task-registry.types.ts
- https://github.com/openclaw/openclaw/blob/main/src/tasks/task-executor-policy.ts
- https://github.com/openclaw/openclaw/blob/main/src/cron/service.ts
- https://github.com/openclaw/openclaw/blob/main/src/hooks/policy.ts
Best practice e sicurezza agentic AI:
- https://www.anthropic.com/research/building-effective-agents
- https://docs.langchain.com/oss/python/langgraph/durable-execution
- https://aws.amazon.com/blogs/security/four-security-principles-for-agentic-ai-systems/
- https://owasp.org/www-project-top-10-for-large-language-model-applications/
---
## Chiudi raccomandazioni
Raccomandazioni chiave:
- Avviare subito Wave 1 con focus su policy-first e decision log
- Preparare in parallelo design dettagliato di persistence (Wave 2)
- Non attivare autonomia piena prima del completamento Wave 4
- Riallineare `.workflow/state.md` a evidenze reali di maturita implementativa

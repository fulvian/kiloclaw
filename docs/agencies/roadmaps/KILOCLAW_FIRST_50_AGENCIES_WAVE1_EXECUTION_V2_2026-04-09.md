# KILOCLAW_FIRST_50_AGENCIES_WAVE1_EXECUTION_V2_2026-04-09

Piano esecutivo per implementare la Wave 1 della roadmap V2 personal-assistant-first.

Riferimenti:
- `docs/agencies/roadmaps/KILOCLAW_FIRST_50_AGENCIES_ROADMAP_V2_2026-04-09.md`
- `docs/foundation/KILOCLAW_BLUEPRINT.md`
- `docs/guide/KILOCLAW_AGENCY_AGENT_SKILL_TOOL_IMPLEMENTATION_GUIDE_2026-04-07.md`

---

## 1) Scope Wave 1

Agenzie in scope (1-16):
1. `morning-brief-orchestrator`
2. `inbox-declutter-assistant`
3. `calendar-conflict-resolver`
4. `task-triage-executor`
5. `focus-block-planner`
6. `personal-crm-nudger`
7. `family-calendar-sync`
8. `meeting-notes-tasker`
9. `multi-channel-inbox-hub`
10. `errands-shopping-planner`
11. `bills-subscription-watch`
12. `home-maintenance-reminder`
13. `commute-day-optimizer`
14. `wellness-routine-coach`
15. `personal-doc-capture`
16. `google-workspace-orchestrator`

Obiettivo operativo Wave 1:
- utilita quotidiana in <= 7 giorni
- integrazione produttivita personale con rischio controllato
- rilascio write-gated, non write-open

---

## 2) Milestone e sprint

## Sprint 0 - Foundation (2-3 giorni)

Deliverable:
- tassonomia capability unificata W1
- matrice risk levels `SAFE|NOTIFY|CONFIRM|DENY`
- policy base deny-by-default
- contract telemetry minima L0-L3

Acceptance:
- tutti i tool sono non esposti senza allowlist
- tests policy centrali verdi

## Sprint 1 - Core personal ops (4-5 giorni)

Agenzie:
- `morning-brief-orchestrator`
- `task-triage-executor`
- `focus-block-planner`
- `weekly-retro` equivalente come skill interna di supporto

Acceptance:
- morning brief con top 3 task + agenda + alert
- task ingestion da note/testo con priorita
- focus block proposto senza scrittura automatica

## Sprint 2 - Communication and calendar (4-5 giorni)

Agenzie:
- `inbox-declutter-assistant`
- `calendar-conflict-resolver`
- `meeting-notes-tasker`
- `multi-channel-inbox-hub`

Acceptance:
- inbox triage read-only con suggerimenti azione
- detection conflitti calendario e proposta risoluzione
- parsing note -> task con owner/deadline confidence score

## Sprint 3 - Family/admin/document (4-5 giorni)

Agenzie:
- `family-calendar-sync`
- `bills-subscription-watch`
- `home-maintenance-reminder`
- `personal-doc-capture`
- `errands-shopping-planner`

Acceptance:
- reminder scadenze personali affidabile
- classificazione documenti personali con tagging
- nessuna azione irreversibile senza HITL

## Sprint 4 - Google Workspace hardening (5-7 giorni)

Agenzia:
- `google-workspace-orchestrator`

Acceptance:
- onboarding OAuth incrementale
- read-only default per tutte le superfici
- write path solo con `CONFIRM`
- audit trail completo per invio/cancellazione/condivisione

---

## 3) Backlog implementabile per repository

## 3.1 Registry e definizioni

Creare/aggiornare:
- `packages/opencode/src/kiloclaw/agency/registry/agency-registry.ts`
- `packages/opencode/src/kiloclaw/agency/agency-definitions.ts`
- `packages/opencode/src/kiloclaw/agency/bootstrap.ts`

Task:
1. registrare 16 agenzie con `id`, `domain`, `policies`, `providers`
2. definire capability tags W1 in formato canonico
3. impostare `requiresApproval=true` per domini `CONFIRM`

## 3.2 Agent bundles

Creare agent archetipi per ciascuna agenzia:
- `planner-agent`
- `operator-agent`
- `validator-agent`
- `reporter-agent`

Task:
1. registrare agent in `FlexibleAgentRegistry`
2. impostare `PermissionNext` deny-by-default
3. associare skill list minima per agenzia

## 3.3 Skill bootstrap

Percorso consigliato:
- `packages/opencode/src/kiloclaw/skills/productivity/`
- `packages/opencode/src/kiloclaw/skills/workspace/`
- `packages/opencode/src/kiloclaw/skills/personal/`

Task:
1. 8-12 skill core per Sprint 1-2
2. 8-10 skill core per Sprint 3
3. 10-14 skill Workspace per Sprint 4

## 3.4 Tool policy centralizzata

Aggiornare:
- `packages/opencode/src/session/tool-policy.ts`
- `packages/opencode/src/session/prompt.ts`

Task:
1. mapping capability -> tools consentiti
2. blocco hard tool non autorizzati
3. metadata obbligatori: `providerUsed`, `fallbackChainTried`, `errorsByProvider`

---

## 4) Google Workspace Implementation Contract

## 4.1 Superfici minime Wave 1

- Gmail
- Calendar
- Drive
- Docs
- Sheets
- Chat
- Tasks
- Contacts

Meet e Admin:
- Meet: read-only opzionale Wave 1.5
- Admin: escluso default, consentito solo tenant admin dedicato

## 4.2 Gate policy per azioni

- `SAFE`: read/list/search/summarize
- `NOTIFY`: draft/label/proposal non distruttive
- `CONFIRM`: send/delete/share/create-update event/merge contatti
- `DENY`: bulk delete, forwarding esterno massivo, export contatti non autorizzato

## 4.3 Sequence operativa

1. OAuth consent screen con scope minimi
2. abilitare solo read-only scopes
3. validare flussi in shadow mode
4. sbloccare write-gated per singole feature
5. monitorare incidenti e rollback via flag

---

## 5) Test plan minimo Wave 1

Unit test:
- policy mapping capability->tool
- schema validation manifest/agent/skill
- risk-level routing (SAFE/NOTIFY/CONFIRM/DENY)

Integration test:
- intent -> agency -> agent -> skill -> tool
- inbox triage end-to-end read-only
- meeting notes -> task creation proposal
- calendar conflict detection + suggested resolution

Regression test:
- blocco tool fuori allowlist
- no bypass HITL su azioni `CONFIRM`
- no fallback implicito vendor-specific

Telemetry contract test:
- eventi L0-L3 con `decision`, `reason`, `latencyMs`, `correlationId`
- `PolicyDeniedEvent` e `FallbackUsedEvent` emessi correttamente

---

## 6) KPI Wave 1

Product KPI:
- `daily_brief_open_rate >= 60%`
- `inbox_triage_time_reduction >= 30%`
- `calendar_conflict_resolution_suggested >= 70%`
- `task_completion_7d_rate >= 65%`

Safety KPI:
- `0` azioni `CONFIRM` eseguite senza approval
- `policy_denial_false_positive < 5%`
- `high_risk_incidents = 0` in canary

Reliability KPI:
- `routing_p95_ms` entro budget definito
- `automation_success_rate >= 90%` su read-only flows

---

## 7) Rollout e gates

Sequenza:
1. `shadow` (solo osservazione)
2. `hard-gate canary` (10-15% utenti)
3. `full rollout` (solo dopo 2 cicli stabili)

Gate di passaggio Wave 1 -> Wave 2:
- KPI minimi raggiunti per 2 settimane
- test suite policy/routing verde
- audit trail completo su flussi workspace write-gated
- nessun bypass sicurezza aperto

---

## 8) Priorita operativa immediata (next 7 giorni)

1. registrare 16 agenzie Wave 1 con policy base
2. implementare 12 skill minime per morning/inbox/calendar/tasks
3. attivare `google-workspace-orchestrator` in read-only completo
4. implementare HITL gateway per write operations
5. attivare dashboard KPI + telemetry contrattuale

Questo piano rende la V2 eseguibile in modo incrementale, governato e focalizzato su valore personale concreto dal primo rilascio.

# Workspace agency

Piano operativo sicuro per delivery in 8 settimane.

---

## 1) Definisci executive summary e obiettivi

- Questo piano implementa la prima agency Google Workspace di KiloClaw con approccio `hybrid` a dominanza `native-first`, in linea con `KILOCLAW_FIRST_4_AGENCIES_IMPLEMENTATION_PLAN_2026-04-09`.
- La delivery segue il protocollo `G1..G6` di `KILOCLAW_AGENCY_IMPLEMENTATION_PROTOCOL_V1_2026-04-09`, con gate obbligatori, deny-by-default e rollout progressivo.
- Il design adotta i pattern Me4BrAIn: `SAFE/NOTIFY/CONFIRM/DENY`, skill crystallization e isolamento sessione per ridurre blast radius.
- Il design integra ispirazione `google_workspace_mcp`: copertura multi-servizio, tool tiers, OAuth multi-user, transport `http/stdio`, hardening security.

| Obiettivo | Target v1 | Misura |
|---|---:|---|
| Time-to-first-value | <= 2 settimane | Primo use case end-to-end su Gmail+Calendar |
| Coverage capability core | >= 85% servizi in-scope | Capability registry validato |
| Policy enforcement accuracy | 100% su test critici | Policy contract suite |
| Incidenti P1 nel rollout | 0 | Incident log |
| Latenza p95 read path | <= 2.5s | Telemetry runtime |
| Latenza p95 write path con HITL | <= 6s escluso attesa umana | Telemetry runtime |

---

## 2) Produci discovery brief iniziale

### Scope

| In scope v1 | Out of scope v1 |
|---|---|
| Gmail read/search/thread/draft/send controllato | Admin SDK mutazioni org-wide |
| Calendar list/create/update/check availability | Cancellazioni massive calendar-wide |
| Drive search/list/permission/share interno | Pubblicazione link pubblico by default |
| Docs read/append/update blocchi testuali | Editing avanzato layout complesso |
| Sheets read/update range/append righe | Macros e AppScript deployment |
| Cross-service search e summarization | Automazioni autonome senza HITL |

### Intent principali

- Recuperare informazioni operative da Gmail, Calendar e Drive in modo contestuale.
- Preparare bozze e azioni scritturali con conferma esplicita dove richiesto.
- Eseguire sincronizzazioni incrementali e notifiche senza perdita di consistenza.

### KPI di discovery

| KPI | Formula | Baseline | Target | Finestra |
|---|---|---:|---:|---|
| Requisiti con acceptance criteria | requisiti completi / requisiti totali | 0% | 100% | pre-G1 |
| KPI con baseline+target | KPI completi / KPI totali | 0% | 100% | pre-G1 |
| Rischi high con mitigazione | rischi mitigati / rischi high | 0% | 100% | pre-G1 |
| Chiarimento requisiti critici | ore medie per requisito | n/a | <= 24h | discovery |

### Rischi e compliance

| Rischio | Severita | Probabilita | Mitigazione | Limite hard |
|---|---|---|---|---|
| Scope OAuth eccessivo | Alta | Media | Least privilege + scope review gate | No go-live senza review scope |
| Azione write non autorizzata | Alta | Bassa | Policy matrix + HITL + audit | Blocco automatico |
| Drift sync Calendar/Drive | Media | Media | Sync token handling + full resync plan | Backlog retry <= 15 min |
| Saturazione quota API | Alta | Media | Backoff + queueing + token bucket | Error budget <= 1% |
| Data leakage cross-tenant | Critica | Bassa | Session isolation + tenant guard | Incident P1 = rollback immediato |

### Vincoli legali e sicurezza

- GDPR: minimizzazione dati, data retention configurabile, diritto alla cancellazione applicativa.
- Consent e verifica Google: gestione scope sensibili/restricted con evidenze documentali.
- Auditabilità: ogni write richiede correlation id, actor id, decision policy e stato HITL.

---

## 3) Registra tool decision record con scorecard

### Opzioni considerate

| Opzione | Descrizione sintetica |
|---|---|
| Native-first | Adapter diretti Google API in KiloClaw |
| MCP-first | Uso primario di `google_workspace_mcp` |
| Hybrid | Native primario + MCP fallback allowlisted |

### Scorecard pesata (1-5)

Pesi applicati: sicurezza `0.30`, affidabilita `0.25`, performance `0.20`, token/context cost `0.15`, maintenance `0.10`.

| Criterio | Peso | Native-first | MCP-first | Hybrid |
|---|---:|---:|---:|---:|
| Sicurezza | 0.30 | 5 | 3 | 4 |
| Affidabilita | 0.25 | 4 | 3 | 4 |
| Performance | 0.20 | 4 | 2 | 4 |
| Token/context cost | 0.15 | 5 | 2 | 4 |
| Maintenance | 0.10 | 3 | 4 | 3 |
| **Score totale** | 1.00 | **4.35** | **2.75** | **3.95** |

### Decisione G2

- Scelta: `Hybrid` con dominanza `Native-first`.
- Motivazione: massimizza sicurezza e footprint contenuto, mantenendo copertura rapida su capability non ancora native.
- Trigger fallback MCP: `native_unsupported`, `provider_degraded`, `feature_flag_mcp_enabled`.
- Gate: `G2 = GO` solo con allowlist capability MCP e policy minima `NOTIFY`.

### Tiers tool (ispirazione MCP)

| Tier | Tipo | Uso | Esempi |
|---|---|---|---|
| T0 | Core safe read | Default sempre attivo | list/search/get metadata |
| T1 | Read avanzato + transform | Attivo con `NOTIFY` | summarization cross-service |
| T2 | Write reversibile | Richiede `CONFIRM` | create draft, create event |
| T3 | Write ad alto impatto | Deny o HITL hard | external share, delete permanente |

---

## 4) Disegna architettura target e confini runtime

### Catena operativa

```text
Intent -> Agency(gworkspace) -> Agent(domain) -> Skill(capability bundle) -> Tool(native|mcp)
```

### Componenti runtime

| Componente | Responsabilita | Artefatto |
|---|---|---|
| Intent router | Classifica intento e rischio | `intent.class`, `risk.level` |
| Agency orchestrator | Seleziona agent e phase-gate | `agency.plan` |
| Domain agent | Esegue capability per servizio | `agent.exec` |
| Skill runtime | Skill crystallization riusabile | `skill.bundle` |
| Tool broker | Routing native/MCP + retry/backoff | `tool.decision` |
| Policy engine | Enforce SAFE/NOTIFY/CONFIRM/DENY | `policy.decision` |
| Session guard | Isolamento sessione e tenant | `session.boundary` |
| Audit sink | Persistenza eventi critici | `audit.record` |

### Confini read/write

| Boundary | Regola |
|---|---|
| Read path | No side effect, consentito con SAFE/NOTIFY |
| Write path reversibile | Richiede CONFIRM o HITL se rischio medio-alto |
| Write path irreversibile | DENY in v1 salvo eccezioni governate |
| Cross-tenant | Sempre DENY |
| Cross-domain esterno Workspace | Consentito solo via connector approvato |

### Isolamento sessione

- Session key composta da `workspace_id + user_id + channel_id`.
- Cache, token, contesto e queue sono namespace-isolati per sessione.
- Nessun riuso automatico di capability elevate tra sessioni diverse.

---

## 5) Definisci capability taxonomy completa

### Capability core v1

| Servizio | Capability read | Capability write | Tier default |
|---|---|---|---|
| Gmail | search thread, read message, list labels | create draft, send message, apply labels | T0-T2 |
| Calendar | list calendars, list events, availability | create event, update event, RSVP | T0-T2 |
| Drive | search/list files, get metadata, inspect permissions | move/copy file, share interno, comment | T0-T2 |
| Docs | read structure, extract sections | append block, replace text range | T0-T2 |
| Sheets | read ranges, get metadata | append rows, update ranges | T0-T2 |

### Estensioni previste

| Servizio | Stato v1 | Piano fallback |
|---|---|---|
| Slides | MVP read metadata | MCP fallback su operazioni avanzate |
| Forms | MVP list/get responses | MCP fallback create/update form |
| Tasks | MVP list/create task | Native backlog fase 2 |
| Chat | MVP read spaces/messages via scope limitato | MCP fallback per workflow avanzati |

### Fallback matrix per capability mancanti

| Stato native | Azione |
|---|---|
| `supported` | Esegui native e termina |
| `unsupported` + allowlist MCP | Esegui MCP con policy ereditata |
| `unsupported` senza allowlist | `DENY` con motivo e remediation |
| `degraded` | Retry native, poi MCP se permesso |

---

## 6) Progetta modello di autenticazione e segreti

### Modalita auth supportate

| Modalita | Casi d uso | Vincoli |
|---|---|---|
| OAuth user delegated | Azioni utente su mailbox/calendario/file | Consent esplicito e scope minimi |
| OAuth 2.1 profile multi-user | Tenant multi-account con refresh policy rigorosa | PKCE obbligatorio, refresh rotation |
| Service account + DWD | Automazioni dominio controllate | Solo scope approvati admin, audit continuo |

### Scope strategy least privilege

- Catalogo scope per capability, con mapping 1:1 e revisione security prima di `G3`.
- Blocca scope wildcard o scope ad accesso totale quando esiste scope ristretto equivalente.
- Verifica sensibile/restricted scope con processo compliance prima di canary.

### Token e segreti

| Area | Standard operativo |
|---|---|
| Storage token | Vault cifrato, envelope encryption KMS |
| Access token TTL | breve durata, no persistenza oltre session need |
| Refresh token | cifrati a riposo, bound per user+tenant |
| Rotation | automatica 30 giorni o incident-triggered |
| Revocation | endpoint unificato + cache purge immediata |
| Secret scanning | pre-commit + CI gate |

### Transport security

| Transport | Uso | Controlli |
|---|---|---|
| `http` | MCP remoto in ambienti server | mTLS opzionale, allowlist host, timeout hard |
| `stdio` | MCP locale sidecar | sandbox process, least privilege runtime |

---

## 7) Applica policy matrix SAFE/NOTIFY/CONFIRM/DENY

| Servizio | Operazione granulare | Policy | Note enforcement |
|---|---|---|---|
| Gmail | `messages.get`, `threads.list` | SAFE | redaction opzionale campi sensibili |
| Gmail | `drafts.create` | NOTIFY | mostra preview body |
| Gmail | `messages.send` | CONFIRM | conferma destinatari + allegati |
| Gmail | invio bulk > 50 destinatari | DENY | v1 blocco hard |
| Calendar | `events.list` | SAFE | filtro time window |
| Calendar | `events.insert` interno | CONFIRM | anteprima partecipanti e link |
| Calendar | update evento con >20 invitati | CONFIRM+HITL | rischio organizzativo |
| Drive | `files.list/get` | SAFE | controllo ACL prima di contenuto |
| Drive | share interno stesso dominio | CONFIRM | check gruppo destinatari |
| Drive | share pubblico/anonymous | DENY | no-go v1 |
| Docs/Sheets | read range/content | SAFE | data masking dove richiesto |
| Docs/Sheets | update range/testo | CONFIRM | diff obbligatorio |
| Cross-service | summarization | NOTIFY | provenance e source list |
| Qualsiasi | delete permanente | DENY | abilitabile solo v2 con governance |

---

## 8) Definisci protocollo HITL per alto rischio

### Trigger hard

- Invio email esterna fuori dominio.
- Condivisione file verso utenti esterni.
- Modifiche massive su calendari, documenti o fogli.
- Qualsiasi azione con impatto economico/legale dichiarato dal tenant.

### Sequenza operativa

| Step | Azione | Output |
|---|---|---|
| 1 | Genera execution plan con impatti | `hitl.plan` |
| 2 | Mostra preview/diff e rischio | `hitl.preview` |
| 3 | Richiedi approvazione con approver id | `hitl.approval` |
| 4 | Esegui entro TTL approvazione | `hitl.execution` |
| 5 | Registra post-action report | `hitl.report` |

### Regole di validita approvazione

| Regola | Valore v1 |
|---|---|
| TTL approvazione | 15 minuti |
| Binding | `plan_hash + actor + tenant` |
| Revoca | immediata via control plane |
| Missing/expired approval | `DENY` automatico |

---

## 9) Pianifica implementazione multi-fase con gate G1..G6

| Fase | Focus tecnico | Deliverable | Gate |
|---|---|---|---|
| F1 Discovery | Scope, KPI, rischi, compliance | Discovery Brief firmato | G1 |
| F2 Research | Scorecard tool e decisione | Tool Decision Record | G2 |
| F3 Design | Manifest, policy, architettura | Agency Manifest Draft | G3 |
| F4 Build | Adapter, broker, policy engine, HITL | Codice + config + migrazioni | G4 |
| F5 Verify | Test completi + telemetry contract | Report verifica | G5 |
| F6 Rollout | Shadow/canary/GA + runbook | Piano rilascio + ownership | G6 |

### Milestone tecniche

| Milestone | Contenuto | Exit criteria |
|---|---|---|
| M1 | Gmail+Calendar read path native | Contract test verdi + telemetry base |
| M2 | Drive/Docs/Sheets core | Policy matrix enforcement 100% |
| M3 | Write path + HITL + audit | Nessun bypass su suite security |
| M4 | Fallback MCP controllato | Switch trigger testato |
| M5 | Performance+resilience hardening | p95 in soglia + error budget rispettato |
| M6 | Canary readiness | Go/No-Go firmato |

---

## 10) Costruisci piano test completo

### Matrice test

| Categoria | Obiettivo | Copertura minima |
|---|---|---|
| Unit | Policy engine, routing, parser errori | >= 85% line coverage moduli core |
| Contract | Mapping capability->API | 100% capability in-scope |
| Integration | Chain Intent->Tool su sandbox | 30 scenari reali |
| Resilience | Retry/backoff, timeout, partial failure | 20 fault injection case |
| Security | Scope misuse, tenant bypass, prompt injection | 0 high finding aperti |
| Chaos | Degrado provider e network partitions | Run settimanale in pre-prod |
| Performance | p50/p95 latency, throughput, queue lag | carico 3x baseline |

### Casi critici obbligatori

- Gmail `429/5xx` con exponential backoff e jitter.
- Calendar `410 Gone` su `syncToken` con full resync controllato.
- Drive channel expiration e renew su push notifications.
- Workspace Events quota exceed con throttling e retry policy.

### Checklist verifica G5

- [ ] Tutti i test critici verdi su pipeline bloccante.
- [ ] Nessun bug severita alta aperto.
- [ ] Telemetry contract validata da dashboard.
- [ ] Security review firmata da owner.

---

## 11) Definisci observability e telemetry contract

### Eventi obbligatori

| Evento | Campi minimi |
|---|---|
| `intent.received` | intent_id, tenant_id, risk_level |
| `agency.route.decided` | agent_id, capability_id, provider |
| `policy.decision.made` | policy_level, reason, actor |
| `tool.call.started` | tool_id, request_id, timeout_ms |
| `tool.call.completed` | status, latency_ms, retry_count |
| `hitl.requested` | approval_id, ttl, approver_role |
| `hitl.completed` | outcome, execution_id |
| `audit.write` | object_id, before_hash, after_hash |

### Metriche runtime

| Area | Metriche |
|---|---|
| Latency | p50/p95 per servizio e per capability |
| Reliability | error_rate, retry_rate, fallback_rate |
| Safety | policy_block_rate, unsafe_attempt_rate |
| Cost | token_schema_size, tool_invocations, cost_per_run |
| Queueing | queue_depth, queue_wait_ms, dropped_jobs |

### Tracing e audit

- OpenTelemetry trace end-to-end con `trace_id` unico per run.
- Span obbligatori: intent classify, policy evaluate, tool call, hitl wait.
- Audit immutabile su storage append-only con retention configurabile.

---

## 12) Stabilisci SLO/SLA e capacity planning

### SLO v1

| SLO | Target | Error budget mensile |
|---|---:|---:|
| Availability read path | 99.5% | 3h 36m |
| Availability write path | 99.0% | 7h 12m |
| Latency p95 read | <= 2.5s | n/a |
| Latency p95 write (no attesa HITL) | <= 6s | n/a |
| Policy enforcement correctness | 99.99% | 4.3 min |

### Capacity e rate-limit

| Layer | Strategia |
|---|---|
| API quota | token bucket per servizio e per utente |
| Retry | exponential backoff con full jitter |
| Queueing | priority queue: SAFE read > write pending |
| Concurrency | limiti per tenant e globali configurabili |
| Burst control | circuit breaker su 429/503 persistenti |

### Parametri iniziali

| Parametro | Valore |
|---|---:|
| Max retry | 5 |
| Base backoff | 500ms |
| Max backoff | 32s |
| Timeout tool read | 8s |
| Timeout tool write | 15s |
| Queue TTL | 5m |

---

## 13) Organizza rollout, rollback e runbook incident

### Strategia rollout

| Stage | Traffico | Obiettivo | Criterio uscita |
|---|---:|---|---|
| Shadow | 0% impatto utente | comparare decisioni e metriche | delta errori < 2% |
| Canary 1 | 5% tenant pilota | validare stabilita reale | nessun P1 per 7 giorni |
| Canary 2 | 25% tenant | validare scalabilita | SLO in soglia |
| GA | 100% | operativita standard | G6 GO |

### Rollback plan

- Feature flag kill-switch per agency e per capability.
- Disattivazione immediata write path mantenendo read path SAFE.
- Fallback a MCP read-only o deny controllato in caso di incident severe.

### Runbook incident

| Fase | Azioni |
|---|---|
| Detect | Alert su SLO breach, spike 429/5xx, policy bypass |
| Triage | Classifica P1/P2/P3 e assegna incident commander |
| Mitigate | Attiva kill-switch, riduci concurrency, applica rollback |
| Recover | Valida stabilita, ripristina progressivo |
| Postmortem | RCA in 48h con azioni preventive |

---

## 14) Definisci RACI e governance operativa

| Attivita | Responsible | Accountable | Consulted | Informed |
|---|---|---|---|---|
| Discovery e KPI | Product Manager | Program Owner | Security, Legal | Engineering |
| Tool decision e architettura | Tech Lead | Chief Architect | SRE, Security | Product |
| Implementazione adapter/policy | Engineering Team | Tech Lead | QA | Support |
| Test e verifica G5 | QA Lead | Tech Lead | Security, SRE | Product |
| Rollout e on-call | SRE Lead | Program Owner | Engineering | Stakeholder |
| Compliance OAuth/scope | Security+Legal | Compliance Owner | Tech Lead | PM |

### Governance cadenzata

- Steering settimanale: stato milestone, rischi, decisioni bloccanti.
- Review sicurezza bisettimanale: scope, audit, incident trend.
- Go/No-Go board per ogni gate con evidenze firmate.

---

## 15) Pianifica backlog esecutivo di 8 settimane

| Settimana | Work package | Dipendenze | Output |
|---|---|---|---|
| W1 | Discovery, KPI, risk register, compliance baseline | nessuna | G1 draft |
| W2 | Tool decision, capability catalog, policy draft | W1 | G2 GO |
| W3 | Architettura runtime, manifest, boundaries | W2 | G3 GO |
| W4 | Gmail+Calendar adapter read + tests | W3 | M1 |
| W5 | Drive/Docs/Sheets adapter + policy engine | W4 | M2 |
| W6 | Write path, HITL, audit trail | W5 | M3 |
| W7 | MCP fallback, resilience, load tests | W6 | M4/M5 |
| W8 | Shadow->Canary, runbook, handover ops | W7 | G6 GO |

### Dipendenze chiave

| Blocco | Dipendenza | Mitigazione |
|---|---|---|
| OAuth verification | asset brand + policy privacy | avvio anticipato in W1 |
| Quota tuning | baseline traffico reale | shadow telemetry in W7 |
| DWD approval | admin domain policy | runbook admin dedicato |

---

## 16) Chiudi definition of done e checklist go/no-go

### Definition of done

- Capability in-scope implementate con mapping documentato e testato.
- Policy matrix enforced runtime senza bypass noti.
- HITL operativo con approvazione tracciata e TTL enforcement.
- Observability completa con dashboard e alert attivi.
- Runbook incident e rollback verificati con esercitazione.

### Checklist go/no-go finale

- [ ] `G1` Discovery Brief approvato e completo.
- [ ] `G2` Tool Decision Record con scorecard e rationale.
- [ ] `G3` Agency Manifest con deny-by-default e allowlist.
- [ ] `G4` Build/test locali e CI verdi.
- [ ] `G5` Test suite completa + telemetry contract validato.
- [ ] `G6` Rollout plan, owner on-call, runbook e rollback testato.
- [ ] Nessun rischio critico aperto senza mitigazione attiva.

---

## 17) Allega appendice fonti e riferimenti

### Riferimenti interni KiloClaw

- `docs/agencies/plans/KILOCLAW_FIRST_4_AGENCIES_IMPLEMENTATION_PLAN_2026-04-09.md`
- `docs/agencies/plans/KILOCLAW_AGENCY_IMPLEMENTATION_PROTOCOL_V1_2026-04-09.md`
- `docs/guide/KILOCLAW_AGENCY_AGENT_SKILL_TOOL_IMPLEMENTATION_GUIDE_2026-04-07.md`

### Ispirazioni architetturali

- Me4BrAIn: https://github.com/fulvian/Me4BrAIn
- Google Workspace MCP: https://github.com/taylorwilsdon/google_workspace_mcp

### Fonti ufficiali Google e standard

- OAuth consent e scope: https://developers.google.com/workspace/guides/configure-oauth-consent
- OAuth policy least privilege: https://developers.google.com/identity/protocols/oauth2/policies
- Gmail error handling e backoff: https://developers.google.com/workspace/gmail/api/guides/handle-errors
- Calendar incremental sync e `410 Gone`: https://developers.google.com/workspace/calendar/api/guides/sync
- Drive push notifications/channels/expiration: https://developers.google.com/workspace/drive/api/guides/push
- Workspace Events API overview: https://developers.google.com/workspace/events
- Workspace Events limits e quotas: https://developers.google.com/workspace/events/guides/limits
- Google API exponential backoff best practice: https://cloud.google.com/storage/docs/retry-strategy
- OAuth 2.1 draft (profilo sicurezza): https://datatracker.ietf.org/doc/html/draft-ietf-oauth-v2-1

### Note operative su riferimenti

- Le policy implementative v1 usano i principi Google ufficiali come baseline vincolante.
- Le parti OAuth 2.1 sono applicate come profilo interno di hardening compatibile con OAuth user delegated.

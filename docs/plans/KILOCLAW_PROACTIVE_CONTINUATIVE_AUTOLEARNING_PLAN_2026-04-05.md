# Kiloclaw Plan 2026 — Proattività Continuativa, Feedback Utente e Auto-Learning Governato

**Data:** 2026-04-05  
**Stato:** Proposta esecutiva (post-analisi codebase + doc + benchmark SOTA)  
**Scope:** Implementare capacità proattive/continuative/auto-learning previste da `KILOCLAW_BLUEPRINT.md`, estendendo il sistema memoria 4-layer già avanzato (`ADR-002`, `ADR-005`).

---

## 1) Executive summary

La codebase ha già solide fondamenta su memoria persistente, guardrail e proactivity framework, ma mancano ancora i pezzi che trasformano queste capacità in **ciclo chiuso di apprendimento continuo**:

1. **Feedback loop completo in produzione** (non solo struttura dati e handler base)
2. **Scheduler continuo reale** (persistente, job queue, retry, policy-aware)
3. **Auto-learning governato** (learning policies, drift detection, canary, rollback)
4. **Proattività personalizzata ma sicura** (utente-specifica, explainable, budget-aware)

Questo piano propone un’implementazione in 6 fasi, con gate di sicurezza/compliance e rollout graduale.

---

## 2) Baseline attuale (analisi concreta della codebase)

### 2.1 Cosa c’è già (forte)

- **Memoria 4-layer** con broker e persistence:
  - `packages/opencode/src/kiloclaw/memory/memory.broker.v2.ts`
  - `memory.repository.ts`, `memory.db.ts`, `memory.retention.ts`, `memory.maintenance.ts`
- **Feedback storage e primi handler**:
  - `memory.feedback.ts`
  - `feedback_events` + `user_profile` in `memory.db.ts`
- **Proactivity primitives**:
  - `proactive/trigger.ts`, `proactive/budget.ts`, `proactive/scheduler.ts`, `proactive/limits.ts`
- **Safety architecture** (policy, guardrail, HITL): coerente con `ADR-003`.

### 2.2 Gap principali (da chiudere)

1. **Feedback loop incompleto**
   - `MemoryFeedback.process()` registra eventi e produce azioni, ma diverse azioni restano "logical markers" non collegate a aggiornamenti ranking/routing robusti.
   - Mancano endpoint/workflow UX standardizzati per raccogliere feedback “task completed as expected / not expected” in modo uniforme cross-canale.

2. **Scheduler proattivo non persistente / non distribuito**
   - `ProactiveScheduler` è in-memory (Map + eventLog in RAM).
   - Non c’è scheduler engine con persistenza job, retry policy, dead-letter, lock distribuiti, reconciler dopo restart.

3. **Auto-learning policy-first non completo**
   - Esiste `MemoryLearning`, ma manca pipeline completa: feature store → trainer/updater → validator → canary → rollback.
   - Nessuna strategia formale di drift detection/guarded adaptation.

4. **Testing coverage insufficiente su proactivity/feedback runtime**
   - Trovati test feedback base (`memory-feedback.test.ts`), ma mancano test end-to-end robusti su scheduler/proactive/learning loop.

5. **Config non ancora estesa su asse learning/proactivity avanzata**
   - `config.ts` è solida su isolamento `KILOCLAW_*`, ma non espone ancora parametri granulari per learning governance.

---

## 3) Obiettivi funzionali richiesti

### 3.1 Feedback utente: “fatto bene / non fatto bene”

Implementare un sistema che permetta all’utente di valutare:

- qualità risposta
- correttezza task execution
- aderenza a stile/preferenze
- livello di autonomia desiderato

e usare questo segnale per aggiornare:

- preferenze utente (semantic memory + user profile)
- priorità/ranking retrieval
- strategie procedurali (success/failure pattern)
- policy proattive personalizzate

### 3.2 Scheduling compiti

Passare da scheduler in-memory a **task orchestration persistente**, con:

- schedule periodiche, reminder, threshold, anomaly
- retry/backoff e dead-letter
- budget/risk/hitl gates prima dell’esecuzione
- audit trail completo

### 3.3 Auto-learning entro limiti utente

Abilitare iniziativa autonoma solo entro:

- limiti espliciti utente
- policy rischio
- budget giornalieri
- trasparenza (`why this action`, `why now`)

---

## 4) Best practice SOTA 2025-2026 integrate nel piano

Fonti consultate (online):

- AWS (2026): valutazione agenti multi-layer + HITL + monitoraggio continuo
  - https://aws.amazon.com/blogs/machine-learning/evaluating-ai-agents-real-world-lessons-from-building-agentic-systems-at-amazon/
- NIST AI RMF + GenAI Profile (AI 600-1): governance, go/no-go, incident process, monitoraggio rischi generativi
  - https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf
- OpenAI eval best practices: eval-driven development, dataset reali+expert, CE continua
  - https://developers.openai.com/api/docs/guides/evaluation-best-practices/
- Langfuse LLM eval 101 (2025): online+offline eval, tracing, feedback/annotation loop
  - https://langfuse.com/blog/2025-03-04-llm-evaluation-101-best-practices-and-challenges

Principi applicati:

1. **Holistic eval**: non solo output finale, ma tool-use, memory retrieval, handoff e task success.
2. **Human-in-the-loop strutturale**: non opzionale per high-impact.
3. **Continuous evaluation in production**: metriche online con alerting su drift.
4. **Feedback-grounded personalization**: preferenze apprese da segnali espliciti+impliciti.
5. **Policy-governed autonomy**: nessuna auto-azione fuori da limiti utente e risk budget.

---

## 5) Architettura target (incrementale, compatibile)

## 5.1 Nuovi moduli proposti

```
packages/opencode/src/kiloclaw/
├── feedback/
│   ├── contract.ts              # schema feedback unificato
│   ├── processor.ts             # normalizzazione + validazione
│   ├── learner.ts               # updates su profile/ranking/procedural
│   └── api.ts                   # integration points (CLI/SDK/server)
├── proactive/
│   ├── scheduler.engine.ts      # scheduler persistente + dispatcher
│   ├── scheduler.store.ts       # repo job, retries, DLQ
│   ├── policy-gate.ts           # budget+risk+hitl gate unico
│   └── explain.ts               # rationale proattività
├── autolearning/
│   ├── feature-store.ts         # feature estratte da usage/feedback
│   ├── trainer.ts               # model/rules updater
│   ├── validator.ts             # offline eval + guard threshold
│   ├── canary.ts                # rollout controllato
│   ├── drift.ts                 # rilevazione drift
│   └── rollback.ts              # fallback a policy precedente
└── telemetry/
    ├── feedback.metrics.ts
    ├── proactive.metrics.ts
    └── learning.metrics.ts
```

## 5.2 Estensioni schema dati

Evolvere `feedback_events` e aggiungere tabelle:

- `feedback_events` (estensione)
  - `task_id`, `session_id`, `correlation_id`, `channel`, `score` (0-1), `expected_outcome`, `actual_outcome`
- `proactive_tasks`
  - pianificazione persistente, cron, next_run_at, status, retry_count, last_error
- `proactive_task_runs`
  - outcome, duration, gate decisions, evidence refs
- `learning_snapshots`
  - versione policy/profilo, metriche pre/post, canary cohort
- `learning_drift_events`
  - tipo drift, severity, azione automatica/manuale

---

## 6) Piano implementativo dettagliato

## Fase 0 — Alignment & contracts (2-3 giorni)

Deliverable:

- Contratto feedback unico cross-channel (CLI, VSCode, API)
- Dizionario “Task outcome quality”
- Definizione metriche SLO/SLA

Output tecnico:

- `feedback/contract.ts` con schema zod
- Mappatura reason codes: `wrong_fact`, `irrelevant`, `too_verbose`, `style_mismatch`, `unsafe`, `task_failed`, `task_partial`, `expectation_mismatch`

Gate:

- approvazione prodotto + sicurezza su taxonomy feedback

## Fase 1 — Feedback loop operativo end-to-end (5-7 giorni)

Obiettivo:

- chiudere il loop raccolta → storage → update profilo/procedure/ranking

Attività:

1. Integrare raccolta feedback su risposta e su task execution
2. Potenziare `MemoryFeedback.process()` con azioni persistenti reali
3. Collegare feedback a:
   - `UserProfileRepo.upsert()` (preferenze granulari)
   - `ProceduralMemoryRepo.updateStats()` (success/failure weighted)
   - ranking signals (`provenanceQuality`, `userPreferenceMatch`)
4. Aggiungere endpoint/event bus feedback
5. Audit log completo per ogni update learning-driven

Test minimi:

- unit su parser feedback
- integration su roundtrip feedback→profile
- regression su retrieval ranking post-feedback

KPIs:

- feedback roundtrip p95 < 2s
- coverage feedback >= 30% sessioni attive

## Fase 2 — Scheduler persistente e continuativo (6-8 giorni)

Obiettivo:

- sostituire scheduler in-memory con engine persistente

Attività:

1. Implementare `scheduler.store.ts` con stato job persistente
2. Implementare `scheduler.engine.ts` con:
   - dispatcher tick-based
   - retry exponential backoff
   - DLQ e replay controllato
3. Integrare gates:
   - budget (`BudgetManager`)
   - trigger policy (`ProactivityLimitsManager`)
   - risk + hitl (guardrail/policy)
4. Event sourcing run history (`proactive_task_runs`)
5. Recovery on restart + idempotency key

Test minimi:

- crash-recovery
- duplicate prevention/idempotency
- retry/DLQ
- budget enforcement

SLO:

- missed schedule < 0.5%
- duplicate execution = 0 (su task idempotenti)

## Fase 3 — Auto-learning governato (8-12 giorni)

Obiettivo:

- apprendimento continuo senza perdere controllo/sicurezza

Attività:

1. Feature store da usage + feedback + task outcomes
2. Algoritmi iniziali (no heavy model first):
   - preference scoring aggiornabile
   - routing bias correction
   - proactive priority tuning
3. Validator con soglie minime (go/no-go)
4. Canary rollout per policy/profili aggiornati
5. Rollback automatico se metriche degradano
6. Drift detector (accuracy/relevance/safety drift)

Principio:

- prima **rule-based + lightweight learning**, poi eventuale ML avanzato quando telemetria è stabile.

KPIs:

- +15% task satisfaction in 30 giorni
- -20% irrelevance feedback in 30 giorni
- zero increase su unsafe incidents

## Fase 4 — Proattività personalizzata con explainability (4-6 giorni)

Obiettivo:

- iniziativa autonoma trasparente, contestuale, non invasiva

Attività:

1. `proactive/explain.ts` per spiegare ogni proaction:
   - trigger
   - segnali usati
   - policy/budget che l’hanno autorizzata
2. Suggest-then-act di default per domini non critici
3. Quiet hours + user override + kill-switch per-user
4. Personalizzazione limiti per profilo utente

UX contract minimo:

- ogni azione proattiva mostra “perché” + “come disattivarla”

## Fase 5 — Eval/Observability/Operations (continuativa, 1 sprint iniziale)

Attività:

1. Dashboard unificata:
   - feedback quality
   - scheduler health
   - learning drift
2. Evals offline + online (CI + runtime)
3. Alerting su threshold breach
4. Runbook incident + rollback drills

---

## 7) Modello feedback utente proposto

Schema operativo:

```ts
type FeedbackEvent = {
  id: string
  tenantId: string
  userId?: string
  sessionId?: string
  correlationId?: string
  target: {
    type: "response" | "task" | "proactive_action" | "memory_retrieval"
    id: string
  }
  vote: "up" | "down"
  score?: number // 0..1
  reason:
    | "wrong_fact"
    | "irrelevant"
    | "too_verbose"
    | "style_mismatch"
    | "unsafe"
    | "task_failed"
    | "task_partial"
    | "expectation_mismatch"
    | "other"
  correction?: string
  expectedOutcome?: string
  actualOutcome?: string
  ts: number
}
```

Learning updates derivati:

- **Profile update**: stile, densità, tono, livello dettaglio
- **Retrieval update**: penalità/fonti per reason `wrong_fact`/`irrelevant`
- **Procedure update**: success rate con peso feedback
- **Proactive policy update**: abbassare/aggiustare aggressività per utente

---

## 8) Safety, compliance, governance

Allineamento con ADR-003 + NIST AI RMF:

1. **Go/No-Go gates** per ogni auto-update policy
2. **Human override** sempre disponibile
3. **Immutable audit** su decisioni learning-driven
4. **Data minimization** su payload feedback
5. **RTBF compatibility**: feedback/profile cancellabili con propagazione

Controlli obbligatori:

- nessuna autoazione irreversibile senza approvazione esplicita
- kill-switch globale/per-agency/per-user
- fallback consultivo se confidence/risk non soddisfa threshold

---

## 9) KPI, metriche e qualità

### Product KPIs

- User Satisfaction (thumb up rate)
- Task Success as perceived by user
- Proactive Acceptance Rate
- Opt-out rate proattività (deve restare bassa)

### Engineering KPIs

- feedback ingest p95 latency
- scheduler execution success rate
- retry/DLQ rate
- rollback count / month

### Safety KPIs

- unsafe feedback rate
- policy violation count
- high-risk action blocked ratio

---

## 10) Test strategy (obbligatoria)

1. **Unit**
   - feedback parsing/validation
   - learner update rules
   - scheduler retry logic

2. **Integration**
   - feedback→memory→retrieval impact
   - scheduled task with policy gate
   - auto-learning canary + rollback

3. **E2E**
   - session reali con feedback esplicito
   - task proattivi su più giorni simulati
   - drift scenario + remediation

4. **Safety tests**
   - no action beyond user limits
   - irreversible actions blocked without approval

---

## 11) Rollout plan

### Stage A — Internal dogfooding (1-2 settimane)

- feedback UI/API attiva
- scheduler persistente in shadow mode
- learning updates solo osservativi (no write)

### Stage B — Canary utenti opt-in (2-4 settimane)

- write limitato su profili
- proattività suggeritiva, non esecutiva
- monitoraggio intensivo + rollback automatico

### Stage C — Progressive general availability

- estensione graduale per tenant
- abilitazione auto-actions solo low-risk
- review mensile di drift/safety

---

## 12) Rischi principali e mitigazioni

1. **Over-personalization / filtro eccessivo**
   - mitigazione: exploration budget + diversity constraint

2. **Feedback gaming / abuso segnale**
   - mitigazione: trust score utente + anomaly detection

3. **Scheduler runaway**
   - mitigazione: hard caps + per-user/tenant circuit breaker

4. **Drift silente qualità**
   - mitigazione: CE online + canary + rollback

5. **Regressioni su safety**
   - mitigazione: gate safety non bypassabile + blocco deploy

---

## 13) Backlog tecnico suggerito (ordine di esecuzione)

P0:

1. Contratto feedback unificato + endpoint/event ingestion
2. Feedback processor con update persistenti reali
3. Scheduler store persistente + dispatcher + retry
4. Gate unico budget/risk/hitl per task proattivi

P1:

5. Feature store learning
6. Validator + canary + rollback
7. Explainability layer per proattività

P2:

8. Drift detection avanzata
9. Personalizzazione limiti dinamica per utente
10. Ottimizzazioni ranking adattivo avanzato

---

## 14) Criteri di accettazione finali

Il piano è considerato completato quando:

1. feedback utente è raccolto e usato in produzione end-to-end;
2. scheduler è persistente, resiliente a restart e policy-aware;
3. auto-learning opera con canary+rollback e senza regressioni safety;
4. proattività resta entro limiti utente con spiegabilità completa;
5. KPI di qualità migliorano in modo misurabile per almeno 30 giorni.

---

## 15) Note operative su compatibilità con stato attuale

- Mantiene compatibilità con `MemoryBrokerV2` e ADR correnti.
- Estende, non rompe, `memory.feedback.ts` e `proactive/*`.
- Riusa la base audit/policy/retention già presente.
- Segue principio blueprint: **safe proactivity + memory as system + verifiability-first**.

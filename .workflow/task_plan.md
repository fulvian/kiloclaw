# Task Plan — KILOCLAW_PROACTIVE_CONTINUATIVE_AUTOLEARNING_PLAN

## Status: FASE 0 - Alignment & Contracts (PENDING)

## Reference Document

- `docs/plans/KILOCLAW_PROACTIVE_CONTINUATIVE_AUTOLEARNING_PLAN_2026-04-05.md`

## Scope

Implementare ciclo chiuso di apprendimento continuo:

1. Feedback loop completo in produzione
2. Scheduler continuo persistente (job queue, retry, policy-aware)
3. Auto-learning governato (learning policies, drift detection, canary, rollback)
4. Proattività personalizzata ma sicura (utente-specifica, explainable, budget-aware)

---

## Baseline Analysis

### Esistente (Gap da chiudere)

| Componente                  | Stato          | Gap                                               |
| --------------------------- | -------------- | ------------------------------------------------- |
| `memory/memory.feedback.ts` | Base esistente | Azioni restano "logical markers" non persistenti  |
| `proactive/scheduler.ts`    | In-memory      | Map + eventLog in RAM, no persistenza, retry, DLQ |
| `proactive/trigger.ts`      | Esistente      | TriggerEvaluator funzionante                      |
| `memory.broker.v2.ts`       | Avanzato       | Memory broker 4-layer presente                    |
| Safety architecture         | Coerente       | Policy, guardrail, HITL presenti (ADR-003)        |

### Gap Principali

1. **Feedback loop incompleto**: `MemoryFeedback.process()` produce azioni ma non aggiornamenti ranking/routing robusti
2. **Scheduler non persistente**: No job store, retry policy, dead-letter, lock distribuiti
3. **Auto-learning policy-first**: Manca pipeline completa feature store → trainer → validator → canary → rollback
4. **Testing coverage insufficiente**: Mancano test e2e su scheduler/proactive/learning
5. **Config non estesa**: Manca configurazione granulare per learning governance

---

## Piano Implementativo (6 Fasi)

### Phase 0 — Alignment & Contracts (2-3 giorni)

**Obiettivo**: Contratto feedback unificato cross-channel

**Deliverables**:

- [ ] `feedback/contract.ts` con schema Zod unificato
- [ ] Dizionario "Task outcome quality"
- [ ] Mappatura reason codes standardizzati
- [ ] Definizione metriche SLO/SLA

**Output tecnico**:

```ts
// feedback/contract.ts - Schema unificato
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
  reason: ReasonCode
  correction?: string
  expectedOutcome?: string
  actualOutcome?: string
  ts: number
}

type ReasonCode =
  | "wrong_fact"
  | "irrelevant"
  | "too_verbose"
  | "style_mismatch"
  | "unsafe"
  | "task_failed"
  | "task_partial"
  | "expectation_mismatch"
  | "other"
```

**Gate**: Approvazione prodotto + sicurezza su taxonomy feedback

---

### Phase 1 — Feedback Loop End-to-End (5-7 giorni)

**Obiettivo**: Chiudere loop raccolta → storage → update profilo/procedure/ranking

**Attività**:

1. [ ] Integrare raccolta feedback su risposta e task execution
2. [ ] Potenziare `MemoryFeedback.process()` con azioni persistenti reali
3. [ ] Collegare feedback a:
   - [ ] `UserProfileRepo.upsert()` (preferenze granulari)
   - [ ] `ProceduralMemoryRepo.updateStats()` (success/failure weighted)
   - [ ] ranking signals (`provenanceQuality`, `userPreferenceMatch`)
4. [ ] Aggiungere endpoint/event bus feedback
5. [ ] Audit log completo per ogni update learning-driven

**Test minimi**:

- [ ] Unit su parser feedback
- [ ] Integration su roundtrip feedback→profile
- [ ] Regression su retrieval ranking post-feedback

**KPI**:

- feedback roundtrip p95 < 2s
- coverage feedback >= 30% sessioni attive

---

### Phase 2 — Scheduler Persistente e Continuativo (6-8 giorni)

**Obiettivo**: Sostituire scheduler in-memory con engine persistente

**Attività**:

1. [ ] Implementare `scheduler.store.ts` con stato job persistente
2. [ ] Implementare `scheduler.engine.ts` con:
   - [ ] dispatcher tick-based
   - [ ] retry exponential backoff
   - [ ] DLQ e replay controllato
3. [ ] Integrare gates:
   - [ ] budget (`BudgetManager`)
   - [ ] trigger policy (`ProactivityLimitsManager`)
   - [ ] risk + hitl (guardrail/policy)
4. [ ] Event sourcing run history (`proactive_task_runs`)
5. [ ] Recovery on restart + idempotency key

**Test minimi**:

- [ ] crash-recovery
- [ ] duplicate prevention/idempotency
- [ ] retry/DLQ
- [ ] budget enforcement

**SLO**:

- missed schedule < 0.5%
- duplicate execution = 0 (su task idempotenti)

---

### Phase 3 — Auto-Learning Governato (8-12 giorni)

**Obiettivo**: Apprendimento continuo senza perdere controllo/sicurezza

**Attività**:

1. [ ] Feature store da usage + feedback + task outcomes
2. [ ] Algoritmi iniziali (rule-based + lightweight learning):
   - [ ] preference scoring aggiornabile
   - [ ] routing bias correction
   - [ ] proactive priority tuning
3. [ ] Validator con soglie minime (go/no-go)
4. [ ] Canary rollout per policy/profili aggiornati
5. [ ] Rollback automatico se metriche degradano
6. [ ] Drift detector (accuracy/relevance/safety drift)

**Principio**: Prima rule-based + lightweight learning, poi eventuale ML avanzato

**KPI**:

- +15% task satisfaction in 30 giorni
- -20% irrelevance feedback in 30 giorni
- zero increase su unsafe incidents

---

### Phase 4 — Proattività Personalizzata con Explainability (4-6 giorni)

**Obiettivo**: Iniziativa autonoma trasparente, contestuale, non invasiva

**Attività**:

1. [ ] `proactive/explain.ts` per spiegare ogni proaction:
   - trigger
   - segnali usati
   - policy/budget che l'hanno autorizzata
2. [ ] Suggest-then-act di default per domini non critici
3. [ ] Quiet hours + user override + kill-switch per-user
4. [ ] Personalizzazione limiti per profilo utente

**UX contract minimo**:

- ogni azione proattiva mostra "perché" + "come disattivarla"

---

### Phase 5 — Eval/Observability/Operations (continuativa)

**Obiettivo**: Dashboard, alerting, runbook

**Attività**:

1. [ ] Dashboard unificata:
   - feedback quality
   - scheduler health
   - learning drift
2. [ ] Evals offline + online (CI + runtime)
3. [ ] Alerting su threshold breach
4. [ ] Runbook incident + rollback drills

---

## Backlog Tecnico (P0/P1/P2)

### P0 (Must Have)

1. [ ] Contratto feedback unificato + endpoint/event ingestion
2. [ ] Feedback processor con update persistenti reali
3. [ ] Scheduler store persistente + dispatcher + retry
4. [ ] Gate unico budget/risk/hitl per task proattivi

### P1 (Should Have)

5. [ ] Feature store learning
6. [ ] Validator + canary + rollback
7. [ ] Explainability layer per proattività

### P2 (Nice to Have)

8. [ ] Drift detection avanzata
9. [ ] Personalizzazione limiti dinamica per utente
10. [ ] Ottimizzazioni ranking adattivo avanzato

---

## Architettura Target

```
packages/opencode/src/kiloclaw/
├── feedback/
│   ├── contract.ts              # schema feedback unificato ✅ Phase 0
│   ├── processor.ts             # normalizzazione + validazione ✅ Phase 1
│   ├── learner.ts               # updates su profile/ranking/procedural ✅ Phase 1
│   └── api.ts                   # integration points (CLI/SDK/server) ✅ Phase 1
├── proactive/
│   ├── scheduler.engine.ts      # scheduler persistente + dispatcher ✅ Phase 2
│   ├── scheduler.store.ts       # repo job, retries, DLQ ✅ Phase 2
│   ├── policy-gate.ts           # budget+risk+hitl gate unico ✅ Phase 2
│   └── explain.ts               # rationale proattività ✅ Phase 4
├── autolearning/
│   ├── feature-store.ts         # feature estratte da usage/feedback ✅ Phase 3
│   ├── trainer.ts               # model/rules updater ✅ Phase 3
│   ├── validator.ts             # offline eval + guard threshold ✅ Phase 3
│   ├── canary.ts                # rollout controllato ✅ Phase 3
│   ├── drift.ts                 # rilevazione drift ✅ Phase 3
│   └── rollback.ts              # fallback a policy precedente ✅ Phase 3
└── telemetry/
    ├── feedback.metrics.ts
    ├── proactive.metrics.ts
    └── learning.metrics.ts ✅ Phase 5
```

---

## Schema Database (Estensioni)

### `feedback_events` (estensione)

- `task_id`, `session_id`, `correlation_id`, `channel`, `score` (0-1)
- `expected_outcome`, `actual_outcome`

### `proactive_tasks`

- pianificazione persistente, cron, next_run_at, status, retry_count, last_error

### `proactive_task_runs`

- outcome, duration, gate decisions, evidence refs

### `learning_snapshots`

- versione policy/profilo, metriche pre/post, canary cohort

### `learning_drift_events`

- tipo drift, severity, azione automatica/manuale

---

## Rollout Plan

### Stage A — Internal dogfooding (1-2 settimane)

- [ ] feedback UI/API attiva
- [ ] scheduler persistente in shadow mode
- [ ] learning updates solo osservativi (no write)

### Stage B — Canary utenti opt-in (2-4 settimane)

- [ ] write limitato su profili
- [ ] proattività suggeritiva, non esecutiva
- [ ] monitoraggio intensivo + rollback automatico

### Stage C — Progressive GA

- [ ] estensione graduale per tenant
- [ ] auto-actions solo low-risk
- [ ] review mensile di drift/safety

---

## Criteri di Accettazione Finali

Il piano è completato quando:

1. ✅ feedback utente è raccolto e usato in produzione end-to-end
2. ✅ scheduler è persistente, resiliente a restart e policy-aware
3. ✅ auto-learning opera con canary+rollback e senza regressioni safety
4. ✅ proattività resta entro limiti utente con spiegabilità completa
5. ✅ KPI di qualità migliorano in modo misurabile per almeno 30 giorni

---

## Dipendenze da Moduli Esistenti

| Modulo                        | Utilizzo                                          |
| ----------------------------- | ------------------------------------------------- |
| `memory/memory.broker.v2.ts`  | Broker 4-layer esistente - da estendere           |
| `memory/memory.repository.ts` | FeedbackRepo, UserProfileRepo - da usare          |
| `proactive/trigger.ts`        | TriggerEvaluator esistente - da integrare         |
| `proactive/budget.ts`         | BudgetManager esistente - da usare                |
| `proactive/limits.ts`         | ProactivityLimitsManager esistente - da integrare |
| `policy/engine.ts`            | Policy engine esistente - da usare per gate       |
| `guardrail/*`                 | Guardrails esistenti - da integrare               |

---

## Errori Incontrati

(to be filled during execution)

## Decisioni

(to be filled during execution)

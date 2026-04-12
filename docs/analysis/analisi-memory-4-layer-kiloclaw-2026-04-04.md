# Analisi approfondita sistema di memoria 4-layer (Kiloclaw)

**Data analisi:** 2026-04-04  
**Documento di riferimento:** `docs/foundation/KILOCLAW_BLUEPRINT.md` (sez. 4 + criteri sez. 9.3)  
**Codice analizzato:** `packages/opencode/src/kiloclaw/memory/*` + integrazione orchestratore + test correlati

---

## 1) Executive Summary

### Verdetto sintetico
Il sistema **4-layer esiste ed è funzionante a livello modulare locale** (working, episodic, semantic, procedural), con broker e lifecycle implementati e test verdi.

Tuttavia, **non risulta pienamente attivato end-to-end nel runtime core** secondo l’ambizione blueprint (“memory as system”): ci sono gap significativi su persistenza, enforcement retention/purge, consolidamento reale, ranking multi-fattore, audit trail immutabile e integrazione nativa con orchestrazione/policy.

### Stato reale
- **Funzionante (moduli):** ✅
- **Funzionante (integrazione completa production-grade):** ⚠️ parziale
- **Aderenza blueprint 2026 (compliance/verifiability/memory-driven):** ⚠️ incompleta

---

## 2) Metodologia e verifiche eseguite

Analisi effettuata su:
- `packages/opencode/src/kiloclaw/memory/types.ts`
- `packages/opencode/src/kiloclaw/memory/working.ts`
- `packages/opencode/src/kiloclaw/memory/episodic.ts`
- `packages/opencode/src/kiloclaw/memory/semantic.ts`
- `packages/opencode/src/kiloclaw/memory/procedural.ts`
- `packages/opencode/src/kiloclaw/memory/broker.ts`
- `packages/opencode/src/kiloclaw/memory/lifecycle.ts`
- `packages/opencode/src/kiloclaw/orchestrator.ts`
- `packages/opencode/src/kiloclaw/index.ts`
- `packages/opencode/test/kiloclaw/memory.test.ts`
- `packages/opencode/test/kiloclaw/smoke-routing-memory.test.ts`

Verifiche runtime eseguite:
- `bun test test/kiloclaw/memory.test.ts` → **61 pass, 0 fail**
- `bun test test/kiloclaw/smoke-routing-memory.test.ts` → **3 pass, 0 fail**

---

## 3) Aderenza al blueprint: valutazione puntuale

## 3.1 Layer obbligatori

| Layer | Implementazione attuale | Stato |
|---|---|---|
| Working | `Map` in-memory con TTL, snapshot/restore, cleanup | ✅ Presente |
| Episodic | Eventi + episodi in-memory con timeline/stats | ✅ Presente |
| Semantic | Facts + pseudo-embedding + graph relazioni in-memory | ✅ Presente |
| Procedural | Procedure versionate + pattern stats in-memory | ✅ Presente |

**Conclusione:** i 4 layer sono implementati a livello di API e modulo.

## 3.2 Memory Broker unificato

`memory/broker.ts` espone accesso unificato e operazioni `write/read/search/classify/retain/purge`.

**Criticità osservata:** alcune operation sono placeholder o incomplete lato governance/persistenza (vedi gap).

## 3.3 Lifecycle dati (Capture → Classify → Retain → Refresh → Purge)

- **Capture:** presente (`MemoryLifecycle.capture`)
- **Classify:** presente (euristiche semplici)
- **Retain:** policy esiste ma enforcement reale limitato
- **Refresh (episodic→semantic/procedural):** solo consolidamento minimale/placeholder
- **Purge:** API presente ma logica reale non implementata

**Stato lifecycle blueprint:** ⚠️ parziale

## 3.4 Retrieval policy multi-fattore

Blueprint richiede ranking su recency/relevance/confidence/sensitivity/provenance.

Implementazione attuale:
- `search()` usa similarità embedding + fattori in parte fissi
- `read()` fa aggregazione layer + filtri base

**Stato retrieval avanzato:** ⚠️ incompleto rispetto al blueprint

---

## 4) Gap e criticità (evidenze tecniche)

## 4.1 Gap A — Persistenza reale assente (HIGH)

I layer sono mantenuti in stato modulo (`Map`) e non su storage persistente dedicato 4-layer (event store/vector/registry versioned come blueprint).

**Impatto:** perdita dati a restart; impossibile retention/audit robusti; non compliance-ready.

## 4.2 Gap B — Purge/Retention non enforceati end-to-end (HIGH)

In `broker.ts`, `retain()` e `purge()` sono sostanzialmente placeholder. In `lifecycle.ts`, enforcement periodico pulisce solo working memory, con TODO impliciti sugli altri layer.

**Impatto:** rischio over-retention/privacy drift; non aderenza a “Retention hard policy + purge job”.

## 4.3 Gap C — Consolidamento semantico/procedurale minimale (MEDIUM-HIGH)

`semantic.consolidate()` restituisce output sintetico non derivato da vera estrazione conoscenza/pattern.

**Impatto:** “Refresh” non produce vera memoria consolidata utile a planning/personalization.

## 4.4 Gap D — Retrieval ranking non realmente multi-fattore (MEDIUM)

Fattori presenti a schema ma non implementati con scoring robusto e normalizzazione per provenance/sensitivity/recency reali.

**Impatto:** qualità retrieval instabile, explainability limitata.

## 4.5 Gap E — Integrazione Core Orchestrator non allineata al 4-layer broker (HIGH)

`orchestrator.ts` definisce un `MemoryBroker` locale key-value semplificato (read/write/delete/list) separato dal broker 4-layer.

**Impatto:** memoria non è ancora “sistema portante” dell’orchestrazione; doppio modello memoria.

## 4.6 Gap F — Attivazione runtime non automatica (MEDIUM)

`startRetentionEnforcement()` esiste ma non risulta avviato in bootstrap core.

**Impatto:** politiche retention non operative di default.

## 4.7 Gap G — Auditability immutabile e correlation trail incompleto (MEDIUM-HIGH)

Episodic/events presenti ma manca integrazione sistematica con decision gates/policy/tool call in append-only store immutabile.

**Impatto:** gap rispetto a verificabilità/compliance-first.

## 4.8 Gap H — Semantic embedding non production-grade (MEDIUM)

Pseudo-embedding hash-based utile per test/smoke, non per qualità retrieval enterprise.

**Impatto:** bassa precisione semantica reale.

---

## 5) Il sistema sta effettivamente funzionando?

### Risposta tecnica
**Sì, ma a livello “framework operativo locale + test”**.  
**No, non ancora a livello “piena implementazione e attivazione production-grade”** richiesto dal blueprint.

### Perché
- I test attestano funzionamento API/comportamento base.
- Manca la chiusura dei requisiti non-funzionali core: persistenza, governance enforcement, integrazione orchestratore, audit forte.

---

## 6) Piano di ottimizzazione + piena implementazione/attivazione

## Phase 1 — Unificazione architetturale (priorità critica)

**Obiettivo:** eliminare dualismo memoria e rendere il 4-layer broker la fonte unica.

Task:
1. Rifattorizzare `kiloclaw/orchestrator.ts` per usare `memoryBroker` 4-layer (non store locale separato).
2. Definire adapter compatibilità per API legacy `read/write/delete/list` sopra broker 4-layer.
3. Aggiornare wiring in bootstrap runtime.

Deliverable:
- Orchestrator integrato con memory 4-layer.
- Test integrazione orchestrator↔memory.

KPI:
- 100% flussi core passano dal broker 4-layer.

## Phase 2 — Persistenza per layer e storage target blueprint

**Obiettivo:** implementare storage reale indipendente per layer.

Task:
1. Working: cache locale persisted snapshot (opzionale) + TTL index.
2. Episodic: event store append-only con indice temporale/correlationId.
3. Semantic: facts store + vector store + graph store (backend configurabile).
4. Procedural: registry versioned persistente.
5. Path isolation su namespace `~/.kiloclaw/`.

Deliverable:
- Driver storage per layer + migrazione schema v1.

KPI:
- Recovery dati dopo restart = 100% per layer persistenti.

## Phase 3 — Retention/Purge compliance-grade

**Obiettivo:** lifecycle realmente enforceato.

Task:
1. Implementare purge reale per ID/layer/reason.
2. Jobs schedulati per TTL su episodic/semantic/procedural.
3. Right-to-forget e policy breach con audit event dedicati.
4. Report purge periodico firmato (internamente tracciato).

Deliverable:
- `RetentionService` + `PurgeService` + test di scadenza.

KPI:
- 0 record expired oltre SLA retention.

## Phase 4 — Consolidamento e retrieval avanzato

**Obiettivo:** rendere la memoria utile al ragionamento cross-session.

Task:
1. Pipeline episodic→semantic: estrazione fatti con confidence/provenance.
2. Pipeline episodic→procedural: pattern mining (success/failure-aware).
3. Ranking multi-fattore reale: recency/relevance/confidence/sensitivity/provenance.
4. Explain payload per ogni retrieval critico.

Deliverable:
- `ConsolidationEngine` + `RankingEngine`.

KPI:
- Miglioramento precision@k su query semantiche (target da benchmark interno).

## Phase 5 — Auditability, policy gates, activation di default

**Obiettivo:** completare compliance/verifiability-first.

Task:
1. Hook automatico di ogni decision gate/tool call nell’episodic append-only.
2. Correlation ID obbligatorio in capture/writeback.
3. Avvio automatico retention enforcement in bootstrap (con kill-switch).
4. Dashboard stats reali (facts/patterns non placeholder).

Deliverable:
- Audit trail completo con replay timeline.

KPI:
- 100% azioni high-impact tracciate end-to-end.

## Phase 6 — Hardening, test e rollout progressivo

Task:
1. Test e2e su restart, purge, migration, retrieval ranking.
2. Test di carico memory broker + leak checks.
3. Rollout canary con metriche di regressione.
4. Gate finale QA + verifica criteri blueprint 9.3.

---

## 7) Backlog tecnico “ready-to-implement”

1. **[P0]** Orchestrator memory unification.
2. **[P0]** Persistenza episodic append-only + purge reale.
3. **[P0]** Bootstrap retention enforcement automatico.
4. **[P1]** Semantic persistence + embedding provider reale.
5. **[P1]** ConsolidationEngine episodic→semantic/procedural.
6. **[P1]** RankingEngine multi-fattore con explainability.
7. **[P2]** Dashboard osservabilità memory lifecycle.

---

## 8) Acceptance criteria aggiornati (proposti)

Per dichiarare “piena implementazione e attivazione”, devono risultare **tutti verdi**:

1. Orchestrator usa solo memory broker 4-layer.
2. Ogni layer ha storage conforme (non solo in-memory).
3. Retention enforcement attivo by default.
4. Purge operativo con audit e reason codes.
5. Consolidamento produce facts/pattern reali verificabili.
6. Retrieval multi-fattore con score trasparente.
7. Audit trail high-impact completo e queryabile.
8. Test e2e + crash/restart recovery pass.

---

## 9) Rischi residui se non si interviene

- Rischio compliance/privacy per over-retention.
- Ridotta affidabilità cross-session e perdita contesto su restart.
- “Memory as system” non realizzata: degradazione qualità routing/planning.
- Gap di verificabilità in incident/post-mortem.

---

## 10) Conclusione finale

Il sistema di memoria 4-layer in Kiloclaw è **implementato e testato in forma base**, quindi non è vaporware.  
Lo stato attuale è però **pre-production** rispetto al blueprint: l’architettura è presente, ma manca l’operatività completa sui pilastri di persistenza, governance, consolidation e audit.

Con il piano in 6 fasi sopra, il progetto può raggiungere **piena implementazione e attivazione** in modo incrementale, verificabile e coerente con i principi compliance-first e verifiability-first del blueprint.

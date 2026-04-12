# Piano rifondazione

Sistema persistente, misurabile e pronto al rollout.

---

## Dichiara urgenza

Il sistema memoria 4-layer attuale **non è accettabile per gli obiettivi di produzione** di Kiloclaw. L’analisi del 2026-04-04 conferma gap critici su persistenza, retention/purge, integrazione orchestratore, auditabilità e ranking avanzato.

La priorità è rifondare la memoria come capability core del runtime, non come modulo locale in-memory. Il piano sotto è operativo e orientato a consegne verificabili.

### Conferma stato attuale

- [x] Layer working/episodic/semantic/procedural esistono
- [x] Test locali passano
- [ ] Persistenza cross-restart completa
- [ ] Purge e retention hard-enforced su tutti i layer
- [ ] Integrazione piena con orchestratore runtime
- [ ] Audit trail immutabile end-to-end

---

## Definisci architettura target

La rifondazione adotta un’architettura 4-layer persistente con store specializzati e broker unificato. Ogni operazione memoria passa da policy, audit e ranking prima dell’iniezione nel contesto.

### Mappa layer e backend

| Layer      | Scopo                                  | Persistenza primaria                                                   | Indici                                 | Retention default          |
| ---------- | -------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------- | -------------------------- |
| Working    | Stato operativo breve                  | Redis o tabella `working_state` in Postgres                            | key+ttl, session_id                    | minuti/ore                 |
| Episodic   | Eventi conversazionali e task history  | Postgres append-only (`memory_events`, `episodes`)                     | tenant_id, user_id, ts, correlation_id | 30-180 giorni              |
| Semantic   | Fatti consolidati e relazioni stabili  | Postgres facts + vettori (pgvector o Qdrant) + grafo (Neo4j opzionale) | vector, metadata, graph edges          | lunga durata con revisione |
| Procedural | Strategie operative e preferenze d’uso | Postgres versioned (`procedures`, `procedure_versions`)                | tags, outcome stats, confidence        | lunga durata versionata    |

### Definisci store di supporto

| Store             | Ruolo                                                     | Obbligatorio                |
| ----------------- | --------------------------------------------------------- | --------------------------- |
| Postgres          | Source of truth transazionale, audit, feedback, profiling | Sì                          |
| pgvector o Qdrant | Similarità semantica su episodic/semantic/procedural      | Sì                          |
| Redis             | Cache hot retrieval, locking, queue leggera               | No (fortemente consigliato) |
| Neo4j             | Query su relazioni semantiche complesse                   | No (profilo scale)          |

### Disegna pipeline retrieval e iniezione

```text
User input
  -> Query understanding + policy guard
  -> Candidate fetch (working + episodic + semantic + procedural)
  -> Hybrid retrieval (metadata filter + vector search + graph expansion)
  -> Ranking multi-fattore + dedup + sensitivity filter
  -> Context budgeting
  -> Prompt injection (blocchi ordinati e motivati)
  -> LLM response + memory writeback candidates
```

### Disegna pipeline consolidamento

```text
Nuovi eventi episodici
  -> Job di consolidamento (batch/stream)
  -> Estrazione facts (confidence + provenance)
  -> Estrazione pattern procedurali (success/failure-aware)
  -> Upsert semantic/procedural versionati
  -> Decadimento o purge episodic secondo policy
```

---

## Confronta opzioni linguistiche

Le due opzioni realistiche sono implementare tutto in TypeScript/Bun nel monorepo o introdurre un sidecar Python per retrieval/consolidation avanzati. La scelta deve bilanciare time-to-market, operabilità e qualità semantica.

### Valuta TypeScript/Bun

**Pro:** coerenza con stack Kiloclaw, deploy unico, ownership unificata, minor complessità CI/CD. **Contro:** meno librerie mature per graph+ML rispetto a Python, rischio reinventare pipeline data-heavy.

### Valuta sidecar Python

**Pro:** ecosistema ricco per ranking, ML ops e graph analytics, più rapido per iterare modelli di consolidamento. **Contro:** doppia runtime, osservabilità distribuita più complessa, costo operativo superiore da day-1.

### Raccomanda scelta

**Raccomandazione:** partire con **TypeScript/Bun first** per MVP robusto, con interfacce pulite per eventuale sidecar Python in fase scale. Questa scelta riduce rischio di integrazione e accelera il go-live mantenendo apertura tecnica per moduli avanzati futuri.

---

## Definisci profili deployment

### Profilo A — MVP robusto, low ops

**Stack:** Postgres + pgvector + Redis opzionale.

| Aspetto           | Decisione                                                      |
| ----------------- | -------------------------------------------------------------- |
| Obiettivo         | Portare memoria persistente in produzione in 30-60 giorni      |
| Complessità ops   | Bassa                                                          |
| Throughput atteso | Medio                                                          |
| Funzioni coperte  | Persistenza, hybrid retrieval base, feedback, audit, retention |
| Limite            | Query grafo avanzate meno efficienti                           |

### Profilo B — Scale/advanced

**Stack:** Postgres + Redis + Qdrant + Neo4j.

| Aspetto           | Decisione                                                      |
| ----------------- | -------------------------------------------------------------- |
| Obiettivo         | Scalare precisione retrieval e reasoning relazionale           |
| Complessità ops   | Media/Alta                                                     |
| Throughput atteso | Alto                                                           |
| Funzioni coperte  | Hybrid retrieval completo, graph traversal, caching aggressiva |
| Limite            | Costi e runbook operativi più impegnativi                      |

---

## Definisci modello dati

Il modello dati deve supportare query operative, audit e governance senza accoppiamenti fragili. Le tabelle sotto sono il minimo indispensabile.

### Definisci tabelle core

| Tabella/Collezione   | Chiave    | Campi essenziali                                                                                 |
| -------------------- | --------- | ------------------------------------------------------------------------------------------------ |
| `memory_events`      | `id`      | tenant_id, user_id, session_id, correlation_id, event_type, payload, ts, sensitivity             |
| `episodes`           | `id`      | tenant_id, user_id, summary, source_event_ids, confidence, created_at, expires_at                |
| `facts`              | `id`      | tenant_id, user_id, subject, predicate, object, confidence, provenance_ref, valid_from, valid_to |
| `fact_vectors`       | `fact_id` | embedding, model, norm, metadata_json                                                            |
| `procedures`         | `id`      | tenant_id, scope, name, status, current_version, success_rate                                    |
| `procedure_versions` | `id`      | procedure_id, version, steps_json, triggers_json, confidence, created_at                         |
| `user_profile`       | `user_id` | preferences_json, communication_style, constraints_json, updated_at                              |
| `feedback_events`    | `id`      | tenant_id, user_id, target_type, target_id, vote, reason_code, correction_text, ts               |
| `memory_audit_log`   | `id`      | actor, action, target_type, target_id, reason, correlation_id, hash_chain, ts                    |

### Definisci indici minimi

- [x] `memory_events(tenant_id, user_id, ts desc)`
- [x] `memory_events(correlation_id)`
- [x] `episodes(expires_at)`
- [x] `facts(tenant_id, user_id, confidence desc)`
- [x] `feedback_events(target_type, target_id, ts desc)`
- [x] indice vettoriale su `fact_vectors.embedding`

---

## Definisci strategia iniezione

L’iniezione memoria deve essere esplicita, limitata da budget token e tracciata con motivazione. La policy parte semplice ma misurabile.

### Definisci budget token

| Componente       | Budget iniziale | Regola                                        |
| ---------------- | --------------- | --------------------------------------------- |
| Working          | 20%             | priorità massima, sempre incluso se rilevante |
| Episodic recente | 25%             | ultimi eventi ad alta rilevanza               |
| Semantic facts   | 35%             | fatti stabili con confidence alta             |
| Procedural       | 15%             | pattern operativi applicabili                 |
| Riserva          | 5%              | buffer per tool output critico                |

### Definisci formula ranking

```text
score =
  0.30 * relevance_vector
  + 0.20 * recency_norm
  + 0.15 * confidence
  + 0.15 * success_signal
  + 0.10 * provenance_quality
  + 0.10 * user_preference_match
  - 0.20 * sensitivity_penalty
  - 0.10 * contradiction_penalty
```

La formula produce anche `score_explain` con contributi per fattore e motivo di esclusione. I pesi sono versionati e ottimizzati con A/B test settimanale.

### Definisci regole pratiche

- [x] Escludi memorie con `confidence < soglia_min` salvo richiesta esplicita
- [x] Non iniettare dati `sensitivity=high` senza policy pass
- [x] Limita duplicati semantici con dedup su fingerprint
- [x] Inserisci sempre provenance breve per ogni blocco iniettato

---

## Definisci feedback e autoapprendimento

Il loop parte da day-1 con segnali minimi ma utili. Ogni risposta può ricevere `thumb_up` o `thumb_down` con motivazione e correzione opzionale.

### Definisci payload feedback

```json
{
  "vote": "up | down",
  "reason": "wrong_fact | irrelevant | too_verbose | style_mismatch | unsafe | other",
  "correction": "testo opzionale",
  "target": {
    "response_id": "...",
    "memory_ids": ["..."]
  }
}
```

### Definisci aggiornamenti automatici

| Segnale                | Azione                                                 |
| ---------------------- | ------------------------------------------------------ |
| up + memory_ids        | incrementa peso provenienza e preference match         |
| down + wrong_fact      | riduce confidence fact, apre task verifica             |
| down + irrelevant      | penalizza feature recency/relevance per quel pattern   |
| correzione testuale    | propone nuovo fact/procedura in stato `pending_review` |
| frequenza motivi stile | aggiorna `user_profile.communication_style`            |

---

## Pianifica roadmap fasi

La roadmap è orientata a release incrementali con criteri di accettazione misurabili. Ogni milestone chiude con evidenze test e metriche.

### Definisci milestone

| Fase | Milestone            | Deliverable                              | Acceptance criteria            | KPI                               |
| ---- | -------------------- | ---------------------------------------- | ------------------------------ | --------------------------------- |
| 0    | Baseline tecnica     | ADR memoria rifondata, schema dati v1    | approvazione architect + QA    | doc sign-off 100%                 |
| 1    | Persistenza core     | Postgres schema + repository layer       | restart recovery ok            | recovery success 100%             |
| 2    | Retrieval/iniezione  | ranking v1 + token budget + explain      | quality gate su set golden     | precision@5 >= baseline+15%       |
| 3    | Consolidamento       | pipeline episodic->semantic/procedural   | facts/pattern utili verificati | fact acceptance >= 80%            |
| 4    | Feedback loop        | endpoint + auto-update profile/procedure | feedback roundtrip < 2s        | feedback coverage >= 30% sessioni |
| 5    | Compliance hardening | retention/purge/rtbf + audit chain       | purge SLA rispettata           | expired beyond SLA = 0            |
| 6    | Rollout graduale     | canary + progressive enable              | error budget entro soglia      | rollback MTTR < 15 min            |

---

## Pianifica migrazione e rollback

La migrazione deve evitare downtime percepibile e mantenere controllo operativo completo. La strategia usa dual-write con cutover progressivo e rollback one-click.

### Definisci strategia migrazione

1. Introduci nuovo `MemoryBrokerV2` dietro feature flag.
2. Abilita dual-write: in-memory legacy + persistence v2.
3. Esegui backfill snapshot legacy verso schema v2.
4. Attiva dual-read shadow per confronto risultati.
5. Sposta traffico al v2 per tenant canary.
6. Estendi rollout a onde fino al 100%.

### Definisci strategia rollback

- [x] Kill-switch runtime per tornare a broker legacy
- [x] Backup snapshot e WAL restore testato
- [x] Playbook rollback con owner e tempi
- [x] Verifica consistenza post-rollback automatica

**SLO downtime target:** < 60 secondi su cutover controllato.

---

## Definisci sicurezza e compliance

I controlli privacy e sicurezza sono parte del design, non appendice finale. Ogni memoria deve avere classificazione, retention policy e traccia audit.

### Definisci controlli minimi

| Controllo          | Implementazione                                        |
| ------------------ | ------------------------------------------------------ |
| Retention policy   | TTL per layer + job purge schedulati                   |
| Right to forget    | cancellazione per user_id con propagazione cross-store |
| Sensitivity levels | `low/medium/high/restricted` con policy gates          |
| Cifratura          | at-rest (DB/KMS) + in-transit TLS                      |
| Audit trail        | append-only `memory_audit_log` con hash-chain          |
| Access control     | RBAC per tenant e ruoli operativi                      |
| Provenance         | source refs obbligatorie su facts/procedures           |

### Definisci policy operative

- [x] Nessuna memoria sensibile iniettata senza autorizzazione policy
- [x] Ogni purge registra reason code e actor
- [x] Export dati utente disponibile e tracciato
- [x] Rotazione chiavi e segreti secondo standard piattaforma

---

## Definisci test e osservabilità

La qualità deve essere verificata per layer, pipeline e outcome utente. L’osservabilità deve misurare sia affidabilità tecnica sia qualità cognitiva.

### Definisci piano test

| Livello      | Copertura                                                          |
| ------------ | ------------------------------------------------------------------ |
| Unit         | CRUD layer, ranking math, policy guards, retention calculator      |
| Integration  | Postgres/pgvector/Redis, dual-write, purge jobs, feedback updates  |
| E2E          | sessioni multi-turno cross-restart, injection relevance, rtbf flow |
| Quality eval | set golden con scoring precision@k, recall, contradiction rate     |

### Definisci metriche runtime

| Metrica                  | Target iniziale                       |
| ------------------------ | ------------------------------------- |
| Retrieval latency p95    | < 120 ms (cache hit), < 300 ms (cold) |
| Injection token overflow | < 1% richieste                        |
| Memory hit rate utile    | > 60%                                 |
| Contradiction rate       | < 3%                                  |
| Purge SLA breach         | 0                                     |
| Feedback adoption        | > 25% sessioni attive                 |

### Definisci dashboard

- [x] Dashboard qualità retrieval e injection
- [x] Dashboard retention/purge/rtbf
- [x] Dashboard feedback e learning drift
- [x] Alert su error budget, latency, compliance breach

---

## Definisci backlog priorità

### Definisci P0

- [ ] Unificare orchestratore su MemoryBrokerV2
- [ ] Implementare persistenza Postgres + schema v1
- [ ] Implementare ranking v1 e token budgeting
- [ ] Attivare retention/purge hard-enforced
- [ ] Aggiungere audit trail append-only e correlation obbligatorio

### Definisci P1

- [ ] Attivare feedback endpoint + update profilo/procedure
- [ ] Implementare consolidamento episodic->semantic/procedural
- [ ] Integrare pgvector o Qdrant con benchmark comparativo
- [ ] Introdurre explainability payload in retrieval

### Definisci P2

- [ ] Integrare Neo4j per graph retrieval avanzato
- [ ] Aggiungere auto-tuning pesi ranking con esperimenti controllati
- [ ] Implementare review UI per memorie pending
- [ ] Ottimizzare costi con tiering storage e compaction

---

## Definisci piano 30 giorni

### Esegui settimana 1

- [ ] Chiudere ADR tecnica e contratti API memoria
- [ ] Creare schema DB, migrazioni e repository base
- [ ] Preparare feature flags e wiring orchestratore

### Esegui settimana 2

- [ ] Abilitare dual-write + backfill legacy
- [ ] Implementare retrieval ibrido base con metadata+vector
- [ ] Introdurre token budgeting e injection guard

### Esegui settimana 3

- [ ] Implementare feedback endpoint e update profile/procedure
- [ ] Implementare purge jobs, retention enforcement e audit chain
- [ ] Eseguire test integrazione e2e su staging

### Esegui settimana 4

- [ ] Canary rollout per tenant selezionati
- [ ] Misurare KPI baseline vs nuova pipeline
- [ ] Completare runbook rollback e handoff operativo

**Exit criteria 30 giorni:** persistenza attiva, retrieval/iniezione governata, feedback operativo, compliance minima in produzione canary.

---

## Cita riferimenti

### Fonti interne

1. `docs/analysis/analisi-memory-4-layer-kiloclaw-2026-04-04.md`
2. Materiali Me4BrAIn analizzati: `README`, `PROJECT_MEMORY`, blueprint architetturale memoria

### Best practice distillate

1. Pattern consolidati 2024-2026 su layered memory e hybrid retrieval (vector + metadata + graph)
2. Pratiche su lifecycle memoria con consolidamento, forgetting e retention enforceata
3. Linee guida su provenance, auditabilità, context budgeting e controllabilità utente (edit/delete)
4. Approcci feedback-driven per miglioramento ranking e personalizzazione progressiva

Le best practice sono usate come linee guida tecniche e non come garanzia di risultato senza validazione empirica in Kiloclaw.

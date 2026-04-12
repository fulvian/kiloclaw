---
title: "Agency 2 NBA"
description: "Piano betting NBA con guardrail verificabili"
date: "2026-04-11"
status: "proposto"
---

# Piano implementazione

## 1. Definisci obiettivi e KPI v1

- [ ] Portare in KiloClaw una Agency 2 NBA betting con architettura `native-first` e fallback controllato.
- [ ] Riutilizzare il baseline `sports_nba` di Me4BrAIn senza regressioni su copertura dati, robustezza e controllo rischio.
- [ ] Applicare policy hard `SAFE/NOTIFY/CONFIRM/DENY` con `deny-by-default` per ogni capability.
- [ ] Rendere obbligatori vig-removal, confidence cap `<= 95%`, freshness gating e HITL per stake sizing.

**KPI v1 (target 30 giorni post-GA)**

| KPI                                          |                       Target | Gate    |
| -------------------------------------------- | ---------------------------: | ------- |
| Copertura slate NBA pre-match                |    >= 95% partite del giorno | M3 exit |
| `signal_precision_at_5pct_edge`              |                      >= 0.55 | M4 exit |
| `stale_data_block_rate`                      | 100% sui casi fuori finestra | M2 exit |
| `policy_violation_escape_rate`               |                            0 | M2+     |
| `tool_schema_tokens_p50` vs baseline statico |                         -35% | M3 exit |
| `p95_end_to_end_latency` analisi partita     |                        <= 7s | M3 exit |

---

## 2. Mappa baseline Me4BrAIn e gap

**Baseline riusabile (confermata)**

- [ ] `src/me4brain/domains/sports_nba/handler.py`: routing intent NBA, esecuzione single-tool/chained, cascata gratuita-first (`nba_api -> ESPN -> BallDontLie`) e trigger betting analysis.
- [ ] `src/me4brain/domains/sports_nba/tools/betting_analyzer.py`: orchestrazione multi-source in parallelo, predizioni `h2h/spread/totals`, `value_bet_threshold=5%`, `MAX_CONFIDENCE=0.95`, confidence basata su completezza dati.
- [ ] `src/me4brain/domains/sports_nba/tools/nba_api.py`: connettori ESPN/BallDontLie/OddsAPI/Polymarket/nba_api, retry con exponential backoff, rate-limit locale, registry tool e filtraggio argomenti allucinati.

**Gap da chiudere in KiloClaw**

- [ ] Mancano schema normalizzati di dominio (`Game`, `Odds`, `Signal`, `Recommendation`) con versionamento.
- [ ] Manca policy matrix hard integrata nel runtime KiloClaw con enforcement per capability e output type.
- [ ] Manca payload budgeting dinamico su tool catalog NBA con token budget per richiesta.
- [ ] Mancano phase gate formali con blocco automatico Go/No-Go e deny-by-default verificato via test.
- [ ] Mancano blocchi staleness per source-specific TTL e blocco raccomandazioni quando dataset critico è stantio.

---

## 3. Registra decisioni architetturali

**ADR-A2-001: Native-first + fallback controllato**

- [ ] Path primario: adapter nativi KiloClaw per ESPN, BallDontLie, OddsAPI, Polymarket, wrapper `nba_api`.
- [ ] Path fallback: abilitato solo per capability allowlisted e solo se policy minima è `NOTIFY`.
- [ ] Deny automatico per fallback su capability con impatto operativo o stake sizing.

**ADR-A2-002: Hybrid operativo con dominanza native**

- [ ] `native_success -> stop`.
- [ ] `native_degraded -> fallback_if_allowlisted`.
- [ ] `auth_error/quota_exhausted/unknown_market -> deny + notify + remediation hint`.

**ADR-A2-003: Enforcement phase-gate**

- [ ] Nessuna milestone passa senza test policy + telemetry minima + rollback plan.
- [ ] `deny-by-default` valido finché una capability non ha contract, test, policy e owner.

---

## 4. Definisci capability taxonomy Agency 2

**Data ingestion**

- [ ] `schedule_live`: calendario e live scoreboard.
- [ ] `team_player_stats`: standings, advanced team metrics, player snapshot.
- [ ] `injury_status`: availability e status impattanti.
- [ ] `odds_markets`: moneyline, spread, totals, mercati prediction.

**Analytics**

- [ ] `probability_estimation`: probabilità modello per outcome.
- [ ] `vig_removal`: normalizzazione probabilità implicite pre-edge.
- [ ] `edge_detection`: confronto `p_model` vs `p_fair`.
- [ ] `calibration_monitoring`: reliability e drift.

**Outputs**

- [ ] `game_preview`: report pre-match con fonti e freshness.
- [ ] `value_watchlist`: ranking segnali con soglie minime.
- [ ] `recommendation_report`: raccomandazioni explainable, mai auto-esecutive.

---

## 5. Specifica provider catalog contract

| Provider        | Uso principale                            | Rate/Quota da rispettare                                                                                               | Freshness target          | Fallback                         |
| --------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------- | -------------------------------- |
| ESPN            | scoreboard, schedule, standings, injuries | endpoint pubblici non versionati, resilienza via retry+circuit breaker                                                 | live: 60s, pre-match: 10m | nba_api live + BallDontLie games |
| BallDontLie     | games/players/stats strutturati           | tier NBA: Free 5 rpm, ALL-STAR 60 rpm, GOAT 600 rpm                                                                    | games/stats: 10m          | ESPN + nba_api                   |
| The Odds API v4 | bookmaker odds                            | costo quota: `markets x regions`; headers `x-requests-remaining/used/last`; 429 su rate-limit                          | odds: 60-120s             | riduci mercati/regioni + degrade |
| Polymarket      | prediction market odds                    | limiti endpoint-specific (es. Gamma `/events` 500 req/10s, CLOB market endpoints dedicati)                             | market data: 30-60s       | OddsAPI only mode                |
| nba_api         | advanced/offical stats + static datasets  | usare custom headers/proxy/timeout; limitare burst; privilegiare static datasets (`players`, `teams`) per ridurre HTTP | advanced/team: 15m        | ESPN standings/team stats        |

**Comportamenti obbligatori provider**

- [ ] BallDontLie: paginazione cursor-based (`meta.next_cursor`, `cursor`, `per_page<=100`).
- [ ] BallDontLie: `401` gestito come auth/tier mismatch, `429` con exponential backoff + cooldown scheduler.
- [ ] OddsAPI: scheduler quota-aware con costo previsto prima della call e kill-switch se `remaining < soglia`.
- [ ] OddsAPI: su `429` downgrade automatico a set mercati minimo (`h2h`) e region ridotte.
- [ ] nba_api: default `timeout` esplicito, header realistici, supporto proxy e retry bounded.
- [ ] Polymarket: throttling endpoint-specific e preferenza feed read-only; nessuna azione trading in v1.

---

## 6. Applica matrice SAFE/NOTIFY/CONFIRM/DENY

| Capability            | Esempio operazione                        | Policy  | Enforcement                            |
| --------------------- | ----------------------------------------- | ------- | -------------------------------------- |
| Lettura dati pubblici | scoreboard, standings, injuries, odds raw | SAFE    | auto-run                               |
| Stima probabilistica  | calcolo probabilità e edge                | NOTIFY  | output con disclaimer + confidence cap |
| Raccomandazione stake | sizing, bankroll %, exposure              | CONFIRM | HITL obbligatorio + doppia conferma    |
| Azione operativa      | auto-bet, esecuzione ordini, martingale   | DENY    | blocco hard + audit event              |

**Regole hard NBA betting**

- [ ] Confidence cap massimo `95%` in `Signal` e `Recommendation`, con clamp in analyzer + formatter + serializer API.
- [ ] Stake sizing vietato senza conferma esplicita utente e limiti profilo rischio caricati.
- [ ] Qualsiasi richiesta di auto-esecuzione bookmaker/mercato viene negata con motivazione e percorso alternativo sicuro.

---

## 7. Implementa dynamic tool payload budgeting

**Design applicato ad Agency 2**

- [ ] Indicizzare tool NBA con metadati: `domain`, `capability`, `risk`, `provider`, `token_size`, `latency_class`, `quota_cost`.
- [ ] Prefiltro per intent e policy prima di serializzare schema tool completi.
- [ ] Top-k dinamico per capability con budget token e finestra fallback progressiva.
- [ ] Lazy hydration dello schema completo solo per tool candidati.

**Budget operativo iniziale**

- [ ] Budget base: `<= 7` tool per query normale, `<= 12` per analisi completa.
- [ ] Preferire tool con `quota_cost` minore quando `relevance_score` è equivalente.
- [ ] Se budget sfora, rimuovere prima tool `DENY/CONFIRM` non necessari al task corrente.

**Metriche budgeting**

- [ ] `tool_schema_tokens_p50/p95`, `selected_tools_count`, `intent_miss_rate`, `fallback_rate`, `quota_burn_per_request`.

---

## 8. Esegui piano milestone M1..M4 con gate

**M1 - Porting baseline e schema normalizzati**

- [ ] Portare handler/analyzer/provider adapters da Me4BrAIn in namespace KiloClaw.
- [ ] Definire schema `Game`, `Odds`, `Signal`, `Recommendation` v1 con validator centralizzato.
- [ ] Introdurre freshness windows e quality flags per record.
- [ ] **Exit criteria:** contract test schema verdi, mapping provider->schema >=95%, nessun `any` non giustificato.

**M2 - Policy hard e safety runtime**

- [ ] Integrare matrice SAFE/NOTIFY/CONFIRM/DENY nel policy engine Agency 2.
- [ ] Applicare `deny-by-default`, confidence clamp `<=95%`, stale-data blocking e HITL su stake sizing.
- [ ] Aggiungere audit log strutturato per decisioni policy.
- [ ] **Exit criteria:** `policy_violation_escape_rate=0`, test safety pass, deny path verificato.

**M3 - Budgeting, resilienza e quota-aware scheduling**

- [ ] Attivare dynamic payload budgeting con telemetry.
- [ ] Implementare retry, circuit breaker per provider, cache TTL source-aware e scheduler quota-aware.
- [ ] Gestire 401/429 con recovery specifica provider e fallback ordinato.
- [ ] **Exit criteria:** target latency/tokens raggiunti, `fallback_rate` stabile, no retry storm.

**M4 - Calibrazione, backtest, rollout readiness**

- [ ] Pipeline calibration su holdout separato e report reliability diagram.
- [ ] Confronto `sigmoid` vs `isotonic` con regola scelta data-size aware.
- [ ] Backtest rolling + chaos suite + checklist Go/No-Go.
- [ ] **Exit criteria:** KPI minimi rispettati, SLO in green, runbook rollback validato.

---

## 9. Struttura piano test completo

**Contract test**

- [ ] Verificare mapping provider->`Game/Odds/Signal/Recommendation` e compatibilità backward.
- [ ] Validare obbligatorietà di campi: probabilità, source, timestamp, freshness, confidence, edge.

**Resilience test**

- [ ] Simulare `401/429/5xx`, timeout, partial response e schema drift.
- [ ] Verificare retry bounded, circuit breaker open/half-open/close, fallback senza loop.

**Policy e safety test**

- [ ] Eseguire test bypass su SAFE/NOTIFY/CONFIRM/DENY con expected deny.
- [ ] Validare HITL obbligatorio su stake sizing e azioni operative.

**Calibration e backtest test**

- [ ] Misurare reliability diagrams, Brier, log-loss su holdout temporale disgiunto.
- [ ] Usare `sigmoid` per sample ridotti o ranking invariance, `isotonic` solo con dataset ampio.

**Chaos test**

- [ ] Iniettare indisponibilità provider multipla e quota exhaustion.
- [ ] Verificare stale-data blocking: nessuna raccomandazione se mancano odds fresche o injury feed valido.

---

## 10. Definisci telemetry contract e SLO/SLA

**Eventi minimi obbligatori**

- [ ] `agency2.request_started/completed` con correlation id.
- [ ] `agency2.provider_call` con provider, endpoint, latency, status, quota_cost, retry_count.
- [ ] `agency2.policy_decision` con capability, policy, outcome, reason.
- [ ] `agency2.signal_emitted` con `edge`, `confidence`, `freshness_state`, `calibration_bucket`.

**SLO tecnici**

- [ ] Availability Agency 2: `>= 99.5%` su finestre 7 giorni.
- [ ] `p95_latency`: <= 7s pre-match single game, <= 15s daily slate.
- [ ] Freshness compliance: `>= 99%` risposte con dati entro finestra valida.
- [ ] Safety SLO: `0` recommendation operative senza HITL.

**SLA interni**

- [ ] Incident P1: mitigazione < 15 minuti con fallback safe mode.
- [ ] Incident P2: mitigazione < 4 ore con patch o feature flag.

---

## 11. Imposta guardrail di responsible use

- [ ] Mostrare sempre disclaimer di incertezza e assenza di garanzia risultato.
- [ ] Esporre probabilità modello, probabilità fair post-vig, edge e confidenza calibrata.
- [ ] Bloccare output prescrittivi aggressivi (martingala, chase losses, all-in).
- [ ] Imporre loss-limit/session-limit configurabili per ogni profilo.
- [ ] Vietare esplicitamente integrazione auto-bet in v1.

---

## 12. Pianifica rollout e rollback

**Strategia rollout**

- [ ] Shadow: Agency 2 produce output silente confrontato con baseline Me4BrAIn.
- [ ] Canary: 5% utenti -> 20% -> 50%, con gate su KPI safety e latency.
- [ ] GA: attivazione default solo dopo due settimane senza regressioni critiche.

**Trigger rollback immediato**

- [ ] `policy_violation_escape_rate > 0`.
- [ ] `stale_data_block_rate < 100%` su dataset critico.
- [ ] `p95_latency` fuori soglia > 30 minuti consecutivi.
- [ ] quota burn anomalo OddsAPI/Polymarket oltre budget giornaliero.

**Piano rollback**

- [ ] Feature flag `agency2.enabled=false`.
- [ ] Fallback a modalità read-only insights senza recommendation.
- [ ] Conservazione telemetry e audit per postmortem.

---

## 13. Esegui checklist Go/No-Go

- [ ] Schema normalizzati v1 approvati e versionati.
- [ ] Policy matrix hard attiva e testata con deny-by-default.
- [ ] Vig-removal attivo e verificato prima del calcolo edge.
- [ ] Confidence cap `<=95%` verificato in tutti i punti di emissione.
- [ ] Freshness windows attive con blocco raccomandazioni su dati stantii.
- [ ] Retry/circuit breaker/cache/quota scheduling validati in resilienza e chaos.
- [ ] Calibrazione holdout completata con report reliability diagram.
- [ ] Telemetry dashboard e alerting attivi per KPI/SLO.
- [ ] Runbook incident e rollback provati in esercitazione.

---

## 14. Cita riferimenti interni ed esterni

**Riferimenti interni**

- [ ] `docs/guide/KILOCLAW_AGENCY_AGENT_SKILL_TOOL_IMPLEMENTATION_GUIDE_2026-04-07.md`
- [ ] `docs/agencies/plans/KILOCLAW_FIRST_4_AGENCIES_IMPLEMENTATION_PLAN_2026-04-09.md`
- [ ] `docs/plans/KILOCLAW_GOOGLE_WORKSPACE_MCP_OAUTH_AUTOREFRESH_PLAN_2026-04-10.md`

**Baseline Me4BrAIn**

- [ ] `src/me4brain/domains/sports_nba/handler.py`
- [ ] `src/me4brain/domains/sports_nba/tools/betting_analyzer.py`
- [ ] `src/me4brain/domains/sports_nba/tools/nba_api.py`

**Riferimenti esterni**

- [ ] BallDontLie docs: <https://docs.balldontlie.io/>
- [ ] The Odds API v4: <https://the-odds-api.com/liveapi/guides/v4/>
- [ ] nba_api README: <https://github.com/swar/nba_api/blob/master/README.md>
- [ ] nba_api examples: <https://github.com/swar/nba_api/blob/master/docs/nba_api/stats/examples.md>
- [ ] Polymarket docs index: <https://docs.polymarket.com/llms.txt>
- [ ] Polymarket rate limits: <https://docs.polymarket.com/api-reference/rate-limits.md>
- [ ] Calibration best practices: <https://scikit-learn.org/stable/modules/calibration.html>

---

## Appendice A - Schema normalizzati v1

```yaml
Game:
  game_id: string
  source: enum[espn, balldontlie, nba_api, odds_api, polymarket]
  start_time_utc: datetime
  status: enum[scheduled, live, final, postponed]
  home_team:
    id: string
    name: string
  away_team:
    id: string
    name: string
  score:
    home: integer?
    away: integer?
  freshness_seconds: integer
  collected_at_utc: datetime

Odds:
  odds_id: string
  game_id: string
  source: enum[odds_api, polymarket, balldontlie]
  market: enum[h2h, spreads, totals]
  bookmaker_or_exchange: string
  outcomes: list
  implied_probabilities_raw: list[number]
  implied_probabilities_fair: list[number]
  vig_percent: number
  freshness_seconds: integer
  collected_at_utc: datetime

Signal:
  signal_id: string
  game_id: string
  market: enum[h2h, spreads, totals]
  model_probability: number
  fair_implied_probability: number
  edge: number
  value_flag: boolean
  confidence: number # hard cap <= 0.95
  calibration_bucket: string
  stale_blocked: boolean

Recommendation:
  recommendation_id: string
  signal_id: string
  action: enum[lean_home, lean_away, lean_over, lean_under, no_bet]
  rationale: string
  constraints:
    hitl_required: boolean
    max_stake_pct: number?
  policy_level: enum[SAFE, NOTIFY, CONFIRM, DENY]
  emitted_at_utc: datetime
```

---

## Appendice B - Regole calcolo, freshness e scheduling

**Vig removal (obbligatorio)**

- [ ] Convertire quote in probabilità implicite raw.
- [ ] Calcolare overround `sum(p_raw)`.
- [ ] Ottenere probabilità fair: `p_fair_i = p_raw_i / sum(p_raw)`.
- [ ] Calcolare edge solo come `edge = p_model - p_fair`.

**Finestre freshness e blocchi stale**

| Fonte                   | Freshness hard | Se stantio                                                |
| ----------------------- | -------------: | --------------------------------------------------------- |
| OddsAPI                 |           120s | blocca `Recommendation`, consenti solo report informativo |
| Polymarket market data  |            60s | blocca merge con odds bookmaker                           |
| ESPN scoreboard live    |            60s | degrada a stato pre-match                                 |
| ESPN injuries           |             6h | imposta confidence penalty e possibile `no_bet`           |
| BallDontLie games/stats |            10m | fallback a ESPN/nba_api                                   |
| nba_api advanced stats  |            24h | consenti con flag `historical_context`                    |

**Cache, retry, circuit breaker, quota-aware scheduling**

- [ ] Cache per endpoint con TTL source-aware e invalidazione su cambio stato partita.
- [ ] Retry bounded con jitter solo su errori transienti (`429`, `5xx`, timeout).
- [ ] Circuit breaker per provider con soglie error rate e cooldown.
- [ ] Scheduler quota-aware che priorizza endpoint a costo basso e scala mercati/regioni in base ai crediti residui.
- [ ] Backpressure globale quando `quota_remaining` scende sotto soglia critica configurata.

**HITL obbligatorio**

- [ ] Stake sizing richiede conferma utente esplicita con riepilogo rischio.
- [ ] Qualsiasi azione operativa resta `DENY` in v1, anche con conferma.
- [ ] Audit trail immutabile per ogni richiesta legata a suggerimenti di esposizione.

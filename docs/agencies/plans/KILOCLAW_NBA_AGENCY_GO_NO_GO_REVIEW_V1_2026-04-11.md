# Go No-Go Review — Agency 2 NBA

## Stato gate

| Gate              | Stato     | Data       | Note                                       |
| ----------------- | --------- | ---------- | ------------------------------------------ |
| G1 Discovery      | GO        | 2026-04-11 | Discovery Brief approvato                  |
| G2 Tool Decision  | GO        | 2026-04-11 | Scorecard: Native=4.45 vs MCP=3.15         |
| G3 Manifest       | GO        | 2026-04-11 | deny-by-default, allowlist, fallback chain |
| G4 Implementation | GO        | 2026-04-11 | Verificato vs G3 manifest                  |
| G5 Verification   | IN REVIEW | 2026-04-11 | Questo documento                           |
| G6 Rollout        | PENDING   | -          | Shadow → Canary → GA                       |

---

## Evidenze

### Build

```
Commit: 641a0dabf3d9f85e6a8e32cdd6a9cd6e00767d99
Branch: refactor/kilocode-elimination
Status: Built and tested successfully
```

### Unit Tests

```
NBA tests: 51 pass, 0 fail
Total tests: 913 pass, 3 skip, 0 fail (across 66 files)
```

| Test File                  | Tests                                    | Status  |
| -------------------------- | ---------------------------------------- | ------- |
| nba-schema.test.ts         | Verifica schema normalizzati             | ✅ Pass |
| nba-manifest.test.ts       | Verifica policy matrix                   | ✅ Pass |
| nba-runtime.test.ts        | Verifica decision logic                  | ✅ Pass |
| nba-budgeting.test.ts      | Verifica tool budgeting                  | ✅ Pass |
| nba-resilience.test.ts     | Verifica circuit breaker, freshness TTLs | ✅ Pass |
| nba-calibration.test.ts    | Verifica Brier, log-loss, reliability    | ✅ Pass |
| nba-gates.test.ts          | Verifica go/no-go gates                  | ✅ Pass |
| nba-chaos.test.ts          | Verifica chaos scenarios                 | ✅ Pass |
| nba-orchestrator.test.ts   | Verifica fallback chains                 | ✅ Pass |
| nba-runtime-injury.test.ts | Verifica injury confidence penalty       | ✅ Pass |

### Integration

**Adapter Fallback Chains Verified:**

- Games: BallDontLie → ESPN → nba_api ✅
- Odds: Bet365 → OddsAPI → ParlayAPI → BallDontLie → Polymarket ✅
- Injuries: BallDontLie → ESPN ✅

**Provider Weights Configured:**

```typescript
const DEFAULT_PROVIDER_WEIGHTS = {
  balldontlie: 0.9,
  odds_bet365: 0.85,
  odds_api: 0.8,
  parlay: 0.75,
  espn: 0.7,
  nba_api: 0.65,
  polymarket: 0.5,
}
```

### Regression

**Schema Normalizzati:**

- Game ✅
- Odds ✅
- Signal ✅
- Recommendation ✅
- Injury ✅

**Policy Matrix:**

- SAFE capabilities: schedule_live, team_player_stats, injury_status, odds_markets, game_preview ✅
- NOTIFY capabilities: probability_estimation, vig_removal, edge_detection, calibration_monitoring, value_watchlist, recommendation_report ✅
- CONFIRM capabilities: stake_sizing, bankroll_sizing, exposure_sizing ✅
- DENY capabilities: auto_bet, auto_bet_execution, execution_orders, martingale ✅
- deny-by-default: true ✅

**Freshness TTLs Enforced:**

- Odds: 60s (max 120s per plan)
- Injuries: 3600s (1h)
- Games: 600s (10m)

**Confidence Cap:**

- CONFIDENCE_CAP = 0.95 ✅
- Applied in capConfidence() function ✅
- Applied in emitSignal() and emitRecommendation() ✅

**Injury Confidence Penalty:**

- computeInjuryConfidencePenalty() implemented ✅
- Max penalty capped at 50% ✅
- 0 penalty for fresh data (<1h) ✅
- Gradual increase as data ages ✅

### Telemetry Contract

**Events Defined:**

```typescript
Agency2RequestStarted // agency2.request_started
Agency2RequestCompleted // agency2.request_completed
Agency2PolicyDecision // agency2.policy_decision
Agency2SignalEmitted // agency2.signal_emitted
```

**Provider Call Telemetry:**

- Latency tracking ✅
- Error count ✅
- Stale count ✅
- Freshness seconds ✅

### Security Checks

- API keys via key pool (non in schema) ✅
- No PII in schemas ✅
- No workspace file access ✅
- Audit trail via Bus events ✅
- HITL required for CONFIRM capabilities ✅

---

## G4 Gate Verification (Implementation vs G3 Manifest)

| Manifest Item                                     | Implementation                                     | Status |
| ------------------------------------------------- | -------------------------------------------------- | ------ |
| Schema Game, Odds, Signal, Recommendation, Injury | schema.ts                                          | ✅     |
| CONFIDENCE_CAP = 0.95                             | schema.ts line 3                                   | ✅     |
| capConfidence() function                          | schema.ts line 16-18                               | ✅     |
| Policy matrix SAFE/NOTIFY/CONFIRM/DENY            | nba-manifest.ts                                    | ✅     |
| deny-by-default                                   | nba-manifest.ts getPolicy() returns "DENY" default | ✅     |
| Games fallback chain                              | adapters/base.ts ADAPTER_PRIORITY.games            | ✅     |
| Odds fallback chain                               | adapters/base.ts ADAPTER_PRIORITY.odds             | ✅     |
| Injuries fallback chain                           | adapters/base.ts ADAPTER_PRIORITY.injuries         | ✅     |
| computeInjuryConfidencePenalty()                  | orchestrator.ts line 271-291                       | ✅     |
| computeAdjustedConfidence()                       | runtime.ts line 197-210                            | ✅     |
| Injury freshness threshold 1h                     | orchestrator.ts line 228                           | ✅     |
| Odds freshness threshold 60s                      | orchestrator.ts line 301                           | ✅     |
| Max injury penalty 50%                            | orchestrator.ts line 290                           | ✅     |
| Circuit breaker per provider                      | resilience.ts                                      | ✅     |
| Retry with exponential backoff                    | resilience.ts                                      | ✅     |
| Quota-aware scheduling                            | budgeting.ts                                       | ✅     |
| Bus events for telemetry                          | runtime.ts lines 57-63                             | ✅     |
| HITL for stake_sizing                             | nba-manifest.ts stake_sizing: "CONFIRM"            | ✅     |

---

## Rischio residuo

### Livello: MEDIUM

### Motivazione

1. **Provider SLA**: Dipendiamo da API esterne (BallDontLie, OddsAPI) senza SLA garantito
2. **Market data latency**: Odds possono arrivare con delay di 60-120s
3. **Calibration non ancora validata**: Backtest completo non ancora eseguito su dati reali
4. **Shadow mode non ancora attivo**: Nessun confronto实 con baseline Me4BrAIn in produzione

### Mitigazioni attive

1. Circuit breaker con fallback chain automatico
2. Freshness TTL enforcement con blocco recommendation
3. Injury confidence penalty per dati stantii
4. HITL obbligatorio per stake sizing
5. DENY hard per auto-bet/execution
6. Telemetry completa per monitoring

---

## Criteri accettazione

| Criterio               | Target                | Status                  |
| ---------------------- | --------------------- | ----------------------- |
| Test critici verdi     | 100%                  | ✅ 51/51 NBA tests pass |
| Bug severita alta      | 0                     | ✅ 0 aperti             |
| Policy deny-by-default | Verificato            | ✅                      |
| Freshness enforcement  | Verificato            | ✅                      |
| Confidence cap 95%     | Verificato            | ✅                      |
| Telemetry events       | 4 eventi definiti     | ✅                      |
| Fallback chains        | 3 catene implementate | ✅                      |
| Circuit breaker        | Per tutti i provider  | ✅                      |

---

## Prossimi passi prima G6

1. **Shadow Mode**: Attivare NBA Agency in shadow mode per confronto con Me4BrAIn
2. **Calibration Validation**: Eseguire backtest su holdout temporale
3. **Telemetry Dashboard**: Verificare ricezione eventi in produzione

---

## Decisione finale

- **Esito**: CONDITIONAL GO
- **Condizioni**:
  1. Shadow mode deve runnare per minimo 7 giorni senza degradation
  2. Calibration metrics devono essere within target (Brier <= 0.25)
  3. Nessun policy violation escape in shadow mode
- **Owner**: TBD
- **Approvatore**: Required
- **Data**: 2026-04-11

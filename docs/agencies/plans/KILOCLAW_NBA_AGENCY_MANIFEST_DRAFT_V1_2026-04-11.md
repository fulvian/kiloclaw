# Agency Manifest Draft — Agency 2 NBA

## Mapping

### Intent → Agency → Agent → Skill → Tool

```
Intent: "analizza partita NBA Lakers vs Celtics"
    │
    ▼
Agency: NbaAgency (NBA betting agency)
    │
    ▼
Agent: NbaOrchestrator
    │
    ├──► Skill: ScheduleReader
    │       Tool: BallDontLieAdapter.getGames()
    │       Tool: ESPNAdapter.getScoreboard()
    │
    ├──► Skill: OddsFetcher
    │       Tool: OddsBet365Adapter.getOdds() [primary]
    │       Tool: OddsAPIAdapter.getOdds() [fallback]
    │       Tool: ParlayAPIAdapter.getOdds() [fallback]
    │
    ├──► Skill: InjuryTracker
    │       Tool: BallDontLieAdapter.getInjuries()
    │       Tool: ESPNAdapter.getInjuries()
    │
    └──► Skill: BettingAnalyzer
            Tool: NbaRuntime.computeSignal()
            Tool: NbaRuntime.computeRecommendation()
            Tool: NbaCalibration.calibrate()
```

### Capability Taxonomy

**Data Ingestion**

- `schedule_live`: calendario e live scoreboard
- `team_player_stats`: standings, advanced metrics, player snapshot
- `injury_status`: availability e status impattanti
- `odds_markets`: moneyline, spread, totals, prediction markets

**Analytics**

- `probability_estimation`: probabilità modello per outcome
- `vig_removal`: normalizzazione probabilità implicite pre-edge
- `edge_detection`: confronto `p_model` vs `p_fair`
- `calibration_monitoring`: reliability e drift

**Outputs**

- `game_preview`: report pre-match con fonti e freshness
- `value_watchlist`: ranking segnali con soglie minime
- `recommendation_report`: raccomandazioni explainable, mai auto-esecutive

## Policy

### Deny-by-default: TRUE

Tutte le capability sono negate per default. Solo capability esplicitamente allowlisted sono permesse.

### Capability Allowlist

```yaml
capabilities:
  # SAFE - auto-run
  schedule_live:
    policy: SAFE
    agents: [NbaOrchestrator]
    tools: [BallDontLieAdapter.getGames, ESPNAdapter.getScoreboard]
  team_player_stats:
    policy: SAFE
    agents: [NbaOrchestrator]
    tools: [BallDontLieAdapter.getStats, ESPNAdapter.getStandings]
  injury_status:
    policy: SAFE
    agents: [NbaOrchestrator]
    tools: [BallDontLieAdapter.getInjuries, ESPNAdapter.getInjuries]
  odds_markets:
    policy: SAFE
    agents: [NbaOrchestrator]
    tools: [OddsBet365Adapter.getOdds, OddsAPIAdapter.getOdds, ParlayAPIAdapter.getOdds]

  # NOTIFY - output con disclaimer + confidence cap
  probability_estimation:
    policy: NOTIFY
    agents: [NbaOrchestrator]
    constraints: [confidence_cap_95, vig_removal_required]
  edge_detection:
    policy: NOTIFY
    agents: [NbaOrchestrator]
    constraints: [min_edge_threshold_5pct, confidence_cap_95]
  calibration_monitoring:
    policy: NOTIFY
    agents: [NbaOrchestrator]

  # CONFIRM - HITL obbligatorio
  recommendation_report:
    policy: CONFIRM
    agents: [NbaOrchestrator]
    constraints: [hitl_required, max_stake_pct_configurable]

  # DENY - blocco hard
  stake_sizing:
    policy: DENY
    reason: "HITL obbligatorio, mai auto-execute"
  auto_bet:
    policy: DENY
    reason: "Auto-execution vietata in v1"
  martingale:
    policy: DENY
    reason: "Strategy rischiosa, vietata"
```

### Read/Write Boundaries

| Operation           | Type  | Policy  |
| ------------------- | ----- | ------- |
| Read games/schedule | READ  | SAFE    |
| Read odds           | READ  | SAFE    |
| Read injuries       | READ  | SAFE    |
| Read stats          | READ  | SAFE    |
| Emit signal         | READ  | NOTIFY  |
| Emit recommendation | READ  | CONFIRM |
| Calculate stake     | READ  | DENY    |
| Execute bet         | WRITE | DENY    |

### Workspace Boundaries

- **Lettura**: Solo dati pubblici NBA (nessun accesso a file locali)
- **Scrittura**: Nessuna (output solo in-memory o telemetry)
- **Network**: Solo API provider NBA autorizzati
- **File system**: Zero accesso

## Provider Metadata

### Games Provider Chain

```yaml
primary: BallDontLieAdapter
fallback_1: ESPNAdapter
fallback_2: NBAApiAdapter
retry_policy: max_3, exponential_backoff_1s_2s_4s
timeout_policy: 5000ms_default, 10000ms_max
freshness_ttl: 600s (10m)
```

### Odds Provider Chain

```yaml
primary: OddsBet365Adapter
fallback_1: OddsAPIAdapter
fallback_2: ParlayAPIAdapter
fallback_3: BallDontLieAdapter → PolymarketAdapter
retry_policy: max_3, exponential_backoff_1s_2s_4s
timeout_policy: 8000ms_default, 15000ms_max
freshness_ttl: 120s
quota_aware: true
```

### Injuries Provider Chain

```yaml
primary: BallDontLieAdapter
fallback_1: ESPNAdapter
retry_policy: max_3, exponential_backoff_1s_2s_4s
timeout_policy: 5000ms_default, 10000ms_max
freshness_ttl: 3600s (1h)
confidence_penalty: gradual_0_to_50pct as data ages
```

## Context Footprint

### Tool Esposti

| Tool                             | Schema Size (tokens) | Latency Class |
| -------------------------------- | -------------------- | ------------- |
| BallDontLieAdapter.getGames      | ~150                 | Fast          |
| BallDontLieAdapter.getInjuries   | ~120                 | Fast          |
| OddsBet365Adapter.getOdds        | ~200                 | Medium        |
| OddsAPIAdapter.getOdds           | ~180                 | Medium        |
| ESPNAdapter.getScoreboard        | ~100                 | Fast          |
| NbaRuntime.computeSignal         | ~80                  | Fast          |
| NbaRuntime.computeRecommendation | ~100                 | Fast          |

**Total exposed per query**: Max 7 tools (budget normale), Max 12 tools (analisi completa)

### Dimensione Schema Totale

- Base budget: <= 7 tool per query
- Full analysis budget: <= 12 tool
- Lazy-loading: schema completo solo per tool candidati

### Lazy-Loading Strategy

1. Intent classification → capability filter
2. Policy check → SAFE/NOTIFY/CONFIRM/DENY
3. Relevance scoring → top-k selection
4. Schema hydration → solo tool selezionati

### Budget Context Per Step

| Phase              | Budget             |
| ------------------ | ------------------ |
| Intent parsing     | 500 tokens         |
| Tool selection     | 1000 tokens        |
| Provider calls     | 5000 tokens        |
| Signal computation | 500 tokens         |
| Recommendation     | 500 tokens         |
| **Total per game** | **<= 7500 tokens** |

## Injury Confidence Penalty

Implementato in `NbaOrchestrator.computeInjuryConfidencePenalty()`:

```typescript
function computeInjuryConfidencePenalty(injuryFreshnessSeconds: number): number {
  // 0 penalty for fresh data (<1h)
  // gradual increase up to 50% max penalty
  const freshnessThreshold = 3600 // 1 hour
  const maxPenalty = 0.5

  if (injuryFreshnessSeconds < freshnessThreshold) {
    return 0
  }

  // Linear increase from 0 to maxPenalty over 24h
  const age = injuryFreshnessSeconds - freshnessThreshold
  const maxAge = 24 * 3600 // 24 hours
  const penalty = Math.min((age / maxAge) * maxPenalty, maxPenalty)

  return penalty
}
```

## Hard Rules (enforced in runtime)

1. **Confidence cap**: `Signal.confidence <= 0.95`, `Recommendation.confidence <= 0.95`
2. **Vig removal**: Sempre applicato prima del calcolo edge
3. **Freshness block**: Recommendation bloccata se Odds TTL > 120s o Injuries TTL > 6h
4. **HITL**: Stake sizing richiede approvazione esplicita
5. **Auto-denied**: Qualsiasi richiesta auto-bet = DENY hard

## Telemetry Events

```typescript
// Obbligatori per ogni request
agency2.request_started { correlation_id, intent, timestamp }
agency2.request_completed { correlation_id, duration_ms, outcome }

// Provider calls
agency2.provider_call { provider, endpoint, latency_ms, status, quota_cost, retry_count }

// Policy decisions
agency2.policy_decision { capability, policy_level, outcome, reason }

// Signals
agency2.signal_emitted { signal_id, edge, confidence, freshness_state, calibration_bucket }
```

---

## Protocol Gate Status

| Gate              | Stato       | Data       | Note                     |
| ----------------- | ----------- | ---------- | ------------------------ |
| G1 Discovery      | GO          | 2026-04-11 | Discovery Brief completo |
| G2 Tool Decision  | GO          | 2026-04-11 | Scorecard: Native=4.45   |
| G3 Manifest       | GO          | 2026-04-11 | Questo documento         |
| G4 Implementation | IN_PROGRESS | -          | Verificare vs G3         |
| G5 Verification   | PENDING     | -          | Test report + telemetry  |
| G6 Rollout        | PENDING     | -          | Shadow → Canary → GA     |

**Stato G3**: GO

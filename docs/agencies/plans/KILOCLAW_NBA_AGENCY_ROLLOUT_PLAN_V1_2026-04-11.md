# Rollout Plan — Agency 2 NBA

## Strategia di Rilascio

### Fase 1: Shadow Mode (7-14 giorni)

**Obiettivo**: Validazione silenziosa confrontando output NBA Agency con baseline Me4BrAIn

**Configurazione**:

```typescript
// Feature flag
AGENCY2_NBA_ENABLED = false // Default off
AGENCY2_NBA_SHADOW_MODE = true // Output solo log, no user visible
AGENCY2_NBA_SHADOW_VS_BASELINE = true // Confronto automatico
```

**Metriche da monitorare**:

- `shadow_signal_match_rate`: % segnali che matchano Me4BrAIn (±2% su edge)
- `shadow_latency_p95`: <= 7s pre-match single game
- `shadow_error_rate`: < 1% provider errors
- `shadow_policy_violations`: 0 (verifica deny-by-default)

**Gate per proceed a Canary**:

- Shadow mode stabile per 7 giorni consecutivi
- `shadow_signal_match_rate` >= 85%
- 0 policy violations
- Latency within SLO

### Fase 2: Canary (5% → 20% → 50%)

**Obiettivo**: Rilascio controllato a subset utenti con monitoring intensivo

**Step 1 - 5% canary**:

```typescript
AGENCY2_NBA_ENABLED = true
AGENCY2_NBA_SHADOW_MODE = false
AGENCY2_NBA_CANARY_PERCENT = 5
```

**Metriche SLO**:

- Availability: >= 99.5% su finestra 7 giorni
- Latency p95: <= 7s pre-match, <= 15s daily slate
- Freshness compliance: >= 99% dati within TTL
- Safety: 0 recommendation operative senza HITL

**Gate per 5% → 20%**:

- 48 ore stabili senza P1/P2 incident
- Tutti i SLO in green
- Nessun policy violation escape

**Step 2 - 20% canary**: Same criteria, 24 ore stabili

**Step 3 - 50% canary**: Same criteria, 24 ore stabili

### Fase 3: GA (100%)

**Obiettivo**: Attivazione default dopo 2 settimane canary senza regressioni critiche

**Gate GA**:

- Canary stabile per 14 giorni
- Calibration metrics within target (Brier score <= 0.25)
- On-call runbook validato
- Changelog approvato

---

## Trigger Rollback Immediato

Se UNA di queste condizioni si verificano, rollback a shadow mode o disable:

| Trigger                        | Soglia                          | Azione               |
| ------------------------------ | ------------------------------- | -------------------- |
| `policy_violation_escape_rate` | > 0                             | Immediate rollback   |
| `stale_data_block_rate`        | < 100% su dataset critico       | Immediate rollback   |
| `p95_latency`                  | > SLO per > 30 min consecutivi  | Immediate rollback   |
| `quota_burn`                   | > 80% budget giornaliero        | Degrade a set minimo |
| Provider outage                | > 2 provider contemporaneamente | Fallback chain       |

---

## Piano Rollback

### Step 1: Feature Flag

```typescript
// Immediate: disable NBA agency
AGENCY2_NBA_ENABLED = false
```

### Step 2: Fallback Mode

```typescript
// Se abilitato: modalità read-only insights senza recommendation
AGENCY2_NBA_READ_ONLY = true
```

### Step 3: Preserve Telemetry

- Tutti i dati telemetry conservati per postmortem
- Correlation IDs disponibili per debugging

---

## Runbook

### Incident P1 ( < 15 min mitigazione)

1. **Identificazione**: Alert su `agency2.provider_error_rate > 10%`
2. **Mitigazione**:
   - Check circuit breaker status
   - Force fallback chain se provider degraded
   - Se nessun miglioramento: disable NBA agency via feature flag
3. **Comunicazione**: Notify utenti canary via status page
4. **Postmortem**: Entro 24 ore con RCA

### Incident P2 ( < 4 ore mitigazione)

1. **Identificazione**: Alert su `agency2.latency_p95 > 10s`
2. **Mitigazione**:
   - Check provider latency
   - Scale down a set minimo di provider
   - Disable capability non-critiche
3. **Patch**: Rilascio hotfix se necessario

---

## Changelog

### v0.1.0 (Shadow Mode)

- Initial shadow mode release
- Adapter layer: BallDontLie, ESPN, OddsAPI, Bet365, ParlayAPI, Polymarket, nba_api
- Schema normalizzati: Game, Odds, Signal, Recommendation, Injury
- Policy matrix SAFE/NOTIFY/CONFIRM/DENY
- Deny-by-default enforcement
- Confidence cap 95%
- Freshness TTL enforcement
- Circuit breaker per provider
- Telemetry events: request_started, request_completed, policy_decision, signal_emitted

### v0.2.0 (Canary)

- TBD based on shadow mode findings

### v1.0.0 (GA)

- TBD based on canary results

---

## Owner On-Call

| Role      | Owner | Escalation          |
| --------- | ----- | ------------------- |
| Primary   | TBD   | -                   |
| Secondary | TBD   | Primary unavailable |
| Security  | TBD   | Security team       |

---

## Telemetry Dashboard

### Key Metrics

```typescript
// Real-time monitoring
agency2_requests_total // Counter
agency2_requests_duration_p95 // Histogram
agency2_provider_errors_total // By provider
agency2_policy_decisions_total // By outcome
agency2_signals_emitted_total // By type
agency2_stale_blocks_total // By dataset

// SLO tracking
agency2_availability_percent // 7d rolling
agency2_latency_p95_seconds // 1h rolling
agency2_freshness_percent // By source
```

---

## Protocol Gate Status

| Gate              | Stato          | Data       | Note                 |
| ----------------- | -------------- | ---------- | -------------------- |
| G1 Discovery      | GO             | 2026-04-11 | Discovery Brief      |
| G2 Tool Decision  | GO             | 2026-04-11 | Scorecard            |
| G3 Manifest       | GO             | 2026-04-11 | deny-by-default      |
| G4 Implementation | GO             | 2026-04-11 | 51 tests pass        |
| G5 Verification   | CONDITIONAL GO | 2026-04-11 | Shadow mode required |
| G6 Rollout        | SHADOW MODE    | 2026-04-11 | Questo documento     |

---

## Status: SHADOW MODE PENDING

NBA Agency pronta per shadow mode. Esecuzione:

```bash
# Enable shadow mode
export AGENCY2_NBA_ENABLED=false
export AGENCY2_NBA_SHADOW_MODE=true
export AGENCY2_NBA_SHADOW_VS_BASELINE=true

# Oppure via feature flag file
echo "AGENCY2_NBA_SHADOW_MODE=true" >> .env
```

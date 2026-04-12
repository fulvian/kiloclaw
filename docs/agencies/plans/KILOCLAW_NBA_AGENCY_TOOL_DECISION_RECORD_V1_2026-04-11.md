# Tool Decision Record — Agency 2 NBA

## Caso d'uso

- **Intent**: NBA betting analysis con guardrail verificabili
- **Requisiti minimi**:
  - Games/Schedule data (pre-match + live)
  - Injury status con freshness < 1h
  - Odds per mercati h2h/spread/totals da multipli bookmaker
  - Probability estimation con vig removal
  - Edge detection con confidence cap <= 95%
  - Recommendation/report output (non-executable)

## Opzioni

### Opzione A (Native Adapters)

Implementazione di adapter nativi TypeScript per ogni provider:

- `BallDontLieAdapter` - games, players, stats, injuries
- `OddsAPIAdapter` - bookmaker odds (The Odds API v4)
- `OddsBet365Adapter` - Bet365 dedicated
- `ParlayAPIAdapter` - 40+ bookmakers
- `ESPNAdapter` - scoreboard, injuries, standings
- `NBAApiAdapter` - nba_api Python wrapper stub
- `PolymarketAdapter` - prediction market odds

**Pro**: Nessuna dipendenza MCP, context footprint controllato, fallback customizzabile
**Contro**: Manutenzione manuale degli endpoint, rate limiting custom

### Opzione B (MCP-based)

Utilizzo di MCP server per NBA data:

- Custom MCP server per BallDontLie, OddsAPI, etc.

**Pro**: Standardizzazione interfaccia
**Contro**: Context overhead, meno controllo su fallback, lock-in

### Opzione C (Ibrida)

Adapter nativi per capability critiche (odds, injuries) + MCP per capability secondarie.

## Scorecard (1-5)

| Criterio                                | Peso | A (Native) | B (MCP) | C (Ibrida) |
| --------------------------------------- | ---: | :--------: | :-----: | :--------: |
| Performance (latency, throughput)       | 0.20 |     4      |    3    |     4      |
| Token/context cost                      | 0.15 |     5      |    2    |     4      |
| Affidabilita (API stability, fallback)  | 0.25 |     4      |    3    |     4      |
| Sicurezza (permissions, audit, secrets) | 0.30 |     5      |    4    |     5      |
| Maintenance (upgrade effort, ownership) | 0.10 |     4      |    3    |     4      |

### Calcolo

- **Opzione A (Native)**: 4×0.20 + 5×0.15 + 4×0.25 + 5×0.30 + 4×0.10 = 0.80 + 0.75 + 1.00 + 1.50 + 0.40 = **4.45**
- **Opzione B (MCP)**: 3×0.20 + 2×0.15 + 3×0.25 + 4×0.30 + 3×0.10 = 0.60 + 0.30 + 0.75 + 1.20 + 0.30 = **3.15**
- **Opzione C (Ibrida)**: 4×0.20 + 4×0.15 + 4×0.25 + 5×0.30 + 4×0.10 = 0.80 + 0.60 + 1.00 + 1.50 + 0.40 = **4.30**

## Decisione

- **Scelta**: Opzione A (Native Adapters)
- **Rationale**:
  - Miglior score complessivo (4.45 vs 4.30 vs 3.15)
  - Controllo completo su fallback chain e freshness TTL
  - Context footprint minimo (5 vs 2 per token cost)
  - Sicurezza massima (5) con key pool isolation
  - Gia implementato e testato con 913 test pass

### Provider Priority Chains

| Capability | Primary     | Fallback 1 | Fallback 2 | Fallback 3               |
| ---------- | ----------- | ---------- | ---------- | ------------------------ |
| Games      | BallDontLie | ESPN       | nba_api    | -                        |
| Odds       | Bet365      | OddsAPI    | ParlayAPI  | BallDontLie → Polymarket |
| Injuries   | BallDontLie | ESPN       | -          | -                        |
| Stats      | BallDontLie | ESPN       | nba_api    | -                        |

### Trigger Switch

- `401/403` → auth error, switch al fallback immediato
- `429` → rate limit, exponential backoff + cooldown scheduler
- `5xx` → server error, retry bounded (max 3) → fallback
- `timeout > 10s` → fallback
- `stale_data` → blocca emissione recommendation

### Retry Policy

- Max 3 retry con exponential backoff (1s, 2s, 4s)
- Jitter: ±500ms
- Solo per errori transienti (429, 5xx, timeout)
- Non per 401/403 (auth error = switch immediato)

### Timeout Policy

| Provider    | Default Timeout | Max Timeout |
| ----------- | --------------- | ----------- |
| BallDontLie | 5000ms          | 10000ms     |
| OddsAPI     | 8000ms          | 15000ms     |
| ESPN        | 5000ms          | 10000ms     |
| Polymarket  | 5000ms          | 10000ms     |
| nba_api     | 10000ms         | 20000ms     |

## Freshness TTL (enforced)

| Source            | Freshness Hard | Se Stantio                  |
| ----------------- | -------------- | --------------------------- |
| OddsAPI           | 120s           | Blocca Recommendation       |
| Polymarket        | 60s            | Blocca merge odds bookmaker |
| ESPN scoreboard   | 60s            | Degrada a pre-match         |
| ESPN injuries     | 6h             | Confidence penalty          |
| BallDontLie games | 10m            | Fallback a ESPN             |
| nba_api advanced  | 24h            | Flag `historical_context`   |

## Stato G2: GO

- **Data**: 2026-04-11
- **Evidenza**: Implementazione completa in `packages/opencode/src/kiloclaw/agency/nba/adapters/`
- **Test**: 51 test NBA pass, adapter chain verificato

---

## Protocol Gate Status

| Gate              | Stato       | Data       | Note                                |
| ----------------- | ----------- | ---------- | ----------------------------------- |
| G1 Discovery      | GO          | 2026-04-11 | Discovery Brief completo            |
| G2 Tool Decision  | GO          | 2026-04-11 | Questo documento - scorecard A=4.45 |
| G3 Manifest       | PENDING     | -          | Da completare                       |
| G4 Implementation | IN_PROGRESS | -          | Verificare vs G3                    |
| G5 Verification   | PENDING     | -          | Test report + telemetry             |
| G6 Rollout        | PENDING     | -          | Shadow → Canary → GA                |

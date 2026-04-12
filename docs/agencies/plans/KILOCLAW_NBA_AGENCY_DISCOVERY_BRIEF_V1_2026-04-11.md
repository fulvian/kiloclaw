# Discovery Brief — Agency 2 NBA

## Contesto

- **Problema operativo**: Gli utenti di KiloClaw non hanno accesso a un'agenzia specializzata NBA betting che fornisca analisi automatizzata con guardrail di sicurezza verificabili. Il baseline Me4BrAIn esiste ma non è integrato in KiloClaw.
- **Utenti coinvolti**: Utenti KiloClaw interessati a insights NBA betting, con profili che vanno da ricreazionali a semi-professionali.
- **Processo attuale**: Me4BrAIn fornisce analisi NBA betting in modalità standalone. KiloClaw non ha capability betting.

## Obiettivi

- ** Obiettivo 1**: Portare in KiloClaw una Agency 2 NBA betting con architettura `native-first` e fallback controllato.
- ** Obiettivo 2**: Riutilizzare il baseline `sports_nba` di Me4BrAIn senza regressioni su copertura dati, robustezza e controllo rischio.
- ** Obiettivo 3**: Applicare policy hard `SAFE/NOTIFY/CONFIRM/DENY` con `deny-by-default` per ogni capability.
- ** Obiettivo 4**: Rendere obbligatori vig-removal, confidence cap `<= 95%`, freshness gating e HITL per stake sizing.

## Scope

### In scope

1. Agency NBA betting con adapter per BallDontLie, ESPN, OddsAPI, Polymarket, nba_api
2. Schema normalizzati: `Game`, `Odds`, `Signal`, `Recommendation`, `Injury`
3. Policy matrix SAFE/NOTIFY/CONFIRM/DENY con deny-by-default
4. Dynamic tool payload budgeting con circuit breaker
5. Calibration e go/no-go gates con Brier/log-loss
6. Provider fallback chains con resilienza
7. HITL obbligatorio per stake sizing
8. Shadow mode testing vs baseline Me4BrAIn

### Out of scope

1. Auto-bet o auto-execution su bookmaker/mercati (DENY hard in v1)
2. Integrazione con wallet/custody
3. Real-money wagering automation
4. Martingale o chase-loss strategies
5. Accesso a dati personali o financial account data

## KPI

| KPI                             | Formula                                               | Baseline          | Target                      | Finestra misura   |
| ------------------------------- | ----------------------------------------------------- | ----------------- | --------------------------- | ----------------- |
| `copertura_slate_nba`           | `% partite NBA coperte / totale partite giorno`       | TBD (da Me4BrAIn) | >= 95%                      | Pre-match daily   |
| `signal_precision_at_5pct_edge` | `precision @ 5% edge threshold`                       | TBD               | >= 0.55                     | 30 giorni post-GA |
| `stale_data_block_rate`         | `% segnali bloccati per stale / totale segnali`       | 0 (nessun blocco) | 100% su casi fuori finestra | Continuo          |
| `policy_violation_escape_rate`  | `% violazioni policy non bloccate / totale richieste` | 0                 | 0                           | Continuo          |
| `tool_schema_tokens_p50`        | Token mediani per schema tool                         | TBD               | -35% vs statico             | Per query         |
| `p95_end_to_end_latency`        | Latency p95 analisi singola partita                   | TBD               | <= 7s                       | Pre-match         |

## Vincoli

### Tecnici

- KiloClaw runtime con Agency framework
- Node.js/Bun runtime
- TypeScript strict mode
- 8 provider adapters massimo per dominio
- Budget: <= 7 tool per query normale, <= 12 per analisi completa

### Operativi

- SLA availability: >= 99.5% su finestra 7 giorni
- Incident P1: mitigazione < 15 minuti
- Incident P2: mitigazione < 4 ore
- Shadow mode: 2 settimane prima di GA

### Sicurezza

- Nessun secret esposto in tool schema
- API keys gestite tramite key pool
- Audit trail immutabile per decisioni policy
- Telemetry isolata da KiloCode

### Legali

- Geofence: blocco per giurisdizioni dove betting è regolamentato diversamente
- Disclaimer obbligatorio su tutti gli output betting
- Nessuna garanzia di risultato
- Compliance con termini dei provider API

## Rischi

| Rischio                   | Severità | Probabilità | Mitigazione                                            | Limite hard          |
| ------------------------- | -------- | ----------- | ------------------------------------------------------ | -------------------- |
| Auto-bet escape           | Critica  | Bassa       | DENY hard, HITL obbligatorio, audit trail              | Zero tolerance       |
| Stale data → bad advice   | Alta     | Media       | Freshness TTL enforced, blocco automatico              | 100% block rate      |
| Provider quota exhaustion | Media    | Alta        | Circuit breaker, fallback chain, quota-aware scheduler | Graceful degradation |
| Confidence overestimation | Alta     | Media       | Cap 95%, calibration monitoring                        | Brier score target   |
| Data leakage              | Critica  | Bassa       | No PII, isolation, audit                               | Zero tolerance       |

## Decisione gate

- **Stato G1**: GO
- **Owner**: TBD
- **Data**: 2026-04-11
- **Approvatore**: Required

---

## Protocol Gate Status

| Gate              | Stato   | Data       | Note                    |
| ----------------- | ------- | ---------- | ----------------------- |
| G1 Discovery      | GO      | 2026-04-11 | Questo documento        |
| G2 Tool Decision  | PENDING | -          | Da completare           |
| G3 Manifest       | PENDING | -          | Da completare           |
| G4 Implementation | PENDING | -          | Verificare vs G3        |
| G5 Verification   | PENDING | -          | Test report + telemetry |
| G6 Rollout        | PENDING | -          | Shadow → Canary → GA    |

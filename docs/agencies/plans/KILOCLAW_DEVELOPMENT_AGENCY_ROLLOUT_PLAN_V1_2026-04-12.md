# Rollout Plan — Development Agency Refoundation

## Contesto

**Progetto**: Development Agency Refoundation
**Tipo**: Internal refactoring con feature flag control
**Commit**: `bdc14f5bf4753db2aa5e94e3a12c3defed7299d6`
**Feature Flag**: `KILO_NATIVE_FACTORY_ENABLED` (default: `false`)

---

## Strategia di Rilascio

A differenza delle agency NBA/Workspace che hanno dipendenze esterne, la Development Agency Refoundation è un refactoring interno che sostituisce implementazioni MCP con equivalenti nativi. Il rilascio è interamente controllato da feature flag.

### Fase 0: Preparation (Completata)

**Obiettivo**: Verificare che tutto sia pronto per l'attivazione

- [x] Codice merged to `main`
- [x] 1037 tests pass
- [x] Typecheck clean
- [x] KPI Enforcer verificato
- [x] Go No-Go Review approvato

### Fase 1: Shadow Mode (1-3 giorni)

**Obiettivo**: Validazione silenziosa con flag ON ma senza impatto utente

```bash
# Configurazione shadow mode
KILO_NATIVE_FACTORY_ENABLED=true
KILO_NATIVE_FACTORY_SHADOW=true  # Output solo log, no user visible
```

**Metriche da monitorare**:

| Metrica                   | Target           | Note                 |
| ------------------------- | ---------------- | -------------------- |
| `native_adapter_ratio`    | >= 90%           | KPI enforcement      |
| `fallback_adapter_ratio`  | <= 10%           | KPI enforcement      |
| `auto_repair_strikes`     | < 3 per sessione | 3-strike write block |
| `native_execution_errors` | < 1%             | Error rate           |
| `latency_p95`             | < 500ms          | SLO native adapter   |

**Gate per proceed a Canary**:

- Shadow mode stabile per 24-48 ore
- `native_adapter_ratio` >= 90%
- 0 auto-repair write blocks
- Nessun errore di telemetria

### Fase 2: Canary (1-7 giorni)

**Obiettivo**: Rilascio controllato a subset limitato di utenti

```bash
# Configurazione canary
KILO_NATIVE_FACTORY_ENABLED=true
KILO_NATIVE_FACTORY_SHADOW=false
KILO_NATIVE_FACTORY_CANARY_PERCENT=5  # 5% of users
```

**Metriche SLO**:

| Metrica              | Target   | Finestra |
| -------------------- | -------- | -------- |
| Availability         | >= 99.5% | 7 giorni |
| Latency p95 native   | < 500ms  | 1 ora    |
| Latency p95 fallback | < 2000ms | 1 ora    |
| KPI ratio native     | >= 90%   | daily    |
| KPI ratio fallback   | <= 10%   | daily    |
| Error rate           | < 1%     | 1 ora    |

**Gate per 5% → 20%**:

- 24 ore stabili senza P1/P2 incident
- Tutti i SLO in green
- KPI ratio within target

### Fase 3: Graduale (7-14 giorni)

**Obiettivo**: Rollout progressivo fino a 100%

```bash
# Step 1: 20%
KILO_NATIVE_FACTORY_CANARY_PERCENT=20

# Step 2: 50%
KILO_NATIVE_FACTORY_CANARY_PERCENT=50

# Step 3: 100%
KILO_NATIVE_FACTORY_CANARY_PERCENT=100
```

**Gate per ogni step**:

- 24 ore stabili senza incident
- SLO in green
- KPI ratio within target

### Fase 4: GA (100%)

**Obiettivo**: Attivazione default per tutti gli utenti

```bash
# Configurazione GA
KILO_NATIVE_FACTORY_ENABLED=true
KILO_NATIVE_FACTORY_CANARY_PERCENT=100
KILO_NATIVE_FACTORY_SHADOW=false
```

**Gate GA**:

- Canary stabile per 7 giorni
- Zero P0/P1 incident
- KPI ratio >= 90% native per 7 giorni consecutivi
- Telemetry dashboard showing green

---

## Trigger Rollback Immediato

| Trigger                    | Soglia                | Azione             |
| -------------------------- | --------------------- | ------------------ |
| `native_adapter_ratio`     | < 80% per > 1 ora     | Immediate rollback |
| `auto_repair_write_blocks` | > 10 per sessione     | Immediate rollback |
| `latency_p95`              | > 2000ms per > 30 min | Immediate rollback |
| `native_execution_errors`  | > 5%                  | Immediate rollback |
| KPI status                 | `blocked`             | Immediate rollback |

---

## Piano Rollback

### Step 1: Feature Flag

```bash
# Immediate: disable native factory
KILO_NATIVE_FACTORY_ENABLED=false
```

### Step 2: Preserve State

- Telemetry data conservati per postmortem
- Correlation IDs disponibili per debugging
- KPI history retrievable

### Step 3: Notify

- Team notified via status page
- Postmortem entro 48 ore

---

## Runbook

### Incident P0/P1 (< 15 min mitigazione)

1. **Identificazione**: Alert su KPI ratio o error rate
2. **Mitigazione**:
   - Check `KILO_NATIVE_FACTORY_ENABLED` — set to `false` if needed
   - Check KPI dashboard per native/fallback ratio
   - If degradation: disable flag immediately
3. **Comunicazione**: Notify team
4. **Postmortem**: Entro 24 ore con RCA

### Incident P2 (< 1 ora mitigazione)

1. **Identificazione**: Alert su latency o error rate
2. **Mitigazione**:
   - Check adapter health
   - Check auto-repair strikes
   - Scale down canary percentage if needed
3. **Patch**: Rilascio hotfix se necessario

---

## Changelog

### v1.0.0 (Development Agency Refoundation)

**Commit**: `bdc14f5` — 2026-04-12

- **Native-first factory**: 9 native adapters replacing MCP equivalents
  - File, Git, Build, Research, Browser, GitHub, Memory, Visual, Orchestration
- **KPI Enforcer**: Ratio tracking (native >= 90%, fallback <= 10%)
- **Auto-repair 3-strike**: Runtime repair with write block
- **Telemetry contracts**: runtime_repair, parity_check, native_fallback
- **16 skill files**: Onda 2-4 development/knowledge/meta skills
- **20 skill aliases**: Backward compatibility with kilo_kit naming
- **5/5 development agents**: general-manager, system-analyst, architect, coder, qa
- **Parity harness C1-C7**: Concrete tests for all capability contracts
- **Feature flag**: `KILO_NATIVE_FACTORY_ENABLED` (default: OFF)

### v1.1.0 (Shadow Mode)

- TBD based on shadow mode findings

### v1.2.0 (Canary)

- TBD based on canary results

---

## Telemetry Dashboard

### Key Metrics

```typescript
// KPI monitoring
kiloclaw_native_adapter_ratio_percent // Gauge (target: >= 90)
kiloclaw_fallback_adapter_ratio_percent // Gauge (target: <= 10)
kiloclaw_kpi_status // Gauge (0=ok, 1=warning, 2=critical, 3=blocked)

// Execution
kiloclaw_native_executions_total // Counter
kiloclaw_fallback_executions_total // Counter
kiloclaw_native_execution_duration_p95 // Histogram (target: < 500ms)

// Auto-repair
kiloclaw_auto_repair_strikes_total // Counter
kiloclaw_auto_repair_blocks_total // Counter

// Parity
kiloclaw_parity_check_total // Counter
kiloclaw_parity_check_failures // Counter
```

---

## Owner On-Call

| Role      | Owner            | Escalation          |
| --------- | ---------------- | ------------------- |
| Primary   | Development team | —                   |
| Secondary | Platform team    | Primary unavailable |
| Security  | Security team    | Security incidents  |

---

## Protocol Gate Status

| Gate              | Stato       | Data       | Note                      |
| ----------------- | ----------- | ---------- | ------------------------- |
| G1 Discovery      | N/A         | —          | Internal refactoring      |
| G2 Tool Decision  | N/A         | —          | Native-first mandated     |
| G3 Manifest       | GO          | 2026-04-12 | Part of PR review         |
| G4 Implementation | GO          | 2026-04-12 | 1037 tests pass           |
| G5 Verification   | GO          | 2026-04-12 | Go No-Go Review approvato |
| G6 Rollout        | PREPARATION | 2026-04-12 | Shadow mode pending       |

---

## Status: SHADOW MODE PENDING

Development Agency pronta per shadow mode. Esecuzione:

```bash
# Enable shadow mode
export KILO_NATIVE_FACTORY_ENABLED=true
export KILO_NATIVE_FACTORY_SHADOW=true

# Monitor KPI
# - native_adapter_ratio >= 90%
# - fallback_adapter_ratio <= 10%
# - auto_repair_strikes < 3
```

---

## Note Operative

### Activating the flag

```bash
# Step 1: Shadow mode (24-48h)
KILO_NATIVE_FACTORY_ENABLED=true
KILO_NATIVE_FACTORY_SHADOW=true

# Step 2: Canary (after shadow validation)
KILO_NATIVE_FACTORY_ENABLED=true
KILO_NATIVE_FACTORY_SHADOW=false
KILO_NATIVE_FACTORY_CANARY_PERCENT=5

# Step 3: Gradual increase
KILO_NATIVE_FACTORY_CANARY_PERCENT=20  # after 24h stable
KILO_NATIVE_FACTORY_CANARY_PERCENT=50  # after 24h stable
KILO_NATIVE_FACTORY_CANARY_PERCENT=100 # after 7 days stable
```

### Disabling

```bash
# Immediate disable
KILO_NATIVE_FACTORY_ENABLED=false
```

This reverts to MCP-based implementation without code changes.

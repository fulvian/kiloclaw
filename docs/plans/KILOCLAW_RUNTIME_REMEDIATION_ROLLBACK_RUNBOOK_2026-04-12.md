# KILOCLAW RUNTIME REMEDIATION ROLLBACK RUNBOOK

## Obiettivo

Questo runbook descrive le procedure di rollback per il runtime remediation plan (P0/P1/P2). Ogni rollback deve essere idempotente e verificabile in meno di 15 minuti.

---

## Principi Generali

1. **Rollback per agency prima di rollback globale**
2. **Ogni rollback deve essere idempotente e verificabile in meno di 15 minuti**
3. **Documentare ogni rollback eseguito con timestamp e motivo**

---

## Trigger per Rollback

| Trigger                                         | Soglia                 | Finestra  | Priorità |
| ----------------------------------------------- | ---------------------- | --------- | -------- |
| `agency_chain_failed_rate` oltre soglia critica | > 5% per agency canary | 30 min    | P0       |
| `policy_alias_miss_rate` superiore              | > 2%                   | 15 min    | P1       |
| `generic_fallback_rate` aumento eccessivo       | > 50% vs baseline      | 30 min    | P1       |
| `skill_loaded_not_executed_total` > 0           | Qualsiasi              | Immediato | P0       |
| Errori bloccanti su tool policy enforcement     | Qualsiasi              | Immediato | P0       |

---

## Livelli di Rollback

### Livello 1: Disable Execution Bridge per Singola Agency

**Quando**: Problemi con chain executor / skill execution per una specifica agency.

**Azione**:

```bash
# Disabilita execution bridge per agency specifica
export KILO_RUNTIME_SESSION_EXECUTION_BRIDGE_ENABLED=false
# Oppure via feature flag API
```

**Verifica**:

```bash
# Verifica che i chain events si fermino
grep "agency_chain_started" logs/kiloclaw.log | tail -100
# Non devono esserci nuovi eventi per l'agency disabilitata
```

**Tempo stimato**: 5 minuti

---

### Livello 2: Disable Tool Identity Resolver Enforcement

**Quando**: Problemi con risoluzione tool identity / mismatch policy.

**Azione**:

```bash
# Torna in observe mode (solo telemetria, nessun enforcement)
export KILO_RUNTIME_TOOL_IDENTITY_RESOLVER_ENABLED=true
export KILO_RUNTIME_TOOL_IDENTITY_RESOLVER_SHADOW=true
```

**Verifica**:

```bash
# Verifica che non ci siano più block per identity mismatch
grep "tool_policy_decision.*blocked.*identity" logs/kiloclaw.log | tail -50
# Solo log, nessuna azione di block
```

**Tempo stimato**: 5 minuti

---

### Livello 3: Disable Skill Tool Execute Mode

**Quando**: Skill caricate ma non eseguite, fallback improprio.

**Azione**:

```bash
# Disabilita execute mode, torna a load-only
export KILO_RUNTIME_SKILL_TOOL_EXECUTE_MODE_ENABLED=false
```

**Verifica**:

```bash
# Verifica che skill_loaded_not_executed torni a 0
grep "skill_loaded_not_executed" logs/kiloclaw.log
# Non devono esserci eventi dopo il disable
```

**Tempo stimato**: 5 minuti

---

### Livello 4: Rollback Feature Flags Globale

**Quando**: Degrado persistente che richiede ripristino completo.

**Azione**:

```bash
# Ripristina tutti i flag allo stato pre-deployment
# Via config management o git revert

git revert <commit-hash> --no-commit
git commit -m "rollback: revert runtime remediation P0/P1/P2"
```

**Verifica**:

```bash
# Run test suite completa
cd packages/opencode && bun test

# Verifica status pre-deployment
git log --oneline -5
```

**Tempo stimato**: 10-15 minuti

---

### Livello 5: Rollback Release

**Quando**: Nessun miglioramento dopo tutti i rollback precedenti.

**Azione**:

```bash
# Identifica release tag precedente stabile
git tag -l | grep -E "v[0-9]+\.[0-9]+\.[0-9]+" | tail -5

# Rollback alla release precedente
git checkout v<previous-stable-version>
npm publish --access public

# Notifica team di rollback
```

**Verifica**:

```bash
# Verifica release in produzione
curl -s https://api.kilo.dev/health | jq .version
```

**Tempo stimato**: 30-60 minuti

---

## Feature Flags e Configurazione

### Flag Principali

| Flag                                            | Default | Descrizione                            |
| ----------------------------------------------- | ------- | -------------------------------------- |
| `KILO_RUNTIME_TOOL_IDENTITY_RESOLVER_ENABLED`   | `false` | Abilita risoluzione tool identity      |
| `KILO_RUNTIME_TOOL_IDENTITY_RESOLVER_SHADOW`    | `true`  | Shadow mode (solo log, no enforcement) |
| `KILO_RUNTIME_SESSION_EXECUTION_BRIDGE_ENABLED` | `false` | Abilita execution bridge               |
| `KILO_RUNTIME_SKILL_TOOL_EXECUTE_MODE_ENABLED`  | `false` | Abilita execute mode per skill tool    |
| `KILO_RUNTIME_SKILL_NO_SILENT_FALLBACK`         | `false` | Warn su skill loaded without execution |
| `KILO_ROUTING_AGENCY_CONTEXT_ENABLED`           | `false` | Abilita agency context in routing      |
| `KILO_ROUTING_DYNAMIC_ENABLED`                  | `false` | Abilita routing dinamico L1-L3         |

### Agency-Specific Flags

| Agency      | Flag                                  | Default |
| ----------- | ------------------------------------- | ------- |
| Knowledge   | `KILOCLAW_AGENCY_KNOWLEDGE_ENABLED`   | `true`  |
| Development | `KILOCLAW_AGENCY_DEVELOPMENT_ENABLED` | `true`  |
| NBA         | `KILOCLAW_AGENCY_NBA_ENABLED`         | `false` |
| Finance     | `KILOCLAW_AGENCY_FINANCE_ENABLED`     | `false` |
| GWorkspace  | `KILOCLAW_AGENCY_GWORKSPACE_ENABLED`  | `false` |

---

## Snapshot e Artefatti di Rollback

### Pre-Deployment Checklist

- [ ] Snapshot feature flags registrato
- [ ] Snapshot mapping resolver salvato
- [ ] Backup configurazione corrente
- [ ] Lista contatti on-call aggiornata

### Artefatti da Conservare

```
/backups/
  ├── runtime-remediation/
  │   ├── feature-flags-YYYY-MM-DD.json
  │   ├── tool-identity-map-YYYY-MM-DD.json
  │   ├── config-YYYY-MM-DD.yaml
  │   └── test-results-baseline.json
```

---

## Contatti e On-Call

| Ruolo             | Responsabile     | Escalation           |
| ----------------- | ---------------- | -------------------- |
| Primary On-Call   | Team Kiloclaw    |                      |
| Secondary On-Call | Team Platform    | engineering@kilo.dev |
| Management        | Engineering Lead |                      |

---

## Procedure Post-Rollback

1. **Comunicazione**: Notifica utenti affected via status page
2. **Investigazione**: Analizza root cause entro 24h
3. **Fix**: Implementa fix o workaround
4. **Testing**: Run test suite completa
5. **Redeploy**: Follow-up deployment con fix
6. **Postmortem**: Documenta incident entro 48h

---

## Metriche di Baseline

### Pre-Remediation (G1 Baseline)

| Metrica                           | Valore Baseline |
| --------------------------------- | --------------- |
| `policy_alias_miss_rate`          | ~15%            |
| `skill_loaded_not_executed_total` | Non tracciato   |
| `generic_fallback_rate`           | ~40%            |
| `agency_chain_success_rate`       | Non tracciato   |

### Target Post-Remediation

| Metrica                           | Target                       |
| --------------------------------- | ---------------------------- |
| `policy_alias_miss_rate`          | <= 1%                        |
| `skill_loaded_not_executed_total` | = 0 nei path operativi       |
| `generic_fallback_rate`           | Ridotto >= 30% vs baseline   |
| `agency_chain_success_rate`       | >= 95% in canary stabile 72h |

---

## Appendice: Comandi Utili

```bash
# Check flag status
grep -r "KILO_RUNTIME" packages/opencode/src/flag/flag.ts

# Verify agency enabled
curl -s localhost:8080/api/agency/status | jq '.agencies[] | select(.enabled==true)'

# View recent chain events
tail -f logs/kiloclaw.log | grep "agency_chain"

# Check KPI status
curl -s localhost:8080/api/kpi/status | jq '.status'

# Disable specific agency
export KILOCLAW_AGENCY_<NAME>_ENABLED=false
```

---

## Cronologia Modifiche

| Data       | Versione | Autore        | Descrizione              |
| ---------- | -------- | ------------- | ------------------------ |
| 2026-04-12 | 1.0      | Kiloclaw Team | Initial runbook creation |

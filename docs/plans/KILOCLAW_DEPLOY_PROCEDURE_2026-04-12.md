# KILOCLAW RUNTIME REMEDIATION - DEPLOY RUNBOOK

## Versione

- **Tag**: `v2.14.0-runtime-remediation`
- **Commit**: `c409c90793709c91301b85f1fa82b65e7b2408f0`
- **Data**: 2026-04-12

---

## Panoramica Deploy

Questo deploy abilita il Runtime Remediation Plan completo (P0/P1/P2):

- ToolIdentityResolver con mapping alias/canonical/runtime
- Execution bridge per skill execution
- RouteResult propagato in Tool.Context
- E2E test suite per tutte le agency
- KPI telemetry e guardrail

---

## Prerequisiti

- [ ] Accesso Kubernetes/Cloud Platform
- [ ] Accesso a dashboard monitoring (Grafana/Datadog)
- [ ] Accesso ai logs (ELK/CloudWatch)
- [ ] Team on-call identificato per rollback

---

## Configurazione Environment Variables

### Produzione (Deploy Immediato - No Shadow Mode)

```bash
# === TOOL IDENTITY RESOLVER ===
KILO_RUNTIME_TOOL_IDENTITY_RESOLVER_ENABLED=true
KILO_RUNTIME_TOOL_IDENTITY_RESOLVER_SHADOW=false

# === EXECUTION BRIDGE ===
KILO_RUNTIME_SESSION_EXECUTION_BRIDGE_ENABLED=true
KILO_RUNTIME_SKILL_TOOL_EXECUTE_MODE_ENABLED=true
KILO_RUNTIME_SKILL_NO_SILENT_FALLBACK=true

# === ROUTING ===
KILO_ROUTING_AGENCY_CONTEXT_ENABLED=true
KILO_ROUTING_DYNAMIC_ENABLED=true

# === AGENCY ENABLED ===
KILOCLAW_AGENCY_KNOWLEDGE_ENABLED=true
KILOCLAW_AGENCY_DEVELOPMENT_ENABLED=true
KILOCLAW_AGENCY_GWORKSPACE_ENABLED=true
KILOCLAW_AGENCY_FINANCE_ENABLED=true
KILOCLAW_AGENCY_NBA_ENABLED=false
```

---

## Comandi di Deploy

### Opzione 1: Kubernetes

```bash
# 1. Set image
kubectl set image deployment/kiloclaw opencode=gcr.io/kiloclaw/kiloclaw:v2.14.0-runtime-remediation

# 2. Apply environment variables
kubectl set env deployment/kiloclaw \
  KILO_RUNTIME_TOOL_IDENTITY_RESOLVER_ENABLED=true \
  KILO_RUNTIME_TOOL_IDENTITY_RESOLVER_SHADOW=false \
  KILO_RUNTIME_SESSION_EXECUTION_BRIDGE_ENABLED=true \
  KILO_RUNTIME_SKILL_TOOL_EXECUTE_MODE_ENABLED=true \
  KILO_RUNTIME_SKILL_NO_SILENT_FALLBACK=true \
  KILO_ROUTING_AGENCY_CONTEXT_ENABLED=true \
  KILO_ROUTING_DYNAMIC_ENABLED=true \
  KILOCLAW_AGENCY_KNOWLEDGE_ENABLED=true \
  KILOCLAW_AGENCY_DEVELOPMENT_ENABLED=true \
  KILOCLAW_AGENCY_GWORKSPACE_ENABLED=true \
  KILOCLAW_AGENCY_FINANCE_ENABLED=true \
  KILOCLAW_AGENCY_NBA_ENABLED=false

# 3. Verify rollout
kubectl rollout status deployment/kiloclaw --timeout=300s

# 4. Check pods
kubectl get pods -l app=kiloclaw
```

### Opzione 2: Docker/Swarm

```bash
# Pull image
docker pull gcr.io/kiloclaw/kiloclaw:v2.14.0-runtime-remediation

# Run container
docker run -d \
  --name kiloclaw \
  -e KILO_RUNTIME_TOOL_IDENTITY_RESOLVER_ENABLED=true \
  -e KILO_RUNTIME_TOOL_IDENTITY_RESOLVER_SHADOW=false \
  -e KILO_RUNTIME_SESSION_EXECUTION_BRIDGE_ENABLED=true \
  -e KILO_RUNTIME_SKILL_TOOL_EXECUTE_MODE_ENABLED=true \
  -e KILO_RUNTIME_SKILL_NO_SILENT_FALLBACK=true \
  -e KILO_ROUTING_AGENCY_CONTEXT_ENABLED=true \
  -e KILO_ROUTING_DYNAMIC_ENABLED=true \
  -e KILOCLAW_AGENCY_KNOWLEDGE_ENABLED=true \
  -e KILOCLAW_AGENCY_DEVELOPMENT_ENABLED=true \
  -e KILOCLAW_AGENCY_GWORKSPACE_ENABLED=true \
  -e KILOCLAW_AGENCY_FINANCE_ENABLED=true \
  -e KILOCLAW_AGENCY_NBA_ENABLED=false \
  gcr.io/kiloclaw/kiloclaw:v2.14.0-runtime-remediation
```

### Opzione 3: Direct SSH/Bare Metal

```bash
# SSH to server
ssh prod-kiloclaw-01

# Stop service
sudo systemctl stop kiloclaw

# Update binary (example path)
sudo cp /opt/kiloclaw/v2.14.0-runtime-remediation /usr/local/bin/kiloclaw

# Update environment file
sudo cat > /etc/kiloclaw/env << 'EOF'
KILO_RUNTIME_TOOL_IDENTITY_RESOLVER_ENABLED=true
KILO_RUNTIME_TOOL_IDENTITY_RESOLVER_SHADOW=false
KILO_RUNTIME_SESSION_EXECUTION_BRIDGE_ENABLED=true
KILO_RUNTIME_SKILL_TOOL_EXECUTE_MODE_ENABLED=true
KILO_RUNTIME_SKILL_NO_SILENT_FALLBACK=true
KILO_ROUTING_AGENCY_CONTEXT_ENABLED=true
KILO_ROUTING_DYNAMIC_ENABLED=true
KILOCLAW_AGENCY_KNOWLEDGE_ENABLED=true
KILOCLAW_AGENCY_DEVELOPMENT_ENABLED=true
KILOCLAW_AGENCY_GWORKSPACE_ENABLED=true
KILOCLAW_AGENCY_FINANCE_ENABLED=true
KILOCLAW_AGENCY_NBA_ENABLED=false
EOF

# Start service
sudo systemctl start kiloclaw

# Check status
sudo systemctl status kiloclaw
```

---

## Verifica Post-Deploy

### Immediata (0-5 minuti)

```bash
# Check pod/service health
kubectl get pods -l app=kiloclaw
# Expected: All pods Running/Ready

# Check recent logs
kubectl logs -l app=kiloclaw --tail=100 | grep -E "error|Error|ERROR"

# Test basic endpoint
curl -s http://kiloclaw-api/health | jq .status
```

### Breve termine (5-30 minuti)

```bash
# Check KPI metrics
curl -s http://kiloclaw-api/api/kpi/status | jq '.status'

# Verify no skill loaded not executed
kubectl logs -l app=kiloclaw | grep "skill_loaded_not_executed" | wc -l
# Expected: 0

# Check chain success rate
kubectl logs -l app=kiloclaw | grep "agency_chain_completed" | grep "success" | wc -l
kubectl logs -l app=kiloclaw | grep "agency_chain_completed" | grep "failed" | wc -l
# Expected: success >> failed (95%+)

# Verify agency routing
kubectl logs -l app=kiloclaw | grep -E "agency-knowledge|agency-finance|agency-gworkspace" | tail -20
```

### Medio termine (30 min - 24h)

```bash
# Check policy alias miss rate
kubectl logs -l app=kiloclaw | grep "tool_identity_miss" | wc -l
# Expected: < 1% of total tool calls

# Check generic fallback rate
kubectl logs -l app=kiloclaw | grep "generic_fallback" | wc -l
# Expected: Significantly reduced from baseline (~40%)

# Verify all agencies routing correctly
kubectl logs -l app=kiloclaw | grep "layers.L0.domain" | sort | uniq -c
```

---

## Checklist KPI Post-Deploy

| KPI                               | Target                     | Verifica     | Stato |
| --------------------------------- | -------------------------- | ------------ | ----- |
| `policy_alias_miss_rate`          | <= 1%                      | Log analysis | ⏳    |
| `skill_loaded_not_executed_total` | = 0                        | Log analysis | ⏳    |
| `generic_fallback_rate`           | Ridotto >= 30% vs baseline | Log analysis | ⏳    |
| `agency_chain_success_rate`       | >= 95%                     | Log analysis | ⏳    |
| Error logs P0/P1                  | = 0 regression             | Log analysis | ⏳    |

---

## Trigger e Procedure Rollback

### Trigger Imediato

- [ ] `agency_chain_failed_rate` > 5% per 30 min
- [ ] `skill_loaded_not_executed_total` > 0
- [ ] Errori bloccanti in log (non transient)

### Rollback Command

```bash
# Kubernetes
kubectl rollout undo deployment/kiloclaw
kubectl rollout status deployment/kiloclaw --timeout=300s

# Docker
docker stop kiloclaw
docker rm kiloclaw
docker run -d --name kiloclaw gcr.io/kiloclaw/kiloclaw:<previous-version>

# Bare metal
sudo systemctl stop kiloclaw
sudo cp /opt/kiloclaw/<previous-version> /usr/local/bin/kiloclaw
sudo systemctl start kiloclaw
```

### Verifica Rollback

```bash
# Verify version
curl -s http://kiloclaw-api/health | jq .version

# Check pods
kubectl get pods -l app=kiloclaw

# Check logs for errors
kubectl logs -l app=kiloclaw --tail=50 | grep -E "error|Error"
```

---

## Contatti On-Call

| Ruolo             | Nome | Telefono | Email                     |
| ----------------- | ---- | -------- | ------------------------- |
| Primary On-Call   | TBD  | TBD      | oncall@kilo.dev           |
| Secondary On-Call | TBD  | TBD      | oncall-secondary@kilo.dev |
| DevOps Lead       | TBD  | TBD      | devops@kilo.dev           |

---

## Dashboard Monitoring

- **Grafana**: https://grafana.kilo.dev/d/kiloclaw-runtime
- **Logs**: https://logs.kilo.dev/app/kiloclaw
- **Alerts**: https://alerts.kilo.dev/alerts

---

## Cronologia Deploy

| Data       | Versione                    | Deployer | Env        | Note                         |
| ---------- | --------------------------- | -------- | ---------- | ---------------------------- |
| 2026-04-12 | v2.14.0-runtime-remediation | TBD      | Production | Runtime Remediation P0/P1/P2 |

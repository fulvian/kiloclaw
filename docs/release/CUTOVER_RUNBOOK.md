# Kiloclaw Release Cutover Runbook

> **Version:** 1.0.0  
> **Date:** 2026-04-02  
> **Status:** Ready for Phase 7 Execution  
> **Owner:** Orchestrator + DevOps

---

## Table of Contents

1. [Pre-Release Checklist](#pre-release-checklist)
2. [Release Candidate Freeze](#release-candidate-freeze)
3. [Cutover Strategy](#cutover-strategy)
4. [Canary Deployment](#canary-deployment)
5. [Staged Rollout](#staged-rollout)
6. [Full Production Release](#full-production-release)
7. [Rollback Procedures](#rollback-procedures)
8. [Incident Response](#incident-response)
9. [Post-Release Verification](#post-release-verification)

---

## Pre-Release Checklist

### 1.1 Quality Gates Verification

| Gate                               | Threshold | Actual       | Status  |
| ---------------------------------- | --------- | ------------ | ------- |
| Contract tests pass rate           | ≥ 98%     | 100% (56/56) | ✅ PASS |
| Safety critical scenarios          | 100%      | 100% (62/62) | ✅ PASS |
| Memory consistency must-have       | 100%      | 100% (61/61) | ✅ PASS |
| Deterministic eval reproducibility | 100%      | 100% (18/18) | ✅ PASS |
| Benchmark suite functional         | 100%      | 100% (20/20) | ✅ PASS |
| Flakiness critical suite           | < 1%      | 0%           | ✅ PASS |

### 1.2 Documentation Completeness

- [x] `docs/adr/ADR-001_Runtime_Hierarchy.md` - APPROVED
- [x] `docs/adr/ADR-002_Memory_4_Layer.md` - APPROVED
- [x] `docs/adr/ADR-003_Safety_Guardrails_Proactivity.md` - APPROVED
- [x] `docs/adr/ADR-004_Isolation_from_KiloCode.md` - APPROVED
- [x] `docs/architecture/MEMORY_4_LAYER.md` - COMPLETE
- [x] `docs/architecture/RUNTIME_HIERARCHY.md` - COMPLETE
- [x] `docs/migration/ARIA_TO_KILOCLAW_MAPPING.md` - COMPLETE
- [x] `docs/migration/LEGACY_DECOMMISSION_PLAN.md` - COMPLETE
- [x] `docs/safety/SAFETY_POLICY.md` - COMPLETE
- [x] `docs/safety/PROACTIVITY_LIMITS.md` - COMPLETE
- [x] `docs/safety/RISK_MATRIX.md` - COMPLETE
- [x] `docs/qa/VERIFICATION_REPORT.md` - COMPLETE

### 1.3 Build Verification

```bash
# Verify TypeScript compilation (using tsc as fallback for tsgo issue)
cd packages/opencode && npx tsc --noEmit

# Run kiloclaw-specific tests
cd packages/opencode && bun test test/kiloclaw/

# Expected output: 364 pass, 0 fail
```

### 1.4 Artifact Inventory

| Artifact          | Location                         | Size   | SHA256 |
| ----------------- | -------------------------------- | ------ | ------ |
| CLI Binary        | `packages/opencode/bin/kiloclaw` | ~45MB  | TBD    |
| NPM Package       | `@kilocode/cli@7.1.17`           | ~2.1MB | TBD    |
| VS Code Extension | `packages/kilo-vscode/dist/`     | ~8MB   | TBD    |
| Documentation     | `docs/`                          | ~500KB | TBD    |

---

## Release Candidate Freeze

### 2.1 RC Versioning

- **Current Version:** `7.1.17`
- **RC Version:** `7.2.0-rc.1`
- **Release Target:** `7.2.0`

### 2.2 Freeze Actions

```bash
# 1. Create release branch
git checkout -b release/7.2.0

# 2. Update version in package.json
# Edit packages/opencode/package.json: version = "7.2.0-rc.1"

# 3. Update CHANGELOG.md with all changes since last release
git add CHANGELOG.md
git commit -m "docs: update CHANGELOG for 7.2.0-rc.1"

# 4. Tag the RC
git tag -a v7.2.0-rc.1 -m "Release candidate 1 for Kiloclaw 7.2.0"
git push origin release/7.2.0
git push origin v7.2.0-rc.1

# 5. Trigger RC build workflow
# (Via GitHub Actions: workflow_dispatch on release-rc.yml)
```

### 2.3 RC Sign-Off Requirements

| Role          | Sign-Off | Date |
| ------------- | -------- | ---- |
| Architect     | ☐        | TBD  |
| QA Lead       | ☐        | TBD  |
| DevOps Lead   | ☐        | TBD  |
| Product Owner | ☐        | TBD  |

---

## Cutover Strategy

### 3.1 Deployment Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    KILOCLAW RELEASE 7.2.0                  │
├─────────────────────────────────────────────────────────────┤
│  Phase 1        Phase 2        Phase 3        Phase 4      │
│  Canary         Staged        Full          GA            │
│  (5% traffic)   (25% traffic)  (75% traffic) (100%)       │
├─────────────────────────────────────────────────────────────┤
│  Duration:      Duration:      Duration:     Duration:    │
│  24-48h         24-48h         24-48h        Permanent     │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Success Criteria per Phase

| Phase  | SLO Target                 | Monitor For                 |
| ------ | -------------------------- | --------------------------- |
| Canary | 99% uptime, p95 < 500ms    | Error rate, latency spike   |
| Staged | 99.5% uptime, p95 < 300ms  | Resource usage, memory leak |
| Full   | 99.9% uptime, p95 < 200ms  | All metrics green           |
| GA     | 99.95% uptime, p99 < 250ms | Sustained performance       |

### 3.3 Traffic Splitting

- **Canary:** 5% of users via header-based routing
- **Staged:** 25% via weighted routing
- **Full:** 75% with gradual increase
- **GA:** 100% after all gates pass

---

## Canary Deployment

### 4.1 Canary Configuration

```yaml
# canary-config.yaml
canary:
  enabled: true
  percentage: 5
  criteria:
    error_rate_threshold: 0.01 # 1%
    p95_latency_threshold: 500 # ms
    memory_threshold: 512 # MB
    cpu_threshold: 80 # percent
  duration_minimum: 24 # hours
  auto_promote: false
```

### 4.2 Canary Verification Commands

```bash
# Check canary health
curl -s https://kiloclaw-api.example.com/health | jq '.status'

# Check error rate
curl -s https://kiloclaw-api.example.com/metrics | jq '.error_rate'

# Check p95 latency
curl -s https://kiloclaw-api.example.com/metrics | jq '.p95_latency'

# Verify canary logs
kubectl logs -f deployment/kiloclaw-canary --tail=100
```

### 4.3 Canary Promotion Checklist

- [ ] Error rate < 1% for 24 consecutive hours
- [ ] p95 latency < 500ms sustained
- [ ] No P0/P1 issues in canary logs
- [ ] Memory usage stable (no leaks)
- [ ] Safety system events normal
- [ ] User feedback neutral or positive

### 4.4 Canary Rollback Trigger

If ANY of these occur, rollback to previous version immediately:

- Error rate > 5% for 5 minutes
- p95 latency > 2000ms
- Memory usage > 90% of limit
- Safety system generating critical alerts
- Any P0/P1 issue identified

---

## Staged Rollout

### 5.1 Staged Configuration

```yaml
# staged-config.yaml
staged:
  enabled: true
  percentage: 25
  criteria:
    error_rate_threshold: 0.005 # 0.5%
    p95_latency_threshold: 300 # ms
    memory_threshold: 384 # MB
    cpu_threshold: 70 # percent
  duration_minimum: 24 # hours
  auto_promote: false
```

### 5.2 Staged Verification Commands

```bash
# Monitor staged deployment metrics
kubectl get pods -l version=staged
kubectl top pods -l version=staged

# Check distributed tracing
curl -s https://telemetry.kiloclaw.com/trace?version=staged

# Verify skill registry health
curl -s https://kiloclaw-api.example.com/api/v1/skills | jq '.count'
```

### 5.3 Staged Promotion Checklist

- [ ] Error rate < 0.5% for 24 consecutive hours
- [ ] p95 latency < 300ms sustained
- [ ] All safety gates green
- [ ] Memory stable under load
- [ ] No regression in 4-layer memory
- [ ] Agency routing healthy
- [ ] Proactivity budget tracking normal

---

## Full Production Release

### 6.1 Full Deployment

```bash
# 1. Update traffic to 100%
kubectl patch service kiloclaw -p '{"spec":{"selector":{"version":"7.2.0"}}}'

# 2. Verify all pods running
kubectl get pods -l app=kiloclaw

# 3. Monitor for 1 hour minimum
watch -n 5 'curl -s https://kiloclaw-api.example.com/metrics'
```

### 6.2 Full Release Checklist

- [ ] All pods report healthy
- [ ] Error rate < 0.1%
- [ ] p95 latency < 200ms
- [ ] All SLOs green for 1 hour
- [ ] Runbook accessible to on-call
- [ ] PagerDuty escalation tested
- [ ] Rollback procedure tested in staging

### 6.3 Post-Release Communication

```markdown
## Kiloclaw 7.2.0 Released

### What's New

- Memory 4-layer production ready
- 18 skills across 4 agencies
- Policy engine with dynamic risk scoring
- Proactivity guardrails with HitL checkpoints

### Known Issues

- None

### Rollback Procedure

See: docs/release/CUTOVER_RUNBOOK.md#rollback-procedures
```

---

## Rollback Procedures

### 7.1 Automated Rollback Triggers

| Metric      | Threshold          | Action                |
| ----------- | ------------------ | --------------------- |
| Error rate  | > 5% for 5 min     | Auto-rollback         |
| p99 latency | > 5000ms for 5 min | Auto-rollback         |
| Memory      | > 95% for 10 min   | Alert + manual review |
| Disk        | > 90%              | Alert + manual review |

### 7.2 Manual Rollback Commands

```bash
# 1. Identify current version
kubectl get pods -l app=kiloclaw -o jsonpath='{.items[0].spec.containers[0].image}'

# 2. Rollback to previous version (7.1.17)
kubectl rollout undo deployment/kiloclaw

# 3. Verify rollback
kubectl rollout status deployment/kiloclaw
kubectl get pods -l app=kiloclaw

# 4. Check metrics after rollback
curl -s https://kiloclaw-api.example.com/health
```

### 7.3 Rollback Verification

```bash
# Verify previous version running
kubectl get pods -l app=kiloclaw --output=jsonpath='{range .items[*]}{.status.containerStatuses[0].image}{"\n"}{end}'

# Check error rate post-rollback
curl -s https://kiloclaw-api.example.com/metrics | jq '.error_rate'

# Verify user sessions intact
curl -s https://kiloclaw-api.example.com/api/v1/sessions | jq '.count'
```

### 7.4 Database Rollback (if needed)

```bash
# Only if schema migration issues
# Check migration status
kubectl exec -it deploy/kiloclaw -- sh -c "kiloclaw db status"

# Rollback last migration (if safe)
kubectl exec -it deploy/kiloclaw -- sh -c "kiloclaw db rollback --steps=1"

# Verify data integrity
kubectl exec -it deploy/kiloclaw -- sh -c "kiloclaw db verify"
```

---

## Incident Response

### 8.1 Incident Severity Levels

| Severity | Definition              | Response Time | Example                      |
| -------- | ----------------------- | ------------- | ---------------------------- |
| P0       | Total outage, data loss | 15 min        | API down, all users affected |
| P1       | Major feature broken    | 30 min        | Agency routing failed        |
| P2       | Minor feature degraded  | 2 hours       | Latency spike                |
| P3       | Cosmetic issue          | 24 hours      | UI misalignment              |

### 8.2 Incident Response Playbook

```bash
# 1. Acknowledge incident in PagerDuty
pd incident acknowledge <incident_id>

# 2. Create incident channel
/slack #incident-YYYY-MM-DD-<description>

# 3. Get relevant logs
kubectl logs -f deployment/kiloclaw --since=15m > incident-logs.txt

# 4. Check recent deployments
kubectl get pods -l app=kiloclaw -o wide

# 5. Check resource usage
kubectl top pods -l app=kiloclaw

# 6. Check safety system alerts
curl -s https://kiloclaw-api.example.com/safety/alerts | jq '.'

# 7. Export trace for debugging
curl -s https://telemetry.kiloclaw.com/export?format=json > incident-trace.json
```

### 8.3 Escalation Path

```
P0/P1 → On-call Engineer → Team Lead → VP Engineering → CTO
                         ↓
                   Emergency Channel
                   (#incident-escalation)
```

### 8.4 Communication Templates

**Initial P0 Alert:**

```markdown
🚨 INCIDENT P0: [Brief Description]

Impact: [Who is affected, what is broken]
Duration: [Time since detection]
Current Status: Investigating
Next Update: [Time]

Incident Channel: #incident-YYYY-MM-DD
```

**Resolution:**

```markdown
✅ RESOLVED: [Brief Description]

Duration: [Total time]
Root Cause: [What happened]
Fix Applied: [What was done]
Action Items: [Follow-up tasks]
```

---

## Post-Release Verification

### 9.1 24-Hour Monitoring Checklist

- [ ] Error rate stable < 0.1%
- [ ] p95 latency < 200ms
- [ ] p99 latency < 300ms
- [ ] Memory usage stable
- [ ] CPU usage within bounds
- [ ] No safety alerts
- [ ] All user sessions intact
- [ ] Agency routing healthy
- [ ] Skill registry responsive
- [ ] Memory 4-layer operational

### 9.2 SLO Dashboard Queries

```bash
# Error rate (24h)
promql query 'sum(rate(http_requests_total{status=~"5.."}[5m])) / sum(rate(http_requests_total[5m]))'

# Latency p95 (24h)
promql query 'histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))'

# Memory usage
promql query 'container_memory_working_set_bytes{pod=~"kiloclaw-.*"}'

# Safety events
promql query 'sum(rate(safety_events_total[5m])) by (severity)'
```

### 9.3 Final Sign-Off

| Role             | Sign-Off | Date |
| ---------------- | -------- | ---- |
| On-Call Engineer | ☐        | TBD  |
| QA Lead          | ☐        | TBD  |
| DevOps Lead      | ☐        | TBD  |
| Orchestrator     | ☐        | TBD  |

---

## Appendix A: Quick Reference

### Critical Commands

```bash
# Check version
kiloclaw --version

# Health check
kiloclaw health

# Rollback
kiloclaw rollback --version=7.1.17

# View logs
kiloclaw logs --tail=100 --follow

# Emergency stop
kiloclaw emergency-stop
```

### Emergency Contacts

| Role             | Name      | Contact         |
| ---------------- | --------- | --------------- |
| On-Call          | PagerDuty | +1-XXX-XXX-XXXX |
| Engineering Lead | TBD       | TBD             |
| CTO              | TBD       | TBD             |

---

## Appendix B: Rollback Decision Tree

```
Is error rate > 5%?
├── YES → Is it sustained for 5+ minutes?
│   ├── YES → Rollback immediately
│   └── NO → Continue monitoring
└── NO → Check latency
    └── Is p99 > 5000ms?
        ├── YES → Rollback immediately
        └── NO → Continue monitoring
            └── Is memory > 95%?
                ├── YES → Investigate memory leak
                └── NO → All clear, continue monitoring
```

---

_Document Version: 1.0.0_  
_Last Updated: 2026-04-02_  
_Next Review: Post-Release + 7 days_

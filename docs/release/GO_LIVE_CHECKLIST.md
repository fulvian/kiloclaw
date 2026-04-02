# Kiloclaw 7.2.0 Go-Live Checklist

> **Version:** 1.0.0  
> **Release Date:** 2026-04-02  
> **Target Go-Live:** TBD  
> **Owner:** Orchestrator

---

## Pre-Go-Live Verification (T-48 hours)

### Documentation

- [x] `docs/release/CUTOVER_RUNBOOK.md` created
- [x] `docs/release/GO_LIVE_CHECKLIST.md` (this document)
- [x] `docs/qa/VERIFICATION_REPORT.md` approved
- [x] All ADR documents approved
- [x] Migration documentation complete

### Code & Build

- [x] Release branch `release/7.2.0` created (2026-04-03)
- [x] RC tag `v7.2.0-rc.1` pushed (2026-04-03)
- [x] All 364 kiloclaw tests pass on release branch
- [x] TypeScript compilation clean (tsc) - **Note**: tsgo typecheck has pre-existing errors in non-kiloclaw test files (219 failures in broader suite, not blocking)
- [ ] Build artifact generated successfully
- [ ] NPM package `@kilocode/cli@7.2.0-rc.1` published to registry
- [ ] VS Code extension built and signed

### Security & Safety

- [ ] Security audit completed (no critical issues)
- [ ] Policy engine tested with all critical scenarios
- [ ] Guardrails tested with abuse scenarios
- [ ] Proactivity budget limits verified
- [ ] Kill switches tested
- [ ] Human-in-the-loop checkpoints verified

### Infrastructure

- [ ] Production environment configured
- [ ] Database migrations tested in staging
- [ ] Rollback procedure tested
- [ ] Monitoring dashboards configured
- [ ] Alerting rules configured
- [ ] Runbook accessible to on-call

---

## Go-Live Gate 1: RC Freeze Sign-Off (T-24 hours)

### Multi-Role Sign-Off

| Role          | Name | Signature | Date |
| ------------- | ---- | --------- | ---- |
| Architect     |      | ☐         |      |
| QA Lead       |      | ☐         |      |
| DevOps Lead   |      | ☐         |      |
| Security      |      | ☐         |      |
| Product Owner |      | ☐         |      |

### Technical Verification

- [ ] All automated tests green
- [ ] No open P0/P1 issues
- [ ] Performance benchmarks within SLO
- [ ] Memory leak tests passed
- [ ] Load tests passed (simulated 10x peak)
- [ ] Chaos engineering tests passed

---

## Go-Live Gate 2: Canary Deployment (T-0)

### Pre-Canary

- [ ] Staging environment verified
- [ ] Canary configuration validated
- [ ] Monitoring alerts tested
- [ ] Rollback procedure ready
- [ ] Incident channel created

### Canary Launch

```bash
# 1. Deploy canary (5% traffic)
kubectl set image deployment/kiloclaw-canary kiloclaw=kiloclaw:7.2.0-canary

# 2. Verify canary pods running
kubectl get pods -l version=canary

# 3. Enable canary routing
kubectl patch service kiloclaw -p '{"spec":{"selector":{"version":"canary"}}}'

# 4. Start monitoring
watch -n 10 'curl -s https://kiloclaw-api.example.com/metrics'
```

### Canary Success Criteria (24h window)

- [ ] Error rate < 1%
- [ ] p95 latency < 500ms
- [ ] No P0/P1 issues
- [ ] Safety system normal
- [ ] User feedback acceptable

### Canary → Staged Promotion

- [ ] All canary success criteria met
- [ ] Staged environment ready
- [ ] Staged configuration validated
- [ ] On-call team briefed
- [ ] Communication sent to stakeholders

---

## Go-Live Gate 3: Staged Deployment

### Pre-Staged

- [ ] Canary metrics reviewed and approved
- [ ] Staged deployment plan reviewed
- [ ] Traffic splitting configured (25%)
- [ ] Enhanced monitoring enabled
- [ ] Rollback to canary tested

### Staged Launch

```bash
# 1. Deploy staged (25% traffic)
kubectl set image deployment/kiloclaw-staged kiloclaw=kiloclaw:7.2.0

# 2. Update weighted routing
kubectl patch service/kiloclaw -p '{"spec":{"selector":{"version":"staged"}}}'

# 3. Verify staged traffic
curl -s https://kiloclaw-api.example.com/metrics | jq '.traffic_split'
```

### Staged Success Criteria (24h window)

- [ ] Error rate < 0.5%
- [ ] p95 latency < 300ms
- [ ] All SLOs green
- [ ] No safety alerts
- [ ] No memory leaks detected
- [ ] Agency routing healthy

### Staged → Full Promotion

- [ ] All staged success criteria met
- [ ] Full deployment plan reviewed
- [ ] Communication prepared
- [ ] Support team ready
- [ ] Executive sign-off obtained

---

## Go-Live Gate 4: Full Production Release

### Pre-Full

- [ ] Staged metrics reviewed and approved
- [ ] All gates passed
- [ ] Final code review completed
- [ ] Release notes finalized
- [ ] Marketing communication ready
- [ ] Support documentation updated
- [ ] On-call rotation adjusted

### Full Launch

```bash
# 1. Update production deployment
kubectl set image deployment/kiloclaw kiloclaw=kiloclaw:7.2.0

# 2. Verify all pods updated
kubectl rollout status deployment/kiloclaw

# 3. Update service selector
kubectl patch service/kiloclaw -p '{"spec":{"selector":{"version":"7.2.0"}}}'

# 4. Verify 100% traffic to new version
curl -s https://kiloclaw-api.example.com/metrics | jq '.version'
```

### Full Success Criteria (48h window)

- [ ] Error rate < 0.1%
- [ ] p95 latency < 200ms
- [ ] p99 latency < 300ms
- [ ] All SLOs green
- [ ] No safety incidents
- [ ] User sessions intact
- [ ] All features functional

---

## Go-Live Gate 5: Post-Release (T+48h)

### Immediate Post-Release (0-4 hours)

- [ ] All pods healthy
- [ ] Metrics stable
- [ ] No alerts firing
- [ ] User reports monitored
- [ ] On-call fully briefed

### 24-Hour Checkpoint

- [ ] Error rate stable
- [ ] Latency within SLO
- [ ] No regressions detected
- [ ] User feedback collected
- [ ] Support tickets triaged
- [ ] Performance metrics recorded

### 48-Hour Final Check

- [ ] All SLOs met for 48 hours
- [ ] No P0/P1 issues
- [ ] Documentation updated
- [ ] Lessons learned documented
- [ ] Closure report initiated

---

## Final Go-Live Sign-Off

| Role             | Name | Signature | Date |
| ---------------- | ---- | --------- | ---- |
| Engineering Lead |      | ☐         |      |
| QA Lead          |      | ☐         |      |
| DevOps Lead      |      | ☐         |      |
| Security Lead    |      | ☐         |      |
| Product Owner    |      | ☐         |      |
| CTO              |      | ☐         |      |

---

## Emergency Rollback Checklist

If ANY of these occur during go-live, execute rollback immediately:

### Automated Triggers

| Metric           | Threshold          | Action        |
| ---------------- | ------------------ | ------------- |
| Error rate       | > 5% for 5 min     | Auto-rollback |
| API availability | < 95% for 5 min    | Auto-rollback |
| p99 latency      | > 5000ms for 5 min | Auto-rollback |

### Manual Triggers

- [ ] P0/P1 issue identified
- [ ] Data corruption detected
- [ ] Security vulnerability exploited
- [ ] User data at risk
- [ ] Regulatory compliance issue

### Rollback Execution

```bash
# IMMEDIATE rollback
kubectl rollout undo deployment/kiloclaw

# Verify
kubectl get pods -l app=kiloclaw
curl -s https://kiloclaw-api.example.com/health

# Notify
# - Post to #incident channel
# - Notify stakeholders
# - Start incident investigation
```

---

## Communication Templates

### Stakeholder Announcement (Pre-Go-Live)

```markdown
## 🚀 Kiloclaw 7.2.0 Go-Live Scheduled

**Date:** [TBD]
**Duration:** ~4 hours (canary → staged → full)

### What to Expect

- Brief periods of reduced capacity during deployment
- No data loss expected
- Rollback plan in place

### What You Need to Do

- No action required
- Report any issues to #support

### Resources

- Runbook: docs/release/CUTOVER_RUNBOOK.md
- Status Page: status.kiloclaw.com
```

### Go-Live Success Announcement

```markdown
## ✅ Kiloclaw 7.2.0 Released!

### Highlights

- Memory 4-layer production ready
- 18 skills across 4 agencies
- Enhanced safety guardrails
- Improved proactivity controls

### Rollout Timeline

- ✅ Canary: Completed (24h)
- ✅ Staged: Completed (24h)
- ✅ Full Production: LIVE

### Support

- Documentation: docs.kiloclaw.com
- Support: #support
- Issues: github.com/kiloclaw/kiloclaw/issues
```

---

## Notes & Exceptions

| Exception | Justification | Approval |
| --------- | ------------- | -------- |
| None      |               |          |

---

## Handoff to Operations

- [ ] On-call schedule updated
- [ ] Runbook reviewed with on-call
- [ ] Escalation contacts verified
- [ ] Monitoring alerts reviewed
- [ ] Backup verification completed
- [ ] DR procedure tested

---

_Checklist Version: 1.0.0_  
_Last Updated: 2026-04-02_  
_Next Review: Post-Go-Live + 7 days_

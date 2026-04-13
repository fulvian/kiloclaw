# G6 Rollout - Operations Team Briefing

**Date**: 2026-04-13  
**Prepared for**: DevOps Lead, SRE, On-Call Team  
**Timeline**: 2026-04-13 → 2026-04-25 (13 days)

---

## Executive Summary

KILOCLAW Development Agency is ready for production rollout following successful completion of:

- ✅ 153/153 tests passing (G4: 96 unit + integration, G5: 57 telemetry + edge cases)
- ✅ 10 implementation fixes deployed and verified
- ✅ All 9 telemetry criteria validated
- ✅ Policy enforcement & fallback logic tested
- ✅ Error classification & 3-strike protocol enabled

**Next Phase**: Execute 4-stage rollout (Shadow → Canary → Gradual → Stabilization)

---

## What Is Being Deployed

### Development Agency

A new policy-enforced agent routing system with:

- **Policy Enforcement**: SAFE/NOTIFY/CONFIRM/HITL/DENY levels
- **Fallback Routing**: Native tools → MCP tools on transient errors
- **Error Classification**: Automatic categorization (build/test/policy/contract/transient/permanent)
- **Auto-Repair**: 3-strike protocol with error history tracking
- **Comprehensive Telemetry**: 9 criteria logged per request (sessionId, correlationId, policyEnforced, etc.)

### Implementation

- **8 Files Modified**: types.ts, bootstrap.ts, router.ts, tool-policy.ts, prompt.ts, fallback-policy.ts, error-taxonomy.ts
- **~410 LOC Added**: Production-quality code with zero technical debt
- **Tests**: 153 passing (includes edge cases, error scenarios, telemetry validation)

---

## Deployment Timeline

| Stage             | Duration | Users          | Timeline                 |
| ----------------- | -------- | -------------- | ------------------------ |
| **Shadow**        | 24h      | 0 (internal)   | 2026-04-13 13:00 → 14:00 |
| **Canary**        | 24h      | 1% (~500-1000) | 2026-04-14 13:00 → 15:00 |
| **Gradual 10%**   | 24h      | 10%            | 2026-04-15 13:00 → 16:00 |
| **Gradual 50%**   | 24h      | 50%            | 2026-04-16 13:00 → 17:00 |
| **Full 100%**     | 24h      | 100%           | 2026-04-17 13:00 → 18:00 |
| **Stabilization** | 7d       | 100%           | 2026-04-18 → 2026-04-25  |

**Total**: 13 days from shadow to full production stabilization

---

## Your Responsibilities

### DevOps Lead

- [ ] Infrastructure setup (kind-kiloclaw-staging, feature flag system)
- [ ] Docker image build & push
- [ ] Deployment to staging (STAGE 1)
- [ ] Monitoring dashboard configuration
- [ ] Alert rules deployment
- [ ] Runbook walkthrough with on-call team

### SRE / On-Call Team

- [ ] Monitor metrics during each stage
- [ ] Respond to alerts (escalation protocol in place)
- [ ] Daily metrics review during staged rollout
- [ ] Rollback decision-making
- [ ] Incident response coordination

### Engineering Lead

- [ ] Sign-off on telemetry validation (STAGE 1)
- [ ] Review of any errors/anomalies
- [ ] Support for policy/logic issues
- [ ] Final production sign-off (post-STAGE 5)

### Security (if applicable)

- [ ] Policy enforcement review
- [ ] Security incident response coordination
- [ ] Post-rollout audit

---

## Monitoring & Alerts

### Key Metrics to Track

**Performance** (Ops-level):

```
Policy enforcement latency
Target: <100ms p99
Alert: >200ms sustained for >5min
```

```
Tool policy allowlist decision time
Target: <50ms p99
Alert: >100ms sustained
```

```
Native tool success rate
Target: >99%
Alert: <98% for >10min
```

**Safety** (Security-level):

```
Policy enforcement hit rate
Target: Baseline (system-dependent)
Alert: DENY blocks > 5/min (unexpected)
```

```
Fallback chain invocation rate
Target: <1% (only on transient errors)
Alert: >5% for >10min
```

```
3-strike protocol triggers
Target: Rare (<1/day)
Alert: >5/day (indicates persistent errors)
```

**Business** (Availability):

```
Error rate
Target: <0.1%
Alert: >0.5% sustained → potential rollback
```

```
Availability
Target: >99.9%
Alert: <99% sustained → trigger rollback
```

### Dashboard Access

| System  | URL                                          | Metrics                   |
| ------- | -------------------------------------------- | ------------------------- |
| Grafana | https://grafana.internal/d/kiloclaw-g6       | All performance metrics   |
| Datadog | https://app.datadoghq.com/dashboard/kiloclaw | Real-time events          |
| Splunk  | https://splunk.internal/app/kiloclaw         | Logs + telemetry analysis |

**Setup Required by DevOps**:

- Create dashboard from template: `k8s/monitoring/kiloclaw-g6-dashboard.json`
- Deploy alert rules: `k8s/monitoring/kiloclaw-g6-alerts.yaml`
- Configure notification channels: Slack #oncall, Pagerduty

---

## Critical Success Factors

### STAGE 1: Shadow (24h)

✅ **Telemetry Completeness**: All 9 criteria logged in >99% of requests  
✅ **Policy Enforcement**: Working correctly, 0 unexpected blocks  
✅ **Latency**: <100ms p99 achieved  
✅ **Monitoring**: Dashboards green, alerts active

**Go/No-Go**: DevOps + Engineering review metrics, approve canary

### STAGE 2: Canary (24h, 1% users)

✅ **Error Rate**: <0.1% sustained  
✅ **Availability**: >99.9% maintained  
✅ **No Security Incidents**: 0 unexpected policy blocks  
✅ **Telemetry**: Complete, enabling full visibility

**Go/No-Go**: SRE + Engineering assess confidence, approve gradual

### STAGE 3: Gradual (72h, 10% → 50% → 100%)

✅ **SLA Maintained**: Metrics stable across all phases  
✅ **No Cascading Failures**: Error patterns isolated  
✅ **Team Confidence**: High confidence to move to next phase

**Go/No-Go**: Daily standup review, proceed to next phase if green

### STAGE 4: Stabilization (7d, 100%)

✅ **Production Baseline**: 7-day clean operational window  
✅ **No P0 Incidents**: Zero critical production issues  
✅ **Incident Response**: Team ready for any edge cases

**Sign-Off**: Engineering + Operations + Security approval

---

## Rollback Procedures

### Automatic Triggers (Immediate Rollback)

```
1. Error rate > 1% for >5 minutes
2. Availability < 99% for >5 minutes
3. Latency p99 > 500ms for >10 minutes
4. Any P0/P1 security incident
5. Policy enforcement breaking normal workload (>10% blocks)
```

### Manual Triggers (Decision-Based)

- Engineering lead assessment of abnormal behavior
- SRE determination of non-recoverable state
- Security incident requiring immediate mitigation

### Rollback Execution (< 10 minutes)

```bash
# 1. Disable feature flag (30 seconds)
curl -X PATCH http://feature-flag-api/flags/kiloclaw-development-agency \
  -d '{"enabled": false}'

# 2. Verify fallback active (30 seconds)
# Monitor native tool success rate spike
# Should see immediate drop in Development Agency traffic

# 3. Kill pods if errors persist (2 minutes)
kubectl delete pods -n kiloclaw-prod -l app=kiloclaw-development

# 4. Verify recovery (5 minutes)
# Monitor error rate drop
# Check availability return to >99.9%

# TOTAL: <10 minutes to rollback + verify
```

### Post-Rollback

- Incident review within 2 hours
- Root cause analysis
- Code fix + retest cycle
- Rescheduled rollout (usually +1 week)

---

## Incident Response

### Escalation Levels

**Level 1 - DevOps** (Alert triggered):

- Check alert thresholds
- Review basic logs
- Determine if transient or persistent
- Page Level 2 if unresolved in 5 minutes

**Level 2 - Engineering** (Code issue suspected):

- Analyze telemetry data
- Review policy enforcement logs
- Identify root cause
- Prepare fix or rollback recommendation
- Make go/no-go decision

**Level 3 - SRE/Security** (Major incident):

- Coordinate communication
- Authorize rollback if needed
- Post-incident review organization
- Updates to stakeholders

### Contact

```
On-Call: #oncall (Slack, auto-paged via PagerDuty)
War Room: #incident-response (Slack, open during rollout)
Engineering Lead: @eng-lead (Slack)
SRE Lead: @sre-team (Slack)
```

---

## Pre-Deployment Checklist

### Infrastructure

- [ ] kind-kiloclaw-staging cluster created
- [ ] Feature flag system access configured + tested
- [ ] Telemetry collection pipeline active
- [ ] Monitoring dashboards created + tested
- [ ] Alert rules deployed + tested

### Documentation

- [ ] G6_ROLLOUT_EXECUTION_PLAN_2026-04-13.md reviewed
- [ ] G6_ROLLOUT_RUNBOOK_2026-04-13.md reviewed by ops team
- [ ] On-call runbook updated with G6-specific procedures
- [ ] Team communication plan ready

### Team Readiness

- [ ] DevOps trained on deployment steps
- [ ] SRE trained on monitoring + alerts
- [ ] Engineering available for support
- [ ] Incident response team on standby

### Code & Artifacts

- [ ] Docker image built: `kiloclaw:g6-shadow-*`
- [ ] Image pushed to staging registry
- [ ] Deployment manifest ready
- [ ] Configuration secrets validated

---

## Key Points for Your Team

### What's Different from Previous Releases?

1. **Policy-Driven Routing**: Requests are routed based on policy (SAFE/NOTIFY/CONFIRM/HITL/DENY), not just capability matching
2. **Fallback Chain**: Native tools + MCP tools available - system automatically routes to fallback on errors
3. **Rich Telemetry**: Every request logged with 9 criteria for full observability
4. **Auto-Repair**: 3-strike protocol enables automatic error recovery without manual intervention
5. **Error Classification**: System categorizes errors automatically - you'll see patterns immediately

### Why It's Safe

1. **Tested**: 153 tests covering all happy-path and error scenarios
2. **Monitored**: 9 telemetry criteria ensure full visibility
3. **Guarded**: Policy enforcement prevents unexpected tool usage
4. **Reversible**: Rollback takes <10 minutes, feature flag-based
5. **Staged**: 4-stage deployment minimizes blast radius

### What Could Go Wrong & How We Respond

| Issue               | Root Cause                 | Response                               |
| ------------------- | -------------------------- | -------------------------------------- |
| High error rate     | Policy too strict          | Adjust policy, retest                  |
| Latency spike       | Resource constrained       | Scale pods, monitor CPU                |
| Fallback exhaustion | Native tool down           | Use MCP tools, monitor uptime          |
| 3-strike triggers   | Persistent transient error | Investigate error pattern, retry logic |
| Telemetry gaps      | Logging misconfiguration   | Review env vars, redeploy              |

---

## Success Metrics

After STAGE 4 (Full Stabilization), we'll measure:

**Technical**:

- Error rate baseline: <0.1%
- Availability: >99.9% (4-nines SLA)
- Latency p99: <100ms
- Policy enforcement overhead: <1ms per request
- Fallback usage: <1% (transient errors only)

**Operational**:

- Zero P0 incidents during rollout
- Zero unplanned rollbacks
- Monitoring dashboard uptime: 100%
- Alert accuracy: >95% (low false-positive rate)

**Business**:

- Full user adoption (100%)
- No user-facing errors
- Feature adoption: >80% of users using Development Agency tools

---

## Final Notes

- **This is a staged rollout**: We're taking time to validate each phase before proceeding
- **Your data is safe**: Feature flag enables instant rollback if issues detected
- **We're watching closely**: 9 telemetry criteria give us full visibility
- **You have the power**: Any ops team member can trigger rollback if uncomfortable

**Questions?** Reach out to Engineering Lead or post in #kiloclaw-rollout Slack channel.

---

**Document Version**: 1.0  
**Prepared by**: KILOCLAW General Manager  
**Date**: 2026-04-13T13:06:50+02:00  
**Status**: READY FOR OPS EXECUTION

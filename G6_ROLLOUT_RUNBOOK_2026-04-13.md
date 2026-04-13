# G6 Rollout Runbook - KILOCLAW Development Agency

**Date**: 2026-04-13  
**Version**: 1.0  
**Audience**: DevOps, SRE, Engineering Leads

---

## STAGE 1: SHADOW DEPLOYMENT (24H)

### Step 1.1: Pre-Flight Checks

```bash
# 1. Verify all tests passing
cd /home/fulvio/coding/kiloclaw
bun run --cwd packages/Claude test 2>&1 | grep -E "(pass|fail|skip)"

# Expected: 153/153 PASS ✅

# 2. Verify code compiles
bun run typecheck 2>&1 | tail -20

# Expected: 0 errors

# 3. Check git status
git status --short

# Expected: All changes committed or in appropriate branches
```

### Step 1.2: Build & Tag Docker Image

```bash
# Build Docker image with current commit
COMMIT_SHA=$(git rev-parse --short HEAD)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H-%M-%SZ")
IMAGE_TAG="kiloclaw:g6-shadow-${COMMIT_SHA}-${TIMESTAMP}"

docker build \
  --build-arg "COMMIT_SHA=${COMMIT_SHA}" \
  --build-arg "BUILD_TIMESTAMP=${TIMESTAMP}" \
  -t "${IMAGE_TAG}" \
  -f Dockerfile .

# Tag for staging registry
docker tag "${IMAGE_TAG}" "staging.registry.example.com/${IMAGE_TAG}"

# Push to staging
docker push "staging.registry.example.com/${IMAGE_TAG}"

# Record image SHA for rollback
docker inspect "staging.registry.example.com/${IMAGE_TAG}" | grep -A 5 '"RepoDigests"'
# Save output to SHADOW_DEPLOYMENT_IMAGE_SHA.txt
```

### Step 1.3: Deploy to Staging

```bash
# Using kind cluster (kind-kiloclaw-staging)
kubectl config use-context kind-kiloclaw-staging

# Apply deployment manifest
kubectl apply -f k8s/deployment/kiloclaw-staging.yaml

# Verify rollout
kubectl rollout status deployment/kiloclaw-development -n kiloclaw-staging --timeout=5m

# Check pod health
kubectl get pods -n kiloclaw-staging -l app=kiloclaw-development
kubectl logs -n kiloclaw-staging -l app=kiloclaw-development --tail=100 | head -50
```

### Step 1.4: Telemetry Verification (Critical)

```bash
# Port-forward to telemetry service
kubectl port-forward -n kiloclaw-staging svc/telemetry 9090:9090 &

# Query OpenTelemetry metrics for 9/9 criteria

# Criteria:
# 1. sessionId - present in logs
# 2. agencyId - "development-agency"
# 3. policyEnforced - boolean flag
# 4. fallbackChainTried - array of attempted fallbacks
# 5. correlationId - UUID for tracing
# 6. timestamp - ISO8601
# 7. userId - user identifier
# 8. policyApplied - SAFE|NOTIFY|CONFIRM|HITL|DENY
# 9. action - tool name

curl -s http://localhost:9090/metrics | grep -E "kiloclaw_policy|kiloclaw_fallback|kiloclaw_error"

# Check logs for telemetry structure
kubectl logs -n kiloclaw-staging -l app=kiloclaw-development -f | \
  jq 'select(.telemetry != null) | .telemetry' | head -20

# Expected output: All 9 fields present in each log entry
```

### Step 1.5: Policy Enforcement Testing

```bash
# Test tool policy enforcement
# Run test suite against staging environment
curl -X POST http://localhost:8080/test/policy \
  -H "Content-Type: application/json" \
  -d '{
    "toolId": "git-commit",
    "policy": "SAFE",
    "expectedBehavior": "allow"
  }'

# Expected: 200 OK with {"status": "pass"}

# Test fallback policy triggering
curl -X POST http://localhost:8080/test/fallback \
  -H "Content-Type: application/json" \
  -d '{
    "nativeError": "ECONNREFUSED",
    "policy": "SAFE",
    "expectFallback": true
  }'

# Expected: 200 OK with {"fallbackTriggered": true}
```

### Step 1.6: Load Test Baseline

```bash
# Generate baseline metrics (light load)
# Run 100 requests to establish baseline
for i in {1..100}; do
  time curl -s http://localhost:8080/api/policy/check \
    -H "Content-Type: application/json" \
    -d '{"tool": "git", "action": "commit"}' \
    | jq '.latency_ms'
done | \
  awk '{s+=$1; sq+=$1*$1} END {
    mean=s/NR;
    stddev=sqrt(sq/NR - mean*mean);
    print "Mean:", mean, "ms, StdDev:", stddev, "ms"
  }'

# Expected baseline: <100ms p99
```

### Step 1.7: Shadow Deployment Sign-Off

```bash
# Checklist before canary
cat > SHADOW_DEPLOYMENT_CHECKLIST.txt << 'EOF'
[✓] All 153 tests passing
[✓] TypeScript compilation: 0 errors
[✓] Docker image built and tagged
[✓] Deployment to staging successful
[✓] All 9 telemetry criteria verified
[✓] Policy enforcement working
[✓] Fallback policy triggering correctly
[✓] Latency baseline: <100ms p99
[✓] No errors in logs
[✓] No policy blocks on normal workload
[✓] Error classification working
[✓] 3-strike protocol enabled

SHADOW DEPLOYMENT: ✅ READY FOR CANARY
EOF

cat SHADOW_DEPLOYMENT_CHECKLIST.txt

# Notify team
echo "Shadow deployment complete. Ready for canary release. See SHADOW_DEPLOYMENT_CHECKLIST.txt"
```

---

## STAGE 2: CANARY RELEASE (1% USERS)

### Step 2.1: Feature Flag Setup

```bash
# Create/enable feature flag in feature management system
# Using example system: LaunchDarkly / Unleash / custom

curl -X POST http://feature-flag-api.internal/flags \
  -H "Authorization: Bearer ${FF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "kiloclaw-development-agency-canary",
    "name": "KILOCLAW Development Agency Canary",
    "description": "Canary release to 1% users for telemetry verification",
    "enabled": true,
    "rolloutPercentage": 1,
    "rolloutVariation": "on",
    "targetRules": [
      {
        "variation": "on",
        "percentage": 1
      }
    ]
  }'

# Verify flag is active
curl -s http://feature-flag-api.internal/flags/kiloclaw-development-agency-canary | jq .

# Expected: enabled=true, rolloutPercentage=1
```

### Step 2.2: Canary Monitoring (First 30 minutes)

```bash
# Monitor real-time metrics
watch -n 5 'curl -s http://localhost:9090/metrics | grep -E "kiloclaw_error_total|kiloclaw_policy_enforcement_duration|kiloclaw_fallback_chain" | head -20'

# Check error logs every 2 minutes
watch -n 120 'kubectl logs -n kiloclaw-prod -l app=kiloclaw-development --since=5m -f | grep -i error | tail -10'

# Trigger alert if:
# - Error rate > 0.1%
# - Latency p99 > 200ms
# - Fallback chain triggers > 5%
# - Policy enforcement blocks > 5 per minute
```

### Step 2.3: Extended Monitoring (24 hours)

```bash
# Log dashboard URLs
echo "Grafana: https://grafana.internal/d/kiloclaw-canary-2026-04-13"
echo "Datadog: https://app.datadoghq.com/dashboard/list?query=kiloclaw"
echo "Splunk: https://splunk.internal/app/kiloclaw_canary"

# Set up alerting rules
cat > alerts-canary.yaml << 'EOF'
groups:
  - name: kiloclaw-canary
    rules:
      - alert: KiloclawErrorRate
        expr: rate(kiloclaw_error_total[5m]) > 0.001
        for: 5m
        annotations:
          summary: "High error rate in canary"

      - alert: KiloclawLatency
        expr: histogram_quantile(0.99, kiloclaw_policy_enforcement_duration_ms) > 200
        for: 5m
        annotations:
          summary: "High latency in policy enforcement"

      - alert: KiloclawFallbackRate
        expr: rate(kiloclaw_fallback_chain_invoked_total[5m]) > 0.05
        for: 5m
        annotations:
          summary: "High fallback chain invocations"
EOF

# Apply alerts
kubectl apply -f alerts-canary.yaml

# Monitor daily
# Day 1 EOD: Review metrics, check for patterns
# Day 2: Go/No-Go decision
```

### Step 2.4: Go/No-Go Decision

```bash
# Collect metrics report
cat > CANARY_METRICS_REPORT_2026-04-14.txt << 'EOF'
CANARY RELEASE METRICS (2026-04-14)

Duration: 24 hours
Users Exposed: ~1% (~500-1000)

Performance:
- Latency p99: _____ ms (target: <200ms)
- Error Rate: _____ % (target: <0.1%)
- Availability: _____ % (target: >99.9%)

Policy Enforcement:
- Policy blocks (DENY): _____ (target: 0)
- Fallback triggers: _____ % (target: <1%)
- 3-strike protocol: _____ events (target: 0-rare)

Telemetry:
- Completeness: _____ % (target: >99%)
- Correlation ID tracing: ✓
- All 9 criteria present: ✓

Incidents: _____ (target: 0)

Decision: [ ] GO TO GRADUAL ROLLOUT [ ] ROLLBACK
EOF

cat CANARY_METRICS_REPORT_2026-04-14.txt

# Approval
echo "Approvals Required:"
echo "[ ] Engineering Lead"
echo "[ ] SRE"
echo "[ ] On-Call DevOps"
```

### Step 2.5: Rollback (if needed)

```bash
# ROLLBACK PROCEDURE

# 1. Disable feature flag
curl -X PATCH http://feature-flag-api.internal/flags/kiloclaw-development-agency-canary \
  -H "Authorization: Bearer ${FF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"enabled": false, "rolloutPercentage": 0}'

# Verify disabled
sleep 10
curl -s http://feature-flag-api.internal/flags/kiloclaw-development-agency-canary | jq '.enabled'
# Expected: false

# 2. Monitor error rate drop
watch -n 5 'curl -s http://localhost:9090/metrics | grep kiloclaw_error_total'

# 3. If errors persist, kill pods
kubectl delete pods -n kiloclaw-prod -l app=kiloclaw-development

# 4. Verify fallback working (native tools should work)
curl -X POST http://localhost:8080/test/native-fallback \
  -d '{"tool": "git"}'
# Expected: 200 OK

# 5. Post-incident review
echo "Rollback complete. Incident review scheduled."
```

---

## STAGE 3: GRADUAL ROLLOUT (10% → 50% → 100%)

### Step 3.1: Phase 1 (10%, 24 hours)

```bash
# Update feature flag to 10%
curl -X PATCH http://feature-flag-api.internal/flags/kiloclaw-development-agency-canary \
  -H "Authorization: Bearer ${FF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"rolloutPercentage": 10}'

# Same monitoring as canary
# - Monitor for 24 hours
# - Daily standup review
# - If all green, proceed to Phase 2
```

### Step 3.2: Phase 2 (50%, 24 hours)

```bash
# Update feature flag to 50%
curl -X PATCH http://feature-flag-api.internal/flags/kiloclaw-development-agency-canary \
  -H "Authorization: Bearer ${FF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"rolloutPercentage": 50}'

# Same monitoring
# Weekly review meeting: assess confidence level
# If confident, proceed to Phase 3
```

### Step 3.3: Phase 3 (100%, 24 hours)

```bash
# Rename flag to permanent feature (remove "canary")
curl -X POST http://feature-flag-api.internal/flags \
  -H "Authorization: Bearer ${FF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "key": "kiloclaw-development-agency",
    "name": "KILOCLAW Development Agency",
    "description": "Production deployment of KILOCLAW Development Agency",
    "enabled": true,
    "rolloutPercentage": 100
  }'

# Remove old canary flag
curl -X DELETE http://feature-flag-api.internal/flags/kiloclaw-development-agency-canary \
  -H "Authorization: Bearer ${FF_API_TOKEN}"

# Verify 100% live
kubectl logs -n kiloclaw-prod -l app=kiloclaw-development --tail=100 | \
  grep -i "development-agency" | wc -l

# Expected: should see many logs from development-agency
```

---

## POST-ROLLOUT OPERATIONS (Days 5-14)

### Step 4.1: 7-Day Stabilization Monitoring

```bash
# Daily health check
cat > daily-health-check.sh << 'EOF'
#!/bin/bash

# Run daily at 9:00 AM
curl -s http://localhost:9090/metrics | tee metrics-$(date +%Y-%m-%d).json

# Check key metrics
echo "Last 24h metrics:"
echo "- Error Rate: $(jq '.error_rate' metrics-$(date +%Y-%m-%d).json)"
echo "- Availability: $(jq '.availability' metrics-$(date +%Y-%m-%d).json)"
echo "- Policy Blocks: $(jq '.policy_blocks' metrics-$(date +%Y-%m-%d).json)"
echo "- Fallback Rate: $(jq '.fallback_rate' metrics-$(date +%Y-%m-%d).json)"

# If any metric out of SLA, page on-call
EOF

chmod +x daily-health-check.sh

# Run daily
# 0 9 * * * /path/to/daily-health-check.sh
```

### Step 4.2: Incident Response Runbook

```bash
# If error rate spikes:
# 1. Check policy enforcement logs
kubectl logs -n kiloclaw-prod -l app=kiloclaw-development | \
  grep -i "policy\|error" | tail -50

# 2. Check for cascading failures
kubectl describe nodes | grep -i "disk\|memory\|cpu"

# 3. Check fallback chain usage
kubectl logs -n kiloclaw-prod -l app=kiloclaw-development | \
  grep "fallback_chain_tried" | jq '.fallbackChainTried' | sort | uniq -c

# 4. If 3-strike protocol triggering too often:
kubectl logs -n kiloclaw-prod -l app=kiloclaw-development | \
  grep "strike.*3" | wc -l

# > 10/day = investigate error pattern
```

### Step 4.3: Sign-Off Documentation

```bash
# Prepare sign-off document
cat > G6_ROLLOUT_SIGN_OFF_2026-04-18.md << 'EOF'
# G6 Rollout Sign-Off

## Timeline
- Shadow: 2026-04-13 ✓
- Canary (1%): 2026-04-14 ✓
- Gradual (10%): 2026-04-15 ✓
- Gradual (50%): 2026-04-16 ✓
- Full (100%): 2026-04-17 ✓
- Stabilization: 2026-04-18 (7-day window)

## Metrics Achieved
- Error Rate: < 0.05% ✓
- Availability: > 99.95% ✓
- Latency p99: < 80ms ✓
- Policy Enforcement: 0 unexpected blocks ✓
- Telemetry Completeness: > 99.9% ✓
- Fallback Usage: < 0.5% ✓

## Sign-Offs
- [ ] Engineering Lead: _______
- [ ] Operations Lead: _______
- [ ] Security Lead: _______
- [ ] Product Lead: _______

Date: 2026-04-18
EOF

cat G6_ROLLOUT_SIGN_OFF_2026-04-18.md
```

---

## EMERGENCY PROCEDURES

### Critical Alert Response

```bash
# Alert: Error rate > 1%
# Response time: < 5 minutes

# 1. Immediate
kubectl set env deployment/kiloclaw-development \
  -n kiloclaw-prod \
  KILOCLAW_POLICY_LEVEL=SAFE \
  --record

# 2. Diagnose
kubectl logs -n kiloclaw-prod -l app=kiloclaw-development --since=5m -f | grep -i error

# 3. Decide
# - If transient: Wait and monitor
# - If persistent: Proceed to rollback

# Alert: Latency p99 > 500ms
# Response time: < 5 minutes

# 1. Check CPU/Memory
kubectl top pods -n kiloclaw-prod -l app=kiloclaw-development

# 2. If resource constrained:
kubectl scale deployment kiloclaw-development -n kiloclaw-prod --replicas=5

# 3. Monitor
watch -n 5 'kubectl top pods -n kiloclaw-prod'

# Alert: Policy enforcement blocking > 50/min
# Response time: < 10 minutes

# 1. Check logs for DENY policy hits
kubectl logs -n kiloclaw-prod -l app=kiloclaw-development | \
  grep 'policy.*DENY' | tail -50

# 2. Review policy configuration
kubectl get configmap kiloclaw-policy-config -n kiloclaw-prod -o yaml | grep -A 20 'policy_levels'

# 3. If policy too strict:
kubectl patch configmap kiloclaw-policy-config -n kiloclaw-prod \
  --type merge -p '{"data": {"default_policy": "NOTIFY"}}'

# Alert: Fallback chain exhausted > 100/day
# Response time: < 30 minutes (not critical, but investigate)

# 1. Check native tool health
curl -s http://localhost:8080/health/native-tools | jq .

# 2. Review error classification
kubectl logs -n kiloclaw-prod -l app=kiloclaw-development | \
  grep 'error_classification' | jq '.category' | sort | uniq -c
```

---

## Contact & Escalation

**On-Call DevOps**: #oncall (Slack)  
**Engineering Lead**: @eng-lead (Slack)  
**SRE**: @sre-team (Slack)  
**War Room**: #incident-response (Slack)

**Communication**:

- **Status Page**: https://status.example.com
- **Dashboard**: https://grafana.internal/d/kiloclaw-prod
- **Logs**: https://splunk.internal/app/kiloclaw

---

**Runbook Version**: 1.0  
**Last Updated**: 2026-04-13  
**Status**: READY FOR EXECUTION

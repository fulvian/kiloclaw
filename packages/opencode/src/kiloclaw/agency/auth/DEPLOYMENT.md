# Token Persistence Deployment Guide

**Version**: 1.0  
**Date**: 2026-04-14  
**Status**: Approved for production  

---

## Overview

This guide covers deploying the encrypted token persistence system for Google Workspace agency. The system transitions from in-memory token storage to encrypted database persistence with automatic token refresh and rotation.

**Key Features**:
- ✅ AES-256-GCM encryption with PBKDF2 key derivation
- ✅ Automatic token refresh with 60-second buffer
- ✅ Multi-user, multi-workspace support
- ✅ Zero-downtime graceful degradation (24-hour overlap)
- ✅ Comprehensive audit trail

---

## Pre-Deployment Checklist

Before deploying to production, complete these steps:

### 1. Environment Preparation

- [ ] **Encryption Key Generated**
  ```bash
  # Generate 32-character encryption key
  openssl rand -hex 16 > /tmp/token_key.txt
  export GWORKSPACE_TOKEN_KEY=$(cat /tmp/token_key.txt)
  ```

- [ ] **Key Stored in Secrets Manager**
  - Store `GWORKSPACE_TOKEN_KEY` in your secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.)
  - DO NOT commit to git or environment files
  - Rotate keys annually

- [ ] **Database Credentials Available**
  - Database connection string available
  - Credentials stored securely
  - Test connection successful

- [ ] **Backup Created**
  ```bash
  # Backup existing data before migration
  sqlite3 production.db ".backup './backups/pre-migration-$(date +%s).db'"
  ```

### 2. Code Readiness

- [ ] All 8 Google Workspace skills updated with userId/workspaceId support
- [ ] BrokerTokenIntegration API complete and tested
- [ ] TokenManager encryption/decryption verified
- [ ] Integration tests passing (17/17)
- [ ] Type checking clean (0 TS errors)
- [ ] Staging environment tested end-to-end

### 3. Team Readiness

- [ ] Team trained on new token management system
- [ ] Rollback procedure documented and tested
- [ ] Monitoring and alerting configured
- [ ] On-call team briefed
- [ ] Deployment window scheduled with stakeholders

### 4. Operational Readiness

- [ ] Health check endpoints configured
- [ ] Monitoring dashboards created
- [ ] Alert thresholds set
- [ ] Incident response plan reviewed
- [ ] Runbooks prepared and accessible

---

## Deployment Procedure

### Phase 1: Pre-Deployment (2 hours before)

**1. Final Validation**
```bash
cd packages/opencode

# Verify code compiles
bun run typecheck

# Run test suite
bun run test token-manager

# Verify staging environment
./scripts/test-staging.sh
```

**2. Backup All Data**
```bash
# Full database backup
sqlite3 production.db ".backup './backups/pre-deployment-$(date +%Y%m%d-%H%M%S).db'"

# Export current token cache (for debugging)
bun scripts/export-token-stats.ts > ./backups/pre-deployment-token-stats.json
```

**3. Notify Stakeholders**
```bash
# Slack notification template
# "Starting Google Workspace token persistence migration
#  Expected duration: 5 minutes
#  Affected services: Gmail, Calendar, Drive, Docs, Sheets
#  Rollback time: <5 minutes if needed"
```

### Phase 2: Deployment (Blue-Green Strategy)

**Option A: Blue-Green Deployment (Recommended)**

```bash
# 1. Deploy new code to green environment
git checkout v1.4.0-token-persistence
cd green-environment/
bun install
bun run typecheck

# 2. Start green environment
pm2 start packages/opencode/src/index.ts --name "green-api"

# 3. Run migration script (validates setup)
bun packages/opencode/src/kiloclaw/agency/auth/migration-script.ts --dry-run

# 4. Verify green environment
./scripts/health-check.sh http://localhost:3001
./scripts/smoke-test.sh http://localhost:3001

# 5. Switch traffic to green
# - Update load balancer / reverse proxy
# - Route 100% traffic to green environment
# - Monitor error rates for 5 minutes

# 6. Keep blue environment running for 24 hours
# - Maintains graceful degradation fallback
# - Can rollback quickly if needed
# - After 24 hours, shut down blue environment
```

**Option B: Rolling Deployment**

```bash
# For single-instance deployments
# 1. Update code
git pull origin main
bun install

# 2. Run migration in dry-run mode
bun packages/opencode/src/kiloclaw/agency/auth/migration-script.ts --dry-run

# 3. Stop current service gracefully
pm2 stop api --wait-ready

# 4. Run migration (live)
bun packages/opencode/src/kiloclaw/agency/auth/migration-script.ts

# 5. Restart service
pm2 start api

# 6. Monitor for errors
pm2 logs api | grep -E "ERROR|WARN"
```

### Phase 3: Post-Deployment (30 minutes)

**1. Health Checks**
```bash
# Check all services responding
curl http://api/health
curl http://api/health/tokens
curl http://api/health/oauth

# Check database connection
bun scripts/verify-database.ts

# Check token refresh working
bun scripts/test-token-refresh.ts
```

**2. Monitoring Setup**
```bash
# Verify metrics being collected
curl http://prometheus:9090/metrics | grep token_

# Check alerts configured
curl http://alertmanager:9093/api/v1/alerts
```

**3. Status Update**
```bash
# Slack notification:
# "✅ Token persistence deployment successful
#  - All 8 skills operational
#  - Token encryption verified
#  - Graceful degradation enabled (24h overlap)
#  - Monitoring: [dashboard URL]"
```

---

## Graceful Degradation (24-Hour Overlap)

During the 24-hour transition period, the system accepts tokens from both sources:

```typescript
// NEW tokens → stored in encrypted database
TokenManager.store(userId, workspaceId, tokens)

// OLD tokens → can still be used if DB temporarily unavailable
getAccessTokenWithFallback(userId, workspaceId, legacyToken)
```

**Timeline**:
- **Hour 0**: Deployment complete, new system active
- **Hour 0-24**: Graceful degradation enabled
  - New tokens automatically stored in DB
  - Old tokens still work as fallback
  - System prefers DB, falls back to legacy if needed
- **Hour 24**: Remove fallback, require all tokens in DB
  - Deploy removal of legacy fallback code
  - Old tokens no longer accepted
  - All tokens must be in encrypted database

**Action Items**:
- Set calendar reminder for 24-hour mark
- Prepare removal of fallback code
- Schedule second deployment to remove legacy support

---

## Rollback Procedure

If critical issues occur, roll back to previous version:

### Emergency Rollback (5 minutes)

```bash
# 1. Stop current service
pm2 stop api

# 2. Restore from backup
sqlite3 production.db ".restore './backups/pre-deployment-<timestamp>.db'"

# 3. Revert code to previous version
git checkout v1.3.0-pre-tokens
bun install

# 4. Clear caches
bun scripts/clear-token-caches.ts

# 5. Restart service
pm2 start api

# 6. Verify health
curl http://api/health
pm2 logs api
```

### Graceful Rollback (15 minutes)

```bash
# 1. Switch traffic back to blue environment
# - Update load balancer to route to blue
# - Monitor for 5 minutes

# 2. Investigate root cause
# - Check logs for errors
# - Review recent changes
# - Identify failed component

# 3. Plan fix
# - Create hotfix branch
# - Deploy to staging for testing
# - Prepare for re-deployment

# 4. Document incident
# - Incident report template: ./docs/incident-template.md
# - Root cause analysis
# - Prevention steps for future
```

### Verification After Rollback

```bash
# Confirm rollback successful
curl http://api/health
curl http://api/health/tokens

# Check error rates
curl http://prometheus:9090/query?query=error_rate

# Verify old system working
bun scripts/test-legacy-tokens.ts

# Check monitoring alerts cleared
curl http://alertmanager:9093/api/v1/alerts
```

---

## Monitoring & Alerting

### Metrics to Track

**Token Lifecycle Metrics**:
```
token_store_total           # Cumulative token stores
token_refresh_total         # Cumulative refreshes
token_revoke_total          # Cumulative revocations
token_expiration_seconds    # Seconds until expiration
token_cache_size            # Current cache size
token_encryption_duration_ms # Encryption latency
```

**Error Metrics**:
```
token_store_errors          # Failed stores
token_refresh_errors        # Failed refreshes
token_revoke_errors         # Failed revocations
oauth_errors                # OAuth integration errors
database_errors             # Database access errors
```

**Performance Metrics**:
```
token_retrieval_duration_ms # Time to get token
token_refresh_duration_ms   # Time to refresh token
database_query_duration_ms  # Database latency
cache_hit_ratio             # % cache hits vs DB reads
```

### Alert Thresholds

Set up alerts for:

| Metric | Threshold | Action |
|--------|-----------|--------|
| Token refresh errors | >5 in 5min | Page oncall |
| Token store failures | >10 in 5min | Page oncall |
| OAuth errors | >3 in 5min | Investigate |
| Database connection errors | >1 | Page oncall |
| Encryption latency | >1000ms | Investigate performance |
| Cache hit ratio | <80% | Investigate |

### Example Prometheus Queries

```prometheus
# Alert on refresh errors
rate(token_refresh_errors[5m]) > 0.1

# Alert on database issues
rate(database_errors[5m]) > 0.05

# Monitor cache efficiency
token_cache_size > 1000

# Track token expiration risk
min(token_expiration_seconds) < 300
```

---

## Operational Runbooks

### Issue: High Token Refresh Errors

**Symptoms**:
- Error rate: `token_refresh_errors` > 5 in 5 minutes
- User complaints about "needs re-authentication" errors
- OAuth token endpoints timing out

**Root Causes**:
- OAuth endpoint unavailable (Google infrastructure issue)
- Network connectivity problem
- Rate limiting on refresh endpoint
- Invalid refresh token

**Resolution**:
```bash
# 1. Check OAuth endpoint status
curl -I https://oauth2.googleapis.com/token

# 2. Check network connectivity
traceroute oauth2.googleapis.com

# 3. Check rate limiting
grep "rate.*limit\|429" /var/log/api.log

# 4. Verify refresh tokens valid (sample)
bun scripts/verify-refresh-tokens.ts

# 5. If Google API issue: enable fallback
export FALLBACK_MODE=true
pm2 restart api
```

### Issue: Token Storage Failures

**Symptoms**:
- Error rate: `token_store_errors` > 10 in 5 minutes
- Users can't login
- Database connection errors in logs

**Root Causes**:
- Database unavailable / full
- Insufficient disk space
- Network partition
- Encryption key not available

**Resolution**:
```bash
# 1. Check database status
sqlite3 production.db "SELECT count(*) FROM gworkspace_token;"

# 2. Check disk space
df -h /var/lib/sqlite/

# 3. Check encryption key available
test -n "$GWORKSPACE_TOKEN_KEY" && echo "Key available" || echo "Key MISSING"

# 4. If database full: archive old tokens
bun scripts/archive-expired-tokens.ts

# 5. Restart service
pm2 restart api
```

### Issue: Cache Memory Growth

**Symptoms**:
- `token_cache_size` continuously increasing
- API memory usage growing over time
- Potential OOM (Out of Memory) errors

**Root Causes**:
- Cache TTL not working (5 min default)
- Memory leak in cache implementation
- Too many concurrent users
- No cleanup of expired entries

**Resolution**:
```bash
# 1. Check current cache size
bun scripts/get-cache-stats.ts

# 2. Clear cache (emergency)
bun scripts/clear-token-caches.ts

# 3. Monitor cleanup job running
grep "cleanup.*expired" /var/log/api.log

# 4. Verify cache TTL settings
grep "CACHE_TTL" packages/opencode/src/kiloclaw/agency/auth/token-manager.ts

# 5. If recurring: increase cleanup frequency
# - Edit token-manager.ts cache settings
# - Reduce CACHE_TTL_MS from 5min to 2min
# - Deploy update
```

### Issue: Encryption/Decryption Failures

**Symptoms**:
- Error rate: `token_encryption_errors` > 0
- Users getting "Token decryption failed" errors
- Random failures during peak load

**Root Causes**:
- Encryption key changed / rotated
- Corrupted token data in database
- GWORKSPACE_TOKEN_KEY environment variable not set
- Invalid token format in database

**Resolution**:
```bash
# 1. Verify encryption key available
echo $GWORKSPACE_TOKEN_KEY | wc -c  # Should be 33 (32 chars + newline)

# 2. Test encryption round-trip
bun scripts/test-encryption.ts

# 3. Check for corrupted tokens
bun scripts/check-corrupted-tokens.ts

# 4. If keys rotated: use migration script
bun packages/opencode/src/kiloclaw/agency/auth/migration-script.ts \
  --new-key $NEW_ENCRYPTION_KEY

# 5. Rollback if needed
# - Restore database backup
# - Restart service
```

---

## After Deployment

### Day 1 (First 24 hours)

- [ ] Monitor error rates continuously
- [ ] Check token refresh working correctly
- [ ] Verify no regressions in 8 skills
- [ ] Keep blue environment running (graceful degradation fallback)
- [ ] Prepare for removing legacy fallback at 24-hour mark

### Day 1-7 (First Week)

- [ ] Monitor performance metrics
- [ ] Check database growth rate
- [ ] Verify cleanup jobs running
- [ ] Review any error logs
- [ ] Gather user feedback
- [ ] Plan removal of legacy token fallback code

### Week 2+ (Ongoing)

- [ ] Monitor routine metrics
- [ ] Perform key rotation (if applicable)
- [ ] Review audit logs quarterly
- [ ] Update runbooks with lessons learned
- [ ] Plan for future enhancements

---

## Verification Checklist

Before declaring deployment complete:

- [ ] All 8 skills operating normally
- [ ] Token encryption working
- [ ] Token refresh automatic and successful
- [ ] Database persisting tokens correctly
- [ ] Cache working and clearing properly
- [ ] Graceful degradation enabled
- [ ] Monitoring and alerting active
- [ ] Error rates normal
- [ ] No performance regressions
- [ ] Team trained and confident
- [ ] Rollback procedure tested
- [ ] Documentation updated

---

## Support & Escalation

### During Deployment

- **Lead**: [DevOps Lead]
- **On-Call**: [On-Call Engineer]
- **Slack Channel**: #gworkspace-deployment
- **Incident Channel**: #incidents

### After Deployment

**Questions about the system**:
- See: `./TOKEN_MANAGEMENT_ARCHITECTURE.md`
- See: `./TROUBLESHOOTING.md`

**Bug reports**:
- Open issue: `Bug: [component] - [description]`
- Assign to: @gworkspace-team
- Label: `bug`, `token-persistence`

**Performance issues**:
- Check monitoring dashboard: [URL]
- Run diagnostics: `bun scripts/diagnose.ts`
- Escalate if latency > 500ms

---

## Appendix: Environment Variables

Required for deployment:

```bash
# Encryption
GWORKSPACE_TOKEN_KEY=<32-character-hex-string>

# Google OAuth
GWORKSPACE_CLIENT_ID=<from Google Cloud Console>
GWORKSPACE_CLIENT_SECRET=<from Google Cloud Console>

# Database
DATABASE_URL=sqlite://./data/gworkspace.db
# OR for PostgreSQL:
DATABASE_URL=postgresql://user:pass@host:5432/gworkspace

# Optional monitoring
SENTRY_DSN=<for error reporting>
DATADOG_API_KEY=<for metrics>
```

---

## References

- Architecture: `./TOKEN_MANAGEMENT_ARCHITECTURE.md`
- Migration: `./migration-script.ts`
- Troubleshooting: `./TROUBLESHOOTING.md`
- API Docs: `./API.md`

---

**Document Status**: ✅ Approved  
**Last Updated**: 2026-04-14  
**Next Review**: 2026-05-14

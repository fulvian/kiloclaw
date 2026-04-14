# Token Management System - Troubleshooting Guide

**Version**: 1.0  
**Updated**: 2026-04-14  

---

## Quick Diagnosis

Start here to identify issues:

```bash
# Run full diagnostic
bun scripts/diagnose-tokens.ts

# Output shows:
# - Encryption key availability
# - Database connection status
# - Token cache state
# - Recent errors
# - Performance metrics
```

---

## Common Issues & Solutions

### 1. "GWORKSPACE_TOKEN_KEY not set" Error

**Symptom**: 
```
Error: GWORKSPACE_TOKEN_KEY environment variable not set
```

**Root Cause**: Encryption key not configured

**Solution**:
```bash
# Check if key is set
echo $GWORKSPACE_TOKEN_KEY

# If empty, set it
export GWORKSPACE_TOKEN_KEY="your-32-char-key"

# Or in docker/systemd:
# Add to .env file or secrets manager
# Restart service: pm2 restart api
```

**Prevention**:
- Store key in secrets manager (AWS, HashiCorp Vault)
- Never commit to git
- Use deployment tool to inject at runtime

---

### 2. "No tokens found" Error When Retrieving Token

**Symptom**:
```
Error: No tokens found for user-123/workspace-abc
```

**Root Cause**: Token not stored or cache expired

**Solution**:
```bash
# 1. Check if token exists in database
bun scripts/list-user-tokens.ts user-123 workspace-abc

# 2. If not found, user needs to re-authenticate
# - Direct user to OAuth login flow
# - New token will be stored

# 3. If token exists but not found:
# - Clear cache and retry
bun scripts/clear-token-caches.ts
# - Token should reload from database

# 4. Check token expiration
bun scripts/check-token-expiration.ts user-123 workspace-abc
```

**Prevention**:
- Ensure token storage happens after OAuth
- Test token retrieval immediately after login
- Monitor for missing tokens in logs

---

### 3. Token Refresh Failures

**Symptom**:
```
Error: Failed to refresh token - got 401 Unauthorized
```

**Root Causes**:
- Refresh token revoked by user
- Google OAuth endpoint unreachable
- Client ID/Secret incorrect
- Rate limit on refresh endpoint

**Solution**:
```bash
# 1. Check if token is expired
bun scripts/check-token-status.ts user-123 workspace-abc
# Output: { isExpired: true, expiresAt: 1723456789000 }

# 2. Verify refresh token exists
bun scripts/has-refresh-token.ts user-123 workspace-abc
# Output: { hasRefreshToken: true }

# 3. Test OAuth endpoint directly
curl -X POST https://oauth2.googleapis.com/token \
  -d "client_id=$GWORKSPACE_CLIENT_ID" \
  -d "client_secret=$GWORKSPACE_CLIENT_SECRET" \
  -d "refresh_token=$REFRESH_TOKEN" \
  -d "grant_type=refresh_token"
# Should return { access_token: "...", expires_in: 3600 }

# 4. Check credentials correct
echo "Client ID: $GWORKSPACE_CLIENT_ID"
echo "Client Secret: ${GWORKSPACE_CLIENT_SECRET:0:10}..."
# Compare with Google Cloud Console

# 5. If rate limited: wait and retry
# - Google limits: 600 refreshes per minute per user
# - Implement backoff: exponential with jitter
```

**Prevention**:
- Don't let tokens expire before refresh
- Use 60-second buffer before expiration
- Monitor refresh success rate
- Alert on >5% refresh failure rate

---

### 4. Encryption/Decryption Failures

**Symptom**:
```
Error: Token decryption failed: Authentication tag verification failed
```

**Root Causes**:
- Encryption key changed
- Token data corrupted
- Wrong key used for decryption
- Token has invalid format

**Solution**:
```bash
# 1. Test encryption round-trip
bun scripts/test-encryption.ts
# Should output: ✅ Encryption/decryption working

# 2. Check for corrupted tokens
bun scripts/check-corrupted-tokens.ts
# Shows tokens that fail decryption

# 3. If key was rotated:
# - Rotate using migration script
bun packages/opencode/src/kiloclaw/agency/auth/migration-script.ts \
  --old-key $OLD_KEY \
  --new-key $NEW_KEY

# 4. Rebuild corrupted tokens
bun scripts/rebuild-corrupted-tokens.ts
# - Revokes old corrupted token
# - User needs to re-authenticate
# - New token stored with current key

# 5. Check database integrity
bun scripts/check-database.ts
# Validates:
# - No corrupted rows
# - All tokens have required fields
# - No orphaned entries
```

**Prevention**:
- Never change encryption key without migration
- Test encryption key before production use
- Regular database integrity checks
- Maintain backup encryption keys for recovery

---

### 5. Database Connection Failures

**Symptom**:
```
Error: unable to open database file
SQLiteError: disk I/O error
```

**Root Causes**:
- Database file locked
- Disk space full
- File permissions wrong
- Database corrupted

**Solution**:
```bash
# 1. Check database file exists
ls -lh ./data/gworkspace.db

# 2. Check disk space
df -h /var/lib/sqlite/
# If >95% full: archive old tokens

# 3. Check file permissions
chmod 664 ./data/gworkspace.db

# 4. Check for file locks
lsof | grep gworkspace.db
# Kill any blocking processes if safe

# 5. Verify database integrity
sqlite3 ./data/gworkspace.db "PRAGMA integrity_check;"
# Output: ok

# 6. If corrupted, restore from backup
mv ./data/gworkspace.db ./data/gworkspace.db.corrupt
sqlite3 ./data/gworkspace.db ".restore './backups/latest.db'"

# 7. Restart service
pm2 restart api
```

**Prevention**:
- Monitor disk space
- Set up automatic backups
- Schedule maintenance windows
- Use monitoring alerts for disk usage

---

### 6. Cache Growing Unbounded

**Symptom**:
- Memory usage increasing over time
- `token_cache_size` metric increasing
- OOM (Out of Memory) errors

**Root Causes**:
- Cache TTL not working (default 5 minutes)
- Memory leak in cache eviction
- Too many concurrent users
- Cleanup job not running

**Solution**:
```bash
# 1. Check current cache size
bun scripts/get-cache-stats.ts
# Output: { size: 50000, entries: [...] }

# 2. Clear cache (emergency)
bun scripts/clear-token-caches.ts
# Clears in-memory cache, keeps DB tokens

# 3. Monitor cleanup job
grep -i "cleanup\|expired" /var/log/api.log
# Should see cleanup logs every 5 minutes

# 4. Check cache TTL setting
grep "CACHE_TTL_MS" \
  packages/opencode/src/kiloclaw/agency/auth/token-manager.ts
# Default: 5 * 60 * 1000 (5 minutes)

# 5. Force cache cleanup
bun scripts/force-cache-cleanup.ts

# 6. Restart service if memory high
pm2 restart api
```

**Prevention**:
- Monitor cache size continuously
- Set alerts for cache >10,000 entries
- Schedule regular cache cleanup
- Limit concurrent users if needed

---

### 7. Token Revocation Not Working

**Symptom**:
- User logs out but token still works
- Revocation endpoint returns error
- Token still valid after revocation

**Root Cause**:
- Revocation endpoint failing
- Token not actually deleted from database
- Cache not cleared on revocation

**Solution**:
```bash
# 1. Check token revocation
bun scripts/test-token-revocation.ts user-123 workspace-abc

# 2. Verify token deleted from database
bun scripts/list-user-tokens.ts user-123 workspace-abc
# Should be empty after revocation

# 3. Check cache cleared
bun scripts/get-cache-stats.ts
# user-123:workspace-abc should not be in cache

# 4. Force token revocation
bun scripts/force-revoke-token.ts user-123 workspace-abc
# - Clears from cache
# - Deletes from database
# - Calls Google revocation endpoint

# 5. Verify token invalid
bun scripts/test-token-valid.ts "user-token"
# Should return false
```

**Prevention**:
- Test revocation after logout
- Monitor revocation success rate
- Alert on revocation failures
- Clear cache before checking revocation

---

### 8. Skills Failing with "userId Required" Error

**Symptom**:
```
Error: userId is required (set via input or KILO_USER_ID environment variable)
```

**Root Cause**:
- userId not passed in request
- KILO_USER_ID environment variable not set
- Skill implementation missing fallback

**Solution**:
```bash
# 1. Check environment variable
echo $KILO_USER_ID
# Should be set to current user ID

# 2. Pass userId in skill request
# Instead of:
GmailSkills.search({ query: "test" })

# Do:
GmailSkills.search({ query: "test", userId: "user-123" })

# 3. Set KILO_USER_ID for development
export KILO_USER_ID="dev-user-123"
# Or in .env file

# 4. For production, inject via deployment
# - Set in pod/container environment
# - Use secrets manager to provide value
```

**Prevention**:
- Always require userId for multi-user systems
- Document userId requirement in API
- Validate userId early in skill execution
- Provide helpful error messages

---

## Performance Issues

### Slow Token Retrieval

**Symptom**: Token retrieval taking >500ms

**Debug**:
```bash
# Check cache hit ratio
bun scripts/get-cache-stats.ts
# Should be >80% hits

# Check database query performance
bun scripts/benchmark-token-retrieval.ts
# Should be <100ms per query

# Check encryption performance
bun scripts/benchmark-encryption.ts
# Should be <50ms per operation

# Check network latency (if remote DB)
ping $DATABASE_HOST
```

**Solutions**:
- Increase cache TTL if safe
- Optimize database indexes
- Use connection pooling
- Scale database if needed

### High Memory Usage

**Symptom**: Memory usage >500MB for token system

**Debug**:
```bash
# Get memory breakdown
bun scripts/memory-analysis.ts

# Check cache size
bun scripts/get-cache-stats.ts

# Check database size
ls -lh ./data/gworkspace.db

# Check for memory leaks
pm2 monit  # Watch memory growth over time
```

**Solutions**:
- Clear old tokens: `bun scripts/archive-expired-tokens.ts`
- Reduce cache TTL
- Increase cache eviction frequency
- Scale horizontally (multiple processes)

---

## Monitoring & Alerts

### Key Metrics to Watch

```bash
# Token operations
token_store_total           # Should increase on new logins
token_refresh_total         # Should increase regularly
token_revoke_total          # Should increase on logouts

# Errors
token_store_errors          # Should be near 0
token_refresh_errors        # Should be near 0
token_revoke_errors         # Should be near 0

# Performance
token_retrieval_duration_ms # Should be <100ms
token_encryption_duration_ms # Should be <50ms
cache_hit_ratio             # Should be >80%

# Capacity
token_cache_size            # Should be stable
database_size_mb            # Monitor growth
memory_usage_mb             # Watch for leaks
```

### Alert Thresholds

Set alerts for:

```
token_store_errors > 5 per minute    → Page oncall
token_refresh_errors > 5 per minute  → Page oncall
database_connection_errors > 0       → Page oncall
token_retrieval_duration > 500ms     → Investigate
cache_hit_ratio < 70%                → Investigate
database_size > 1GB                  → Archive old tokens
memory_usage > 500MB                 → Investigate leak
```

---

## Support Resources

- **Slack**: #token-management-support
- **Docs**: See `TOKEN_MANAGEMENT_ARCHITECTURE.md`
- **Issues**: Create issue with `[token-system]` label
- **Escalation**: Contact @token-team

---

## Appendix: Debug Commands

```bash
# Show all stored tokens
bun scripts/list-all-tokens.ts

# Show tokens for specific user
bun scripts/list-user-tokens.ts <userId> [workspaceId]

# Check token validity
bun scripts/test-token-valid.ts <token>

# Test encryption
bun scripts/test-encryption.ts

# Full system diagnostic
bun scripts/diagnose-tokens.ts

# Clear all caches
bun scripts/clear-token-caches.ts

# Export token statistics
bun scripts/export-token-stats.ts > stats.json

# Check database integrity
bun scripts/check-database.ts

# Verify OAuth credentials
bun scripts/verify-oauth-config.ts
```

---

**Last Updated**: 2026-04-14  
**Status**: ✅ Approved for production

# Task 1.4: Broker Integration - PROGRESS REPORT

**Date**: 2026-04-14  
**Status**: IN PROGRESS (50% complete)  
**Remaining Work**: Fix type errors, complete skill updates, integration tests

---

## COMPLETED

### Step 1: Database Functions Implementation ✅
- **File**: `packages/opencode/src/kiloclaw/agency/auth/token-db.ts`
- **Implementation**: Full Drizzle ORM implementation with actual database calls
- **Functions Implemented**:
  - `saveToken()`: Upsert encrypted tokens with unique constraint on (userId, workspaceId)
  - `loadToken()`: Retrieve encrypted tokens by userId/workspaceId
  - `deleteToken()`: Delete tokens on logout/revoke
  - `recordRotation()`: Audit trail for token rotations
  - `cleanupExpiredTokens()`: Delete tokens expired >7 days
  - `getStatistics()`: Monitoring metrics (total, expired, active, oldest)
  - `cleanupIdempotencyKeys()`: Cleanup expired dedup keys

### Database Schema ✅
- **File**: `packages/opencode/src/kiloclaw/agency/auth/gworkspace-token.sql.ts`
- **Tables Created**:
  - `GWorkspaceTokenTable`: Encrypted token storage
  - `GWorkspaceTokenRotationTable`: Audit trail
  - `GWorkspaceIdempotencyKeyTable`: Deduplication
- **Exported**: From `packages/opencode/src/storage/schema.ts`

### Step 2: Broker Integration Pattern ✅
- **File**: `packages/opencode/src/kiloclaw/agency/broker/gworkspace-broker.ts`
- **Changes**:
  - Added `BrokerConfigWithUser` interface (userId + workspaceId)
  - Implemented `getAccessTokenForUser()`: Automatic token retrieval with refresh
  - Implemented `toBrokerConfig()`: Convert user context to broker config
  - Implemented `revokeTokensForUser()`: Logout with token revocation
  - Helper functions integrated with TokenManager

### Step 3: Skills Updates (Partial) ✅
- **File**: `packages/opencode/src/kiloclaw/agency/skills/gworkspace.ts`
- **Updated Input Schemas**:
  - GmailSearchInputSchema: Added userId, workspaceId
  - GmailReadInputSchema: Added userId, workspaceId
  - GmailSendInputSchema: Added userId, workspaceId
- **Updated Skills**:
  - `GmailSkills.search()`: Now uses toBrokerConfig() for auto token management
  - `GmailSkills.read()`: Now uses toBrokerConfig() for auto token management
  - `GmailSkills.send()`: Now uses toBrokerConfig() for auto token management

---

## TYPE ERRORS REMAINING (To Fix)

### 1. TokenPayload Schema
- **Issue**: Tests expect `tokenType` to be optional with default, but it's required
- **Location**: `token-manager.ts` line 31
- **Fix**: Make tokenType have default "Bearer"
- **Affected**: All test files that create TokenPayload objects

### 2. OAuth Configuration
- **Issue**: GWorkspaceOAuth.refreshTokens needs `scopes` in config
- **Locations**: 
  - `gworkspace-broker.ts` line 68
  - `broker-integration.ts` line 40
- **Fix**: Add scopes array to OAuth config (Gmail, Calendar, Drive, Docs, Sheets scopes)

### 3. GWorkspaceOAuth Methods
- **Issue**: `revokeToken()` method not found
- **Location**: `gworkspace-broker.ts` line 80
- **Status**: Need to check if method exists or create it

---

## STILL TO DO

### Calendar Skills Update
- Update CalendarListInputSchema: Add userId, workspaceId
- Update CalendarCreateInputSchema: Add userId, workspaceId
- Update `list()` method: Use toBrokerConfig()
- Update `create()` method: Use toBrokerConfig()

### Drive Skills Update
- Update DriveSearchInputSchema: Add userId, workspaceId
- Update DriveShareInputSchema: Add userId, workspaceId
- Update `search()` method: Use toBrokerConfig()
- Update `share()` method: Use toBrokerConfig()

### Docs Skills Update
- Update DocsReadInputSchema: Add userId, workspaceId
- Update `read()` method: Use toBrokerConfig()

### Sheets Skills Update
- Update SheetsReadInputSchema: Add userId, workspaceId
- Update `read()` method: Use toBrokerConfig()

### Step 4: Integration Testing
- Create `token-manager.integration.test.ts`
- Test: Token storage → retrieval flow
- Test: Auto-refresh on expiration
- Test: Revocation on logout
- Test: Cache behavior

---

## NEXT IMMEDIATE ACTIONS

1. Fix TokenPayload tokenType (make optional with default)
2. Fix OAuth scopes configuration
3. Verify/implement revokeToken method in GWorkspaceOAuth
4. Complete remaining skill updates (Calendar, Drive, Docs, Sheets)
5. Create integration tests
6. Run typecheck to verify no errors

---

## COMMIT HISTORY

- **30fbd59**: feat(gworkspace): implement Task 1.4 broker integration with token persistence
  - Database schema and Drizzle ORM implementation
  - Broker integration helpers
  - Gmail skills updated
  - 8 files changed, 1334 insertions

---

## CODE METRICS

- **Database Functions**: 7 implemented (saveToken, loadToken, deleteToken, recordRotation, cleanupExpiredTokens, getStatistics, cleanupIdempotencyKeys)
- **Broker Helpers**: 3 implemented (getAccessTokenForUser, toBrokerConfig, revokeTokensForUser)
- **Skills Updated**: 3 out of 8 (Gmail search, read, send)
- **Type Errors**: ~10 remaining (mostly TokenPayload schema and OAuth config)

---

## EFFORT ESTIMATE

- **Completed**: ~2 hours (database, broker, Gmail skills)
- **Remaining**:
  - Fix type errors: 0.5 hours
  - Complete skill updates: 0.5 hours
  - Integration tests: 1 hour
  - Testing & debugging: 0.5 hours
- **Total Task 1.4**: ~4-5 hours (est. 1 hour remaining)


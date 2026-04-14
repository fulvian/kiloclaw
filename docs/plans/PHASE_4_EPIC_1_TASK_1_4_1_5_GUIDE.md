# Phase 4 Epic 1 - Task 1.4 & 1.5 Implementation Guide
**Date**: 2026-04-14  
**Tasks**: 1.4 (Broker Integration) + 1.5 (Migration Strategy)  
**Estimated Duration**: 1-2 days  
**Status**: Ready to Implement

---

## Task 1.4: Broker Integration (4-6 hours)

### Step 1: Implement Database Functions in token-db.ts

**File**: `packages/opencode/src/kiloclaw/agency/auth/token-db.ts`

The file is already created with Drizzle ORM patterns. You need to replace the TODO comments with actual database calls.

#### 1.4.1: saveToken() Implementation

Replace the TODO in `TokenDatabase.saveToken()`:

```typescript
// Current (template):
log.debug("saveToken called", { userId: token.userId, id: token.id })

// Replace with actual Drizzle ORM:
import { db } from '@/your-db-config'  // Adjust import path
import { gworkspaceTokens } from './token-db'
import { eq, and } from 'drizzle-orm'

const result = await db
  .insert(gworkspaceTokens)
  .values({
    id: token.id,
    userId: token.userId,
    workspaceId: token.workspaceId,
    encryptedAccessToken: token.encryptedAccessToken,
    encryptedRefreshToken: token.encryptedRefreshToken,
    expiresAt: token.expiresAt,
    rotatedAt: token.rotatedAt,
    createdAt: token.createdAt,
  })
  .onConflictDoUpdate({
    target: [gworkspaceTokens.userId, gworkspaceTokens.workspaceId],
    set: {
      encryptedAccessToken: token.encryptedAccessToken,
      encryptedRefreshToken: token.encryptedRefreshToken,
      expiresAt: token.expiresAt,
      rotatedAt: token.rotatedAt,
    },
  })

log.info("token saved", { userId: token.userId, id: token.id })
```

**What this does**:
- Inserts new token or updates existing token for user
- Uses unique constraint on (userId, workspaceId)
- Updates encrypted tokens + expiration time if token already exists

#### 1.4.2: loadToken() Implementation

Replace the TODO in `TokenDatabase.loadToken()`:

```typescript
// Current (template):
return null // Placeholder

// Replace with actual Drizzle ORM:
import { db } from '@/your-db-config'
import { gworkspaceTokens } from './token-db'
import { eq, and } from 'drizzle-orm'

const result = await db
  .select()
  .from(gworkspaceTokens)
  .where(
    and(
      eq(gworkspaceTokens.userId, userId),
      eq(gworkspaceTokens.workspaceId, workspaceId)
    )
  )
  .limit(1)

if (!result.length) return null

return result[0] as StoredToken
```

**What this does**:
- Queries database for token matching userId + workspaceId
- Returns StoredToken (encrypted) or null if not found
- TokenManager will decrypt the token

#### 1.4.3: deleteToken() Implementation

Replace the TODO in `TokenDatabase.deleteToken()`:

```typescript
// Current (template):
log.debug("deleteToken called", { userId, workspaceId })

// Replace with actual Drizzle ORM:
import { db } from '@/your-db-config'
import { gworkspaceTokens } from './token-db'
import { eq, and } from 'drizzle-orm'

const result = await db
  .delete(gworkspaceTokens)
  .where(
    and(
      eq(gworkspaceTokens.userId, userId),
      eq(gworkspaceTokens.workspaceId, workspaceId)
    )
  )

log.info("token deleted", { userId, workspaceId })
```

**What this does**:
- Deletes token from database on logout
- Called by TokenManager.revoke()

#### 1.4.4: recordRotation() Implementation

Replace the TODO in `TokenDatabase.recordRotation()`:

```typescript
// Current (template):
log.debug("recordRotation called", { userId, workspaceId, reason })

// Replace with actual Drizzle ORM:
import { db } from '@/your-db-config'
import { gworkspaceTokenRotations } from './token-db'

const result = await db.insert(gworkspaceTokenRotations).values({
  userId,
  workspaceId,
  oldRefreshTokenHash,
  rotationReason: reason,
  rotatedAt: Date.now(),
})

log.info("rotation recorded", { userId, workspaceId, reason })
```

**What this does**:
- Records token rotation in audit table
- Used for compliance + debugging (not required for functionality)

#### 1.4.5: cleanupExpiredTokens() Implementation

Replace the TODO in `TokenDatabase.cleanupExpiredTokens()`:

```typescript
// Current (template):
return 0 // Placeholder: return count of deleted rows

// Replace with actual Drizzle ORM:
import { db } from '@/your-db-config'
import { gworkspaceTokens } from './token-db'
import { lt } from 'drizzle-orm'

const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
const cutoffTime = Date.now() - sevenDaysMs

const result = await db
  .delete(gworkspaceTokens)
  .where(lt(gworkspaceTokens.expiresAt, cutoffTime))

log.info("tokens cleaned up", { count: result.rowsAffected })
return result.rowsAffected || 0
```

**What this does**:
- Deletes expired tokens older than 7 days
- Called periodically (hourly) to keep DB clean
- Keeps recent expired tokens for 7 days (audit trail)

### Step 2: Update GWorkspaceBroker Integration

**File**: `packages/opencode/src/kiloclaw/agency/broker/gworkspace-broker.ts`

The reference implementation is in `gworkspace-broker-updated.ts`. Follow this pattern:

**Before**: Token passed directly in config
```typescript
async function gmail(
  operation: string,
  args: Record<string, unknown>,
  config: BrokerConfig  // contains accessToken
): Promise<ToolResult<unknown>> {
  // config.accessToken used directly
}
```

**After**: Token retrieved automatically
```typescript
async function gmail(
  operation: string,
  args: Record<string, unknown>,
  config: UpdatedBrokerConfig  // contains userId, workspaceId
): Promise<ToolResult<unknown>> {
  const token = await getAccessToken(config)
  // Token automatically retrieved + refreshed if needed
}
```

**Steps**:
1. Add `getAccessToken()` helper function to broker
2. Update all service methods (gmail, calendar, drive, docs, sheets)
3. Change config type from `BrokerConfig` to `UpdatedBrokerConfig`
4. Replace `config.accessToken` with `await getAccessToken(config)`

### Step 3: Update Skills to Pass User Context

**File**: `packages/opencode/src/kiloclaw/agency/skills/gworkspace.ts`

See migration guide in `gworkspace-broker-updated.ts` (lines 227-290).

**Example: Update GmailSearchSkill**

Before:
```typescript
export const GmailSkills.search = fn(
  GmailSearchInputSchema,
  async (input) => {
    const result = await GWorkspaceBroker.gmail("search", {
      query: input.query,
      maxResults: input.maxResults
    }, {
      accessToken: "from-somewhere"
    })
    return result.data
  }
)
```

After:
```typescript
const GmailSearchInputSchema = z.object({
  query: z.string(),
  maxResults: z.number().optional(),
  userId: z.string(),       // NEW
  workspaceId: z.string(),  // NEW
})

export const GmailSkills.search = fn(
  GmailSearchInputSchema,
  async (input) => {
    const result = await GWorkspaceBroker.gmail("search", {
      query: input.query,
      maxResults: input.maxResults
    }, {
      userId: input.userId,
      workspaceId: input.workspaceId,
      preferNative: true,
      mcpFallbackEnabled: true,
      fallbackServers: ["google-workspace"]
    })
    return result.data
  }
)
```

**Skills to update**:
- GmailSkills.search
- GmailSkills.read
- GmailSkills.send
- CalendarSkills.list
- CalendarSkills.create
- DriveSkills.search
- DriveSkills.share
- DocsSkills.read
- SheetsSkills.read

### Step 4: Integration Testing

**Test file**: `packages/opencode/src/kiloclaw/agency/auth/token-manager.integration.test.ts`

Create integration tests:

```typescript
describe("TokenManager + Broker Integration", () => {
  it("should store and retrieve token through broker", async () => {
    // 1. Store token
    const tokens = { accessToken: "test", expiresIn: 3600 }
    await TokenManager.store("user-123", "workspace-abc", tokens)

    // 2. Broker requests token
    const token = await BrokerTokenIntegration.getAccessToken({
      userId: "user-123",
      workspaceId: "workspace-abc"
    })

    // 3. Verify token is correct
    expect(token).toBe("test")
  })

  it("should auto-refresh expired token", async () => {
    // Token will be expired, broker should trigger refresh
    // Verify new token is returned
  })

  it("should revoke token on logout", async () => {
    // Store token, revoke it, verify it's deleted
  })
})
```

---

## Task 1.5: Migration Strategy (2-4 hours)

### Step 1: Create Migration Script

**File**: `packages/opencode/src/kiloclaw/agency/auth/migration-script.ts`

```typescript
// Migration script to move tokens from in-memory to encrypted DB
// Run once during deployment

import { Log } from "@/util/log"
import { TokenManager } from "./token-manager"
import { TokenDatabase } from "./token-db"

const log = Log.create({ service: "token-migration" })

export async function migrateTokensToDB(): Promise<{
  successful: number
  failed: number
  errors: Array<{ userId: string; error: string }>
}> {
  const results = { successful: 0, failed: 0, errors: [] }

  try {
    // Get all in-memory tokens (implementation depends on your current setup)
    // const inMemoryTokens = getInMemoryTokens() // TODO

    // For each in-memory token:
    // 1. Encrypt it
    // 2. Store in database
    // 3. Log migration event
    // 4. Clear from in-memory storage

    log.info("migration completed", results)
    return results
  } catch (error) {
    log.error("migration failed", { error })
    throw error
  }
}
```

### Step 2: Graceful Degradation (24-hour overlap)

During deployment, accept tokens from BOTH sources:

```typescript
// In broker:
async function getAccessToken(config: UpdatedBrokerConfig): Promise<string> {
  try {
    // Try database first (new way)
    return await TokenManager.getValidAccessToken(config.userId, config.workspaceId)
  } catch (error) {
    // Fallback to in-memory cache (old way) if DB fails
    const inMemoryToken = getInMemoryToken(config.userId)  // TODO
    if (inMemoryToken) {
      log.warn("using fallback in-memory token", { userId: config.userId })
      return inMemoryToken
    }
    throw error
  }
}
```

**Duration**: 24 hours after deployment
- Old clients: Can still use in-memory tokens
- New code: Stores tokens in encrypted DB
- After 24 hours: Remove in-memory fallback

### Step 3: Deployment Documentation

**Create**: `packages/opencode/src/kiloclaw/agency/auth/DEPLOYMENT.md`

```markdown
# Token Persistence Deployment Guide

## Pre-Deployment

1. **Backup Database**
   ```bash
   pg_dump production_db > backup_$(date +%s).sql
   ```

2. **Set Encryption Key**
   ```bash
   export GWORKSPACE_TOKEN_KEY="your-32-char-key-here-!!!!"
   ```

3. **Create Database Tables**
   ```bash
   psql -d production_db -f migrations/001_create_token_tables.sql
   ```

## Deployment

1. **Blue-Green Deployment** (zero downtime)
   - Deploy new code to green environment
   - Run migration script (if needed)
   - Test in green environment
   - Switch traffic to green

2. **Enable New Code**
   - New requests use TokenManager
   - Old requests fallback to in-memory (24h overlap)

3. **Monitor**
   - Token cache hit rate
   - Token refresh latency
   - Database errors
   - In-memory fallback usage

## Post-Deployment

1. **Verify Logs** (24 hours)
   ```
   Check for: "using fallback in-memory token"
   Goal: Should be ZERO after 24 hours
   ```

2. **Remove Fallback** (after 24 hours)
   ```typescript
   // Remove this from getAccessToken():
   // if (inMemoryToken) { ... }
   ```

3. **Run Cleanup Job**
   ```bash
   SELECT cleanup_gworkspace_tokens();
   ```

## Rollback Plan

If issues occur:

1. **Switch traffic back to blue** (old version)
2. **Restart blue environment** with old code
3. **Preserve database** for investigation
4. **Investigate logs** for root cause
5. **Re-test before re-deployment**

## Monitoring

### Metrics to Watch

- **Token Cache Hit Rate** (target: >90%)
  ```sql
  SELECT COUNT(*) FROM gworkspace_tokens WHERE expires_at > NOW()
  ```

- **Token Refresh Latency** (target: <500ms)
  - Monitor logs for "token refresh" duration

- **Database Errors** (target: 0)
  - Monitor logs for "saveToDatabase failed"

- **In-Memory Fallback Usage** (target: 0 after 24h)
  - Monitor logs for "using fallback in-memory token"

### Alerts to Set

- Token database connection failures
- Token encryption/decryption errors
- Cache hit rate <80%
- Refresh latency >1000ms
```

### Step 4: Validation Checklist

Before marking Task 1.5 complete:

- [ ] Migration script works with test data
- [ ] Graceful degradation (24h overlap) implemented
- [ ] Deployment documentation complete
- [ ] Monitoring setup (metrics + alerts)
- [ ] Rollback plan documented
- [ ] Team trained on deployment procedure
- [ ] Staging environment tested
- [ ] Production backup created
- [ ] Encryption key secured (Secrets Manager)
- [ ] Cleanup job scheduled

---

## Code Checklist

### Files to Update

- [ ] `token-db.ts` - Implement all database functions
- [ ] `gworkspace-broker.ts` - Integrate TokenManager
- [ ] `gworkspace.ts` - Update skills with userId/workspaceId
- [ ] `broker-integration.ts` - Already complete ✅
- [ ] `token-manager.ts` - Already uses token-db.ts ✅

### Files to Create

- [ ] `migration-script.ts` - Migration from in-memory to DB
- [ ] `DEPLOYMENT.md` - Deployment guide
- [ ] `token-manager.integration.test.ts` - Integration tests

### Files Already Complete

- [x] `token-manager.ts` - Core implementation
- [x] `broker-integration.ts` - Integration layer
- [x] `token-db.ts` - Database template (just needs implementation)
- [x] `migrations/001_create_token_tables.sql` - Schema
- [x] `token-manager.test.ts` - Unit tests

---

## Timeline

### Day 1 (4-6 hours)
1. Implement database functions in token-db.ts (1.5h)
2. Update GWorkspaceBroker integration (1.5h)
3. Update all skills (1.5h)
4. Integration testing (1h)

### Day 2 (2-4 hours)
1. Create migration script (1h)
2. Implement graceful degradation (0.5h)
3. Create deployment documentation (0.5-1.5h)
4. Staging testing (0.5-1h)

---

## Success Criteria (Epic 1 Complete)

- [x] Task 1.1: Database Setup ✅
- [x] Task 1.2: Encryption Layer ✅
- [x] Task 1.3: TokenManager ✅
- [ ] Task 1.4: Broker Integration (in progress)
- [ ] Task 1.5: Migration Strategy (in progress)

**Epic 1 Completion**: When both 1.4 and 1.5 are done + production tested

---

## Questions & Support

If you have questions during implementation:

1. **Check existing tests** - `token-manager.test.ts` has examples
2. **Check database patterns** - `memory.db.ts` shows Drizzle ORM usage
3. **Check migration guide** - In `gworkspace-broker-updated.ts`
4. **Review PHASE_4_EPIC_1_STATUS.md** - For overall context

Good luck! 🚀

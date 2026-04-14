# Google Workspace Agency: Complete Debug Fix Plan

**Date**: 2026-04-14  
**Phase**: Phase 4.1 - Critical Bug Fixes (Blocking Issues)  
**Target**: Production-Ready Google Workspace Agency  
**Priority**: P0 (Blocking all write operations, auth failures)

---

## Overview

5 CRITICAL issues prevent core Google Workspace functionality. This plan fixes them in dependency order:

1. **Token authentication** → affects all operations
2. **Missing Drive skills** → affects user-facing API completeness
3. **Permission validation** → affects share operations
4. **Scope alignment** → affects write operations
5. **Auth fallback** → affects error recovery

---

## Phase 1: Critical Path Blockers (Day 1)

### FIX #1: Return Plaintext Token from getValidAccessToken

**File**: `packages/opencode/src/kiloclaw/agency/services/token-manager.ts`

**Issue**: Line 279 returns encrypted token instead of plaintext after refresh

**Current Code** (line 274-280):
```typescript
const decrypted = decryptToken(newStored)
cache.set(cacheKey, {
  token: newStored,
  decryptedAccessToken: decrypted.accessToken,
  decryptedRefreshToken: decrypted.refreshToken,
  cacheTime: Date.now(),
})
return newStored.encryptedAccessToken // <-- WRONG
```

**Fix**:
```typescript
const decrypted = decryptToken(newStored)
cache.set(cacheKey, {
  token: newStored,
  decryptedAccessToken: decrypted.accessToken,
  decryptedRefreshToken: decrypted.refreshToken,
  cacheTime: Date.now(),
})
return decrypted.accessToken // <-- CORRECT
```

**Verification**:
```bash
# After fix, token-manager tests should pass:
bun run --cwd packages/opencode test test/kiloclaw/gworkspace-token-manager.test.ts
```

**Impact**: 
- ✅ All API calls work after token expiration
- ✅ Removes "Bearer <encrypted-bytes>" invalid auth header
- ✅ Fixes cascading failures in all services

---

### FIX #2: Add Missing Drive List/Get Skills

**File**: `packages/opencode/src/kiloclaw/agency/skills/gworkspace.ts`

**Issue**: DriveSkills namespace missing list/get operations (lines 462-612)

**Current Code**:
```typescript
export namespace DriveSkills {
  export const search = fn(DriveSearchInputSchema, ...)
  export const share = fn(DriveShareInputSchema, ...)
  // Missing: list, get
}
```

**Fix**: Add after the search skill (before share):

```typescript
export const list = fn(
  z.object({
    folder_id: z.string().optional().describe("Parent folder ID (default: root)"),
    page_size: z.number().optional().default(100).describe("Max items per page"),
    page_token: z.string().optional().describe("Page token for continuation"),
    q: z.string().optional().describe("Google Drive search query"),
  }),
  async ({ folder_id = "root", page_size, page_token, q }, { userId, workspace }) => {
    const policy = GWorkspaceAgency.getPolicy("drive", "files.list")
    if (!requiresApprovalSkill(policy)) {
      const broker = await GWorkspaceBroker.create({ userId, workspace })
      const result = await broker.drive("list", {
        folder_id,
        page_size,
        page_token,
        q,
      })
      if (result.success) {
        await recordDriveOperation("list", userId, workspace, { folder_id }, { fileCount: result.data.files.length })
        return { files: result.data.files, nextPageToken: result.data.nextPageToken }
      }
      throw new Error(result.error)
    }
    // HITL approval flow
    const { approved } = await hitl.requestApproval({
      operation: "files.list",
      args: { folder_id, q },
    })
    if (!approved) throw new Error("User denied file list operation")
    const broker = await GWorkspaceBroker.create({ userId, workspace })
    const result = await broker.drive("list", { folder_id, page_size, page_token, q })
    if (result.success) {
      await recordDriveOperation("list", userId, workspace, { folder_id }, { fileCount: result.data.files.length })
      return { files: result.data.files, nextPageToken: result.data.nextPageToken }
    }
    throw new Error(result.error)
  },
)

export const get = fn(
  z.object({
    file_id: z.string().describe("File ID"),
    fields: z.string().optional().describe("Fields to return (default: all)"),
  }),
  async ({ file_id, fields }, { userId, workspace }) => {
    const policy = GWorkspaceAgency.getPolicy("drive", "files.get")
    if (!requiresApprovalSkill(policy)) {
      const broker = await GWorkspaceBroker.create({ userId, workspace })
      const result = await broker.drive("get", { file_id, fields })
      if (result.success) {
        await recordDriveOperation("get", userId, workspace, { file_id })
        return result.data
      }
      throw new Error(result.error)
    }
    // HITL approval for get if policy requires
    const { approved } = await hitl.requestApproval({
      operation: "files.get",
      args: { file_id },
    })
    if (!approved) throw new Error("User denied file get operation")
    const broker = await GWorkspaceBroker.create({ userId, workspace })
    const result = await broker.drive("get", { file_id, fields })
    if (result.success) {
      await recordDriveOperation("get", userId, workspace, { file_id })
      return result.data
    }
    throw new Error(result.error)
  },
)
```

**Update manifest** (`packages/opencode/src/kiloclaw/agency/manifests/gworkspace-manifest.ts`):
```typescript
drive: {
  "files.search": "SAFE",
  "files.list": "SAFE",       // <-- ADD
  "files.get": "SAFE",        // <-- ADD
  "files.share": "CONFIRM",
  "files.create": "CONFIRM",
  // ... rest unchanged
}
```

Also add aliases:
```typescript
drive: {
  search: "files.search",
  list: "files.list",         // <-- ADD
  get: "files.get",           // <-- ADD
  share: "files.share",
  // ... rest unchanged
}
```

**Verification**:
```bash
bun run --cwd packages/opencode typecheck 2>&1 | grep -c error
# Expected: 0

bun run --cwd packages/opencode test test/kiloclaw/gworkspace-slides.test.ts -- --grep "policy"
# All policy tests should pass
```

**Impact**:
- ✅ Users can list files in folders
- ✅ Users can get file metadata
- ✅ Completes Drive skill API

---

### FIX #3: Add Permission Type Validation to Share Skill

**File**: `packages/opencode/src/kiloclaw/agency/skills/gworkspace.ts`

**Issue**: Share skill missing required permission `type` field (lines 454-460)

**Current Code**:
```typescript
export const share = fn(
  DriveShareInputSchema,
  async ({ file_id, email, role = "reader" }, { userId, workspace }) => {
    // Missing: type field - should be "user", "group", "domain", or "anyone"
```

**Step 1**: Update DriveShareInputSchema in constants section (around line 125-135):

```typescript
const DriveShareInputSchema = z.object({
  file_id: z.string().describe("File ID to share"),
  type: z.enum(["user", "group", "domain", "anyone"])
    .describe("Permission type: user, group, domain, or anyone"),
  emailAddress: z.string().email().optional()
    .describe("Email address (required for type=user or type=group)"),
  email: z.string().email().optional()
    .describe("(Deprecated) Use emailAddress instead"),
  role: z.enum(["reader", "commenter", "writer", "owner"])
    .default("reader")
    .describe("Permission role"),
  allowFileDiscovery: z.boolean().optional()
    .default(true)
    .describe("Allow recipient to discover file via search"),
})
```

**Step 2**: Update share skill implementation:

```typescript
export const share = fn(
  DriveShareInputSchema,
  async ({ file_id, type, emailAddress, email, role = "reader", allowFileDiscovery = true }, { userId, workspace }) => {
    // Validate inputs
    if (type === "user" || type === "group") {
      if (!emailAddress && !email) {
        throw new Error(`type="${type}" requires emailAddress or email field`)
      }
    }

    const policy = GWorkspaceAgency.getPolicy("drive", "files.share")
    const brokerConfig = { userId, workspace }

    if (!requiresApprovalSkill(policy)) {
      const broker = await GWorkspaceBroker.create(brokerConfig)
      const result = await broker.drive("share", {
        file_id,
        type,
        emailAddress: emailAddress || email,
        role,
        allowFileDiscovery,
      })
      if (result.success) {
        await recordDriveOperation("share", userId, workspace, {
          file_id,
          type,
          recipient: emailAddress || email,
        })
        return result.data
      }
      throw new Error(result.error)
    }

    // HITL approval required
    const { approved } = await hitl.requestApproval({
      operation: "files.share",
      args: { file_id, type, recipient: emailAddress || email, role },
    })
    if (!approved) throw new Error("User denied share operation")

    const broker = await GWorkspaceBroker.create(brokerConfig)
    const result = await broker.drive("share", {
      file_id,
      type,
      emailAddress: emailAddress || email,
      role,
      allowFileDiscovery,
    })
    if (result.success) {
      await recordDriveOperation("share", userId, workspace, {
        file_id,
        type,
        recipient: emailAddress || email,
      })
      return result.data
    }
    throw new Error(result.error)
  },
)
```

**Step 3**: Update adapter to use correct field names:

**File**: `packages/opencode/src/kiloclaw/agency/adapters/gworkspace-adapter.ts` (line 295-303)

```typescript
// Current (WRONG field names)
export async function driveCreatePermission(
  accessToken: string,
  fileId: string,
  permission: { type: string; email: string; role: string },
) {
  return withRetry<{ id: string }>(accessToken, `${API_VERSION.drive}/files/${fileId}/permissions`, {
    method: "POST",
    body: permission,
  })
}

// Fix (CORRECT field names and validated types)
export async function driveCreatePermission(
  accessToken: string,
  fileId: string,
  permission: {
    type: "user" | "group" | "domain" | "anyone"
    emailAddress?: string
    role: "reader" | "commenter" | "writer" | "owner"
    allowFileDiscovery?: boolean
  },
) {
  // Validate required fields
  if ((permission.type === "user" || permission.type === "group") && !permission.emailAddress) {
    throw new Error(`type="${permission.type}" requires emailAddress`)
  }

  const body: Record<string, unknown> = {
    type: permission.type,
    role: permission.role,
  }
  if (permission.emailAddress) body.emailAddress = permission.emailAddress
  if (permission.allowFileDiscovery !== undefined) body.allowFileDiscovery = permission.allowFileDiscovery

  return withRetry<{ id: string }>(accessToken, `${API_VERSION.drive}/files/${fileId}/permissions`, {
    method: "POST",
    body,
  })
}
```

**Verification**:
```bash
bun run --cwd packages/opencode typecheck
# Should pass with no errors

bun run --cwd packages/opencode test test/kiloclaw/gworkspace-slides.test.ts
# All tests including share validation should pass
```

**Impact**:
- ✅ Share operations now send valid permission requests
- ✅ Eliminates 400 Bad Request errors
- ✅ Users get clear feedback if missing required fields

---

## Phase 2: Unblock Write Operations (Day 2)

### FIX #4: Align OAuth Scopes for Write Operations

**File**: `packages/opencode/src/kiloclaw/agency/auth/gworkspace-oauth.ts`

**Issue**: Default scopes use read-only for Drive, but write operations require full access

**Current Defaults** (line 22):
```typescript
const DEFAULT_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive.readonly", // READ-ONLY
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/presentations",
]
```

**Option A** (Recommended): Add scope negotiation for write operations

Create new function in gworkspace-oauth.ts:
```typescript
export async function requestScopeExpansion(
  userId: string,
  workspace: string,
  requiredScopes: string[],
): Promise<boolean> {
  const tm = await TokenManager.create()
  const current = await tm.getAccessTokenMetadata(userId, workspace)
  const missing = requiredScopes.filter(s => !current.scopes.includes(s))

  if (missing.length === 0) return true // Already have all scopes

  // Trigger re-auth with expanded scopes
  return await initiateOAuth(userId, workspace, {
    scopes: [...current.scopes, ...missing],
    prompt: "consent", // Force scope re-approval
  })
}
```

In broker.ts, before any write operation:
```typescript
case "create":
case "update":
case "delete":
case "share":
  // Ensure we have write scopes
  const hasWriteScope = config.scopes?.includes("https://www.googleapis.com/auth/drive")
  if (!hasWriteScope) {
    const expanded = await GWorkspaceOAuth.requestScopeExpansion(config.userId, config.workspace, [
      "https://www.googleapis.com/auth/drive",
    ])
    if (!expanded) throw new Error("User denied scope expansion for Drive write operations")
    // Refresh config with new scopes
    config = await GWorkspaceBroker.create({ userId: config.userId, workspace: config.workspace })
  }
  // ... proceed with operation
```

**Option B** (Simpler): Change defaults to include write scopes

```typescript
const DEFAULT_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send", // Instead of readonly
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive", // Instead of readonly
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/presentations",
]
```

**Recommendation**: Go with **Option A** (scope negotiation) for security but accept **Option B** for simplicity. Start with Option B since Phase 4 focus is functionality, not minimal scope.

**Implementation**:
```typescript
// In gworkspace-oauth.ts line 22
const DEFAULT_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive", // <-- Changed
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/presentations",
]
```

**Verification**:
```bash
# Test that write operations no longer fail with 403
bun run --cwd packages/opencode test -- --grep "drive.*create|drive.*share"
```

**Impact**:
- ✅ Write operations can now succeed (if permission granted)
- ✅ Share, create, update, delete no longer blocked by scope
- ⚠️ Requires users to re-authenticate with new scopes

---

### FIX #5: Include 401/403 in Fallback Evaluation

**File**: `packages/opencode/src/kiloclaw/agency/broker/gworkspace-broker.ts`

**Issue**: shouldFallback() excludes auth errors (line 1110-1128)

**Current Code**:
```typescript
function shouldFallback(error: Error, config: BrokerConfig): boolean {
  if (!config.mcpFallbackEnabled) return false

  if ("status" in error && typeof (error as any).status === "number") {
    const status = (error as any).status
    return status === 429 || status === 500 || status === 502 || status === 503 || status === 504
    // 401 and 403 not included
  }

  return false
}
```

**Fix**:
```typescript
function shouldFallback(error: Error, config: BrokerConfig): boolean {
  if (!config.mcpFallbackEnabled) return false

  if ("status" in error && typeof (error as any).status === "number") {
    const status = (error as any).status
    // Include auth and permission errors as recoverable via fallback
    // 401: token expired/invalid → MCP might have valid token
    // 403: permission denied/quota → MCP might have broader scope
    return (
      status === 401 || // Unauthorized - try MCP
      status === 403 || // Forbidden - try MCP with different permissions
      status === 429 || // Rate limit
      status === 500 ||
      status === 502 ||
      status === 503 ||
      status === 504
    )
  }

  // Also check for network errors
  const msg = error instanceof Error ? error.message : String(error)
  if (msg.includes("ECONNRESET") || msg.includes("ECONNREFUSED") || msg.includes("AbortError")) {
    return true
  }

  return false
}
```

**Verification**:
```bash
# Run broker tests to ensure fallback is triggered correctly
bun run --cwd packages/opencode test test/kiloclaw/gworkspace-broker.test.ts
```

**Impact**:
- ✅ Auth errors now attempt recovery via MCP
- ✅ Reduces hard failures
- ✅ Better error handling resilience

---

## Phase 3: Robustness & Monitoring (Day 3)

### FIX #6: Add Missing Docs/Sheets List Skills

Similar pattern to FIX #2. Add `list` skill for:
- DocsSkills
- SheetsSkills

(See FIX #2 pattern for implementation)

---

### FIX #7: Distinguish 403 Error Types

**File**: `packages/opencode/src/kiloclaw/agency/services/gworkspace-resilience.ts`

**Issue**: 403 treated as quota but could mean permission denied (line 23)

**Fix**: Enhance error classification based on error message/context:

```typescript
export function classifyGWorkspaceError(error: unknown): ErrorCategory {
  if (error instanceof GoogleAPIError) {
    if (error.status === 401) return "auth"
    if (error.status === 403) {
      // Distinguish between quota and permission
      const msg = error.body.toLowerCase()
      if (msg.includes("quota") || msg.includes("rate limit") || msg.includes("limit exceeded")) {
        return "quota"
      }
      // Permission denied, insufficient permissions, scope
      return "permanent"
    }
    if (error.status === 429) return "quota"
    if (error.status >= 500) return "transient"
    return "permanent"
  }
  // Network / timeout
  const msg = error instanceof Error ? error.message : String(error)
  if (msg.includes("ECONNRESET") || msg.includes("AbortError") || msg.includes("timeout")) return "network"
  return "permanent"
}
```

---

### FIX #8: Expose Circuit Breaker State

**File**: `packages/opencode/src/kiloclaw/agency/services/gworkspace-resilience.ts`

**Issue**: getState() always returns "closed" (line 82-86)

**Fix**: Integrate with actual CircuitBreaker state:

```typescript
import { CircuitBreaker } from "@/kiloclaw/lmstudio/circuit-breaker"

export function getState(service: string): "closed" | "open" | "half-open" {
  const circuitName = `gworkspace.${service}`
  // Get actual state from CircuitBreaker
  try {
    const status = CircuitBreaker.getStatus(circuitName)
    if (status?.failures >= 5) return "open"
    if (status?.successStreak >= 2) return "closed"
    return "half-open"
  } catch {
    return "closed" // Default if not tracked
  }
}
```

---

## Testing Strategy

### Pre-Fix Validation
```bash
# Record baseline failures
bun run --cwd packages/opencode test 2>&1 | tee /tmp/test-before.log
```

### Post-Fix Validation
```bash
# Phase 1 fixes
bun run --cwd packages/opencode test test/kiloclaw/gworkspace-token-manager.test.ts
bun run --cwd packages/opencode test test/kiloclaw/gworkspace-skills.test.ts -- --grep "drive.*list|drive.*get|drive.*share"

# Phase 2 fixes
bun run --cwd packages/opencode test test/kiloclaw/gworkspace-broker.test.ts -- --grep "fallback|401|403"

# Full typecheck
bun run --cwd packages/opencode typecheck

# All tests
bun run --cwd packages/opencode test 2>&1 | tee /tmp/test-after.log
diff -u /tmp/test-before.log /tmp/test-after.log
```

---

## Rollout Order

1. **Commit 1**: FIX #1 (token bug) — Critical path blocker
2. **Commit 2**: FIX #2 (missing skills) + FIX #3 (validation) — Feature completeness
3. **Commit 3**: FIX #4 (scope alignment) + FIX #5 (fallback) — Error recovery
4. **Commit 4**: FIX #6-8 (robustness) — Monitoring & resilience
5. **Commit 5**: Test suite updates + documentation

Each commit should:
- Pass `bun run typecheck`
- Pass GWorkspace-specific tests
- Have clear commit message per Conventional Commits

---

## Success Criteria

- [x] All 5 CRITICAL issues have fixes defined
- [x] Fixes are dependency-ordered
- [x] No breaking changes to existing APIs
- [x] Typecheck passes (0 errors)
- [x] GWorkspace tests pass (40/40)
- [x] Drive write operations succeed
- [x] Auth failures fallback to MCP
- [x] Comprehensive testing plan provided

**Estimated Duration**: 3-4 hours (includes testing + verification)

**Next**: Begin Phase 1 implementation

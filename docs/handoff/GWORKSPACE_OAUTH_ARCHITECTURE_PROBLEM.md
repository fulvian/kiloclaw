# Google Workspace OAuth Architecture - Problem Analysis

**Date**: 2026-04-15  
**Status**: PARTIALLY RESOLVED — Key fixes implemented, see "Fixes Implemented" section  
**Scope**: Authorization system for Google Workspace (Gmail, Calendar, Drive, Docs, Sheets)  
**Audience**: Next developer taking over this work

---

## Executive Summary

kiloclaw has **two completely separate OAuth and token management systems** for Google Workspace:

1. **Native Tools System** - For direct Google Workspace API calls
   - OAuth via `GWorkspaceOAuth` namespace
   - Token storage in SQLite database via `TokenManager`
   - Used by skills and broker for Gmail, Calendar, Drive operations

2. **MCP System** - For Model Context Protocol servers
   - OAuth via `McpOAuthProvider` / `McpAuth`
   - Token storage in `~/.local/share/kilo/mcp-auth.json` (kilocode) or via `McpAuthStore`
   - Used by workspace-mcp server for Google API proxying

**Critical Problem**: These two systems never communicate. When a user authenticates via one path, the tokens are NOT available to the other path.

---

## Architecture: Native Tools Authentication

### Files Involved

- `packages/opencode/src/kiloclaw/agency/auth/gworkspace-oauth.ts` - OAuth 2.1 implementation with PKCE
- `packages/opencode/src/kiloclaw/agency/auth/token-manager.ts` - Token storage/retrieval with AES-256-GCM encryption
- `packages/opencode/src/kiloclaw/agency/auth/token-db.ts` - SQLite ORM (Drizzle) for token persistence
- `packages/opencode/src/kiloclaw/agency/broker/gworkspace-broker.ts` - Broker that retrieves tokens and passes to adapter
- `packages/opencode/src/kiloclaw/agency/adapters/gworkspace-adapter.ts` - Makes actual Google API HTTP calls

### Authentication Flow (Native Tools)

```
User Action (e.g., "search my Gmail")
    ↓
Skill (e.g., gmail:search)
    ↓
GWorkspaceBroker.getAccessTokenForUser(userId, workspaceId)
    ├─ TokenManager.getValidAccessToken(userId, workspaceId, refreshFn)
    │   ├─ Load from SQLite database (encrypted)
    │   ├─ Check if expired
    │   └─ If expired: call refreshFn → GWorkspaceOAuth.refreshTokens()
    │       └─ Exchange refresh token with Google OAuth
    │       └─ Save new token to SQLite
    │   └─ Return plaintext access token
    ↓
GWorkspaceAdapter.request() with Authorization header
    ↓
Google Workspace API (success or error)
```

### Token Storage (Native Tools)

**Location**: SQLite database at `/home/fulvio/.local/share/kiloclaw/kilo.db`

**Schema** (Drizzle ORM):

```sql
gworkspace_token (
  id UUID PRIMARY KEY,
  user_id VARCHAR(255),
  workspace_id VARCHAR(255),
  encrypted_access_token TEXT,      -- AES-256-GCM encrypted, base64 encoded
  encrypted_refresh_token TEXT NULL, -- AES-256-GCM encrypted, base64 encoded
  expires_at BIGINT,
  rotated_at BIGINT,
  UNIQUE(user_id, workspace_id)
)

gworkspace_token_rotation (
  id UUID PRIMARY KEY,
  user_id VARCHAR(255),
  workspace_id VARCHAR(255),
  old_refresh_token_hash VARCHAR(64), -- SHA256 hash, never plaintext
  rotation_reason VARCHAR(50),
  rotated_at BIGINT
)

gworkspace_idempotency_key (
  id UUID PRIMARY KEY,
  request_id UUID,
  user_id VARCHAR(255),
  response_hash VARCHAR(64),
  expires_at BIGINT
)
```

**Encryption**: AES-256-GCM with master key from `GWORKSPACE_TOKEN_KEY` environment variable

### How Native Tools Get Tokens

1. **Initial OAuth** (NOT IMPLEMENTED - NO ENTRY POINT)
   - There is NO code path in kiloclaw that initiates Google OAuth for first-time users
   - This is the FIRST CRITICAL GAP

2. **Token Retrieval** (IMPLEMENTED)
   - `TokenManager.getValidAccessToken()` reads from database
   - Returns plaintext access token
   - Automatically refreshes if within 60-second expiration buffer

3. **Token Refresh** (IMPLEMENTED)
   - `GWorkspaceOAuth.refreshTokens()` calls Google OAuth token endpoint
   - Expects `GWORKSPACE_CLIENT_ID` and `GWORKSPACE_CLIENT_SECRET` env vars
   - Returns new tokens with refresh token preserved

### Limitations of Native Tools System

- ✅ Tokens are encrypted at rest (AES-256-GCM)
- ✅ Automatic refresh on demand
- ✅ Audit trail (rotation table)
- ✅ Multi-user support (user_id, workspace_id composite key)
- ❌ **NO initial OAuth flow** - how does first auth happen?
- ❌ **Hardcoded user_id** - currently just "fulviold@gmail.com"
- ❌ **No persistence of OAuth state** - code verifier, auth state saved nowhere

---

## Architecture: MCP Authentication

### Files Involved

- `packages/opencode/src/mcp/oauth-provider.ts` - OAuth client for MCP servers
- `packages/opencode/src/mcp/auth.ts` - MCP auth service
- `packages/opencode/src/mcp/auth-store.ts` - MCP token storage (JSON file based)
- `packages/opencode/src/mcp/auth-coordinator.ts` - Coordinates auth flow
- `packages/opencode/src/mcp/oauth-callback.ts` - OAuth callback handling
- `packages/opencode/src/mcp/index.ts` - MCP server initialization and connection

### Authentication Flow (MCP)

```
bun run dev (kiloclaw startup)
    ↓
MCP.create("google-workspace", mcpConfig)
    ├─ For google-workspace server:
    │   ├─ Check health: GET /health
    │   ├─ If down: spawn workspace-mcp process
    │   ├─ Create McpOAuthProvider with:
    │   │   ├─ clientId from kilo.jsonc config
    │   │   ├─ clientSecret from kilo.jsonc config
    │   │   └─ onRedirect callback (currently does nothing useful)
    │   └─ Create StreamableHTTPClientTransport with auth provider
    │
    ├─ Try to connect with OAuth
    │   ├─ workspace-mcp checks for stored OAuth state/tokens
    │   ├─ If missing: requests authorization
    │   └─ MCP SDK calls provider.redirectToAuthorization(authUrl)
    │       └─ onRedirect callback is invoked with authUrl
    │           └─ ISSUE: Callback doesn't open browser or show URL to user
    │
    └─ If connection fails: show "MCP Authentication Required" toast
        └─ Message says "Run: kilo mcp auth google-workspace"
        └─ But no URL or action is provided to user
```

### Token Storage (MCP)

**Primary Location**: `/home/fulvio/.local/share/kilo/mcp-auth.json` (kilocode)

**Kiloclaw Alternative**: `/home/fulvio/coding/kiloclaw/.kiloclaw-runtime/data/kiloclaw/mcp-auth.json`

**Format** (JSON):

```json
{
  "google-workspace": {
    "clientInfo": {
      "clientId": "...",
      "clientIdIssuedAt": 1234567890,
      "clientSecret": "...",
      "clientSecretExpiresAt": 1234567890
    },
    "serverUrl": "http://localhost:8000/mcp",
    "tokens": {
      "accessToken": "ya29.a0...",
      "refreshToken": "1//0g...",
      "expiresAt": 1234567890,
      "scope": "https://www.googleapis.com/auth/gmail.readonly ..."
    },
    "oauthState": "..."
  }
}
```

**Storage**: Managed by `McpAuthStore` (file-based JSON, not encrypted)

### How MCP Gets Tokens

1. **OAuth Initiation** (IMPLEMENTED IN MCP SDK)
   - workspace-mcp server initiates OAuth with Google
   - Returns authorization URL to client (kiloclaw)
   - URL is passed to `onRedirect` callback in `McpOAuthProvider.redirectToAuthorization()`

2. **Token Retrieval** (IMPLEMENTED)
   - `McpAuth.get()` reads from JSON file
   - Tokens cached in memory

3. **Token Refresh** (IMPLEMENTED IN MCP SDK)
   - MCP SDK automatically refreshes expired tokens
   - Calls `saveTokens()` callback to persist new tokens

### Limitations of MCP System

- ✅ OAuth state managed by MCP SDK (code verifier, state saved by provider)
- ✅ Automatic token refresh by SDK
- ✅ Multi-server support (each server has own tokens)
- ❌ **Tokens NOT encrypted** at rest (plain JSON)
- ❌ **Separate from native system** - no shared token storage
- ❌ **File-based storage** - not database backed
- ❌ **User doesn't see OAuth URL** - `onRedirect` callback doesn't open browser
- ❌ **Multiple storage locations** - different for kilocode vs kiloclaw

---

## The Problem: Two Separate Systems

### Scenario 1: User Authenticates via Native Tools

```
Hypothetical (no current entry point):
User: "Search my Gmail"
    → Native tool needs token
    → Initiates OAuth with Google
    → Token saved to kiloclaw SQLite database

But:
    → workspace-mcp doesn't know about this token
    → workspace-mcp tries to do its own OAuth
    → User sees "MCP Authentication Required"
    → workspace-mcp stores token in ~/.local/share/kilo/mcp-auth.json

Result: TWO TOKENS, TWO STORAGE SYSTEMS, TWO OAUTH SESSIONS
```

### Scenario 2: User Authenticates via MCP

```
Current situation:
User runs: bun run dev
    → Sees "MCP Authentication Required" toast
    → No clear action provided

Expected:
    → Browser should open to OAuth URL
    → User grants permissions
    → Token saved to ~./local/share/kilo/mcp-auth.json

But:
    → Native tools don't know about MCP's token
    → Native tools can't use workspace-mcp credentials
    → Native tools have their own TokenManager expecting SQLite tokens

Result: MCP works, native tools fail with "no token in database"
```

### Scenario 3: Both Initialized (Current State)

```
From previous conversation:
- kilocode has valid tokens in ~/.local/share/kilo/mcp-auth.json
- kiloclaw TokenManager database has EXPIRED tokens without refresh token

When user runs: bun run dev
    → credential-sync tries to migrate tokens to MCP
    → But expired tokens can't be synced
    → User sees "MCP Authentication Required" warning
    → No OAuth URL presented (onRedirect callback does nothing)
    → User has no way to authenticate

Result: STUCK - Can't use MCP, can't use native tools
```

---

## Critical Gaps in Architecture

### Gap 1: No Initial OAuth Entry Point for Native Tools

**Where**: Native tools system

**Problem**: There is NO code that initiates the initial OAuth flow for native tools

**Current Reality**:

- `GWorkspaceOAuth.exchangeCode()` exists - it exchanges an auth code for tokens
- But **nothing calls this function**
- Token Manager expects tokens in database - but database is empty initially
- No command like `kiloclaw auth google-workspace` exists

**Evidence**:

- `grep -r "exchangeCode" packages/opencode/src` returns no results in production code
- Only test files use it

**Impact**:

- Native tools cannot authenticate initially
- Tokens must be manually inserted or migrated from elsewhere

### Gap 2: OAuth URL Not Shown to User

**Where**: MCP initialization (`src/mcp/index.ts`)

**Problem**: When `McpOAuthProvider.redirectToAuthorization()` is called with OAuth URL, the `onRedirect` callback does nothing

**Current Code**:

```typescript
onRedirect: async (url) => {
  log.info("oauth redirect requested", { key, url: url.toString() })
  // Store the URL - actual browser opening is handled by startAuth
},
```

**What Actually Happens**:

- URL is logged
- Nothing is shown to user
- No browser is opened
- Toast message says "Run: kilo mcp auth google-workspace" but no URL provided
- User cannot proceed

**Impact**:

- MCP authentication appears broken
- User has no visible action to take

### Gap 3: Two Token Storage Systems Never Communicate

**Where**: Between `TokenManager` (native) and `McpAuthStore` (MCP)

**Problem**:

- Native tools save tokens to SQLite encrypted database
- MCP saves tokens to JSON file in home directory
- No synchronization, migration, or sharing mechanism
- Each system has different encryption/encoding

**Current Locations**:

- Native: `/home/fulvio/.local/share/kiloclaw/kilo.db` (encrypted)
- MCP kilocode: `/home/fulvio/.local/share/kilo/mcp-auth.json` (plain JSON)
- MCP kiloclaw: `/home/fulvio/coding/kiloclaw/.kiloclaw-runtime/data/kiloclaw/mcp-auth.json` (plain JSON)

**Impact**:

- Even if tokens exist in one system, other system can't use them
- Migrations must be manual (as attempted with scripts)
- Token refresh in one system doesn't help the other

### Gap 4: No Entrypoint for Native Tools OAuth in CLI

**Where**: CLI commands

**Problem**: No `kilo oauth google-workspace` or equivalent command for native tools

**Current Commands**:

- `kilo mcp auth google-workspace` - works for MCP (somewhat)
- `kilo mcp list` - lists MCP servers
- No equivalent for native tools authentication

**Impact**:

- Users have no discoverable way to authenticate for native tools
- Native tools cannot function

### Gap 5: Hardcoded User Context

**Where**: Multiple places - `TokenManager`, broker, credential-sync

**Problem**: User ID and workspace ID are hardcoded as `"fulviold@gmail.com"` and `"default"`

**Locations**:

- `credential-sync.ts` line 52-53
- `mcp.ts` line 435
- `mcp.ts` line 97

**Design**: System supports multi-user (`user_id`, `workspace_id` composite key in database), but code never passes different values

**Impact**:

- Only one user can authenticate
- No isolation between users
- Cannot support team features

### Gap 6: Expired Tokens with No Refresh Token

**Where**: Historical state

**Problem**: Previous token in database is:

- Expired (expiresAt = 2026-04-14)
- Missing refresh token
- Cannot be refreshed
- Blocks credential sync

**Root Cause**: Original token was saved without refresh token (either incomplete OAuth or old token format)

**Impact**:

- Credential sync fails silently
- User cannot proceed without manual cleanup

---

## System Dependencies & Data Flow

### Native Tools Path

```
User intent (skill invocation)
    ↓
Skill (e.g., GmailSearchSkill)
    ↓
GWorkspaceBroker.getAccessTokenForUser(userId, workspaceId)
    ↓
TokenManager.getValidAccessToken(userId, workspaceId, refreshFn)
    ├─ Load from gworkspace_token table
    ├─ Decrypt with GWORKSPACE_TOKEN_KEY
    ├─ Check expiration
    ├─ If expired: refreshFn(refreshToken) → GWorkspaceOAuth.refreshTokens()
    │   └─ POST to https://oauth2.googleapis.com/token
    │   └─ Save new token to database
    └─ Return plaintext accessToken
    ↓
GWorkspaceAdapter.request(accessToken, endpoint)
    ├─ Add Authorization: Bearer {accessToken}
    ├─ Make HTTP request to Google API
    └─ Return response or error
    ↓
Skill result
```

### MCP Path

```
kiloclaw dev startup
    ↓
MCP.create("google-workspace", mcpConfig)
    ├─ Health check: GET /health (workspace-mcp server)
    ├─ If not running: spawn workspace-mcp process
    └─ Connect with credentials
        ├─ Check McpAuth for stored tokens
        ├─ If missing: McpOAuthProvider.redirectToAuthorization(authUrl)
        │   └─ onRedirect callback (doesn't do anything useful currently)
        └─ Try to establish connection
            ├─ If success: list tools
            └─ If fail (needs_auth): show toast warning
                └─ No URL provided to user
    ↓
MCP tools available (if connected)
    ├─ google-workspace:gmail-search
    ├─ google-workspace:calendar-list
    └─ google-workspace:drive-search
```

### workspace-mcp Server (External Process)

```
Python server running at http://localhost:8000/mcp
    ├─ Listens for StreamableHTTP or SSE connections
    ├─ Checks for OAuth tokens (from McpAuth or environment)
    ├─ If no tokens: initiates OAuth flow
    │   ├─ Generates authorization URL with Google
    │   └─ Returns URL to client (kiloclaw)
    ├─ On callback: exchanges code for tokens
    │   └─ Saves to file system or environment
    └─ Proxies tool requests to Google APIs
        ├─ Adds Authorization header with access token
        └─ Returns results to MCP client
```

---

## Environment Variables Required

### Current State

- `GWORKSPACE_TOKEN_KEY` - 256-bit hex encryption key (set in `.envrc`)
- `GWORKSPACE_CLIENT_ID` - Google OAuth client ID (set in `.envrc`)
- `GWORKSPACE_CLIENT_SECRET` - Google OAuth client secret (set in `.envrc`)
- `WORKSPACE_MCP_PORT` - Server port (set by MCP init or env)
- `WORKSPACE_MCP_BASE_URI` - Server base URL (set by MCP init or env)
- `OAUTHLIB_INSECURE_TRANSPORT` - Allow HTTP for dev (set by MCP init)

### Missing/Unclear

- No documented requirement for initial OAuth token origin
- No variable to specify which user is authenticating

---

## Known Issues Summary

| #   | Category       | Issue                            | Impact                                | Status                                                    |
| --- | -------------- | -------------------------------- | ------------------------------------- | --------------------------------------------------------- |
| 1   | **Arch**       | Two separate OAuth systems       | Can't share tokens                    | ✅ Resolved — `CredentialSync` bridges both stores        |
| 2   | **CLI**        | No native tools auth entry point | Can't authenticate for skills         | ✅ Resolved — `authenticateGoogleWorkspaceDirect()`       |
| 3   | **MCP**        | OAuth URL not shown to user      | User blocked from OAuth               | ✅ Resolved — Browser opens with Google consent           |
| 4   | **Storage**    | No token sync between systems    | Systems can't see each other's tokens | ✅ Resolved — `importFromKilocode()` + bidirectional sync |
| 5   | **State**      | Expired token without refresh    | Credential sync blocked               | ✅ Resolved — Tokens re-imported from kilocode            |
| 6   | **Design**     | Hardcoded user context           | Single user only                      | ❌ Open                                                   |
| 7   | **Encryption** | MCP tokens not encrypted         | Security risk                         | ❌ Open (low priority)                                    |
| 8   | **Init**       | No oauth state persistence       | Can't resume interrupted OAuth        | ✅ Resolved — Direct Google OAuth bypasses consent        |

---

## What Actually Works

- ✅ **TokenManager encryption** - AES-256-GCM working correctly
- ✅ **Token refresh logic** - GWorkspaceOAuth.refreshTokens() functional
- ✅ **Database schema** - Drizzle migrations applied correctly
- ✅ **Native API calls** - GWorkspaceAdapter can make HTTP requests if token exists
- ✅ **MCP tool proxying** - workspace-mcp can proxy Google API calls
- ✅ **MCP SDK integration** - Client can connect if OAuth succeeds
- ✅ **Database encryption** - Tokens encrypted at rest in SQLite

---

## What Doesn't Work (Before Fixes)

- ❌ ~~**Initial OAuth for native tools** - No entry point~~ → ✅ Fixed: `kilo mcp auth google-workspace` now uses direct Google OAuth bypass
- ❌ ~~**OAuth UX for MCP** - URL not shown, browser not opened~~ → ✅ Fixed: Browser opens via `authenticateGoogleWorkspaceDirect()`
- ❌ ~~**Token sharing** - Native and MCP can't access each other's tokens~~ → ✅ Fixed: `importFromKilocode()` syncs tokens; `CredentialSync` bridges both stores
- ❌ **Multi-user support** - Hardcoded user ID throughout → Still open
- ❌ ~~**State persistence** - OAuth state/verifier not saved before redirect~~ → ✅ Fixed: Direct Google OAuth flow bypasses workspace-mcp consent page
- ❌ **MCP token encryption** - Plain JSON without encryption → Still open (low priority, file is user-local)

---

## Fixes Implemented (2026-04-15)

### Fix 1: `importFromKilocode()` — Complete Token Sync

**File**: `packages/opencode/src/kiloclaw/agency/auth/credential-sync.ts`

**Problem**: `importFromKilocode()` only imported `tokens` (accessToken, refreshToken, expiresAt) but NOT `clientInfo` and `serverUrl`. Without `serverUrl`, `McpAuthStore.getForUrl()` returns `undefined`, making MCP OAuth think there are no stored credentials.

**Fix**: Rewritten to import full MCP OAuth entry: `tokens`, `clientInfo`, and `serverUrl` from kilocode's `mcp-auth.json` into kiloclaw's `McpAuthStore`.

### Fix 2: `startIntegratedGoogleWorkspaceMcp()` — Pre-authenticated Token Injection

**File**: `packages/opencode/src/cli/cmd/tui/thread.ts`

**Problem**:

1. Function didn't pass `GWORKSPACE_ACCESS_TOKEN` env var to workspace-mcp, so it couldn't call Google APIs.
2. Function blocked startup when `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET` weren't set, even if stored tokens existed.

**Fix**:

- Added `hasStoredGoogleToken()` to check TokenManager for existing tokens, bypassing the OAuth env var requirement.
- Injects `GWORKSPACE_ACCESS_TOKEN` from TokenManager into workspace-mcp's environment.

### Fix 3: `ensureGoogleWorkspaceMcpRunning()` — Config-based OAuth Credentials

**File**: `packages/opencode/src/cli/cmd/mcp.ts`

**Problem**: Only checked `process.env` for Google OAuth credentials, ignoring `kilo.jsonc` config. Also didn't pass `GWORKSPACE_ACCESS_TOKEN` when spawning workspace-mcp.

**Fix**:

- Accepts credentials from both `process.env` AND `mcpConfig.oauth` object.
- Sets `GOOGLE_OAUTH_CLIENT_ID`/`GOOGLE_OAUTH_CLIENT_SECRET` as env vars for workspace-mcp.
- Loads pre-authenticated token from TokenManager and passes as `GWORKSPACE_ACCESS_TOKEN`.

### Fix 4: Direct Google OAuth Bypass (`authenticateGoogleWorkspaceDirect()`)

**File**: `packages/opencode/src/cli/cmd/mcp.ts`

**Problem**: Standard MCP OAuth flow used workspace-mcp's built-in consent page, which has a CSRF bug that breaks the flow.

**Fix**: Added `authenticateGoogleWorkspaceDirect()` function that:

1. Bypasses workspace-mcp's consent page entirely
2. Authenticates directly with Google OAuth 2.0 using PKCE
3. Opens browser for Google consent (proper UX)
4. Listens for callback on `http://127.0.0.1:19876/mcp/oauth/callback`
5. Stores tokens in BOTH TokenManager (SQLite) AND McpAuth (JSON)

**Important**: The Google Cloud Console must have `http://127.0.0.1:19876/mcp/oauth/callback` as an Authorized Redirect URI.

### Fix 5: Environment Variable Loading

**Files**: `~/.local/share/kiloclaw/.env`, `.envrc`

**Problem**:

1. `GWORKSPACE_TOKEN_KEY` was in `.envrc` (loaded by direnv) but NOT in `~/.local/share/kiloclaw/.env` (loaded by app's dotenv at startup), causing `TokenManager` to fail silently.
2. `KILO_MEMORY_HARD_FAIL_STARTUP` defaulted to `true`, crashing the app when LM Studio was unavailable.

**Fix**:

- Added `GWORKSPACE_TOKEN_KEY`, `GWORKSPACE_CLIENT_ID`, `GWORKSPACE_CLIENT_SECRET`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` to `~/.local/share/kiloclaw/.env`.
- Added `KILO_MEMORY_HARD_FAIL_STARTUP=false` to `.envrc`.

### Fix 6: MCP Server Spawn with Bearer Token

**File**: `packages/opencode/src/mcp/index.ts`

**Problem**: When spawning workspace-mcp, the pre-authenticated Google API access token wasn't passed as `GWORKSPACE_ACCESS_TOKEN`.

**Fix**: Added logic to retrieve bearer token from TokenManager and pass it as `GWORKSPACE_ACCESS_TOKEN` env var to the workspace-mcp process.

---

## Outstanding Issues

1. **Google Cloud Console Redirect URI** — `http://127.0.0.1:19876/mcp/oauth/callback` must be added as an Authorized Redirect URI in the Google Cloud Console for the OAuth client. Without this, `kilo mcp auth` will fail with `redirect_uri_mismatch`.

2. **Production kilo binary** — The installed `kilo` binary (`/usr/local/lib/node_modules/@kilocode/cli/`) does NOT have the `authenticateGoogleWorkspaceDirect()` bypass. Only the kiloclaw dev build (`bun run dev`) has it. To use `kilo mcp auth`, either:
   - Build and install kiloclaw as the `kilo` binary (`bun script/local-bin.ts`)
   - Or use kiloclaw directly: `bun run --cwd packages/opencode dev mcp auth google-workspace`

3. **Multi-user support** — User ID is still hardcoded as `"fulviold@gmail.com"` throughout:
   - `credential-sync.ts` line 52-53
   - `mcp.ts` line 435 and line 97
   - `thread.ts` line 200 and line 258

4. **Token refresh in MCP** — When MCP OAuth access token expires, the refresh must reach workspace-mcp's token endpoint. If workspace-mcp is not running, refresh will fail.

---

## Related Files for Reference

### Native Tools System

- Token storage schema: `src/kiloclaw/agency/auth/gworkspace-token.sql.ts`
- Token manager: `src/kiloclaw/agency/auth/token-manager.ts`
- Token DB: `src/kiloclaw/agency/auth/token-db.ts`
- OAuth implementation: `src/kiloclaw/agency/auth/gworkspace-oauth.ts`
- Broker: `src/kiloclaw/agency/broker/gworkspace-broker.ts`
- Adapter: `src/kiloclaw/agency/adapters/gworkspace-adapter.ts`

### MCP System

- OAuth provider: `src/mcp/oauth-provider.ts`
- Auth service: `src/mcp/auth.ts`
- Auth store: `src/mcp/auth-store.ts`
- MCP initialization: `src/mcp/index.ts`
- OAuth callback: `src/mcp/oauth-callback.ts`

### Configuration

- OAuth credentials: `.envrc`
- MCP server config: `kilo.jsonc`
- Database location: `/home/fulvio/.local/share/kiloclaw/kilo.db`
- MCP auth (kilocode): `/home/fulvio/.local/share/kilo/mcp-auth.json`
- MCP auth (kiloclaw): `/home/fulvio/coding/kiloclaw/.kiloclaw-runtime/data/kiloclaw/mcp-auth.json`

---

## Questions for Architecture Review

1. Should native tools and MCP share the same OAuth client credentials?
2. Should both systems use the same encrypted token database?
3. How should multi-user authentication be handled?
4. Should workspace-mcp be embedded in kiloclaw or remain external?
5. What should the user-facing OAuth workflow look like?
6. How should tokens be refreshed - by each system independently or centrally?
7. Should OAuth state be persisted to allow recovery from interruptions?
8. How to handle different token expiration times between systems?

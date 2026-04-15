# MCP Credential Synchronization Architecture

**Date**: 2026-04-14  
**Status**: Implemented  
**Problem Statement**: Prior to this solution, MCP (Model Context Protocol) servers and native Google Workspace APIs maintained separate credential storage locations, causing authentication failures when `bun run dev` started the workspace-mcp server.

## Problem Summary

### Root Cause
The system had **two separate credential storage mechanisms**:

1. **Native API Authentication** (TokenManager):
   - Location: SQLite database at `packages/opencode/src/kiloclaw/agency/auth/token-manager.ts`
   - Credentials: Encrypted with AES-256-GCM using `GWORKSPACE_TOKEN_KEY` master key
   - Usage: Direct Google Workspace API calls (Gmail, Calendar, Drive, etc.)

2. **MCP Server Authentication** (workspace-mcp):
   - Location: JSON file at `~/.google_workspace_mcp/auth.json`
   - Credentials: Plain JSON with access/refresh tokens
   - Usage: Model Context Protocol server that proxies Google API requests

When a user authenticated via OAuth, tokens were stored in the native TokenManager database. But workspace-mcp looked for credentials in its own separate file, leading to "MCP Authentication Required" errors even after successful OAuth login.

### Error Manifestation
```
❌ MCP Authentication Required
   kilo mcp auth google-workspace
```

Despite successful OAuth flow:
```bash
$ kilo mcp auth google-workspace
✅ Authentication successful! Tokens stored.
```

But then:
```bash
$ bun run dev
⚠️ MCP Authentication Required
   Server "google-workspace" requires authentication.
```

This occurred because:
1. `kilo mcp auth` stored tokens in kilocode's location
2. kiloclaw's TokenManager stored tokens in its own SQLite database
3. workspace-mcp looked for credentials in `~/.google_workspace_mcp/auth.json`
4. The three systems never synchronized

## Solution Design

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│ Unified Token Storage (SQLite TokenManager)                   │
│ - Encrypted with GWORKSPACE_TOKEN_KEY                        │
│ - Source of truth for all credentials                        │
└──────────────────────┬──────────────────────────────────────┘
                       │
          CredentialSync.ensureMcpCredentials()
                       │
          ┌────────────┴────────────┐
          │                         │
          ▼                         ▼
┌──────────────────┐    ┌──────────────────────┐
│  Native APIs     │    │  MCP Auth File       │
│  (Direct)        │    │  ~/.google_workspace │
│                  │    │  _mcp/auth.json      │
│  Gmail, Calendar │    │                      │
│  Drive, Docs,    │    │  (workspace-mcp      │
│  Sheets          │    │   reads this)        │
└──────────────────┘    └──────────────────────┘
```

### Key Components

#### 1. **CredentialSync Service** (`credential-sync.ts`)
New service that maintains credential synchronization between native storage and MCP server.

**Key Functions**:
- `ensureMcpCredentials()`: Called at startup to sync tokens
- `syncTokensToMCP()`: Exports tokens from TokenManager to MCP auth file
- `getMcpAuthDir()`: Standard location for workspace-mcp credentials
- `getMcpAuthFile()`: Read MCP auth (for debugging)
- `clearMcpAuth()`: Reset MCP credentials (for testing)

**Location**: `packages/opencode/src/kiloclaw/agency/auth/credential-sync.ts`

#### 2. **MCP Index Integration** (`src/mcp/index.ts`)
Updated MCP initialization to call credential sync before starting the server.

```typescript
// Before attempting to connect to workspace-mcp:
if (key === "google-workspace" && mcp.url?.includes("localhost")) {
  await CredentialSync.ensureMcpCredentials()  // Sync first
  // Then check health and start server if needed
}
```

#### 3. **Startup Flow**

```
1. kiloclaw dev starts
2. MCP initialization triggered
3. For google-workspace server:
   a. Call CredentialSync.ensureMcpCredentials()
   b. Read tokens from TokenManager database
   c. Write tokens to ~/.google_workspace_mcp/auth.json
   d. Check health of workspace-mcp server
   e. Start workspace-mcp if needed
4. Connect to workspace-mcp with synchronized credentials
```

## Implementation Details

### Token Format Conversion

**From TokenManager (database)**:
```typescript
{
  id: string,
  userId: string,
  workspaceId: string,
  encryptedAccessToken: string,      // Encrypted, base64
  encryptedRefreshToken?: string,    // Encrypted, base64
  expiresAt: number,
  rotatedAt: number,
}
```

**To MCP Auth File**:
```json
{
  "workspaces": {
    "default": {
      "access_token": "ya29.a0...",
      "expires_at": 1713105900000,
      "token_type": "Bearer"
    }
  }
}
```

### Error Handling

The sync process is **non-critical**:
- If sync fails, MCP may fall back to OAuth flow
- If workspace-mcp isn't running, it will be started
- If health check fails, server startup is attempted
- Errors are logged but don't block initialization

```typescript
await CredentialSync.ensureMcpCredentials().catch((err) => {
  log.debug("mcp credential sync not critical", { error: err })
})
```

## Benefits

### 1. **Unified Authentication**
- Single source of truth (TokenManager database)
- Both native APIs and MCP use same tokens
- Token refresh happens once, visible to both systems

### 2. **Automatic Synchronization**
- Called at every `bun run dev` startup
- No manual credential copying needed
- Handles token expiration and refresh transparently

### 3. **Robust Error Recovery**
- If workspace-mcp crashes, it automatically restarts
- Credentials automatically synced on restart
- No "Authentication Required" errors after successful OAuth

### 4. **Future Extensibility**
- Can support multiple users/workspaces (currently hardcoded to "fulviold@gmail.com" / "default")
- Can add credential rotation policies
- Can audit credential access

## Configuration

### Required Environment Variables
- `GWORKSPACE_TOKEN_KEY`: 256-bit hex string for token encryption (already set in `.envrc`)

### MCP Server Configuration (`kilo.jsonc`)
```json
{
  "mcp": {
    "google-workspace": {
      "type": "remote",
      "url": "http://localhost:8000/mcp",
      "enabled": true,
      "oauth": {
        "clientId": "...",
        "clientSecret": "..."
      }
    }
  }
}
```

### Workspace-MCP Environment
The MCP server startup sets:
- `WORKSPACE_MCP_PORT=8000`
- `WORKSPACE_MCP_BASE_URI=http://localhost`
- `OAUTHLIB_INSECURE_TRANSPORT=1` (dev only)
- `MCP_ENABLE_OAUTH21=true`

## Testing & Validation

### Manual Testing
```bash
# Start kiloclaw dev
bun run dev

# Check that workspace-mcp is running
curl http://localhost:8000/health

# Verify tools are available
curl http://localhost:8000/mcp/tools

# Check MCP auth file was created
cat ~/.google_workspace_mcp/auth.json
```

### Credential Inspection
```typescript
import { CredentialSync } from "@/kiloclaw/agency/auth/credential-sync"

const auth = await CredentialSync.getMcpAuthFile()
console.log(auth.workspaces.default.access_token)
```

## Future Improvements

1. **Multi-User Support**: Extend sync to support multiple users/workspaces
2. **Credential Rotation**: Automatically rotate credentials on schedule
3. **Health Monitoring**: Continuous health checks and auto-recovery
4. **Audit Trail**: Log all credential access for compliance
5. **Fallback Chains**: Support multiple MCP servers with automatic failover

## Related ADRs

- ADR-001: Token Storage & Persistence
- ADR-002: Google Workspace Agency Architecture
- ADR-003: MCP Integration Strategy

## Troubleshooting

### "MCP Authentication Required" Still Appears
1. Check `GWORKSPACE_TOKEN_KEY` is set: `echo $GWORKSPACE_TOKEN_KEY`
2. Verify TokenManager database: `select * from gworkspace_token`
3. Check MCP auth file: `cat ~/.google_workspace_mcp/auth.json`
4. Restart workspace-mcp: `pkill -f workspace-mcp && sleep 2 && bun run dev`

### Tokens Not Syncing
1. Check logs for `credential-sync` service: `grep credential-sync`
2. Verify `GWORKSPACE_TOKEN_KEY` is correct (32 bytes hex)
3. Ensure `.google_workspace_mcp` directory is writable
4. Run `CredentialSync.clearMcpAuth()` and re-authenticate

### workspace-mcp Server Won't Start
1. Check if port 8000 is already in use: `lsof -i :8000`
2. Verify workspace-mcp is installed: `uvx --from workspace-mcp workspace-mcp --version`
3. Check MCP logs: `tail -f /tmp/workspace-mcp.log`
4. Manually start in foreground to see errors:
   ```bash
   WORKSPACE_MCP_PORT=8000 WORKSPACE_MCP_BASE_URI=http://localhost \
   OAUTHLIB_INSECURE_TRANSPORT=1 MCP_ENABLE_OAUTH21=true \
   uvx --from workspace-mcp workspace-mcp --transport streamable-http
   ```

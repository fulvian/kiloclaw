// Google Workspace Credential Synchronization Service
// Maintains synchronized tokens between native APIs and MCP servers
// Ensures both systems use the same encrypted token storage

import { Log } from "@/util/log"
import { TokenManager, type StoredToken } from "./token-manager"
import { TokenDatabase } from "./token-db"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { existsSync } from "node:fs"
import z from "zod"

// McpAuth is imported lazily to avoid circular deps with mcp/ module
type McpAuthEntry = {
  tokens?: {
    accessToken: string
    refreshToken?: string
    expiresAt?: number
    scope?: string
  }
}

export namespace CredentialSync {
  const log = Log.create({ service: "credential-sync" })

  // MCP auth file format (stored credentials)
  const MCPAuthFileSchema = z.object({
    workspaces: z
      .record(
        z.string(),
        z.object({
          access_token: z.string(),
          refresh_token: z.string().optional(),
          expires_at: z.number(),
          token_type: z.string(),
        }),
      )
      .optional(),
  })

  type MCPAuthFile = z.infer<typeof MCPAuthFileSchema>

  /**
   * Get MCP auth directory (where workspace-mcp reads credentials)
   */
  export function getMcpAuthDir(): string {
    return join(process.env.HOME || process.env.USERPROFILE || "/root", ".google_workspace_mcp")
  }

  /**
   * Get MCP auth file path
   */
  export function getMcpAuthFilePath(): string {
    return join(getMcpAuthDir(), "auth.json")
  }

  /**
   * Sync tokens from TokenManager database to MCP auth file
   * This ensures workspace-mcp server has access to the same tokens as native APIs
   */
  export async function syncTokensToMCP(userId: string, workspaceId: string): Promise<void> {
    try {
      log.info("syncing tokens to mcp", { userId, workspaceId })

      // Get token from database
      const accessToken = await TokenManager.getValidAccessToken(userId, workspaceId).catch(() => null)
      if (!accessToken) {
        log.warn("no valid token found to sync", { userId, workspaceId })
        return
      }

      // Load MCP auth file (or create empty)
      const authDir = getMcpAuthDir()
      const authFilePath = getMcpAuthFilePath()

      // Ensure directory exists
      if (!existsSync(authDir)) {
        await mkdir(authDir, { recursive: true })
        log.info("created mcp auth directory", { dir: authDir })
      }

      let mcpAuth: MCPAuthFile = { workspaces: {} }
      if (existsSync(authFilePath)) {
        try {
          const content = await readFile(authFilePath, "utf-8")
          mcpAuth = JSON.parse(content)
        } catch (err) {
          log.warn("failed to parse existing mcp auth file, will overwrite", { error: err })
        }
      }

      // Update workspace credentials
      const stored = await TokenDatabase.loadToken(userId, workspaceId)
      if (!stored) {
        log.warn("token not found in database", { userId, workspaceId })
        return
      }

      // For MCP auth file, we store the plaintext access token (will be encrypted by workspace-mcp)
      if (!mcpAuth.workspaces) {
        mcpAuth.workspaces = {}
      }

      mcpAuth.workspaces[workspaceId] = {
        access_token: accessToken,
        expires_at: stored.expiresAt,
        token_type: "Bearer",
      }

      // Write MCP auth file
      await writeFile(authFilePath, JSON.stringify(mcpAuth, null, 2), "utf-8")
      log.info("tokens synced to mcp auth file", { userId, workspaceId, filePath: authFilePath })
    } catch (error) {
      log.error("failed to sync tokens to mcp", {
        userId,
        workspaceId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  /**
   * Import the full MCP auth entry (tokens + clientInfo + serverUrl) from kilocode's
   * data directory (~/.local/share/kilo/mcp-auth.json).
   *
   * Kilocode (the installed `kilo` binary) uses app name "kilo" while kiloclaw
   * uses "kiloclaw". Authentication done via `kilo mcp auth` lands in kilocode's
   * storage and is invisible to kiloclaw until this import runs.
   *
   * This imports both:
   * - Google OAuth tokens (accessToken, refreshToken) into TokenManager SQLite
   * - MCP OAuth 2.1 credentials (clientInfo, serverUrl, tokens) into McpAuthStore
   *
   * Without clientInfo and serverUrl, McpAuthStore.getForUrl() returns undefined
   * even when tokens exist, causing the MCP SDK to fall through to the broken
   * workspace-mcp consent page.
   */
  export async function importFromKilocode(userId: string, workspaceId: string): Promise<void> {
    try {
      const home = process.env.HOME || process.env.USERPROFILE || "/root"
      const kilocodePath = join(home, ".local", "share", "kilo", "mcp-auth.json")

      if (!existsSync(kilocodePath)) {
        log.debug("kilocode mcp-auth.json not found", { path: kilocodePath })
        return
      }

      const raw = await readFile(kilocodePath, "utf-8")
      const data = JSON.parse(raw) as Record<string, unknown>
      const entry = data?.["google-workspace"] as Record<string, unknown> | undefined
      const tokens = entry?.tokens as Record<string, unknown> | undefined

      if (!tokens?.accessToken) {
        log.debug("no google-workspace tokens in kilocode auth")
        return
      }

      const accessToken = tokens.accessToken as string
      const refreshToken = tokens.refreshToken as string | undefined
      const expiresAt = tokens.expiresAt as number | undefined

      // Skip if expired without a refresh token
      const nowSec = Date.now() / 1000
      if (expiresAt && expiresAt < nowSec && !refreshToken) {
        log.debug("kilocode tokens expired and no refresh token, skipping import")
        return
      }

      // Skip Google token import if kiloclaw already has a fresher valid token
      const shouldImportGoogleToken = await (async () => {
        try {
          const existing = await TokenDatabase.loadToken(userId, workspaceId)
          return !existing || existing.expiresAt <= Date.now() + 60_000
        } catch {
          return true
        }
      })()

      if (shouldImportGoogleToken) {
        log.info("importing google-workspace Google OAuth tokens from kilocode", {
          userId,
          workspaceId,
          path: kilocodePath,
        })

        const expiresIn = expiresAt ? Math.max(60, Math.floor(expiresAt - nowSec)) : 3600
        await TokenManager.store(userId, workspaceId, {
          accessToken,
          refreshToken,
          expiresIn,
          tokenType: "Bearer",
        })
      }

      // Import the full MCP OAuth 2.1 entry (tokens + clientInfo + serverUrl)
      // This is critical: without clientInfo and serverUrl, getForUrl() returns
      // undefined and the MCP SDK falls through to the broken consent page.
      const { McpAuthStore } = await import("@/mcp/auth-store")
      const existingEntry = await McpAuthStore.getForUrl("google-workspace", "http://localhost:8000/mcp").catch(
        () => undefined,
      )

      // Check if kiloclaw already has a valid MCP OAuth entry with matching serverUrl
      const shouldImportMcpEntry = !existingEntry || !existingEntry.tokens?.accessToken

      if (shouldImportMcpEntry && entry) {
        log.info("importing google-workspace MCP OAuth entry from kilocode", { path: kilocodePath })

        // Build a properly-typed AuthEntry for McpAuthStore
        const mcpTokens: { accessToken: string; refreshToken?: string; expiresAt?: number; scope?: string } = {
          accessToken: tokens.accessToken as string,
        }
        if (refreshToken) mcpTokens.refreshToken = refreshToken
        if (expiresAt) mcpTokens.expiresAt = expiresAt
        if (tokens.scope) mcpTokens.scope = tokens.scope as string

        const mcpEntry: {
          tokens?: typeof mcpTokens
          clientInfo?: {
            clientId: string
            clientSecret?: string
            clientIdIssuedAt?: number
            clientSecretExpiresAt?: number
          }
        } = {}

        // Import tokens
        mcpEntry.tokens = mcpTokens

        // Import clientInfo (required for MCP OAuth 2.1 dynamic registration reuse)
        const clientInfo = entry.clientInfo as Record<string, unknown> | undefined
        if (clientInfo) {
          const mcpClientInfo: {
            clientId: string
            clientSecret?: string
            clientIdIssuedAt?: number
            clientSecretExpiresAt?: number
          } = {
            clientId: clientInfo.clientId as string,
          }
          if (clientInfo.clientSecret) mcpClientInfo.clientSecret = clientInfo.clientSecret as string
          if (clientInfo.clientIdIssuedAt) mcpClientInfo.clientIdIssuedAt = clientInfo.clientIdIssuedAt as number
          if (clientInfo.clientSecretExpiresAt)
            mcpClientInfo.clientSecretExpiresAt = clientInfo.clientSecretExpiresAt as number
          mcpEntry.clientInfo = mcpClientInfo
        }

        // Import serverUrl (critical for getForUrl() to match)
        const serverUrl = (entry.serverUrl as string) || (entry.canonicalUrl as string) || "http://localhost:8000/mcp"

        await McpAuthStore.set("google-workspace", mcpEntry as any, serverUrl)

        log.info("imported MCP OAuth entry from kilocode", { userId, workspaceId, serverUrl })
      } else if (shouldImportGoogleToken) {
        // Fallback: at least sync the Google tokens to McpAuth (without serverUrl)
        const { McpAuth } = await import("@/mcp/auth")
        await McpAuth.updateTokens("google-workspace", {
          accessToken,
          refreshToken,
          expiresAt,
        }).catch((err) => log.warn("failed to sync kilocode tokens to mcp auth", { error: err }))
      }

      log.info("import completed from kilocode", { userId, workspaceId })
    } catch (error) {
      log.warn("failed to import from kilocode", {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Ensure MCP credentials are up-to-date at startup
   * Called from MCP initialization to synchronize before connecting to workspace-mcp server
   */
  export async function ensureMcpCredentials(): Promise<void> {
    try {
      log.info("ensuring mcp credentials are synchronized")

      const userId = "fulviold@gmail.com"
      const workspaceId = "default"

      // 1. Cross-app import: pull tokens from kilocode (~/.local/share/kilo/) if kiloclaw's stores are empty
      await importFromKilocode(userId, workspaceId).catch((err) => {
        log.debug("kilocode import not critical", { error: err })
      })

      // 2. Reverse-sync: import from McpAuth JSON if SQLite is still empty
      await importFromMcpAuth(userId, workspaceId).catch((err) => {
        log.debug("import from mcp auth not critical", { error: err })
      })

      // 3. Forward-sync: write SQLite token to workspace-mcp auth file
      await syncTokensToMCP(userId, workspaceId).catch((err) => {
        log.debug("mcp credential sync not critical", { error: err })
      })
    } catch (error) {
      log.error("failed to ensure mcp credentials", {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Import tokens from McpAuth JSON into TokenManager SQLite.
   * Called at startup so native tools can use tokens obtained via MCP OAuth flow.
   */
  export async function importFromMcpAuth(userId: string, workspaceId: string): Promise<void> {
    try {
      // Lazy import to avoid circular dep with mcp/ module
      const { McpAuth } = await import("@/mcp/auth")
      const entry = await McpAuth.get("google-workspace").catch(() => null)
      if (!entry?.tokens?.accessToken) {
        log.debug("no mcp tokens to import", { userId })
        return
      }

      const { accessToken, refreshToken, expiresAt } = entry.tokens

      // Check if expired AND no refresh token — nothing useful to import
      const nowSec = Date.now() / 1000
      if (expiresAt && expiresAt < nowSec && !refreshToken) {
        log.debug("mcp tokens expired and no refresh token, skipping import", { userId })
        return
      }

      // Check if SQLite already has a fresher token
      try {
        const existing = await TokenDatabase.loadToken(userId, workspaceId)
        if (existing && existing.expiresAt > Date.now() + 60_000) {
          // SQLite token is still valid — no need to import
          return
        }
      } catch {
        // No existing token, proceed with import
      }

      const expiresIn = expiresAt ? Math.max(60, Math.floor(expiresAt - nowSec)) : 3600
      await TokenManager.store(userId, workspaceId, {
        accessToken,
        refreshToken,
        expiresIn,
        tokenType: "Bearer",
      })
      log.info("imported mcp tokens into token manager", { userId, workspaceId })
    } catch (error) {
      log.error("failed to import from mcp auth", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }

  /**
   * Get current MCP auth file (for debugging/inspection)
   */
  export async function getMcpAuthFile(): Promise<MCPAuthFile | null> {
    try {
      const authFilePath = getMcpAuthFilePath()
      if (!existsSync(authFilePath)) {
        return null
      }

      const content = await readFile(authFilePath, "utf-8")
      return JSON.parse(content) as MCPAuthFile
    } catch (error) {
      log.error("failed to read mcp auth file", {
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }

  /**
   * Clear MCP auth file (for testing/debugging)
   */
  export async function clearMcpAuth(): Promise<void> {
    try {
      const authFilePath = getMcpAuthFilePath()
      if (existsSync(authFilePath)) {
        await writeFile(authFilePath, JSON.stringify({ workspaces: {} }, null, 2), "utf-8")
        log.info("cleared mcp auth file", { filePath: authFilePath })
      }
    } catch (error) {
      log.error("failed to clear mcp auth file", {
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
}

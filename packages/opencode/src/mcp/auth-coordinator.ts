/**
 * MCP Auth Coordinator - Orchestrates authentication across startup, session, and 401 errors.
 *
 * Responsibilities:
 * 1. ensureAtSessionStart() - Called at chat startup to verify/refresh auth
 * 2. ensureServerAuth(name) - Called before MCP operations
 * 3. handleUnauthorized(name) - Called on 401 to attempt automatic recovery
 * 4. Event publishing for UI feedback
 *
 * This coordinator centralizes auth policy and retry logic.
 */

import { Log } from "../util/log"
import { McpAuthStore } from "./auth-store"
import { McpRefreshManager, cancelRefresh } from "./refresh-manager"
import { canonicalUrl, urlsAreEquivalent, classifyUrlChange } from "./auth-url"
import { BusEvent } from "../bus/bus-event"
import { Bus } from "@/bus"
import { TuiEvent } from "@/cli/cmd/tui/event"
import { Config } from "@/config/config"

const log = Log.create({ service: "mcp.auth-coordinator" })

/**
 * Events published by the auth coordinator.
 */
export const AuthCoordinatorEvents = {
  /**
   * Fired when auto-ensure completes at session start.
   */
  AutoEnsureComplete: BusEvent.define(
    "mcp.auth.auto_ensure_complete",
    z.object({
      mcpName: z.string(),
      status: z.enum(["connected", "needs_auth", "expired", "error"]),
      message: z.string().optional(),
    }),
  ),

  /**
   * Fired when auth is required (user needs to take action).
   */
  AuthRequired: BusEvent.define(
    "mcp.auth.required",
    z.object({
      mcpName: z.string(),
      reason: z.string(),
      command: z.string().optional(),
    }),
  ),

  /**
   * Fired when refresh succeeds.
   */
  RefreshSuccess: BusEvent.define(
    "mcp.auth.refresh_success",
    z.object({
      mcpName: z.string(),
    }),
  ),

  /**
   * Fired when refresh fails.
   */
  RefreshFailed: BusEvent.define(
    "mcp.auth.refresh_failed",
    z.object({
      mcpName: z.string(),
      error: z.string(),
      permanent: z.boolean(),
    }),
  ),

  /**
   * Fired when a 401 is successfully recovered.
   */
  UnauthorizedRecovered: BusEvent.define(
    "mcp.auth.unauthorized_recovered",
    z.object({
      mcpName: z.string(),
    }),
  ),

  /**
   * Fired when 401 recovery fails.
   */
  UnauthorizedRecoveryFailed: BusEvent.define(
    "mcp.auth.unauthorized_recovery_failed",
    z.object({
      mcpName: z.string(),
      error: z.string(),
      needsAuth: z.boolean(),
    }),
  ),
}

// Import zod here to avoid circular deps
import z from "zod/v4"

/**
 * Auth status for a server.
 */
export type ServerAuthStatus = "connected" | "needs_auth" | "expired" | "not_found" | "error"

/**
 * Result of ensureAtSessionStart for a single server.
 */
export interface EnsureResult {
  mcpName: string
  status: ServerAuthStatus
  message?: string
  didRefresh?: boolean
  didReconnect?: boolean
}

/**
 * Mutex map to prevent concurrent refresh for same server.
 */
const refreshMutex = new Map<string, Promise<unknown>>()

/**
 * Get or create a mutex for a server's refresh operation.
 */
async function withRefreshLock<T>(mcpName: string, fn: () => Promise<T>): Promise<T> {
  const existing = refreshMutex.get(mcpName)
  if (existing) {
    // Wait for the existing operation
    await existing
  }

  const promise = (async () => {
    try {
      return await fn()
    } finally {
      refreshMutex.delete(mcpName)
    }
  })()

  refreshMutex.set(mcpName, promise as Promise<unknown>)
  return promise
}

/**
 * Determine what auth action is needed based on token state.
 */
async function determineAuthAction(
  mcpName: string,
  serverUrl: string,
): Promise<{ action: "connect" | "refresh" | "needs_auth" | "none"; message?: string }> {
  const entry = await McpAuthStore.getForUrl(mcpName, serverUrl)

  if (!entry) {
    return { action: "needs_auth", message: `No credentials found for ${mcpName}` }
  }

  if (!entry.tokens) {
    return { action: "needs_auth", message: `No tokens stored for ${mcpName}` }
  }

  // Check if expired (with skew)
  const isExpired = await McpAuthStore.isTokenExpired(mcpName)

  if (isExpired === null) {
    // No expiry info, assume needs auth
    return { action: "needs_auth", message: `Token expiry unknown for ${mcpName}` }
  }

  if (isExpired) {
    // Expired - need to refresh
    if (entry.tokens.refreshToken) {
      return { action: "refresh", message: `Token expired for ${mcpName}, attempting refresh` }
    }
    return { action: "needs_auth", message: `Token expired for ${mcpName} and no refresh token available` }
  }

  // Not expired - can connect
  return { action: "connect" }
}

/**
 * Check if MCP config URL matches stored URL.
 */
async function checkUrlCompatibility(mcpName: string, configUrl: string): Promise<boolean> {
  const entry = await McpAuthStore.get(mcpName)
  if (!entry?.serverUrl) {
    // Old entry without URL, might need re-auth
    return false
  }

  const { semantic } = classifyUrlChange(entry.serverUrl, configUrl)
  return semantic
}

// ============================================================================
// Auth Coordinator Namespace
// ============================================================================

export namespace McpAuthCoordinator {
  /**
   * Initialize the coordinator at startup.
   * Migrates legacy auth if needed.
   */
  export async function initialize(): Promise<void> {
    log.info("initializing auth coordinator")
    await McpRefreshManager.initialize()
  }

  /**
   * Ensure all MCP servers are authenticated at session start.
   * Called before the chat UI renders.
   *
   * This will:
   * 1. Load auth from canonical store
   * 2. Sync to runtime store if needed
   * 3. Verify tokens are valid
   * 4. Attempt refresh if expired
   * 5. Publish status events
   */
  export async function ensureAtSessionStart(): Promise<Record<string, EnsureResult>> {
    log.info("running ensureAtSessionStart")

    const cfg = await Config.get()
    const mcpConfig = cfg.mcp ?? {}
    const results: Record<string, EnsureResult> = {}

    // Migrate any legacy entries first
    await McpAuthStore.migrateFromLegacy()

    // Check each configured OAuth server
    for (const [mcpName, mcp] of Object.entries(mcpConfig)) {
      if (typeof mcp !== "object" || !("type" in mcp)) continue
      if (mcp.type !== "remote") continue
      if (mcp.oauth === false) continue

      const serverUrl = mcp.url
      const result = await ensureServerAuth(mcpName, serverUrl)
      results[mcpName] = result
    }

    log.info("ensureAtSessionStart complete", {
      total: Object.keys(results).length,
      connected: Object.values(results).filter((r) => r.status === "connected").length,
      needsAuth: Object.values(results).filter((r) => r.status === "needs_auth").length,
    })

    return results
  }

  /**
   * Ensure a specific server is authenticated.
   * Returns the status and any action taken.
   */
  export async function ensureServerAuth(mcpName: string, serverUrl: string): Promise<EnsureResult> {
    return withRefreshLock(mcpName, async () => {
      log.info("ensuring server auth", { mcpName, serverUrl })

      // Check URL compatibility first
      const urlCompatible = await checkUrlCompatibility(mcpName, serverUrl)
      if (!urlCompatible) {
        const message = `Server URL changed for ${mcpName}, re-authentication required`
        log.warn(message, { stored: (await McpAuthStore.get(mcpName))?.serverUrl, current: serverUrl })
        Bus.publish(AuthCoordinatorEvents.AuthRequired, {
          mcpName,
          reason: message,
          command: `kilo mcp auth ${mcpName}`,
        })
        return { mcpName, status: "needs_auth", message }
      }

      // Determine what action is needed
      const { action, message } = await determineAuthAction(mcpName, serverUrl)

      switch (action) {
        case "connect":
          log.info("server auth ready", { mcpName })
          Bus.publish(AuthCoordinatorEvents.AutoEnsureComplete, { mcpName, status: "connected" })
          return { mcpName, status: "connected" }

        case "refresh":
          log.info("attempting token refresh", { mcpName })
          // The refresh is handled by the SDK when tokens() is called
          // We just need to schedule the refresh manager
          const entry = await McpAuthStore.getForUrl(mcpName, serverUrl)
          if (entry?.tokens?.expiresAt) {
            McpRefreshManager.onTokensUpdated(mcpName, serverUrl, entry.tokens.expiresAt)
          }
          Bus.publish(AuthCoordinatorEvents.AutoEnsureComplete, { mcpName, status: "connected", message })
          return { mcpName, status: "connected", message, didRefresh: true }

        case "needs_auth":
          Bus.publish(AuthCoordinatorEvents.AuthRequired, {
            mcpName,
            reason: message || `Authentication required for ${mcpName}`,
            command: `kilo mcp auth ${mcpName}`,
          })
          Bus.publish(AuthCoordinatorEvents.AutoEnsureComplete, { mcpName, status: "needs_auth", message })
          return { mcpName, status: "needs_auth", message }

        default:
          return { mcpName, status: "error", message: "Unknown auth action" }
      }
    })
  }

  /**
   * Handle an unauthorized (401) error for a server.
   * Attempts a single atomic sequence of refresh -> reconnect -> retry.
   *
   * Returns whether the error was successfully recovered.
   */
  export async function handleUnauthorized(
    mcpName: string,
    serverUrl: string,
  ): Promise<{ recovered: boolean; error?: string }> {
    return withRefreshLock(mcpName, async () => {
      log.info("handling unauthorized for server", { mcpName })

      const entry = await McpAuthStore.getForUrl(mcpName, serverUrl)

      if (!entry?.tokens?.refreshToken) {
        const error = "No refresh token available"
        log.warn("cannot handle 401, no refresh token", { mcpName })
        Bus.publish(AuthCoordinatorEvents.UnauthorizedRecoveryFailed, {
          mcpName,
          error,
          needsAuth: true,
        })
        return { recovered: false, error }
      }

      // Attempt refresh via refresh manager
      const refreshResult = await McpRefreshManager.handleUnauthorized(mcpName, serverUrl)

      if (!refreshResult.retried) {
        // No refresh token available - permanent failure
        const error = refreshResult.error || "No refresh token available"
        log.warn("cannot handle 401, no refresh token", { mcpName })
        Bus.publish(AuthCoordinatorEvents.RefreshFailed, { mcpName, error, permanent: true })
        Bus.publish(AuthCoordinatorEvents.UnauthorizedRecoveryFailed, {
          mcpName,
          error,
          needsAuth: true,
        })
        // Invalidate tokens since this is permanent
        await McpAuthStore.updateTokens(mcpName, { accessToken: "" }, serverUrl)
        return { recovered: false, error }
      }

      if (!refreshResult.success) {
        const error = refreshResult.error || "Refresh failed"
        log.warn("refresh failed during 401 recovery", { mcpName, error })
        Bus.publish(AuthCoordinatorEvents.RefreshFailed, { mcpName, error, permanent: false })
        Bus.publish(AuthCoordinatorEvents.UnauthorizedRecoveryFailed, {
          mcpName,
          error,
          needsAuth: false,
        })
        return { recovered: false, error }
      }

      // Refresh succeeded
      log.info("refresh succeeded for 401 recovery", { mcpName })
      Bus.publish(AuthCoordinatorEvents.RefreshSuccess, { mcpName })
      Bus.publish(AuthCoordinatorEvents.UnauthorizedRecovered, { mcpName })
      return { recovered: true }
    })
  }

  /**
   * Mark a server as needing auth (e.g., after invalid_grant).
   */
  export async function markNeedsAuth(mcpName: string, reason: string): Promise<void> {
    log.info("marking server as needs_auth", { mcpName, reason })
    cancelRefresh(mcpName)
    Bus.publish(AuthCoordinatorEvents.AuthRequired, {
      mcpName,
      reason,
      command: `kilo mcp auth ${mcpName}`,
    })
  }

  /**
   * Get auth status summary for all servers.
   */
  export async function getAuthStatus(): Promise<Record<string, ServerAuthStatus>> {
    const entries = await McpAuthStore.all()
    const status: Record<string, ServerAuthStatus> = {}

    for (const [mcpName, entry] of Object.entries(entries)) {
      if (!entry.tokens) {
        status[mcpName] = "not_found"
        continue
      }

      const isExpired = await McpAuthStore.isTokenExpired(mcpName)
      status[mcpName] = isExpired ? "expired" : "connected"
    }

    return status
  }

  /**
   * Get servers that need authentication.
   */
  export async function getServersNeedingAuth(): Promise<string[]> {
    const status = await getAuthStatus()
    return Object.entries(status)
      .filter(([, s]) => s === "expired" || s === "not_found")
      .map(([name]) => name)
  }
}

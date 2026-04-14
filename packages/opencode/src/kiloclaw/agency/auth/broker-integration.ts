// Google Workspace Broker + TokenManager Integration
// Provides access token management for the broker layer
// Phase 4 Implementation: Wraps TokenManager for broker use

import { Log } from "@/util/log"
import { TokenManager } from "./token-manager"
import { GWorkspaceOAuth } from "./gworkspace-oauth"

// ============================================================================
// Types
// ============================================================================

export interface BrokerTokenConfig {
  userId: string
  workspaceId: string
}

// ============================================================================
// Broker Token Integration
// ============================================================================

export namespace BrokerTokenIntegration {
  const log = Log.create({ service: "gworkspace.broker-integration" })

  /**
   * Get valid access token for broker use
   * Automatically refreshes if expired
   */
  export async function getAccessToken(config: BrokerTokenConfig): Promise<string> {
    try {
      // Use TokenManager (persistent storage)
      // Tokens are persisted in encrypted database with automatic refresh
      const token = await TokenManager.getValidAccessToken(
        config.userId,
        config.workspaceId,
        async (refreshToken) => {
          const newTokens = await GWorkspaceOAuth.refreshTokens(
            {
              clientId: process.env.GWORKSPACE_CLIENT_ID || "",
              clientSecret: process.env.GWORKSPACE_CLIENT_SECRET,
              scopes: [
                "https://www.googleapis.com/auth/gmail.readonly",
                "https://www.googleapis.com/auth/gmail.send",
                "https://www.googleapis.com/auth/calendar",
                "https://www.googleapis.com/auth/drive",
                "https://www.googleapis.com/auth/documents",
                "https://www.googleapis.com/auth/spreadsheets",
              ],
            },
            refreshToken
          )
          return {
            accessToken: newTokens.accessToken,
            refreshToken: newTokens.refreshToken,
            expiresIn: 3600,
            tokenType: "Bearer",
          }
        }
      )

      return token
    } catch (error) {
      log.error("failed to get access token", {
        userId: config.userId,
        error: error instanceof Error ? error.message : String(error),
      })

      // Graceful degradation: Return helpful error message
      if (error instanceof Error && error.message.includes("Authentication required")) {
        throw new Error("Authentication required - please re-login to Google Workspace")
      }

      throw error
    }
  }

  /**
   * Revoke tokens on logout
   */
  export async function revokeTokens(config: BrokerTokenConfig): Promise<void> {
    try {
      await TokenManager.revoke(config.userId, config.workspaceId, async (refreshToken) => {
        // Call Google revocation endpoint
        const response = await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: refreshToken }),
        })

        if (!response.ok) {
          throw new Error(`Revocation failed: ${response.statusText}`)
        }
      })

      log.info("tokens revoked", {
        userId: config.userId,
        workspaceId: config.workspaceId,
      })
    } catch (error) {
      log.error("token revocation failed", {
        userId: config.userId,
        error: error instanceof Error ? error.message : String(error),
      })
      // Don't throw - revocation failure shouldn't block logout
    }
  }

  /**
   * Middleware for broker calls: inject token automatically
   */
  export async function withTokenInjection<T>(
    config: BrokerTokenConfig,
    operation: (token: string) => Promise<T>
  ): Promise<T> {
    const token = await getAccessToken(config)

    try {
      return await operation(token)
    } catch (error) {
      // Check if error is auth-related (401, 403)
      if (error instanceof Error) {
        if (error.message.includes("401") || error.message.includes("Unauthorized")) {
          // Token is invalid, revoke and ask for re-auth
          log.warn("token invalid, revoking", { userId: config.userId })
          await TokenManager.revoke(config.userId, config.workspaceId)
          throw new Error("Authentication required - please re-login")
        }

        if (error.message.includes("403") && !error.message.includes("Forbidden")) {
          // Might be quota exhausted
          log.error("possible quota exhaustion", { userId: config.userId, error: error.message })
          throw new Error("API quota exceeded - try again later")
        }
      }

      throw error
    }
  }

  /**
   * Get cache stats (for monitoring)
   */
  export function getCacheStats() {
    return {
      tokenCache: TokenManager.getCacheStats(),
      idempotencyKeys: {}, // IdempotencyKeyManager.getStats() - if using
    }
  }

  /**
   * Clear all caches (for testing or emergency)
   */
  export function clearCaches(): void {
    TokenManager.clearCache()
    log.warn("all token caches cleared")
  }
}

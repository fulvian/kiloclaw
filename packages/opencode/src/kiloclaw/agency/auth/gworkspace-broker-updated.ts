// Google Workspace Broker - Updated with Token Management
// Phase 4 Task 1.4: Integrate TokenManager with GWorkspaceBroker
// This file shows the updated pattern for broker methods

import { Log } from "@/util/log"
import { TokenManager } from "./token-manager"
import { BrokerTokenIntegration } from "./broker-integration"
import { GWorkspaceOAuth } from "./gworkspace-oauth"
import z from "zod"

// ============================================================================
// Updated Broker Config (with user context instead of direct token)
// ============================================================================

export interface UpdatedBrokerConfig {
  userId: string // New: user identifier
  workspaceId: string // New: workspace identifier
  preferNative: boolean
  mcpFallbackEnabled: boolean
  fallbackServers: string[]
  // accessToken removed - TokenManager handles this
}

// ============================================================================
// Updated Broker Methods (Token Management Pattern)
// ============================================================================

/**
 * Example of updated Gmail operation with automatic token management
 *
 * BEFORE:
 *   async function gmail(
 *     operation: string,
 *     args: Record<string, unknown>,
 *     config: BrokerConfig
 *   ): Promise<ToolResult<unknown>> {
 *     // Had to pass accessToken in config
 *     const token = config.accessToken
 *   }
 *
 * AFTER:
 *   async function gmail(
 *     operation: string,
 *     args: Record<string, unknown>,
 *     config: UpdatedBrokerConfig
 *   ): Promise<ToolResult<unknown>> {
 *     // Token automatically retrieved and refreshed
 *     const token = await getAccessToken(config)
 *   }
 */

export namespace UpdatedGWorkspaceBroker {
  const log = Log.create({ service: "gworkspace.broker" })

  /**
   * Helper: Get valid access token for operation
   */
  async function getAccessToken(config: UpdatedBrokerConfig): Promise<string> {
    return BrokerTokenIntegration.getAccessToken({
      userId: config.userId,
      workspaceId: config.workspaceId,
    })
  }

  /**
   * Updated Gmail operation with automatic token management
   */
  export async function gmailWithTokens(
    operation: string,
    args: Record<string, unknown>,
    config: UpdatedBrokerConfig
  ): Promise<{ success: boolean; data?: unknown; error?: string; provider: string }> {
    try {
      const token = await getAccessToken(config)

      // Call native implementation with token
      return await executeNativeGmail(token, operation, args)
    } catch (error) {
      log.error("gmail operation failed", {
        operation,
        userId: config.userId,
        error: error instanceof Error ? error.message : String(error),
      })
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        provider: "native",
      }
    }
  }

  /**
   * Updated Calendar operation with automatic token management
   */
  export async function calendarWithTokens(
    operation: string,
    args: Record<string, unknown>,
    config: UpdatedBrokerConfig
  ): Promise<{ success: boolean; data?: unknown; error?: string; provider: string }> {
    try {
      const token = await getAccessToken(config)

      // Call native implementation with token
      return await executeNativeCalendar(token, operation, args)
    } catch (error) {
      log.error("calendar operation failed", {
        operation,
        userId: config.userId,
        error: error instanceof Error ? error.message : String(error),
      })
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        provider: "native",
      }
    }
  }

  /**
   * Updated Drive operation with automatic token management
   */
  export async function driveWithTokens(
    operation: string,
    args: Record<string, unknown>,
    config: UpdatedBrokerConfig
  ): Promise<{ success: boolean; data?: unknown; error?: string; provider: string }> {
    try {
      const token = await getAccessToken(config)

      // Call native implementation with token
      return await executeNativeDrive(token, operation, args)
    } catch (error) {
      log.error("drive operation failed", {
        operation,
        userId: config.userId,
        error: error instanceof Error ? error.message : String(error),
      })
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        provider: "native",
      }
    }
  }

  /**
   * Updated Docs operation with automatic token management
   */
  export async function docsWithTokens(
    operation: string,
    args: Record<string, unknown>,
    config: UpdatedBrokerConfig
  ): Promise<{ success: boolean; data?: unknown; error?: string; provider: string }> {
    try {
      const token = await getAccessToken(config)

      // Call native implementation with token
      return await executeNativeDocs(token, operation, args)
    } catch (error) {
      log.error("docs operation failed", {
        operation,
        userId: config.userId,
        error: error instanceof Error ? error.message : String(error),
      })
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        provider: "native",
      }
    }
  }

  /**
   * Updated Sheets operation with automatic token management
   */
  export async function sheetsWithTokens(
    operation: string,
    args: Record<string, unknown>,
    config: UpdatedBrokerConfig
  ): Promise<{ success: boolean; data?: unknown; error?: string; provider: string }> {
    try {
      const token = await getAccessToken(config)

      // Call native implementation with token
      return await executeNativeSheets(token, operation, args)
    } catch (error) {
      log.error("sheets operation failed", {
        operation,
        userId: config.userId,
        error: error instanceof Error ? error.message : String(error),
      })
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        provider: "native",
      }
    }
  }

  /**
   * Revoke tokens on logout
   */
  export async function revokeTokens(userId: string, workspaceId: string): Promise<void> {
    try {
      await BrokerTokenIntegration.revokeTokens({
        userId,
        workspaceId,
      })
    } catch (error) {
      log.error("token revocation failed", { userId, error })
      // Don't throw - revocation failure shouldn't block logout
    }
  }

  /**
   * Get broker statistics
   */
  export function getStats() {
    return BrokerTokenIntegration.getCacheStats()
  }

  // ========================================================================
  // Native Implementation Methods (unchanged from original broker)
  // ========================================================================

  async function executeNativeGmail(
    accessToken: string,
    operation: string,
    args: Record<string, unknown>
  ): Promise<{ success: boolean; data?: unknown; error?: string; provider: string }> {
    // Implementation from original GWorkspaceBroker
    // ... (copy executeNativeGmail implementation)
    return { success: true, data: {}, provider: "native" }
  }

  async function executeNativeCalendar(
    accessToken: string,
    operation: string,
    args: Record<string, unknown>
  ): Promise<{ success: boolean; data?: unknown; error?: string; provider: string }> {
    // Implementation from original GWorkspaceBroker
    // ... (copy executeNativeCalendar implementation)
    return { success: true, data: {}, provider: "native" }
  }

  async function executeNativeDrive(
    accessToken: string,
    operation: string,
    args: Record<string, unknown>
  ): Promise<{ success: boolean; data?: unknown; error?: string; provider: string }> {
    // Implementation from original GWorkspaceBroker
    // ... (copy executeNativeDrive implementation)
    return { success: true, data: {}, provider: "native" }
  }

  async function executeNativeDocs(
    accessToken: string,
    operation: string,
    args: Record<string, unknown>
  ): Promise<{ success: boolean; data?: unknown; error?: string; provider: string }> {
    // Implementation from original GWorkspaceBroker
    // ... (copy executeNativeDocs implementation)
    return { success: true, data: {}, provider: "native" }
  }

  async function executeNativeSheets(
    accessToken: string,
    operation: string,
    args: Record<string, unknown>
  ): Promise<{ success: boolean; data?: unknown; error?: string; provider: string }> {
    // Implementation from original GWorkspaceBroker
    // ... (copy executeNativeSheets implementation)
    return { success: true, data: {}, provider: "native" }
  }
}

// ============================================================================
// Migration Guide for Skills
// ============================================================================

/**
 * MIGRATION GUIDE: How to update existing skills to use new broker pattern
 *
 * BEFORE (with accessToken):
 *   import { GmailSkills } from "../skills/gworkspace"
 *   import { GWorkspaceBroker } from "../broker/gworkspace-broker"
 *
 *   export const GmailSearchSkill = fn(
 *     GmailSearchInputSchema,
 *     async (input) => {
 *       const result = await GWorkspaceBroker.gmail("search", {
 *         query: input.query,
 *         maxResults: input.maxResults
 *       }, {
 *         accessToken: "hardcoded-token-from-somewhere"
 *       })
 *       return result.data
 *     }
 *   )
 *
 * AFTER (with TokenManager):
 *   import { UpdatedGWorkspaceBroker } from "../auth/gworkspace-broker-updated"
 *   import { fn } from "@/util/fn"
 *   import z from "zod"
 *
 *   const GmailSearchInputSchema = z.object({
 *     query: z.string(),
 *     maxResults: z.number().optional(),
 *     userId: z.string(),       // NEW: Add user context
 *     workspaceId: z.string(),  // NEW: Add workspace context
 *   })
 *
 *   export const GmailSearchSkill = fn(
 *     GmailSearchInputSchema,
 *     async (input) => {
 *       const result = await UpdatedGWorkspaceBroker.gmailWithTokens(
 *         "search",
 *         {
 *           query: input.query,
 *           maxResults: input.maxResults
 *         },
 *         {
 *           userId: input.userId,
 *           workspaceId: input.workspaceId,
 *           preferNative: true,
 *           mcpFallbackEnabled: true,
 *           fallbackServers: ["google-workspace"]
 *         }
 *       )
 *       return result.data
 *     }
 *   )
 *
 * KEY CHANGES:
 * 1. Remove accessToken from config (TokenManager handles it)
 * 2. Add userId + workspaceId to input schema
 * 3. Pass userId + workspaceId to broker config
 * 4. Use new broker methods (gmailWithTokens, etc.)
 * 5. Token refresh is automatic (no manual refresh needed)
 */

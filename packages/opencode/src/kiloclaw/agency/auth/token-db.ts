// Google Workspace Token Database Implementation
// Uses Drizzle ORM for SQLite abstraction
// Persistent encrypted token storage with audit trail

import { Log } from "@/util/log"
import { Database, eq, and, lt, count, min } from "@/storage/db"
import { GWorkspaceTokenTable, GWorkspaceTokenRotationTable, GWorkspaceIdempotencyKeyTable } from "./gworkspace-token.sql"
import type { StoredToken } from "./token-manager"

// ============================================================================
// Database Implementation
// ============================================================================

export namespace TokenDatabase {
  const log = Log.create({ service: "token-manager.database" })

  /**
   * Save token to database (insert or update)
   * Uses upsert pattern to replace existing token for user/workspace pair
   */
  export async function saveToken(token: StoredToken): Promise<void> {
    try {
      const db = Database.Client()

      await db
        .insert(GWorkspaceTokenTable)
        .values({
          id: token.id,
          user_id: token.userId,
          workspace_id: token.workspaceId,
          encrypted_access_token: token.encryptedAccessToken,
          encrypted_refresh_token: token.encryptedRefreshToken,
          expires_at: token.expiresAt,
          rotated_at: token.rotatedAt,
        })
        .onConflictDoUpdate({
          target: [GWorkspaceTokenTable.user_id, GWorkspaceTokenTable.workspace_id],
          set: {
            id: token.id,
            encrypted_access_token: token.encryptedAccessToken,
            encrypted_refresh_token: token.encryptedRefreshToken,
            expires_at: token.expiresAt,
            rotated_at: token.rotatedAt,
          },
        })

      log.debug("saveToken completed", { userId: token.userId, workspaceId: token.workspaceId })
    } catch (error) {
      log.error("failed to save token", {
        userId: token.userId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  /**
   * Load token from database by userId + workspaceId
   */
  export async function loadToken(userId: string, workspaceId: string): Promise<StoredToken | null> {
    try {
      const db = Database.Client()

      const result = await db
        .select()
        .from(GWorkspaceTokenTable)
        .where(
          and(
            eq(GWorkspaceTokenTable.user_id, userId),
            eq(GWorkspaceTokenTable.workspace_id, workspaceId)
          )
        )
        .limit(1)

      if (!result.length) {
        return null
      }

      const row = result[0]
      return {
        id: row.id,
        userId: row.user_id,
        workspaceId: row.workspace_id,
        encryptedAccessToken: row.encrypted_access_token,
        encryptedRefreshToken: row.encrypted_refresh_token ?? undefined,
        expiresAt: row.expires_at,
        rotatedAt: row.rotated_at,
        createdAt: row.time_created,
      } as StoredToken
    } catch (error) {
      log.error("failed to load token", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  /**
   * Delete token from database (called on logout/revoke)
   */
  export async function deleteToken(userId: string, workspaceId: string): Promise<void> {
    try {
      const db = Database.Client()

      await db
        .delete(GWorkspaceTokenTable)
        .where(
          and(
            eq(GWorkspaceTokenTable.user_id, userId),
            eq(GWorkspaceTokenTable.workspace_id, workspaceId)
          )
        )

      log.debug("deleteToken completed", { userId, workspaceId })
    } catch (error) {
      log.error("failed to delete token", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  /**
   * Record token rotation in audit table for compliance
   */
  export async function recordRotation(
    userId: string,
    workspaceId: string,
    oldRefreshTokenHash: string,
    reason: "regular" | "compromise" | "refresh" | "logout" | "manual" = "regular"
  ): Promise<void> {
    try {
      const db = Database.Client()

      await db.insert(GWorkspaceTokenRotationTable).values({
        id: crypto.randomUUID(),
        user_id: userId,
        workspace_id: workspaceId,
        old_refresh_token_hash: oldRefreshTokenHash,
        rotation_reason: reason,
      })

      log.debug("recordRotation completed", { userId, workspaceId, reason })
    } catch (error) {
      log.error("failed to record rotation", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  /**
   * Cleanup expired tokens older than 7 days
   * Keeps recent tokens for audit trail
   */
  export async function cleanupExpiredTokens(): Promise<number> {
    try {
      const db = Database.Client()
      const sevenDaysMs = 7 * 24 * 60 * 60 * 1000
      const cutoffTime = Date.now() - sevenDaysMs

      const result = await db
        .delete(GWorkspaceTokenTable)
        .where(lt(GWorkspaceTokenTable.expires_at, cutoffTime))

      const deletedCount = (result as any).changes || 0
      log.info("cleanupExpiredTokens completed", { deletedCount, cutoffTime })
      return deletedCount
    } catch (error) {
      log.error("failed to cleanup expired tokens", {
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  /**
   * Get token statistics for monitoring
   */
  export async function getStatistics(): Promise<{
    totalTokens: number
    expiredTokens: number
    activeTokens: number
    oldestToken: number | null
  }> {
    try {
      const db = Database.Client()
      const now = Date.now()

      // Get total count
      const totalResult = await db
        .select({ count: count() })
        .from(GWorkspaceTokenTable)

      const totalTokens = totalResult[0]?.count ?? 0

      // Get expired count
      const expiredResult = await db
        .select({ count: count() })
        .from(GWorkspaceTokenTable)
        .where(lt(GWorkspaceTokenTable.expires_at, now))

      const expiredTokens = expiredResult[0]?.count ?? 0
      const activeTokens = totalTokens - expiredTokens

      // Get oldest token time_created
      const oldestResult = await db
        .select({ oldest: min(GWorkspaceTokenTable.time_created) })
        .from(GWorkspaceTokenTable)

      const oldestToken = oldestResult[0]?.oldest ?? null

      return {
        totalTokens,
        expiredTokens,
        activeTokens,
        oldestToken,
      }
    } catch (error) {
      log.error("failed to get statistics", {
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  /**
   * Retrieve cached result from idempotency key (if not expired)
   */
  export async function getIdempotencyResult(
    key: string,
    userId: string,
    workspaceId: string,
    operation: string
  ): Promise<unknown | null> {
    try {
      const db = Database.Client()
      const now = Date.now()

      const result = await db
        .select()
        .from(GWorkspaceIdempotencyKeyTable)
        .where(
          and(
            eq(GWorkspaceIdempotencyKeyTable.key, key),
            eq(GWorkspaceIdempotencyKeyTable.user_id, userId),
            eq(GWorkspaceIdempotencyKeyTable.workspace_id, workspaceId),
            eq(GWorkspaceIdempotencyKeyTable.operation, operation),
            // Only return if not expired
          )
        )
        .limit(1)

      if (!result.length) {
        return null
      }

      const row = result[0]
      // Check expiration
      if (row.expires_at <= now) {
        // Expired, but don't return it
        return null
      }

      // Parse and return the cached result
      return JSON.parse(row.result_data)
    } catch (error) {
      log.error("failed to get idempotency result", {
        key,
        userId,
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }

  /**
   * Store operation result with idempotency key (30min TTL)
   */
  export async function storeIdempotencyResult(
    key: string,
    userId: string,
    workspaceId: string,
    operation: string,
    result: unknown,
    ttlMs: number = 30 * 60 * 1000 // 30 minutes default
  ): Promise<void> {
    try {
      const db = Database.Client()
      const expiresAt = Date.now() + ttlMs

      await db
        .insert(GWorkspaceIdempotencyKeyTable)
        .values({
          key,
          user_id: userId,
          workspace_id: workspaceId,
          operation,
          result_data: JSON.stringify(result),
          expires_at: expiresAt,
        })
        .onConflictDoUpdate({
          target: [GWorkspaceIdempotencyKeyTable.key],
          set: {
            result_data: JSON.stringify(result),
            expires_at: expiresAt,
          },
        })

      log.debug("storeIdempotencyResult completed", {
        userId,
        operation,
        expiresAt,
      })
    } catch (error) {
      log.error("failed to store idempotency result", {
        key,
        userId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  /**
   * Cleanup expired idempotency keys
   */
  export async function cleanupIdempotencyKeys(): Promise<number> {
    try {
      const db = Database.Client()
      const now = Date.now()

      const result = await db
        .delete(GWorkspaceIdempotencyKeyTable)
        .where(lt(GWorkspaceIdempotencyKeyTable.expires_at, now))

      const deletedCount = (result as any).changes || 0
      log.debug("cleanupIdempotencyKeys completed", { deletedCount })
      return deletedCount
    } catch (error) {
      log.error("failed to cleanup idempotency keys", {
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }
}

// ============================================================================
// Integration with TokenManager
// ============================================================================

/**
 * Initialize database integration with TokenManager
 *
 * Call this once during application startup
 */
export async function initializeTokenDatabase(): Promise<void> {
  const log = Log.create({ service: "token-manager.init" })

  try {
    // Verify database connectivity
    const stats = await TokenDatabase.getStatistics()
    log.info("token database initialized", { stats })

    // Setup periodic cleanup (every hour)
    const cleanupInterval = setInterval(async () => {
      try {
        const count = await TokenDatabase.cleanupExpiredTokens()
        if (count > 0) {
          log.info("cleanup completed", { tokensDeleted: count })
        }
      } catch (error) {
        log.error("cleanup failed", { error })
      }
    }, 60 * 60 * 1000) // 1 hour

    // Store cleanup interval for graceful shutdown
    ;(globalThis as any).__tokenCleanupInterval = cleanupInterval
  } catch (error) {
    log.error("failed to initialize token database", {
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

/**
 * Cleanup on application shutdown
 */
export async function shutdownTokenDatabase(): Promise<void> {
  const interval = (globalThis as any).__tokenCleanupInterval
  if (interval) {
    clearInterval(interval)
  }
}

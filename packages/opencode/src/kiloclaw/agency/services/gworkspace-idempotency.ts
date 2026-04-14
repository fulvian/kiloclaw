// Google Workspace Idempotency Service
// Prevents duplicate operations via idempotency keys with 30-minute TTL

import { Log } from "@/util/log"
import { TokenDatabase } from "../auth/token-db"

// ============================================================================
// Idempotency Service
// ============================================================================

export namespace GWorkspaceIdempotency {
  const log = Log.create({ service: "gworkspace.idempotency" })

  /**
   * Generate idempotency key from operation and content
   * Uses SHA-256 hash of operation + content for deterministic keys
   */
  export async function generateKey(operationId: string, content: unknown): Promise<string> {
    const contentStr = JSON.stringify(content)
    const combined = `${operationId}:${contentStr}`

    // Use SubtleCrypto for SHA-256
    const encoder = new TextEncoder()
    const data = encoder.encode(combined)
    const hashBuffer = await crypto.subtle.digest("SHA-256", data)

    // Convert to hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
  }

  /**
   * Check if operation result is cached (cache hit)
   * Returns null if cache miss or expired
   */
  export async function getCachedResult(
    idempotencyKey: string,
    userId: string,
    workspaceId: string,
    operation: string
  ): Promise<unknown | null> {
    try {
      const cached = await TokenDatabase.getIdempotencyResult(idempotencyKey, userId, workspaceId, operation)

      if (cached) {
        log.debug("idempotency cache hit", {
          operation,
          userId,
          keyPrefix: idempotencyKey.substring(0, 8),
        })
        return cached
      }

      return null
    } catch (error) {
      log.warn("idempotency cache check failed", {
        operation,
        error: error instanceof Error ? error.message : String(error),
      })
      return null
    }
  }

  /**
   * Store operation result in idempotency cache
   * Automatically expires after 30 minutes
   */
  export async function cacheResult(
    idempotencyKey: string,
    userId: string,
    workspaceId: string,
    operation: string,
    result: unknown
  ): Promise<void> {
    try {
      await TokenDatabase.storeIdempotencyResult(idempotencyKey, userId, workspaceId, operation, result)

      log.debug("idempotency cache stored", {
        operation,
        userId,
        expiresIn: "30 minutes",
      })
    } catch (error) {
      log.warn("idempotency cache store failed", {
        operation,
        error: error instanceof Error ? error.message : String(error),
      })
      // Don't throw; cache failure shouldn't break operation
    }
  }

  /**
   * Cleanup expired idempotency keys (call periodically)
   */
  export async function cleanup(): Promise<number> {
    try {
      const count = await TokenDatabase.cleanupIdempotencyKeys()
      if (count > 0) {
        log.debug("idempotency cleanup completed", { deleted: count })
      }
      return count
    } catch (error) {
      log.error("idempotency cleanup failed", {
        error: error instanceof Error ? error.message : String(error),
      })
      return 0
    }
  }
}

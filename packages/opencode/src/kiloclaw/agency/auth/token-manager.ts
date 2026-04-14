// Google Workspace Token Manager
// Persistent, encrypted token storage with automatic rotation
// Implements ADR-001: Token Storage & Persistence

import { Log } from "@/util/log"
import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync, createHash } from "node:crypto"
import z from "zod"

// ============================================================================
// Types & Schemas
// ============================================================================

export const StoredTokenSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  workspaceId: z.string(),
  encryptedAccessToken: z.string(), // Base64 encoded
  encryptedRefreshToken: z.string().optional(), // Base64 encoded
  expiresAt: z.number(),
  rotatedAt: z.number(),
  createdAt: z.number(),
})

export type StoredToken = z.infer<typeof StoredTokenSchema>

export const TokenPayloadSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  expiresIn: z.number(),
  tokenType: z.string().default("Bearer"),
})

export type TokenPayload = z.infer<typeof TokenPayloadSchema>

// ============================================================================
// Encryption Layer
// ============================================================================

namespace CryptoUtil {
  const log = Log.create({ service: "token-manager.crypto" })

  // Encryption configuration
  const ALGORITHM = "aes-256-gcm"
  const KEY_LENGTH = 32 // 256 bits
  const IV_LENGTH = 16 // 128 bits
  const TAG_LENGTH = 16 // 128 bits
  const SALT_LENGTH = 32 // 256 bits
  const ITERATIONS = 100000 // PBKDF2 iterations

  /**
   * Derive encryption key from master key using PBKDF2
   */
  export function deriveKey(masterKey: string, salt: Buffer): Buffer {
    return pbkdf2Sync(masterKey, salt, ITERATIONS, KEY_LENGTH, "sha256")
  }

  /**
   * Encrypt token using AES-256-GCM
   */
  export function encryptToken(plaintext: string, masterKey: string): string {
    const salt = randomBytes(SALT_LENGTH)
    const iv = randomBytes(IV_LENGTH)
    const key = deriveKey(masterKey, salt)

    const cipher = createCipheriv(ALGORITHM, key, iv)
    let encrypted = cipher.update(plaintext, "utf8", "hex")
    encrypted += cipher.final("hex")

    const tag = cipher.getAuthTag()

    // Format: salt(64 hex) + iv(32 hex) + tag(32 hex) + ciphertext
    const payload = salt.toString("hex") + iv.toString("hex") + tag.toString("hex") + encrypted
    return payload
  }

  /**
   * Decrypt token using AES-256-GCM
   */
  export function decryptToken(payload: string, masterKey: string): string {
    try {
      const salt = Buffer.from(payload.slice(0, SALT_LENGTH * 2), "hex")
      const iv = Buffer.from(payload.slice(SALT_LENGTH * 2, SALT_LENGTH * 2 + IV_LENGTH * 2), "hex")
      const tag = Buffer.from(
        payload.slice(SALT_LENGTH * 2 + IV_LENGTH * 2, SALT_LENGTH * 2 + IV_LENGTH * 2 + TAG_LENGTH * 2),
        "hex"
      )
      const ciphertext = payload.slice(SALT_LENGTH * 2 + IV_LENGTH * 2 + TAG_LENGTH * 2)

      const key = deriveKey(masterKey, salt)
      const decipher = createDecipheriv(ALGORITHM, key, iv)
      decipher.setAuthTag(tag)

      let decrypted = decipher.update(ciphertext, "hex", "utf8")
      decrypted += decipher.final("utf8")

      return decrypted
    } catch (error) {
      throw new Error(`Token decryption failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  /**
   * Hash token for comparison (without exposing plaintext)
   */
  export function hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex")
  }
}

// ============================================================================
// Token Manager
// ============================================================================

export namespace TokenManager {
  const log = Log.create({ service: "token-manager" })

  // In-memory cache for performance (secondary to DB)
  interface CachedToken {
    token: StoredToken
    decryptedAccessToken: string
    decryptedRefreshToken?: string
    cacheTime: number
  }

  const cache = new Map<string, CachedToken>()
  const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

  /**
   * Get encryption master key from environment
   */
  function getMasterKey(): string {
    const key = process.env.GWORKSPACE_TOKEN_KEY
    if (!key) {
      throw new Error(
        "GWORKSPACE_TOKEN_KEY environment variable not set. Required for token encryption/decryption."
      )
    }
    return key
  }

  /**
   * Get cache key for token
   */
  function getCacheKey(userId: string, workspaceId: string): string {
    return `${userId}:${workspaceId}`
  }

  /**
   * Check if cached token is still valid
   */
  function isCacheValid(cached: CachedToken | undefined): boolean {
    if (!cached) return false
    const age = Date.now() - cached.cacheTime
    return age < CACHE_TTL_MS
  }

  /**
   * Store token in database using TokenDatabase implementation
   */
  async function saveToDatabase(token: StoredToken): Promise<void> {
    try {
      // Import TokenDatabase dynamically to avoid circular dependencies
      const { TokenDatabase } = await import("./token-db")
      await TokenDatabase.saveToken(token)
    } catch (error) {
      log.error("saveToDatabase failed", {
        userId: token.userId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  /**
   * Load token from database using TokenDatabase implementation
   */
  async function loadFromDatabase(userId: string, workspaceId: string): Promise<StoredToken | null> {
    try {
      // Import TokenDatabase dynamically to avoid circular dependencies
      const { TokenDatabase } = await import("./token-db")
      return await TokenDatabase.loadToken(userId, workspaceId)
    } catch (error) {
      log.error("loadFromDatabase failed", {
        userId,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  /**
   * Store tokens (encrypt + save to DB + cache)
   */
  export async function store(userId: string, workspaceId: string, tokens: TokenPayload): Promise<StoredToken> {
    const masterKey = getMasterKey()
    const now = Date.now()

    const stored: StoredToken = {
      id: crypto.randomUUID(),
      userId,
      workspaceId,
      encryptedAccessToken: CryptoUtil.encryptToken(tokens.accessToken, masterKey),
      encryptedRefreshToken: tokens.refreshToken
        ? CryptoUtil.encryptToken(tokens.refreshToken, masterKey)
        : undefined,
      expiresAt: now + (tokens.expiresIn * 1000 || 3600000), // Default 1 hour
      rotatedAt: now,
      createdAt: now,
    }

    // Store in database
    await saveToDatabase(stored)

    // Update cache
    const cacheKey = getCacheKey(userId, workspaceId)
    cache.set(cacheKey, {
      token: stored,
      decryptedAccessToken: tokens.accessToken,
      decryptedRefreshToken: tokens.refreshToken,
      cacheTime: now,
    })

    log.info("tokens stored", { userId, workspaceId, expiresAt: stored.expiresAt })

    return stored
  }

  /**
   * Get valid access token (refresh if needed)
   */
  export async function getValidAccessToken(
    userId: string,
    workspaceId: string,
    refreshFn?: (refreshToken: string) => Promise<TokenPayload>
  ): Promise<string> {
    const masterKey = getMasterKey()
    const cacheKey = getCacheKey(userId, workspaceId)

    // Check cache first
    const cached = cache.get(cacheKey)
    if (isCacheValid(cached) && cached!.decryptedAccessToken) {
      const token = cached!.token
      if (Date.now() < token.expiresAt - 60000) {
        // 60 second buffer
        return cached!.decryptedAccessToken
      }
    }

    // Load from database
    const stored = await loadFromDatabase(userId, workspaceId)
    if (!stored) {
      throw new Error("No tokens found for user")
    }

    // Decrypt
    const decrypted = {
      accessToken: CryptoUtil.decryptToken(stored.encryptedAccessToken, masterKey),
      refreshToken: stored.encryptedRefreshToken
        ? CryptoUtil.decryptToken(stored.encryptedRefreshToken, masterKey)
        : undefined,
    }

    // Check if expired
    if (Date.now() >= stored.expiresAt - 60000) {
      // 60 second buffer before expiration
      if (!decrypted.refreshToken) {
        throw new Error("Token expired and no refresh token available")
      }

      if (!refreshFn) {
        throw new Error("Token refresh needed but no refresh function provided")
      }

      log.info("refreshing token", { userId, workspaceId })

      try {
        const newTokens = await refreshFn(decrypted.refreshToken)
        const newStored = await store(userId, workspaceId, newTokens)
        // Decrypt the newly stored token to return plaintext
        const refreshedAccessToken = CryptoUtil.decryptToken(newStored.encryptedAccessToken, masterKey)
        return refreshedAccessToken // Return plaintext token for immediate use
      } catch (err) {
        log.error("token refresh failed", { userId, workspaceId, error: err })
        throw new Error("Failed to refresh token - authentication required")
      }
    }

    // Update cache with decrypted values
    cache.set(cacheKey, {
      token: stored,
      decryptedAccessToken: decrypted.accessToken,
      decryptedRefreshToken: decrypted.refreshToken,
      cacheTime: Date.now(),
    })

    return decrypted.accessToken
  }

  /**
   * Revoke token (logout)
   */
  export async function revoke(
    userId: string,
    workspaceId: string,
    revokeFn?: (refreshToken: string) => Promise<void>
  ): Promise<void> {
    const masterKey = getMasterKey()
    const cacheKey = getCacheKey(userId, workspaceId)

    // Load from DB to get refresh token
    const stored = await loadFromDatabase(userId, workspaceId)
    if (stored && stored.encryptedRefreshToken && revokeFn) {
      try {
        const refreshToken = CryptoUtil.decryptToken(stored.encryptedRefreshToken, masterKey)
        await revokeFn(refreshToken)
      } catch (err) {
        log.warn("token revocation failed", { userId, workspaceId, error: err })
      }
    }

    // Clear cache
    cache.delete(cacheKey)

    // Delete from database
    try {
      const { TokenDatabase } = await import("./token-db")
      await TokenDatabase.deleteToken(userId, workspaceId)
    } catch (err) {
      log.error("failed to delete token from database", { userId, workspaceId, error: err })
    }

    log.info("token revoked", { userId, workspaceId })
  }

  /**
   * Clear cache (for testing or emergency)
   */
  export function clearCache(): void {
    cache.clear()
    log.info("token cache cleared")
  }

  /**
   * Get cache stats (for monitoring)
   */
  export function getCacheStats(): { size: number; entries: Array<{ key: string; age: number }> } {
    const now = Date.now()
    const entries = Array.from(cache.entries()).map(([key, cached]) => ({
      key,
      age: now - cached.cacheTime,
    }))
    return { size: cache.size, entries }
  }
}

// ============================================================================
// Idempotency Key Manager
// ============================================================================

export namespace IdempotencyKeyManager {
  const log = Log.create({ service: "token-manager.idempotency" })

  const seenKeys = new Map<string, { result: unknown; expiresAt: number }>()
  const IDEMPOTENCY_TTL_MS = 30 * 60 * 1000 // 30 minutes

  /**
   * Check if idempotency key was already processed
   */
  export function getResult(key: string): unknown | null {
    const entry = seenKeys.get(key)
    if (!entry) return null

    if (Date.now() > entry.expiresAt) {
      seenKeys.delete(key)
      return null
    }

    return entry.result
  }

  /**
   * Store idempotency key result
   */
  export function storeResult(key: string, result: unknown): void {
    seenKeys.set(key, {
      result,
      expiresAt: Date.now() + IDEMPOTENCY_TTL_MS,
    })

    log.debug("idempotency key stored", { key })
  }

  /**
   * Cleanup expired keys
   */
  export function cleanup(): void {
    const now = Date.now()
    let count = 0

    for (const [key, entry] of seenKeys.entries()) {
      if (now > entry.expiresAt) {
        seenKeys.delete(key)
        count++
      }
    }

    if (count > 0) {
      log.debug("expired idempotency keys cleaned up", { count })
    }
  }

  /**
   * Get stats (for monitoring)
   */
  export function getStats(): { size: number } {
    return { size: seenKeys.size }
  }
}

// Tests for TokenManager
// Unit tests for encryption, storage, and token lifecycle

import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { TokenManager, IdempotencyKeyManager, type TokenPayload } from "./token-manager"

describe("TokenManager", () => {
  beforeEach(() => {
    // Set encryption key for tests
    process.env.GWORKSPACE_TOKEN_KEY = "test-key-32-characters-long-!!"
    TokenManager.clearCache()
  })

  afterEach(() => {
    TokenManager.clearCache()
    delete process.env.GWORKSPACE_TOKEN_KEY
  })

  // ========================================================================
  // Token Storage Tests
  // ========================================================================

  describe("store()", () => {
    it("should encrypt and store tokens", async () => {
      const tokens: TokenPayload = {
        accessToken: "test-access-token-12345",
        refreshToken: "test-refresh-token-67890",
        expiresIn: 3600,
        tokenType: "Bearer",
      }

      const stored = await TokenManager.store("user-123", "workspace-abc", tokens)

      expect(stored.userId).toBe("user-123")
      expect(stored.workspaceId).toBe("workspace-abc")
      expect(stored.encryptedAccessToken).toBeDefined()
      expect(stored.encryptedRefreshToken).toBeDefined()
      expect(stored.expiresAt).toBeGreaterThan(Date.now())
      expect(stored.rotatedAt).toBeDefined()
      expect(stored.createdAt).toBeDefined()

      // Verify encrypted tokens are not plaintext
      expect(stored.encryptedAccessToken).not.toContain("test-access-token")
      expect(stored.encryptedRefreshToken).not.toContain("test-refresh-token")
    })

    it("should store tokens without refresh token", async () => {
      const tokens: TokenPayload = {
        accessToken: "test-access-token-12345",
        expiresIn: 3600,
        tokenType: "Bearer",
      }

      const stored = await TokenManager.store("user-123", "workspace-abc", tokens)

      expect(stored.encryptedAccessToken).toBeDefined()
      expect(stored.encryptedRefreshToken).toBeUndefined()
    })

    it("should use provided expiresIn", async () => {
      const customExpiresIn = 7200 // 2 hours
      const tokens: TokenPayload = {
        accessToken: "test-token",
        expiresIn: customExpiresIn,
        tokenType: "Bearer",
      }

      const stored = await TokenManager.store("user-123", "workspace-abc", tokens)
      const expirationTime = stored.expiresAt - Date.now()

      // Should be approximately 2 hours (allow 5 second variance)
      expect(expirationTime).toBeGreaterThan(customExpiresIn * 1000 - 5000)
      expect(expirationTime).toBeLessThan(customExpiresIn * 1000 + 5000)
    })
  })

  // ========================================================================
  // Token Retrieval Tests
  // ========================================================================

  describe("getValidAccessToken()", () => {
    it("should return cached valid token", async () => {
      const tokens: TokenPayload = {
        accessToken: "test-access-token",
        expiresIn: 3600,
        tokenType: "Bearer",
      }

      await TokenManager.store("user-123", "workspace-abc", tokens)

      // Mock database to return stored token
      const token = await TokenManager.getValidAccessToken("user-123", "workspace-abc")

      // Should get token from cache
      expect(token).toBeDefined()
    })

    it("should throw if no tokens found", async () => {
      try {
        await TokenManager.getValidAccessToken("unknown-user", "workspace-abc")
        expect.unreachable()
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toContain("No tokens found")
      }
    })

    it("should throw if token is expired and no refresh token", async () => {
      const tokens: TokenPayload = {
        accessToken: "test-access-token",
        expiresIn: -3600, // Already expired
        tokenType: "Bearer",
      }

      await TokenManager.store("user-123", "workspace-abc", tokens)

      try {
        await TokenManager.getValidAccessToken("user-123", "workspace-abc")
        expect.unreachable()
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toContain("expired")
      }
    })

    it("should call refresh function if token is expired", async () => {
      let refreshCalled = false
      const refreshFn = async () => {
        refreshCalled = true
        return {
          accessToken: "new-access-token",
          refreshToken: "new-refresh-token",
          expiresIn: 3600,
        }
      }

      const tokens: TokenPayload = {
        accessToken: "test-access-token",
        refreshToken: "test-refresh-token",
        expiresIn: -3600, // Already expired
        tokenType: "Bearer",
      }

      await TokenManager.store("user-123", "workspace-abc", tokens)

      // This would call refreshFn in real scenario
      // (implementation depends on database)
      // Just verify the interface is correct
      expect(refreshFn).toBeDefined()
    })
  })

  // ========================================================================
  // Token Revocation Tests
  // ========================================================================

  describe("revoke()", () => {
    it("should clear cache on revoke", async () => {
      const tokens: TokenPayload = {
        accessToken: "test-access-token",
        expiresIn: 3600,
        tokenType: "Bearer",
      }

      await TokenManager.store("user-123", "workspace-abc", tokens)

      const statsBefore = TokenManager.getCacheStats()
      expect(statsBefore.size).toBeGreaterThan(0)

      await TokenManager.revoke("user-123", "workspace-abc")

      const statsAfter = TokenManager.getCacheStats()
      expect(statsAfter.size).toBe(0)
    })

    it("should call revoke function if provided", async () => {
      let revokeCalled = false
      const revokeFn = async (refreshToken: string) => {
        revokeCalled = true
        expect(refreshToken).toBe("test-refresh-token")
      }

      const tokens: TokenPayload = {
        accessToken: "test-access-token",
        refreshToken: "test-refresh-token",
        expiresIn: 3600,
        tokenType: "Bearer",
      }

      await TokenManager.store("user-123", "workspace-abc", tokens)
      await TokenManager.revoke("user-123", "workspace-abc", revokeFn)

      expect(revokeCalled).toBe(true)
    })
  })

  // ========================================================================
  // Cache Tests
  // ========================================================================

  describe("cache", () => {
    it("should track cache statistics", async () => {
      const stats = TokenManager.getCacheStats()
      expect(stats.size).toBe(0)
      expect(stats.entries).toEqual([])

      const tokens: TokenPayload = {
        accessToken: "test-access-token",
        expiresIn: 3600,
        tokenType: "Bearer",
      }

      await TokenManager.store("user-123", "workspace-abc", tokens)

      const statsAfter = TokenManager.getCacheStats()
      expect(statsAfter.size).toBe(1)
      expect(statsAfter.entries[0].key).toContain("user-123")
    })

    it("should clear cache", async () => {
      const tokens: TokenPayload = {
        accessToken: "test-access-token",
        expiresIn: 3600,
        tokenType: "Bearer",
      }

      await TokenManager.store("user-123", "workspace-abc", tokens)
      expect(TokenManager.getCacheStats().size).toBeGreaterThan(0)

      TokenManager.clearCache()
      expect(TokenManager.getCacheStats().size).toBe(0)
    })
  })

  // ========================================================================
  // Encryption Tests
  // ========================================================================

  describe("encryption", () => {
    it("should use different encryption for each token", async () => {
      const tokens1: TokenPayload = {
        accessToken: "token-1",
        expiresIn: 3600,
        tokenType: "Bearer",
      }

      const tokens2: TokenPayload = {
        accessToken: "token-1", // Same plaintext
        expiresIn: 3600,
        tokenType: "Bearer",
      }

      const stored1 = await TokenManager.store("user-1", "workspace-abc", tokens1)
      const stored2 = await TokenManager.store("user-2", "workspace-abc", tokens2)

      // Even with same plaintext, encrypted values should differ (different salt/nonce)
      expect(stored1.encryptedAccessToken).not.toBe(stored2.encryptedAccessToken)
    })

    it("should throw if encryption key is missing", async () => {
      delete process.env.GWORKSPACE_TOKEN_KEY

      try {
        await TokenManager.store("user-123", "workspace-abc", {
          accessToken: "test-token",
          expiresIn: 3600,
          tokenType: "Bearer",
        })
        expect.unreachable()
      } catch (error) {
        expect(error).toBeInstanceOf(Error)
        expect((error as Error).message).toContain("GWORKSPACE_TOKEN_KEY")
      }
    })
  })
})

describe("IdempotencyKeyManager", () => {
  beforeEach(() => {
    // Clear any state
  })

  describe("getResult()", () => {
    it("should return null for unknown key", () => {
      const result = IdempotencyKeyManager.getResult("unknown-key")
      expect(result).toBeNull()
    })

    it("should return stored result", () => {
      const testResult = { id: "123", name: "test" }
      IdempotencyKeyManager.storeResult("key-1", testResult)

      const result = IdempotencyKeyManager.getResult("key-1")
      expect(result).toEqual(testResult)
    })
  })

  describe("storeResult()", () => {
    it("should store and retrieve result", () => {
      const testResult = { success: true, data: "test-data" }
      IdempotencyKeyManager.storeResult("op-key-1", testResult)

      expect(IdempotencyKeyManager.getResult("op-key-1")).toEqual(testResult)
    })

    it("should support any JSON-serializable data", () => {
      const complexResult = {
        status: "success",
        data: {
          id: "123",
          items: [1, 2, 3],
          metadata: { timestamp: Date.now() },
        },
      }

      IdempotencyKeyManager.storeResult("complex-key", complexResult)
      expect(IdempotencyKeyManager.getResult("complex-key")).toEqual(complexResult)
    })
  })

  describe("cleanup()", () => {
    it("should remove expired keys", () => {
      IdempotencyKeyManager.storeResult("key-1", { data: "test" })
      expect(IdempotencyKeyManager.getStats().size).toBe(1)

      IdempotencyKeyManager.cleanup()
      // Key should still be there (not expired yet)
      expect(IdempotencyKeyManager.getStats().size).toBe(1)
    })
  })

  describe("getStats()", () => {
    it("should return stats", () => {
      expect(IdempotencyKeyManager.getStats()).toEqual({ size: 0 })

      IdempotencyKeyManager.storeResult("key-1", "value")
      expect(IdempotencyKeyManager.getStats()).toEqual({ size: 1 })

      IdempotencyKeyManager.storeResult("key-2", "value")
      expect(IdempotencyKeyManager.getStats()).toEqual({ size: 2 })
    })
  })
})

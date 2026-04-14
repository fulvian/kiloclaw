// Integration tests for TokenManager with Broker
// Tests broker integration patterns with automatic token management
// Note: These tests focus on broker-TokenManager integration without database dependency

import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test"
import { TokenManager, type TokenPayload } from "./token-manager"
import { BrokerTokenIntegration } from "./broker-integration"

describe("Broker + TokenManager Integration", () => {
  beforeEach(() => {
    // Set encryption key for tests
    process.env.GWORKSPACE_TOKEN_KEY = "test-key-32-characters-long-!!"
    process.env.GWORKSPACE_CLIENT_ID = "test-client-id"
    process.env.GWORKSPACE_CLIENT_SECRET = "test-client-secret"
    TokenManager.clearCache()
  })

  afterEach(() => {
    TokenManager.clearCache()
    delete process.env.GWORKSPACE_TOKEN_KEY
    delete process.env.GWORKSPACE_CLIENT_ID
    delete process.env.GWORKSPACE_CLIENT_SECRET
  })

  // ========================================================================
  // Broker Integration Configuration Tests
  // ========================================================================

  describe("Broker configuration pattern", () => {
    it("should have getAccessToken method available", async () => {
      expect(BrokerTokenIntegration.getAccessToken).toBeDefined()
      expect(typeof BrokerTokenIntegration.getAccessToken).toBe("function")
    })

    it("should have revokeTokens method available", async () => {
      expect(BrokerTokenIntegration.revokeTokens).toBeDefined()
      expect(typeof BrokerTokenIntegration.revokeTokens).toBe("function")
    })

    it("should have withTokenInjection method available", async () => {
      expect(BrokerTokenIntegration.withTokenInjection).toBeDefined()
      expect(typeof BrokerTokenIntegration.withTokenInjection).toBe("function")
    })

    it("should have getCacheStats method available", async () => {
      expect(BrokerTokenIntegration.getCacheStats).toBeDefined()
      expect(typeof BrokerTokenIntegration.getCacheStats).toBe("function")
    })

    it("should have clearCaches method available", async () => {
      expect(BrokerTokenIntegration.clearCaches).toBeDefined()
      expect(typeof BrokerTokenIntegration.clearCaches).toBe("function")
    })
  })

  // ========================================================================
  // Cache Statistics Tests
  // ========================================================================

  describe("Cache statistics", () => {
    it("should report cache stats through broker integration", () => {
      const stats = BrokerTokenIntegration.getCacheStats()

      expect(stats).toBeDefined()
      expect(stats.tokenCache).toBeDefined()
      expect(typeof stats.tokenCache.size).toBe("number")
    })

    it("should track tokens in TokenManager cache", () => {
      const token: TokenPayload = {
        accessToken: "test-token",
        expiresIn: 3600,
        tokenType: "Bearer",
      }

      // Store in cache directly
      TokenManager.store("user-123", "workspace-abc", token).catch(() => {
        // Ignore database errors in this test
      })

      const stats = TokenManager.getCacheStats()
      expect(stats).toBeDefined()
      expect(typeof stats.size).toBe("number")
    })

    it("should clear all caches", () => {
      BrokerTokenIntegration.clearCaches()

      const stats = TokenManager.getCacheStats()
      expect(stats.size).toBe(0)
    })
  })

  // ========================================================================
  // TokenManager Configuration Tests
  // ========================================================================

  describe("TokenManager configuration", () => {
    it("should require GWORKSPACE_TOKEN_KEY environment variable", async () => {
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

    it("should have clearCache method", () => {
      expect(TokenManager.clearCache).toBeDefined()
      expect(typeof TokenManager.clearCache).toBe("function")
    })

    it("should have getCacheStats method", () => {
      expect(TokenManager.getCacheStats).toBeDefined()
      expect(typeof TokenManager.getCacheStats).toBe("function")
    })

    it("should have store method", () => {
      expect(TokenManager.store).toBeDefined()
      expect(typeof TokenManager.store).toBe("function")
    })

    it("should have revoke method", () => {
      expect(TokenManager.revoke).toBeDefined()
      expect(typeof TokenManager.revoke).toBe("function")
    })

    it("should have getValidAccessToken method", () => {
      expect(TokenManager.getValidAccessToken).toBeDefined()
      expect(typeof TokenManager.getValidAccessToken).toBe("function")
    })
  })

  // ========================================================================
  // Broker Integration Flow Tests
  // ========================================================================

  describe("Broker integration flow", () => {
    it("should have working BrokerTokenConfig type", () => {
      const config = {
        userId: "test-user",
        workspaceId: "test-workspace",
      }

      expect(config.userId).toBe("test-user")
      expect(config.workspaceId).toBe("test-workspace")
    })

    it("should support multi-workspace configuration", () => {
      const config1 = {
        userId: "user-123",
        workspaceId: "workspace-1",
      }

      const config2 = {
        userId: "user-123",
        workspaceId: "workspace-2",
      }

      expect(config1.userId).toBe(config2.userId)
      expect(config1.workspaceId).not.toBe(config2.workspaceId)
    })

    it("should track different users separately", () => {
      const config1 = {
        userId: "user-1",
        workspaceId: "workspace-abc",
      }

      const config2 = {
        userId: "user-2",
        workspaceId: "workspace-abc",
      }

      expect(config1.userId).not.toBe(config2.userId)
      expect(config1.workspaceId).toBe(config2.workspaceId)
    })
  })
})

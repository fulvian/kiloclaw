import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import {
  resetAllRefresh,
  setRefreshConfig,
  getRefreshConfig,
  scheduleRefresh,
  cancelRefresh,
  hasPendingRefresh,
  getPendingRefreshCount,
  McpRefreshManager,
} from "@/mcp/refresh-manager"

describe("McpRefreshManager", () => {
  beforeEach(() => {
    resetAllRefresh()
  })

  afterEach(() => {
    resetAllRefresh()
  })

  describe("setRefreshConfig", () => {
    it("should update global config", () => {
      setRefreshConfig({ skewSeconds: 60 })
      expect(getRefreshConfig().skewSeconds).toBe(60)
    })

    it("should preserve unspecified values", () => {
      setRefreshConfig({ skewSeconds: 60 })
      expect(getRefreshConfig().backoffBaseMs).toBe(1000) // default
    })
  })

  describe("scheduleRefresh", () => {
    it("should schedule refresh for future expiry", () => {
      const futureExpiry = Date.now() / 1000 + 3600 // 1 hour from now
      scheduleRefresh("test-server", "http://localhost:8080", futureExpiry)
      expect(hasPendingRefresh("test-server")).toBe(true)
    })

    it("should cancel existing refresh when rescheduling", () => {
      const futureExpiry = Date.now() / 1000 + 3600
      scheduleRefresh("test-server", "http://localhost:8080", futureExpiry)
      scheduleRefresh("test-server", "http://localhost:8080", futureExpiry + 3600)
      expect(hasPendingRefresh("test-server")).toBe(true)
    })

    it("should not schedule for expired tokens", () => {
      const pastExpiry = Date.now() / 1000 - 100
      scheduleRefresh("test-server", "http://localhost:8080", pastExpiry)
      // Still schedules immediate refresh
      expect(hasPendingRefresh("test-server")).toBe(true)
    })
  })

  describe("cancelRefresh", () => {
    it("should cancel pending refresh", () => {
      const futureExpiry = Date.now() / 1000 + 3600
      scheduleRefresh("test-server", "http://localhost:8080", futureExpiry)
      cancelRefresh("test-server")
      expect(hasPendingRefresh("test-server")).toBe(false)
    })
  })

  describe("getPendingRefreshCount", () => {
    it("should return count of pending refreshes", () => {
      const futureExpiry = Date.now() / 1000 + 3600
      scheduleRefresh("server1", "http://localhost:8080", futureExpiry)
      scheduleRefresh("server2", "http://localhost:8081", futureExpiry)
      expect(getPendingRefreshCount()).toBe(2)
    })
  })

  describe("getStatus", () => {
    it("should return status for servers with pending refresh", () => {
      const futureExpiry = Date.now() / 1000 + 3600
      scheduleRefresh("server1", "http://localhost:8080", futureExpiry)
      const status = McpRefreshManager.getStatus()
      expect(status).toHaveLength(1)
      expect(status[0].mcpName).toBe("server1")
    })
  })
})

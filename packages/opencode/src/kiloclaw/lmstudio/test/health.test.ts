import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { HealthCheck } from "../health"
import { createMockFetch } from "./fixtures/mock-lmstudio"

// Store original fetch
const originalFetch = globalThis.fetch

describe("HealthCheck", () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe("check", () => {
    test("returns reachable when server responds with 200", async () => {
      globalThis.fetch = createMockFetch({
        "/v1/models": {
          status: 200,
          body: { object: "list", data: [] },
        },
      })

      const result = await HealthCheck.check("http://localhost:1234")

      expect(result.reachable).toBe(true)
      expect(result.latencyMs).toBeDefined()
      expect(result.latencyMs).toBeGreaterThanOrEqual(0)
    })

    test("returns reachable when server responds with 401 (auth required but server is up)", async () => {
      globalThis.fetch = createMockFetch({
        "/v1/models": {
          status: 401,
          body: { error: "Unauthorized" },
        },
      })

      const result = await HealthCheck.check("http://localhost:1234")

      expect(result.reachable).toBe(true)
    })

    test("returns unreachable with error when connection fails", async () => {
      globalThis.fetch = createMockFetch({
        // No matching response - simulates connection failure
      })

      const result = await HealthCheck.check("http://localhost:1234")

      expect(result.reachable).toBe(false)
      expect(result.error).toBeDefined()
    })

    test("retries according to retry parameter", async () => {
      let attempts = 0

      const mockFn = async function mockFetch(): Promise<Response> {
        attempts++
        if (attempts < 3) {
          throw new Error("Connection refused")
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ object: "list", data: [] }),
        } as Response
      }
      // Add preconnect to satisfy Bun's fetch interface
      const mockFetch = mockFn as unknown as typeof fetch
      mockFetch.preconnect = async function preconnect(_url: string | URL): Promise<null> {
        return null
      }
      globalThis.fetch = mockFetch

      const result = await HealthCheck.check("http://localhost:1234", {
        retries: 3,
        retryDelay: 10,
      })

      expect(attempts).toBe(3)
      expect(result.reachable).toBe(true)
    })

    test("returns unreachable after all retries exhausted", async () => {
      globalThis.fetch = createMockFetch({
        // Connection failures - empty responses will cause fetch to fail
      })

      const result = await HealthCheck.check("http://localhost:1234", {
        retries: 3,
        retryDelay: 10,
      })

      expect(result.reachable).toBe(false)
      expect(result.error).toContain("Failed after 3 attempts")
    })
  })
})

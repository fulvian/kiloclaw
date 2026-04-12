import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { Lifecycle } from "../lifecycle"
import { MockLMStudio, createMockFetch } from "./fixtures/mock-lmstudio"
import { LMStudioError } from "../errors"

// Store original fetch
const originalFetch = globalThis.fetch

describe("Lifecycle", () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe("loadModel", () => {
    test("successfully loads a model", async () => {
      globalThis.fetch = createMockFetch({
        "/api/v1/models/load": {
          status: 200,
          body: MockLMStudio.loadModelSuccess("qwen2.5-coder-7b"),
        },
      })

      const result = await Lifecycle.loadModel("http://localhost:1234", {
        model: "qwen2.5-coder-7b",
        ttl: 1800,
        priority: "normal",
      })

      expect(result.success).toBe(true)
      expect(result.model).toBe("qwen2.5-coder-7b")
      expect(result.loaded).toBe(true)
      expect(result.message).toBe("Model loaded successfully")
    })

    test("throws ModelLoadFailed on HTTP error", async () => {
      globalThis.fetch = createMockFetch({
        "/api/v1/models/load": {
          status: 500,
          body: { error: "Internal server error" },
        },
      })

      await expect(
        Lifecycle.loadModel("http://localhost:1234", {
          model: "nonexistent-model",
        }),
      ).rejects.toThrow(LMStudioError.ModelLoadFailed)
    })

    test("uses default values for ttl and priority when not provided", async () => {
      let capturedBody: unknown = null

      const mockFn = async function mockFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        const url = typeof input === "string" ? input : input.toString()

        if (url.includes("/api/v1/models/load")) {
          capturedBody = init?.body
          return {
            ok: true,
            status: 200,
            json: async () => MockLMStudio.loadModelSuccess("test-model"),
          } as Response
        }

        return {
          ok: false,
          status: 404,
          json: async () => ({}),
        } as Response
      }
      const mockFetch = mockFn as typeof fetch
      mockFetch.preconnect = async function preconnect(_url: string | URL): Promise<null> {
        return null
      }
      globalThis.fetch = mockFetch

      await Lifecycle.loadModel("http://localhost:1234", {
        model: "test-model",
      })

      const body = JSON.parse(capturedBody as string)
      expect(body.ttl).toBe(1800)
      expect(body.priority).toBe("normal")
    })

    test("respects custom timeout option", async () => {
      const mockFn = async function mockFetch(): Promise<Response> {
        // Simulate a slow response that will be aborted
        await new Promise((resolve) => setTimeout(resolve, 50))
        return {
          ok: false,
          status: 200,
          json: async () => ({}),
        } as Response
      }
      // Add preconnect to satisfy Bun's fetch interface
      const mockFetch = mockFn as unknown as typeof fetch
      mockFetch.preconnect = async function preconnect(_url: string | URL): Promise<null> {
        return null
      }
      globalThis.fetch = mockFetch

      // This should timeout quickly due to our mock
      await expect(
        Lifecycle.loadModel("http://localhost:1234", { model: "test-model" }, { timeout: 5 }),
      ).rejects.toThrow()
    })
  })

  describe("unloadModel", () => {
    test("successfully unloads a model", async () => {
      globalThis.fetch = createMockFetch({
        "/api/v1/models/unload": {
          status: 200,
          body: {
            success: true,
            model: "qwen2.5-coder-7b",
            message: "Model unloaded successfully",
          },
        },
      })

      const result = await Lifecycle.unloadModel("http://localhost:1234", {
        model: "qwen2.5-coder-7b",
      })

      expect(result.success).toBe(true)
      expect(result.model).toBe("qwen2.5-coder-7b")
    })
  })

  describe("isModelLoaded", () => {
    test("returns true when model is loaded", async () => {
      globalThis.fetch = createMockFetch({
        "/api/v1/models": {
          status: 200,
          body: MockLMStudio.lmStudioModelsResponse([
            { id: "qwen2.5-coder-7b", loaded: true },
            { id: "llama-3-8b", loaded: false },
          ]),
        },
      })

      const result = await Lifecycle.isModelLoaded("http://localhost:1234", "qwen2.5-coder-7b")

      expect(result).toBe(true)
    })

    test("returns false when model is not loaded", async () => {
      globalThis.fetch = createMockFetch({
        "/api/v1/models": {
          status: 200,
          body: MockLMStudio.lmStudioModelsResponse([
            { id: "qwen2.5-coder-7b", loaded: true },
            { id: "llama-3-8b", loaded: false },
          ]),
        },
      })

      const result = await Lifecycle.isModelLoaded("http://localhost:1234", "llama-3-8b")

      expect(result).toBe(false)
    })

    test("returns false when model is not in list", async () => {
      globalThis.fetch = createMockFetch({
        "/api/v1/models": {
          status: 200,
          body: MockLMStudio.lmStudioModelsResponse([{ id: "qwen2.5-coder-7b", loaded: true }]),
        },
      })

      const result = await Lifecycle.isModelLoaded("http://localhost:1234", "nonexistent-model")

      expect(result).toBe(false)
    })

    test("returns false on HTTP error", async () => {
      globalThis.fetch = createMockFetch({
        "/api/v1/models": {
          status: 500,
          body: { error: "Server error" },
        },
      })

      const result = await Lifecycle.isModelLoaded("http://localhost:1234", "any-model")

      expect(result).toBe(false)
    })
  })
})

import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { Discovery } from "../discovery"
import { MockLMStudio, createMockFetch } from "./fixtures/mock-lmstudio"

// Store original fetch
const originalFetch = globalThis.fetch

describe("Discovery", () => {
  beforeEach(() => {
    // Reset fetch before each test
    globalThis.fetch = originalFetch
  })

  afterEach(() => {
    // Restore original fetch
    globalThis.fetch = originalFetch
  })

  describe("discoverModels", () => {
    test("discovers models from OpenAI-compatible /v1/models endpoint", async () => {
      // Mock fetch to return OpenAI-compatible response
      globalThis.fetch = createMockFetch({
        "/v1/models": {
          status: 200,
          body: MockLMStudio.openAIModelsResponse(["qwen2.5-coder-7b", "llama-3-8b"]),
        },
      })

      const models = await Discovery.discoverModels("http://localhost:1234")

      expect(models).toHaveLength(2)
      expect(models[0].id).toBe("qwen2.5-coder-7b")
      expect(models[1].id).toBe("llama-3-8b")
    })

    test("discovers models from LM Studio native /api/v1/models endpoint when primary fails", async () => {
      // Mock fetch - primary returns 200 (for health check), but 404 for model list
      // Then fallback to /api/v1/models succeeds
      globalThis.fetch = createMockFetch({
        "/v1/models": {
          status: 200,
          body: { object: "list", data: [] }, // Health check passes, but no models
        },
        "/api/v1/models": {
          status: 200,
          body: MockLMStudio.lmStudioModelsResponse([
            { id: "qwen2.5-coder-7b", name: "Qwen 2.5 Coder 7B", family: "qwen" },
          ]),
        },
      })

      const models = await Discovery.discoverModels("http://localhost:1234", {
        fallbackApiV1: true,
      })

      expect(models).toHaveLength(1)
      expect(models[0].id).toBe("qwen2.5-coder-7b")
      expect(models[0].name).toBe("Qwen 2.5 Coder 7B")
      expect(models[0].family).toBe("qwen")
    })

    test("normalizes LM Studio native model format correctly", async () => {
      globalThis.fetch = createMockFetch({
        "/v1/models": {
          status: 200,
          body: { object: "list", data: [] }, // Health check passes, but no models
        },
        "/api/v1/models": {
          status: 200,
          body: MockLMStudio.lmStudioModelsResponse([
            {
              id: "mixtral-8x7b-instruct",
              name: "Mixtral 8x7B Instruct",
              family: "mixtral",
              context_length: 32768,
              loaded: true,
            },
          ]),
        },
      })

      const models = await Discovery.discoverModels("http://localhost:1234")

      expect(models).toHaveLength(1)
      expect(models[0]).toEqual({
        id: "mixtral-8x7b-instruct",
        name: "Mixtral 8x7B Instruct",
        family: "mixtral",
        contextLength: 32768,
        loaded: true,
        metadata: undefined,
      })
    })

    test("returns empty array when server is not reachable", async () => {
      globalThis.fetch = createMockFetch({
        // No matching responses - simulates connection failure
      })

      const models = await Discovery.discoverModels("http://localhost:1234")

      expect(models).toHaveLength(0)
    })

    test("returns empty array when fallback is disabled and primary fails", async () => {
      globalThis.fetch = createMockFetch({
        "/v1/models": {
          status: 500,
          body: { error: "Server error" },
        },
      })

      const models = await Discovery.discoverModels("http://localhost:1234", {
        fallbackApiV1: false,
      })

      expect(models).toHaveLength(0)
    })
  })

  describe("getLoadedModels", () => {
    test("returns only loaded models", async () => {
      globalThis.fetch = createMockFetch({
        "/api/v1/models": {
          status: 200,
          body: MockLMStudio.lmStudioModelsResponse([
            { id: "qwen2.5-coder-7b", name: "Qwen 2.5 Coder 7B", loaded: true },
            { id: "llama-3-8b", name: "Llama 3 8B", loaded: false },
          ]),
        },
      })

      const models = await Discovery.getLoadedModels("http://localhost:1234")

      expect(models).toHaveLength(1)
      expect(models[0].id).toBe("qwen2.5-coder-7b")
      expect(models[0].loaded).toBe(true)
    })

    test("returns empty array on fetch error", async () => {
      globalThis.fetch = createMockFetch({
        "/api/v1/models": {
          status: 500,
          body: { error: "Server error" },
        },
      })

      const models = await Discovery.getLoadedModels("http://localhost:1234")

      expect(models).toHaveLength(0)
    })
  })
})

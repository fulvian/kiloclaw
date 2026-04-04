import type { OpenAIModelsResponse, LMStudioModelsResponse, LoadModelResponse } from "../../types"

/**
 * Mock LM Studio server responses for testing
 */
export namespace MockLMStudio {
  /**
   * Create a mock for the OpenAI-compatible /v1/models endpoint
   */
  export function openAIModelsResponse(models: string[]): OpenAIModelsResponse {
    return {
      object: "list",
      data: models.map((id) => ({
        id,
        object: "model",
        created: Date.now(),
        owned_by: "local",
      })),
    }
  }

  /**
   * Create a mock for the LM Studio native /api/v1/models endpoint
   */
  export function lmStudioModelsResponse(
    models: Array<{
      id: string
      name?: string
      family?: string
      context_length?: number
      loaded?: boolean
    }>,
  ): LMStudioModelsResponse {
    return {
      models: models.map((m) => ({
        id: m.id,
        name: m.name ?? m.id,
        family: m.family,
        context_length: m.context_length,
        loaded: m.loaded ?? false,
      })),
    }
  }

  /**
   * Create a mock load model success response
   */
  export function loadModelSuccess(modelId: string): LoadModelResponse {
    return {
      success: true,
      model: modelId,
      loaded: true,
      message: "Model loaded successfully",
    }
  }

  /**
   * Create a mock load model failure response
   */
  export function loadModelFailure(modelId: string): LoadModelResponse {
    return {
      success: false,
      model: modelId,
      loaded: false,
      message: "Model not found",
    }
  }

  /**
   * Sample model data for tests
   */
  export const sampleModels = {
    qwen: {
      id: "qwen2.5-coder-7b",
      name: "Qwen 2.5 Coder 7B",
      family: "qwen",
      context_length: 32768,
      loaded: false,
    },
    llama: {
      id: "llama-3-8b",
      name: "Llama 3 8B",
      family: "llama",
      context_length: 8192,
      loaded: true,
    },
    mixtral: {
      id: "mixtral-8x7b",
      name: "Mixtral 8x7B",
      family: "mixtral",
      context_length: 32768,
      loaded: false,
    },
  }
}

interface MockResponse {
  status: number
  body: unknown
}

/**
 * Create a mock fetch function for testing HTTP calls.
 * Handles Bun's extended fetch interface including preconnect.
 * Uses URL path matching to avoid substring issues (e.g., /v1/models vs /api/v1/models).
 */
export function createMockFetch(responses: Record<string, MockResponse>) {
  const mockFn = async function mockFetch(input: RequestInfo | URL, _init?: RequestInit): Promise<Response> {
    const url = typeof input === "string" ? input : input.toString()

    // Extract the pathname from the URL for precise matching
    let pathname: string
    try {
      pathname = new URL(url).pathname
    } catch {
      // If URL parsing fails, use the original string
      pathname = url
    }

    // Sort patterns by length (longest first) to prefer more specific matches
    const sortedPatterns = Object.keys(responses).sort((a, b) => b.length - a.length)

    for (const pattern of sortedPatterns) {
      const response = responses[pattern]
      // Match if pathname equals pattern, or if pattern is preceded by a / and matches the end
      const matches = pathname === pattern || (pathname.endsWith(pattern) && pathname.endsWith("/" + pattern))
      if (matches) {
        return {
          ok: response.status >= 200 && response.status < 300,
          status: response.status,
          json: async () => response.body,
        } as unknown as Response
      }
    }

    // Default 404 response
    return {
      ok: false,
      status: 404,
      json: async () => ({ error: "Not found" }),
    } as Response
  }

  // Add preconnect to satisfy Bun's fetch type
  const mockFetch = mockFn as typeof fetch
  mockFetch.preconnect = async function preconnect(_url: string | URL): Promise<null> {
    return null
  }

  return mockFetch
}

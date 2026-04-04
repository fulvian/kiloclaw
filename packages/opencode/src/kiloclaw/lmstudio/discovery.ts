import { Log } from "@/util/log"
import { Bus } from "@/bus"
import type { DiscoveredModel, OpenAIModelsResponse, LMStudioModelsResponse } from "./types"
import { LMStudioTelemetry } from "./telemetry"
import { LMStudioError } from "./errors"
import { HealthCheck } from "./health"

const log = Log.create({ service: "lmstudio.discovery" })

// Wrap Bus.publish to avoid failing when no instance context is available
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function publishTelemetry(event: any, properties: any): Promise<void> {
  try {
    await Bus.publish(event, properties)
  } catch {
    // Telemetry is best-effort; ignore errors when no instance context
  }
}

export namespace Discovery {
  /**
   * Discover models from LM Studio server.
   * Primary: GET /v1/models (OpenAI-compatible)
   * Fallback: GET /api/v1/models (LM Studio native)
   */
  export async function discoverModels(
    baseURL: string,
    options?: { fallbackApiV1?: boolean },
  ): Promise<DiscoveredModel[]> {
    const fallbackApiV1 = options?.fallbackApiV1 ?? true
    const start = Date.now()

    // First check if server is reachable
    const health = await HealthCheck.check(baseURL)
    if (!health.reachable) {
      log.warn("LM Studio server not reachable", { baseURL })
      return []
    }

    // Try primary endpoint first (/v1/models - OpenAI-compatible)
    try {
      const models = await fetchOpenAIModels(baseURL)
      if (models.length > 0) {
        const latencyMs = Date.now() - start
        log.info("models discovered", { count: models.length, source: "/v1/models", latencyMs })
        await publishTelemetry(LMStudioTelemetry.ModelsDiscovered, {
          count: models.length,
          source: "/v1/models",
          latencyMs,
        })
        return models
      }
    } catch (err) {
      log.warn("Primary discovery failed, trying fallback", { error: err })
    }

    // Try fallback endpoint if enabled
    if (fallbackApiV1) {
      try {
        const models = await fetchLMStudioNativeModels(baseURL)
        if (models.length > 0) {
          const latencyMs = Date.now() - start
          log.info("models discovered", { count: models.length, source: "/api/v1/models", latencyMs })
          await publishTelemetry(LMStudioTelemetry.ModelsDiscovered, {
            count: models.length,
            source: "/api/v1/models",
            latencyMs,
          })
          return models
        }
      } catch (err) {
        const latencyMs = Date.now() - start
        log.error("Fallback discovery also failed", { error: err, latencyMs })
        await publishTelemetry(LMStudioTelemetry.ModelsDiscovered, {
          count: 0,
          source: "/api/v1/models",
          latencyMs,
        })
      }
    }

    return []
  }

  /**
   * Get list of currently loaded models from LM Studio server
   */
  export async function getLoadedModels(baseURL: string): Promise<DiscoveredModel[]> {
    const start = Date.now()

    try {
      // Use the native API to get loaded status
      const response = await fetch(`${baseURL}/api/v1/models`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      })

      if (!response.ok) {
        log.warn("Failed to get loaded models", { status: response.status })
        return []
      }

      const data = (await response.json()) as LMStudioModelsResponse
      const latencyMs = Date.now() - start

      log.info("loaded models retrieved", { count: data.models?.length ?? 0, latencyMs })

      return (data.models ?? []).filter((model) => model.loaded).map((model) => normalizeLMStudioModel(model))
    } catch (err) {
      const latencyMs = Date.now() - start
      log.warn("Error getting loaded models", { error: err, latencyMs })
      return []
    }
  }

  /**
   * Fetch models from OpenAI-compatible endpoint
   */
  async function fetchOpenAIModels(baseURL: string): Promise<DiscoveredModel[]> {
    const response = await fetch(`${baseURL}/v1/models`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    })

    if (!response.ok) {
      throw new LMStudioError.DiscoveryFailed({
        endpoint: "/v1/models",
        error: `HTTP ${response.status}`,
      })
    }

    const data = (await response.json()) as OpenAIModelsResponse

    return (data.data ?? []).map((model) => ({
      id: model.id,
      name: model.id,
      loaded: false,
      metadata: {
        owned_by: model.owned_by,
        created: model.created,
      },
    }))
  }

  /**
   * Fetch models from LM Studio native endpoint
   */
  async function fetchLMStudioNativeModels(baseURL: string): Promise<DiscoveredModel[]> {
    const response = await fetch(`${baseURL}/api/v1/models`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
    })

    if (!response.ok) {
      throw new LMStudioError.DiscoveryFailed({
        endpoint: "/api/v1/models",
        error: `HTTP ${response.status}`,
      })
    }

    const data = (await response.json()) as LMStudioModelsResponse

    return (data.models ?? []).map((model) => normalizeLMStudioModel(model))
  }

  /**
   * Normalize LM Studio native model to DiscoveredModel
   */
  function normalizeLMStudioModel(model: LMStudioModelsResponse["models"][number]): DiscoveredModel {
    return {
      id: model.id,
      name: model.name ?? model.id,
      family: model.family,
      contextLength: model.context_length,
      loaded: model.loaded ?? false,
      metadata: model.metadata,
    }
  }
}

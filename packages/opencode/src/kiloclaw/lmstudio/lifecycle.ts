import { Log } from "@/util/log"
import { Bus } from "@/bus"
import type { LoadModelRequest, LoadModelResponse, UnloadModelRequest, UnloadModelResponse } from "./types"
import { LMStudioTelemetry } from "./telemetry"
import { LMStudioError } from "./errors"

const log = Log.create({ service: "lmstudio.lifecycle" })

// Wrap Bus.publish to avoid failing when no instance context is available
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function publishTelemetry(event: any, properties: any): Promise<void> {
  try {
    await Bus.publish(event, properties)
  } catch {
    // Telemetry is best-effort; ignore errors when no instance context
  }
}

export namespace Lifecycle {
  /**
   * Load a model on the LM Studio server.
   * POST /api/v1/models/load
   */
  export async function loadModel(
    baseURL: string,
    request: LoadModelRequest,
    options?: { timeout?: number },
  ): Promise<LoadModelResponse> {
    const timeout = options?.timeout ?? 300000

    await publishTelemetry(LMStudioTelemetry.ModelLoadRequested, { modelId: request.model })

    const start = Date.now()

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(`${baseURL}/api/v1/models/load`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: request.model,
          ttl: request.ttl ?? 1800,
          priority: request.priority ?? "normal",
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      const latencyMs = Date.now() - start
      const data = await response.json()

      if (!response.ok) {
        await publishTelemetry(LMStudioTelemetry.ModelLoadFailure, {
          modelId: request.model,
          error: `HTTP ${response.status}`,
        })

        throw new LMStudioError.ModelLoadFailed({
          modelId: request.model,
          error: `HTTP ${response.status}`,
          response: data,
        })
      }

      await publishTelemetry(LMStudioTelemetry.ModelLoadSuccess, { modelId: request.model, latencyMs })

      log.info("model loaded", { modelId: request.model, latencyMs })

      return {
        success: data.success ?? true,
        model: data.model ?? request.model,
        loaded: data.loaded ?? true,
        message: data.message,
      }
    } catch (err) {
      const latencyMs = Date.now() - start

      if (err instanceof LMStudioError.ModelLoadFailed) {
        throw err
      }

      const errorMsg = err instanceof Error ? err.message : String(err)

      await publishTelemetry(LMStudioTelemetry.ModelLoadFailure, {
        modelId: request.model,
        error: errorMsg,
      })

      throw new LMStudioError.ModelLoadFailed({
        modelId: request.model,
        error: errorMsg,
      })
    }
  }

  /**
   * Unload a model from the LM Studio server.
   * POST /api/v1/models/unload
   */
  export async function unloadModel(
    baseURL: string,
    request: UnloadModelRequest,
    options?: { timeout?: number },
  ): Promise<UnloadModelResponse> {
    const timeout = options?.timeout ?? 60000

    const start = Date.now()

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      const response = await fetch(`${baseURL}/api/v1/models/unload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: request.model }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      const latencyMs = Date.now() - start
      const data = await response.json()

      if (!response.ok) {
        throw new LMStudioError.ModelLoadFailed({
          modelId: request.model,
          error: `HTTP ${response.status}`,
          response: data,
        })
      }

      log.info("model unloaded", { modelId: request.model, latencyMs })

      return {
        success: data.success ?? true,
        model: data.model ?? request.model,
        message: data.message,
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)

      throw new LMStudioError.ModelLoadFailed({
        modelId: request.model,
        error: errorMsg,
      })
    }
  }

  /**
   * Check if a specific model is loaded on the server.
   */
  export async function isModelLoaded(baseURL: string, modelId: string): Promise<boolean> {
    try {
      const response = await fetch(`${baseURL}/api/v1/models`, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      })

      if (!response.ok) {
        return false
      }

      const data = await response.json()

      // Check if model is in the loaded models list
      if (Array.isArray(data.models)) {
        return data.models.some(
          (model: { id?: string; model?: string; loaded?: boolean }) =>
            (model.id === modelId || model.model === modelId) && model.loaded,
        )
      }

      // Alternative format with data array
      if (Array.isArray(data.data)) {
        return data.data.some((model: { id?: string; loaded?: boolean }) => model.id === modelId && model.loaded)
      }

      return false
    } catch (err) {
      log.warn("Error checking if model is loaded", { modelId, error: err })
      return false
    }
  }
}

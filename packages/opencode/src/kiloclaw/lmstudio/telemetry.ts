import { BusEvent } from "@/bus/bus-event"
import z from "zod"

/**
 * Telemetry events for LM Studio provider
 */
export namespace LMStudioTelemetry {
  export const StartAttempt = BusEvent.define("lmstudio.start.attempt", z.object({ method: z.string() }))

  export const StartSuccess = BusEvent.define(
    "lmstudio.start.success",
    z.object({ method: z.string(), latencyMs: z.number() }),
  )

  export const StartFailure = BusEvent.define(
    "lmstudio.start.failure",
    z.object({ error: z.string(), method: z.string().optional() }),
  )

  export const ModelsDiscovered = BusEvent.define(
    "lmstudio.models.discovered",
    z.object({ count: z.number(), source: z.enum(["/v1/models", "/api/v1/models"]), latencyMs: z.number() }),
  )

  export const ModelLoadRequested = BusEvent.define("lmstudio.model.load.requested", z.object({ modelId: z.string() }))

  export const ModelLoadSuccess = BusEvent.define(
    "lmstudio.model.load.success",
    z.object({ modelId: z.string(), latencyMs: z.number() }),
  )

  export const ModelLoadFailure = BusEvent.define(
    "lmstudio.model.load.failure",
    z.object({ modelId: z.string(), error: z.string() }),
  )

  export const InferenceRequest = BusEvent.define(
    "lmstudio.inference.request",
    z.object({ modelId: z.string(), latencyMs: z.number().optional() }),
  )

  export const InferenceError = BusEvent.define(
    "lmstudio.inference.error",
    z.object({ modelId: z.string(), error: z.string() }),
  )
}

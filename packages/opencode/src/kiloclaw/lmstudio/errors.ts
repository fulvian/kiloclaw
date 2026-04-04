import { NamedError } from "@opencode-ai/util/error"
import z from "zod"

/**
 * LM Studio specific error types
 */
export namespace LMStudioError {
  export const ServerUnreachable = NamedError.create(
    "ServerUnreachable",
    z.object({
      baseURL: z.string(),
      attempts: z.number(),
    }),
  )

  export const DiscoveryFailed = NamedError.create(
    "DiscoveryFailed",
    z.object({
      endpoint: z.string(),
      error: z.string(),
    }),
  )

  export const ModelLoadFailed = NamedError.create(
    "ModelLoadFailed",
    z.object({
      modelId: z.string(),
      error: z.string(),
      response: z.unknown().optional(),
    }),
  )

  export const ModelNotFound = NamedError.create(
    "ModelNotFound",
    z.object({
      modelId: z.string(),
      available: z.array(z.string()).optional(),
    }),
  )

  export const AutoStartFailed = NamedError.create(
    "AutoStartFailed",
    z.object({
      method: z.string(),
      error: z.string(),
      instructions: z.string().optional(),
    }),
  )

  export const Timeout = NamedError.create("Timeout", z.object({ operation: z.string(), durationMs: z.number() }))
}

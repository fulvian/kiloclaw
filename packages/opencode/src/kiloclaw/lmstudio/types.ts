import z from "zod"

/**
 * LM Studio provider configuration schema
 */
export namespace LMStudioConfig {
  export const schema = z.object({
    enabled: z.boolean().default(true),
    baseURL: z.string().default("http://localhost:1234"),
    modelId: z.string().optional(),
    autoStart: z.boolean().default(false),
    autoLoadModel: z.boolean().default(false),
    discoveryFallbackApiV1: z.boolean().default(true),
    loadTimeout: z.number().default(300000),
    healthCheckRetries: z.number().default(3),
    healthCheckRetryDelay: z.number().default(2000),
    load: z
      .object({
        ttl: z.number().default(1800),
        priority: z.enum(["low", "normal", "high"]).default("normal"),
      })
      .optional(),
  })

  export type Info = z.infer<typeof schema>
}

/**
 * Represents a model discovered from LM Studio
 */
export interface DiscoveredModel {
  id: string
  name: string
  family?: string
  contextLength?: number
  loaded: boolean
  metadata?: Record<string, unknown>
}

export namespace DiscoveredModel {
  export const schema = z.object({
    id: z.string(),
    name: z.string(),
    family: z.string().optional(),
    contextLength: z.number().optional(),
    loaded: z.boolean().default(false),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
}

/**
 * Request to load a model onto LM Studio
 */
export interface LoadModelRequest {
  model: string
  ttl?: number
  priority?: "low" | "normal" | "high"
}

/**
 * Response from loading a model
 */
export interface LoadModelResponse {
  success: boolean
  model: string
  loaded: boolean
  message?: string
}

/**
 * Request to unload a model from LM Studio
 */
export interface UnloadModelRequest {
  model: string
}

/**
 * Response from unloading a model
 */
export interface UnloadModelResponse {
  success: boolean
  model: string
  message?: string
}

/**
 * Health status of LM Studio server
 */
export interface HealthStatus {
  reachable: boolean
  latencyMs?: number
  version?: string
  error?: string
}

/**
 * Result of attempting to auto-start LM Studio
 */
export interface AutoStartResult {
  success: boolean
  started: boolean
  method?: "daemon" | "systemd" | "manual"
  error?: string
  instructions?: string
}

/**
 * Raw response from GET /v1/models (OpenAI-compatible)
 */
export interface OpenAIModelsResponse {
  object: "list"
  data: Array<{
    id: string
    object: "model"
    created?: number
    owned_by?: string
  }>
}

/**
 * Raw response from GET /api/v1/models (LM Studio native)
 */
export interface LMStudioModelsResponse {
  models: Array<{
    id: string
    name?: string
    family?: string
    context_length?: number
    loaded?: boolean
    metadata?: Record<string, unknown>
  }>
}

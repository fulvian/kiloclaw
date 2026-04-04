/**
 * LM Studio Provider Integration
 *
 * This module provides integration with LM Studio's OpenAI-compatible API
 * for local AI model inference, with support for model discovery,
 * lifecycle management (load/unload), and optional auto-start.
 */

// Types and schemas
export * from "./types"
export * from "./errors"
export * from "./telemetry"

// Services
export { Discovery } from "./discovery"
export { HealthCheck } from "./health"
export { Lifecycle } from "./lifecycle"
export { LMStudioConfigLoader, LMStudioSessionConfig } from "./config"
export { AutoStart } from "./autostart"
export { LMSession } from "./session"
export { createLMStudioPlugin } from "./plugin"
export { CircuitBreaker, CircuitOpenError } from "./circuit-breaker"

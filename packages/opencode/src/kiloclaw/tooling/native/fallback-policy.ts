import z from "zod"
import { Log } from "@/util/log"
import { PolicyDecision, RouteReason } from "./capability-registry"
import type { PolicyLevel } from "@/kiloclaw/agency/types"

const log = Log.create({ service: "kiloclaw.fallback-policy" })

export const NativeErrorKind = z.enum(["none", "timeout", "transient", "permanent"])
export type NativeErrorKind = z.infer<typeof NativeErrorKind>

// New PolicyLevel-based API for FallbackDecision
export type FallbackDecision = "native" | "mcp" | "deny"

export interface FallbackInput {
  nativeAvailable: boolean
  nativeError?: Error | null
  retryCount?: number
  capability: string
  policyLevel: PolicyLevel
  isDestructive: boolean
}

export const PolicyInput = z.object({
  deny: z.boolean().default(false),
  destructive: z.boolean().default(false),
  secret: z.boolean().default(false),
  native_implemented: z.boolean(),
  native_healthy: z.boolean(),
  retry: z.number().int().nonnegative().default(0),
  retry_max: z.number().int().nonnegative().default(2),
  error_kind: NativeErrorKind.default("none"),
})
export type PolicyInput = z.infer<typeof PolicyInput>

export const PolicyOutput = z.object({
  route_reason: RouteReason,
  fallback_flag: z.boolean(),
  policy_decision: PolicyDecision,
  execute_native: z.boolean(),
  allow_fallback: z.boolean(),
})
export type PolicyOutput = z.infer<typeof PolicyOutput>

export namespace NativeFallbackPolicy {
  export function decide(raw: PolicyInput): PolicyOutput {
    const input = PolicyInput.parse(raw)

    if (input.deny) {
      return {
        route_reason: "policy_denied",
        fallback_flag: false,
        policy_decision: "deny",
        execute_native: false,
        allow_fallback: false,
      }
    }

    const highRisk = input.destructive || input.secret
    if (highRisk && !input.native_implemented) {
      return {
        route_reason: "security_block",
        fallback_flag: false,
        policy_decision: "deny",
        execute_native: false,
        allow_fallback: false,
      }
    }

    if (highRisk && !input.native_healthy) {
      return {
        route_reason: "security_block",
        fallback_flag: false,
        policy_decision: "deny",
        execute_native: false,
        allow_fallback: false,
      }
    }

    if (!input.native_implemented) {
      return {
        route_reason: "native_unimplemented",
        fallback_flag: true,
        policy_decision: "allow_fallback",
        execute_native: false,
        allow_fallback: true,
      }
    }

    if (!input.native_healthy) {
      return {
        route_reason: "native_unhealthy",
        fallback_flag: true,
        policy_decision: "allow_fallback",
        execute_native: false,
        allow_fallback: true,
      }
    }

    if (input.error_kind === "none") {
      return {
        route_reason: "native_primary",
        fallback_flag: false,
        policy_decision: "allow_native",
        execute_native: true,
        allow_fallback: false,
      }
    }

    const retryable = input.error_kind === "timeout" || input.error_kind === "transient"
    if (retryable && input.retry < input.retry_max) {
      return {
        route_reason: "native_retry",
        fallback_flag: false,
        policy_decision: "allow_native",
        execute_native: true,
        allow_fallback: false,
      }
    }

    const noFallback = highRisk
    if (noFallback) {
      return {
        route_reason: "security_block",
        fallback_flag: false,
        policy_decision: "deny",
        execute_native: false,
        allow_fallback: false,
      }
    }

    return {
      route_reason: "native_retry_exhausted",
      fallback_flag: true,
      policy_decision: "allow_fallback",
      execute_native: false,
      allow_fallback: true,
    }
  }
}

/**
 * Deterministic fallback policy for native-first adapter strategy (FIX 3)
 */
export function decideFallback(input: FallbackInput): FallbackDecision {
  const { nativeAvailable, nativeError, retryCount = 0, policyLevel, isDestructive, capability } = input

  // Hard deny cases
  if (policyLevel === "DENY") {
    log.warn("fallback blocked by policy", { capability, policyLevel })
    return "deny"
  }

  // Destructive operations never fallback to MCP
  if (isDestructive && policyLevel !== "SAFE") {
    log.warn("fallback blocked for destructive operation", { capability, isDestructive })
    return "deny"
  }

  // If native is available and healthy, always use it
  if (nativeAvailable && !nativeError) {
    return "native"
  }

  // If native errored, check retry count and error type
  if (nativeError) {
    const isTransient = isTransientError(nativeError)

    // Transient errors get retry attempt
    if (isTransient && retryCount < 2) {
      log.warn("native transient error, will retry", { capability, error: nativeError.message, retryCount })
      return "native" // Will retry
    }

    // Permanent errors allowed to fallback IF policy permits
    if (policyLevel === "SAFE" || policyLevel === "NOTIFY") {
      log.warn("native permanent error, falling back to MCP", {
        capability,
        error: nativeError.message,
        policyLevel,
      })
      return "mcp"
    }

    // Higher policy levels don't fallback on error
    log.error("native error prevents fallback", { capability, policyLevel, error: nativeError.message })
    return "deny"
  }

  // Capability gap - MCP allowed for SAFE/NOTIFY, denied for higher levels
  if (policyLevel === "SAFE" || policyLevel === "NOTIFY") {
    log.info("capability not implemented natively, using MCP", { capability })
    return "mcp"
  }

  // No native, no error, but high policy - deny
  log.error("capability gap prevents MCP fallback due to policy", { capability, policyLevel })
  return "deny"
}

function isTransientError(err: Error): boolean {
  const msg = err.message.toLowerCase()
  return (
    msg.includes("timeout") ||
    msg.includes("econnrefused") ||
    msg.includes("enotfound") ||
    msg.includes("network") ||
    msg.includes("temporary")
  )
}

/**
 * Build fallback chain metadata for telemetry
 */
export interface FallbackChainMetadata {
  providersTried: string[]
  errorsByProvider: Record<string, string>
  finalDecision: FallbackDecision
  totalRetries: number
  durationMs: number
}

export function createFallbackMetadata(providers: string[], errors: Record<string, Error>): FallbackChainMetadata {
  return {
    providersTried: providers,
    errorsByProvider: Object.entries(errors).reduce(
      (acc, [provider, err]) => {
        acc[provider] = err.message
        return acc
      },
      {} as Record<string, string>,
    ),
    finalDecision: "mcp",
    totalRetries: 0,
    durationMs: 0,
  }
}

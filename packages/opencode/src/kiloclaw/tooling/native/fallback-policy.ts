import z from "zod"
import { PolicyDecision, RouteReason } from "./capability-registry"

export const NativeErrorKind = z.enum(["none", "timeout", "transient", "permanent"])
export type NativeErrorKind = z.infer<typeof NativeErrorKind>

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

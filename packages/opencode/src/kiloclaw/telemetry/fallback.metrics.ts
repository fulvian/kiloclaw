import z from "zod"
import { NativeCapability, RouteReason, PolicyDecision } from "../tooling/native/capability-registry"

export const FallbackEvent = z.object({
  event: z.literal("native_fallback"),
  correlation_id: z.string(),
  capability: NativeCapability,
  adapter_id: z.string(),
  route_reason: RouteReason,
  fallback_flag: z.boolean(),
  policy_decision: PolicyDecision,
  retry_count: z.number().int().nonnegative(),
  ts: z.number().int().nonnegative(),
})
export type FallbackEvent = z.infer<typeof FallbackEvent>

export namespace FallbackMetrics {
  export function build(input: Omit<FallbackEvent, "event" | "ts">): FallbackEvent {
    return FallbackEvent.parse({
      event: "native_fallback",
      ...input,
      ts: Date.now(),
    })
  }
}

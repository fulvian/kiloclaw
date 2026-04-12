import z from "zod"

export const NativeCapability = z.enum([
  "file_ops",
  "git_ops",
  "build_test_ops",
  "web_research_ops",
  "browser_ops",
  "github_ops",
  "memory_ops",
  "visual_ops",
  "orchestration_ops",
])
export type NativeCapability = z.infer<typeof NativeCapability>

export const RouteReason = z.enum([
  "native_primary",
  "native_retry",
  "native_unimplemented",
  "native_unhealthy",
  "native_retry_exhausted",
  "policy_denied",
  "security_block",
  "fallback_allowed",
])
export type RouteReason = z.infer<typeof RouteReason>

export const PolicyDecision = z.enum(["allow_native", "allow_fallback", "deny"])
export type PolicyDecision = z.infer<typeof PolicyDecision>

export const AdapterProbe = z.object({
  healthy: z.boolean(),
  latency_ms: z.number().int().nonnegative().default(0),
  reason: z.string().default("ok"),
})
export type AdapterProbe = z.infer<typeof AdapterProbe>

export const AdapterOutput = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  error: z.string().optional(),
  transient: z.boolean().optional(),
  timeout: z.boolean().optional(),
})
export type AdapterOutput = z.infer<typeof AdapterOutput>

export const AuditMetadata = z.object({
  route_reason: RouteReason,
  adapter_id: z.string(),
  fallback_flag: z.boolean(),
  policy_decision: PolicyDecision,
})
export type AuditMetadata = z.infer<typeof AuditMetadata>

export interface NativeAdapter {
  readonly id: string
  readonly capability: NativeCapability
  probe: () => Promise<AdapterProbe>
  invoke: (input: Record<string, unknown>) => Promise<AdapterOutput>
}

export namespace CapabilityRegistry {
  export type Registry = {
    register: (adapter: NativeAdapter) => void
    get: (cap: NativeCapability) => NativeAdapter | undefined
    all: () => NativeAdapter[]
  }

  export function create(input?: { adapters?: NativeAdapter[] }): Registry {
    const map = new Map<NativeCapability, NativeAdapter>()
    for (const item of input?.adapters ?? []) map.set(item.capability, item)

    return {
      register(adapter) {
        map.set(adapter.capability, adapter)
      },
      get(cap) {
        return map.get(cap)
      },
      all() {
        return [...map.values()]
      },
    }
  }
}

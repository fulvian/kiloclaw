import z from "zod"
import {
  AdapterOutput,
  AuditMetadata,
  CapabilityRegistry,
  NativeCapability,
  type NativeAdapter,
  type RouteReason,
} from "./capability-registry"
import { NativeFallbackPolicy, type NativeErrorKind } from "./fallback-policy"
import { KpiEnforcer, type KpiSnapshot } from "./kpi-enforcer"
import { NativeFileAdapter } from "./file-adapter"
import { NativeGitAdapter } from "./git-adapter"
import { NativeBuildAdapter } from "./build-adapter"
import { NativeResearchAdapter } from "./research-adapter"
import { NativeBrowserAdapter } from "./browser-adapter"
import { NativeGithubAdapter } from "./github-adapter"
import { NativeMemoryAdapter } from "./memory-adapter"
import { NativeVisualAdapter } from "./visual-adapter"
import { NativeOrchestrationAdapter } from "./orchestration-adapter"

export const FactoryInputSchema = z.object({
  capability: NativeCapability,
  payload: z.record(z.string(), z.unknown()).default({}),
  deny: z.boolean().default(false),
  destructive: z.boolean().default(false),
  secret: z.boolean().default(false),
  retry_max: z.number().int().nonnegative().default(2),
  kpiEnabled: z.boolean().default(true),
})
export type FactoryInput = z.input<typeof FactoryInputSchema>

export const FactoryOutputSchema = z.object({
  ok: z.boolean(),
  route: AuditMetadata,
  data: z.unknown().optional(),
  error: z.string().optional(),
})
export type FactoryOutput = z.infer<typeof FactoryOutputSchema>

const DEFAULT_ADAPTER = "native.none"

function classifyError(err: unknown): NativeErrorKind {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase()
  if (msg.includes("timeout")) return "timeout"
  if (msg.includes("transient")) return "transient"
  return "permanent"
}

async function probe(adapter: NativeAdapter, retryMax: number) {
  const probeAttempt = async (idx: number): Promise<Awaited<ReturnType<NativeAdapter["probe"]>>> => {
    const result = await adapter.probe()
    if (result.healthy) return result
    if (idx >= retryMax) return result
    return probeAttempt(idx + 1)
  }
  return probeAttempt(0)
}

function toAudit(input: {
  route_reason: RouteReason
  adapter_id: string
  fallback_flag: boolean
  policy_decision: "allow_native" | "allow_fallback" | "deny"
}) {
  return AuditMetadata.parse(input)
}

export namespace NativeFactory {
  export type Runtime = {
    execute: (
      input: FactoryInput,
      mcp?: (payload: Record<string, unknown>) => Promise<AdapterOutput>,
    ) => Promise<FactoryOutput>
    registry: CapabilityRegistry.Registry
    kpi: () => KpiSnapshot
  }

  export function create(input?: { adapters?: NativeAdapter[]; kpiEnabled?: boolean }): Runtime {
    const kpiEnabled = input?.kpiEnabled !== false
    if (kpiEnabled) {
      KpiEnforcer.init()
    }
    const registry = CapabilityRegistry.create({
      adapters: input?.adapters ?? [
        NativeFileAdapter.create(),
        NativeGitAdapter.create(),
        NativeBuildAdapter.create(),
        NativeResearchAdapter.create(),
        NativeBrowserAdapter.create(),
        NativeGithubAdapter.create(),
        NativeMemoryAdapter.create(),
        NativeVisualAdapter.create(),
        NativeOrchestrationAdapter.create(),
      ],
    })

    const execute = async (raw: FactoryInput, mcp?: (payload: Record<string, unknown>) => Promise<AdapterOutput>) => {
      const input = FactoryInputSchema.parse(raw)
      const adapter = registry.get(input.capability)
      const nativeImplemented = Boolean(adapter)
      const p = adapter ? await probe(adapter, input.retry_max) : { healthy: false, latency_ms: 0, reason: "missing" }

      const runNative = async (retry: number, kind: NativeErrorKind): Promise<FactoryOutput> => {
        const decision = NativeFallbackPolicy.decide({
          deny: input.deny,
          destructive: input.destructive,
          secret: input.secret,
          native_implemented: nativeImplemented,
          native_healthy: p.healthy,
          retry,
          retry_max: input.retry_max,
          error_kind: kind,
        })

        const adapterId = adapter?.id ?? DEFAULT_ADAPTER
        const audit = toAudit({
          route_reason: decision.route_reason,
          adapter_id: adapterId,
          fallback_flag: decision.fallback_flag,
          policy_decision: decision.policy_decision,
        })

        if (decision.policy_decision === "deny") {
          return { ok: false, route: audit, error: `execution denied: ${decision.route_reason}` }
        }

        if (!decision.execute_native) {
          if (!decision.allow_fallback || !mcp) {
            return { ok: false, route: audit, error: "fallback unavailable" }
          }
          const out = AdapterOutput.parse(await mcp(input.payload))
          if (out.ok) {
            if (input.kpiEnabled !== false) KpiEnforcer.recordFallback()
            return { ok: true, route: audit, data: out.data }
          }
          return { ok: false, route: audit, error: out.error ?? "fallback failure" }
        }

        if (!adapter) {
          return { ok: false, route: audit, error: "native adapter missing" }
        }

        const native = await adapter.invoke(input.payload).catch((err) => {
          const failureKind = classifyError(err)
          return AdapterOutput.parse({
            ok: false,
            error: String(err),
            timeout: failureKind === "timeout",
            transient: failureKind === "transient",
          })
        })

        if (native.ok) {
          if (input.kpiEnabled !== false) KpiEnforcer.recordNative()
          return { ok: true, route: audit, data: native.data }
        }

        const nextKind: NativeErrorKind = native.timeout ? "timeout" : native.transient ? "transient" : "permanent"
        return runNative(retry + 1, nextKind)
      }

      return runNative(0, "none")
    }

    const kpi = () => {
      if (!kpiEnabled) {
        return {
          nativeCalls: 0,
          fallbackCalls: 0,
          totalCalls: 0,
          nativeRatio: 0,
          fallbackRatio: 0,
          status: "ok" as const,
          ts: Date.now(),
        }
      }
      return KpiEnforcer.getSnapshot()
    }

    return {
      execute,
      registry,
      kpi,
    }
  }
}

import { AdapterOutput, type NativeAdapter } from "./capability-registry"

export namespace NativeVisualAdapter {
  export function create(input?: {
    id?: string
    probe?: NativeAdapter["probe"]
    run?: (data: Record<string, unknown>) => Promise<AdapterOutput>
  }): NativeAdapter {
    return {
      id: input?.id ?? "native.visual",
      capability: "visual_ops",
      probe: input?.probe ?? (async () => ({ healthy: true, latency_ms: 0, reason: "ok" })),
      invoke:
        input?.run ??
        (async () => ({ ok: false, error: "native.visual adapter requires injected runner", transient: false })),
    }
  }
}

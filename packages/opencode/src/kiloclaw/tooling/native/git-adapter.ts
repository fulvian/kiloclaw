import { AdapterOutput, type NativeAdapter } from "./capability-registry"

export namespace NativeGitAdapter {
  export function create(input?: {
    id?: string
    probe?: NativeAdapter["probe"]
    run?: (data: Record<string, unknown>) => Promise<AdapterOutput>
  }): NativeAdapter {
    return {
      id: input?.id ?? "native.git",
      capability: "git_ops",
      probe: input?.probe ?? (async () => ({ healthy: true, latency_ms: 0, reason: "ok" })),
      invoke:
        input?.run ??
        (async () => ({ ok: false, error: "native.git adapter requires injected runner", transient: false })),
    }
  }
}

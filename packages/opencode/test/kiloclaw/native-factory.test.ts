import { describe, expect, it } from "bun:test"
import { NativeFactory } from "@/kiloclaw/tooling/native/factory"
import { NativeFileAdapter } from "@/kiloclaw/tooling/native/file-adapter"

describe("native factory", () => {
  it("routes native-first when adapter is healthy", async () => {
    const run = async () => ({ ok: true, data: { source: "native" } })
    const fx = NativeFactory.create({
      adapters: [
        NativeFileAdapter.create({
          probe: async () => ({ healthy: true, latency_ms: 1, reason: "ok" }),
          run,
        }),
      ],
    })

    const out = await fx.execute({ capability: "file_ops", payload: { path: "x" } })
    expect(out.ok).toBe(true)
    expect(out.route.fallback_flag).toBe(false)
    expect(out.route.route_reason).toBe("native_primary")
    expect(out.route.policy_decision).toBe("allow_native")
  })

  it("retries native and remains deterministic", async () => {
    const state = { tries: 0 }
    const run = async () => {
      state.tries += 1
      if (state.tries === 1) return { ok: false, transient: true, error: "transient fail" }
      return { ok: true, data: { source: "native" } }
    }
    const fx = NativeFactory.create({
      adapters: [
        NativeFileAdapter.create({
          probe: async () => ({ healthy: true, latency_ms: 1, reason: "ok" }),
          run,
        }),
      ],
    })

    const out = await fx.execute({ capability: "file_ops", payload: {}, retry_max: 2 })
    expect(out.ok).toBe(true)
    expect(state.tries).toBe(2)
    expect(out.route.route_reason).toBe("native_retry")
    expect(out.route.fallback_flag).toBe(false)
  })
})

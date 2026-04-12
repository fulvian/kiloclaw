import { describe, expect, it } from "bun:test"
import { NativeFactory } from "@/kiloclaw/tooling/native/factory"
import { NativeGitAdapter } from "@/kiloclaw/tooling/native/git-adapter"

describe("security fallback policy", () => {
  it("never falls back when policy denies execution", async () => {
    const state = { calls: 0 }
    const fx = NativeFactory.create({
      adapters: [
        NativeGitAdapter.create({
          probe: async () => ({ healthy: true, latency_ms: 1, reason: "ok" }),
          run: async () => ({ ok: true, data: {} }),
        }),
      ],
    })

    const out = await fx.execute({ capability: "git_ops", payload: {}, deny: true }, async () => {
      state.calls += 1
      return { ok: true, data: { source: "mcp" } }
    })

    expect(out.ok).toBe(false)
    expect(out.route.policy_decision).toBe("deny")
    expect(out.route.fallback_flag).toBe(false)
    expect(state.calls).toBe(0)
  })

  it("blocks fallback for secret-sensitive operations", async () => {
    const state = { calls: 0 }
    const fx = NativeFactory.create({
      adapters: [
        NativeGitAdapter.create({
          probe: async () => ({ healthy: false, latency_ms: 1, reason: "down" }),
          run: async () => ({ ok: false, error: "unhealthy" }),
        }),
      ],
    })

    const out = await fx.execute({ capability: "git_ops", payload: {}, secret: true }, async () => {
      state.calls += 1
      return { ok: true, data: { source: "mcp" } }
    })

    expect(out.ok).toBe(false)
    expect(out.route.route_reason).toBe("security_block")
    expect(out.route.policy_decision).toBe("deny")
    expect(out.route.fallback_flag).toBe(false)
    expect(state.calls).toBe(0)
  })
})

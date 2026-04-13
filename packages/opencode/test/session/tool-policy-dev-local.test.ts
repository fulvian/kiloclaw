import { describe, expect, test } from "bun:test"
import { resolveAgencyAllowedTools } from "../../src/session/tool-policy"

describe("session.tool-policy dev-local profile", () => {
  test("keeps default development allowlist on balanced profile", () => {
    const out = resolveAgencyAllowedTools({
      agencyId: "agency-development",
      enabled: true,
      capabilities: [],
      profile: "balanced",
      trustedWorkspace: false,
    })

    expect(out.enabled).toBe(true)
    expect(out.allowedTools).not.toContain("task")
  })

  test("does not relax tools when dev-local is untrusted", () => {
    const out = resolveAgencyAllowedTools({
      agencyId: "agency-development",
      enabled: true,
      capabilities: [],
      profile: "dev-local",
      trustedWorkspace: false,
    })

    expect(out.enabled).toBe(true)
    expect(out.allowedTools).not.toContain("task")
  })

  test("relaxes tools when dev-local is trusted", () => {
    const out = resolveAgencyAllowedTools({
      agencyId: "agency-development",
      enabled: true,
      capabilities: [],
      profile: "dev-local",
      trustedWorkspace: true,
    })

    expect(out.enabled).toBe(true)
    expect(out.allowedTools).toContain("task")
  })
})

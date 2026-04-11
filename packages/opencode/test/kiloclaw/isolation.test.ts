import { describe, it, expect } from "bun:test"
import { enforceIsolation } from "../../src/kiloclaw/isolation/guard"

describe("isolation guard", () => {
  it("rejects blocked prefixes in strict mode", () => {
    expect(() =>
      enforceIsolation({
        mode: "strict",
        env: {
          KILO_DEBUG: "1",
          OPENCODE_TOKEN: "x",
          KILOCLAW_OK: "yes",
        },
      }),
    ).toThrow("isolation violation")
  })

  it("logs violations and returns report in compat mode", () => {
    const logs: string[] = []
    const report = enforceIsolation({
      mode: "compat",
      env: {
        ARIA_FLAG: "1",
        KILOCLAW_MODE: "strict",
      },
      log: {
        warn(msg, data) {
          logs.push(`${msg}:${String(data?.key)}`)
        },
      },
    })

    expect(report.ok).toBe(false)
    expect(report.violations).toHaveLength(1)
    expect(report.accepted.KILOCLAW_MODE).toBe("strict")
    expect(logs.length).toBe(1)
    expect(logs[0]).toContain("ARIA_FLAG")
  })
})

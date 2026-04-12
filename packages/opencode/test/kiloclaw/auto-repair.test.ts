import { describe, expect, it } from "bun:test"
import { AutoRepair } from "@/kiloclaw/runtime/auto-repair"
import { ErrorTaxonomy } from "@/kiloclaw/runtime/error-taxonomy"

describe("auto repair", () => {
  it("classifies known triggers deterministically", () => {
    expect(ErrorTaxonomy.classify({ message: "build failed on compile step" })).toBe("build.fail")
    expect(ErrorTaxonomy.classify({ message: "tests failed in ci" })).toBe("test.fail")
    expect(ErrorTaxonomy.classify({ message: "policy denied write" })).toBe("policy.block")
    expect(ErrorTaxonomy.classify({ message: "schema validation error" })).toBe("tool.contract.fail")
  })

  it("halts with write lock after strike three", () => {
    const s0 = AutoRepair.start({ correlation_id: "corr-1" })
    const s1 = AutoRepair.next(s0, { trigger: "runtime.exception", success: false })
    const s2 = AutoRepair.next(s1, { trigger: "runtime.exception", success: false })
    const s3 = AutoRepair.next(s2, { trigger: "runtime.exception", success: false })

    expect(s3.strike).toBe(3)
    expect(s3.status).toBe("halted")
    expect(AutoRepair.canWrite(s3)).toBe(false)
  })

  it("closes flow on successful repair", () => {
    const s0 = AutoRepair.start({ correlation_id: "corr-2" })
    const s1 = AutoRepair.next(s0, { trigger: "build.fail", success: false })
    const s2 = AutoRepair.next(s1, { trigger: "build.fail", success: true })

    expect(s2.status).toBe("closed")
    expect(AutoRepair.canWrite(s2)).toBe(true)
  })
})

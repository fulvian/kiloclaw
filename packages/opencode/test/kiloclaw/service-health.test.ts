import { describe, expect, test } from "bun:test"
import { ServiceHealth, MemoryDb } from "@/kiloclaw"
import { WorkingMemoryRepo, AuditRepo } from "@/kiloclaw/memory"

describe("ServiceHealth", () => {
  test("should include policy audit trail descriptor", async () => {
    const report = await ServiceHealth.checkAll()
    const names = [
      ...report.healthy.map((item) => item.name),
      ...report.degraded.map((item) => item.name),
      ...report.unavailable.map((item) => item.name),
      ...report.unknown.map((item) => item.name),
    ]

    expect(names).toContain("policy-audit-trail")
  })

  test("policy audit trail should be healthy when audit table is writable", async () => {
    await MemoryDb.init(":memory:")

    try {
      await WorkingMemoryRepo.set("default", "health-check-key", { ok: true })
      await AuditRepo.log({
        id: crypto.randomUUID(),
        actor: "test",
        action: "policy_denied",
        target_type: "policy",
        target_id: "health-check",
        reason: "test",
        correlation_id: "health-check-correlation",
        previous_hash: "",
        hash: "",
        metadata_json: { source: "service-health-test" },
        ts: Date.now(),
        created_at: Date.now(),
      })

      const report = await ServiceHealth.checkAll()
      const names = report.healthy.map((item) => item.name)

      expect(names).toContain("policy-audit-trail")
    } finally {
      MemoryDb.close()
    }
  })
})

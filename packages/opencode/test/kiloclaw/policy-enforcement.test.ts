import { describe, it, expect } from "bun:test"
import { join } from "node:path"
import { tmpdir } from "../fixture/fixture"
import { CoreOrchestrator } from "@/kiloclaw"
import type { AuditEntry } from "../../src/kiloclaw/audit/store"

describe("policy enforcement modes", () => {
  it("enforces strict mode deny for critical intent", async () => {
    await using tmp = await tmpdir()
    const path = join(tmp.path, "audit.jsonl")
    const orchestrator = CoreOrchestrator.create({ policyMode: "strict", auditPath: path })

    const out = orchestrator.enforcePolicy(
      {
        type: "delete_project_resources",
        parameters: { toolIds: ["filesystem", "external_api"] },
      },
      {
        agencyId: "agency-dev" as never,
        correlationId: "corr-strict" as never,
        intent: {
          id: "i-1",
          type: "cleanup",
          description: "destructive cleanup",
          risk: "critical",
        },
      },
    )

    expect(out.allowed).toBe(false)
    expect(out.requiresApproval).toBe(true)
  })

  it("enforces compat fallback with approval and evidence", async () => {
    await using tmp = await tmpdir()
    const path = join(tmp.path, "audit.jsonl")
    const orchestrator = CoreOrchestrator.create({ policyMode: "compat", auditPath: path })

    const out = orchestrator.enforcePolicy(
      {
        type: "delete_project_resources",
        parameters: { toolIds: ["filesystem", "external_api"] },
      },
      {
        agencyId: "agency-dev" as never,
        correlationId: "corr-compat" as never,
        intent: {
          id: "i-2",
          type: "cleanup",
          description: "destructive cleanup",
          risk: "critical",
        },
      },
    )

    expect(out.allowed).toBe(true)
    expect(out.requiresApproval).toBe(true)
    expect(out.reason).toContain("compat-fallback")

    const rows = orchestrator.audit().byCorrelation("corr-compat") as AuditEntry[]
    expect(rows.length).toBeGreaterThan(0)

    const decision = rows.find((x: AuditEntry) => x.event === "policy.decision")
    expect(decision).toBeDefined()
    expect(decision?.payload.correlationEvidence).toBeDefined()
  })
})

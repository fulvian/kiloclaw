import { describe, it, expect } from "bun:test"
import { join } from "node:path"
import { ProactivityLimitsManager } from "../../src/kiloclaw/proactive/limits"
import { TaskLedger } from "../../src/kiloclaw/proactive/task-ledger"
import { SchedulerService } from "../../src/kiloclaw/proactive/scheduler-service"
import { ProactiveWorker } from "../../src/kiloclaw/proactive/worker"
import { tmpdir } from "../fixture/fixture"

describe("proactivity limits runtime", () => {
  it("allows suggest and notify by default", () => {
    const limits = new ProactivityLimitsManager()
    expect(limits.isProactionAllowed("suggest")).toBe(true)
    expect(limits.isProactionAllowed("notify")).toBe(true)
  })

  it("blocks act_low_risk on explicit approval without allowlist", () => {
    const limits = new ProactivityLimitsManager({ confirmationMode: "explicit_approval" })
    expect(limits.isProactionAllowed("act_low_risk")).toBe(false)
  })

  it("allows act_low_risk on explicit approval with allowlist", () => {
    const limits = new ProactivityLimitsManager({
      confirmationMode: "explicit_approval",
      lowRiskAllowlist: ["act_low_risk"],
    })
    expect(limits.isProactionAllowed("act_low_risk")).toBe(true)
  })

  it("requires explicit behavior for high-risk and irreversible paths", () => {
    const limits = new ProactivityLimitsManager({
      confirmationMode: "suggest_then_act",
      lowRiskAllowlist: ["act_low_risk"],
    })

    const highRisk = limits.getDecisionEvidence("act_low_risk", { risk: "high" })
    const irreversible = limits.getDecisionEvidence("act_low_risk", { irreversible: true })

    expect(highRisk.allowed).toBe(false)
    expect(highRisk.requiresApproval).toBe(true)
    expect(irreversible.allowed).toBe(false)
    expect(irreversible.requiresApproval).toBe(true)
    expect(highRisk.rationale).toContain("requires explicit approval")
  })

  it("persists ledger data across re-instantiation", async () => {
    await using tmp = await tmpdir()
    const file = join(tmp.path, "proactive-ledger.json")

    const led1 = new TaskLedger(file)
    const task = led1.createTask({ name: "persist-task" })
    const claimed = led1.claimTask(task.id, "worker-a")
    expect(claimed?.state).toBe("running")
    led1.completeTask(task.id)

    const led2 = new TaskLedger(file)
    const hit = led2.get(task.id)
    expect(hit).toBeDefined()
    expect(hit?.state).toBe("succeeded")
    expect(led2.history().length).toBeGreaterThanOrEqual(3)
  })

  it("reconciles stale running tasks to lost after grace", async () => {
    await using tmp = await tmpdir()
    const file = join(tmp.path, "reconcile-ledger.json")
    const led = new TaskLedger(file)
    const svc = new SchedulerService({ ledger: led, graceMs: 100 })

    const task = svc.enqueue({
      name: "stale-task",
      meta: { graceMs: 100 },
    })

    const start = 10_000
    const claimed = led.claimTask(task.id, "worker-a", start)
    expect(claimed?.state).toBe("running")

    const recon = svc.reconcile({ now: start + 200 })
    expect(recon.lost).toContain(task.id)
    expect(led.get(task.id)?.state).toBe("lost")
  })

  it("runs idempotent worker execution with no duplicate effects", async () => {
    await using tmp = await tmpdir()
    const file = join(tmp.path, "worker-ledger.json")
    const led = new TaskLedger(file)
    const worker = new ProactiveWorker(led)
    const task = led.createTask({ name: "effect-task" })

    let calls = 0
    const run = async () => {
      calls += 1
      return { ok: true }
    }

    const first = await worker.execute(task, "idem-1", run)
    const second = await worker.execute(task, "idem-1", run)

    expect(first.state).toBe("succeeded")
    expect(second.state).toBe("succeeded")
    expect(second.replayed).toBe(true)
    expect(calls).toBe(1)
    expect(led.get(task.id)?.state).toBe("succeeded")
  })

  it("disables proactive claiming when KILOCLAW_PROACTIVE_ENABLED=false", async () => {
    await using tmp = await tmpdir()
    const file = join(tmp.path, "disabled-ledger.json")
    const led = new TaskLedger(file)
    const svc = new SchedulerService({ ledger: led })
    svc.enqueue({ name: "disabled-task" })

    const prev = process.env.KILOCLAW_PROACTIVE_ENABLED
    process.env.KILOCLAW_PROACTIVE_ENABLED = "false"
    const next = svc.claimNext("worker-a")
    process.env.KILOCLAW_PROACTIVE_ENABLED = prev

    expect(next).toBeNull()
    expect(led.list({ state: "queued" }).length).toBe(1)
  })
})

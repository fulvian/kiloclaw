import { beforeEach, describe, expect, it } from "bun:test"
import { ProactiveSchedulerEngine } from "../../src/kiloclaw/proactive/scheduler.engine"
import { SchedulerControlService } from "../../src/kiloclaw/proactive/scheduler-control.service"
import { ProactiveTaskStore } from "../../src/kiloclaw/proactive/scheduler.store"

describe("scheduler control service", () => {
  beforeEach(() => {
    ProactiveTaskStore.clearAll()
    ProactiveSchedulerEngine.stop()
  })

  it("returns explicit executor_missing when run-now cannot execute", async () => {
    const task = ProactiveTaskStore.create({
      id: `task_${crypto.randomUUID()}`,
      tenantId: "test",
      name: "missing executor",
      triggerConfig: JSON.stringify({ prompt: "hello", timezone: "UTC" }),
      scheduleCron: "* * * * *",
      nextRunAt: Date.now() - 1000,
    })

    const prev = process.env.KILOCLAW_TASK_ACTIONS_EXEC
    process.env.KILOCLAW_TASK_ACTIONS_EXEC = "true"
    const out = await SchedulerControlService.runNow(task.id)
    process.env.KILOCLAW_TASK_ACTIONS_EXEC = prev
    expect(out.accepted).toBe(false)
    expect(out.reasonCode).toBe("executor_missing")
  })

  it("accepts run-now with a registered executor", async () => {
    const task = ProactiveTaskStore.create({
      id: `task_${crypto.randomUUID()}`,
      tenantId: "test",
      name: "with executor",
      triggerConfig: JSON.stringify({ prompt: "hello", timezone: "UTC" }),
      scheduleCron: "* * * * *",
      nextRunAt: Date.now() - 1000,
    })

    const prev = process.env.KILOCLAW_TASK_ACTIONS_EXEC
    process.env.KILOCLAW_TASK_ACTIONS_EXEC = "true"
    ProactiveSchedulerEngine.init({})
    ProactiveSchedulerEngine.setExecutor(async () => ({ ok: true, evidenceRefs: ["task://ok"] }))

    const out = await SchedulerControlService.runNow(task.id)
    process.env.KILOCLAW_TASK_ACTIONS_EXEC = prev
    expect(out.accepted).toBe(true)
    expect(out.reasonCode).toBe("ok")
    expect(typeof out.runId).toBe("string")

    const run = ProactiveTaskStore.getRuns(task.id, 1)[0]
    expect(run?.runType).toBe("manual")
    expect(run?.evidenceRefs?.length).toBeGreaterThan(0)
  })

  it("resolves task selectors by ref", () => {
    const task = ProactiveTaskStore.create({
      id: `task_${crypto.randomUUID()}`,
      tenantId: "test",
      name: "selector ref",
      triggerConfig: JSON.stringify({ prompt: "hello", timezone: "UTC" }),
      scheduleCron: "* * * * *",
      nextRunAt: Date.now() - 1000,
    })

    const out = SchedulerControlService.resolveTask(task.ref, "test")
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.task.id).toBe(task.id)
  })
})

import { describe, expect, it } from "bun:test"
import { ProactiveSchedulerEngine } from "../../src/kiloclaw/proactive/scheduler.engine"
import { ProactiveTaskStore } from "../../src/kiloclaw/proactive/scheduler.store"

describe("scheduled task runtime", () => {
  it("records correlation and idempotency metadata on run-now", async () => {
    ProactiveTaskStore.clearAll()
    const task = ProactiveTaskStore.create({
      id: `task_${crypto.randomUUID()}`,
      tenantId: process.cwd(),
      name: "runtime meta",
      triggerConfig: JSON.stringify({
        schema: "kilocclaw.scheduled.v1",
        timezone: "UTC",
        idempotencySalt: "salt-a",
      }),
      scheduleCron: "0 9 * * *",
      scheduleType: "recurring",
      state: "active",
      nextRunAt: Date.now() - 1_000,
      maxRetries: 3,
    })

    ProactiveSchedulerEngine.init({})
    // Register a no-op executor for this test
    ProactiveSchedulerEngine.setExecutor(async () => {})
    const ok = await ProactiveSchedulerEngine.executeTask({ taskId: task.id })
    expect(ok).toBe(true)

    const run = ProactiveTaskStore.getRuns(task.id, 1)[0]
    expect(run).toBeDefined()
    expect(typeof run?.correlationId).toBe("string")
    expect(typeof run?.idempotencyKey).toBe("string")
    expect((run?.idempotencyKey ?? "").length).toBe(64)
    expect(typeof run?.traceId).toBe("string")
    expect(run?.attempt).toBe(1)
  })

  it("records policy_denied run metadata when gate blocks execution", async () => {
    ProactiveTaskStore.clearAll()
    const task = ProactiveTaskStore.create({
      id: `task_${crypto.randomUUID()}`,
      tenantId: process.cwd(),
      name: "policy blocked",
      triggerConfig: JSON.stringify({
        schema: "kilocclaw.scheduled.v1",
        timezone: "UTC",
        idempotencySalt: "salt-b",
      }),
      scheduleCron: "0 9 * * *",
      scheduleType: "recurring",
      state: "active",
      nextRunAt: Date.now() - 1_000,
      maxRetries: 3,
    })

    ProactiveSchedulerEngine.init({
      policyGate: {
        evaluate: async () => ({
          allowed: false,
          reasons: ["approval required"],
          blockers: ["approval_required"],
        }),
      },
    })
    ProactiveSchedulerEngine.setExecutor(async () => {})

    const ok = await ProactiveSchedulerEngine.executeTask({ taskId: task.id })
    expect(ok).toBe(false)

    const run = ProactiveTaskStore.getRuns(task.id, 1)[0]
    expect(run?.outcome).toBe("policy_denied")
    expect(run?.errorCode).toBe("policy_denied")
    expect(run?.gateDecisions?.["allowed"]).toBe(false)
  })

  it("moves failed task to DLQ when retries are exhausted", async () => {
    ProactiveTaskStore.clearAll()
    const task = ProactiveTaskStore.create({
      id: `task_${crypto.randomUUID()}`,
      tenantId: process.cwd(),
      name: "dlq exhausted",
      triggerConfig: JSON.stringify({
        schema: "kilocclaw.scheduled.v1",
        timezone: "UTC",
        idempotencySalt: "salt-c",
      }),
      scheduleCron: "0 9 * * *",
      scheduleType: "recurring",
      state: "active",
      nextRunAt: Date.now() - 1_000,
      maxRetries: 1,
    })

    ProactiveSchedulerEngine.init({
      baseBackoffMs: 1,
      maxBackoffMs: 1,
    })
    ProactiveSchedulerEngine.setExecutor(async () => {
      throw new Error("boom")
    })

    const ok = await ProactiveSchedulerEngine.executeTask({ taskId: task.id })
    expect(ok).toBe(false)

    const run = ProactiveTaskStore.getRuns(task.id, 1)[0]
    expect(run?.outcome).toBe("failed")
    expect(run?.errorCode).toBe("task_execution_failed")
    expect(run?.errorMessage).toBe("boom")

    const dlq = ProactiveTaskStore.getDLQ(task.id)
    expect(dlq.length).toBe(1)
    expect(dlq[0]?.runId).toBe(run?.id ?? null)

    const updated = ProactiveTaskStore.get(task.id)
    expect(updated?.status).toBe("dlq")
  })

  it("starts in daemon mode without internal scheduler loops", () => {
    ProactiveSchedulerEngine.stop()
    ProactiveSchedulerEngine.init({})
    ProactiveSchedulerEngine.setExecutor(async () => ({ ok: true, evidenceRefs: ["task://daemon"] }))
    ProactiveSchedulerEngine.start({ mode: "daemon" })

    expect(ProactiveSchedulerEngine.getIsRunning()).toBe(true)
    expect(ProactiveSchedulerEngine.tickInterval).toBe(null)
    expect(ProactiveSchedulerEngine.dlqCheckInterval).toBe(null)

    ProactiveSchedulerEngine.stop()
  })
})

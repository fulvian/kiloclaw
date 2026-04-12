import { describe, expect, it } from "bun:test"
import { buildCreate, validateSchedule } from "../../src/kiloclaw/proactive/scheduled-task"
import { presetToCron, validateCron } from "../../src/kiloclaw/proactive/schedule-parse"

describe("scheduled task schema", () => {
  it("maps presets to cron", () => {
    expect(presetToCron("daily-09:00")).toBe("0 9 * * *")
    expect(presetToCron("hourly")).toBe("0 * * * *")
  })

  it("rejects invalid cron", () => {
    const invalid = validateCron("0 25 * * *")
    expect(invalid.ok).toBe(false)
  })

  it("validates schedule with preview runs", () => {
    const out = validateSchedule({ cron: "0 9 * * 1-5", timezone: "UTC" })
    expect(out.ok).toBe(true)
    expect(out.schedule).toBe("0 9 * * 1-5")
    expect((out.nextRuns ?? []).length).toBeGreaterThanOrEqual(1)
  })

  it("builds task payload with default preset", () => {
    const out = buildCreate({
      name: "daily repo scan",
      prompt: "scan repo",
      timezone: "UTC",
      dstPolicy: "skip-duplicate",
      retryMaxAttempts: 3,
      retryBackoff: "exponential",
      retryBaseMs: 30_000,
      retryMaxMs: 900_000,
      retryJitter: 0.2,
      maxInstances: 1,
      concurrency: "forbid",
      startingDeadlineMs: 600_000,
      missedRunPolicy: "catchup_one",
      requireApproval: "auto",
      enabled: true,
    })

    expect(out.task.scheduleCron).toBe("0 9 * * *")
    expect(out.task.tenantId.length).toBeGreaterThan(0)
    expect((out.view.nextRuns as number[]).length).toBeGreaterThanOrEqual(1)
  })
})

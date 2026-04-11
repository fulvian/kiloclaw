import { describe, expect, it } from "bun:test"
import { join } from "node:path"
import { tmpdir } from "../fixture/fixture"

describe("task command lifecycle", () => {
  it("executes create/list/show/pause/resume/run-now/update/delete", async () => {
    await using tmp = await tmpdir()
    const env = {
      ...process.env,
      KILOCLAW_PROACTIVE_DB_PATH: join(tmp.path, "proactive.db"),
      XDG_DATA_HOME: join(tmp.path, "xdg-data"),
      KILOCLAW_PROACTIVE_ENABLED: "true",
      KILO_DISABLE_KILOCODE_LEGACY: "true",
      KILOCLAW_TENANT_ID: "test-tenant",
    }

    const created = await runCli(
      [
        "task",
        "create",
        "--name",
        "daily repo scan",
        "--prompt",
        "scan repo for flaky tests",
        "--cron",
        "0 9 * * *",
        "--timezone",
        "UTC",
        "--json",
      ],
      env,
    )
    expect(created.code).toBe(0)
    const createJson = parseJson(created.stdout)
    const id = String(createJson.task.id)
    const ref = String(createJson.task.ref)
    expect(id.startsWith("task_")).toBe(true)
    expect(ref.startsWith("tsk_")).toBe(true)

    const listed = await runCli(["task", "list", "--json"], env)
    expect(listed.code).toBe(0)
    const listJson = parseJson(listed.stdout)
    expect(Array.isArray(listJson.tasks)).toBe(true)

    const shown = await runCli(["task", "show", ref, "--json"], env)
    expect(shown.code).toBe(0)
    const showJson = parseJson(shown.stdout)
    expect(String(showJson.task.id)).toBe(id)
    expect(String(showJson.task.schedule)).toBe("0 9 * * *")
    expect(String(showJson.task.timezone)).toBe("UTC")

    const paused = await runCli(["task", "pause", ref], env)
    expect(paused.code).toBe(0)

    const resumed = await runCli(["task", "resume", ref], env)
    expect(resumed.code).toBe(0)

    const ran = await runCli(["task", "run-now", ref, "--json"], env)
    expect(ran.code).toBe(0)
    const runJson = parseJson(ran.stdout)
    expect(typeof runJson.accepted).toBe("boolean")
    expect(typeof runJson.runId === "string" || runJson.runId === null).toBe(true)

    const updated = await runCli(["task", "update", ref, "--cron", "15 9 * * 1-5", "--timezone", "UTC"], env)
    expect(updated.code).toBe(0)

    const shownAfterUpdate = await runCli(["task", "show", ref, "--json"], env)
    expect(shownAfterUpdate.code).toBe(0)
    const showAfterUpdateJson = parseJson(shownAfterUpdate.stdout)
    expect(String(showAfterUpdateJson.task.schedule)).toBe("15 9 * * 1-5")

    const deleted = await runCli(["task", "delete", ref], env)
    expect(deleted.code).toBe(0)

    const shownAfterDelete = await runCli(["task", "show", id, "--json"], env)
    expect(shownAfterDelete.code).not.toBe(0)
  }, 120_000)

  it("validates invalid cron with non-zero exit", async () => {
    await using tmp = await tmpdir()
    const env = {
      ...process.env,
      KILOCLAW_PROACTIVE_DB_PATH: join(tmp.path, "proactive.db"),
      XDG_DATA_HOME: join(tmp.path, "xdg-data"),
      KILO_DISABLE_KILOCODE_LEGACY: "true",
      KILOCLAW_TENANT_ID: "test-tenant",
    }

    const result = await runCli(["task", "validate", "--cron", "0 25 * * *", "--timezone", "UTC"], env)
    expect(result.code).not.toBe(0)
    expect(result.stderr.includes("invalid") || result.stdout.includes("invalid")).toBe(true)
  }, 60_000)

  it("executes runs and dlq commands", async () => {
    await using tmp = await tmpdir()
    const env = {
      ...process.env,
      KILOCLAW_PROACTIVE_DB_PATH: join(tmp.path, "proactive.db"),
      XDG_DATA_HOME: join(tmp.path, "xdg-data"),
      KILOCLAW_PROACTIVE_ENABLED: "true",
      KILO_DISABLE_KILOCODE_LEGACY: "true",
      KILOCLAW_TENANT_ID: "test-tenant",
    }

    // Create a task
    const created = await runCli(
      [
        "task",
        "create",
        "--name",
        "test task for runs",
        "--prompt",
        "test prompt",
        "--cron",
        "0 9 * * *",
        "--timezone",
        "UTC",
        "--json",
      ],
      env,
    )
    expect(created.code).toBe(0)
    const createJson = parseJson(created.stdout)
    const id = String(createJson.task.id)

    // Get runs for task (should be empty initially)
    const runs = await runCli(["task", "runs", id, "--json"], env)
    expect(runs.code).toBe(0)
    const runsJson = parseJson(runs.stdout)
    expect(Array.isArray(runsJson.runs)).toBe(true)

    // Get DLQ (should be empty initially)
    const dlq = await runCli(["task", "dlq", "--json"], env)
    expect(dlq.code).toBe(0)
    const dlqJson = parseJson(dlq.stdout)
    expect(Array.isArray(dlqJson.dlq)).toBe(true)
    expect(dlqJson.dlq.length).toBe(0)

    // Get DLQ for specific task
    const dlqForTask = await runCli(["task", "dlq", "--task", id, "--json"], env)
    expect(dlqForTask.code).toBe(0)
    const dlqForTaskJson = parseJson(dlqForTask.stdout)
    expect(Array.isArray(dlqForTaskJson.dlq)).toBe(true)

    // Clean up
    await runCli(["task", "delete", id], env)
  }, 120_000)

  it("respects feature flags", async () => {
    await using tmp = await tmpdir()
    const env = {
      ...process.env,
      KILOCLAW_PROACTIVE_DB_PATH: join(tmp.path, "proactive.db"),
      XDG_DATA_HOME: join(tmp.path, "xdg-data"),
      KILOCLAW_PROACTIVE_ENABLED: "true",
      KILO_DISABLE_KILOCODE_LEGACY: "true",
      KILOCLAW_TENANT_ID: "test-tenant",
      KILOCLAW_SCHEDULED_TASKS_ENABLED: "false",
    }

    // Feature disabled - tasks should still work via CLI (not TUI)
    const created = await runCli(
      ["task", "create", "--name", "feature flag test", "--prompt", "test", "--cron", "0 9 * * *", "--json"],
      env,
    )
    // CLI doesn't check KILOCLAW_SCHEDULED_TASKS_ENABLED - it's TUI only
    expect(created.code).toBe(0)

    const createJson = parseJson(created.stdout)
    const id = String(createJson.task.id)

    // Clean up
    await runCli(["task", "delete", id], env)
  }, 120_000)

  it("handles task list with status filter", async () => {
    await using tmp = await tmpdir()
    const env = {
      ...process.env,
      KILOCLAW_PROACTIVE_DB_PATH: join(tmp.path, "proactive.db"),
      XDG_DATA_HOME: join(tmp.path, "xdg-data"),
      KILOCLAW_PROACTIVE_ENABLED: "true",
      KILO_DISABLE_KILOCODE_LEGACY: "true",
      KILOCLAW_TENANT_ID: "test-tenant",
    }

    // Create active task
    const created = await runCli(
      ["task", "create", "--name", "active task", "--prompt", "test", "--cron", "0 9 * * *", "--json"],
      env,
    )
    expect(created.code).toBe(0)
    const createJson = parseJson(created.stdout)
    const id = String(createJson.task.id)

    // Filter by status
    const listedActive = await runCli(["task", "list", "--status", "active", "--json"], env)
    expect(listedActive.code).toBe(0)
    const listActiveJson = parseJson(listedActive.stdout)
    expect(Array.isArray(listActiveJson.tasks)).toBe(true)

    // Filter by paused (should be empty)
    const listedPaused = await runCli(["task", "list", "--status", "paused", "--json"], env)
    expect(listedPaused.code).toBe(0)
    const listPausedJson = parseJson(listedPaused.stdout)
    expect(Array.isArray(listPausedJson.tasks)).toBe(true)

    // Clean up
    await runCli(["task", "delete", id], env)
  }, 120_000)

  it("resolves selectors by name and list index", async () => {
    await using tmp = await tmpdir()
    const env = {
      ...process.env,
      KILOCLAW_PROACTIVE_DB_PATH: join(tmp.path, "proactive.db"),
      XDG_DATA_HOME: join(tmp.path, "xdg-data"),
      KILOCLAW_PROACTIVE_ENABLED: "true",
      KILO_DISABLE_KILOCODE_LEGACY: "true",
      KILOCLAW_TENANT_ID: "test-tenant",
    }

    const first = await runCli(
      ["task", "create", "--name", "selector by name", "--prompt", "a", "--cron", "0 9 * * *", "--json"],
      env,
    )
    expect(first.code).toBe(0)
    const firstJson = parseJson(first.stdout)
    const firstId = String(firstJson.task.id)

    const second = await runCli(
      ["task", "create", "--name", "selector second", "--prompt", "b", "--cron", "0 10 * * *", "--json"],
      env,
    )
    expect(second.code).toBe(0)

    const byName = await runCli(["task", "show", "selector by name", "--json"], env)
    expect(byName.code).toBe(0)
    const byNameJson = parseJson(byName.stdout)
    expect(String(byNameJson.task.id)).toBe(firstId)

    const byIndex = await runCli(["task", "show", "#1", "--json"], env)
    expect(byIndex.code).toBe(0)
    const byIndexJson = parseJson(byIndex.stdout)
    expect(String(byIndexJson.task.name)).toBe("selector second")
  }, 120_000)

  it("handles runs with filters", async () => {
    await using tmp = await tmpdir()
    const env = {
      ...process.env,
      KILOCLAW_PROACTIVE_DB_PATH: join(tmp.path, "proactive.db"),
      XDG_DATA_HOME: join(tmp.path, "xdg-data"),
      KILOCLAW_PROACTIVE_ENABLED: "true",
      KILO_DISABLE_KILOCODE_LEGACY: "true",
      KILOCLAW_TENANT_ID: "test-tenant",
    }

    // Create task
    const created = await runCli(
      ["task", "create", "--name", "runs filter test", "--prompt", "test", "--cron", "0 9 * * *", "--json"],
      env,
    )
    expect(created.code).toBe(0)
    const createJson = parseJson(created.stdout)
    const id = String(createJson.task.id)

    // Get runs with limit
    const runs = await runCli(["task", "runs", id, "--limit", "5", "--json"], env)
    expect(runs.code).toBe(0)

    // Get runs with failed filter (should be empty)
    const failedRuns = await runCli(["task", "runs", id, "--failed", "--json"], env)
    expect(failedRuns.code).toBe(0)

    // Clean up
    await runCli(["task", "delete", id], env)
  }, 120_000)
})

async function runCli(args: string[], env: Record<string, string | undefined>) {
  const proc = Bun.spawn(["bun", "--conditions=browser", "src/index.ts", ...args], {
    cwd: join(import.meta.dir, "..", ".."),
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const code = await proc.exited
  return { code, stdout, stderr }
}

function parseJson(src: string): any {
  const start = src.indexOf("{")
  if (start < 0) {
    throw new Error(`json payload not found in output: ${src}`)
  }
  return JSON.parse(src.slice(start))
}

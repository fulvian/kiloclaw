import type { Argv } from "yargs"
import { bootstrap } from "../bootstrap"
import { cmd } from "./cmd"
import { ProactiveTaskStore, type ProactiveTask } from "../../kiloclaw/proactive/scheduler.store"
import { SchedulerControlService } from "../../kiloclaw/proactive/scheduler-control.service"
import {
  ScheduledTaskCreateSchema,
  ScheduledTaskUpdateSchema,
  buildCreate,
  buildUpdate,
  parseConfig,
  validateSchedule,
} from "../../kiloclaw/proactive/scheduled-task"
import {
  formatTaskListRow,
  formatTaskDetail,
  formatRunRow,
  formatDlqRow,
  formatTimestamp,
  formatDuration,
  isInteractive,
  wantsJson,
  type TaskListRow,
  type TaskDetail,
  type RunRow,
  type DlqRow,
} from "../../kiloclaw/proactive/task-formatter"
import { Flag } from "@/flag/flag"
import { Bus } from "@/bus"
import { TaskActionEvent } from "@/kiloclaw/telemetry/scheduled-tasks.telemetry"

// CLI telemetry - publish event if Bus is available and telemetry is enabled
function publishCliTaskAction(
  action: "task_create" | "task_update" | "task_delete" | "task_pause" | "task_resume" | "task_run_now",
  taskId?: string,
  success = true,
  error?: string,
) {
  if (!Flag.KILOCLAW_SCHEDULED_TASKS_TELEMETRY) return
  try {
    Bus.publish(TaskActionEvent, {
      action,
      taskId,
      success,
      error,
    })
  } catch {
    // Bus not available in CLI context - silently ignore
  }
}

const baseOptions = (yargs: Argv) =>
  yargs
    .option("name", { type: "string", describe: "Human-readable task name" })
    .option("prompt", { type: "string", describe: "Task prompt payload" })
    .option("preset", { type: "string", describe: "Schedule preset" })
    .option("cron", { type: "string", describe: "5-field cron schedule" })
    .option("timezone", { type: "string", describe: "IANA timezone (example: Europe/Rome)" })
    .option("dst-policy", { type: "string", choices: ["skip-duplicate", "run-twice"] as const })
    .option("retry-max-attempts", { type: "number" })
    .option("retry-backoff", { type: "string", choices: ["fixed", "exponential"] as const })
    .option("retry-base-ms", { type: "number" })
    .option("retry-max-ms", { type: "number" })
    .option("retry-jitter", { type: "number" })
    .option("concurrency", { type: "string", choices: ["allow", "forbid", "replace"] as const })
    .option("starting-deadline-ms", { type: "number" })
    .option("missed-run-policy", { type: "string", choices: ["skip", "catchup_one", "catchup_all"] as const })
    .option("quiet-hours", { type: "string", describe: "HH:MM-HH:MM" })
    .option("require-approval", {
      type: "string",
      choices: ["auto", "always", "never-low-risk"] as const,
    })
    .option("enabled", { type: "boolean" })
    .option("json", { type: "boolean", default: false })
    .option("interactive", {
      type: "boolean",
      default: false,
      describe: "Open interactive TUI wizard (requires TTY)",
    })

export const TaskCreateCommand = cmd({
  command: "create",
  describe: "create a scheduled task",
  builder: (yargs: Argv) =>
    baseOptions(yargs)
      .option("dry-run", { type: "boolean", default: false })
      .check((args) => {
        // Warn if --interactive is passed but not in TTY
        if (args.interactive && !isInteractive()) {
          console.warn("Warning: --interactive requires TTY, running in non-interactive mode")
        }
        return true
      }),
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      // In interactive mode with TTY, suggest using TUI instead
      if (args.interactive && isInteractive()) {
        console.log("Hint: Use /tasks new in the TUI for interactive task creation")
        console.log("Running in non-interactive mode...")
      }

      const parsed = ScheduledTaskCreateSchema.safeParse({
        name: args.name,
        prompt: args.prompt,
        preset: args.preset,
        cron: args.cron,
        timezone: args.timezone,
        dstPolicy: args.dstPolicy,
        retryMaxAttempts: args.retryMaxAttempts,
        retryBackoff: args.retryBackoff,
        retryBaseMs: args.retryBaseMs,
        retryMaxMs: args.retryMaxMs,
        retryJitter: args.retryJitter,
        concurrency: args.concurrency,
        startingDeadlineMs: args.startingDeadlineMs,
        missedRunPolicy: args.missedRunPolicy,
        requireApproval: args.requireApproval,
        quietHours: args.quietHours,
        enabled: args.enabled,
      })
      if (!parsed.success) {
        console.error(parsed.error.issues[0]?.message ?? "invalid create options")
        process.exit(1)
      }

      const out = buildCreate(parsed.data, tenantId())
      const stored = args.dryRun ? null : ProactiveTaskStore.create(out.task)
      if (!args.dryRun) {
        ProactiveTaskStore.update(stored!.id, { status: parsed.data.enabled ? "active" : "paused" })
        publishCliTaskAction("task_create", stored!.id)
      }
      if (args.dryRun) publishCliTaskAction("task_create", undefined, true)

      const view = stored ? { ...out.view, ref: stored.ref, id: stored.id } : out.view

      if (wantsJson(args)) {
        console.log(JSON.stringify({ task: view, dryRun: args.dryRun === true }, null, 2))
        return
      }

      const action = args.dryRun ? "validated" : "created"
      console.log(`task ${action}: ${(view.id as string) ?? "n/a"}`)
      if (stored?.ref) console.log(`ref: ${stored.ref}`)
      console.log(`name: ${view.name as string}`)
      console.log(`schedule: ${view.schedule as string}`)
      console.log(`timezone: ${view.timezone as string}`)
      const next = (view.nextRuns as number[] | undefined) ?? []
      if (next[0]) console.log(`next run: ${new Date(next[0]).toISOString()}`)
    })
  },
})

export const TaskListCommand = cmd({
  command: "list",
  describe: "list scheduled tasks",
  builder: (yargs: Argv) =>
    yargs
      .option("json", { type: "boolean", default: false })
      .option("status", { type: "string", describe: "Filter by status (active, paused, dlq)" }),
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      let tasks = ProactiveTaskStore.list(tenantId())
      if (args.status) {
        tasks = tasks.filter((t) => t.status === args.status)
      }
      const rows: TaskListRow[] = tasks.map((task) => {
        const runs = ProactiveTaskStore.getRuns(task.id, 1)
        return formatTaskListRow(task, runs)
      })

      if (wantsJson(args)) {
        console.log(JSON.stringify({ tasks: rows }, null, 2))
        return
      }

      if (rows.length === 0) {
        console.log("no tasks")
        return
      }

      console.log("REF             NAME                     SCHEDULE          NEXT RUN        STATUS    LAST")
      for (const row of rows) {
        const name = row.name.length > 24 ? row.name.slice(0, 21) + "..." : row.name.padEnd(24)
        const schedule = row.schedule.length > 14 ? row.schedule.slice(0, 11) + "..." : row.schedule.padEnd(14)
        console.log(
          `${row.ref.padEnd(15)} ${name} ${schedule} ${row.nextRun.padEnd(13)} ${row.status.padEnd(8)} ${row.lastOutcome}`,
        )
      }
    })
  },
})

export const TaskShowCommand = cmd({
  command: "show <task>",
  describe: "show task details and recent runs",
  builder: (yargs: Argv) =>
    yargs
      .positional("task", { type: "string", demandOption: true, describe: "task selector: ref, id, name, or #index" })
      .option("json", { type: "boolean", default: false }),
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      const task = resolveTaskOrExit(args.task as string)

      const runs = ProactiveTaskStore.getRuns(task.id, 10)
      const dlqEntries = ProactiveTaskStore.getDLQ(task.id)
      const detail = formatTaskDetail(task, runs, dlqEntries.length)

      if (wantsJson(args)) {
        console.log(JSON.stringify({ task: detail }, null, 2))
        return
      }

      console.log(`id: ${detail.id}`)
      console.log(`ref: ${detail.ref}`)
      console.log(`name: ${detail.name}`)
      console.log(`status: ${detail.status}`)
      console.log(`schedule: ${detail.schedule ?? "none"}`)
      console.log(`timezone: ${detail.timezone}`)
      if (detail.nextRunsPreview[0]) console.log(`next run: ${detail.nextRunsPreview[0]}`)
      if (detail.lastRun) console.log(`last outcome: ${detail.lastRun.outcome}`)
      if (detail.lastError) console.log(`last error: ${detail.lastError}`)
      if (detail.retry) {
        console.log(`retry: ${detail.retry.maxAttempts} attempts, ${detail.retry.backoff} backoff`)
      }
      console.log(`concurrency: ${detail.concurrency ?? "forbid"}`)
      if (detail.missedRunPolicy) console.log(`missed run policy: ${detail.missedRunPolicy}`)
      if (detail.requireApproval) console.log(`approval: ${detail.requireApproval}`)
      if (detail.dlqCount > 0) console.log(`dlq entries: ${detail.dlqCount}`)
    })
  },
})

export const TaskPauseCommand = cmd({
  command: "pause <task>",
  describe: "pause task execution",
  builder: (yargs: Argv) =>
    yargs.positional("task", {
      type: "string",
      demandOption: true,
      describe: "task selector: ref, id, name, or #index",
    }),
  handler: async (args) => mutateStatus(args.task as string, "paused"),
})

export const TaskResumeCommand = cmd({
  command: "resume <task>",
  describe: "resume task execution",
  builder: (yargs: Argv) =>
    yargs.positional("task", {
      type: "string",
      demandOption: true,
      describe: "task selector: ref, id, name, or #index",
    }),
  handler: async (args) => mutateStatus(args.task as string, "active"),
})

export const TaskDeleteCommand = cmd({
  command: "delete <task>",
  describe: "delete a task",
  builder: (yargs: Argv) =>
    yargs.positional("task", {
      type: "string",
      demandOption: true,
      describe: "task selector: ref, id, name, or #index",
    }),
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      const task = resolveTaskOrExit(args.task as string)
      const ok = SchedulerControlService.deleteTask(task.id)
      if (!ok) {
        console.error(`task not found: ${args.task as string}`)
        process.exit(1)
      }
      publishCliTaskAction("task_delete", task.id)
      console.log(`deleted: ${task.ref}`)
    })
  },
})

export const TaskRunNowCommand = cmd({
  command: "run-now <task>",
  describe: "trigger immediate task run",
  builder: (yargs: Argv) =>
    yargs
      .positional("task", { type: "string", demandOption: true, describe: "task selector: ref, id, name, or #index" })
      .option("json", { type: "boolean", default: false }),
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      const task = resolveTaskOrExit(args.task as string)

      const out = await SchedulerControlService.runNow(task.id, "manual")
      const run = ProactiveTaskStore.getRuns(task.id, 1)[0] ?? null
      const accepted = out.accepted
      publishCliTaskAction("task_run_now", task.id, accepted)
      const payload = {
        runId: run?.id ?? null,
        accepted,
        reasonCode: out.reasonCode,
        gateDecision: run?.gateDecisions ?? null,
        executionMode: "run-now",
      }

      if (args.json) {
        console.log(JSON.stringify(payload, null, 2))
        return
      }

      console.log(`accepted: ${accepted}`)
      if (!accepted) console.log(`reason: ${out.reasonCode}`)
      if (run?.id) console.log(`run: ${run.id}`)
      if (run?.outcome) console.log(`outcome: ${run.outcome}`)
    })
  },
})

export const TaskUpdateCommand = cmd({
  command: "update <task>",
  describe: "update schedule or runtime options",
  builder: (yargs: Argv) =>
    baseOptions(yargs)
      .positional("task", { type: "string", demandOption: true, describe: "task selector: ref, id, name, or #index" })
      .check((args) => {
        if (args.interactive && !isInteractive()) {
          console.warn("Warning: --interactive requires TTY, running in non-interactive mode")
        }
        return true
      }),
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      // In interactive mode with TTY, suggest using TUI instead
      if (args.interactive && isInteractive()) {
        console.log("Hint: Use /tasks edit in the TUI for interactive task editing")
        console.log("Running in non-interactive mode...")
      }

      const current = resolveTaskOrExit(args.task as string)

      const parsed = ScheduledTaskUpdateSchema.safeParse({
        name: args.name,
        prompt: args.prompt,
        preset: args.preset,
        cron: args.cron,
        timezone: args.timezone,
        dstPolicy: args.dstPolicy,
        retryMaxAttempts: args.retryMaxAttempts,
        retryBackoff: args.retryBackoff,
        retryBaseMs: args.retryBaseMs,
        retryMaxMs: args.retryMaxMs,
        retryJitter: args.retryJitter,
        concurrency: args.concurrency,
        startingDeadlineMs: args.startingDeadlineMs,
        missedRunPolicy: args.missedRunPolicy,
        requireApproval: args.requireApproval,
        quietHours: args.quietHours,
        enabled: args.enabled,
      })
      if (!parsed.success) {
        console.error(parsed.error.issues[0]?.message ?? "invalid update options")
        process.exit(1)
      }

      const patch = buildUpdate({
        currentConfig: parseConfig(current.triggerConfig),
        currentCron: current.scheduleCron ?? null,
        patch: parsed.data,
      })

      const updated = ProactiveTaskStore.update(current.id, {
        name: patch.name,
        status: patch.status,
        triggerConfig: patch.triggerConfig,
        scheduleCron: patch.scheduleCron,
        nextRunAt: patch.nextRunAt,
        maxRetries: parsed.data.retryMaxAttempts,
      })

      if (updated) {
        publishCliTaskAction("task_update", updated.id)
      }

      if (!updated) {
        console.error(`task not found: ${args.task as string}`)
        process.exit(1)
      }

      console.log(`updated: ${updated.ref}`)
    })
  },
})

export const TaskValidateCommand = cmd({
  command: "validate",
  describe: "validate schedule options without saving",
  builder: (yargs: Argv) =>
    yargs
      .option("preset", { type: "string" })
      .option("cron", { type: "string" })
      .option("timezone", { type: "string" })
      .option("json", { type: "boolean", default: false }),
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      const out = validateSchedule({
        preset: args.preset as string | undefined,
        cron: args.cron as string | undefined,
        timezone: args.timezone as string | undefined,
      })

      if (wantsJson(args)) {
        console.log(JSON.stringify(out, null, 2))
        return
      }

      if (!out.ok) {
        console.error(out.error ?? "invalid schedule")
        process.exit(1)
      }

      console.log(`valid schedule: ${out.schedule as string}`)
      console.log(`timezone: ${out.timezone as string}`)
      const next = out.nextRuns ?? []
      if (next[0]) console.log(`next: ${new Date(next[0]).toISOString()}`)
      if (next[1]) console.log(`next+1: ${new Date(next[1]).toISOString()}`)
    })
  },
})

export const TaskRunsCommand = cmd({
  command: "runs <task>",
  describe: "list recent runs for a task",
  builder: (yargs: Argv) =>
    yargs
      .positional("task", { type: "string", demandOption: true, describe: "task selector: ref, id, name, or #index" })
      .option("json", { type: "boolean", default: false })
      .option("failed", { type: "boolean", default: false, describe: "Show only failed runs" })
      .option("limit", { type: "number", default: 20, describe: "Maximum number of runs to show" }),
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      const task = resolveTaskOrExit(args.task as string)

      const runs = ProactiveTaskStore.getRuns(task.id, args.limit ?? 20)
      const filteredRuns = args.failed ? runs.filter((r) => r.outcome === "failed") : runs
      const rows: RunRow[] = filteredRuns.map(formatRunRow)

      if (wantsJson(args)) {
        console.log(JSON.stringify({ runs: rows }, null, 2))
        return
      }

      if (rows.length === 0) {
        console.log("no runs")
        return
      }

      console.log(`Task: ${task.name} (${task.ref})`)
      console.log("")
      for (const row of rows) {
        console.log(`${formatTimestamp(row.startedAt)}  [${row.outcome}]  ${formatDuration(row.durationMs)}`)
        if (row.errorMessage) {
          console.log(`  Error: ${row.errorCode ?? "ERR"} - ${row.errorMessage.slice(0, 80)}`)
        }
      }
    })
  },
})

export const TaskDLQCommand = cmd({
  command: "dlq",
  describe: "show dead letter queue entries",
  builder: (yargs: Argv) =>
    yargs
      .option("task", { type: "string", describe: "Filter by task selector (ref, id, name, #index)" })
      .option("ready", { type: "boolean", default: false, describe: "Show only entries ready for retry" })
      .option("json", { type: "boolean", default: false }),
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      const task = args.task ? resolveTaskOrExit(args.task) : null
      const entries = ProactiveTaskStore.getDLQ(task?.id, args.ready ?? false)
      const rows: DlqRow[] = entries.map((entry) => {
        const current = task ?? ProactiveTaskStore.get(entry.taskId)
        return formatDlqRow(entry, current?.name)
      })

      if (wantsJson(args)) {
        console.log(JSON.stringify({ dlq: rows }, null, 2))
        return
      }

      if (rows.length === 0) {
        console.log("DLQ is empty")
        return
      }

      console.log(`Dead Letter Queue (${rows.length} entries)`)
      console.log("")
      for (const row of rows) {
        const ready = row.isReady ? "READY" : "wait"
        console.log(`[${ready}] ${row.taskName} - ${row.errorCode}`)
        console.log(`  ${row.error.slice(0, 80)}`)
        if (row.retryAt) {
          console.log(`  Retry at: ${formatTimestamp(row.retryAt)}`)
        }
        console.log("")
      }
    })
  },
})

export const TaskCommand = cmd({
  command: "task",
  describe: "manage scheduled tasks",
  builder: (yargs: Argv) =>
    yargs
      .command(TaskCreateCommand)
      .command(TaskListCommand)
      .command(TaskShowCommand)
      .command(TaskPauseCommand)
      .command(TaskResumeCommand)
      .command(TaskRunNowCommand)
      .command(TaskDeleteCommand)
      .command(TaskUpdateCommand)
      .command(TaskValidateCommand)
      .command(TaskRunsCommand)
      .command(TaskDLQCommand)
      .demandCommand(),
  handler: async () => {},
})

async function mutateStatus(selector: string, status: "active" | "paused"): Promise<void> {
  await bootstrap(process.cwd(), async () => {
    const task = resolveTaskOrExit(selector)

    const cfg = parseConfig(task.triggerConfig)
    const updatedCfg = JSON.stringify({ ...cfg, enabled: status === "active" })
    SchedulerControlService.updateTask(task.id, {
      triggerConfig: updatedCfg,
      ...(status === "active"
        ? { status: "active", state: "active" as const }
        : { status: "paused", state: "paused" as const, nextRunAt: null }),
    })
    if (status === "active") {
      SchedulerControlService.resumeTask(task.id)
    }

    publishCliTaskAction(status === "active" ? "task_resume" : "task_pause", task.id)
    console.log(`${status}: ${task.ref}`)
  })
}

function resolveTaskOrExit(selector: string): ProactiveTask {
  const out = SchedulerControlService.resolveTask(selector, tenantId())
  if (out.ok) return out.task

  if (out.code === "ambiguous") {
    const options = out.matches.slice(0, 5).map((task) => `${task.ref}:${task.name}`)
    console.error(`task selector is ambiguous: ${selector}`)
    console.error(`matches: ${options.join(", ")}`)
    process.exit(1)
  }

  console.error(`task not found: ${selector}`)
  process.exit(1)
  throw new Error("unreachable")
}

function tenantId(): string {
  return process.env.KILOCLAW_TENANT_ID ?? "local"
}

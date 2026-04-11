import { ProactiveSchedulerEngine } from "./scheduler.engine"
import {
  ProactiveTaskStore,
  type CreateTaskInput,
  type ProactiveTask,
  type ResolveTaskSelectorResult,
  type UpdateTaskInput,
} from "./scheduler.store"
import { nextRuns } from "./schedule-parse"

export type RunNowReasonCode =
  | "ok"
  | "task_not_found"
  | "executor_missing"
  | "execution_disabled"
  | "policy_denied"
  | "budget_exceeded"
  | "failed"

export type RunNowResult = {
  accepted: boolean
  reasonCode: RunNowReasonCode
  runId: string | null
}

function toState(status: "active" | "paused" | "dlq" | "completed" | "failed") {
  return status === "active"
    ? "active"
    : status === "paused"
      ? "paused"
      : status === "completed"
        ? "completed"
        : status === "dlq"
          ? "dlq"
          : "failed"
}

function readCfg(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

function reschedule(task: ProactiveTask): number | null {
  if (!task.scheduleCron) return null
  const cfg = readCfg(task.triggerConfig)
  const timezone = typeof cfg.timezone === "string" ? cfg.timezone : Intl.DateTimeFormat().resolvedOptions().timeZone
  return nextRuns({ cron: task.scheduleCron, timezone, count: 1 })[0] ?? null
}

export const SchedulerControlService = {
  resolveTask(selector: string, tenantId = process.env.KILOCLAW_TENANT_ID ?? "local"): ResolveTaskSelectorResult {
    return ProactiveTaskStore.resolveSelector(selector, tenantId)
  },

  createTask(input: CreateTaskInput): ProactiveTask {
    return ProactiveTaskStore.create(input)
  },

  updateTask(taskId: string, patch: UpdateTaskInput): ProactiveTask | null {
    return ProactiveTaskStore.update(taskId, patch)
  },

  pauseTask(taskId: string): ProactiveTask | null {
    return ProactiveTaskStore.update(taskId, {
      status: "paused",
      state: "paused",
      nextRunAt: null,
    })
  },

  resumeTask(taskId: string): ProactiveTask | null {
    const task = ProactiveTaskStore.get(taskId)
    if (!task) return null
    return ProactiveTaskStore.update(taskId, {
      status: "active",
      state: "active",
      nextRunAt: reschedule(task),
    })
  },

  async runNow(taskId: string, runType: "manual" | "scheduled" | "replay" = "manual"): Promise<RunNowResult> {
    const task = ProactiveTaskStore.get(taskId)
    if (!task) {
      return { accepted: false, reasonCode: "task_not_found", runId: null }
    }

    if (process.env.KILOCLAW_TASK_ACTIONS_EXEC !== "true" && process.env.KILOCLAW_TASK_ACTIONS_EXEC !== "1") {
      return { accepted: false, reasonCode: "execution_disabled", runId: null }
    }

    if (!ProactiveSchedulerEngine.hasExecutor()) {
      return { accepted: false, reasonCode: "executor_missing", runId: null }
    }

    const accepted = await ProactiveSchedulerEngine.executeTask({ taskId: task.id, runType })
    const run = ProactiveTaskStore.getRuns(task.id, 1)[0] ?? null
    const reason: RunNowReasonCode = accepted
      ? "ok"
      : run?.outcome === "policy_denied"
        ? "policy_denied"
        : run?.outcome === "budget_exceeded"
          ? "budget_exceeded"
          : run?.outcome === "failed"
            ? "failed"
            : run?.outcome === "executor_missing"
              ? "executor_missing"
              : "failed"
    return {
      accepted,
      reasonCode: reason,
      runId: run?.id ?? null,
    }
  },

  deleteTask(taskId: string): boolean {
    return ProactiveTaskStore.remove(taskId)
  },

  replayDlq(entryId: string): { accepted: boolean; reasonCode: string } {
    const entry = ProactiveTaskStore.getDLQEntry(entryId)
    if (!entry) return { accepted: false, reasonCode: "dlq_not_found" }
    const task = ProactiveTaskStore.get(entry.taskId)
    if (!task) return { accepted: false, reasonCode: "task_not_found" }
    ProactiveTaskStore.removeFromDLQ(entryId)
    ProactiveTaskStore.update(task.id, {
      status: "active",
      state: toState("active"),
      nextRunAt: Date.now(),
    })
    return { accepted: true, reasonCode: "ok" }
  },
}

import { TextAttributes } from "@opentui/core"
import { createMemo, For, Show, onMount } from "solid-js"
import { useTheme } from "@tui/context/theme"
import { useDialog } from "./dialog"
import { useKeyboard } from "@opentui/solid"
import type { ProactiveTask, ProactiveTaskRun } from "@/kiloclaw/proactive/scheduler.store"
import { publishViewNavigation, publishTaskAction } from "@/kiloclaw/telemetry/scheduled-tasks.telemetry"

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  active: { label: "Active", color: "green" },
  paused: { label: "Paused", color: "yellow" },
  dlq: { label: "Dead Letter", color: "red" },
  completed: { label: "Completed", color: "blue" },
  failed: { label: "Failed", color: "red" },
}

const OUTCOME_LABELS: Record<string, { label: string; color: string }> = {
  success: { label: "Success", color: "green" },
  failed: { label: "Failed", color: "red" },
  blocked: { label: "Blocked", color: "yellow" },
  budget_exceeded: { label: "Budget Exceeded", color: "yellow" },
  policy_denied: { label: "Policy Denied", color: "red" },
}

export function DialogTaskDetail(props: {
  taskId: string
  onEdit?: () => void
  onRuns?: () => void
  onDLQ?: () => void
  onPause?: () => void
  onResume?: () => void
  onRunNow?: () => void
  onDelete?: () => void
  onClose?: () => void
}) {
  const dialog = useDialog()
  const { theme } = useTheme()

  // Load task from store
  const task = createMemo(() => {
    try {
      const { ProactiveTaskStore } = require("@/kiloclaw/proactive/scheduler.store")
      return ProactiveTaskStore.get(props.taskId)
    } catch {
      return null
    }
  })

  // Load last 3 runs
  const recentRuns = createMemo(() => {
    try {
      const { ProactiveTaskStore } = require("@/kiloclaw/proactive/scheduler.store")
      return ProactiveTaskStore.getRuns(props.taskId, 3)
    } catch {
      return [] as ProactiveTaskRun[]
    }
  })

  // Parse trigger config
  const config = createMemo(() => {
    const t = task()
    if (!t) return null
    try {
      return JSON.parse(t.triggerConfig)
    } catch {
      return null
    }
  })

  // Format timestamp
  function formatTs(ts: number | null | undefined): string {
    if (!ts) return "-"
    return new Date(ts).toLocaleString()
  }

  // Format duration
  function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${(ms / 60000).toFixed(1)}m`
  }

  useKeyboard((evt) => {
    if (evt.name === "escape") {
      props.onClose?.()
      dialog.clear()
    }
    if (evt.name === "e" && !evt.ctrl) {
      props.onEdit?.()
    }
    if (evt.name === "r" && !evt.ctrl) {
      props.onRuns?.()
    }
  })

  // Telemetry - track detail view on mount
  onMount(() => {
    publishViewNavigation("detail", props.taskId)
  })

  const t = task()
  if (!t) {
    return (
      <box padding={2}>
        <text fg={theme.error}>Task not found</text>
      </box>
    )
  }

  const status = STATUS_LABELS[t.status] ?? { label: t.status, color: "white" }
  const cfg = config()

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} flexGrow={1} flexShrink={0} overflow="hidden">
      {/* Header */}
      <box flexDirection="row" justifyContent="space-between" alignItems="center">
        <box flexDirection="column" gap={0}>
          <text attributes={TextAttributes.BOLD} fg={theme.primary}>
            {t.name}
          </text>
          <text fg={theme.textMuted}>{t.id}</text>
        </box>
        <box flexDirection="row" gap={1}>
          <text
            fg={theme.textMuted}
            onMouseUp={() => {
              props.onClose?.()
              dialog.clear()
            }}
          >
            esc
          </text>
        </box>
      </box>

      {/* Status badge */}
      <box flexDirection="row" gap={1} alignItems="center">
        <text fg={theme.textMuted}>Status:</text>
        <box paddingLeft={1} paddingRight={1} backgroundColor={theme.backgroundElement}>
          <text fg={status.color as any}>{status.label}</text>
        </box>
      </box>

      {/* Details */}
      <scrollbox flexGrow={1} flexShrink={1}>
        <box flexDirection="column" gap={2}>
          {/* Schedule section */}
          <box flexDirection="column" gap={0}>
            <text attributes={TextAttributes.BOLD} fg={theme.text}>
              Schedule
            </text>
            <text fg={theme.textMuted}>{t.scheduleCron ?? "No schedule configured"}</text>
            <text fg={theme.textMuted}>
              Next run: {t.nextRunAt ? new Date(t.nextRunAt).toLocaleString() : "Not scheduled"}
            </text>
            {cfg?.timezone && <text fg={theme.textMuted}>Timezone: {cfg.timezone}</text>}
          </box>

          {/* Runtime section */}
          <Show when={cfg}>
            <box flexDirection="column" gap={0}>
              <text attributes={TextAttributes.BOLD} fg={theme.text}>
                Runtime
              </text>
              <text fg={theme.text}>
                Retry: {cfg.retry?.maxAttempts ?? 3} attempts, {cfg.retry?.backoff ?? "exponential"} backoff
              </text>
              <text fg={theme.text}>Concurrency: {cfg.concurrency ?? "forbid"}</text>
              <text fg={theme.text}>Missed run policy: {cfg.missedRunPolicy ?? "catchup_one"}</text>
              <Show when={cfg.requireApproval}>
                <text fg={theme.text}>Approval: {cfg.requireApproval}</text>
              </Show>
            </box>
          </Show>

          {/* Prompt section */}
          <Show when={cfg?.prompt}>
            <box flexDirection="column" gap={0}>
              <text attributes={TextAttributes.BOLD} fg={theme.text}>
                Prompt
              </text>
              <text fg={theme.textMuted}>{cfg.prompt}</text>
            </box>
          </Show>

          {/* Error section */}
          <Show when={t.lastError}>
            <box flexDirection="column" gap={0}>
              <text attributes={TextAttributes.BOLD} fg={theme.error}>
                Last Error
              </text>
              <text fg={theme.error}>{t.lastError}</text>
            </box>
          </Show>

          {/* Recent runs section */}
          <box flexDirection="column" gap={0}>
            <box flexDirection="row" justifyContent="space-between" alignItems="center">
              <text attributes={TextAttributes.BOLD} fg={theme.text}>
                Recent Runs
              </text>
              <text fg={theme.primary} onMouseUp={() => props.onRuns?.()}>
                View all →
              </text>
            </box>
            <Show when={recentRuns().length > 0} fallback={<text fg={theme.textMuted}>No runs yet</text>}>
              <For each={recentRuns()}>
                {(run) => {
                  const outcome = OUTCOME_LABELS[run.outcome] ?? { label: run.outcome, color: "white" }
                  return (
                    <box flexDirection="row" gap={2} paddingTop={1}>
                      <text fg={theme.textMuted}>{formatTs(run.startedAt)}</text>
                      <text fg={outcome.color as any}>[{outcome.label}]</text>
                      <text fg={theme.textMuted}>{formatDuration(run.durationMs)}</text>
                      <Show when={run.errorMessage}>
                        <text fg={theme.error}>{run.errorMessage}</text>
                      </Show>
                    </box>
                  )
                }}
              </For>
            </Show>
          </box>

          {/* DLQ section */}
          <Show when={t.status === "dlq"}>
            <box flexDirection="column" gap={0}>
              <box flexDirection="row" justifyContent="space-between" alignItems="center">
                <text attributes={TextAttributes.BOLD} fg={theme.error}>
                  Dead Letter Queue
                </text>
                <text fg={theme.primary} onMouseUp={() => props.onDLQ?.()}>
                  View DLQ →
                </text>
              </box>
              <text fg={theme.textMuted}>This task has items in the DLQ</text>
            </box>
          </Show>

          {/* Timestamps */}
          <box flexDirection="column" gap={0}>
            <text attributes={TextAttributes.BOLD} fg={theme.textMuted}>
              Metadata
            </text>
            <text fg={theme.textMuted}>Created: {formatTs(t.createdAt)}</text>
            <text fg={theme.textMuted}>Updated: {formatTs(t.updatedAt)}</text>
            <text fg={theme.textMuted}>Tenant: {t.tenantId}</text>
          </box>
        </box>
      </scrollbox>

      {/* Footer actions */}
      <box flexDirection="row" justifyContent="space-between" alignItems="center">
        <box flexDirection="row" gap={1}>
          <Show when={t.status === "active"}>
            <box
              paddingLeft={1}
              paddingRight={1}
              backgroundColor={theme.backgroundElement}
              onMouseUp={() => {
                publishTaskAction("task_pause", { taskId: props.taskId })
                props.onPause?.()
              }}
            >
              <text fg={theme.text}>⏸ Pause</text>
            </box>
          </Show>
          <Show when={t.status === "paused"}>
            <box
              paddingLeft={1}
              paddingRight={1}
              backgroundColor={theme.backgroundElement}
              onMouseUp={() => {
                publishTaskAction("task_resume", { taskId: props.taskId })
                props.onResume?.()
              }}
            >
              <text fg={theme.text}>▶ Resume</text>
            </box>
          </Show>
          <box
            paddingLeft={1}
            paddingRight={1}
            backgroundColor={theme.backgroundElement}
            onMouseUp={() => {
              publishTaskAction("task_run_now", { taskId: props.taskId })
              props.onRunNow?.()
            }}
          >
            <text fg={theme.text}>▶ Run now</text>
          </box>
        </box>
        <box flexDirection="row" gap={1}>
          <box
            paddingLeft={1}
            paddingRight={1}
            backgroundColor={theme.error}
            onMouseUp={() => {
              publishTaskAction("task_delete", { taskId: props.taskId })
              props.onDelete?.()
            }}
          >
            <text fg={theme.background}>Delete</text>
          </box>
          <box
            paddingLeft={1}
            paddingRight={1}
            backgroundColor={theme.primary}
            onMouseUp={() => {
              publishTaskAction("wizard_start", { taskId: props.taskId })
              props.onEdit?.()
            }}
          >
            <text fg={theme.background}>Edit</text>
          </box>
        </box>
      </box>
    </box>
  )
}

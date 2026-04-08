import { TextAttributes } from "@opentui/core"
import { createSignal, createMemo, For, Show, onMount } from "solid-js"
import { useTheme } from "@tui/context/theme"
import { useDialog } from "./dialog"
import { useKeyboard } from "@opentui/solid"
import type { ProactiveTask, TaskStatus } from "@/kiloclaw/proactive/scheduler.store"
import { publishViewNavigation, publishTaskAction } from "@/kiloclaw/telemetry/scheduled-tasks.telemetry"

export type TaskListFilter = {
  status?: TaskStatus | "all"
  search?: string
}

const STATUS_COLORS: Record<TaskStatus | "all", { fg: string; label: string }> = {
  active: { fg: "green", label: "active" },
  paused: { fg: "yellow", label: "paused" },
  dlq: { fg: "red", label: "dlq" },
  completed: { fg: "blue", label: "completed" },
  failed: { fg: "red", label: "failed" },
  all: { fg: "white", label: "all" },
}

export function DialogTaskList(props: {
  onSelectTask?: (taskId: string, action: "show" | "edit" | "runs" | "dlq") => void
  onCreateNew?: () => void
  onClose?: () => void
}) {
  const dialog = useDialog()
  const { theme } = useTheme()

  const [filter, setFilter] = createSignal<TaskListFilter>({ status: "all", search: "" })
  const [selectedIndex, setSelectedIndex] = createSignal(0)

  // Load tasks from store
  const tasks = createMemo((): ProactiveTask[] => {
    try {
      const { ProactiveTaskStore } =
        require("@/kiloclaw/proactive/scheduler.store") as typeof import("@/kiloclaw/proactive/scheduler.store")
      const tenantId = process.env.KILOCLAW_TENANT_ID ?? "local"
      return ProactiveTaskStore.list(tenantId)
    } catch {
      return [] as ProactiveTask[]
    }
  })

  // Get last run outcome for a task
  function getLastRunOutcome(taskId: string): string {
    try {
      const { ProactiveTaskStore } = require("@/kiloclaw/proactive/scheduler.store")
      const runs = ProactiveTaskStore.getRuns(taskId, 1)
      if (runs.length > 0) {
        return runs[0].outcome
      }
    } catch {}
    return "-"
  }

  // Format next run time
  function formatNextRun(ts: number | null | undefined): string {
    if (!ts) return "Not scheduled"
    const date = new Date(ts)
    const now = new Date()
    const diff = date.getTime() - now.getTime()
    if (diff < 0) return "Overdue"
    if (diff < 60 * 60 * 1000) return `In ${Math.floor(diff / 60000)}m`
    if (diff < 24 * 60 * 60 * 1000) return `In ${Math.floor(diff / 3600000)}h`
    return date.toLocaleDateString()
  }

  // Filter tasks
  const filteredTasks = createMemo(() => {
    let result = tasks()
    const f = filter()

    if (f.status && f.status !== "all") {
      result = result.filter((t) => t.status === f.status)
    }

    if (f.search) {
      const search = f.search.toLowerCase()
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(search) ||
          t.id.toLowerCase().includes(search) ||
          t.scheduleCron?.toLowerCase().includes(search),
      )
    }

    return result
  })

  // Keyboard handling
  useKeyboard((evt) => {
    if (evt.name === "escape") {
      props.onClose?.()
      dialog.clear()
      return
    }
    if (evt.name === "arrow_up" || evt.name === "k") {
      setSelectedIndex((i) => Math.max(0, i - 1))
      return
    }
    if (evt.name === "arrow_down" || evt.name === "j") {
      setSelectedIndex((i) => Math.min(filteredTasks().length - 1, i + 1))
      return
    }
    if (evt.name === "return") {
      const task = filteredTasks()[selectedIndex()]
      if (task) {
        props.onSelectTask?.(task.id, "show")
      }
      return
    }
    if (evt.name === "n" && evt.ctrl) {
      props.onCreateNew?.()
      return
    }
  })

  // Telemetry - track list view on mount
  onMount(() => {
    publishViewNavigation("list")
  })

  const statusOptions: Array<TaskStatus | "all"> = ["all", "active", "paused", "dlq", "completed", "failed"]

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} flexGrow={1} flexShrink={0} overflow="hidden">
      {/* Header */}
      <box flexDirection="row" justifyContent="space-between" alignItems="center">
        <text attributes={TextAttributes.BOLD} fg={theme.primary}>
          Tasks
        </text>
        <text
          fg={theme.textMuted}
          onMouseUp={() => {
            props.onClose?.()
            dialog.clear()
          }}
        >
          esc close
        </text>
      </box>

      {/* Filter bar */}
      <box flexDirection="row" gap={2} alignItems="center">
        <text fg={theme.textMuted}>Filter:</text>
        <For each={statusOptions}>
          {(status) => (
            <box
              paddingLeft={1}
              paddingRight={1}
              backgroundColor={filter().status === status ? theme.primary : theme.backgroundElement}
              onMouseUp={() => {
                setFilter((f) => ({ ...f, status }))
                setSelectedIndex(0)
              }}
            >
              <text fg={filter().status === status ? theme.background : theme.textMuted}>
                {STATUS_COLORS[status].label}
              </text>
            </box>
          )}
        </For>
      </box>

      {/* Search input */}
      <input
        value={filter().search ?? ""}
        onInput={(val) => {
          setFilter((f) => ({ ...f, search: val }))
          setSelectedIndex(0)
        }}
        placeholder="Search by name, id, or schedule..."
        backgroundColor={theme.backgroundElement}
        textColor={theme.text}
      />

      {/* Task count */}
      <text fg={theme.textMuted}>
        {filteredTasks().length} task{filteredTasks().length !== 1 ? "s" : ""}
      </text>

      {/* Task list */}
      <scrollbox flexGrow={1} flexShrink={1}>
        <Show
          when={filteredTasks().length > 0}
          fallback={
            <box padding={2}>
              <text fg={theme.textMuted}>No tasks found. Press 'n' to create one.</text>
            </box>
          }
        >
          <For each={filteredTasks()}>
            {(task, index) => {
              const isSelected = () => index() === selectedIndex()
              const statusColor = STATUS_COLORS[task.status]?.fg ?? "white"

              return (
                <box
                  flexDirection="column"
                  gap={0}
                  paddingLeft={1}
                  paddingRight={1}
                  backgroundColor={isSelected() ? theme.backgroundElement : undefined}
                  onMouseUp={() => {
                    setSelectedIndex(index())
                    publishTaskAction("detail_view", { taskId: task.id })
                    props.onSelectTask?.(task.id, "show")
                  }}
                  onMouseMove={() => {
                    if (!isSelected()) setSelectedIndex(index())
                  }}
                >
                  <box flexDirection="row" gap={2} justifyContent="space-between">
                    <box flexDirection="row" gap={1} alignItems="center">
                      <text fg={theme.primary} attributes={TextAttributes.BOLD}>
                        {task.name}
                      </text>
                      <text fg={theme.textMuted}>-</text>
                      <text fg={theme.textMuted}>{task.id.slice(0, 12)}...</text>
                    </box>
                    <box flexDirection="row" gap={1}>
                      <text fg={theme.textMuted}>{formatNextRun(task.nextRunAt)}</text>
                      <text fg={statusColor as any}>[{task.status}]</text>
                    </box>
                  </box>
                  <box flexDirection="row" gap={2}>
                    <text fg={theme.textMuted}>{task.scheduleCron ?? "No schedule"}</text>
                    <text fg={theme.textMuted}>Last: {getLastRunOutcome(task.id)}</text>
                  </box>
                </box>
              )
            }}
          </For>
        </Show>
      </scrollbox>

      {/* Footer */}
      <box flexDirection="row" justifyContent="space-between" alignItems="center">
        <text fg={theme.textMuted}>↑↓ navigate • Enter select • n new • esc close</text>
        <box flexDirection="row" gap={1}>
          <box
            paddingLeft={1}
            paddingRight={1}
            backgroundColor={theme.primary}
            onMouseUp={() => {
              publishTaskAction("wizard_start")
              props.onCreateNew?.()
            }}
          >
            <text fg={theme.background}>+ New Task</text>
          </box>
        </box>
      </box>
    </box>
  )
}

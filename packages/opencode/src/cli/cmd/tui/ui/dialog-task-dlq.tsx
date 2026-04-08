import { TextAttributes } from "@opentui/core"
import { createMemo, createSignal, For, Show, onMount } from "solid-js"
import { useTheme } from "@tui/context/theme"
import { useDialog } from "./dialog"
import { useKeyboard } from "@opentui/solid"
import type { ProactiveDlqEntry } from "@/kiloclaw/proactive/scheduler.store"
import { publishViewNavigation, publishTaskAction } from "@/kiloclaw/telemetry/scheduled-tasks.telemetry"

export function DialogTaskDLQ(props: {
  taskId?: string
  onReplayEntry?: (entryId: string) => void
  onRemoveEntry?: (entryId: string) => void
  onClose?: () => void
}) {
  const dialog = useDialog()
  const { theme } = useTheme()

  const [selectedIndex, setSelectedIndex] = createSignal(0)
  const [readyOnly, setReadyOnly] = createSignal(true)

  // Load DLQ entries from store
  const entries = createMemo(() => {
    try {
      const { ProactiveTaskStore } = require("@/kiloclaw/proactive/scheduler.store")
      return ProactiveTaskStore.getDLQ(props.taskId, readyOnly())
    } catch {
      return [] as ProactiveDlqEntry[]
    }
  })

  // Group by task
  const groupedEntries = createMemo(() => {
    const grouped = new Map<string, ProactiveDlqEntry[]>()
    for (const entry of entries()) {
      const existing = grouped.get(entry.taskId) ?? []
      existing.push(entry)
      grouped.set(entry.taskId, existing)
    }
    return grouped
  })

  // Get task name for a task id
  function getTaskName(taskId: string): string {
    try {
      const { ProactiveTaskStore } = require("@/kiloclaw/proactive/scheduler.store")
      const task = ProactiveTaskStore.get(taskId)
      return task?.name ?? taskId
    } catch {
      return taskId
    }
  }

  // Format timestamp
  function formatTs(ts: number | null | undefined): string {
    if (!ts) return "-"
    return new Date(ts).toLocaleString()
  }

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
      setSelectedIndex((i) => Math.min(entries().length - 1, i + 1))
      return
    }
    if (evt.name === "r" && !evt.ctrl) {
      const entry = entries()[selectedIndex()]
      if (entry) {
        publishTaskAction("dlq_replay", { taskId: entry.taskId })
        props.onReplayEntry?.(entry.id)
      }
      return
    }
    if (evt.name === "d" && !evt.ctrl) {
      const entry = entries()[selectedIndex()]
      if (entry) {
        publishTaskAction("dlq_remove", { taskId: entry.taskId })
        props.onRemoveEntry?.(entry.id)
      }
      return
    }
  })

  // Telemetry - track dlq view on mount
  onMount(() => {
    publishViewNavigation("dlq", props.taskId)
  })

  const selectedEntry = () => entries()[selectedIndex()]

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} flexGrow={1} flexShrink={0} overflow="hidden">
      {/* Header */}
      <box flexDirection="row" justifyContent="space-between" alignItems="center">
        <box flexDirection="column" gap={0}>
          <text attributes={TextAttributes.BOLD} fg={theme.error}>
            Dead Letter Queue
          </text>
          <text fg={theme.textMuted}>
            {entries().length} entr{entries().length !== 1 ? "ies" : "y"}
          </text>
        </box>
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
        <text fg={theme.textMuted}>Show:</text>
        <box
          paddingLeft={1}
          paddingRight={1}
          backgroundColor={readyOnly() ? theme.primary : theme.backgroundElement}
          onMouseUp={() => setReadyOnly(true)}
        >
          <text fg={readyOnly() ? theme.background : theme.textMuted}>Ready to retry</text>
        </box>
        <box
          paddingLeft={1}
          paddingRight={1}
          backgroundColor={!readyOnly() ? theme.primary : theme.backgroundElement}
          onMouseUp={() => setReadyOnly(false)}
        >
          <text fg={!readyOnly() ? theme.background : theme.textMuted}>All</text>
        </box>
      </box>

      {/* DLQ entries grouped by task */}
      <scrollbox flexGrow={1} flexShrink={1}>
        <Show
          when={entries().length > 0}
          fallback={
            <box padding={2}>
              <text fg={theme.textMuted}>DLQ is empty</text>
            </box>
          }
        >
          <For each={[...groupedEntries()]}>
            {([taskId, taskEntries]) => (
              <box flexDirection="column" gap={0}>
                {/* Task header */}
                <box
                  flexDirection="row"
                  gap={1}
                  paddingTop={1}
                  paddingBottom={1}
                  backgroundColor={theme.backgroundElement}
                >
                  <text attributes={TextAttributes.BOLD} fg={theme.primary}>
                    {getTaskName(taskId)}
                  </text>
                  <text fg={theme.textMuted}>-</text>
                  <text fg={theme.textMuted}>
                    {taskEntries.length} entr{taskEntries.length !== 1 ? "ies" : "y"}
                  </text>
                </box>

                {/* Entries for this task */}
                <For each={taskEntries}>
                  {(entry, index) => {
                    const globalIndex = () => entries().indexOf(entry)
                    const isSelected = () => globalIndex() === selectedIndex()
                    const isReady = !entry.retryAt || entry.retryAt <= Date.now()

                    return (
                      <box
                        flexDirection="column"
                        gap={0}
                        paddingLeft={1}
                        paddingRight={1}
                        backgroundColor={isSelected() ? theme.backgroundElement : undefined}
                        onMouseUp={() => setSelectedIndex(globalIndex())}
                        onMouseMove={() => {
                          if (!isSelected()) setSelectedIndex(globalIndex())
                        }}
                      >
                        <box flexDirection="row" gap={2} justifyContent="space-between">
                          <box flexDirection="row" gap={1}>
                            <text fg={theme.textMuted}>{formatTs(entry.createdAt)}</text>
                            <Show when={!isReady}>
                              <text fg={theme.textMuted}>(retry at {formatTs(entry.retryAt)})</text>
                            </Show>
                          </box>
                          <Show when={isReady}>
                            <text fg={theme.primary}>[Ready]</text>
                          </Show>
                        </box>
                        <text fg={theme.error}>({entry.error.slice(0, 100)})</text>
                        <Show when={entry.payload}>
                          <text fg={theme.textMuted}>Payload: {JSON.stringify(entry.payload).slice(0, 50)}...</text>
                        </Show>
                      </box>
                    )
                  }}
                </For>
              </box>
            )}
          </For>
        </Show>
      </scrollbox>

      {/* Entry detail panel */}
      <Show when={selectedEntry()}>
        {(entry) => (
          <box
            flexDirection="column"
            gap={0}
            padding={1}
            backgroundColor={theme.backgroundElement}
            border={["left"]}
            borderColor={theme.error}
          >
            <text attributes={TextAttributes.BOLD} fg={theme.text}>
              Entry Details
            </text>
            <text fg={theme.textMuted}>ID: {entry().id}</text>
            <text fg={theme.textMuted}>Task: {getTaskName(entry().taskId)}</text>
            <text fg={theme.textMuted}>Created: {formatTs(entry().createdAt)}</text>
            <Show when={entry().runId}>
              <text fg={theme.textMuted}>Run: {entry().runId}</text>
            </Show>
            <Show when={entry().retryAt}>
              <text fg={theme.textMuted}>Retry at: {formatTs(entry().retryAt)}</text>
            </Show>
            <text attributes={TextAttributes.BOLD} fg={theme.error}>
              Error:
            </text>
            <text fg={theme.error}>{entry().error}</text>
          </box>
        )}
      </Show>

      {/* Footer */}
      <box flexDirection="row" justifyContent="space-between" alignItems="center">
        <text fg={theme.textMuted}>↑↓ navigate • r replay • d remove • esc close</text>
        <text fg={theme.textMuted}>
          {entries().length} DLQ entr{entries().length !== 1 ? "ies" : "y"}
        </text>
      </box>
    </box>
  )
}

import { TextAttributes } from "@opentui/core"
import { createMemo, createSignal, For, Show, onMount } from "solid-js"
import { useTheme } from "@tui/context/theme"
import { useDialog } from "./dialog"
import { useKeyboard } from "@opentui/solid"
import type { ProactiveTaskRun, RunOutcome } from "@/kiloclaw/proactive/scheduler.store"
import { publishViewNavigation } from "@/kiloclaw/telemetry/scheduled-tasks.telemetry"

const OUTCOME_CONFIG: Record<RunOutcome, { label: string; color: string; bg?: string }> = {
  success: { label: "Success", color: "green" },
  failed: { label: "Failed", color: "red" },
  blocked: { label: "Blocked", color: "yellow" },
  budget_exceeded: { label: "Budget Exceeded", color: "yellow" },
  policy_denied: { label: "Policy Denied", color: "red" },
}

export function DialogTaskRuns(props: { taskId: string; taskName?: string; onClose?: () => void }) {
  const dialog = useDialog()
  const { theme } = useTheme()

  const [filter, setFilter] = createSignal<RunOutcome | "all">("all")
  const [selectedIndex, setSelectedIndex] = createSignal(0)
  const [limit, setLimit] = createSignal(20)

  // Load runs from store
  const runs = createMemo((): ProactiveTaskRun[] => {
    try {
      const { ProactiveTaskStore } =
        require("@/kiloclaw/proactive/scheduler.store") as typeof import("@/kiloclaw/proactive/scheduler.store")
      return ProactiveTaskStore.getRuns(props.taskId, limit())
    } catch {
      return [] as ProactiveTaskRun[]
    }
  })

  // Filter runs
  const filteredRuns = createMemo(() => {
    const f = filter()
    if (f === "all") return runs()
    return runs().filter((r) => r.outcome === f)
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
      return
    }
    if (evt.name === "arrow_up" || evt.name === "k") {
      setSelectedIndex((i) => Math.max(0, i - 1))
      return
    }
    if (evt.name === "arrow_down" || evt.name === "j") {
      setSelectedIndex((i) => Math.min(filteredRuns().length - 1, i + 1))
      return
    }
    if (evt.name === "l" && evt.ctrl) {
      setLimit((l) => Math.min(100, l + 10))
      return
    }
  })

  // Telemetry - track runs view on mount
  onMount(() => {
    publishViewNavigation("runs", props.taskId)
  })

  const filterOptions: Array<RunOutcome | "all"> = [
    "all",
    "success",
    "failed",
    "blocked",
    "policy_denied",
    "budget_exceeded",
  ]

  const selectedRun = () => filteredRuns()[selectedIndex()]

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} flexGrow={1} flexShrink={0} overflow="hidden">
      {/* Header */}
      <box flexDirection="row" justifyContent="space-between" alignItems="center">
        <box flexDirection="column" gap={0}>
          <text attributes={TextAttributes.BOLD} fg={theme.primary}>
            Runs: {props.taskName ?? props.taskId}
          </text>
          <text fg={theme.textMuted}>
            {filteredRuns().length} run{filteredRuns().length !== 1 ? "s" : ""} shown
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
        <text fg={theme.textMuted}>Filter:</text>
        <For each={filterOptions}>
          {(f) => (
            <box
              paddingLeft={1}
              paddingRight={1}
              backgroundColor={filter() === f ? theme.primary : theme.backgroundElement}
              onMouseUp={() => {
                setFilter(f)
                setSelectedIndex(0)
              }}
            >
              <text fg={filter() === f ? theme.background : theme.textMuted}>
                {f === "all" ? "all" : (OUTCOME_CONFIG[f]?.label ?? f)}
              </text>
            </box>
          )}
        </For>
      </box>

      {/* Runs table */}
      <scrollbox flexGrow={1} flexShrink={1}>
        <Show
          when={filteredRuns().length > 0}
          fallback={
            <box padding={2}>
              <text fg={theme.textMuted}>No runs found</text>
            </box>
          }
        >
          <For each={filteredRuns()}>
            {(run, index) => {
              const isSelected = () => index() === selectedIndex()
              const outcome = OUTCOME_CONFIG[run.outcome] ?? { label: run.outcome, color: "white" }

              return (
                <box
                  flexDirection="column"
                  gap={0}
                  paddingLeft={1}
                  paddingRight={1}
                  backgroundColor={isSelected() ? theme.backgroundElement : undefined}
                  onMouseUp={() => setSelectedIndex(index())}
                  onMouseMove={() => {
                    if (!isSelected()) setSelectedIndex(index())
                  }}
                >
                  <box flexDirection="row" gap={2} justifyContent="space-between">
                    <box flexDirection="row" gap={1}>
                      <text fg={theme.textMuted}>{formatTs(run.startedAt)}</text>
                      <Show when={run.attempt && run.attempt > 1}>
                        <text fg={theme.textMuted}>(attempt {run.attempt})</text>
                      </Show>
                    </box>
                    <box flexDirection="row" gap={1}>
                      <text fg={outcome.color as any}>[{outcome.label}]</text>
                      <text fg={theme.textMuted}>{formatDuration(run.durationMs)}</text>
                    </box>
                  </box>
                  <Show when={run.errorMessage}>
                    <text fg={theme.error}>
                      ({run.errorCode ?? "ERR"}) {run.errorMessage}
                    </text>
                  </Show>
                  <Show when={run.correlationId}>
                    <text fg={theme.textMuted}>Correlation: {run.correlationId}</text>
                  </Show>
                </box>
              )
            }}
          </For>
        </Show>
      </scrollbox>

      {/* Run detail panel */}
      <Show when={selectedRun()}>
        {(run) => (
          <box
            flexDirection="column"
            gap={0}
            padding={1}
            backgroundColor={theme.backgroundElement}
            border={["left"]}
            borderColor={theme.primary}
          >
            <text attributes={TextAttributes.BOLD} fg={theme.text}>
              Run Details
            </text>
            <text fg={theme.textMuted}>ID: {run().id}</text>
            <text fg={theme.textMuted}>Started: {formatTs(run().startedAt)}</text>
            <text fg={theme.textMuted}>Finished: {formatTs(run().finishedAt)}</text>
            <Show when={run().scheduledFor}>
              <text fg={theme.textMuted}>Scheduled: {formatTs(run().scheduledFor!)}</text>
            </Show>
            <Show when={run().gateDecisions}>
              <text fg={theme.textMuted}>Gate decisions: {JSON.stringify(run().gateDecisions)}</text>
            </Show>
            <Show when={run().traceId}>
              <text fg={theme.textMuted}>Trace: {run().traceId}</text>
            </Show>
            <Show when={run().evidenceRefs && run().evidenceRefs!.length > 0}>
              <text fg={theme.textMuted}>Evidence: {run().evidenceRefs!.length} ref(s)</text>
            </Show>
          </box>
        )}
      </Show>

      {/* Footer */}
      <box flexDirection="row" justifyContent="space-between" alignItems="center">
        <text fg={theme.textMuted}>↑↓ navigate • Ctrl+L load more • esc close</text>
        <text fg={theme.textMuted}>
          Showing {filteredRuns().length} of {runs().length} runs
        </text>
      </box>
    </box>
  )
}

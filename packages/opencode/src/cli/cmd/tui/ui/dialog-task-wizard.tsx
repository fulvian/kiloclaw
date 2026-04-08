import { TextAttributes, TextareaRenderable } from "@opentui/core"
import { createSignal, createMemo, For, Show } from "solid-js"
import { useTheme } from "@tui/context/theme"
import { useDialog } from "./dialog"
import { useKeyboard } from "@opentui/solid"
import { useKeybind } from "@tui/context/keybind"
import { useKV } from "../context/kv"
import { useTaskWizardDraft, type TaskWizardDraft } from "../context/task-draft"
import {
  ScheduledTaskCreateSchema,
  validateSchedule,
  buildCreate,
  type ScheduledTaskCreateInput,
} from "@/kiloclaw/proactive/scheduled-task"
import { SchedulePreset, nextRuns, resolveSchedule, isValidTimezone } from "@/kiloclaw/proactive/schedule-parse"
import {
  publishWizardProgress,
  publishWizardStepTiming,
  publishTaskAction,
} from "@/kiloclaw/telemetry/scheduled-tasks.telemetry"

const PRESETS: Array<{ value: string; label: string; description: string }> = [
  { value: "hourly", label: "Hourly", description: "Every hour at :00" },
  { value: "daily-09:00", label: "Daily at 9am", description: "Once a day at 09:00" },
  { value: "weekdays-09:00", label: "Weekdays at 9am", description: "Monday to Friday at 09:00" },
  { value: "weekly-mon-09:00", label: "Weekly Monday", description: "Every Monday at 09:00" },
  { value: "monthly-1st-09:00", label: "Monthly on 1st", description: "First day of month at 09:00" },
]

const TIMEZONES = [
  "local",
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "America/Chicago",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Rome",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Australia/Sydney",
]

const RETRY_POLICIES = [
  { value: "fixed", label: "Fixed", description: "Same delay between retries" },
  { value: "exponential", label: "Exponential", description: "Delay doubles each retry" },
]

const CONCURRENCY_POLICIES = [
  { value: "allow", label: "Allow", description: "Multiple runs can overlap" },
  { value: "forbid", label: "Forbid", description: "Skip new run while one is active" },
  { value: "replace", label: "Replace", description: "Cancel running, start latest" },
]

const MISSED_RUN_POLICIES = [
  { value: "skip", label: "Skip", description: "Drop missed ticks" },
  { value: "catchup_one", label: "Catch-up One", description: "Run one catch-up then resume" },
  { value: "catchup_all", label: "Catch-up All", description: "Replay all missed ticks" },
]

const APPROVAL_POLICIES = [
  { value: "auto", label: "Auto", description: "System decides based on risk" },
  { value: "always", label: "Always", description: "Require approval for all actions" },
  { value: "never-low-risk", label: "Never (low-risk)", description: "Skip approval for low-risk actions" },
]

type WizardStep = "schedule" | "intent" | "reliability" | "policy" | "review"

const STEPS: WizardStep[] = ["schedule", "intent", "reliability", "policy", "review"]
const STEP_LABELS: Record<WizardStep, string> = {
  schedule: "1. Schedule",
  intent: "2. Intent",
  reliability: "3. Reliability",
  policy: "4. Policy",
  review: "5. Review",
}

export function DialogTaskWizard(props: { taskId?: string; onComplete?: () => void }) {
  const dialog = useDialog()
  const { theme } = useTheme()
  const keybind = useKeybind()
  const kv = useKV()
  const draftHelper = useTaskWizardDraft()

  const isEditing = () => !!props.taskId

  // Helper to parse store config into wizard data format
  function parseStoreConfigToWizardData(config: Record<string, unknown>): Partial<ScheduledTaskCreateInput> {
    const scheduleExpr = config.scheduleExpr as string | undefined
    const preset = config.preset as string | undefined
    const retry = config.retry as
      | { maxAttempts?: number; backoff?: string; baseMs?: number; maxMs?: number }
      | undefined
    const quietHours = config.quietHours as { start?: string; end?: string } | undefined

    // Extract preset from cron if not stored as preset
    let resolvedPreset = preset
    if (!resolvedPreset && scheduleExpr) {
      // Try to match known presets
      if (scheduleExpr === "0 * * * *") resolvedPreset = "hourly"
      else if (scheduleExpr === "0 9 * * *") resolvedPreset = "daily-09:00"
      else if (scheduleExpr === "0 9 * * 1-5") resolvedPreset = "weekdays-09:00"
      else if (scheduleExpr === "0 9 * * 1") resolvedPreset = "weekly-mon-09:00"
      else if (scheduleExpr === "0 9 1 * *") resolvedPreset = "monthly-1st-09:00"
    }

    return {
      name: config.name as string | undefined,
      prompt: config.prompt as string | undefined,
      preset: resolvedPreset,
      cron: !resolvedPreset ? scheduleExpr : undefined,
      timezone: config.timezone as string | undefined,
      retryMaxAttempts: retry?.maxAttempts,
      retryBackoff: retry?.backoff as any,
      retryBaseMs: retry?.baseMs,
      retryMaxMs: retry?.maxMs,
      concurrency: config.concurrency as any,
      missedRunPolicy: config.missedRunPolicy as any,
      startingDeadlineMs: config.startingDeadlineMs as number | undefined,
      requireApproval: config.requireApproval as any,
      quietHours: quietHours ? `${quietHours.start}-${quietHours.end}` : undefined,
      enabled: config.enabled as boolean | undefined,
    }
  }

  // Load existing draft or create new
  const existingDraft = isEditing() ? draftHelper.loadDraft("global", props.taskId) : draftHelper.loadDraft("global")

  // If editing without draft, load from store
  function getInitialDraft(): TaskWizardDraft {
    if (existingDraft) return existingDraft

    const newDraft = draftHelper.createNewDraft(props.taskId)

    if (isEditing() && props.taskId) {
      // Try to load task from store
      try {
        const { ProactiveTaskStore } = require("@/kiloclaw/proactive/scheduler.store")
        const existing = ProactiveTaskStore.get(props.taskId)
        if (existing) {
          const config = JSON.parse(existing.triggerConfig)
          return {
            ...newDraft,
            data: parseStoreConfigToWizardData(config),
          }
        }
      } catch {
        // Store not available, use empty draft
      }
    }

    return newDraft
  }

  const initialDraft = getInitialDraft()

  const [step, setStep] = createSignal<WizardStep>(initialDraft.step)
  const [data, setData] = createSignal<Partial<ScheduledTaskCreateInput>>(initialDraft.data)
  const [advanced, setAdvanced] = createSignal(false)
  const [error, setError] = createSignal<string | null>(null)
  const [isSaving, setIsSaving] = createSignal(false)

  // Track step timing for telemetry
  const [stepStartTime, setStepStartTime] = createSignal<number>(Date.now())

  // Emit wizard start telemetry
  publishWizardProgress(initialDraft.step, "start", props.taskId)

  // Schedule step state
  const [selectedPreset, setSelectedPreset] = createSignal<string>((data().preset as string) ?? "daily-09:00")
  const [customCron, setCustomCron] = createSignal<string>((data().cron as string) ?? "")
  const [timezone, setTimezone] = createSignal<string>((data().timezone as string) ?? "local")
  const [useCustomCron, setUseCustomCron] = createSignal(!!data().cron)

  // Intent step state
  const [name, setName] = createSignal<string>((data().name as string) ?? "")
  const [prompt, setPrompt] = createSignal<string>((data().prompt as string) ?? "")

  // Reliability step state
  const [retryAttempts, setRetryAttempts] = createSignal<number>(data().retryMaxAttempts ?? 3)
  const [retryBackoff, setRetryBackoff] = createSignal<string>(data().retryBackoff ?? "exponential")
  const [retryBaseMs, setRetryBaseMs] = createSignal<number>(data().retryBaseMs ?? 30_000)
  const [retryMaxMs, setRetryMaxMs] = createSignal<number>(data().retryMaxMs ?? 900_000)
  const [concurrency, setConcurrency] = createSignal<string>(data().concurrency ?? "forbid")
  const [missedRunPolicy, setMissedRunPolicy] = createSignal<string>(data().missedRunPolicy ?? "catchup_one")
  const [startingDeadlineMs, setStartingDeadlineMs] = createSignal<number>(data().startingDeadlineMs ?? 600_000)

  // Policy step state
  const [requireApproval, setRequireApproval] = createSignal<string>(data().requireApproval ?? "auto")
  const [quietHoursStart, setQuietHoursStart] = createSignal<string>("")
  const [quietHoursEnd, setQuietHoursEnd] = createSignal<string>("")

  // Computed next runs preview
  const nextRunsPreview = createMemo(() => {
    const tz = timezone() === "local" ? Intl.DateTimeFormat().resolvedOptions().timeZone : timezone()
    const cron = useCustomCron() ? customCron() : resolveSchedule({ preset: selectedPreset() as any }).expr
    const validation = validateSchedule({ cron, timezone: tz })
    if (!validation.ok) return []
    return (validation.nextRuns ?? []).map((ts) => new Date(ts).toISOString())
  })

  function updateData(updates: Partial<ScheduledTaskCreateInput>) {
    setData((prev) => ({ ...prev, ...updates }))
    saveDraft()
  }

  function saveDraft() {
    const draft: TaskWizardDraft = {
      step: step(),
      data: buildCurrentData(),
      taskId: props.taskId,
      createdAt: initialDraft.createdAt,
      updatedAt: Date.now(),
    }
    // Use taskId as draftId when editing, otherwise use global default
    draftHelper.saveDraft("global", draft, isEditing() ? props.taskId : undefined)
  }

  function buildCurrentData(): Partial<ScheduledTaskCreateInput> {
    const scheduleData = useCustomCron()
      ? { cron: customCron(), preset: undefined }
      : { preset: selectedPreset(), cron: undefined }

    const quietHours = quietHoursStart() && quietHoursEnd() ? `${quietHoursStart()}-${quietHoursEnd()}` : undefined

    return {
      ...scheduleData,
      timezone: timezone() === "local" ? undefined : timezone(),
      name: name(),
      prompt: prompt(),
      retryMaxAttempts: retryAttempts(),
      retryBackoff: retryBackoff() as any,
      retryBaseMs: retryBaseMs(),
      retryMaxMs: retryMaxMs(),
      concurrency: concurrency() as any,
      missedRunPolicy: missedRunPolicy() as any,
      startingDeadlineMs: startingDeadlineMs(),
      requireApproval: requireApproval() as any,
      quietHours,
      enabled: true,
    }
  }

  function validateStep(s: WizardStep): string | null {
    switch (s) {
      case "schedule": {
        if (useCustomCron()) {
          const validation = validateSchedule({ cron: customCron() })
          if (!validation.ok) return validation.error ?? "Invalid cron expression"
        }
        const tz = timezone() === "local" ? undefined : timezone()
        if (tz && !isValidTimezone(tz)) return "Invalid timezone"
        return null
      }
      case "intent": {
        if (!name().trim()) return "Name is required"
        if (!prompt().trim()) return "Prompt is required"
        return null
      }
      case "reliability":
        return null
      case "policy":
        return null
      case "review": {
        const currentData = buildCurrentData()
        const parsed = ScheduledTaskCreateSchema.safeParse(currentData)
        if (!parsed.success) {
          return parsed.error.issues[0]?.message ?? "Validation failed"
        }
        return null
      }
      default:
        return null
    }
  }

  function nextStep() {
    const validationError = validateStep(step())
    if (validationError) {
      setError(validationError)
      return
    }
    setError(null)

    const currentIndex = STEPS.indexOf(step())

    // Track timing for current step
    const duration = Date.now() - stepStartTime()
    publishWizardStepTiming(step(), duration, props.taskId)

    if (currentIndex < STEPS.length - 1) {
      // Publish step completion
      publishWizardProgress(step(), "complete", props.taskId)
      const nextStepVal = STEPS[currentIndex + 1]
      setStep(nextStepVal)
      setStepStartTime(Date.now())
      // Publish next step start
      publishWizardProgress(nextStepVal, "start", props.taskId)
      saveDraft()
    }
  }

  function prevStep() {
    const currentIndex = STEPS.indexOf(step())
    if (currentIndex > 0) {
      // Track timing for current step
      const duration = Date.now() - stepStartTime()
      publishWizardStepTiming(step(), duration, props.taskId)
      const prevStepVal = STEPS[currentIndex - 1]
      setStep(prevStepVal)
      setStepStartTime(Date.now())
    }
  }

  async function handleSave() {
    const validationError = validateStep(step())
    if (validationError) {
      setError(validationError)
      return
    }

    const currentData = buildCurrentData()
    const parsed = ScheduledTaskCreateSchema.safeParse(currentData)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Validation failed")
      publishTaskAction("wizard_error", { error: parsed.error.issues[0]?.message })
      return
    }

    // Track final step timing
    const duration = Date.now() - stepStartTime()
    publishWizardStepTiming(step(), duration, props.taskId)

    setIsSaving(true)
    const startTime = Date.now()
    let savedTaskId: string | undefined = props.taskId
    try {
      const { ProactiveTaskStore } = await import("@/kiloclaw/proactive/scheduler.store")
      const { buildCreate, buildUpdate } = await import("@/kiloclaw/proactive/scheduled-task")

      const tenantId = process.env.KILOCLAW_TENANT_ID ?? "local"

      if (isEditing() && props.taskId) {
        // Update existing task
        const existing = ProactiveTaskStore.get(props.taskId)
        if (!existing) {
          setError("Task not found")
          return
        }
        const currentConfig = JSON.parse(existing.triggerConfig)
        const out = buildUpdate({
          currentConfig,
          currentCron: existing.scheduleCron ?? null,
          patch: parsed.data as any, // buildUpdate accepts partial input
        })
        ProactiveTaskStore.update(props.taskId, {
          name: out.name,
          triggerConfig: out.triggerConfig,
          scheduleCron: out.scheduleCron,
          nextRunAt: out.nextRunAt,
          status: out.status,
        })
        savedTaskId = props.taskId
        draftHelper.deleteDraft("global", props.taskId)
        publishTaskAction("task_update", { taskId: savedTaskId, success: true, durationMs: Date.now() - startTime })
      } else {
        // Create new task
        const out = buildCreate(parsed.data, tenantId)
        ProactiveTaskStore.create(out.task)
        ProactiveTaskStore.update(out.task.id, { status: parsed.data.enabled ? "active" : "paused" })
        savedTaskId = out.task.id
        draftHelper.deleteDraft("global")
        publishTaskAction("task_create", { taskId: savedTaskId, success: true, durationMs: Date.now() - startTime })
      }

      // Publish wizard completion
      publishWizardProgress("review", "complete", savedTaskId)
      publishTaskAction("wizard_complete", { taskId: savedTaskId, success: true, durationMs: Date.now() - startTime })

      // Show success and close
      dialog.clear()
      props.onComplete?.()
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to save task"
      setError(errorMsg)
      publishTaskAction("wizard_error", { taskId: savedTaskId, error: errorMsg })
    } finally {
      setIsSaving(false)
    }
  }

  function handleCancel() {
    // Track timing for current step
    const duration = Date.now() - stepStartTime()
    publishWizardStepTiming(step(), duration, props.taskId)
    publishWizardProgress(step(), "cancel", props.taskId)
    publishTaskAction("wizard_cancel", { taskId: props.taskId })
    saveDraft()
    dialog.clear()
  }

  // Keyboard handling
  useKeyboard((evt) => {
    if (evt.name === "escape") {
      handleCancel()
    }
    if (evt.name === "arrow_left" && evt.ctrl) {
      prevStep()
      return
    }
    if (evt.name === "arrow_right" && evt.ctrl) {
      if (step() === "review") {
        handleSave()
      } else {
        nextStep()
      }
      return
    }
    const allowPlainEnter = step() !== "intent"
    if (evt.name === "return" && (evt.ctrl || allowPlainEnter)) {
      if (step() === "review") {
        handleSave()
      } else {
        nextStep()
      }
    }
  })

  return (
    <box paddingLeft={2} paddingRight={2} gap={1} flexGrow={1} flexShrink={0} overflow="hidden">
      {/* Header */}
      <box flexDirection="row" justifyContent="space-between" alignItems="center">
        <text attributes={TextAttributes.BOLD} fg={theme.primary}>
          {props.taskId ? "Edit Task" : "New Task"}
        </text>
        <text fg={theme.textMuted} onMouseUp={() => handleCancel()}>
          esc cancel
        </text>
      </box>

      {/* Step indicator */}
      <box flexDirection="row" gap={1}>
        <For each={STEPS}>
          {(s) => (
            <box
              paddingLeft={1}
              paddingRight={1}
              backgroundColor={step() === s ? theme.primary : theme.backgroundElement}
              onMouseUp={() => {
                // Allow moving to previous steps only
                if (STEPS.indexOf(s) <= STEPS.indexOf(step())) {
                  setStep(s)
                }
              }}
            >
              <text fg={step() === s ? theme.background : theme.textMuted}>{STEP_LABELS[s]}</text>
            </box>
          )}
        </For>
      </box>

      {/* Error display */}
      <Show when={error()}>
        <box padding={1} backgroundColor={theme.error}>
          <text fg={theme.background}>{error()}</text>
        </box>
      </Show>

      {/* Step content */}
      <scrollbox flexGrow={1} flexShrink={1}>
        <Show when={step() === "schedule"}>
          <ScheduleStep
            selectedPreset={selectedPreset}
            setSelectedPreset={setSelectedPreset}
            useCustomCron={useCustomCron}
            setUseCustomCron={setUseCustomCron}
            customCron={customCron}
            setCustomCron={setCustomCron}
            timezone={timezone}
            setTimezone={setTimezone}
            advanced={advanced()}
            setAdvanced={setAdvanced}
            nextRunsPreview={nextRunsPreview}
          />
        </Show>
        <Show when={step() === "intent"}>
          <IntentStep name={name} setName={setName} prompt={prompt} setPrompt={setPrompt} />
        </Show>
        <Show when={step() === "reliability"}>
          <ReliabilityStep
            retryAttempts={retryAttempts}
            setRetryAttempts={setRetryAttempts}
            retryBackoff={retryBackoff}
            setRetryBackoff={setRetryBackoff}
            retryBaseMs={retryBaseMs}
            setRetryBaseMs={setRetryBaseMs}
            retryMaxMs={retryMaxMs}
            setRetryMaxMs={setRetryMaxMs}
            concurrency={concurrency}
            setConcurrency={setConcurrency}
            missedRunPolicy={missedRunPolicy}
            setMissedRunPolicy={setMissedRunPolicy}
            startingDeadlineMs={startingDeadlineMs}
            setStartingDeadlineMs={setStartingDeadlineMs}
            advanced={advanced()}
          />
        </Show>
        <Show when={step() === "policy"}>
          <PolicyStep
            requireApproval={requireApproval}
            setRequireApproval={setRequireApproval}
            quietHoursStart={quietHoursStart}
            setQuietHoursStart={setQuietHoursStart}
            quietHoursEnd={quietHoursEnd}
            setQuietHoursEnd={setQuietHoursEnd}
          />
        </Show>
        <Show when={step() === "review"}>
          <ReviewStep
            data={buildCurrentData}
            timezone={timezone}
            nextRunsPreview={nextRunsPreview}
            retryAttempts={retryAttempts}
            retryBackoff={retryBackoff}
            concurrency={concurrency}
            requireApproval={requireApproval}
          />
        </Show>
      </scrollbox>

      {/* Footer with navigation */}
      <box flexDirection="row" justifyContent="space-between" alignItems="center" paddingTop={1}>
        <box flexDirection="row" gap={1}>
          <Show when={STEPS.indexOf(step()) > 0}>
            <box paddingLeft={2} paddingRight={2} backgroundColor={theme.backgroundElement} onMouseUp={prevStep}>
              <text fg={theme.text}>← Back</text>
            </box>
          </Show>
          <box
            paddingLeft={2}
            paddingRight={2}
            backgroundColor={theme.backgroundElement}
            onMouseUp={() => setAdvanced((a) => !a)}
          >
            <text fg={theme.textMuted}>{advanced() ? "Hide advanced" : "Show advanced"}</text>
          </box>
          <text fg={theme.textMuted}>Ctrl+← back</text>
          <text fg={theme.textMuted}>Ctrl+→ next</text>
        </box>
        <box flexDirection="row" gap={1}>
          <Show when={step() !== "intent" && step() !== "review"}>
            <text fg={theme.textMuted}>Enter next</text>
          </Show>
          <Show when={step() === "review"}>
            <text fg={theme.textMuted}>Enter save</text>
          </Show>
          <Show when={step() === "intent"}>
            <text fg={theme.textMuted}>Ctrl+Enter next</text>
          </Show>
          <Show when={step() !== "review"}>
            <box paddingLeft={3} paddingRight={3} backgroundColor={theme.primary} onMouseUp={nextStep}>
              <text fg={theme.background}>Next →</text>
            </box>
          </Show>
          <Show when={step() === "review"}>
            <box paddingLeft={3} paddingRight={3} backgroundColor={theme.primary} onMouseUp={handleSave}>
              <text fg={theme.background}>Save Task</text>
            </box>
          </Show>
        </box>
      </box>
    </box>
  )
}

// Schedule Step Component
function ScheduleStep(props: {
  selectedPreset: () => string
  setSelectedPreset: (v: string) => void
  useCustomCron: () => boolean
  setUseCustomCron: (v: boolean) => void
  customCron: () => string
  setCustomCron: (v: string) => void
  timezone: () => string
  setTimezone: (v: string) => void
  advanced: boolean
  setAdvanced: (v: boolean) => void
  nextRunsPreview: () => string[]
}) {
  const { theme } = useTheme()

  return (
    <box flexDirection="column" gap={1}>
      <text attributes={TextAttributes.BOLD} fg={theme.text}>
        Schedule
      </text>

      <box flexDirection="row" gap={2}>
        <box flexDirection="column" gap={0} flexGrow={1}>
          <text fg={theme.textMuted}>Preset</text>
          <For each={PRESETS}>
            {(preset) => (
              <box flexDirection="row" gap={1} onMouseUp={() => props.setSelectedPreset(preset.value)}>
                <text fg={props.selectedPreset() === preset.value ? theme.primary : theme.textMuted}>
                  {props.selectedPreset() === preset.value ? "●" : "○"}
                </text>
                <text fg={theme.text}>{preset.label}</text>
                <text fg={theme.textMuted}>- {preset.description}</text>
              </box>
            )}
          </For>
        </box>

        <box flexDirection="column" gap={1} flexGrow={1}>
          <text fg={theme.textMuted}>Timezone</text>
          <For each={TIMEZONES.slice(0, 8)}>
            {(tz) => (
              <box onMouseUp={() => props.setTimezone(tz)}>
                <text fg={props.timezone() === tz ? theme.primary : theme.textMuted}>
                  {tz === "local" ? "Local" : tz}
                </text>
              </box>
            )}
          </For>
        </box>
      </box>

      {/* Custom cron option */}
      <box flexDirection="row" gap={1} alignItems="center">
        <text
          fg={props.useCustomCron() ? theme.primary : theme.textMuted}
          onMouseUp={() => props.setUseCustomCron(!props.useCustomCron())}
        >
          {props.useCustomCron() ? "●" : "○"} Custom cron expression
        </text>
      </box>
      <Show when={props.useCustomCron()}>
        <input
          value={props.customCron()}
          onInput={(val) => props.setCustomCron(val)}
          placeholder="0 9 * * 1-5"
          backgroundColor={theme.backgroundElement}
          textColor={theme.text}
        />
      </Show>

      {/* Next runs preview */}
      <box flexDirection="column" gap={0}>
        <text attributes={TextAttributes.BOLD} fg={theme.textMuted}>
          Next runs preview:
        </text>
        <For each={props.nextRunsPreview()}>{(run) => <text fg={theme.text}>{run}</text>}</For>
        <Show when={props.nextRunsPreview().length === 0}>
          <text fg={theme.error}>Invalid schedule</text>
        </Show>
      </box>
    </box>
  )
}

// Intent Step Component
function IntentStep(props: {
  name: () => string
  setName: (v: string) => void
  prompt: () => string
  setPrompt: (v: string) => void
}) {
  const { theme } = useTheme()
  let textareaRef: TextareaRenderable | undefined

  return (
    <box flexDirection="column" gap={1}>
      <text attributes={TextAttributes.BOLD} fg={theme.text}>
        Intent
      </text>

      <text fg={theme.textMuted}>Task name</text>
      <input
        value={props.name()}
        onInput={(val) => props.setName(val)}
        placeholder="e.g., Daily repo summary"
        backgroundColor={theme.backgroundElement}
        textColor={theme.text}
      />

      <text fg={theme.textMuted}>Prompt payload</text>
      <textarea
        ref={(r) => {
          textareaRef = r
        }}
        initialValue={props.prompt()}
        onContentChange={() => {
          if (textareaRef) props.setPrompt(textareaRef.plainText)
        }}
        placeholder="What should this task do?"
        minHeight={4}
        backgroundColor={theme.backgroundElement}
        textColor={theme.text}
      />
    </box>
  )
}

// Reliability Step Component
function ReliabilityStep(props: {
  retryAttempts: () => number
  setRetryAttempts: (v: number) => void
  retryBackoff: () => string
  setRetryBackoff: (v: string) => void
  retryBaseMs: () => number
  setRetryBaseMs: (v: number) => void
  retryMaxMs: () => number
  setRetryMaxMs: (v: number) => void
  concurrency: () => string
  setConcurrency: (v: string) => void
  missedRunPolicy: () => string
  setMissedRunPolicy: (v: string) => void
  startingDeadlineMs: () => number
  setStartingDeadlineMs: (v: number) => void
  advanced: boolean
}) {
  const { theme } = useTheme()

  return (
    <box flexDirection="column" gap={1}>
      <text attributes={TextAttributes.BOLD} fg={theme.text}>
        Reliability
      </text>

      <box flexDirection="row" gap={2}>
        <box flexDirection="column" gap={1} flexGrow={1}>
          <text fg={theme.textMuted}>Retry attempts</text>
          <input
            value={String(props.retryAttempts())}
            onInput={(val) => props.setRetryAttempts(parseInt(val) || 3)}
            backgroundColor={theme.backgroundElement}
            textColor={theme.text}
          />

          <text fg={theme.textMuted}>Retry backoff</text>
          <For each={RETRY_POLICIES}>
            {(policy) => (
              <box flexDirection="row" gap={1} onMouseUp={() => props.setRetryBackoff(policy.value)}>
                <text fg={props.retryBackoff() === policy.value ? theme.primary : theme.textMuted}>
                  {props.retryBackoff() === policy.value ? "●" : "○"}
                </text>
                <text fg={theme.text}>{policy.label}</text>
                <text fg={theme.textMuted}>- {policy.description}</text>
              </box>
            )}
          </For>
        </box>

        <box flexDirection="column" gap={1} flexGrow={1}>
          <text fg={theme.textMuted}>Concurrency</text>
          <For each={CONCURRENCY_POLICIES}>
            {(policy) => (
              <box flexDirection="row" gap={1} onMouseUp={() => props.setConcurrency(policy.value)}>
                <text fg={props.concurrency() === policy.value ? theme.primary : theme.textMuted}>
                  {props.concurrency() === policy.value ? "●" : "○"}
                </text>
                <text fg={theme.text}>{policy.label}</text>
                <text fg={theme.textMuted}>- {policy.description}</text>
              </box>
            )}
          </For>

          <text fg={theme.textMuted}>Missed run policy</text>
          <For each={MISSED_RUN_POLICIES}>
            {(policy) => (
              <box flexDirection="row" gap={1} onMouseUp={() => props.setMissedRunPolicy(policy.value)}>
                <text fg={props.missedRunPolicy() === policy.value ? theme.primary : theme.textMuted}>
                  {props.missedRunPolicy() === policy.value ? "●" : "○"}
                </text>
                <text fg={theme.text}>{policy.label}</text>
                <text fg={theme.textMuted}>- {policy.description}</text>
              </box>
            )}
          </For>
        </box>
      </box>

      <Show when={props.advanced}>
        <box flexDirection="column" gap={1}>
          <text attributes={TextAttributes.BOLD} fg={theme.textMuted}>
            Advanced retry settings
          </text>
          <box flexDirection="row" gap={2}>
            <box flexDirection="column" gap={0}>
              <text fg={theme.textMuted}>Base delay (ms)</text>
              <input
                value={String(props.retryBaseMs())}
                onInput={(val) => props.setRetryBaseMs(parseInt(val) || 30000)}
                backgroundColor={theme.backgroundElement}
                textColor={theme.text}
              />
            </box>
            <box flexDirection="column" gap={0}>
              <text fg={theme.textMuted}>Max delay (ms)</text>
              <input
                value={String(props.retryMaxMs())}
                onInput={(val) => props.setRetryMaxMs(parseInt(val) || 900000)}
                backgroundColor={theme.backgroundElement}
                textColor={theme.text}
              />
            </box>
          </box>
        </box>
      </Show>
    </box>
  )
}

// Policy Step Component
function PolicyStep(props: {
  requireApproval: () => string
  setRequireApproval: (v: string) => void
  quietHoursStart: () => string
  setQuietHoursStart: (v: string) => void
  quietHoursEnd: () => string
  setQuietHoursEnd: (v: string) => void
}) {
  const { theme } = useTheme()

  return (
    <box flexDirection="column" gap={1}>
      <text attributes={TextAttributes.BOLD} fg={theme.text}>
        Policy
      </text>

      <text fg={theme.textMuted}>Approval mode</text>
      <For each={APPROVAL_POLICIES}>
        {(policy) => (
          <box flexDirection="row" gap={1} onMouseUp={() => props.setRequireApproval(policy.value)}>
            <text fg={props.requireApproval() === policy.value ? theme.primary : theme.textMuted}>
              {props.requireApproval() === policy.value ? "●" : "○"}
            </text>
            <text fg={theme.text}>{policy.label}</text>
            <text fg={theme.textMuted}>- {policy.description}</text>
          </box>
        )}
      </For>

      <text fg={theme.textMuted}>Quiet hours (optional)</text>
      <box flexDirection="row" gap={1} alignItems="center">
        <input
          value={props.quietHoursStart()}
          onInput={(val) => props.setQuietHoursStart(val)}
          placeholder="HH:MM"
          width={10}
          backgroundColor={theme.backgroundElement}
          textColor={theme.text}
        />
        <text fg={theme.textMuted}>to</text>
        <input
          value={props.quietHoursEnd()}
          onInput={(val) => props.setQuietHoursEnd(val)}
          placeholder="HH:MM"
          width={10}
          backgroundColor={theme.backgroundElement}
          textColor={theme.text}
        />
      </box>
    </box>
  )
}

// Review Step Component
function ReviewStep(props: {
  data: () => any
  timezone: () => string
  nextRunsPreview: () => string[]
  retryAttempts: () => number
  retryBackoff: () => string
  concurrency: () => string
  requireApproval: () => string
}) {
  const { theme } = useTheme()
  const d = () => props.data()

  const scheduleDescription = createMemo(() => {
    const data = d()
    if (data.cron) return `Custom cron: ${data.cron}`
    const presetLabels: Record<string, string> = {
      hourly: "Hourly",
      "daily-09:00": "Daily at 9am",
      "weekdays-09:00": "Weekdays at 9am",
      "weekly-mon-09:00": "Weekly Monday at 9am",
      "monthly-1st-09:00": "Monthly on 1st at 9am",
    }
    return presetLabels[data.preset ?? "daily-09:00"] ?? data.preset
  })

  return (
    <box flexDirection="column" gap={1}>
      <text attributes={TextAttributes.BOLD} fg={theme.text}>
        Review
      </text>

      <box flexDirection="column" gap={0} paddingTop={1}>
        <text attributes={TextAttributes.BOLD} fg={theme.primary}>
          {d().name || "(unnamed)"}
        </text>
        <text fg={theme.textMuted}></text>
      </box>

      <box flexDirection="column" gap={0}>
        <text attributes={TextAttributes.BOLD} fg={theme.textMuted}>
          Schedule
        </text>
        <text fg={theme.text}>
          {scheduleDescription()} - {props.timezone() === "local" ? "local timezone" : props.timezone()}
        </text>
        <For each={props.nextRunsPreview().slice(0, 2)}>{(run) => <text fg={theme.textMuted}>Next: {run}</text>}</For>
      </box>

      <box flexDirection="column" gap={0}>
        <text attributes={TextAttributes.BOLD} fg={theme.textMuted}>
          Retry
        </text>
        <text fg={theme.text}>
          {props.retryAttempts()} attempts, {props.retryBackoff()} backoff, concurrency: {props.concurrency()}
        </text>
      </box>

      <box flexDirection="column" gap={0}>
        <text attributes={TextAttributes.BOLD} fg={theme.textMuted}>
          Policy
        </text>
        <text fg={theme.text}>Approval: {props.requireApproval()}</text>
      </box>

      <box flexDirection="column" gap={0}>
        <text attributes={TextAttributes.BOLD} fg={theme.textMuted}>
          Prompt
        </text>
        <text fg={theme.text}>{d().prompt || "(no prompt)"}</text>
      </box>

      <box paddingTop={1}>
        <text fg={theme.textMuted}>Press Ctrl+Enter or click "Save Task" to create this scheduled task.</text>
      </box>
    </box>
  )
}

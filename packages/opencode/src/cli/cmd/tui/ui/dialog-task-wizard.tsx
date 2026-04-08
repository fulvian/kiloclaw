import { InputRenderable, TextAttributes, TextareaRenderable, Renderable } from "@opentui/core"
import { createSignal, createMemo, For, Show, batch, createEffect, onMount } from "solid-js"
import { useTheme } from "@tui/context/theme"
import { useDialog } from "./dialog"
import { useKeyboard, useRenderer } from "@opentui/solid"
import { useTaskWizardDraft, type TaskWizardDraft } from "../context/task-draft"
import {
  ScheduledTaskCreateSchema,
  validateSchedule,
  buildCreate,
  type ScheduledTaskCreateInput,
} from "@/kiloclaw/proactive/scheduled-task"
import {
  nextRuns,
  isValidTimezone,
  validateCron,
  scheduleToCron,
  isValidTime,
  parsePresetToCategory,
  categoryToPreset,
  type ScheduleCategory,
} from "@/kiloclaw/proactive/schedule-parse"
import {
  publishWizardProgress,
  publishWizardStepTiming,
  publishTaskAction,
} from "@/kiloclaw/telemetry/scheduled-tasks.telemetry"

// =============================================================================
// UI CONSTANTS
// =============================================================================

const SCHEDULE_CATEGORIES: Array<{ value: ScheduleCategory; label: string; description: string }> = [
  { value: "daily", label: "Daily", description: "Once a day at a specific time" },
  { value: "weekdays", label: "Weekdays", description: "Monday to Friday at a specific time" },
  { value: "weekly", label: "Weekly", description: "One day per week at a specific time" },
  { value: "monthly", label: "Monthly", description: "One day per month at a specific time" },
]

const WEEKDAYS = [
  { value: 0, label: "Sun" },
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
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

// Legacy preset labels for backward compatibility
const LEGACY_PRESET_LABELS: Record<string, string> = {
  hourly: "Hourly (every hour at :00)",
  "daily-09:00": "Daily at 9am",
  "weekdays-09:00": "Weekdays at 9am",
  "weekly-mon-09:00": "Weekly Monday at 9am",
  "monthly-1st-09:00": "Monthly on 1st at 9am",
}

// =============================================================================
// CONSTANTS
// =============================================================================

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

// =============================================================================
// DIALOG TASK WIZARD
// =============================================================================

export function DialogTaskWizard(props: { taskId?: string; onComplete?: () => void }) {
  const dialog = useDialog()
  const { theme } = useTheme()
  const renderer = useRenderer()
  const draftHelper = useTaskWizardDraft()

  let scheduleTimeInput: InputRenderable | undefined
  let scheduleCronInput: InputRenderable | undefined
  let intentNameInput: InputRenderable | undefined
  let intentPromptInput: InputRenderable | undefined
  let reliabilityRetryInput: InputRenderable | undefined
  let policyQuietStartInput: InputRenderable | undefined

  const isEditing = () => !!props.taskId

  // ---------------------------------------------------------------------------
  // Helper to parse store config into wizard data format
  // ---------------------------------------------------------------------------
  function parseStoreConfigToWizardData(config: Record<string, unknown>): Partial<ScheduledTaskCreateInput> {
    const scheduleExpr = config.scheduleExpr as string | undefined
    const preset = config.preset as string | undefined
    const retry = config.retry as
      | { maxAttempts?: number; backoff?: string; baseMs?: number; maxMs?: number }
      | undefined
    const quietHours = config.quietHours as { start?: string; end?: string } | undefined

    let resolvedPreset = preset
    if (!resolvedPreset && scheduleExpr) {
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

  // ---------------------------------------------------------------------------
  // Load existing draft or create new
  // ---------------------------------------------------------------------------
  // IMPORTANT: For NEW tasks (/tasks new), always start fresh - don't load old drafts
  // For EDITING existing tasks, load the draft or task from store

  function getInitialDraft(): TaskWizardDraft {
    // When creating a new task, always start fresh at "schedule" step
    if (!isEditing()) {
      return draftHelper.createNewDraft()
    }

    // For editing: try to load existing draft first
    const existingDraft = draftHelper.loadDraft("global", props.taskId)
    if (existingDraft) return existingDraft

    const newDraft = draftHelper.createNewDraft(props.taskId)

    // Try to load task from store
    if (props.taskId) {
      try {
        const { ProactiveTaskStore } = require("@/kiloclaw/proactive/scheduler.store")
        const existing = ProactiveTaskStore.get(props.taskId)
        if (existing) {
          const config = JSON.parse(existing.triggerConfig)
          return { ...newDraft, data: parseStoreConfigToWizardData(config) }
        }
      } catch {
        // Store not available, use empty draft
      }
    }

    return newDraft
  }

  const initialDraft = getInitialDraft()

  // ---------------------------------------------------------------------------
  // Core state
  // ---------------------------------------------------------------------------
  const [step, setStep] = createSignal<WizardStep>(initialDraft.step)
  const [data, setData] = createSignal<Partial<ScheduledTaskCreateInput>>(initialDraft.data)
  const [advanced, setAdvanced] = createSignal(false)
  const [fieldErrors, setFieldErrors] = createSignal<Record<string, string>>({})
  const [isSaving, setIsSaving] = createSignal(false)
  const [stepStartTime, setStepStartTime] = createSignal<number>(Date.now())

  // ---------------------------------------------------------------------------
  // Schedule step state - NEW STRUCTURED APPROACH
  // ---------------------------------------------------------------------------
  function getInitialScheduleState() {
    const d = initialDraft.data
    const parsed = d.preset ? parsePresetToCategory(d.preset) : null

    if (parsed) {
      return {
        category: parsed.category,
        time: parsed.time,
        weekday: parsed.weekday ?? 1,
        dayOfMonth: parsed.dayOfMonth ?? 1,
      }
    }

    return {
      category: "daily" as ScheduleCategory,
      time: "09:00",
      weekday: 1,
      dayOfMonth: 1,
    }
  }

  const [scheduleCategory, setScheduleCategory] = createSignal<ScheduleCategory>(getInitialScheduleState().category)
  const [scheduleTime, setScheduleTime] = createSignal<string>(getInitialScheduleState().time)
  const [scheduleWeekday, setScheduleWeekday] = createSignal<number>(getInitialScheduleState().weekday)
  const [scheduleDayOfMonth, setScheduleDayOfMonth] = createSignal<number>(getInitialScheduleState().dayOfMonth)
  const [timezone, setTimezone] = createSignal<string>((initialDraft.data.timezone as string) ?? "local")
  const [useCustomCron, setUseCustomCron] = createSignal(false)
  const [customCron, setCustomCron] = createSignal<string>((initialDraft.data.cron as string) ?? "")

  // ---------------------------------------------------------------------------
  // Intent step state
  // ---------------------------------------------------------------------------
  const [name, setName] = createSignal<string>((initialDraft.data.name as string) ?? "")
  const [prompt, setPrompt] = createSignal<string>((initialDraft.data.prompt as string) ?? "")

  // ---------------------------------------------------------------------------
  // Reliability step state
  // ---------------------------------------------------------------------------
  const [retryAttempts, setRetryAttempts] = createSignal<number>(initialDraft.data.retryMaxAttempts ?? 3)
  const [retryBackoff, setRetryBackoff] = createSignal<string>(initialDraft.data.retryBackoff ?? "exponential")
  const [retryBaseMs, setRetryBaseMs] = createSignal<number>(initialDraft.data.retryBaseMs ?? 30_000)
  const [retryMaxMs, setRetryMaxMs] = createSignal<number>(initialDraft.data.retryMaxMs ?? 900_000)
  const [concurrency, setConcurrency] = createSignal<string>(initialDraft.data.concurrency ?? "forbid")
  const [missedRunPolicy, setMissedRunPolicy] = createSignal<string>(initialDraft.data.missedRunPolicy ?? "catchup_one")
  const [startingDeadlineMs, setStartingDeadlineMs] = createSignal<number>(
    initialDraft.data.startingDeadlineMs ?? 600_000,
  )

  // ---------------------------------------------------------------------------
  // Policy step state
  // ---------------------------------------------------------------------------
  const [requireApproval, setRequireApproval] = createSignal<string>(initialDraft.data.requireApproval ?? "auto")
  const [quietHoursStart, setQuietHoursStart] = createSignal<string>("")
  const [quietHoursEnd, setQuietHoursEnd] = createSignal<string>("")

  // ---------------------------------------------------------------------------
  // Computed values
  // ---------------------------------------------------------------------------

  const structuredSchedule = createMemo(() => ({
    category: scheduleCategory(),
    time: scheduleTime(),
    weekday: scheduleWeekday(),
    dayOfMonth: scheduleDayOfMonth(),
  }))

  const computedCron = createMemo(() => {
    if (useCustomCron()) return customCron()
    return scheduleToCron(structuredSchedule())
  })

  const computedPreset = createMemo(() => {
    if (useCustomCron()) return undefined
    return categoryToPreset(structuredSchedule())
  })

  const nextRunsPreview = createMemo(() => {
    if (!useCustomCron() && !isValidTime(scheduleTime())) {
      return []
    }
    const tz = timezone() === "local" ? Intl.DateTimeFormat().resolvedOptions().timeZone : timezone()
    const validation = validateSchedule({ cron: computedCron(), timezone: tz })
    if (!validation.ok) return []
    return (validation.nextRuns ?? []).map((ts) => new Date(ts).toISOString())
  })

  const currentStepErrors = createMemo(() => {
    const errors = fieldErrors()
    const s = step()
    if (s === "schedule") {
      const errs: Record<string, string> = {}
      if (!useCustomCron() && !isValidTime(scheduleTime())) {
        errs.time = "Invalid time format (HH:MM)"
      }
      const tz = timezone()
      if (tz !== "local" && !isValidTimezone(tz)) {
        errs.timezone = "Invalid timezone"
      }
      return errs
    }
    if (s === "intent") {
      const errs: Record<string, string> = {}
      if (!name().trim()) errs.name = "Name is required"
      if (!prompt().trim()) errs.prompt = "Prompt is required"
      return errs
    }
    return {}
  })

  const canAdvance = createMemo(() => Object.keys(currentStepErrors()).length === 0)

  const stepHelperText = createMemo(() => {
    switch (step()) {
      case "schedule":
        return useCustomCron() ? "Enter cron expression manually" : "Select category, time, then Next"
      case "intent":
        return "Name + prompt required. Ctrl+W advances."
      case "reliability":
        return "Configure retry and concurrency"
      case "policy":
        return "Set approval requirements"
      case "review":
        return "Review and click Save to create"
      default:
        return ""
    }
  })

  const currentStepIndex = createMemo(() => STEPS.indexOf(step()) + 1)

  function getStepFocusTarget(): Renderable | undefined {
    if (step() === "schedule") {
      if (useCustomCron()) return scheduleCronInput
      return scheduleTimeInput
    }
    if (step() === "intent") return intentNameInput
    if (step() === "reliability") return reliabilityRetryInput
    if (step() === "policy") return policyQuietStartInput
    return undefined
  }

  function focusCurrentStepInput() {
    setTimeout(() => {
      const target = getStepFocusTarget()
      if (!target || target.isDestroyed) return
      target.focus()
    }, 1)
  }

  function isEditingTextField() {
    const focused = renderer.currentFocusedRenderable
    if (!focused) return false
    return focused instanceof InputRenderable || focused instanceof TextareaRenderable
  }

  function handleIntentTab() {
    const focused = renderer.currentFocusedRenderable
    if (focused === intentNameInput) {
      intentPromptInput?.focus()
      return
    }
    intentNameInput?.focus()
  }

  onMount(() => {
    focusCurrentStepInput()
  })

  createEffect(() => {
    step()
    useCustomCron()
    focusCurrentStepInput()
  })

  const mergedStepErrors = createMemo(() => ({
    ...fieldErrors(),
    ...currentStepErrors(),
  }))

  // ---------------------------------------------------------------------------
  // Data building
  // ---------------------------------------------------------------------------
  function saveDraft() {
    const draft: TaskWizardDraft = {
      step: step(),
      data: buildCurrentData(),
      taskId: props.taskId,
      createdAt: initialDraft.createdAt,
      updatedAt: Date.now(),
    }
    draftHelper.saveDraft("global", draft, isEditing() ? props.taskId : undefined)
  }

  function buildCurrentData(): Partial<ScheduledTaskCreateInput> {
    const quietHours = quietHoursStart() && quietHoursEnd() ? `${quietHoursStart()}-${quietHoursEnd()}` : undefined

    return {
      preset: computedPreset(),
      cron: useCustomCron() ? customCron() : undefined,
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

  // ---------------------------------------------------------------------------
  // Step validation
  // ---------------------------------------------------------------------------
  function validateStep(s: WizardStep): string | null {
    switch (s) {
      case "schedule": {
        if (useCustomCron()) {
          const result = validateCron(customCron())
          if (!result.ok) return result.error ?? "Invalid cron expression"
        }
        if (!useCustomCron() && !isValidTime(scheduleTime())) {
          return "Invalid time format"
        }
        const tz = timezone()
        if (tz !== "local" && !isValidTimezone(tz)) {
          return "Invalid timezone"
        }
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

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------
  function nextStep() {
    const validationError = validateStep(step())
    if (validationError) {
      setFieldErrors({ _form: validationError })
      publishTaskAction("wizard_error", { error: validationError })
      return
    }

    setFieldErrors({})

    const currentIndex = STEPS.indexOf(step())
    const duration = Date.now() - stepStartTime()
    publishWizardStepTiming(step(), duration, props.taskId)

    if (currentIndex < STEPS.length - 1) {
      publishWizardProgress(step(), "complete", props.taskId)
      const nextStepVal = STEPS[currentIndex + 1]
      batch(() => {
        setStep(nextStepVal)
        setStepStartTime(Date.now())
      })
      publishWizardProgress(nextStepVal, "start", props.taskId)
      saveDraft()
    }
  }

  function prevStep() {
    const currentIndex = STEPS.indexOf(step())
    if (currentIndex > 0) {
      const duration = Date.now() - stepStartTime()
      publishWizardStepTiming(step(), duration, props.taskId)
      const prevStepVal = STEPS[currentIndex - 1]
      batch(() => {
        setStep(prevStepVal)
        setStepStartTime(Date.now())
      })
      setFieldErrors({})
    }
  }

  // ---------------------------------------------------------------------------
  // Save handler
  // ---------------------------------------------------------------------------
  async function handleSave() {
    const validationError = validateStep(step())
    if (validationError) {
      setFieldErrors({ _form: validationError })
      publishTaskAction("wizard_error", { error: validationError })
      return
    }

    const currentData = buildCurrentData()
    const parsed = ScheduledTaskCreateSchema.safeParse(currentData)
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Validation failed"
      setFieldErrors({ _form: msg })
      publishTaskAction("wizard_error", { error: msg })
      return
    }

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
        const existing = ProactiveTaskStore.get(props.taskId)
        if (!existing) {
          setFieldErrors({ _form: "Task not found" })
          return
        }
        const currentConfig = JSON.parse(existing.triggerConfig)
        const out = buildUpdate({
          currentConfig,
          currentCron: existing.scheduleCron ?? null,
          patch: parsed.data as any,
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
        const out = buildCreate(parsed.data, tenantId)
        ProactiveTaskStore.create(out.task)
        ProactiveTaskStore.update(out.task.id, { status: parsed.data.enabled ? "active" : "paused" })
        savedTaskId = out.task.id
        draftHelper.deleteDraft("global")
        publishTaskAction("task_create", { taskId: savedTaskId, success: true, durationMs: Date.now() - startTime })
      }

      publishWizardProgress("review", "complete", savedTaskId)
      publishTaskAction("wizard_complete", { taskId: savedTaskId, success: true, durationMs: Date.now() - startTime })

      dialog.clear()
      props.onComplete?.()
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Failed to save task"
      setFieldErrors({ _form: errorMsg })
      publishTaskAction("wizard_error", { taskId: savedTaskId, error: errorMsg })
    } finally {
      setIsSaving(false)
    }
  }

  function handleCancel() {
    const duration = Date.now() - stepStartTime()
    publishWizardStepTiming(step(), duration, props.taskId)
    publishWizardProgress(step(), "cancel", props.taskId)
    publishTaskAction("wizard_cancel", { taskId: props.taskId })
    saveDraft()
    dialog.clear()
  }

  // ---------------------------------------------------------------------------
  // Keyboard handling
  // - Escape: always closes
  // - Ctrl+Arrow: navigate steps
  // - Plain Enter: advance on non-intent steps when valid
  // - Ctrl+W: always advance
  // ---------------------------------------------------------------------------
  useKeyboard((evt) => {
    // Escape always closes
    if (evt.name === "escape") {
      evt.preventDefault()
      evt.stopPropagation()
      handleCancel()
      return
    }

    if (evt.name === "tab" && step() === "intent") {
      evt.preventDefault()
      evt.stopPropagation()
      handleIntentTab()
      return
    }

    // Ctrl+Arrow navigation
    if (evt.name === "arrow_left" && evt.ctrl) {
      if (isEditingTextField()) return
      prevStep()
      return
    }
    if (evt.name === "arrow_right" && evt.ctrl) {
      if (isEditingTextField()) return
      if (step() === "review") {
        handleSave()
      } else {
        nextStep()
      }
      return
    }

    // Plain Enter - only advance if not on intent step and validation passes
    if (evt.name === "return" && !evt.ctrl) {
      if (step() === "intent") {
        const focused = renderer.currentFocusedRenderable
        if (focused === intentNameInput) {
          evt.preventDefault()
          evt.stopPropagation()
          intentPromptInput?.focus()
          return
        }
        if (focused === intentPromptInput && canAdvance()) {
          evt.preventDefault()
          evt.stopPropagation()
          nextStep()
          return
        }
      }

      if (isEditingTextField()) return
      if (step() !== "intent" && canAdvance()) {
        evt.preventDefault()
        if (step() === "review") {
          handleSave()
        } else {
          nextStep()
        }
      }
      return
    }

    // Ctrl+W - always advances
    if (evt.name === "w" && evt.ctrl) {
      evt.preventDefault()
      evt.stopPropagation()
      if (step() === "review") {
        handleSave()
      } else {
        nextStep()
      }
    }
  })

  // Emit wizard start telemetry
  publishWizardProgress(initialDraft.step, "start", props.taskId)

  // ---------------------------------------------------------------------------
  // RENDER
  // ---------------------------------------------------------------------------
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

      {/* Step indicator - IMPROVED: shows Step X of Y */}
      <box flexDirection="column" gap={0}>
        <box flexDirection="row" gap={1}>
          <text fg={theme.textMuted}>
            Step {currentStepIndex()} of {STEPS.length}:
          </text>
          <text fg={theme.primary} attributes={TextAttributes.BOLD}>
            {STEP_LABELS[step()]}
          </text>
        </box>
        <box flexDirection="row" gap={1} marginTop={0}>
          <For each={STEPS}>
            {(s) => (
              <box width={2} height={1} backgroundColor={step() === s ? theme.primary : theme.backgroundElement} />
            )}
          </For>
        </box>
      </box>

      {/* Form-level error display */}
      <Show when={fieldErrors()._form}>
        <box padding={1} backgroundColor={theme.error}>
          <text fg={theme.background}>{fieldErrors()._form}</text>
        </box>
      </Show>

      {/* Step content */}
      <scrollbox flexGrow={1} flexShrink={1}>
        <Show when={step() === "schedule"}>
          <ScheduleStep
            category={scheduleCategory}
            setCategory={setScheduleCategory}
            time={scheduleTime}
            setTime={setScheduleTime}
            weekday={scheduleWeekday}
            setWeekday={setScheduleWeekday}
            dayOfMonth={scheduleDayOfMonth}
            setDayOfMonth={setScheduleDayOfMonth}
            timezone={timezone}
            setTimezone={setTimezone}
            useCustomCron={useCustomCron}
            setUseCustomCron={setUseCustomCron}
            customCron={customCron}
            setCustomCron={setCustomCron}
            nextRunsPreview={nextRunsPreview}
            errors={mergedStepErrors()}
            setTimeRef={(r) => (scheduleTimeInput = r)}
            setCustomCronRef={(r) => (scheduleCronInput = r)}
          />
        </Show>
        <Show when={step() === "intent"}>
          <IntentStep
            name={name}
            setName={setName}
            prompt={prompt}
            setPrompt={setPrompt}
            errors={mergedStepErrors()}
            setNameRef={(r) => (intentNameInput = r)}
            setPromptRef={(r) => (intentPromptInput = r)}
          />
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
            setRetryAttemptsRef={(r) => (reliabilityRetryInput = r)}
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
            setQuietHoursStartRef={(r) => (policyQuietStartInput = r)}
          />
        </Show>
        <Show when={step() === "review"}>
          <ReviewStep
            data={buildCurrentData}
            computedCron={computedCron}
            computedPreset={computedPreset}
            timezone={timezone}
            nextRunsPreview={nextRunsPreview}
            retryAttempts={retryAttempts}
            retryBackoff={retryBackoff}
            concurrency={concurrency}
            requireApproval={requireApproval}
          />
        </Show>
      </scrollbox>

      {/* Helper text */}
      <box paddingTop={0}>
        <text fg={theme.textMuted} attributes={TextAttributes.ITALIC}>
          {stepHelperText()}
        </text>
      </box>

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
        </box>
        <box flexDirection="row" gap={1}>
          <Show when={step() !== "review"}>
            <box
              paddingLeft={3}
              paddingRight={3}
              backgroundColor={canAdvance() ? theme.primary : theme.backgroundElement}
              onMouseUp={() => canAdvance() && nextStep()}
            >
              <text fg={canAdvance() ? theme.background : theme.textMuted}>Next →</text>
            </box>
          </Show>
          <Show when={step() === "review"}>
            <box
              paddingLeft={3}
              paddingRight={3}
              backgroundColor={isSaving() ? theme.backgroundElement : theme.primary}
              onMouseUp={() => !isSaving() && handleSave()}
            >
              <text fg={isSaving() ? theme.textMuted : theme.background}>{isSaving() ? "Saving..." : "Save Task"}</text>
            </box>
          </Show>
        </box>
      </box>
    </box>
  )
}

// =============================================================================
// SCHEDULE STEP - REDESIGNED with category + configurable time
// =============================================================================
function ScheduleStep(props: {
  category: () => ScheduleCategory
  setCategory: (v: ScheduleCategory) => void
  time: () => string
  setTime: (v: string) => void
  weekday: () => number
  setWeekday: (v: number) => void
  dayOfMonth: () => number
  setDayOfMonth: (v: number) => void
  timezone: () => string
  setTimezone: (v: string) => void
  useCustomCron: () => boolean
  setUseCustomCron: (v: boolean) => void
  customCron: () => string
  setCustomCron: (v: string) => void
  nextRunsPreview: () => string[]
  errors: Record<string, string>
  setTimeRef: (r: InputRenderable) => void
  setCustomCronRef: (r: InputRenderable) => void
}) {
  const { theme } = useTheme()

  return (
    <box flexDirection="column" gap={2}>
      <text attributes={TextAttributes.BOLD} fg={theme.text}>
        Schedule
      </text>

      {/* Category selector */}
      <box flexDirection="column" gap={0}>
        <text fg={theme.textMuted}>Category</text>
        <For each={SCHEDULE_CATEGORIES}>
          {(cat) => (
            <box flexDirection="row" gap={1} onMouseUp={() => props.setCategory(cat.value)}>
              <text fg={props.category() === cat.value ? theme.primary : theme.textMuted}>
                {props.category() === cat.value ? "●" : "○"}
              </text>
              <text fg={theme.text}>{cat.label}</text>
              <text fg={theme.textMuted}>- {cat.description}</text>
            </box>
          )}
        </For>
      </box>

      {/* Time editor */}
      <Show when={!props.useCustomCron()}>
        <box flexDirection="column" gap={0}>
          <text fg={theme.textMuted}>Activation time (HH:MM)</text>
          <input
            value={props.time()}
            onInput={(val) => props.setTime(val)}
            ref={(r) => props.setTimeRef(r)}
            placeholder="09:00"
            width={10}
            backgroundColor={theme.backgroundElement}
            textColor={theme.text}
          />
          <Show when={props.errors.time}>
            <text fg={theme.error} attributes={TextAttributes.BOLD}>
              {props.errors.time}
            </text>
          </Show>
        </box>

        {/* Weekly: weekday selector */}
        <Show when={props.category() === "weekly"}>
          <box flexDirection="column" gap={0}>
            <text fg={theme.textMuted}>Day of week</text>
            <box flexDirection="row" gap={1}>
              <For each={WEEKDAYS}>
                {(day) => (
                  <box
                    paddingLeft={1}
                    paddingRight={1}
                    backgroundColor={props.weekday() === day.value ? theme.primary : theme.backgroundElement}
                    onMouseUp={() => props.setWeekday(day.value)}
                  >
                    <text fg={props.weekday() === day.value ? theme.background : theme.text}>{day.label}</text>
                  </box>
                )}
              </For>
            </box>
          </box>
        </Show>

        {/* Monthly: day of month selector */}
        <Show when={props.category() === "monthly"}>
          <box flexDirection="column" gap={0}>
            <text fg={theme.textMuted}>Day of month (1-31)</text>
            <input
              value={String(props.dayOfMonth())}
              onInput={(val) => {
                const n = parseInt(val) || 1
                props.setDayOfMonth(Math.min(31, Math.max(1, n)))
              }}
              width={5}
              backgroundColor={theme.backgroundElement}
              textColor={theme.text}
            />
          </box>
        </Show>
      </Show>

      {/* Timezone selector */}
      <box flexDirection="column" gap={0}>
        <text fg={theme.textMuted}>Timezone</text>
        <box flexDirection="row" gap={2}>
          <box flexDirection="column" gap={0}>
            <For each={TIMEZONES.slice(0, Math.ceil(TIMEZONES.length / 2))}>
              {(tz) => (
                <box onMouseUp={() => props.setTimezone(tz)}>
                  <text fg={props.timezone() === tz ? theme.primary : theme.textMuted}>
                    {tz === "local" ? "Local" : tz.split("/").pop()}
                  </text>
                </box>
              )}
            </For>
          </box>
          <box flexDirection="column" gap={0}>
            <For each={TIMEZONES.slice(Math.ceil(TIMEZONES.length / 2))}>
              {(tz) => (
                <box onMouseUp={() => props.setTimezone(tz)}>
                  <text fg={props.timezone() === tz ? theme.primary : theme.textMuted}>
                    {tz === "local" ? "Local" : tz.split("/").pop()}
                  </text>
                </box>
              )}
            </For>
          </box>
        </box>
        <Show when={props.errors.timezone}>
          <text fg={theme.error}>{props.errors.timezone}</text>
        </Show>
      </box>

      {/* Custom cron toggle */}
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
          ref={(r) => props.setCustomCronRef(r)}
          placeholder="0 9 * * 1-5"
          backgroundColor={theme.backgroundElement}
          textColor={theme.text}
        />
      </Show>

      {/* Next runs preview */}
      <box flexDirection="column" gap={0}>
        <text attributes={TextAttributes.BOLD} fg={theme.textMuted}>
          Next runs:
        </text>
        <For each={props.nextRunsPreview().slice(0, 3)}>
          {(run) => <text fg={theme.text}>{run.replace("T", " ").slice(0, 19)}</text>}
        </For>
        <Show when={props.nextRunsPreview().length === 0}>
          <text fg={theme.error}>Invalid schedule</text>
        </Show>
      </box>
    </box>
  )
}

// =============================================================================
// INTENT STEP - with field-level validation
// =============================================================================
function IntentStep(props: {
  name: () => string
  setName: (v: string) => void
  prompt: () => string
  setPrompt: (v: string) => void
  errors: Record<string, string>
  setNameRef: (r: InputRenderable) => void
  setPromptRef: (r: InputRenderable) => void
}) {
  const { theme } = useTheme()

  return (
    <box flexDirection="column" gap={2}>
      <text attributes={TextAttributes.BOLD} fg={theme.text}>
        Intent
      </text>

      <box flexDirection="column" gap={0}>
        <text fg={theme.textMuted}>Task name *</text>
        <input
          value={props.name()}
          onInput={(val) => props.setName(val)}
          ref={(r) => props.setNameRef(r)}
          placeholder="e.g., Daily repo summary"
          backgroundColor={theme.backgroundElement}
          textColor={theme.text}
        />
        <Show when={props.errors.name}>
          <text fg={theme.error}>{props.errors.name}</text>
        </Show>
      </box>

      <box flexDirection="column" gap={0}>
        <text fg={theme.textMuted}>Prompt payload *</text>
        <input
          ref={(r) => props.setPromptRef(r)}
          value={props.prompt()}
          onInput={(val) => props.setPrompt(val)}
          placeholder="What should this task do?"
          backgroundColor={theme.backgroundElement}
          textColor={theme.text}
        />
        <Show when={props.errors.prompt}>
          <text fg={theme.error}>{props.errors.prompt}</text>
        </Show>
      </box>
    </box>
  )
}

// =============================================================================
// RELIABILITY STEP
// =============================================================================
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
  setRetryAttemptsRef: (r: InputRenderable) => void
}) {
  const { theme } = useTheme()

  return (
    <box flexDirection="column" gap={2}>
      <text attributes={TextAttributes.BOLD} fg={theme.text}>
        Reliability
      </text>

      <box flexDirection="row" gap={2}>
        <box flexDirection="column" gap={1} flexGrow={1}>
          <text fg={theme.textMuted}>Retry attempts</text>
          <input
            value={String(props.retryAttempts())}
            onInput={(val) => props.setRetryAttempts(parseInt(val) || 3)}
            ref={(r) => props.setRetryAttemptsRef(r)}
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

// =============================================================================
// POLICY STEP
// =============================================================================
function PolicyStep(props: {
  requireApproval: () => string
  setRequireApproval: (v: string) => void
  quietHoursStart: () => string
  setQuietHoursStart: (v: string) => void
  quietHoursEnd: () => string
  setQuietHoursEnd: (v: string) => void
  setQuietHoursStartRef: (r: InputRenderable) => void
}) {
  const { theme } = useTheme()

  return (
    <box flexDirection="column" gap={2}>
      <text attributes={TextAttributes.BOLD} fg={theme.text}>
        Policy
      </text>

      <box flexDirection="column" gap={0}>
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
      </box>

      <box flexDirection="column" gap={0}>
        <text fg={theme.textMuted}>Quiet hours (optional)</text>
        <box flexDirection="row" gap={1} alignItems="center">
          <input
            value={props.quietHoursStart()}
            onInput={(val) => props.setQuietHoursStart(val)}
            ref={(r) => props.setQuietHoursStartRef(r)}
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
    </box>
  )
}

// =============================================================================
// REVIEW STEP
// =============================================================================
function ReviewStep(props: {
  data: () => any
  computedCron: () => string
  computedPreset: () => string | undefined
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
    if (props.computedPreset()) {
      return LEGACY_PRESET_LABELS[props.computedPreset()!] ?? props.computedPreset()
    }
    return `Custom: ${props.computedCron()}`
  })

  return (
    <box flexDirection="column" gap={2}>
      <text attributes={TextAttributes.BOLD} fg={theme.text}>
        Review
      </text>

      <box flexDirection="column" gap={0}>
        <text attributes={TextAttributes.BOLD} fg={theme.primary}>
          {d().name || "(unnamed)"}
        </text>
      </box>

      <box flexDirection="column" gap={0}>
        <text attributes={TextAttributes.BOLD} fg={theme.textMuted}>
          Schedule
        </text>
        <text fg={theme.text}>{scheduleDescription()}</text>
        <text fg={theme.textMuted}>
          {props.timezone() === "local" ? "Local timezone" : props.timezone()}
          {" | "}Cron: {props.computedCron()}
        </text>
        <For each={props.nextRunsPreview().slice(0, 2)}>
          {(run) => <text fg={theme.textMuted}>Next: {run.replace("T", " ").slice(0, 19)}</text>}
        </For>
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
        <text fg={theme.textMuted}>Press Ctrl+W or click "Save Task" to create this scheduled task.</text>
      </box>
    </box>
  )
}

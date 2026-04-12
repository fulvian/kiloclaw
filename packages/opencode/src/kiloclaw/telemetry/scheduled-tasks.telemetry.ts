/**
 * Scheduled Tasks UX Telemetry - Events for TUI interactions
 * Phase 5: Telemetry and Rollout Controls
 *
 * Emits events for:
 * - Wizard step completions
 * - View navigations
 * - Task CRUD actions
 * - Errors and fallbacks
 */

import { BusEvent } from "@/bus/bus-event"
import { Bus } from "@/bus"
import z from "zod"
import { Flag } from "@/flag/flag"

/**
 * Wizard step names
 */
export const WizardStep = z.enum(["schedule", "intent", "reliability", "policy", "review"])
export type WizardStep = z.infer<typeof WizardStep>

/**
 * Task action types
 */
export const TaskAction = z.enum([
  "wizard_start",
  "wizard_step",
  "wizard_complete",
  "wizard_cancel",
  "wizard_error",
  "list_view",
  "detail_view",
  "runs_view",
  "dlq_view",
  "task_create",
  "task_update",
  "task_delete",
  "task_pause",
  "task_resume",
  "task_run_now",
  "dlq_replay",
  "dlq_remove",
])
export type TaskAction = z.infer<typeof TaskAction>

/**
 * Wizard progress event
 */
export const WizardProgressEvent = BusEvent.define(
  "tasks.wizard.progress",
  z.object({
    step: WizardStep,
    action: z.enum(["start", "complete", "cancel"]),
    taskId: z.string().optional(),
    error: z.string().optional(),
  }),
)

/**
 * Wizard step timing event
 */
export const WizardStepTimingEvent = BusEvent.define(
  "tasks.wizard.step_timing",
  z.object({
    step: WizardStep,
    durationMs: z.number().int().nonnegative(),
    taskId: z.string().optional(),
  }),
)

/**
 * View navigation event
 */
export const ViewNavigationEvent = BusEvent.define(
  "tasks.view.navigation",
  z.object({
    view: z.enum(["list", "detail", "runs", "dlq", "wizard"]),
    taskId: z.string().optional(),
  }),
)

/**
 * Task action event (create, update, delete, etc.)
 */
export const TaskActionEvent = BusEvent.define(
  "tasks.action",
  z.object({
    action: TaskAction,
    taskId: z.string().optional(),
    success: z.boolean(),
    error: z.string().optional(),
    durationMs: z.number().int().nonnegative().optional(),
  }),
)

/**
 * Draft lifecycle event
 */
export const DraftLifecycleEvent = BusEvent.define(
  "tasks.draft.lifecycle",
  z.object({
    action: z.enum(["save", "load", "delete", "expire"]),
    draftId: z.string(),
    taskId: z.string().optional(),
  }),
)

/**
 * Schedule validation event
 */
export const ScheduleValidationEvent = BusEvent.define(
  "tasks.schedule.validation",
  z.object({
    preset: z.string().optional(),
    cron: z.string().optional(),
    valid: z.boolean(),
    error: z.string().optional(),
    nextRuns: z.number().int().nonnegative().optional(),
  }),
)

/**
 * Publish wizard progress event
 */
export function publishWizardProgress(
  step: WizardStep,
  action: "start" | "complete" | "cancel",
  taskId?: string,
  error?: string,
) {
  if (!Flag.KILOCLAW_SCHEDULED_TASKS_TELEMETRY) return
  Bus.publish(WizardProgressEvent, { step, action, taskId, error })
}

/**
 * Publish wizard step timing event
 */
export function publishWizardStepTiming(step: WizardStep, durationMs: number, taskId?: string) {
  if (!Flag.KILOCLAW_SCHEDULED_TASKS_TELEMETRY) return
  Bus.publish(WizardStepTimingEvent, { step, durationMs, taskId })
}

/**
 * Publish view navigation event
 */
export function publishViewNavigation(view: "list" | "detail" | "runs" | "dlq" | "wizard", taskId?: string) {
  if (!Flag.KILOCLAW_SCHEDULED_TASKS_TELEMETRY) return
  Bus.publish(ViewNavigationEvent, { view, taskId })
}

/**
 * Publish task action event
 */
export function publishTaskAction(
  action: TaskAction,
  options?: {
    taskId?: string
    success?: boolean
    error?: string
    durationMs?: number
  },
) {
  if (!Flag.KILOCLAW_SCHEDULED_TASKS_TELEMETRY) return
  Bus.publish(TaskActionEvent, {
    action,
    taskId: options?.taskId,
    success: options?.success ?? true,
    error: options?.error,
    durationMs: options?.durationMs,
  })
}

/**
 * Publish draft lifecycle event
 */
export function publishDraftLifecycle(action: "save" | "load" | "delete" | "expire", draftId: string, taskId?: string) {
  if (!Flag.KILOCLAW_SCHEDULED_TASKS_TELEMETRY) return
  Bus.publish(DraftLifecycleEvent, { action, draftId, taskId })
}

/**
 * Publish schedule validation event
 */
export function publishScheduleValidation(
  valid: boolean,
  options?: {
    preset?: string
    cron?: string
    error?: string
    nextRuns?: number
  },
) {
  if (!Flag.KILOCLAW_SCHEDULED_TASKS_TELEMETRY) return
  Bus.publish(ScheduleValidationEvent, {
    valid,
    preset: options?.preset,
    cron: options?.cron,
    error: options?.error,
    nextRuns: options?.nextRuns,
  })
}

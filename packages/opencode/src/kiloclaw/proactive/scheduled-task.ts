import z from "zod"
import {
  DEFAULT_PRESET,
  type SchedulePreset,
  isValidTimezone,
  nextRuns,
  resolveSchedule,
  validateCron,
} from "./schedule-parse"

export const DstPolicy = z.enum(["skip-duplicate", "run-twice"])
export type DstPolicy = z.infer<typeof DstPolicy>

export const RetryBackoff = z.enum(["fixed", "exponential"])
export type RetryBackoff = z.infer<typeof RetryBackoff>

export const ConcurrencyPolicy = z.enum(["allow", "forbid", "replace"])
export type ConcurrencyPolicy = z.infer<typeof ConcurrencyPolicy>

export const MissedRunPolicy = z.enum(["skip", "catchup_one", "catchup_all"])
export type MissedRunPolicy = z.infer<typeof MissedRunPolicy>

export const ApprovalPolicy = z.enum(["auto", "always", "never-low-risk"])
export type ApprovalPolicy = z.infer<typeof ApprovalPolicy>

export const QuietHours = z
  .object({
    start: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
    end: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  })
  .nullable()

export type QuietHours = z.infer<typeof QuietHours>

export const ScheduledTaskCreateSchema = z.object({
  name: z.string().min(1),
  prompt: z.string().min(1),
  preset: z.string().optional(),
  cron: z.string().optional(),
  timezone: z.string().optional(),
  dstPolicy: DstPolicy.default("skip-duplicate"),
  retryMaxAttempts: z.number().int().positive().default(3),
  retryBackoff: RetryBackoff.default("exponential"),
  retryBaseMs: z.number().int().positive().default(30_000),
  retryMaxMs: z.number().int().positive().default(900_000),
  retryJitter: z.number().min(0).max(0.5).default(0.2),
  concurrency: ConcurrencyPolicy.default("forbid"),
  startingDeadlineMs: z.number().int().positive().default(600_000),
  missedRunPolicy: MissedRunPolicy.default("catchup_one"),
  requireApproval: ApprovalPolicy.default("auto"),
  quietHours: z.string().optional(),
  enabled: z.boolean().default(true),
})

export type ScheduledTaskCreateInput = z.infer<typeof ScheduledTaskCreateSchema>

export const ScheduledTaskUpdateSchema = ScheduledTaskCreateSchema.partial().extend({
  name: z.string().min(1).optional(),
  prompt: z.string().min(1).optional(),
})

export type ScheduledTaskUpdateInput = z.infer<typeof ScheduledTaskUpdateSchema>

export function buildCreate(
  input: ScheduledTaskCreateInput,
  tenantId?: string,
): {
  task: {
    id: string
    tenantId: string
    name: string
    triggerConfig: string
    scheduleCron: string
    nextRunAt: number | null
    maxRetries: number
  }
  view: Record<string, unknown>
} {
  const id = `task_${crypto.randomUUID()}`
  const timezone = input.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  if (!isValidTimezone(timezone)) {
    throw new Error(`invalid timezone: ${timezone}`)
  }

  const preset = toPreset(input.preset)
  const schedule = resolveSchedule({ preset, cron: input.cron })
  const runList = nextRuns({ cron: schedule.expr, timezone, count: 2 })
  const quiet = parseQuietHours(input.quietHours)
  const cfg = {
    schema: "kiloclaw.scheduled.v1",
    prompt: input.prompt,
    mode: schedule.kind,
    preset: schedule.preset ?? null,
    scheduleExpr: schedule.expr,
    timezone,
    dstPolicy: input.dstPolicy,
    concurrency: input.concurrency,
    startingDeadlineMs: input.startingDeadlineMs,
    missedRunPolicy: input.missedRunPolicy,
    retry: {
      maxAttempts: input.retryMaxAttempts,
      backoff: input.retryBackoff,
      baseMs: input.retryBaseMs,
      maxMs: input.retryMaxMs,
      jitter: input.retryJitter,
    },
    requireApproval: input.requireApproval,
    quietHours: quiet,
    enabled: input.enabled,
    idempotencySalt: crypto.randomUUID(),
  }

  return {
    task: {
      id,
      tenantId: tenantId ?? "local",
      name: input.name,
      triggerConfig: JSON.stringify(cfg),
      scheduleCron: schedule.expr,
      nextRunAt: runList[0] ?? null,
      maxRetries: input.retryMaxAttempts,
    },
    view: {
      id,
      name: input.name,
      status: input.enabled ? "active" : "paused",
      schedule: schedule.expr,
      timezone,
      nextRuns: runList,
      runtime: {
        retryMaxAttempts: input.retryMaxAttempts,
        retryBackoff: input.retryBackoff,
        retryBaseMs: input.retryBaseMs,
        retryMaxMs: input.retryMaxMs,
        retryJitter: input.retryJitter,
        concurrency: input.concurrency,
        startingDeadlineMs: input.startingDeadlineMs,
        missedRunPolicy: input.missedRunPolicy,
      },
      policy: {
        requireApproval: input.requireApproval,
        quietHours: quiet,
      },
    },
  }
}

export function buildUpdate(input: {
  currentConfig: Record<string, unknown>
  currentCron: string | null
  patch: ScheduledTaskUpdateInput
}): {
  triggerConfig?: string
  scheduleCron?: string
  nextRunAt?: number | null
  name?: string
  status?: "active" | "paused"
} {
  const timezoneRaw = input.patch.timezone ?? (input.currentConfig.timezone as string | undefined)
  const timezone = timezoneRaw ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  if (!isValidTimezone(timezone)) {
    throw new Error(`invalid timezone: ${timezone}`)
  }

  const preset = toPreset(input.patch.preset)
  const schedule = resolveSchedule({ preset, cron: input.patch.cron ?? input.currentCron ?? undefined })
  const next = nextRuns({ cron: schedule.expr, timezone, count: 1 })[0] ?? null

  const cfg = {
    ...input.currentConfig,
    prompt: input.patch.prompt ?? input.currentConfig.prompt,
    mode: schedule.kind,
    preset: schedule.preset ?? null,
    scheduleExpr: schedule.expr,
    timezone,
    dstPolicy: input.patch.dstPolicy ?? input.currentConfig.dstPolicy,
    concurrency: input.patch.concurrency ?? input.currentConfig.concurrency,
    startingDeadlineMs: input.patch.startingDeadlineMs ?? input.currentConfig.startingDeadlineMs,
    missedRunPolicy: input.patch.missedRunPolicy ?? input.currentConfig.missedRunPolicy,
    retry: {
      maxAttempts: input.patch.retryMaxAttempts ?? nestedNumber(input.currentConfig, ["retry", "maxAttempts"], 3),
      backoff: input.patch.retryBackoff ?? nestedString(input.currentConfig, ["retry", "backoff"], "exponential"),
      baseMs: input.patch.retryBaseMs ?? nestedNumber(input.currentConfig, ["retry", "baseMs"], 30_000),
      maxMs: input.patch.retryMaxMs ?? nestedNumber(input.currentConfig, ["retry", "maxMs"], 900_000),
      jitter: input.patch.retryJitter ?? nestedNumber(input.currentConfig, ["retry", "jitter"], 0.2),
    },
    requireApproval: input.patch.requireApproval ?? input.currentConfig.requireApproval,
    quietHours: input.patch.quietHours ? parseQuietHours(input.patch.quietHours) : input.currentConfig.quietHours,
    enabled: input.patch.enabled ?? input.currentConfig.enabled,
  }

  const status = cfg.enabled === false ? "paused" : "active"

  return {
    name: input.patch.name,
    status,
    triggerConfig: JSON.stringify(cfg),
    scheduleCron: schedule.expr,
    nextRunAt: next,
  }
}

export function parseConfig(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    return parsed
  } catch {
    return {}
  }
}

export function validateSchedule(input: { cron?: string; preset?: string; timezone?: string }): {
  ok: boolean
  schedule?: string
  timezone?: string
  nextRuns?: number[]
  error?: string
} {
  const timezone = input.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  if (!isValidTimezone(timezone)) {
    return { ok: false, error: `invalid timezone: ${timezone}` }
  }

  const preset = toPreset(input.preset)
  const schedule = resolveSchedule({ preset, cron: input.cron })
  const valid = validateCron(schedule.expr)
  if (!valid.ok) {
    return { ok: false, error: valid.error }
  }

  return {
    ok: true,
    schedule: schedule.expr,
    timezone,
    nextRuns: nextRuns({ cron: schedule.expr, timezone, count: 2 }),
  }
}

function toPreset(input?: string): SchedulePreset | undefined {
  if (!input) return DEFAULT_PRESET
  const parsed = z
    .enum(["hourly", "daily-09:00", "weekdays-09:00", "weekly-mon-09:00", "monthly-1st-09:00"])
    .safeParse(input)
  if (parsed.success) return parsed.data
  throw new Error(`invalid preset: ${input}`)
}

function parseQuietHours(input?: string): QuietHours {
  if (!input) return null
  const parts = input.split("-")
  if (parts.length !== 2) {
    throw new Error("quiet-hours must be in HH:MM-HH:MM format")
  }
  const out = { start: parts[0] ?? "", end: parts[1] ?? "" }
  const parsed = QuietHours.safeParse(out)
  if (parsed.success) return parsed.data
  throw new Error("quiet-hours must be in HH:MM-HH:MM format")
}

function nestedNumber(obj: Record<string, unknown>, path: string[], fallback: number): number {
  const val = nested(obj, path)
  return typeof val === "number" ? val : fallback
}

function nestedString(obj: Record<string, unknown>, path: string[], fallback: string): string {
  const val = nested(obj, path)
  return typeof val === "string" ? val : fallback
}

function nested(obj: Record<string, unknown>, path: string[]): unknown {
  return path.reduce<unknown>((acc, key) => {
    if (!acc || typeof acc !== "object") return undefined
    return (acc as Record<string, unknown>)[key]
  }, obj)
}

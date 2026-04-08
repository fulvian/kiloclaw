import z from "zod"

export const SchedulePreset = z.enum([
  "hourly",
  "daily-09:00",
  "weekdays-09:00",
  "weekly-mon-09:00",
  "monthly-1st-09:00",
])

export type SchedulePreset = z.infer<typeof SchedulePreset>

export const ScheduleKind = z.enum(["preset", "cron"])
export type ScheduleKind = z.infer<typeof ScheduleKind>

export const ScheduleCategory = z.enum(["daily", "weekdays", "weekly", "monthly"])
export type ScheduleCategory = z.infer<typeof ScheduleCategory>

export const DEFAULT_PRESET: SchedulePreset = "daily-09:00"

const PRESET_CRON: Record<SchedulePreset, string> = {
  hourly: "0 * * * *",
  "daily-09:00": "0 9 * * *",
  "weekdays-09:00": "0 9 * * 1-5",
  "weekly-mon-09:00": "0 9 * * 1",
  "monthly-1st-09:00": "0 9 1 * *",
}

const WEEKDAY_MAP: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
}

// =============================================================================
// SCHEDULE CATEGORY DTO - Structured schedule representation
// =============================================================================

export interface ScheduleDTO {
  category: ScheduleCategory
  time: string // HH:mm format
  weekday?: number // 0-6 for weekly
  dayOfMonth?: number // 1-31 for monthly
}

/**
 * Maps a structured schedule DTO to a cron expression
 */
export function scheduleToCron(input: ScheduleDTO): string {
  const [hours, minutes] = input.time.split(":").map(Number)
  const timePart = `${minutes} ${hours}`

  switch (input.category) {
    case "daily":
      return `${timePart} * * *`
    case "weekdays":
      return `${timePart} * * 1-5`
    case "weekly": {
      const dow = input.weekday ?? 1 // Default to Monday
      return `${timePart} * * ${dow}`
    }
    case "monthly": {
      const dom = input.dayOfMonth ?? 1 // Default to 1st
      return `${timePart} ${dom} * *`
    }
    default:
      return `${timePart} * * *`
  }
}

/**
 * Validates a time string in HH:mm format
 */
export function isValidTime(time: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(time)) return false
  const [h, m] = time.split(":").map(Number)
  return h >= 0 && h <= 23 && m >= 0 && m <= 59
}

/**
 * Parses legacy preset IDs into structured schedule DTO
 */
export function parsePresetToCategory(preset: string): ScheduleDTO | null {
  // hourly - special case
  if (preset === "hourly") {
    return { category: "daily", time: "00:00" }
  }

  // Parse patterns like "daily-09:00", "weekdays-09:00", "weekly-mon-09:00", "monthly-1st-09:00"
  const dailyMatch = preset.match(/^daily-(\d{2}:\d{2})$/)
  if (dailyMatch) {
    return { category: "daily", time: dailyMatch[1]! }
  }

  const weekdaysMatch = preset.match(/^weekdays-(\d{2}:\d{2})$/)
  if (weekdaysMatch) {
    return { category: "weekdays", time: weekdaysMatch[1]! }
  }

  const weeklyMatch = preset.match(/^weekly-(mon|tue|wed|thu|fri|sat|sun)-(\d{2}:\d{2})$/)
  if (weeklyMatch) {
    const dayMap: Record<string, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6, sun: 0 }
    return { category: "weekly", time: weeklyMatch[2]!, weekday: dayMap[weeklyMatch[1]!] }
  }

  const monthlyMatch = preset.match(/^monthly-(\d+)(?:st|nd|rd|th)-(\d{2}:\d{2})$/)
  if (monthlyMatch) {
    return { category: "monthly", time: monthlyMatch[2]!, dayOfMonth: parseInt(monthlyMatch[1]!) }
  }

  return null
}

/**
 * Builds a preset string from structured DTO for backward compatibility
 */
export function categoryToPreset(input: ScheduleDTO): string {
  switch (input.category) {
    case "daily":
      return `daily-${input.time}`
    case "weekdays":
      return `weekdays-${input.time}`
    case "weekly": {
      const dayMap = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"]
      return `weekly-${dayMap[input.weekday ?? 1]}-${input.time}`
    }
    case "monthly": {
      const dom = input.dayOfMonth ?? 1
      const suffix = dom === 1 ? "st" : dom === 2 ? "nd" : dom === 3 ? "rd" : "th"
      return `monthly-${dom}${suffix}-${input.time}`
    }
  }
}

export function presetToCron(preset: SchedulePreset): string {
  return PRESET_CRON[preset]
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(new Date())
    return true
  } catch {
    return false
  }
}

export function resolveSchedule(input: { preset?: SchedulePreset | null; cron?: string | null }): {
  kind: ScheduleKind
  expr: string
  preset?: SchedulePreset
} {
  const cron = input.cron?.trim()
  if (cron) {
    const valid = validateCron(cron)
    if (!valid.ok) {
      throw new Error(valid.error)
    }
    return { kind: "cron", expr: cron }
  }

  const preset = input.preset ?? DEFAULT_PRESET
  return {
    kind: "preset",
    expr: presetToCron(preset),
    preset,
  }
}

export function validateCron(expr: string): { ok: true } | { ok: false; error: string } {
  const src = expr.trim()
  const parts = src.split(/\s+/)
  if (parts.length !== 5) {
    return { ok: false, error: "cron must have exactly 5 fields: min hour day month weekday" }
  }

  const checks = [
    parseField(parts[0]!, 0, 59, "minute"),
    parseField(parts[1]!, 0, 23, "hour"),
    parseField(parts[2]!, 1, 31, "day-of-month"),
    parseField(parts[3]!, 1, 12, "month"),
    parseField(parts[4]!, 0, 7, "day-of-week", true),
  ]

  const invalid = checks.find((x) => x !== null)
  if (invalid) {
    return { ok: false, error: invalid }
  }

  return { ok: true }
}

export function nextRuns(input: { cron: string; timezone: string; count?: number; from?: number }): number[] {
  const count = input.count ?? 2
  const from = input.from ?? Date.now()
  const runs: number[] = []
  const parts = input.cron.trim().split(/\s+/)
  const minute = parts[0] ?? "*"
  const hour = parts[1] ?? "*"
  const dayOfMonth = parts[2] ?? "*"
  const month = parts[3] ?? "*"
  const dayOfWeek = parts[4] ?? "*"

  const minuteSet = fieldSet(minute, 0, 59)
  const hourSet = fieldSet(hour, 0, 23)
  const daySet = fieldSet(dayOfMonth, 1, 31)
  const monthSet = fieldSet(month, 1, 12)
  const weekSet = fieldSet(dayOfWeek, 0, 7, true)

  const step = 60_000
  const start = Math.floor(from / step) * step + step
  const max = start + 366 * 24 * 60 * step

  for (const _ of [0]) {
    for (let at = start; at <= max; at += step) {
      const pt = getTzParts(at, input.timezone)
      if (!monthSet.has(pt.month)) continue
      if (!hourSet.has(pt.hour)) continue
      if (!minuteSet.has(pt.minute)) continue

      const domOk = daySet.has(pt.day)
      const dowOk = weekSet.has(pt.weekday)
      const domWildcard = daySet.size === 31
      const dowWildcard = weekSet.size === 7

      const dayOk = domWildcard && dowWildcard ? true : domWildcard ? dowOk : dowWildcard ? domOk : domOk || dowOk
      if (!dayOk) continue

      runs.push(at)
      if (runs.length >= count) {
        return runs
      }
    }
  }

  return runs
}

function parseField(src: string, min: number, max: number, label: string, weekday = false): string | null {
  const items = src.split(",")
  const invalid = items.find((item) => parseItem(item.trim(), min, max, weekday) === false)
  if (invalid) {
    return `invalid ${label} field: ${src}`
  }
  return null
}

function parseItem(src: string, min: number, max: number, weekday: boolean): boolean {
  if (src === "*") return true

  const slash = src.split("/")
  if (slash.length === 2) {
    const base = slash[0]!
    const step = Number(slash[1])
    if (!Number.isInteger(step) || step <= 0) return false
    if (base !== "*" && !parseItem(base, min, max, weekday)) return false
    return true
  }

  const range = src.split("-")
  if (range.length === 2) {
    const start = toValue(range[0]!, weekday)
    const end = toValue(range[1]!, weekday)
    if (start == null || end == null) return false
    if (start < min || end > max || start > end) return false
    return true
  }

  const val = toValue(src, weekday)
  if (val == null) return false
  if (val < min || val > max) return false
  return true
}

function fieldSet(src: string, min: number, max: number, weekday = false): Set<number> {
  if (src === "*") {
    return new Set(Array.from({ length: max - min + 1 }).map((_, idx) => (min + idx) % (weekday ? 7 : 99_999)))
  }

  const set = new Set<number>()
  const items = src.split(",")
  for (const raw of items) {
    const item = raw.trim()
    if (!item) continue

    const slash = item.split("/")
    if (slash.length === 2) {
      const base = slash[0]!
      const step = Number(slash[1])
      const baseSet = base === "*" ? rangeSet(min, max, weekday) : fieldSet(base, min, max, weekday)
      const sorted = [...baseSet.values()].sort((a, b) => a - b)
      for (const [idx, val] of sorted.entries()) {
        if (idx % step === 0) set.add(weekday && val === 7 ? 0 : val)
      }
      continue
    }

    const range = item.split("-")
    if (range.length === 2) {
      const start = toValue(range[0]!, weekday)
      const end = toValue(range[1]!, weekday)
      if (start == null || end == null) continue
      for (let val = start; val <= end; val += 1) {
        set.add(weekday && val === 7 ? 0 : val)
      }
      continue
    }

    const val = toValue(item, weekday)
    if (val == null) continue
    set.add(weekday && val === 7 ? 0 : val)
  }

  return set
}

function rangeSet(min: number, max: number, weekday: boolean): Set<number> {
  const out = new Set<number>()
  for (let val = min; val <= max; val += 1) {
    out.add(weekday && val === 7 ? 0 : val)
  }
  return out
}

function toValue(src: string, weekday: boolean): number | null {
  const lower = src.toLowerCase()
  if (weekday && lower in WEEKDAY_MAP) {
    return WEEKDAY_MAP[lower]
  }
  const n = Number(lower)
  if (!Number.isInteger(n)) return null
  return n
}

function getTzParts(
  at: number,
  timezone: string,
): {
  minute: number
  hour: number
  day: number
  month: number
  weekday: number
} {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    minute: "2-digit",
    hour: "2-digit",
    day: "2-digit",
    month: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  })

  const parts = fmt.formatToParts(new Date(at))
  const byType = Object.fromEntries(parts.map((x) => [x.type, x.value]))
  const week = (byType.weekday ?? "sun").toLowerCase().slice(0, 3)

  return {
    minute: Number(byType.minute ?? "0"),
    hour: Number(byType.hour ?? "0"),
    day: Number(byType.day ?? "1"),
    month: Number(byType.month ?? "1"),
    weekday: WEEKDAY_MAP[week] ?? 0,
  }
}

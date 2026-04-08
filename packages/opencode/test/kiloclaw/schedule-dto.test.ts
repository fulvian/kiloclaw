import { describe, expect, it } from "bun:test"
import {
  scheduleToCron,
  isValidTime,
  parsePresetToCategory,
  categoryToPreset,
  validateCron,
  presetToCron,
} from "../../src/kiloclaw/proactive/schedule-parse"
import { buildCreate, validateSchedule } from "../../src/kiloclaw/proactive/scheduled-task"

describe("schedule category DTO", () => {
  describe("scheduleToCron", () => {
    it("maps daily schedule to cron", () => {
      expect(scheduleToCron({ category: "daily", time: "09:00" })).toBe("0 9 * * *")
      expect(scheduleToCron({ category: "daily", time: "14:30" })).toBe("30 14 * * *")
    })

    it("maps weekdays schedule to cron", () => {
      expect(scheduleToCron({ category: "weekdays", time: "09:00" })).toBe("0 9 * * 1-5")
      expect(scheduleToCron({ category: "weekdays", time: "17:00" })).toBe("0 17 * * 1-5")
    })

    it("maps weekly schedule to cron with weekday", () => {
      expect(scheduleToCron({ category: "weekly", time: "09:00", weekday: 1 })).toBe("0 9 * * 1")
      expect(scheduleToCron({ category: "weekly", time: "10:00", weekday: 0 })).toBe("0 10 * * 0")
      expect(scheduleToCron({ category: "weekly", time: "10:00", weekday: 6 })).toBe("0 10 * * 6")
    })

    it("maps monthly schedule to cron with day of month", () => {
      expect(scheduleToCron({ category: "monthly", time: "09:00", dayOfMonth: 1 })).toBe("0 9 1 * *")
      expect(scheduleToCron({ category: "monthly", time: "09:00", dayOfMonth: 15 })).toBe("0 9 15 * *")
      expect(scheduleToCron({ category: "monthly", time: "09:00", dayOfMonth: 31 })).toBe("0 9 31 * *")
    })

    it("uses defaults when optional fields missing", () => {
      expect(scheduleToCron({ category: "weekly", time: "09:00" })).toBe("0 9 * * 1")
      expect(scheduleToCron({ category: "monthly", time: "09:00" })).toBe("0 9 1 * *")
    })
  })

  describe("isValidTime", () => {
    it("accepts valid HH:mm times", () => {
      expect(isValidTime("00:00")).toBe(true)
      expect(isValidTime("09:00")).toBe(true)
      expect(isValidTime("23:59")).toBe(true)
      expect(isValidTime("12:30")).toBe(true)
    })

    it("rejects invalid time formats", () => {
      expect(isValidTime("")).toBe(false)
      expect(isValidTime("9:00")).toBe(false)
      expect(isValidTime("25:00")).toBe(false)
      expect(isValidTime("12:60")).toBe(false)
      expect(isValidTime("abc")).toBe(false)
      expect(isValidTime("12")).toBe(false)
    })
  })

  describe("parsePresetToCategory", () => {
    it("parses hourly preset", () => {
      const result = parsePresetToCategory("hourly")
      expect(result).toEqual({ category: "daily", time: "00:00" })
    })

    it("parses daily preset", () => {
      const result = parsePresetToCategory("daily-09:00")
      expect(result).toEqual({ category: "daily", time: "09:00" })
    })

    it("parses weekdays preset", () => {
      const result = parsePresetToCategory("weekdays-14:30")
      expect(result).toEqual({ category: "weekdays", time: "14:30" })
    })

    it("parses weekly preset with various days", () => {
      expect(parsePresetToCategory("weekly-mon-09:00")).toEqual({ category: "weekly", time: "09:00", weekday: 1 })
      expect(parsePresetToCategory("weekly-tue-10:00")).toEqual({ category: "weekly", time: "10:00", weekday: 2 })
      expect(parsePresetToCategory("weekly-sun-08:00")).toEqual({ category: "weekly", time: "08:00", weekday: 0 })
      expect(parsePresetToCategory("weekly-sat-12:00")).toEqual({ category: "weekly", time: "12:00", weekday: 6 })
    })

    it("parses monthly preset", () => {
      expect(parsePresetToCategory("monthly-1st-09:00")).toEqual({ category: "monthly", time: "09:00", dayOfMonth: 1 })
      expect(parsePresetToCategory("monthly-15th-10:00")).toEqual({
        category: "monthly",
        time: "10:00",
        dayOfMonth: 15,
      })
      expect(parsePresetToCategory("monthly-31st-08:00")).toEqual({
        category: "monthly",
        time: "08:00",
        dayOfMonth: 31,
      })
    })

    it("returns null for invalid presets", () => {
      expect(parsePresetToCategory("invalid")).toBeNull()
      expect(parsePresetToCategory("")).toBeNull()
      expect(parsePresetToCategory("daily")).toBeNull()
      expect(parsePresetToCategory("weekly-09:00")).toBeNull()
    })
  })

  describe("categoryToPreset", () => {
    it("builds daily preset", () => {
      expect(categoryToPreset({ category: "daily", time: "09:00" })).toBe("daily-09:00")
      expect(categoryToPreset({ category: "daily", time: "14:30" })).toBe("daily-14:30")
    })

    it("builds weekdays preset", () => {
      expect(categoryToPreset({ category: "weekdays", time: "09:00" })).toBe("weekdays-09:00")
    })

    it("builds weekly preset", () => {
      expect(categoryToPreset({ category: "weekly", time: "09:00", weekday: 1 })).toBe("weekly-mon-09:00")
      expect(categoryToPreset({ category: "weekly", time: "09:00", weekday: 0 })).toBe("weekly-sun-09:00")
      expect(categoryToPreset({ category: "weekly", time: "09:00", weekday: 6 })).toBe("weekly-sat-09:00")
    })

    it("builds monthly preset", () => {
      expect(categoryToPreset({ category: "monthly", time: "09:00", dayOfMonth: 1 })).toBe("monthly-1st-09:00")
      expect(categoryToPreset({ category: "monthly", time: "09:00", dayOfMonth: 2 })).toBe("monthly-2nd-09:00")
      expect(categoryToPreset({ category: "monthly", time: "09:00", dayOfMonth: 3 })).toBe("monthly-3rd-09:00")
      expect(categoryToPreset({ category: "monthly", time: "09:00", dayOfMonth: 15 })).toBe("monthly-15th-09:00")
    })

    it("uses defaults for weekly and monthly", () => {
      expect(categoryToPreset({ category: "weekly", time: "09:00" })).toBe("weekly-mon-09:00")
      expect(categoryToPreset({ category: "monthly", time: "09:00" })).toBe("monthly-1st-09:00")
    })
  })

  describe("round-trip compatibility", () => {
    it("preset -> category -> preset preserves value for most presets", () => {
      const presets = ["daily-09:00", "weekdays-14:30", "weekly-mon-09:00", "monthly-1st-09:00"]

      for (const preset of presets) {
        const category = parsePresetToCategory(preset)
        expect(category).not.toBeNull()
        const result = categoryToPreset(category!)
        expect(result).toBe(preset)
      }
    })

    it("hourly preset maps to daily-00:00 (special case)", () => {
      // hourly is stored as daily-00:00
      const category = parsePresetToCategory("hourly")
      expect(category).toEqual({ category: "daily", time: "00:00" })
      const result = categoryToPreset(category!)
      expect(result).toBe("daily-00:00")
    })
  })
})

describe("scheduled task schema", () => {
  it("maps presets to cron", () => {
    expect(presetToCron("daily-09:00")).toBe("0 9 * * *")
    expect(presetToCron("hourly")).toBe("0 * * * *")
  })

  it("rejects invalid cron", () => {
    const invalid = validateCron("0 25 * * *")
    expect(invalid.ok).toBe(false)
  })

  it("validates schedule with preview runs", () => {
    const out = validateSchedule({ cron: "0 9 * * 1-5", timezone: "UTC" })
    expect(out.ok).toBe(true)
    expect(out.schedule).toBe("0 9 * * 1-5")
    expect((out.nextRuns ?? []).length).toBeGreaterThanOrEqual(1)
  })

  it("returns ok false and does not throw for invalid minute field", () => {
    expect(() => validateSchedule({ cron: "undefined 0 * * *", timezone: "UTC" })).not.toThrow()
    const out = validateSchedule({ cron: "undefined 0 * * *", timezone: "UTC" })
    expect(out.ok).toBe(false)
    expect(out.error).toBeDefined()
  })

  it("returns ok false for empty cron", () => {
    const out = validateSchedule({ cron: "", timezone: "UTC" })
    expect(out.ok).toBe(false)
    expect(out.error).toBeDefined()
  })

  it("accepts dynamic presets with custom times", () => {
    const out = validateSchedule({ preset: "daily-15:50", timezone: "UTC" })
    expect(out.ok).toBe(true)
    expect(out.schedule).toBe("50 15 * * *")
  })

  it("returns ok false for invalid preset strings", () => {
    const out = validateSchedule({ preset: "dayly 15:50", timezone: "UTC" })
    expect(out.ok).toBe(false)
    expect(out.error).toBeDefined()
  })

  it("builds task payload with default preset", () => {
    const out = buildCreate({
      name: "daily repo scan",
      prompt: "scan repo",
      timezone: "UTC",
      dstPolicy: "skip-duplicate",
      retryMaxAttempts: 3,
      retryBackoff: "exponential",
      retryBaseMs: 30_000,
      retryMaxMs: 900_000,
      retryJitter: 0.2,
      concurrency: "forbid",
      startingDeadlineMs: 600_000,
      missedRunPolicy: "catchup_one",
      requireApproval: "auto",
      enabled: true,
    })

    expect(out.task.scheduleCron).toBe("0 9 * * *")
    expect(out.task.tenantId.length).toBeGreaterThan(0)
    expect((out.view.nextRuns as number[]).length).toBeGreaterThanOrEqual(1)
  })
})

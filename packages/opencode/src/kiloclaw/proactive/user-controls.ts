/**
 * Proactive User Controls - Per-user settings for proactive behavior
 * Manages quiet hours, override levels, and kill-switches
 */

import { Log } from "@/util/log"
import z from "zod"
import { fn } from "@/util/fn"
import { Database as BunDatabase } from "bun:sqlite"
import { mkdirSync } from "node:fs"
import { dirname } from "node:path"

// =============================================================================
// Types
// =============================================================================

/**
 * Override level for proactive actions
 */
export const OverrideLevel = z.enum(["none", "suggest", "act"])
export type OverrideLevel = z.infer<typeof OverrideLevel>

/**
 * User controls for proactive settings
 */
export interface ProactiveUserControls {
  readonly tenantId: string
  readonly userId: string
  readonly quietHoursStart: number | null // Minutes from midnight (0-1439), null if disabled
  readonly quietHoursEnd: number | null // Minutes from midnight (0-1439), null if disabled
  readonly overrideLevel: OverrideLevel
  readonly killSwitch: boolean
  readonly updatedAt: number
}

/**
 * Set quiet hours input
 */
export const SetQuietHoursInputSchema = z.object({
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  start: z.number().int().min(0).max(1439).nullable(), // Minutes from midnight, null to disable
  end: z.number().int().min(0).max(1439).nullable(), // Minutes from midnight, null to disable
})

export type SetQuietHoursInput = z.infer<typeof SetQuietHoursInputSchema>

/**
 * Set override level input
 */
export const SetOverrideInputSchema = z.object({
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  level: OverrideLevel,
})

export type SetOverrideInput = z.infer<typeof SetOverrideInputSchema>

/**
 * Set kill-switch input
 */
export const SetKillSwitchInputSchema = z.object({
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  enabled: z.boolean(),
})

export type SetKillSwitchInput = z.infer<typeof SetKillSwitchInputSchema>

/**
 * User controls record from DB
 */
interface UserControlsRow {
  tenant_id: string
  user_id: string
  quiet_hours_start: number | null
  quiet_hours_end: number | null
  override_level: string
  kill_switch: number // SQLite boolean
  updated_at: number
}

// =============================================================================
// SQL
// =============================================================================

const USER_CONTROLS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS proactive_user_controls (
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  quiet_hours_start INTEGER,
  quiet_hours_end INTEGER,
  override_level TEXT NOT NULL DEFAULT 'none',
  kill_switch INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE INDEX IF NOT EXISTS proactive_user_controls_tenant_idx ON proactive_user_controls(tenant_id);
`

// =============================================================================
// Database
// =============================================================================

const PROACTIVE_DB_PATH = process.env["KILOCLAW_PROACTIVE_DB_PATH"] ?? ".kiloclaw/proactive.db"

let _sqlite: BunDatabase | null = null
let _dbInitialized = false

function initDb(): void {
  if (_dbInitialized) return

  try {
    mkdirSync(dirname(PROACTIVE_DB_PATH), { recursive: true })
    _sqlite = new BunDatabase(PROACTIVE_DB_PATH, { create: true })
    _sqlite.run("PRAGMA journal_mode = WAL")
    _sqlite.run("PRAGMA foreign_keys = ON")
    _sqlite.exec(USER_CONTROLS_TABLE_SQL)
    _dbInitialized = true
  } catch (err) {
    console.error("failed to initialize proactive user controls database", err)
  }
}

function now(): number {
  return Date.now()
}

// =============================================================================
// In-memory cache
// =============================================================================

const controlsCache = new Map<string, ProactiveUserControls>()

function cacheKey(tenantId: string, userId: string): string {
  return `${tenantId}:${userId}`
}

// =============================================================================
// ProactiveUserControls API
// =============================================================================

function rowToControls(row: UserControlsRow): ProactiveUserControls {
  return {
    tenantId: row.tenant_id,
    userId: row.user_id,
    quietHoursStart: row.quiet_hours_start,
    quietHoursEnd: row.quiet_hours_end,
    overrideLevel: row.override_level as OverrideLevel,
    killSwitch: row.kill_switch === 1,
    updatedAt: row.updated_at,
  }
}

/**
 * Set quiet hours for a user
 * @param input - Contains tenantId, userId, start (minutes from midnight), end (minutes from midnight)
 * @returns The updated user controls
 */
export const setQuietHours = fn(SetQuietHoursInputSchema, async (input) => {
  const log = Log.create({ service: "kilocclaw.proactive.user_controls" })

  if (!_dbInitialized) initDb()

  // Validate that start < end if both are set
  if (input.start !== null && input.end !== null && input.start >= input.end) {
    throw new Error("quiet_hours_start must be less than quiet_hours_end")
  }

  if (_sqlite) {
    try {
      const stmt = _sqlite.prepare(`
        INSERT INTO proactive_user_controls (tenant_id, user_id, quiet_hours_start, quiet_hours_end, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id, user_id) DO UPDATE SET
          quiet_hours_start = excluded.quiet_hours_start,
          quiet_hours_end = excluded.quiet_hours_end,
          updated_at = excluded.updated_at
      `)
      stmt.run(input.tenantId, input.userId, input.start, input.end, now())
    } catch (err) {
      log.error("failed to set quiet hours in DB", { err })
      throw err
    }
  }

  const controls: ProactiveUserControls = {
    tenantId: input.tenantId,
    userId: input.userId,
    quietHoursStart: input.start,
    quietHoursEnd: input.end,
    overrideLevel: "none",
    killSwitch: false,
    updatedAt: now(),
  }

  controlsCache.set(cacheKey(input.tenantId, input.userId), controls)

  log.info("quiet hours set", {
    tenantId: input.tenantId,
    userId: input.userId,
    start: input.start,
    end: input.end,
  })

  return controls
})

/**
 * Get quiet hours for a user
 * @param input - Contains tenantId and userId
 * @returns The quiet hours configuration, or null if not set
 */
export const getQuietHours = fn(
  z.object({
    tenantId: z.string().min(1),
    userId: z.string().min(1),
  }),
  async (input) => {
    if (!_dbInitialized) initDb()

    const cacheK = cacheKey(input.tenantId, input.userId)
    const cached = controlsCache.get(cacheK)
    if (cached) {
      return {
        start: cached.quietHoursStart,
        end: cached.quietHoursEnd,
      }
    }

    if (_sqlite) {
      try {
        const row = _sqlite
          .prepare("SELECT * FROM proactive_user_controls WHERE tenant_id = ? AND user_id = ?")
          .get(input.tenantId, input.userId) as UserControlsRow | undefined

        if (row) {
          const controls = rowToControls(row)
          controlsCache.set(cacheK, controls)
          return {
            start: controls.quietHoursStart,
            end: controls.quietHoursEnd,
          }
        }
      } catch {
        // Fall back to cache
      }
    }

    return null
  },
)

/**
 * Set override level for a user
 * @param input - Contains tenantId, userId, and level
 * @returns The updated user controls
 */
export const setOverride = fn(SetOverrideInputSchema, async (input) => {
  const log = Log.create({ service: "kilocclaw.proactive.user_controls" })

  if (!_dbInitialized) initDb()

  if (_sqlite) {
    try {
      const stmt = _sqlite.prepare(`
        INSERT INTO proactive_user_controls (tenant_id, user_id, override_level, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(tenant_id, user_id) DO UPDATE SET
          override_level = excluded.override_level,
          updated_at = excluded.updated_at
      `)
      stmt.run(input.tenantId, input.userId, input.level, now())
    } catch (err) {
      log.error("failed to set override in DB", { err })
      throw err
    }
  }

  const existing = controlsCache.get(cacheKey(input.tenantId, input.userId))

  const controls: ProactiveUserControls = {
    tenantId: input.tenantId,
    userId: input.userId,
    quietHoursStart: existing?.quietHoursStart ?? null,
    quietHoursEnd: existing?.quietHoursEnd ?? null,
    overrideLevel: input.level,
    killSwitch: existing?.killSwitch ?? false,
    updatedAt: now(),
  }

  controlsCache.set(cacheKey(input.tenantId, input.userId), controls)

  log.info("override level set", {
    tenantId: input.tenantId,
    userId: input.userId,
    level: input.level,
  })

  return controls
})

/**
 * Get override level for a user
 * @param input - Contains tenantId and userId
 * @returns The override level, defaults to "none"
 */
export const getOverride = fn(
  z.object({
    tenantId: z.string().min(1),
    userId: z.string().min(1),
  }),
  async (input) => {
    if (!_dbInitialized) initDb()

    const cacheK = cacheKey(input.tenantId, input.userId)
    const cached = controlsCache.get(cacheK)
    if (cached) {
      return cached.overrideLevel
    }

    if (_sqlite) {
      try {
        const row = _sqlite
          .prepare("SELECT * FROM proactive_user_controls WHERE tenant_id = ? AND user_id = ?")
          .get(input.tenantId, input.userId) as UserControlsRow | undefined

        if (row) {
          const controls = rowToControls(row)
          controlsCache.set(cacheK, controls)
          return controls.overrideLevel
        }
      } catch {
        // Fall back to default
      }
    }

    return "none"
  },
)

/**
 * Set kill-switch for a user
 * @param input - Contains tenantId, userId, and enabled
 * @returns The updated user controls
 */
export const setKillSwitch = fn(SetKillSwitchInputSchema, async (input) => {
  const log = Log.create({ service: "kilocclaw.proactive.user_controls" })

  if (!_dbInitialized) initDb()

  if (_sqlite) {
    try {
      const stmt = _sqlite.prepare(`
        INSERT INTO proactive_user_controls (tenant_id, user_id, kill_switch, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(tenant_id, user_id) DO UPDATE SET
          kill_switch = excluded.kill_switch,
          updated_at = excluded.updated_at
      `)
      stmt.run(input.tenantId, input.userId, input.enabled ? 1 : 0, now())
    } catch (err) {
      log.error("failed to set kill switch in DB", { err })
      throw err
    }
  }

  const existing = controlsCache.get(cacheKey(input.tenantId, input.userId))

  const controls: ProactiveUserControls = {
    tenantId: input.tenantId,
    userId: input.userId,
    quietHoursStart: existing?.quietHoursStart ?? null,
    quietHoursEnd: existing?.quietHoursEnd ?? null,
    overrideLevel: existing?.overrideLevel ?? "none",
    killSwitch: input.enabled,
    updatedAt: now(),
  }

  controlsCache.set(cacheKey(input.tenantId, input.userId), controls)

  log.info("kill switch set", {
    tenantId: input.tenantId,
    userId: input.userId,
    enabled: input.enabled,
  })

  return controls
})

/**
 * Check if kill-switch is enabled for a user
 * @param input - Contains tenantId and userId
 * @returns True if kill-switch is enabled
 */
export const isKillSwitchEnabled = fn(
  z.object({
    tenantId: z.string().min(1),
    userId: z.string().min(1),
  }),
  async (input) => {
    if (!_dbInitialized) initDb()

    const cacheK = cacheKey(input.tenantId, input.userId)
    const cached = controlsCache.get(cacheK)
    if (cached) {
      return cached.killSwitch
    }

    if (_sqlite) {
      try {
        const row = _sqlite
          .prepare("SELECT * FROM proactive_user_controls WHERE tenant_id = ? AND user_id = ?")
          .get(input.tenantId, input.userId) as UserControlsRow | undefined

        if (row) {
          const controls = rowToControls(row)
          controlsCache.set(cacheK, controls)
          return controls.killSwitch
        }
      } catch {
        // Fall back to default
      }
    }

    return false
  },
)

/**
 * Check if current time is within quiet hours for a user
 */
export function isQuietHours(controls: ProactiveUserControls): boolean {
  if (controls.quietHoursStart === null || controls.quietHoursEnd === null) {
    return false
  }

  const now = new Date()
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  // Handle overnight quiet hours (e.g., 22:00 - 07:00)
  if (controls.quietHoursStart > controls.quietHoursEnd) {
    return currentMinutes >= controls.quietHoursStart || currentMinutes < controls.quietHoursEnd
  }

  return currentMinutes >= controls.quietHoursStart && currentMinutes < controls.quietHoursEnd
}

/**
 * Get all controls for a user
 */
export const getUserControls = fn(
  z.object({
    tenantId: z.string().min(1),
    userId: z.string().min(1),
  }),
  async (input) => {
    if (!_dbInitialized) initDb()

    const cacheK = cacheKey(input.tenantId, input.userId)
    const cached = controlsCache.get(cacheK)
    if (cached) {
      return cached
    }

    if (_sqlite) {
      try {
        const row = _sqlite
          .prepare("SELECT * FROM proactive_user_controls WHERE tenant_id = ? AND user_id = ?")
          .get(input.tenantId, input.userId) as UserControlsRow | undefined

        if (row) {
          const controls = rowToControls(row)
          controlsCache.set(cacheK, controls)
          return controls
        }
      } catch {
        // Fall back to default
      }
    }

    // Return default controls
    const defaults: ProactiveUserControls = {
      tenantId: input.tenantId,
      userId: input.userId,
      quietHoursStart: null,
      quietHoursEnd: null,
      overrideLevel: "none",
      killSwitch: false,
      updatedAt: now(),
    }

    return defaults
  },
)

// =============================================================================
// Namespace exports
// =============================================================================

export namespace ProactiveUserControls {
  export const Override = OverrideLevel

  export function setQuietHours(input: SetQuietHoursInput) {
    return setQuietHours(input)
  }

  export function getQuietHours(input: { tenantId: string; userId: string }) {
    return getQuietHours(input)
  }

  export function setOverride(input: SetOverrideInput) {
    return setOverride(input)
  }

  export function getOverride(input: { tenantId: string; userId: string }) {
    return getOverride(input)
  }

  export function setKillSwitch(input: SetKillSwitchInput) {
    return setKillSwitch(input)
  }

  export function isKillSwitchEnabled(input: { tenantId: string; userId: string }) {
    return isKillSwitchEnabled(input)
  }

  export function isQuietHours(controls: ProactiveUserControls): boolean {
    return isQuietHours(controls)
  }

  export function getUserControls(input: { tenantId: string; userId: string }) {
    return getUserControls(input)
  }
}

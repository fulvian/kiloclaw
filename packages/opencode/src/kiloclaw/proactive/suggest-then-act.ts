/**
 * Proactive Suggest-Then-Act - Default mode for non-critical proactive actions
 * Creates suggestions that users can accept or reject before execution
 */

import { Log } from "@/util/log"
import z from "zod"
import { fn } from "@/util/fn"
import { Database as BunDatabase } from "bun:sqlite"

// =============================================================================
// Types
// =============================================================================

/**
 * Suggestion status
 */
export const SuggestionStatus = z.enum(["pending", "accepted", "rejected", "expired"])
export type SuggestionStatus = z.infer<typeof SuggestionStatus>

/**
 * A proactive suggestion waiting for user response
 */
export interface Suggestion {
  readonly id: string
  readonly taskId: string
  readonly tenantId: string
  readonly userId: string
  readonly message: string
  readonly rationale: SuggestionRationale
  readonly status: SuggestionStatus
  readonly createdAt: number
  readonly respondedAt: number | null
  readonly expiresAt: number
}

/**
 * Rationale for why a suggestion was made
 */
export interface SuggestionRationale {
  readonly trigger: string
  readonly signals: string[]
  readonly policy: string
  readonly budget: BudgetSummary
  readonly riskLevel: string
}

/**
 * Budget summary for suggestions
 */
export interface BudgetSummary {
  readonly totalUsed: number
  readonly totalLimit: number
  readonly byType: Record<string, number>
}

/**
 * Create suggestion input
 */
export const CreateSuggestionInputSchema = z.object({
  taskId: z.string().min(1),
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  message: z.string().min(1).max(500),
  rationale: z.object({
    trigger: z.string(),
    signals: z.array(z.string()),
    policy: z.string(),
    budget: z.object({
      totalUsed: z.number(),
      totalLimit: z.number(),
      byType: z.record(z.string(), z.number()),
    }),
    riskLevel: z.string(),
  }),
  ttlMs: z.number().int().positive().default(300000), // Default 5 minutes
})

export type CreateSuggestionInput = z.infer<typeof CreateSuggestionInputSchema>

/**
 * Accept suggestion input
 */
export const AcceptSuggestionInputSchema = z.object({
  suggestionId: z.string().min(1),
})

export type AcceptSuggestionInput = z.infer<typeof AcceptSuggestionInputSchema>

/**
 * Reject suggestion input
 */
export const RejectSuggestionInputSchema = z.object({
  suggestionId: z.string().min(1),
  reason: z.string().max(200).optional(),
})

export type RejectSuggestionInput = z.infer<typeof RejectSuggestionInputSchema>

/**
 * Suggestion row from DB
 */
interface SuggestionRow {
  id: string
  task_id: string
  tenant_id: string
  user_id: string
  message: string
  rationale_json: string
  status: string
  created_at: number
  responded_at: number | null
  expires_at: number
}

// =============================================================================
// SQL
// =============================================================================

const SUGGESTIONS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS proactive_suggestions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  message TEXT NOT NULL,
  rationale_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  responded_at INTEGER,
  expires_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE INDEX IF NOT EXISTS proactive_suggestions_tenant_user_idx ON proactive_suggestions(tenant_id, user_id);
CREATE INDEX IF NOT EXISTS proactive_suggestions_status_idx ON proactive_suggestions(status);
CREATE INDEX IF NOT EXISTS proactive_suggestions_expires_idx ON proactive_suggestions(expires_at);
`

// =============================================================================
// Database
// =============================================================================

const PROACTIVE_DB_PATH = ".kilocode/proactive.db"

let _sqlite: BunDatabase | null = null
let _dbInitialized = false

function initDb(): void {
  if (_dbInitialized) return

  try {
    _sqlite = new BunDatabase(PROACTIVE_DB_PATH, { create: true })
    _sqlite.run("PRAGMA journal_mode = WAL")
    _sqlite.run("PRAGMA foreign_keys = ON")
    _sqlite.exec(SUGGESTIONS_TABLE_SQL)
    _dbInitialized = true
  } catch (err) {
    console.error("failed to initialize proactive suggestions database", err)
  }
}

function now(): number {
  return Date.now()
}

// =============================================================================
// In-memory cache
// =============================================================================

const suggestionsCache = new Map<string, Suggestion>()

function cacheKey(id: string): string {
  return id
}

// =============================================================================
// Helper functions
// =============================================================================

function rowToSuggestion(row: SuggestionRow): Suggestion {
  return {
    id: row.id,
    taskId: row.task_id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    message: row.message,
    rationale: JSON.parse(row.rationale_json) as SuggestionRationale,
    status: row.status as SuggestionStatus,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
    expiresAt: row.expires_at,
  }
}

// =============================================================================
// SuggestThenAct API
// =============================================================================

/**
 * Create a new suggestion
 */
export const createSuggestion = fn(CreateSuggestionInputSchema, async (input) => {
  const log = Log.create({ service: "kilocclaw.proactive.suggest_then_act" })

  if (!_dbInitialized) initDb()

  const id = `suggestion-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  const timestamp = now()
  const expiresAt = timestamp + input.ttlMs

  const suggestion: Suggestion = {
    id,
    taskId: input.taskId,
    tenantId: input.tenantId,
    userId: input.userId,
    message: input.message,
    rationale: input.rationale,
    status: "pending",
    createdAt: timestamp,
    respondedAt: null,
    expiresAt,
  }

  if (_sqlite) {
    try {
      const stmt = _sqlite.prepare(`
        INSERT INTO proactive_suggestions (id, task_id, tenant_id, user_id, message, rationale_json, status, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      stmt.run(
        id,
        input.taskId,
        input.tenantId,
        input.userId,
        input.message,
        JSON.stringify(input.rationale),
        "pending",
        timestamp,
        expiresAt,
      )
    } catch (err) {
      log.error("failed to create suggestion in DB", { err })
      // Continue with memory cache
    }
  }

  suggestionsCache.set(cacheKey(id), suggestion)

  log.info("suggestion created", {
    suggestionId: id,
    taskId: input.taskId,
    tenantId: input.tenantId,
    userId: input.userId,
    expiresAt,
  })

  return suggestion
})

/**
 * Accept a suggestion by ID
 */
export const acceptSuggestion = fn(AcceptSuggestionInputSchema, async (input) => {
  const log = Log.create({ service: "kilocclaw.proactive.suggest_then_act" })

  if (!_dbInitialized) initDb()

  const cacheK = cacheKey(input.suggestionId)
  const cached = suggestionsCache.get(cacheK)

  // Check if suggestion exists and is valid
  if (cached) {
    if (cached.status !== "pending") {
      throw new Error(`Suggestion ${input.suggestionId} is not pending (current status: ${cached.status})`)
    }

    if (Date.now() > cached.expiresAt) {
      // Mark as expired
      const expired: Suggestion = { ...cached, status: "expired", respondedAt: now() }
      suggestionsCache.set(cacheK, expired)

      if (_sqlite) {
        try {
          _sqlite
            .prepare(
              `UPDATE proactive_suggestions SET status = 'expired', responded_at = ?, updated_at = ? WHERE id = ?`,
            )
            .run(now(), now(), input.suggestionId)
        } catch {
          // Ignore
        }
      }

      throw new Error(`Suggestion ${input.suggestionId} has expired`)
    }
  }

  if (_sqlite) {
    try {
      const stmt = _sqlite.prepare(`
        UPDATE proactive_suggestions SET status = 'accepted', responded_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'
      `)
      const result = stmt.run(now(), now(), input.suggestionId)

      if (result.changes === 0) {
        // Check if it exists and is not pending
        const row = _sqlite.prepare("SELECT status FROM proactive_suggestions WHERE id = ?").get(input.suggestionId) as
          | { status: string }
          | undefined

        if (row) {
          throw new Error(`Suggestion ${input.suggestionId} is not pending (current status: ${row.status})`)
        }

        throw new Error(`Suggestion ${input.suggestionId} not found`)
      }
    } catch (err) {
      if (err instanceof Error) throw err
      log.error("failed to accept suggestion in DB", { err })
      throw err
    }
  }

  const updated: Suggestion = {
    ...(cached ?? {
      id: input.suggestionId,
      taskId: "",
      tenantId: "",
      userId: "",
      message: "",
      rationale: {
        trigger: "",
        signals: [],
        policy: "",
        budget: { totalUsed: 0, totalLimit: 0, byType: {} },
        riskLevel: "",
      },
      createdAt: now(),
      expiresAt: now(),
    }),
    status: "accepted",
    respondedAt: now(),
  }

  suggestionsCache.set(cacheK, updated)

  log.info("suggestion accepted", { suggestionId: input.suggestionId })

  return updated
})

/**
 * Reject a suggestion by ID
 */
export const rejectSuggestion = fn(RejectSuggestionInputSchema, async (input) => {
  const log = Log.create({ service: "kilocclaw.proactive.suggest_then_act" })

  if (!_dbInitialized) initDb()

  const cacheK = cacheKey(input.suggestionId)
  const cached = suggestionsCache.get(cacheK)

  if (cached) {
    if (cached.status !== "pending") {
      throw new Error(`Suggestion ${input.suggestionId} is not pending (current status: ${cached.status})`)
    }
  }

  if (_sqlite) {
    try {
      const stmt = _sqlite.prepare(`
        UPDATE proactive_suggestions SET status = 'rejected', responded_at = ?, updated_at = ? WHERE id = ? AND status = 'pending'
      `)
      const result = stmt.run(now(), now(), input.suggestionId)

      if (result.changes === 0) {
        const row = _sqlite.prepare("SELECT status FROM proactive_suggestions WHERE id = ?").get(input.suggestionId) as
          | { status: string }
          | undefined

        if (row) {
          throw new Error(`Suggestion ${input.suggestionId} is not pending (current status: ${row.status})`)
        }

        throw new Error(`Suggestion ${input.suggestionId} not found`)
      }
    } catch (err) {
      if (err instanceof Error) throw err
      log.error("failed to reject suggestion in DB", { err })
      throw err
    }
  }

  const updated: Suggestion = {
    ...(cached ?? {
      id: input.suggestionId,
      taskId: "",
      tenantId: "",
      userId: "",
      message: "",
      rationale: {
        trigger: "",
        signals: [],
        policy: "",
        budget: { totalUsed: 0, totalLimit: 0, byType: {} },
        riskLevel: "",
      },
      createdAt: now(),
      expiresAt: now(),
    }),
    status: "rejected",
    respondedAt: now(),
  }

  suggestionsCache.set(cacheK, updated)

  log.info("suggestion rejected", { suggestionId: input.suggestionId, reason: input.reason })

  return updated
})

/**
 * Get a suggestion by ID
 */
export const getSuggestion = fn(
  z.object({
    suggestionId: z.string().min(1),
  }),
  async (input) => {
    if (!_dbInitialized) initDb()

    const cacheK = cacheKey(input.suggestionId)
    const cached = suggestionsCache.get(cacheK)
    if (cached) {
      // Check if expired
      if (cached.status === "pending" && Date.now() > cached.expiresAt) {
        const expired: Suggestion = { ...cached, status: "expired" }
        suggestionsCache.set(cacheK, expired)
        return expired
      }
      return cached
    }

    if (_sqlite) {
      try {
        const row = _sqlite.prepare("SELECT * FROM proactive_suggestions WHERE id = ?").get(input.suggestionId) as
          | SuggestionRow
          | undefined

        if (row) {
          const suggestion = rowToSuggestion(row)
          suggestionsCache.set(cacheK, suggestion)

          // Check if expired
          if (suggestion.status === "pending" && Date.now() > suggestion.expiresAt) {
            const expired: Suggestion = { ...suggestion, status: "expired" }
            suggestionsCache.set(cacheK, expired)
            return expired
          }

          return suggestion
        }
      } catch {
        // Fall back to not found
      }
    }

    return null
  },
)

/**
 * Get all pending suggestions for a user
 */
export const getPendingSuggestions = fn(
  z.object({
    tenantId: z.string().min(1),
    userId: z.string().min(1),
    limit: z.number().int().positive().default(10),
  }),
  async (input) => {
    if (!_dbInitialized) initDb()

    const timestamp = now()

    if (_sqlite) {
      try {
        const rows = _sqlite
          .prepare(
            `SELECT * FROM proactive_suggestions 
             WHERE tenant_id = ? AND user_id = ? AND status = 'pending' AND expires_at > ?
             ORDER BY created_at DESC LIMIT ?`,
          )
          .all(input.tenantId, input.userId, timestamp, input.limit) as SuggestionRow[]

        return rows.map(rowToSuggestion)
      } catch {
        // Fall back to memory
      }
    }

    return [...suggestionsCache.values()].filter(
      (s) =>
        s.tenantId === input.tenantId && s.userId === input.userId && s.status === "pending" && s.expiresAt > timestamp,
    )
  },
)

/**
 * Expire stale suggestions (cleanup job)
 */
export const expireSuggestions = fn(z.object({}), async () => {
  const log = Log.create({ service: "kilocclaw.proactive.suggest_then_act" })

  if (!_dbInitialized) initDb()

  const timestamp = now()
  let expiredCount = 0

  if (_sqlite) {
    try {
      const result = _sqlite
        .prepare(
          `UPDATE proactive_suggestions SET status = 'expired', responded_at = ? 
           WHERE status = 'pending' AND expires_at <= ?`,
        )
        .run(timestamp, timestamp)

      expiredCount = result.changes
    } catch (err) {
      log.error("failed to expire suggestions in DB", { err })
    }
  }

  // Update cache
  for (const [id, suggestion] of suggestionsCache) {
    if (suggestion.status === "pending" && suggestion.expiresAt <= timestamp) {
      suggestionsCache.set(id, { ...suggestion, status: "expired" })
      expiredCount++
    }
  }

  if (expiredCount > 0) {
    log.info("suggestions expired", { count: expiredCount })
  }

  return { expiredCount }
})

// =============================================================================
// SuggestThenAct Namespace
// =============================================================================

export namespace SuggestThenAct {
  export const Status = SuggestionStatus

  export function createSuggestion(input: CreateSuggestionInput) {
    return createSuggestion(input)
  }

  export function acceptSuggestion(input: AcceptSuggestionInput) {
    return acceptSuggestion(input)
  }

  export function rejectSuggestion(input: RejectSuggestionInput) {
    return rejectSuggestion(input)
  }

  export function getSuggestion(input: { suggestionId: string }) {
    return getSuggestion(input)
  }

  export function getPendingSuggestions(input: { tenantId: string; userId: string; limit?: number }) {
    return getPendingSuggestions({ ...input, limit: input.limit ?? 10 })
  }

  export async function expireSuggestions(): Promise<{ expiredCount: number }> {
    const log = Log.create({ service: "kilocclaw.proactive.suggest_then_act" })

    if (!_dbInitialized) initDb()

    const timestamp = now()
    let expiredCount = 0

    if (_sqlite) {
      try {
        const result = _sqlite
          .prepare(
            `UPDATE proactive_suggestions SET status = 'expired', responded_at = ? 
             WHERE status = 'pending' AND expires_at <= ?`,
          )
          .run(timestamp, timestamp)

        expiredCount = result.changes
      } catch (err) {
        log.error("failed to expire suggestions in DB", { err })
      }
    }

    // Update cache
    for (const [id, suggestion] of suggestionsCache) {
      if (suggestion.status === "pending" && suggestion.expiresAt <= timestamp) {
        suggestionsCache.set(id, { ...suggestion, status: "expired" })
        expiredCount++
      }
    }

    if (expiredCount > 0) {
      log.info("suggestions expired", { count: expiredCount })
    }

    return { expiredCount }
  }
}

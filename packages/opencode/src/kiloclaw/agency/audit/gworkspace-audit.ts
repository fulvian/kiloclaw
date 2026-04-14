// Google Workspace Audit Trail
// Records all operations for compliance and security review

import { Log } from "@/util/log"
import { Storage } from "@/storage/storage"
import { Instance } from "@/project/instance"
import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import { createHash } from "node:crypto"
import z from "zod"

// ============================================================================
// Types
// ============================================================================

export const AuditOperation = z.enum([
  "gmail.search",
  "gmail.read",
  "gmail.send",
  "gmail.draft",
  "gmail.delete",
  "calendar.list",
  "calendar.read",
  "calendar.create",
  "calendar.update",
  "calendar.delete",
  "drive.search",
  "drive.read",
  "drive.share",
  "drive.create",
  "drive.update",
  "drive.copy",
  "drive.move",
  "drive.delete",
  "docs.read",
  "docs.download",
  "docs.create",
  "docs.update",
  "docs.delete",
  "sheets.read",
  "sheets.download",
  "sheets.create",
  "sheets.append",
  "sheets.clear",
  "sheets.update",
  "sheets.delete",
  "slides.read",
  "slides.create",
  "slides.addSlide",
  "slides.update",
  "slides.delete",
  "slides.export",
  "documents.search",
  "documents.tag",
  "index.stats",
])
export type AuditOperation = z.infer<typeof AuditOperation>

export const AuditResult = z.enum(["success", "failure", "denied", "hitl_pending", "hitl_approved", "hitl_denied"])
export type AuditResult = z.infer<typeof AuditResult>

export const AuditEntrySchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  correlationId: z.string().optional(),
  traceId: z.string().optional(),
  agencyDomain: z.literal("gworkspace"),
  service: z.string(),
  operation: z.string(),
  actor: z.object({
    userId: z.string().optional(),
    userEmail: z.string().optional(),
    sessionId: z.string().optional(),
  }),
  resource: z.object({
    type: z.string().optional(),
    id: z.string().optional(),
    name: z.string().optional(),
  }),
  policy: z.object({
    level: z.enum(["SAFE", "NOTIFY", "CONFIRM", "HITL", "DENY"]),
    hitlRequired: z.boolean().default(false),
    hitlRequestId: z.string().optional(),
  }),
  result: AuditResult,
  error: z.string().optional(),
  actorHash: z.string().optional(),
  beforeHash: z.string().optional(),
  afterHash: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  durationMs: z.number().optional(),
  provider: z.enum(["native", "mcp"]).optional(),
})
export type AuditEntry = z.infer<typeof AuditEntrySchema>

interface BaseAuditOptions {
  correlationId?: string
  traceId?: string
}

// ============================================================================
// Audit Manager
// ============================================================================

export namespace GWorkspaceAudit {
  const log = Log.create({ service: "gworkspace.audit" })

  const AuditWrite = BusEvent.define(
    "audit.write",
    z.object({
      agencyDomain: z.literal("gworkspace"),
      entryId: z.string(),
      service: z.string(),
      operation: z.string(),
      result: AuditResult,
      success: z.boolean(),
      error: z.string().optional(),
    }),
  )

  const STORAGE_KEY = ["audit", "gworkspace"]
  const MAX_ENTRIES = 10000

  /**
   * Generate unique audit entry ID
   */
  function generateId(): string {
    return `audit-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
  }

  /**
   * Get audit storage key for current project
   */
  function getStorageKey(): string[] {
    const projectId = Instance.project.id
    return [...STORAGE_KEY, projectId]
  }

  function hash(value: unknown): string {
    return createHash("sha256")
      .update(JSON.stringify(value ?? null))
      .digest("hex")
  }

  function isWriteOp(operation: string): boolean {
    return /(^|[._])(send|share|create|insert|update|patch|write|delete|remove|move|copy|append|clear|modify|trash)([._]|$)/.test(
      operation,
    )
  }

  /**
   * Load all audit entries
   */
  async function loadEntries(): Promise<AuditEntry[]> {
    try {
      const entries = await Storage.read(getStorageKey())
      return (entries as AuditEntry[]) ?? []
    } catch {
      return []
    }
  }

  /**
   * Save audit entries
   */
  async function saveEntries(entries: AuditEntry[]): Promise<void> {
    // Trim to max entries
    const trimmed = entries.slice(-MAX_ENTRIES)
    await Storage.write(getStorageKey(), trimmed)
  }

  /**
   * Record an audit entry
   */
  export async function record(entry: Omit<AuditEntry, "id" | "timestamp" | "agencyDomain">): Promise<AuditEntry> {
    const write = isWriteOp(entry.operation)
    const actorHash = hash(entry.actor)
    const beforeHash = write ? hash({ resource: entry.resource, metadata: entry.metadata }) : undefined
    const afterHash = write
      ? hash({ resource: entry.resource, metadata: entry.metadata, result: entry.result })
      : undefined
    const fullEntry = AuditEntrySchema.parse({
      ...entry,
      id: generateId(),
      timestamp: new Date().toISOString(),
      agencyDomain: "gworkspace",
      actorHash,
      beforeHash,
      afterHash,
    })

    try {
      const entries = await loadEntries()
      entries.push(fullEntry)
      await saveEntries(entries)

      log.debug("audit entry recorded", {
        id: fullEntry.id,
        service: fullEntry.service,
        operation: fullEntry.operation,
        result: fullEntry.result,
      })
      Bus.publish(AuditWrite, {
        agencyDomain: "gworkspace",
        entryId: fullEntry.id,
        service: fullEntry.service,
        operation: fullEntry.operation,
        result: fullEntry.result,
        success: true,
      })
    } catch (error) {
      log.error("failed to record audit entry", { error, entry: fullEntry.id })
      Bus.publish(AuditWrite, {
        agencyDomain: "gworkspace",
        entryId: fullEntry.id,
        service: fullEntry.service,
        operation: fullEntry.operation,
        result: fullEntry.result,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }

    return fullEntry
  }

  /**
   * Get policy level for service/operation
   */
  function getPolicyLevel(service: string, operation: string): AuditEntry["policy"]["level"] {
    // Import manifest lazily to avoid circular deps
    try {
      const { GWorkspaceAgency } = require("../manifests/gworkspace-manifest")
      return GWorkspaceAgency.getPolicy(service, operation)
    } catch (error) {
      log.warn("policy lookup failed, defaulting to DENY", {
        service,
        operation,
        error: error instanceof Error ? error.message : String(error),
      })
      return "DENY"
    }
  }

  /**
   * Record a Gmail operation
   */
  export async function recordGmail(
    operation: AuditOperation,
    result: AuditResult,
    options: BaseAuditOptions & {
      userId?: string
      userEmail?: string
      sessionId?: string
      messageId?: string
      query?: string
      recipients?: string[]
      hitlRequired?: boolean
      hitlRequestId?: string
      error?: string
      durationMs?: number
      provider?: "native" | "mcp"
    } = {},
  ): Promise<AuditEntry> {
    return record({
      service: "gmail",
      operation,
      correlationId: options.correlationId,
      traceId: options.traceId,
      actor: {
        userId: options.userId,
        userEmail: options.userEmail,
        sessionId: options.sessionId,
      },
      resource: {
        type: "message",
        id: options.messageId,
      },
      policy: {
        level: getPolicyLevel("gmail", operation),
        hitlRequired: options.hitlRequired ?? false,
        hitlRequestId: options.hitlRequestId,
      },
      result,
      error: options.error,
      metadata: {
        query: options.query,
        recipients: options.recipients,
      },
      durationMs: options.durationMs,
      provider: options.provider,
    })
  }

  /**
   * Record a Calendar operation
   */
  export async function recordCalendar(
    operation: AuditOperation,
    result: AuditResult,
    options: BaseAuditOptions & {
      userId?: string
      userEmail?: string
      sessionId?: string
      eventId?: string
      calendarId?: string
      summary?: string
      attendeeCount?: number
      hitlRequired?: boolean
      hitlRequestId?: string
      error?: string
      durationMs?: number
      provider?: "native" | "mcp"
    } = {},
  ): Promise<AuditEntry> {
    return record({
      service: "calendar",
      operation,
      correlationId: options.correlationId,
      traceId: options.traceId,
      actor: {
        userId: options.userId,
        userEmail: options.userEmail,
        sessionId: options.sessionId,
      },
      resource: {
        type: "event",
        id: options.eventId,
        name: options.summary,
      },
      policy: {
        level: getPolicyLevel("calendar", operation),
        hitlRequired: options.hitlRequired ?? false,
        hitlRequestId: options.hitlRequestId,
      },
      result,
      error: options.error,
      metadata: {
        calendarId: options.calendarId,
        attendeeCount: options.attendeeCount,
      },
      durationMs: options.durationMs,
      provider: options.provider,
    })
  }

  /**
   * Record a Drive operation
   */
  export async function recordDrive(
    operation: AuditOperation,
    result: AuditResult,
    options: BaseAuditOptions & {
      userId?: string
      userEmail?: string
      sessionId?: string
      fileId?: string
      fileName?: string
      sharedWith?: string[]
      hitlRequired?: boolean
      hitlRequestId?: string
      error?: string
      durationMs?: number
      provider?: "native" | "mcp"
    } = {},
  ): Promise<AuditEntry> {
    return record({
      service: "drive",
      operation,
      correlationId: options.correlationId,
      traceId: options.traceId,
      actor: {
        userId: options.userId,
        userEmail: options.userEmail,
        sessionId: options.sessionId,
      },
      resource: {
        type: "file",
        id: options.fileId,
        name: options.fileName,
      },
      policy: {
        level: getPolicyLevel("drive", operation),
        hitlRequired: options.hitlRequired ?? false,
        hitlRequestId: options.hitlRequestId,
      },
      result,
      error: options.error,
      metadata: {
        sharedWith: options.sharedWith,
      },
      durationMs: options.durationMs,
      provider: options.provider,
    })
  }

  /**
   * Record a Docs operation
   */
  export async function recordDocs(
    operation: AuditOperation,
    result: AuditResult,
    options: BaseAuditOptions & {
      userId?: string
      userEmail?: string
      sessionId?: string
      documentId?: string
      documentName?: string
      format?: string
      sizeBytes?: number
      hitlRequired?: boolean
      hitlRequestId?: string
      error?: string
      durationMs?: number
      provider?: "native" | "mcp"
    } = {},
  ): Promise<AuditEntry> {
    return record({
      service: "docs",
      operation,
      correlationId: options.correlationId,
      traceId: options.traceId,
      actor: {
        userId: options.userId,
        userEmail: options.userEmail,
        sessionId: options.sessionId,
      },
      resource: {
        type: "document",
        id: options.documentId,
        name: options.documentName,
      },
      policy: {
        level: getPolicyLevel("docs", operation),
        hitlRequired: options.hitlRequired ?? false,
        hitlRequestId: options.hitlRequestId,
      },
      result,
      error: options.error,
      durationMs: options.durationMs,
      provider: options.provider,
    })
  }

  /**
   * Record a Sheets operation
   */
  export async function recordSheets(
    operation: AuditOperation,
    result: AuditResult,
    options: BaseAuditOptions & {
      userId?: string
      userEmail?: string
      sessionId?: string
      spreadsheetId?: string
      spreadsheetName?: string
      range?: string
      format?: string
      sizeBytes?: number
      hitlRequired?: boolean
      hitlRequestId?: string
      error?: string
      durationMs?: number
      provider?: "native" | "mcp"
    } = {},
  ): Promise<AuditEntry> {
    return record({
      service: "sheets",
      operation,
      correlationId: options.correlationId,
      traceId: options.traceId,
      actor: {
        userId: options.userId,
        userEmail: options.userEmail,
        sessionId: options.sessionId,
      },
      resource: {
        type: "spreadsheet",
        id: options.spreadsheetId,
        name: options.spreadsheetName,
      },
      policy: {
        level: getPolicyLevel("sheets", operation),
        hitlRequired: options.hitlRequired ?? false,
        hitlRequestId: options.hitlRequestId,
      },
      result,
      error: options.error,
      metadata: {
        range: options.range,
      },
      durationMs: options.durationMs,
      provider: options.provider,
    })
  }

  export async function recordSlides(
    operation: AuditOperation,
    result: AuditResult,
    options: BaseAuditOptions & {
      userId?: string
      userEmail?: string
      sessionId?: string
      presentationId?: string
      presentationName?: string
      slideIndex?: number
      format?: string
      fileSize?: number
      hitlRequired?: boolean
      hitlRequestId?: string
      error?: string
      durationMs?: number
      provider?: "native" | "mcp"
    } = {},
  ): Promise<AuditEntry> {
    return record({
      service: "slides",
      operation,
      correlationId: options.correlationId,
      traceId: options.traceId,
      actor: {
        userId: options.userId,
        userEmail: options.userEmail,
        sessionId: options.sessionId,
      },
      resource: {
        type: "presentation",
        id: options.presentationId,
        name: options.presentationName,
      },
      policy: {
        level: getPolicyLevel("slides", operation),
        hitlRequired: options.hitlRequired ?? false,
        hitlRequestId: options.hitlRequestId,
      },
      result,
      error: options.error,
      metadata: {
        slideIndex: options.slideIndex,
        format: options.format,
        fileSize: options.fileSize,
      },
      durationMs: options.durationMs,
      provider: options.provider,
    })
  }

  /**
   * Get audit entries with optional filtering
   */
  export async function query(
    options: {
      service?: string
      operation?: string
      result?: AuditResult
      startDate?: string
      endDate?: string
      limit?: number
      offset?: number
    } = {},
  ): Promise<{ entries: AuditEntry[]; total: number }> {
    let entries = await loadEntries()

    // Filter by service
    if (options.service) {
      entries = entries.filter((e) => e.service === options.service)
    }

    // Filter by operation
    if (options.operation) {
      entries = entries.filter((e) => e.operation === options.operation)
    }

    // Filter by result
    if (options.result) {
      entries = entries.filter((e) => e.result === options.result)
    }

    // Filter by date range
    if (options.startDate) {
      entries = entries.filter((e) => e.timestamp >= options.startDate!)
    }
    if (options.endDate) {
      entries = entries.filter((e) => e.timestamp <= options.endDate!)
    }

    const total = entries.length

    // Sort by timestamp descending
    entries.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

    // Apply pagination
    const offset = options.offset ?? 0
    const limit = options.limit ?? 100
    entries = entries.slice(offset, offset + limit)

    return { entries, total }
  }

  export async function recordSearch(
    operation: AuditOperation,
    result: AuditResult,
    options: BaseAuditOptions & {
      userId?: string
      userEmail?: string
      sessionId?: string
      query?: string
      resultCount?: number
      filters?: string[]
      hitlRequired?: boolean
      hitlRequestId?: string
      error?: string
      durationMs?: number
      provider?: "native" | "mcp"
    } = {},
  ): Promise<AuditEntry> {
    return record({
      service: "search",
      operation,
      correlationId: options.correlationId,
      traceId: options.traceId,
      actor: {
        userId: options.userId,
        userEmail: options.userEmail,
        sessionId: options.sessionId,
      },
      resource: {
        type: "document_index",
        id: undefined,
        name: options.query,
      },
      policy: { level: "SAFE", hitlRequired: options.hitlRequired ?? false, hitlRequestId: options.hitlRequestId },
      result,
      error: options.error,
      metadata: {
        query: options.query,
        resultCount: options.resultCount,
        filters: options.filters,
        provider: options.provider,
      },
      durationMs: options.durationMs,
    })
  }

  /**
   * Export audit log for compliance
   */
  export async function exportLog(format: "json" | "csv" = "json"): Promise<string> {
    const entries = await loadEntries()

    if (format === "json") {
      return JSON.stringify(entries, null, 2)
    }

    // CSV format
    const headers = [
      "id",
      "timestamp",
      "service",
      "operation",
      "result",
      "userEmail",
      "resourceType",
      "resourceId",
      "error",
    ]
    const rows = entries.map((e) => [
      e.id,
      e.timestamp,
      e.service,
      e.operation,
      e.result,
      e.actor.userEmail ?? "",
      e.resource.type ?? "",
      e.resource.id ?? "",
      e.error ?? "",
    ])

    return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
  }
}

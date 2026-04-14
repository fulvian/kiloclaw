// Google Workspace Skills
// Clean skill implementations for Gmail, Calendar, Drive, Docs, Sheets

import { Log } from "@/util/log"
import { fn } from "@/util/fn"
import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import z from "zod"
import { GWorkspaceAgency, type PolicyLevel } from "../manifests/gworkspace-manifest"
import { GWorkspaceHITL } from "../hitl/gworkspace-hitl"
import { GWorkspaceAudit } from "../audit/gworkspace-audit"
import { GWorkspaceBroker } from "../broker/gworkspace-broker"
import { GWorkspaceIdempotency } from "../services/gworkspace-idempotency"
import { DocumentExporter, ContentParser, EXPORT_FORMATS, type ExportFormat } from "../services/document-exporter"
import { DocumentIndexer, type DocumentMetadata } from "../services/document-indexer"
import { BrokerTokenIntegration } from "../auth/broker-integration"

const IntentReceived = BusEvent.define(
  "intent.received",
  z.object({
    agencyDomain: z.literal("gworkspace"),
    service: z.string(),
    operation: z.string(),
  }),
)

const PolicyDecisionMade = BusEvent.define(
  "policy.decision.made",
  z.object({
    agencyDomain: z.literal("gworkspace"),
    service: z.string(),
    operation: z.string(),
    policy: z.enum(["SAFE", "NOTIFY", "CONFIRM", "HITL", "DENY"]),
  }),
)

function emitIntent(service: string, operation: string): void {
  Bus.publish(IntentReceived, {
    agencyDomain: "gworkspace",
    service,
    operation,
  })
}

function emitPolicy(service: string, operation: string, policy: PolicyLevel): void {
  Bus.publish(PolicyDecisionMade, {
    agencyDomain: "gworkspace",
    service,
    operation,
    policy,
  })
}

function makeCtx() {
  return {
    correlationId: crypto.randomUUID(),
    traceId: crypto.randomUUID(),
    userId: process.env.KILO_USER_ID,
    userEmail: process.env.KILO_USER_EMAIL,
    sessionId: process.env.KILO_SESSION_ID,
  }
}

// ============================================================================
// Gmail Skills
// ============================================================================

export const GmailSearchInputSchema = z.object({
  query: z.string().describe("Gmail search query"),
  maxResults: z.number().optional().default(10),
  userId: z.string().optional().describe("User ID (defaults to KILO_USER_ID)"),
  workspaceId: z.string().optional().default("default").describe("Workspace ID"),
})

export const GmailReadInputSchema = z.object({
  messageId: z.string().describe("Message ID to read"),
  userId: z.string().optional().describe("User ID (defaults to KILO_USER_ID)"),
  workspaceId: z.string().optional().default("default").describe("Workspace ID"),
})

export const GmailSendInputSchema = z.object({
  to: z.array(z.string()).describe("Recipients"),
  subject: z.string().describe("Subject"),
  body: z.string().describe("Body"),
  cc: z.array(z.string()).optional(),
  userId: z.string().optional().describe("User ID (defaults to KILO_USER_ID)"),
  workspaceId: z.string().optional().default("default").describe("Workspace ID"),
})

export namespace GmailSkills {
  const log = Log.create({ service: "gworkspace.skill.gmail" })

  export const search = fn(GmailSearchInputSchema, async (input) => {
    const ctx = makeCtx()
    const userId = input.userId ?? process.env.KILO_USER_ID
    const workspaceId = input.workspaceId

    if (!userId) {
      throw new Error("userId is required (set via input or KILO_USER_ID environment variable)")
    }

    log.info("gmail.search", { query: input.query, userId, workspaceId })
    emitIntent("gmail", "messages.search")
    const policy = GWorkspaceAgency.getPolicy("gmail", "messages.search")
    emitPolicy("gmail", "messages.search", policy)
    if (policy === "DENY") {
      throw new Error("Operation denied by policy")
    }

    const brokerCfg = await GWorkspaceBroker.toBrokerConfig({
      userId,
      workspaceId,
      preferNative: true,
      mcpFallbackEnabled: true,
    })

    const result = await GWorkspaceBroker.gmail("search", { query: input.query, maxResults: input.maxResults }, brokerCfg)

    await GWorkspaceAudit.recordGmail("gmail.search", result.success ? "success" : "failure", {
      ...ctx,
      query: input.query,
      provider: result.provider,
    })

    if (!result.success) {
      throw new Error(result.error ?? "Gmail search failed")
    }

    return result.data
  })

  export const read = fn(GmailReadInputSchema, async (input) => {
    const ctx = makeCtx()
    const userId = input.userId ?? process.env.KILO_USER_ID
    const workspaceId = input.workspaceId

    if (!userId) {
      throw new Error("userId is required (set via input or KILO_USER_ID environment variable)")
    }

    log.info("gmail.read", { messageId: input.messageId, userId, workspaceId })
    emitIntent("gmail", "messages.get")
    const policy = GWorkspaceAgency.getPolicy("gmail", "messages.get")
    emitPolicy("gmail", "messages.get", policy)
    if (policy === "DENY") {
      throw new Error("Operation denied by policy")
    }

    const brokerCfg = await GWorkspaceBroker.toBrokerConfig({
      userId,
      workspaceId,
      preferNative: true,
      mcpFallbackEnabled: true,
    })

    const result = await GWorkspaceBroker.gmail("read", { messageId: input.messageId }, brokerCfg)

    await GWorkspaceAudit.recordGmail("gmail.read", result.success ? "success" : "failure", {
      ...ctx,
      messageId: input.messageId,
      provider: result.provider,
    })

    if (!result.success) {
      throw new Error(result.error ?? "Gmail read failed")
    }

    return result.data
  })

  export const send = fn(GmailSendInputSchema, async (input) => {
    const ctx = makeCtx()
    const userId = input.userId ?? process.env.KILO_USER_ID
    const workspaceId = input.workspaceId

    if (!userId) {
      throw new Error("userId is required (set via input or KILO_USER_ID environment variable)")
    }

    log.info("gmail.send", { to: input.to.length, subject: input.subject, userId, workspaceId })
    emitIntent("gmail", "messages.send")
    const policy = GWorkspaceAgency.getPolicy("gmail", "messages.send")
    emitPolicy("gmail", "messages.send", policy)
    if (policy === "DENY") {
      throw new Error("Operation denied by policy")
    }
    if (input.to.length > 50) {
      throw new Error("Bulk send to >50 recipients is denied")
    }

    // Check if HITL is required
    if (
      GWorkspaceAgency.requiresApproval("gmail", "messages.send") ||
      GWorkspaceHITL.requiresHitl("gmail", "messages.send", { to: input.to })
    ) {
      const hitlRequest = await GWorkspaceHITL.createRequest(
        "gmail",
        "messages.send",
        "high",
        `Send email to ${input.to.length} recipient(s): ${input.subject}`,
        {
          to: input.to,
          subject: input.subject,
          body: input.body,
          correlationId: ctx.correlationId,
          traceId: ctx.traceId,
          userId: ctx.userId,
          userEmail: ctx.userEmail,
          sessionId: ctx.sessionId,
        },
      )

      // Wait for approval
      const approved = await GWorkspaceHITL.waitForApproval(hitlRequest.id)
      if (!approved) {
        await GWorkspaceAudit.recordGmail("gmail.send", "hitl_denied", {
          ...ctx,
          recipients: input.to,
        })
        throw new Error("HITL request denied")
      }

      await GWorkspaceAudit.recordGmail("gmail.send", "hitl_approved", {
        ...ctx,
        recipients: input.to,
        hitlRequestId: hitlRequest.id,
      })
    }

    const brokerCfg = await GWorkspaceBroker.toBrokerConfig({
      userId,
      workspaceId,
      preferNative: true,
      mcpFallbackEnabled: true,
    })

    const result = await GWorkspaceBroker.gmail("send", {
      to: input.to,
      subject: input.subject,
      body: input.body,
    }, brokerCfg)

    await GWorkspaceAudit.recordGmail("gmail.send", result.success ? "success" : "failure", {
      ...ctx,
      recipients: input.to,
      provider: result.provider,
    })

    if (!result.success) {
      throw new Error(result.error ?? "Gmail send failed")
    }

    return result.data
  })
}

// ============================================================================
// Calendar Skills
// ============================================================================

export const CalendarListInputSchema = z.object({
  calendarId: z.string().optional().default("primary"),
  timeMin: z.string().optional(),
  timeMax: z.string().optional(),
  userId: z.string().optional().describe("User ID (defaults to KILO_USER_ID)"),
  workspaceId: z.string().optional().default("default").describe("Workspace ID"),
})

export const CalendarCreateInputSchema = z.object({
  calendarId: z.string().optional().default("primary"),
  summary: z.string().describe("Event title"),
  start: z.string().describe("ISO 8601 start"),
  end: z.string().describe("ISO 8601 end"),
  attendees: z.array(z.string()).optional(),
  location: z.string().optional(),
  idempotencyKey: z.string().optional().describe("Idempotency key to prevent duplicate operations"),
  userId: z.string().optional().describe("User ID (defaults to KILO_USER_ID)"),
  workspaceId: z.string().optional().default("default").describe("Workspace ID"),
})

export namespace CalendarSkills {
  const log = Log.create({ service: "gworkspace.skill.calendar" })

  export const list = fn(CalendarListInputSchema, async (input) => {
    const ctx = makeCtx()
    const userId = input.userId ?? process.env.KILO_USER_ID
    const workspaceId = input.workspaceId

    if (!userId) {
      throw new Error("userId is required (set via input or KILO_USER_ID environment variable)")
    }

    log.info("calendar.list", { calendarId: input.calendarId, userId, workspaceId })
    emitIntent("calendar", "events.list")
    const policy = GWorkspaceAgency.getPolicy("calendar", "events.list")
    emitPolicy("calendar", "events.list", policy)
    if (policy === "DENY") {
      throw new Error("Operation denied by policy")
    }

    const brokerCfg = await GWorkspaceBroker.toBrokerConfig({
      userId,
      workspaceId,
      preferNative: true,
      mcpFallbackEnabled: true,
    })

    const result = await GWorkspaceBroker.calendar("events", {
      calendarId: input.calendarId,
      timeMin: input.timeMin,
      timeMax: input.timeMax,
    }, brokerCfg)

    await GWorkspaceAudit.recordCalendar("calendar.list", result.success ? "success" : "failure", {
      ...ctx,
      calendarId: input.calendarId,
      provider: result.provider,
    })

    if (!result.success) {
      throw new Error(result.error ?? "Calendar list failed")
    }

    return result.data
  })

  export const create = fn(CalendarCreateInputSchema, async (input) => {
    const ctx = makeCtx()
    const userId = input.userId ?? process.env.KILO_USER_ID
    const workspaceId = input.workspaceId

    if (!userId) {
      throw new Error("userId is required (set via input or KILO_USER_ID environment variable)")
    }

    log.info("calendar.create", { summary: input.summary, attendees: input.attendees?.length, userId, workspaceId })
    emitIntent("calendar", "events.insert")
    const policy = GWorkspaceAgency.getPolicy("calendar", "events.insert")
    emitPolicy("calendar", "events.insert", policy)
    if (policy === "DENY") {
      throw new Error("Operation denied by policy")
    }

    // Generate idempotency key if not provided
    const idempotencyKey = input.idempotencyKey ?? await GWorkspaceIdempotency.generateKey("calendar.create", {
      summary: input.summary,
      start: input.start,
      end: input.end,
    })

    // Check idempotency cache
    const cached = await GWorkspaceIdempotency.getCachedResult(
      idempotencyKey,
      userId,
      workspaceId,
      "calendar.create"
    )
    if (cached) {
      log.info("calendar.create idempotency cache hit", { userId })
      return cached
    }

    // Check if HITL is required
    if (
      GWorkspaceAgency.requiresApproval("calendar", "events.insert") ||
      GWorkspaceHITL.requiresHitl("calendar", "events.insert", { attendees: input.attendees })
    ) {
      const hitlRequest = await GWorkspaceHITL.createRequest(
        "calendar",
        "events.insert",
        "high",
        `Create event with ${input.attendees?.length ?? 0} attendees: ${input.summary}`,
        {
          summary: input.summary,
          attendees: input.attendees,
          correlationId: ctx.correlationId,
          traceId: ctx.traceId,
          userId: ctx.userId,
          userEmail: ctx.userEmail,
          sessionId: ctx.sessionId,
        },
      )

      const approved = await GWorkspaceHITL.waitForApproval(hitlRequest.id)
      if (!approved) {
        await GWorkspaceAudit.recordCalendar("calendar.create", "hitl_denied", {
          ...ctx,
          summary: input.summary,
          attendeeCount: input.attendees?.length,
          hitlRequestId: hitlRequest.id,
        })
        throw new Error("HITL request denied")
      }

      await GWorkspaceAudit.recordCalendar("calendar.create", "hitl_approved", {
        ...ctx,
        summary: input.summary,
        attendeeCount: input.attendees?.length,
        hitlRequestId: hitlRequest.id,
      })
    }

    const brokerCfg = await GWorkspaceBroker.toBrokerConfig({
      userId,
      workspaceId,
      preferNative: true,
      mcpFallbackEnabled: true,
    })

    const result = await GWorkspaceBroker.calendar("create", {
      calendarId: input.calendarId,
      summary: input.summary,
      start: input.start,
      end: input.end,
      location: input.location,
      attendees: input.attendees,
    }, brokerCfg)

    await GWorkspaceAudit.recordCalendar("calendar.create", result.success ? "success" : "failure", {
      ...ctx,
      summary: input.summary,
      attendeeCount: input.attendees?.length,
      provider: result.provider,
    })

    if (!result.success) {
      throw new Error(result.error ?? "Calendar create failed")
    }

    // Store result in idempotency cache
    await GWorkspaceIdempotency.cacheResult(
      idempotencyKey,
      userId,
      workspaceId,
      "calendar.create",
      result.data
    )

    return result.data
  })
}

// ============================================================================
// Drive Skills
// ============================================================================

export const DriveSearchInputSchema = z.object({
  query: z.string().describe("Search query"),
  pageSize: z.number().optional().default(10),
  userId: z.string().optional().describe("User ID (defaults to KILO_USER_ID)"),
  workspaceId: z.string().optional().default("default").describe("Workspace ID"),
})

export const DriveShareInputSchema = z.object({
  fileId: z.string().describe("File ID"),
  email: z.string().describe("Email to share with"),
  role: z.enum(["reader", "writer", "commenter"]).default("reader"),
  userId: z.string().optional().describe("User ID (defaults to KILO_USER_ID)"),
  workspaceId: z.string().optional().default("default").describe("Workspace ID"),
})

export namespace DriveSkills {
  const log = Log.create({ service: "gworkspace.skill.drive" })

  export const search = fn(DriveSearchInputSchema, async (input) => {
    const ctx = makeCtx()
    const userId = input.userId ?? process.env.KILO_USER_ID
    const workspaceId = input.workspaceId

    if (!userId) {
      throw new Error("userId is required (set via input or KILO_USER_ID environment variable)")
    }

    log.info("drive.search", { query: input.query, userId, workspaceId })
    emitIntent("drive", "files.search")
    const policy = GWorkspaceAgency.getPolicy("drive", "files.search")
    emitPolicy("drive", "files.search", policy)
    if (policy === "DENY") {
      throw new Error("Operation denied by policy")
    }

    const brokerCfg = await GWorkspaceBroker.toBrokerConfig({
      userId,
      workspaceId,
      preferNative: true,
      mcpFallbackEnabled: true,
    })

    const result = await GWorkspaceBroker.drive("search", {
      query: input.query,
      pageSize: input.pageSize,
    }, brokerCfg)

    await GWorkspaceAudit.recordDrive("drive.search", result.success ? "success" : "failure", {
      ...ctx,
      provider: result.provider,
    })

    if (!result.success) {
      throw new Error(result.error ?? "Drive search failed")
    }

    return result.data
  })

  export const share = fn(DriveShareInputSchema, async (input) => {
    const ctx = makeCtx()
    const userId = input.userId ?? process.env.KILO_USER_ID
    const workspaceId = input.workspaceId

    if (!userId) {
      throw new Error("userId is required (set via input or KILO_USER_ID environment variable)")
    }

    log.info("drive.share", { fileId: input.fileId, email: input.email, userId, workspaceId })
    emitIntent("drive", "files.share")
    const policy = GWorkspaceAgency.getPolicy("drive", "files.share")
    emitPolicy("drive", "files.share", policy)
    if (policy === "DENY") {
      throw new Error("Operation denied by policy")
    }

    // Check if HITL is required for external sharing
    if (
      GWorkspaceAgency.requiresApproval("drive", "files.share") ||
      GWorkspaceHITL.requiresHitl("drive", "files.share", { email: input.email })
    ) {
      const hitlRequest = await GWorkspaceHITL.createRequest(
        "drive",
        "files.share",
        "critical",
        `Share file ${input.fileId} with external user: ${input.email}`,
        {
          fileId: input.fileId,
          email: input.email,
          role: input.role,
          correlationId: ctx.correlationId,
          traceId: ctx.traceId,
          userId: ctx.userId,
          userEmail: ctx.userEmail,
          sessionId: ctx.sessionId,
        },
      )

      const approved = await GWorkspaceHITL.waitForApproval(hitlRequest.id)
      if (!approved) {
        await GWorkspaceAudit.recordDrive("drive.share", "hitl_denied", {
          ...ctx,
          fileId: input.fileId,
          sharedWith: [input.email],
          hitlRequestId: hitlRequest.id,
        })
        throw new Error("HITL request denied")
      }

      await GWorkspaceAudit.recordDrive("drive.share", "hitl_approved", {
        ...ctx,
        fileId: input.fileId,
        sharedWith: [input.email],
        hitlRequestId: hitlRequest.id,
      })
    }

    const brokerCfg = await GWorkspaceBroker.toBrokerConfig({
      userId,
      workspaceId,
      preferNative: true,
      mcpFallbackEnabled: true,
    })

    const result = await GWorkspaceBroker.drive("share", {
      fileId: input.fileId,
      email: input.email,
      role: input.role,
    }, brokerCfg)

    await GWorkspaceAudit.recordDrive("drive.share", result.success ? "success" : "failure", {
      ...ctx,
      fileId: input.fileId,
      sharedWith: [input.email],
      provider: result.provider,
    })

    if (!result.success) {
      throw new Error(result.error ?? "Drive share failed")
    }

    return result.data
  })
}

// ============================================================================
// Docs Skills
// ============================================================================

export const DocsReadInputSchema = z.object({
  documentId: z.string().describe("Document ID"),
  userId: z.string().optional().describe("User ID (defaults to KILO_USER_ID)"),
  workspaceId: z.string().optional().default("default").describe("Workspace ID"),
})

export const DocsDownloadInputSchema = z.object({
  documentId: z.string().describe("Document ID"),
  format: z
    .enum(["pdf", "docx", "txt", "csv"])
    .optional()
    .default("pdf")
    .describe("Export format"),
  userId: z.string().optional().describe("User ID (defaults to KILO_USER_ID)"),
  workspaceId: z.string().optional().default("default").describe("Workspace ID"),
})

export namespace DocsSkills {
  const log = Log.create({ service: "gworkspace.skill.docs" })

  export const read = fn(DocsReadInputSchema, async (input) => {
    const ctx = makeCtx()
    const userId = input.userId ?? process.env.KILO_USER_ID
    const workspaceId = input.workspaceId

    if (!userId) {
      throw new Error("userId is required (set via input or KILO_USER_ID environment variable)")
    }

    log.info("docs.read", { documentId: input.documentId, userId, workspaceId })
    emitIntent("docs", "documents.get")
    const policy = GWorkspaceAgency.getPolicy("docs", "documents.get")
    emitPolicy("docs", "documents.get", policy)
    if (policy === "DENY") {
      throw new Error("Operation denied by policy")
    }

    const brokerCfg = await GWorkspaceBroker.toBrokerConfig({
      userId,
      workspaceId,
      preferNative: true,
      mcpFallbackEnabled: true,
    })

    const result = await GWorkspaceBroker.executeDocs("read", { documentId: input.documentId }, brokerCfg)

    await GWorkspaceAudit.recordDocs("docs.read", result.success ? "success" : "failure", {
      ...ctx,
      documentId: input.documentId,
      provider: result.provider,
    })

    if (!result.success) {
      throw new Error(result.error ?? "Docs read failed")
    }

    return result.data
  })

  export const download = fn(DocsDownloadInputSchema, async (input) => {
    const ctx = makeCtx()
    const userId = input.userId ?? process.env.KILO_USER_ID
    const workspaceId = input.workspaceId

    if (!userId) {
      throw new Error("userId is required (set via input or KILO_USER_ID environment variable)")
    }

    log.info("docs.download", { documentId: input.documentId, format: input.format, userId, workspaceId })
    emitIntent("docs", "documents.export")

    try {
      // Get access token
      const accessToken = await BrokerTokenIntegration.getAccessToken({
        userId,
        workspaceId,
      })

      // Map format to MIME type
      const formatMap: Record<string, ExportFormat> = {
        pdf: EXPORT_FORMATS.PDF,
        docx: EXPORT_FORMATS.DOCX,
        txt: EXPORT_FORMATS.PLAINTEXT,
        csv: EXPORT_FORMATS.CSV,
      }

      const mimeType = formatMap[input.format] || EXPORT_FORMATS.PDF

      // Check if format is supported for Docs
      if (!DocumentExporter.isSupportedFormat("docs", mimeType)) {
        throw new Error(`Format ${input.format} not supported for Google Docs`)
      }

      // Export document
      const result = await DocumentExporter.exportFromDrive(accessToken, input.documentId, {
        format: mimeType,
        timeout: 30000,
        maxSize: 10 * 1024 * 1024, // 10MB
      })

      // Parse content
      const parsed = await ContentParser.parseContent(result.buffer, result.mimeType)

      await GWorkspaceAudit.recordDocs("docs.download", "success", {
        ...ctx,
        documentId: input.documentId,
        format: input.format,
        sizeBytes: result.size,
      })

      return {
        success: true,
        format: input.format,
        size: result.size,
        text: parsed.text,
        metadata: parsed.metadata,
        summary: ContentParser.extractSummary(parsed, 300),
      }
    } catch (error) {
      log.error("docs.download error", {
        documentId: input.documentId,
        error: error instanceof Error ? error.message : String(error),
      })

      await GWorkspaceAudit.recordDocs("docs.download", "failure", {
        ...ctx,
        documentId: input.documentId,
        error: error instanceof Error ? error.message : String(error),
      })

      throw error
    }
  })
}

// ============================================================================
// Sheets Skills
// ============================================================================

export const SheetsReadInputSchema = z.object({
  spreadsheetId: z.string().describe("Spreadsheet ID"),
  range: z.string().optional(),
  userId: z.string().optional().describe("User ID (defaults to KILO_USER_ID)"),
  workspaceId: z.string().optional().default("default").describe("Workspace ID"),
})

export const SheetsDownloadInputSchema = z.object({
  spreadsheetId: z.string().describe("Spreadsheet ID"),
  format: z
    .enum(["xlsx", "csv", "tsv"])
    .optional()
    .default("csv")
    .describe("Export format"),
  userId: z.string().optional().describe("User ID (defaults to KILO_USER_ID)"),
  workspaceId: z.string().optional().default("default").describe("Workspace ID"),
})

export namespace SheetsSkills {
  const log = Log.create({ service: "gworkspace.skill.sheets" })

  export const read = fn(SheetsReadInputSchema, async (input) => {
    const ctx = makeCtx()
    const userId = input.userId ?? process.env.KILO_USER_ID
    const workspaceId = input.workspaceId

    if (!userId) {
      throw new Error("userId is required (set via input or KILO_USER_ID environment variable)")
    }

    log.info("sheets.read", { spreadsheetId: input.spreadsheetId, userId, workspaceId })
    emitIntent("sheets", "spreadsheets.get")
    const policy = GWorkspaceAgency.getPolicy("sheets", "spreadsheets.get")
    emitPolicy("sheets", "spreadsheets.get", policy)
    if (policy === "DENY") {
      throw new Error("Operation denied by policy")
    }

    const brokerCfg = await GWorkspaceBroker.toBrokerConfig({
      userId,
      workspaceId,
      preferNative: true,
      mcpFallbackEnabled: true,
    })

    const result = await GWorkspaceBroker.executeSheets("read", {
      spreadsheetId: input.spreadsheetId,
      range: input.range,
    }, brokerCfg)

    await GWorkspaceAudit.recordSheets("sheets.read", result.success ? "success" : "failure", {
      ...ctx,
      spreadsheetId: input.spreadsheetId,
      range: input.range,
      provider: result.provider,
    })

    if (!result.success) {
      throw new Error(result.error ?? "Sheets read failed")
    }

    return result.data
  })

  export const download = fn(SheetsDownloadInputSchema, async (input) => {
    const ctx = makeCtx()
    const userId = input.userId ?? process.env.KILO_USER_ID
    const workspaceId = input.workspaceId
    const log = Log.create({ service: "gworkspace.skill.sheets" })

    if (!userId) {
      throw new Error("userId is required (set via input or KILO_USER_ID environment variable)")
    }

    log.info("sheets.download", { spreadsheetId: input.spreadsheetId, format: input.format, userId, workspaceId })
    emitIntent("sheets", "spreadsheets.export")

    try {
      // Get access token
      const accessToken = await BrokerTokenIntegration.getAccessToken({
        userId,
        workspaceId,
      })

      // Map format to MIME type
      const formatMap: Record<string, ExportFormat> = {
        xlsx: EXPORT_FORMATS.XLSX,
        csv: EXPORT_FORMATS.CSV,
        tsv: EXPORT_FORMATS.TSV,
      }

      const mimeType = formatMap[input.format] || EXPORT_FORMATS.CSV

      // Check if format is supported for Sheets
      if (!DocumentExporter.isSupportedFormat("sheets", mimeType)) {
        throw new Error(`Format ${input.format} not supported for Google Sheets`)
      }

      // Export spreadsheet
      const result = await DocumentExporter.exportFromDrive(accessToken, input.spreadsheetId, {
        format: mimeType,
        timeout: 30000,
        maxSize: 10 * 1024 * 1024, // 10MB
      })

      // Parse content
      const parsed = await ContentParser.parseContent(result.buffer, result.mimeType)

      await GWorkspaceAudit.recordSheets("sheets.download", "success", {
        ...ctx,
        spreadsheetId: input.spreadsheetId,
        format: input.format,
        sizeBytes: result.size,
      })

      return {
        success: true,
        format: input.format,
        size: result.size,
        text: parsed.text,
        metadata: parsed.metadata,
        summary: ContentParser.extractSummary(parsed, 300),
      }
    } catch (error) {
      log.error("sheets.download error", {
        spreadsheetId: input.spreadsheetId,
        error: error instanceof Error ? error.message : String(error),
      })

      await GWorkspaceAudit.recordSheets("sheets.download", "failure", {
        ...ctx,
        spreadsheetId: input.spreadsheetId,
        error: error instanceof Error ? error.message : String(error),
      })

      throw error
    }
  })
}

// ============================================================================
// Document Search Skill
// ============================================================================

export const DocumentSearchInputSchema = z.object({
  query: z.string().describe("Search query (title, content, or metadata)"),
  type: z.enum(["doc", "sheet", "slide", "file"]).optional().describe("Filter by document type"),
  tag: z.string().optional().describe("Filter by tag"),
  userId: z.string().optional().describe("User ID (defaults to KILO_USER_ID)"),
  workspaceId: z.string().optional().default("default").describe("Workspace ID"),
})

export const documentSearch = fn(DocumentSearchInputSchema, async (input) => {
  const ctx = makeCtx()
  const userId = input.userId ?? process.env.KILO_USER_ID
  const workspaceId = input.workspaceId
  const log = Log.create({ service: "gworkspace.skill.search" })

  if (!userId) {
    throw new Error("userId is required (set via input or KILO_USER_ID environment variable)")
  }

  log.info("document.search", { query: input.query, type: input.type, tag: input.tag, userId, workspaceId })
  emitIntent("search", "documents.search")

  try {
    const startTime = Date.now()

    // Search in index
    const results = DocumentIndexer.search(workspaceId, input.query, { limit: 50 })

    // Apply filters
    let filtered = results
    const filters: string[] = []

    if (input.type) {
      const type = input.type
      filtered = filtered.filter((r) => r.document.type === type)
      filters.push(`type:${type}`)
    }

    if (input.tag) {
      const tag = input.tag
      filtered = filtered.filter((r) => r.document.tags.includes(tag))
      filters.push(`tag:${tag}`)
    }

    const durationMs = Date.now() - startTime

    await GWorkspaceAudit.recordSearch("documents.search", "success", {
      ...ctx,
      query: input.query,
      resultCount: filtered.length,
      filters,
      durationMs,
    })

    return {
      success: true,
      query: input.query,
      resultCount: filtered.length,
      results: filtered.map((r) => ({
        id: r.document.id,
        title: r.document.title,
        type: r.document.type,
        owner: r.document.owner,
        lastModified: r.document.lastModified,
        score: r.score,
        matches: r.matches,
        tags: r.document.tags,
      })),
    }
  } catch (error) {
    log.error("search error", {
      query: input.query,
      error: error instanceof Error ? error.message : String(error),
    })

    await GWorkspaceAudit.recordSearch("documents.search", "failure", {
      ...ctx,
      query: input.query,
      error: error instanceof Error ? error.message : String(error),
    })

    throw error
  }
})

// ============================================================================
// Document Tagging Skill
// ============================================================================

export const DocumentTagInputSchema = z.object({
  documentId: z.string().describe("Document ID to tag"),
  action: z.enum(["add", "remove"]).describe("Add or remove tag"),
  tag: z.string().describe("Tag to add/remove"),
  userId: z.string().optional().describe("User ID (defaults to KILO_USER_ID)"),
  workspaceId: z.string().optional().default("default").describe("Workspace ID"),
})

export const documentTag = fn(DocumentTagInputSchema, async (input) => {
  const ctx = makeCtx()
  const userId = input.userId ?? process.env.KILO_USER_ID
  const workspaceId = input.workspaceId
  const log = Log.create({ service: "gworkspace.skill.tagging" })

  if (!userId) {
    throw new Error("userId is required (set via input or KILO_USER_ID environment variable)")
  }

  log.info("document.tag", { documentId: input.documentId, action: input.action, tag: input.tag, userId })
  emitIntent("search", "documents.tag")

  try {
    const doc = DocumentIndexer.getDocument(workspaceId, input.documentId)

    if (!doc) {
      throw new Error(`Document not found: ${input.documentId}`)
    }

    if (input.action === "add") {
      DocumentIndexer.addTag(workspaceId, input.documentId, input.tag)

      await GWorkspaceAudit.recordSearch("documents.tag", "success", {
        ...ctx,
        query: `${input.documentId}:${input.tag}`,
        filters: [`action:${input.action}`],
      })

      return {
        success: true,
        action: "add",
        documentId: input.documentId,
        tag: input.tag,
        tags: doc.tags,
      }
    } else {
      DocumentIndexer.removeTag(workspaceId, input.documentId, input.tag)

      await GWorkspaceAudit.recordSearch("documents.tag", "success", {
        ...ctx,
        query: `${input.documentId}:${input.tag}`,
        filters: [`action:${input.action}`],
      })

      return {
        success: true,
        action: "remove",
        documentId: input.documentId,
        tag: input.tag,
        tags: doc.tags.filter((t) => t !== input.tag),
      }
    }
  } catch (error) {
    log.error("tagging error", {
      documentId: input.documentId,
      error: error instanceof Error ? error.message : String(error),
    })

    await GWorkspaceAudit.recordSearch("documents.tag", "failure", {
      ...ctx,
      query: `${input.documentId}:${input.tag}`,
      error: error instanceof Error ? error.message : String(error),
    })

    throw error
  }
})

// ============================================================================
// Index Statistics Skill
// ============================================================================

export const IndexStatsInputSchema = z.object({
  userId: z.string().optional().describe("User ID (defaults to KILO_USER_ID)"),
  workspaceId: z.string().optional().default("default").describe("Workspace ID"),
})

export const indexStats = fn(IndexStatsInputSchema, async (input) => {
  const ctx = makeCtx()
  const userId = input.userId ?? process.env.KILO_USER_ID
  const workspaceId = input.workspaceId
  const log = Log.create({ service: "gworkspace.skill.indexing" })

  if (!userId) {
    throw new Error("userId is required (set via input or KILO_USER_ID environment variable)")
  }

  log.info("index.stats", { userId, workspaceId })
  emitIntent("search", "index.stats")

  try {
    const stats = DocumentIndexer.getStats(workspaceId)

    await GWorkspaceAudit.recordSearch("index.stats", "success", {
      ...ctx,
      resultCount: stats.totalDocuments,
    })

    return {
      success: true,
      workspace: workspaceId,
      ...stats,
      indexHealthy: stats.indexedDocuments === stats.totalDocuments,
    }
  } catch (error) {
    log.error("stats error", {
      error: error instanceof Error ? error.message : String(error),
    })

    await GWorkspaceAudit.recordSearch("index.stats", "failure", {
      ...ctx,
      error: error instanceof Error ? error.message : String(error),
    })

    throw error
  }
})

// ============================================================================
// Calendar Update Skill
// ============================================================================

export const CalendarUpdateInputSchema = z.object({
  calendarId: z.string().optional().default("primary").describe("Calendar ID"),
  eventId: z.string().describe("Event ID to update"),
  event: z.record(z.string(), z.unknown()).describe("Event object with updates"),
  idempotencyKey: z.string().optional().describe("Idempotency key to prevent duplicate operations"),
  userId: z.string().optional().describe("User ID (defaults to KILO_USER_ID)"),
  workspaceId: z.string().optional().default("default").describe("Workspace ID"),
})

export const calendarUpdate = fn(CalendarUpdateInputSchema, async (input) => {
  const ctx = makeCtx()
  const userId = input.userId ?? process.env.KILO_USER_ID
  const workspaceId = input.workspaceId

  if (!userId) throw new Error("userId is required (set via input or KILO_USER_ID environment variable)")

  emitIntent("calendar", "events.update")
  const policy = GWorkspaceAgency.getPolicy("calendar", "events.update")
  if (policy === "DENY") throw new Error("Operation denied by policy")

  // Generate idempotency key if not provided
  const idempotencyKey = input.idempotencyKey ?? await GWorkspaceIdempotency.generateKey("calendar.update", {
    eventId: input.eventId,
    event: input.event,
  })

  // Check idempotency cache
  const cached = await GWorkspaceIdempotency.getCachedResult(
    idempotencyKey,
    userId,
    workspaceId,
    "calendar.update"
  )
  if (cached) return cached

  if (GWorkspaceAgency.requiresApproval("calendar", "events.update")) {
    const hitlReq = await GWorkspaceHITL.createRequest(
      "calendar",
      "events.update",
      "high",
      `Update event ${input.eventId}`,
      { eventId: input.eventId, ...ctx },
    )
    const approved = await GWorkspaceHITL.waitForApproval(hitlReq.id)
    if (!approved) {
      await GWorkspaceAudit.recordCalendar("calendar.update", "hitl_denied", { ...ctx })
      throw new Error("HITL request denied")
    }
  }

  const brokerCfg = await GWorkspaceBroker.toBrokerConfig({
    userId,
    workspaceId,
    preferNative: true,
    mcpFallbackEnabled: true,
  })
  const result = await GWorkspaceBroker.calendar(
    "update",
    { calendarId: input.calendarId, eventId: input.eventId, event: input.event },
    brokerCfg,
  )

  await GWorkspaceAudit.recordCalendar("calendar.update", result.success ? "success" : "failure", {
    ...ctx,
    eventId: input.eventId,
    provider: result.provider,
  })

  if (!result.success) throw new Error(result.error ?? "Calendar update failed")

  // Store result in idempotency cache
  await GWorkspaceIdempotency.cacheResult(
    idempotencyKey,
    userId,
    workspaceId,
    "calendar.update",
    result.data
  )

  return result.data
})

// ============================================================================
// Calendar Delete Skill
// ============================================================================

export const CalendarDeleteInputSchema = z.object({
  calendarId: z.string().optional().default("primary").describe("Calendar ID"),
  eventId: z.string().describe("Event ID to delete"),
  idempotencyKey: z.string().optional().describe("Idempotency key to prevent duplicate operations"),
  userId: z.string().optional().describe("User ID (defaults to KILO_USER_ID)"),
  workspaceId: z.string().optional().default("default").describe("Workspace ID"),
})

export const calendarDelete = fn(CalendarDeleteInputSchema, async (input) => {
  const ctx = makeCtx()
  const userId = input.userId ?? process.env.KILO_USER_ID
  const workspaceId = input.workspaceId

  if (!userId) throw new Error("userId is required (set via input or KILO_USER_ID environment variable)")

  emitIntent("calendar", "events.delete")
  const policy = GWorkspaceAgency.getPolicy("calendar", "events.delete")
  if (policy === "DENY") throw new Error("Operation denied by policy")

  // Generate idempotency key if not provided
  const idempotencyKey = input.idempotencyKey ?? await GWorkspaceIdempotency.generateKey("calendar.delete", {
    eventId: input.eventId,
  })

  // Check idempotency cache
  const cached = await GWorkspaceIdempotency.getCachedResult(
    idempotencyKey,
    userId,
    workspaceId,
    "calendar.delete"
  )
  if (cached) return cached

  if (GWorkspaceAgency.requiresApproval("calendar", "events.delete")) {
    const hitlReq = await GWorkspaceHITL.createRequest(
      "calendar",
      "events.delete",
      "high",
      `Delete event ${input.eventId}`,
      { eventId: input.eventId, ...ctx },
    )
    const approved = await GWorkspaceHITL.waitForApproval(hitlReq.id)
    if (!approved) {
      await GWorkspaceAudit.recordCalendar("calendar.delete", "hitl_denied", { ...ctx })
      throw new Error("HITL request denied")
    }
  }

  const brokerCfg = await GWorkspaceBroker.toBrokerConfig({
    userId,
    workspaceId,
    preferNative: true,
    mcpFallbackEnabled: true,
  })
  const result = await GWorkspaceBroker.calendar(
    "delete",
    { calendarId: input.calendarId, eventId: input.eventId },
    brokerCfg,
  )

  await GWorkspaceAudit.recordCalendar("calendar.delete", result.success ? "success" : "failure", {
    ...ctx,
    eventId: input.eventId,
    provider: result.provider,
  })

  if (!result.success) throw new Error(result.error ?? "Calendar delete failed")

  // Store result in idempotency cache
  await GWorkspaceIdempotency.cacheResult(
    idempotencyKey,
    userId,
    workspaceId,
    "calendar.delete",
    result.data
  )

  return result.data
})

// ============================================================================
// Drive Create Skill
// ============================================================================

export const DriveCreateInputSchema = z.object({
  name: z.string().describe("File name"),
  mimeType: z.string().optional().describe("MIME type (e.g., application/vnd.google-apps.document)"),
  parents: z.array(z.string()).optional().describe("Parent folder IDs"),
  idempotencyKey: z.string().optional().describe("Idempotency key to prevent duplicate operations"),
  userId: z.string().optional().describe("User ID (defaults to KILO_USER_ID)"),
  workspaceId: z.string().optional().default("default").describe("Workspace ID"),
})

export const driveCreate = fn(DriveCreateInputSchema, async (input) => {
  const ctx = makeCtx()
  const userId = input.userId ?? process.env.KILO_USER_ID
  const workspaceId = input.workspaceId

  if (!userId) throw new Error("userId is required (set via input or KILO_USER_ID environment variable)")

  emitIntent("drive", "files.create")
  const policy = GWorkspaceAgency.getPolicy("drive", "files.create")
  if (policy === "DENY") throw new Error("Operation denied by policy")

  const idempotencyKey = input.idempotencyKey ?? await GWorkspaceIdempotency.generateKey("drive.create", {
    name: input.name,
    mimeType: input.mimeType,
  })
  const cached = await GWorkspaceIdempotency.getCachedResult(idempotencyKey, userId, workspaceId, "drive.create")
  if (cached) return cached

  if (GWorkspaceAgency.requiresApproval("drive", "files.create")) {
    const hitlReq = await GWorkspaceHITL.createRequest(
      "drive",
      "files.create",
      "high",
      `Create file: ${input.name}`,
      { name: input.name, ...ctx },
    )
    const approved = await GWorkspaceHITL.waitForApproval(hitlReq.id)
    if (!approved) {
      await GWorkspaceAudit.recordDrive("drive.create", "hitl_denied", { ...ctx })
      throw new Error("HITL request denied")
    }
  }

  const brokerCfg = await GWorkspaceBroker.toBrokerConfig({
    userId,
    workspaceId,
    preferNative: true,
    mcpFallbackEnabled: true,
  })
  const result = await GWorkspaceBroker.drive(
    "create",
    { name: input.name, mimeType: input.mimeType, parents: input.parents },
    brokerCfg,
  )

  await GWorkspaceAudit.recordDrive("drive.create", result.success ? "success" : "failure", {
    ...ctx,
    fileName: input.name,
    provider: result.provider,
  })

  if (!result.success) throw new Error(result.error ?? "Drive create failed")

  await GWorkspaceIdempotency.cacheResult(idempotencyKey, userId, workspaceId, "drive.create", result.data)
  return result.data
})

// ============================================================================
// Drive Update Skill
// ============================================================================

export const DriveUpdateInputSchema = z.object({
  fileId: z.string().describe("File ID to update"),
  metadata: z.record(z.string(), z.unknown()).describe("Metadata to update (name, description, etc)"),
  idempotencyKey: z.string().optional().describe("Idempotency key to prevent duplicate operations"),
  userId: z.string().optional().describe("User ID (defaults to KILO_USER_ID)"),
  workspaceId: z.string().optional().default("default").describe("Workspace ID"),
})

export const driveUpdate = fn(DriveUpdateInputSchema, async (input) => {
  const ctx = makeCtx()
  const userId = input.userId ?? process.env.KILO_USER_ID
  const workspaceId = input.workspaceId

  if (!userId) throw new Error("userId is required (set via input or KILO_USER_ID environment variable)")

  emitIntent("drive", "files.update")
  const policy = GWorkspaceAgency.getPolicy("drive", "files.update")
  if (policy === "DENY") throw new Error("Operation denied by policy")

  const idempotencyKey = input.idempotencyKey ?? await GWorkspaceIdempotency.generateKey("drive.update", {
    fileId: input.fileId,
    metadata: input.metadata,
  })
  const cached = await GWorkspaceIdempotency.getCachedResult(idempotencyKey, userId, workspaceId, "drive.update")
  if (cached) return cached

  if (GWorkspaceAgency.requiresApproval("drive", "files.update")) {
    const hitlReq = await GWorkspaceHITL.createRequest(
      "drive",
      "files.update",
      "high",
      `Update file ${input.fileId}`,
      { fileId: input.fileId, ...ctx },
    )
    const approved = await GWorkspaceHITL.waitForApproval(hitlReq.id)
    if (!approved) {
      await GWorkspaceAudit.recordDrive("drive.update", "hitl_denied", { ...ctx })
      throw new Error("HITL request denied")
    }
  }

  const brokerCfg = await GWorkspaceBroker.toBrokerConfig({
    userId,
    workspaceId,
    preferNative: true,
    mcpFallbackEnabled: true,
  })
  const result = await GWorkspaceBroker.drive(
    "update",
    { fileId: input.fileId, metadata: input.metadata },
    brokerCfg,
  )

  await GWorkspaceAudit.recordDrive("drive.update", result.success ? "success" : "failure", {
    ...ctx,
    fileId: input.fileId,
    provider: result.provider,
  })

  if (!result.success) throw new Error(result.error ?? "Drive update failed")

  await GWorkspaceIdempotency.cacheResult(idempotencyKey, userId, workspaceId, "drive.update", result.data)
  return result.data
})

// ============================================================================
// Drive Delete Skill
// ============================================================================

export const DriveDeleteInputSchema = z.object({
  fileId: z.string().describe("File ID to delete"),
  idempotencyKey: z.string().optional().describe("Idempotency key to prevent duplicate operations"),
  userId: z.string().optional().describe("User ID (defaults to KILO_USER_ID)"),
  workspaceId: z.string().optional().default("default").describe("Workspace ID"),
})

export const driveDelete = fn(DriveDeleteInputSchema, async (input) => {
  const ctx = makeCtx()
  const userId = input.userId ?? process.env.KILO_USER_ID
  const workspaceId = input.workspaceId

  if (!userId) throw new Error("userId is required (set via input or KILO_USER_ID environment variable)")

  emitIntent("drive", "files.delete")
  const policy = GWorkspaceAgency.getPolicy("drive", "files.delete")
  if (policy === "DENY") throw new Error("Operation denied by policy")

  const idempotencyKey = input.idempotencyKey ?? await GWorkspaceIdempotency.generateKey("drive.delete", { fileId: input.fileId })
  const cached = await GWorkspaceIdempotency.getCachedResult(idempotencyKey, userId, workspaceId, "drive.delete")
  if (cached) return cached

  if (GWorkspaceAgency.requiresApproval("drive", "files.delete")) {
    const hitlReq = await GWorkspaceHITL.createRequest(
      "drive",
      "files.delete",
      "high",
      `Delete file ${input.fileId}`,
      { fileId: input.fileId, ...ctx },
    )
    const approved = await GWorkspaceHITL.waitForApproval(hitlReq.id)
    if (!approved) {
      await GWorkspaceAudit.recordDrive("drive.delete", "hitl_denied", { ...ctx })
      throw new Error("HITL request denied")
    }
  }

  const brokerCfg = await GWorkspaceBroker.toBrokerConfig({
    userId,
    workspaceId,
    preferNative: true,
    mcpFallbackEnabled: true,
  })
  const result = await GWorkspaceBroker.drive("delete", { fileId: input.fileId }, brokerCfg)

  await GWorkspaceAudit.recordDrive("drive.delete", result.success ? "success" : "failure", {
    ...ctx,
    fileId: input.fileId,
    provider: result.provider,
  })

  if (!result.success) throw new Error(result.error ?? "Drive delete failed")
  await GWorkspaceIdempotency.cacheResult(idempotencyKey, userId, workspaceId, "drive.delete", result.data)
  return result.data
})

// ============================================================================
// Drive Copy Skill
// ============================================================================

export const DriveCopyInputSchema = z.object({
  fileId: z.string().describe("File ID to copy"),
  name: z.string().describe("New file name"),
  idempotencyKey: z.string().optional().describe("Idempotency key to prevent duplicate operations"),
  userId: z.string().optional().describe("User ID (defaults to KILO_USER_ID)"),
  workspaceId: z.string().optional().default("default").describe("Workspace ID"),
})

export const driveCopy = fn(DriveCopyInputSchema, async (input) => {
  const ctx = makeCtx()
  const userId = input.userId ?? process.env.KILO_USER_ID
  const workspaceId = input.workspaceId

  if (!userId) throw new Error("userId is required (set via input or KILO_USER_ID environment variable)")

  emitIntent("drive", "files.copy")
  const policy = GWorkspaceAgency.getPolicy("drive", "files.copy")
  if (policy === "DENY") throw new Error("Operation denied by policy")

  const idempotencyKey = input.idempotencyKey ?? await GWorkspaceIdempotency.generateKey("drive.copy", { fileId: input.fileId, name: input.name })
  const cached = await GWorkspaceIdempotency.getCachedResult(idempotencyKey, userId, workspaceId, "drive.copy")
  if (cached) return cached

  if (GWorkspaceAgency.requiresApproval("drive", "files.copy")) {
    const hitlReq = await GWorkspaceHITL.createRequest(
      "drive",
      "files.copy",
      "high",
      `Copy file ${input.fileId} → ${input.name}`,
      { fileId: input.fileId, name: input.name, ...ctx },
    )
    const approved = await GWorkspaceHITL.waitForApproval(hitlReq.id)
    if (!approved) {
      await GWorkspaceAudit.recordDrive("drive.copy", "hitl_denied", { ...ctx })
      throw new Error("HITL request denied")
    }
  }

  const brokerCfg = await GWorkspaceBroker.toBrokerConfig({
    userId,
    workspaceId,
    preferNative: true,
    mcpFallbackEnabled: true,
  })
  const result = await GWorkspaceBroker.drive("copy", { fileId: input.fileId, name: input.name }, brokerCfg)

  await GWorkspaceAudit.recordDrive("drive.copy", result.success ? "success" : "failure", {
    ...ctx,
    fileId: input.fileId,
    fileName: input.name,
    provider: result.provider,
  })

  if (!result.success) throw new Error(result.error ?? "Drive copy failed")
  await GWorkspaceIdempotency.cacheResult(idempotencyKey, userId, workspaceId, "drive.copy", result.data)
  return result.data
})

// ============================================================================
// Drive Move Skill
// ============================================================================

export const DriveMoveInputSchema = z.object({
  fileId: z.string().describe("File ID to move"),
  addParents: z.array(z.string()).optional().describe("Folder IDs to add as parents"),
  removeParents: z.array(z.string()).optional().describe("Folder IDs to remove as parents"),
  idempotencyKey: z.string().optional().describe("Idempotency key to prevent duplicate operations"),
  userId: z.string().optional().describe("User ID (defaults to KILO_USER_ID)"),
  workspaceId: z.string().optional().default("default").describe("Workspace ID"),
})

export const driveMove = fn(DriveMoveInputSchema, async (input) => {
  const ctx = makeCtx()
  const userId = input.userId ?? process.env.KILO_USER_ID
  const workspaceId = input.workspaceId

  if (!userId) throw new Error("userId is required (set via input or KILO_USER_ID environment variable)")

  emitIntent("drive", "files.move")
  const policy = GWorkspaceAgency.getPolicy("drive", "files.move")
  if (policy === "DENY") throw new Error("Operation denied by policy")

  const idempotencyKey = input.idempotencyKey ?? await GWorkspaceIdempotency.generateKey("drive.move", { fileId: input.fileId, addParents: input.addParents, removeParents: input.removeParents })
  const cached = await GWorkspaceIdempotency.getCachedResult(idempotencyKey, userId, workspaceId, "drive.move")
  if (cached) return cached

  if (GWorkspaceAgency.requiresApproval("drive", "files.move")) {
    const hitlReq = await GWorkspaceHITL.createRequest(
      "drive",
      "files.move",
      "high",
      `Move file ${input.fileId}`,
      { fileId: input.fileId, ...ctx },
    )
    const approved = await GWorkspaceHITL.waitForApproval(hitlReq.id)
    if (!approved) {
      await GWorkspaceAudit.recordDrive("drive.move", "hitl_denied", { ...ctx })
      throw new Error("HITL request denied")
    }
  }

  const brokerCfg = await GWorkspaceBroker.toBrokerConfig({
    userId,
    workspaceId,
    preferNative: true,
    mcpFallbackEnabled: true,
  })
  const result = await GWorkspaceBroker.drive(
    "move",
    { fileId: input.fileId, addParents: input.addParents, removeParents: input.removeParents },
    brokerCfg,
  )

  await GWorkspaceAudit.recordDrive("drive.move", result.success ? "success" : "failure", {
    ...ctx,
    fileId: input.fileId,
    provider: result.provider,
  })

  if (!result.success) throw new Error(result.error ?? "Drive move failed")
  await GWorkspaceIdempotency.cacheResult(idempotencyKey, userId, workspaceId, "drive.move", result.data)
  return result.data
})

// ============================================================================
// Docs Create Skill
// ============================================================================

export const DocsCreateInputSchema = z.object({
  title: z.string().describe("Document title"),
  idempotencyKey: z.string().optional().describe("Idempotency key to prevent duplicate operations"),
  userId: z.string().optional().describe("User ID (defaults to KILO_USER_ID)"),
  workspaceId: z.string().optional().default("default").describe("Workspace ID"),
})

export const docsCreate = fn(DocsCreateInputSchema, async (input) => {
  const ctx = makeCtx()
  const userId = input.userId ?? process.env.KILO_USER_ID
  const workspaceId = input.workspaceId

  if (!userId) throw new Error("userId is required (set via input or KILO_USER_ID environment variable)")

  emitIntent("docs", "documents.create")
  const policy = GWorkspaceAgency.getPolicy("docs", "documents.create")
  if (policy === "DENY") throw new Error("Operation denied by policy")

  const idempotencyKey = input.idempotencyKey ?? await GWorkspaceIdempotency.generateKey("docs.create", { title: input.title })
  const cached = await GWorkspaceIdempotency.getCachedResult(idempotencyKey, userId, workspaceId, "docs.create")
  if (cached) return cached

  if (GWorkspaceAgency.requiresApproval("docs", "documents.create")) {
    const hitlReq = await GWorkspaceHITL.createRequest(
      "docs",
      "documents.create",
      "high",
      `Create document: ${input.title}`,
      { title: input.title, ...ctx },
    )
    const approved = await GWorkspaceHITL.waitForApproval(hitlReq.id)
    if (!approved) {
      await GWorkspaceAudit.recordDocs("docs.create", "hitl_denied", { ...ctx })
      throw new Error("HITL request denied")
    }
  }

  const brokerCfg = await GWorkspaceBroker.toBrokerConfig({
    userId,
    workspaceId,
    preferNative: true,
    mcpFallbackEnabled: true,
  })
  const result = await GWorkspaceBroker.executeDocs("create", { title: input.title }, brokerCfg)

  await GWorkspaceAudit.recordDocs("docs.create", result.success ? "success" : "failure", {
    ...ctx,
    documentName: input.title,
    provider: result.provider,
  })

  if (!result.success) throw new Error(result.error ?? "Docs create failed")
  await GWorkspaceIdempotency.cacheResult(idempotencyKey, userId, workspaceId, "docs.create", result.data)
  return result.data
})

// ============================================================================
// Docs Update Skill
// ============================================================================

export const DocsUpdateInputSchema = z.object({
  documentId: z.string().describe("Document ID to update"),
  requests: z.array(z.unknown()).describe("Array of batchUpdate requests"),
  idempotencyKey: z.string().optional().describe("Idempotency key to prevent duplicate operations"),
  userId: z.string().optional().describe("User ID (defaults to KILO_USER_ID)"),
  workspaceId: z.string().optional().default("default").describe("Workspace ID"),
})

export const docsUpdate = fn(DocsUpdateInputSchema, async (input) => {
  const ctx = makeCtx()
  const userId = input.userId ?? process.env.KILO_USER_ID
  const workspaceId = input.workspaceId

  if (!userId) throw new Error("userId is required (set via input or KILO_USER_ID environment variable)")

  emitIntent("docs", "documents.update")
  const policy = GWorkspaceAgency.getPolicy("docs", "documents.update")
  if (policy === "DENY") throw new Error("Operation denied by policy")

  const idempotencyKey = input.idempotencyKey ?? await GWorkspaceIdempotency.generateKey("docs.update", { documentId: input.documentId, requests: input.requests })
  const cached = await GWorkspaceIdempotency.getCachedResult(idempotencyKey, userId, workspaceId, "docs.update")
  if (cached) return cached

  if (GWorkspaceAgency.requiresApproval("docs", "documents.update")) {
    const hitlReq = await GWorkspaceHITL.createRequest(
      "docs",
      "documents.update",
      "high",
      `Update document ${input.documentId}`,
      { documentId: input.documentId, ...ctx },
    )
    const approved = await GWorkspaceHITL.waitForApproval(hitlReq.id)
    if (!approved) {
      await GWorkspaceAudit.recordDocs("docs.update", "hitl_denied", { ...ctx })
      throw new Error("HITL request denied")
    }
  }

  const brokerCfg = await GWorkspaceBroker.toBrokerConfig({
    userId,
    workspaceId,
    preferNative: true,
    mcpFallbackEnabled: true,
  })
  const result = await GWorkspaceBroker.executeDocs(
    "update",
    { documentId: input.documentId, requests: input.requests },
    brokerCfg,
  )

  await GWorkspaceAudit.recordDocs("docs.update", result.success ? "success" : "failure", {
    ...ctx,
    documentId: input.documentId,
    provider: result.provider,
  })

  if (!result.success) throw new Error(result.error ?? "Docs update failed")
  await GWorkspaceIdempotency.cacheResult(idempotencyKey, userId, workspaceId, "docs.update", result.data)
  return result.data
})

// ============================================================================
// Docs Delete Skill
// ============================================================================

export const DocsDeleteInputSchema = z.object({
  documentId: z.string().describe("Document ID to delete"),
  idempotencyKey: z.string().optional().describe("Idempotency key to prevent duplicate operations"),
  userId: z.string().optional().describe("User ID (defaults to KILO_USER_ID)"),
  workspaceId: z.string().optional().default("default").describe("Workspace ID"),
})

export const docsDelete = fn(DocsDeleteInputSchema, async (input) => {
  const ctx = makeCtx()
  const userId = input.userId ?? process.env.KILO_USER_ID
  const workspaceId = input.workspaceId

  if (!userId) throw new Error("userId is required (set via input or KILO_USER_ID environment variable)")

  emitIntent("docs", "documents.delete")
  const policy = GWorkspaceAgency.getPolicy("docs", "documents.delete")
  if (policy === "DENY") throw new Error("Operation denied by policy")

  const idempotencyKey = input.idempotencyKey ?? await GWorkspaceIdempotency.generateKey("docs.delete", { documentId: input.documentId })
  const cached = await GWorkspaceIdempotency.getCachedResult(idempotencyKey, userId, workspaceId, "docs.delete")
  if (cached) return cached

  if (GWorkspaceAgency.requiresApproval("docs", "documents.delete")) {
    const hitlReq = await GWorkspaceHITL.createRequest(
      "docs",
      "documents.delete",
      "high",
      `Delete document ${input.documentId}`,
      { documentId: input.documentId, ...ctx },
    )
    const approved = await GWorkspaceHITL.waitForApproval(hitlReq.id)
    if (!approved) {
      await GWorkspaceAudit.recordDocs("docs.delete", "hitl_denied", { ...ctx })
      throw new Error("HITL request denied")
    }
  }

  const brokerCfg = await GWorkspaceBroker.toBrokerConfig({
    userId,
    workspaceId,
    preferNative: true,
    mcpFallbackEnabled: true,
  })
  const result = await GWorkspaceBroker.executeDocs("delete", { documentId: input.documentId }, brokerCfg)

  await GWorkspaceAudit.recordDocs("docs.delete", result.success ? "success" : "failure", {
    ...ctx,
    documentId: input.documentId,
    provider: result.provider,
  })

  if (!result.success) throw new Error(result.error ?? "Docs delete failed")
  await GWorkspaceIdempotency.cacheResult(idempotencyKey, userId, workspaceId, "docs.delete", result.data)
  return result.data
})

// ============================================================================
// Sheets Create Skill
// ============================================================================

export const SheetsCreateInputSchema = z.object({
  title: z.string().describe("Spreadsheet title"),
  idempotencyKey: z.string().optional().describe("Idempotency key to prevent duplicate operations"),
  userId: z.string().optional().describe("User ID (defaults to KILO_USER_ID)"),
  workspaceId: z.string().optional().default("default").describe("Workspace ID"),
})

export const sheetsCreate = fn(SheetsCreateInputSchema, async (input) => {
  const ctx = makeCtx()
  const userId = input.userId ?? process.env.KILO_USER_ID
  const workspaceId = input.workspaceId

  if (!userId) throw new Error("userId is required (set via input or KILO_USER_ID environment variable)")

  emitIntent("sheets", "spreadsheets.create")
  const policy = GWorkspaceAgency.getPolicy("sheets", "spreadsheets.create")
  if (policy === "DENY") throw new Error("Operation denied by policy")

  const idempotencyKey = input.idempotencyKey ?? await GWorkspaceIdempotency.generateKey("sheets.create", { title: input.title })
  const cached = await GWorkspaceIdempotency.getCachedResult(idempotencyKey, userId, workspaceId, "sheets.create")
  if (cached) return cached

  if (GWorkspaceAgency.requiresApproval("sheets", "spreadsheets.create")) {
    const hitlReq = await GWorkspaceHITL.createRequest(
      "sheets",
      "spreadsheets.create",
      "high",
      `Create spreadsheet: ${input.title}`,
      { title: input.title, ...ctx },
    )
    const approved = await GWorkspaceHITL.waitForApproval(hitlReq.id)
    if (!approved) {
      await GWorkspaceAudit.recordSheets("sheets.create", "hitl_denied", { ...ctx })
      throw new Error("HITL request denied")
    }
  }

  const brokerCfg = await GWorkspaceBroker.toBrokerConfig({
    userId,
    workspaceId,
    preferNative: true,
    mcpFallbackEnabled: true,
  })
  const result = await GWorkspaceBroker.executeSheets("create", { title: input.title }, brokerCfg)

  await GWorkspaceAudit.recordSheets("sheets.create", result.success ? "success" : "failure", {
    ...ctx,
    spreadsheetName: input.title,
    provider: result.provider,
  })

  if (!result.success) throw new Error(result.error ?? "Sheets create failed")
  await GWorkspaceIdempotency.cacheResult(idempotencyKey, userId, workspaceId, "sheets.create", result.data)
  return result.data
})

// ============================================================================
// Sheets Values Update Skill
// ============================================================================

export const SheetsValuesUpdateInputSchema = z.object({
  spreadsheetId: z.string().describe("Spreadsheet ID"),
  range: z.string().describe("A1 notation range (e.g., Sheet1!A1:C10)"),
  values: z.array(z.array(z.unknown())).describe("2D array of values to set"),
  idempotencyKey: z.string().optional().describe("Idempotency key to prevent duplicate operations"),
  userId: z.string().optional().describe("User ID (defaults to KILO_USER_ID)"),
  workspaceId: z.string().optional().default("default").describe("Workspace ID"),
})

export const sheetsValuesUpdate = fn(SheetsValuesUpdateInputSchema, async (input) => {
  const ctx = makeCtx()
  const userId = input.userId ?? process.env.KILO_USER_ID
  const workspaceId = input.workspaceId

  if (!userId) throw new Error("userId is required (set via input or KILO_USER_ID environment variable)")

  emitIntent("sheets", "spreadsheets.values.update")
  const policy = GWorkspaceAgency.getPolicy("sheets", "spreadsheets.values.update")
  if (policy === "DENY") throw new Error("Operation denied by policy")

  const idempotencyKey = input.idempotencyKey ?? await GWorkspaceIdempotency.generateKey("sheets.valuesUpdate", { spreadsheetId: input.spreadsheetId, range: input.range, values: input.values })
  const cached = await GWorkspaceIdempotency.getCachedResult(idempotencyKey, userId, workspaceId, "sheets.valuesUpdate")
  if (cached) return cached

  if (GWorkspaceAgency.requiresApproval("sheets", "spreadsheets.values.update")) {
    const hitlReq = await GWorkspaceHITL.createRequest(
      "sheets",
      "spreadsheets.values.update",
      "high",
      `Update ${input.range} in spreadsheet ${input.spreadsheetId}`,
      { spreadsheetId: input.spreadsheetId, range: input.range, ...ctx },
    )
    const approved = await GWorkspaceHITL.waitForApproval(hitlReq.id)
    if (!approved) {
      await GWorkspaceAudit.recordSheets("sheets.update", "hitl_denied", { ...ctx })
      throw new Error("HITL request denied")
    }
  }

  const brokerCfg = await GWorkspaceBroker.toBrokerConfig({
    userId,
    workspaceId,
    preferNative: true,
    mcpFallbackEnabled: true,
  })
  const result = await GWorkspaceBroker.executeSheets(
    "valuesUpdate",
    { spreadsheetId: input.spreadsheetId, range: input.range, values: input.values },
    brokerCfg,
  )

  await GWorkspaceAudit.recordSheets("sheets.update", result.success ? "success" : "failure", {
    ...ctx,
    spreadsheetId: input.spreadsheetId,
    range: input.range,
    provider: result.provider,
  })

  if (!result.success) throw new Error(result.error ?? "Sheets update failed")
  await GWorkspaceIdempotency.cacheResult(idempotencyKey, userId, workspaceId, "sheets.valuesUpdate", result.data)
  return result.data
})

// ============================================================================
// Sheets Values Append Skill
// ============================================================================

export const SheetsValuesAppendInputSchema = z.object({
  spreadsheetId: z.string().describe("Spreadsheet ID"),
  range: z.string().describe("A1 notation range to append to (e.g., Sheet1!A:C)"),
  values: z.array(z.array(z.unknown())).describe("2D array of values to append"),
  idempotencyKey: z.string().optional().describe("Idempotency key to prevent duplicate operations"),
  userId: z.string().optional().describe("User ID (defaults to KILO_USER_ID)"),
  workspaceId: z.string().optional().default("default").describe("Workspace ID"),
})

export const sheetsValuesAppend = fn(SheetsValuesAppendInputSchema, async (input) => {
  const ctx = makeCtx()
  const userId = input.userId ?? process.env.KILO_USER_ID
  const workspaceId = input.workspaceId

  if (!userId) throw new Error("userId is required (set via input or KILO_USER_ID environment variable)")

  emitIntent("sheets", "spreadsheets.values.append")
  const policy = GWorkspaceAgency.getPolicy("sheets", "spreadsheets.values.append")
  if (policy === "DENY") throw new Error("Operation denied by policy")

  const idempotencyKey = input.idempotencyKey ?? await GWorkspaceIdempotency.generateKey("sheets.valuesAppend", { spreadsheetId: input.spreadsheetId, range: input.range, values: input.values })
  const cached = await GWorkspaceIdempotency.getCachedResult(idempotencyKey, userId, workspaceId, "sheets.valuesAppend")
  if (cached) return cached

  if (GWorkspaceAgency.requiresApproval("sheets", "spreadsheets.values.append")) {
    const hitlReq = await GWorkspaceHITL.createRequest(
      "sheets",
      "spreadsheets.values.append",
      "high",
      `Append to ${input.range} in spreadsheet ${input.spreadsheetId}`,
      { spreadsheetId: input.spreadsheetId, range: input.range, ...ctx },
    )
    const approved = await GWorkspaceHITL.waitForApproval(hitlReq.id)
    if (!approved) {
      await GWorkspaceAudit.recordSheets("sheets.append", "hitl_denied", { ...ctx })
      throw new Error("HITL request denied")
    }
  }

  const brokerCfg = await GWorkspaceBroker.toBrokerConfig({
    userId,
    workspaceId,
    preferNative: true,
    mcpFallbackEnabled: true,
  })
  const result = await GWorkspaceBroker.executeSheets(
    "valuesAppend",
    { spreadsheetId: input.spreadsheetId, range: input.range, values: input.values },
    brokerCfg,
  )

  await GWorkspaceAudit.recordSheets("sheets.append", result.success ? "success" : "failure", {
    ...ctx,
    spreadsheetId: input.spreadsheetId,
    range: input.range,
    provider: result.provider,
  })

  if (!result.success) throw new Error(result.error ?? "Sheets append failed")
  await GWorkspaceIdempotency.cacheResult(idempotencyKey, userId, workspaceId, "sheets.valuesAppend", result.data)
  return result.data
})

// ============================================================================
// Sheets Values Clear Skill
// ============================================================================

export const SheetsValuesClearInputSchema = z.object({
  spreadsheetId: z.string().describe("Spreadsheet ID"),
  range: z.string().describe("A1 notation range to clear (e.g., Sheet1!A1:C10)"),
  idempotencyKey: z.string().optional().describe("Idempotency key to prevent duplicate operations"),
  userId: z.string().optional().describe("User ID (defaults to KILO_USER_ID)"),
  workspaceId: z.string().optional().default("default").describe("Workspace ID"),
})

export const sheetsValuesClear = fn(SheetsValuesClearInputSchema, async (input) => {
  const ctx = makeCtx()
  const userId = input.userId ?? process.env.KILO_USER_ID
  const workspaceId = input.workspaceId

  if (!userId) throw new Error("userId is required (set via input or KILO_USER_ID environment variable)")

  emitIntent("sheets", "spreadsheets.values.clear")
  const policy = GWorkspaceAgency.getPolicy("sheets", "spreadsheets.values.clear")
  if (policy === "DENY") throw new Error("Operation denied by policy")

  const idempotencyKey = input.idempotencyKey ?? await GWorkspaceIdempotency.generateKey("sheets.valuesClear", { spreadsheetId: input.spreadsheetId, range: input.range })
  const cached = await GWorkspaceIdempotency.getCachedResult(idempotencyKey, userId, workspaceId, "sheets.valuesClear")
  if (cached) return cached

  if (GWorkspaceAgency.requiresApproval("sheets", "spreadsheets.values.clear")) {
    const hitlReq = await GWorkspaceHITL.createRequest(
      "sheets",
      "spreadsheets.values.clear",
      "high",
      `Clear ${input.range} in spreadsheet ${input.spreadsheetId}`,
      { spreadsheetId: input.spreadsheetId, range: input.range, ...ctx },
    )
    const approved = await GWorkspaceHITL.waitForApproval(hitlReq.id)
    if (!approved) {
      await GWorkspaceAudit.recordSheets("sheets.clear", "hitl_denied", { ...ctx })
      throw new Error("HITL request denied")
    }
  }

  const brokerCfg = await GWorkspaceBroker.toBrokerConfig({
    userId,
    workspaceId,
    preferNative: true,
    mcpFallbackEnabled: true,
  })
  const result = await GWorkspaceBroker.executeSheets(
    "valuesClear",
    { spreadsheetId: input.spreadsheetId, range: input.range },
    brokerCfg,
  )

  await GWorkspaceAudit.recordSheets("sheets.clear", result.success ? "success" : "failure", {
    ...ctx,
    spreadsheetId: input.spreadsheetId,
    range: input.range,
    provider: result.provider,
  })

  if (!result.success) throw new Error(result.error ?? "Sheets clear failed")
  await GWorkspaceIdempotency.cacheResult(idempotencyKey, userId, workspaceId, "sheets.valuesClear", result.data)
  return result.data
})

// ============================================================================
// Sheets Delete Skill
// ============================================================================

export const SheetsDeleteInputSchema = z.object({
  spreadsheetId: z.string().describe("Spreadsheet ID to delete"),
  idempotencyKey: z.string().optional().describe("Idempotency key to prevent duplicate operations"),
  userId: z.string().optional().describe("User ID (defaults to KILO_USER_ID)"),
  workspaceId: z.string().optional().default("default").describe("Workspace ID"),
})

export const sheetsDelete = fn(SheetsDeleteInputSchema, async (input) => {
  const ctx = makeCtx()
  const userId = input.userId ?? process.env.KILO_USER_ID
  const workspaceId = input.workspaceId

  if (!userId) throw new Error("userId is required (set via input or KILO_USER_ID environment variable)")

  emitIntent("sheets", "spreadsheets.delete")
  const policy = GWorkspaceAgency.getPolicy("sheets", "spreadsheets.delete")
  if (policy === "DENY") throw new Error("Operation denied by policy")

  const idempotencyKey = input.idempotencyKey ?? await GWorkspaceIdempotency.generateKey("sheets.delete", { spreadsheetId: input.spreadsheetId })
  const cached = await GWorkspaceIdempotency.getCachedResult(idempotencyKey, userId, workspaceId, "sheets.delete")
  if (cached) return cached

  if (GWorkspaceAgency.requiresApproval("sheets", "spreadsheets.delete")) {
    const hitlReq = await GWorkspaceHITL.createRequest(
      "sheets",
      "spreadsheets.delete",
      "high",
      `Delete spreadsheet ${input.spreadsheetId}`,
      { spreadsheetId: input.spreadsheetId, ...ctx },
    )
    const approved = await GWorkspaceHITL.waitForApproval(hitlReq.id)
    if (!approved) {
      await GWorkspaceAudit.recordSheets("sheets.delete", "hitl_denied", { ...ctx })
      throw new Error("HITL request denied")
    }
  }

  const brokerCfg = await GWorkspaceBroker.toBrokerConfig({
    userId,
    workspaceId,
    preferNative: true,
    mcpFallbackEnabled: true,
  })
  const result = await GWorkspaceBroker.executeSheets("delete", { spreadsheetId: input.spreadsheetId }, brokerCfg)

  await GWorkspaceAudit.recordSheets("sheets.delete", result.success ? "success" : "failure", {
    ...ctx,
    spreadsheetId: input.spreadsheetId,
    provider: result.provider,
  })

  if (!result.success) throw new Error(result.error ?? "Sheets delete failed")
  await GWorkspaceIdempotency.cacheResult(idempotencyKey, userId, workspaceId, "sheets.delete", result.data)
  return result.data
})

// ============================================================================
// Slides Read Skill
// ============================================================================

export const SlidesReadInputSchema = z.object({
  presentationId: z.string().describe("Presentation ID"),
  userId: z.string().optional().describe("User ID (defaults to KILO_USER_ID)"),
  workspaceId: z.string().optional().default("default").describe("Workspace ID"),
})

export const slidesRead = fn(SlidesReadInputSchema, async (input) => {
  const ctx = makeCtx()
  const userId = input.userId ?? process.env.KILO_USER_ID
  const workspaceId = input.workspaceId

  if (!userId) throw new Error("userId is required (set via input or KILO_USER_ID environment variable)")

  emitIntent("slides", "presentations.read")
  const policy = GWorkspaceAgency.getPolicy("slides", "presentations.read")
  if (policy === "DENY") throw new Error("Operation denied by policy")

  const brokerCfg = await GWorkspaceBroker.toBrokerConfig({
    userId,
    workspaceId,
    preferNative: true,
    mcpFallbackEnabled: true,
  })
  const result = await GWorkspaceBroker.executeSlides("read", { presentationId: input.presentationId }, brokerCfg)

  await GWorkspaceAudit.recordSlides("slides.read", result.success ? "success" : "failure", {
    ...ctx,
    presentationId: input.presentationId,
    provider: result.provider,
  })

  if (!result.success) throw new Error(result.error ?? "Slides read failed")
  return result.data
})

// ============================================================================
// Slides Create Skill
// ============================================================================

export const SlidesCreateInputSchema = z.object({
  title: z.string().describe("Presentation title"),
  idempotencyKey: z.string().optional().describe("Idempotency key to prevent duplicate operations"),
  userId: z.string().optional().describe("User ID (defaults to KILO_USER_ID)"),
  workspaceId: z.string().optional().default("default").describe("Workspace ID"),
})

export const slidesCreate = fn(SlidesCreateInputSchema, async (input) => {
  const ctx = makeCtx()
  const userId = input.userId ?? process.env.KILO_USER_ID
  const workspaceId = input.workspaceId

  if (!userId) throw new Error("userId is required (set via input or KILO_USER_ID environment variable)")

  emitIntent("slides", "presentations.create")
  const policy = GWorkspaceAgency.getPolicy("slides", "presentations.create")
  if (policy === "DENY") throw new Error("Operation denied by policy")

  const idempotencyKey = input.idempotencyKey ?? await GWorkspaceIdempotency.generateKey("slides.create", { title: input.title })
  const cached = await GWorkspaceIdempotency.getCachedResult(idempotencyKey, userId, workspaceId, "slides.create")
  if (cached) return cached

  if (GWorkspaceAgency.requiresApproval("slides", "presentations.create")) {
    const hitlReq = await GWorkspaceHITL.createRequest(
      "slides",
      "presentations.create",
      "high",
      `Create presentation: ${input.title}`,
      { title: input.title, ...ctx },
    )
    const approved = await GWorkspaceHITL.waitForApproval(hitlReq.id)
    if (!approved) {
      await GWorkspaceAudit.recordSlides("slides.create", "hitl_denied", { ...ctx })
      throw new Error("HITL request denied")
    }
  }

  const brokerCfg = await GWorkspaceBroker.toBrokerConfig({
    userId,
    workspaceId,
    preferNative: true,
    mcpFallbackEnabled: true,
  })
  const result = await GWorkspaceBroker.executeSlides("create", { title: input.title }, brokerCfg)

  await GWorkspaceAudit.recordSlides("slides.create", result.success ? "success" : "failure", {
    ...ctx,
    presentationName: input.title,
    provider: result.provider,
  })

  if (!result.success) throw new Error(result.error ?? "Slides create failed")
  await GWorkspaceIdempotency.cacheResult(idempotencyKey, userId, workspaceId, "slides.create", result.data)
  return result.data
})

// ============================================================================
// Slides Add Slide Skill
// ============================================================================

export const SlidesAddSlideInputSchema = z.object({
  presentationId: z.string().describe("Presentation ID"),
  layout: z.string().optional().describe("Slide layout ID (default: BLANK_LAYOUT)"),
  insertIndex: z.number().optional().describe("Index to insert slide at"),
  idempotencyKey: z.string().optional().describe("Idempotency key to prevent duplicate operations"),
  userId: z.string().optional().describe("User ID (defaults to KILO_USER_ID)"),
  workspaceId: z.string().optional().default("default").describe("Workspace ID"),
})

export const slidesAddSlide = fn(SlidesAddSlideInputSchema, async (input) => {
  const ctx = makeCtx()
  const userId = input.userId ?? process.env.KILO_USER_ID
  const workspaceId = input.workspaceId

  if (!userId) throw new Error("userId is required (set via input or KILO_USER_ID environment variable)")

  emitIntent("slides", "presentations.addslide")
  const policy = GWorkspaceAgency.getPolicy("slides", "presentations.addslide")
  if (policy === "DENY") throw new Error("Operation denied by policy")

  const idempotencyKey = input.idempotencyKey ?? await GWorkspaceIdempotency.generateKey("slides.addSlide", { presentationId: input.presentationId, insertIndex: input.insertIndex })
  const cached = await GWorkspaceIdempotency.getCachedResult(idempotencyKey, userId, workspaceId, "slides.addSlide")
  if (cached) return cached

  if (GWorkspaceAgency.requiresApproval("slides", "presentations.addslide")) {
    const hitlReq = await GWorkspaceHITL.createRequest(
      "slides",
      "presentations.addslide",
      "high",
      `Add slide to presentation ${input.presentationId}`,
      { presentationId: input.presentationId, ...ctx },
    )
    const approved = await GWorkspaceHITL.waitForApproval(hitlReq.id)
    if (!approved) {
      await GWorkspaceAudit.recordSlides("slides.addSlide", "hitl_denied", { ...ctx })
      throw new Error("HITL request denied")
    }
  }

  const brokerCfg = await GWorkspaceBroker.toBrokerConfig({
    userId,
    workspaceId,
    preferNative: true,
    mcpFallbackEnabled: true,
  })
  const result = await GWorkspaceBroker.executeSlides("addSlide", { presentationId: input.presentationId, layout: input.layout, insertIndex: input.insertIndex }, brokerCfg)

  await GWorkspaceAudit.recordSlides("slides.addSlide", result.success ? "success" : "failure", {
    ...ctx,
    presentationId: input.presentationId,
    slideIndex: input.insertIndex,
    provider: result.provider,
  })

  if (!result.success) throw new Error(result.error ?? "Slides addSlide failed")
  await GWorkspaceIdempotency.cacheResult(idempotencyKey, userId, workspaceId, "slides.addSlide", result.data)
  return result.data
})

// ============================================================================
// Slides Update Skill
// ============================================================================

export const SlidesUpdateInputSchema = z.object({
  presentationId: z.string().describe("Presentation ID"),
  requests: z.array(z.unknown()).describe("Array of batchUpdate requests"),
  idempotencyKey: z.string().optional().describe("Idempotency key to prevent duplicate operations"),
  userId: z.string().optional().describe("User ID (defaults to KILO_USER_ID)"),
  workspaceId: z.string().optional().default("default").describe("Workspace ID"),
})

export const slidesUpdate = fn(SlidesUpdateInputSchema, async (input) => {
  const ctx = makeCtx()
  const userId = input.userId ?? process.env.KILO_USER_ID
  const workspaceId = input.workspaceId

  if (!userId) throw new Error("userId is required (set via input or KILO_USER_ID environment variable)")

  emitIntent("slides", "presentations.update")
  const policy = GWorkspaceAgency.getPolicy("slides", "presentations.update")
  if (policy === "DENY") throw new Error("Operation denied by policy")

  const idempotencyKey = input.idempotencyKey ?? await GWorkspaceIdempotency.generateKey("slides.update", { presentationId: input.presentationId })
  const cached = await GWorkspaceIdempotency.getCachedResult(idempotencyKey, userId, workspaceId, "slides.update")
  if (cached) return cached

  if (GWorkspaceAgency.requiresApproval("slides", "presentations.update")) {
    const hitlReq = await GWorkspaceHITL.createRequest(
      "slides",
      "presentations.update",
      "high",
      `Update presentation ${input.presentationId}`,
      { presentationId: input.presentationId, ...ctx },
    )
    const approved = await GWorkspaceHITL.waitForApproval(hitlReq.id)
    if (!approved) {
      await GWorkspaceAudit.recordSlides("slides.update", "hitl_denied", { ...ctx })
      throw new Error("HITL request denied")
    }
  }

  const brokerCfg = await GWorkspaceBroker.toBrokerConfig({
    userId,
    workspaceId,
    preferNative: true,
    mcpFallbackEnabled: true,
  })
  const result = await GWorkspaceBroker.executeSlides("update", { presentationId: input.presentationId, requests: input.requests }, brokerCfg)

  await GWorkspaceAudit.recordSlides("slides.update", result.success ? "success" : "failure", {
    ...ctx,
    presentationId: input.presentationId,
    provider: result.provider,
  })

  if (!result.success) throw new Error(result.error ?? "Slides update failed")
  await GWorkspaceIdempotency.cacheResult(idempotencyKey, userId, workspaceId, "slides.update", result.data)
  return result.data
})

// ============================================================================
// Slides Delete Skill
// ============================================================================

export const SlidesDeleteInputSchema = z.object({
  presentationId: z.string().describe("Presentation ID to delete"),
  idempotencyKey: z.string().optional().describe("Idempotency key to prevent duplicate operations"),
  userId: z.string().optional().describe("User ID (defaults to KILO_USER_ID)"),
  workspaceId: z.string().optional().default("default").describe("Workspace ID"),
})

export const slidesDelete = fn(SlidesDeleteInputSchema, async (input) => {
  const ctx = makeCtx()
  const userId = input.userId ?? process.env.KILO_USER_ID
  const workspaceId = input.workspaceId

  if (!userId) throw new Error("userId is required (set via input or KILO_USER_ID environment variable)")

  emitIntent("slides", "presentations.delete")
  const policy = GWorkspaceAgency.getPolicy("slides", "presentations.delete")
  if (policy === "DENY") throw new Error("Operation denied by policy")

  const idempotencyKey = input.idempotencyKey ?? await GWorkspaceIdempotency.generateKey("slides.delete", { presentationId: input.presentationId })
  const cached = await GWorkspaceIdempotency.getCachedResult(idempotencyKey, userId, workspaceId, "slides.delete")
  if (cached) return cached

  if (GWorkspaceAgency.requiresApproval("slides", "presentations.delete")) {
    const hitlReq = await GWorkspaceHITL.createRequest(
      "slides",
      "presentations.delete",
      "high",
      `Delete presentation ${input.presentationId}`,
      { presentationId: input.presentationId, ...ctx },
    )
    const approved = await GWorkspaceHITL.waitForApproval(hitlReq.id)
    if (!approved) {
      await GWorkspaceAudit.recordSlides("slides.delete", "hitl_denied", { ...ctx })
      throw new Error("HITL request denied")
    }
  }

  const brokerCfg = await GWorkspaceBroker.toBrokerConfig({
    userId,
    workspaceId,
    preferNative: true,
    mcpFallbackEnabled: true,
  })
  const result = await GWorkspaceBroker.executeSlides("delete", { presentationId: input.presentationId }, brokerCfg)

  await GWorkspaceAudit.recordSlides("slides.delete", result.success ? "success" : "failure", {
    ...ctx,
    presentationId: input.presentationId,
    provider: result.provider,
  })

  if (!result.success) throw new Error(result.error ?? "Slides delete failed")
  await GWorkspaceIdempotency.cacheResult(idempotencyKey, userId, workspaceId, "slides.delete", result.data)
  return result.data
})

// ============================================================================
// Slides Export Skill
// ============================================================================

export const SlidesExportInputSchema = z.object({
  presentationId: z.string().describe("Presentation ID to export"),
  format: z.enum(["pdf", "pptx", "odp", "plaintext", "jpeg", "png", "svg"]).default("pdf").describe("Export format"),
  userId: z.string().optional().describe("User ID (defaults to KILO_USER_ID)"),
  workspaceId: z.string().optional().default("default").describe("Workspace ID"),
})

export const slidesExport = fn(SlidesExportInputSchema, async (input) => {
  const ctx = makeCtx()
  const userId = input.userId ?? process.env.KILO_USER_ID
  const workspaceId = input.workspaceId

  if (!userId) throw new Error("userId is required (set via input or KILO_USER_ID environment variable)")

  emitIntent("slides", "presentations.export")
  const policy = GWorkspaceAgency.getPolicy("slides", "presentations.export")
  if (policy === "DENY") throw new Error("Operation denied by policy")

  // Convert format string to MIME type
  const formatMap: Record<string, ExportFormat> = {
    pdf: EXPORT_FORMATS.PDF,
    pptx: EXPORT_FORMATS.PPTX,
    odp: EXPORT_FORMATS.ODP,
    plaintext: EXPORT_FORMATS.PLAINTEXT,
    jpeg: EXPORT_FORMATS.JPEG,
    png: EXPORT_FORMATS.PNG,
    svg: EXPORT_FORMATS.SVG,
  }
  const mimeType = formatMap[input.format] || EXPORT_FORMATS.PDF

  // Verify format is supported for slides
  if (!DocumentExporter.isSupportedFormat("slides", mimeType)) {
    throw new Error(`Export format ${input.format} is not supported for Slides presentations`)
  }

  try {
    // Get access token for Drive export
    const brokerCfg = await GWorkspaceBroker.toBrokerConfig({
      userId,
      workspaceId,
      preferNative: true,
      mcpFallbackEnabled: false,
    })

    if (!brokerCfg.accessToken) {
      throw new Error("Failed to obtain access token for export")
    }

    // Export presentation from Drive (Slides stored as Drive files)
    const result = await DocumentExporter.exportFromDrive(brokerCfg.accessToken, input.presentationId, {
      format: mimeType,
      timeout: 60000, // 60s for export
      maxSize: 100 * 1024 * 1024, // 100MB max
    })

    await GWorkspaceAudit.recordSlides("slides.export", "success", {
      ...ctx,
      presentationId: input.presentationId,
      format: input.format,
      fileSize: result.size,
    })

    return {
      presentationId: input.presentationId,
      format: input.format,
      buffer: result.buffer.toString("base64"),
      mimeType: result.mimeType,
      size: result.size,
      filename: DocumentExporter.getSuggestedFilename(`presentation_${input.presentationId}`, mimeType),
    }
  } catch (err) {
    await GWorkspaceAudit.recordSlides("slides.export", "failure", {
      ...ctx,
      presentationId: input.presentationId,
      format: input.format,
      error: err instanceof Error ? err.message : String(err),
    })
    throw err
  }
})

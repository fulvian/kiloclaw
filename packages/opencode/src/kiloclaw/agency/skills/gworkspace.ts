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
import { DocumentExporter, ContentParser, EXPORT_FORMATS, type ExportFormat } from "../services/document-exporter"
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

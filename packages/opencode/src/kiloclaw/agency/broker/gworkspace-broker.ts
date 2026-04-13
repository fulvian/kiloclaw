// Google Workspace Tool Broker
// Routes requests to native adapter or MCP fallback

import { Log } from "@/util/log"
import { MCP } from "@/mcp"
import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import z from "zod"
import { GWorkspaceAdapter } from "../adapters/gworkspace-adapter"

// ============================================================================
// Configuration
// ============================================================================

export interface BrokerConfig {
  preferNative: boolean
  mcpFallbackEnabled: boolean
  fallbackServers: string[]
  accessToken?: string
}

export const defaultBrokerConfig: BrokerConfig = {
  preferNative: true,
  mcpFallbackEnabled: true,
  fallbackServers: ["google-workspace", "google-workspace-mcp"],
}

// ============================================================================
// Tool Result
// ============================================================================

export interface ToolResult<T> {
  success: boolean
  data?: T
  error?: string
  provider: "native" | "mcp"
  fallbackTrigger?: "native_unsupported" | "provider_degraded" | "feature_flag"
}

// ============================================================================
// GWorkspace Broker
// ============================================================================

export namespace GWorkspaceBroker {
  const log = Log.create({ service: "gworkspace.broker" })

  const RouteDecided = BusEvent.define(
    "agency.route.decided",
    z.object({
      agencyDomain: z.literal("gworkspace"),
      service: z.string(),
      operation: z.string(),
      provider: z.enum(["native", "mcp"]),
      reason: z.enum(["native_unsupported", "provider_degraded", "feature_flag", "prefer_native"]),
    }),
  )

  const ToolCallStarted = BusEvent.define(
    "tool.call.started",
    z.object({
      agencyDomain: z.literal("gworkspace"),
      provider: z.enum(["native", "mcp"]),
      service: z.string(),
      operation: z.string(),
      tool: z.string(),
    }),
  )

  const ToolCallCompleted = BusEvent.define(
    "tool.call.completed",
    z.object({
      agencyDomain: z.literal("gworkspace"),
      provider: z.enum(["native", "mcp"]),
      service: z.string(),
      operation: z.string(),
      tool: z.string(),
      success: z.boolean(),
      error: z.string().optional(),
    }),
  )

  /**
   * Execute Gmail operation
   */
  export async function gmail(
    operation: string,
    args: Record<string, unknown>,
    config: BrokerConfig = defaultBrokerConfig,
  ): Promise<ToolResult<unknown>> {
    if (!config.accessToken) {
      return executeMcpFallback("gmail", operation, args, config, "native_unsupported")
    }

    try {
      if (config.preferNative) {
        Bus.publish(RouteDecided, {
          agencyDomain: "gworkspace",
          service: "gmail",
          operation,
          provider: "native",
          reason: "prefer_native",
        })
        return await executeNativeGmail(config.accessToken, operation, args)
      }
    } catch (error) {
      if (shouldFallback(error as Error, config)) {
        return executeMcpFallback("gmail", operation, args, config, "provider_degraded")
      }
      throw error
    }
    return executeMcpFallback("gmail", operation, args, config, "feature_flag")
  }

  /**
   * Execute Calendar operation
   */
  export async function calendar(
    operation: string,
    args: Record<string, unknown>,
    config: BrokerConfig = defaultBrokerConfig,
  ): Promise<ToolResult<unknown>> {
    if (!config.accessToken) {
      return executeMcpFallback("calendar", operation, args, config, "native_unsupported")
    }

    try {
      if (config.preferNative) {
        Bus.publish(RouteDecided, {
          agencyDomain: "gworkspace",
          service: "calendar",
          operation,
          provider: "native",
          reason: "prefer_native",
        })
        return await executeNativeCalendar(config.accessToken, operation, args)
      }
    } catch (error) {
      if (shouldFallback(error as Error, config)) {
        return executeMcpFallback("calendar", operation, args, config, "provider_degraded")
      }
      throw error
    }
    return executeMcpFallback("calendar", operation, args, config, "feature_flag")
  }

  /**
   * Execute Drive operation
   */
  export async function drive(
    operation: string,
    args: Record<string, unknown>,
    config: BrokerConfig = defaultBrokerConfig,
  ): Promise<ToolResult<unknown>> {
    if (!config.accessToken) {
      return executeMcpFallback("drive", operation, args, config, "native_unsupported")
    }

    try {
      if (config.preferNative) {
        Bus.publish(RouteDecided, {
          agencyDomain: "gworkspace",
          service: "drive",
          operation,
          provider: "native",
          reason: "prefer_native",
        })
        return await executeNativeDrive(config.accessToken, operation, args)
      }
    } catch (error) {
      if (shouldFallback(error as Error, config)) {
        return executeMcpFallback("drive", operation, args, config, "provider_degraded")
      }
      throw error
    }
    return executeMcpFallback("drive", operation, args, config, "feature_flag")
  }

  /**
   * Execute Docs operation
   */
  export async function executeDocs(
    operation: string,
    args: Record<string, unknown>,
    config: BrokerConfig = defaultBrokerConfig,
  ): Promise<ToolResult<unknown>> {
    if (!config.accessToken) {
      return executeMcpFallback("docs", operation, args, config, "native_unsupported")
    }

    try {
      if (config.preferNative) {
        Bus.publish(RouteDecided, {
          agencyDomain: "gworkspace",
          service: "docs",
          operation,
          provider: "native",
          reason: "prefer_native",
        })
        return await executeNativeDocs(config.accessToken, operation, args)
      }
    } catch (error) {
      if (shouldFallback(error as Error, config)) {
        return executeMcpFallback("docs", operation, args, config, "provider_degraded")
      }
      throw error
    }
    return executeMcpFallback("docs", operation, args, config, "feature_flag")
  }

  /**
   * Execute Sheets operation
   */
  export async function executeSheets(
    operation: string,
    args: Record<string, unknown>,
    config: BrokerConfig = defaultBrokerConfig,
  ): Promise<ToolResult<unknown>> {
    if (!config.accessToken) {
      return executeMcpFallback("sheets", operation, args, config, "native_unsupported")
    }

    try {
      if (config.preferNative) {
        Bus.publish(RouteDecided, {
          agencyDomain: "gworkspace",
          service: "sheets",
          operation,
          provider: "native",
          reason: "prefer_native",
        })
        return await executeNativeSheets(config.accessToken, operation, args)
      }
    } catch (error) {
      if (shouldFallback(error as Error, config)) {
        return executeMcpFallback("sheets", operation, args, config, "provider_degraded")
      }
      throw error
    }
    return executeMcpFallback("sheets", operation, args, config, "feature_flag")
  }

  // ========================================================================
  // Native Execution
  // ========================================================================

  async function executeNativeGmail(
    accessToken: string,
    operation: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult<unknown>> {
    log.info("native gmail", { operation })

    switch (operation) {
      case "search":
        return {
          success: true,
          data: await GWorkspaceAdapter.gmailListMessages(accessToken, args.query as string, args.maxResults as number),
          provider: "native",
        }
      case "read":
        return {
          success: true,
          data: await GWorkspaceAdapter.gmailGetMessage(accessToken, args.messageId as string),
          provider: "native",
        }
      case "send":
        return {
          success: true,
          data: await GWorkspaceAdapter.gmailSendMessage(
            accessToken,
            args.to as string[],
            args.subject as string,
            args.body as string,
          ),
          provider: "native",
        }
      default:
        throw new Error(`Unsupported Gmail operation: ${operation}`)
    }
  }

  async function executeNativeCalendar(
    accessToken: string,
    operation: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult<unknown>> {
    log.info("native calendar", { operation })

    switch (operation) {
      case "list":
        return {
          success: true,
          data: await GWorkspaceAdapter.calendarListCalendars(accessToken),
          provider: "native",
        }
      case "events":
        return {
          success: true,
          data: await GWorkspaceAdapter.calendarListEvents(accessToken, (args.calendarId as string) || "primary", {
            timeMin: args.timeMin as string,
            timeMax: args.timeMax as string,
            maxResults: args.maxResults as number,
          }),
          provider: "native",
        }
      case "create":
        return {
          success: true,
          data: await GWorkspaceAdapter.calendarCreateEvent(accessToken, args.calendarId as string, {
            summary: args.summary as string,
            start: args.start as string,
            end: args.end as string,
            description: args.description as string,
            location: args.location as string,
            attendees: args.attendees as string[],
          }),
          provider: "native",
        }
      default:
        throw new Error(`Unsupported Calendar operation: ${operation}`)
    }
  }

  async function executeNativeDrive(
    accessToken: string,
    operation: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult<unknown>> {
    log.info("native drive", { operation })

    switch (operation) {
      case "search":
        return {
          success: true,
          data: await GWorkspaceAdapter.driveSearchFiles(accessToken, args.query as string, args.pageSize as number),
          provider: "native",
        }
      case "list":
        return {
          success: true,
          data: await GWorkspaceAdapter.driveListFiles(accessToken, args.folderId as string, args.pageSize as number),
          provider: "native",
        }
      case "get":
        return {
          success: true,
          data: await GWorkspaceAdapter.driveGetFile(accessToken, args.fileId as string, args.fields as string),
          provider: "native",
        }
      case "share":
        return {
          success: true,
          data: await GWorkspaceAdapter.driveCreatePermission(accessToken, args.fileId as string, {
            type: args.type as string,
            email: args.email as string,
            role: args.role as string,
          }),
          provider: "native",
        }
      default:
        throw new Error(`Unsupported Drive operation: ${operation}`)
    }
  }

  async function executeNativeDocs(
    accessToken: string,
    operation: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult<unknown>> {
    log.info("native docs", { operation })

    switch (operation) {
      case "read":
        return {
          success: true,
          data: await GWorkspaceAdapter.docsGetDocument(accessToken, args.documentId as string),
          provider: "native",
        }
      default:
        throw new Error(`Unsupported Docs operation: ${operation}`)
    }
  }

  async function executeNativeSheets(
    accessToken: string,
    operation: string,
    args: Record<string, unknown>,
  ): Promise<ToolResult<unknown>> {
    log.info("native sheets", { operation })

    switch (operation) {
      case "read":
        return {
          success: true,
          data: await GWorkspaceAdapter.sheetsGetSpreadsheet(
            accessToken,
            args.spreadsheetId as string,
            args.range as string,
          ),
          provider: "native",
        }
      default:
        throw new Error(`Unsupported Sheets operation: ${operation}`)
    }
  }

  // ========================================================================
  // MCP Fallback
  // ========================================================================

  // Map GCP operations to workspace-mcp tool names
  const MCP_TOOL_MAP: Record<string, Record<string, string>> = {
    gmail: {
      search: "search_gmail_messages",
      read: "get_gmail_message_content",
      send: "send_gmail_message",
    },
    calendar: {
      list: "list_calendars",
      events: "get_events",
      create: "manage_event",
    },
    drive: {
      search: "search_drive_files",
      list: "list_drive_items",
      get: "get_drive_file_content",
      share: "manage_drive_access",
    },
    docs: {
      read: "get_doc_content",
    },
    sheets: {
      read: "read_sheet_values",
    },
  }

  function mapMcpArgs(service: string, operation: string, args: Record<string, unknown>): Record<string, unknown> {
    if (service === "gmail" && operation === "search") {
      return {
        query: args.query,
        max_results: args.maxResults,
      }
    }

    if (service === "gmail" && operation === "read") {
      return {
        message_id: args.messageId,
      }
    }

    if (service === "gmail" && operation === "send") {
      return {
        to: args.to,
        subject: args.subject,
        body: args.body,
      }
    }

    if (service === "calendar" && operation === "events") {
      return {
        calendar_id: args.calendarId,
        time_min: args.timeMin,
        time_max: args.timeMax,
        max_results: args.maxResults,
      }
    }

    if (service === "calendar" && operation === "create") {
      return {
        action: "create",
        calendar_id: args.calendarId,
        summary: args.summary,
        start: args.start,
        end: args.end,
        description: args.description,
        location: args.location,
        attendees: args.attendees,
      }
    }

    if (service === "drive" && operation === "search") {
      return {
        query: args.query,
        page_size: args.pageSize,
      }
    }

    if (service === "drive" && operation === "list") {
      return {
        folder_id: args.folderId,
        page_size: args.pageSize,
      }
    }

    if (service === "drive" && operation === "get") {
      return {
        file_id: args.fileId,
      }
    }

    if (service === "drive" && operation === "share") {
      return {
        action: "grant",
        file_id: args.fileId,
        email: args.email,
        role: args.role,
      }
    }

    if (service === "docs" && operation === "read") {
      return {
        document_id: args.documentId,
      }
    }

    if (service === "sheets" && operation === "read") {
      return {
        spreadsheet_id: args.spreadsheetId,
        range: args.range,
      }
    }

    return args
  }

  async function executeMcpFallback(
    service: string,
    operation: string,
    args: Record<string, unknown>,
    config: BrokerConfig,
    trigger: NonNullable<ToolResult<unknown>["fallbackTrigger"]>,
  ): Promise<ToolResult<unknown>> {
    log.info("MCP fallback", { service, operation, servers: config.fallbackServers })
    Bus.publish(RouteDecided, {
      agencyDomain: "gworkspace",
      service,
      operation,
      provider: "mcp",
      reason: trigger,
    })

    if (!config.mcpFallbackEnabled) {
      return { success: false, error: "MCP fallback disabled", provider: "mcp" }
    }

    const toolName = MCP_TOOL_MAP[service]?.[operation]
    if (!toolName) {
      return {
        success: false,
        error: `No MCP tool mapping for ${service}:${operation}`,
        provider: "mcp",
        fallbackTrigger: "native_unsupported",
      }
    }

    try {
      // Get all MCP tools
      const allTools = await MCP.tools()

      // MCP tools are named as "sanitizedServerName_toolName"
      // Server names like "google-workspace" are sanitized to "google_workspace" by MCP index
      const sanitize = (name: string) => name.replace(/[^a-zA-Z0-9_-]/g, "_")
      const keys = config.fallbackServers.map((server) => `${sanitize(server)}_${toolName}`)
      const toolKey = keys.find((key) => Boolean(allTools[key]))
      const tool = toolKey ? allTools[toolKey] : undefined

      if (!tool || !toolKey) {
        return {
          success: false,
          error: `MCP tool ${toolName} not found in configured fallback servers`,
          provider: "mcp",
          fallbackTrigger: "native_unsupported",
        }
      }

      log.info("found MCP tool for fallback", { toolKey, service, operation })

      // Execute the MCP tool - tool is guaranteed to exist here
      // Cast to any to handle AI SDK's complex Tool type
      const executeFn = tool.execute as (args: unknown, options?: unknown) => Promise<unknown>
      const mcpArgs = mapMcpArgs(service, operation, args)
      Bus.publish(ToolCallStarted, {
        agencyDomain: "gworkspace",
        provider: "mcp",
        service,
        operation,
        tool: toolKey,
      })
      const result = await executeFn(mcpArgs, {})
      Bus.publish(ToolCallCompleted, {
        agencyDomain: "gworkspace",
        provider: "mcp",
        service,
        operation,
        tool: toolKey,
        success: true,
      })

      return {
        success: true,
        data: result,
        provider: "mcp",
        fallbackTrigger: trigger,
      }
    } catch (error) {
      const keys = config.fallbackServers.map((server) => `${server}_${toolName}`)
      const tool = keys[0] || `${service}_${operation}`
      Bus.publish(ToolCallCompleted, {
        agencyDomain: "gworkspace",
        provider: "mcp",
        service,
        operation,
        tool,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })
      log.error("MCP fallback failed", {
        service,
        operation,
        error: error instanceof Error ? error.message : String(error),
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        provider: "mcp",
        fallbackTrigger: "provider_degraded",
      }
    }
  }

  /**
   * Determine if error should trigger fallback
   */
  function shouldFallback(error: Error, config: BrokerConfig): boolean {
    if (!config.mcpFallbackEnabled) return false
    if (error.message.includes("429") || error.message.includes("503")) return true
    if (error.message.includes("network") || error.message.includes("ECONNREFUSED")) return true
    return false
  }
}

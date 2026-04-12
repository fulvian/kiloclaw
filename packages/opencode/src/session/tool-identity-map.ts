/**
 * Tool Identity Map - Canonical alias to runtime key mapping
 * P0: Stabilizza identità tool e policy binding
 *
 * Provides authoritative mapping from policy aliases (used in allowlists)
 * to actual runtime keys used by MCP clients and native tools.
 */

export namespace ToolIdentityMap {
  // =============================================================================
  // GWorkspace Agency - Policy aliases → MCP runtime keys
  // =============================================================================

  /**
   * GWorkspace tool mapping: policy alias → MCP runtime key format
   * MCP format: {clientName}_{toolName} with sanitization
   *
   * Example: "gmail.search" → "google_workspace_search_gmail_messages"
   */
  export const GWORKSPACE_TOOL_MAP: Record<string, string> = {
    // Gmail tools
    "gmail.search": "google_workspace_search_gmail_messages",
    "gmail.read": "google_workspace_read_gmail_message",
    "gmail.draft": "google_workspace_create_gmail_draft",
    "gmail.send": "google_workspace_send_gmail_message",
    "gmail.list": "google_workspace_list_gmail_messages",

    // Drive tools
    "drive.search": "google_workspace_search_drive_files",
    "drive.list": "google_workspace_list_drive_files",
    "drive.read": "google_workspace_read_drive_file",
    "drive.share": "google_workspace_share_drive_file",
    "drive.create": "google_workspace_create_drive_file",

    // Calendar tools
    "calendar.list": "google_workspace_list_calendars",
    "calendar.read": "google_workspace_read_calendar_event",
    "calendar.create": "google_workspace_create_calendar_event",
    "calendar.update": "google_workspace_update_calendar_event",
    "calendar.delete": "google_workspace_delete_calendar_event",

    // Docs tools
    "docs.read": "google_workspace_read_docs_document",
    "docs.update": "google_workspace_update_docs_document",
    "docs.create": "google_workspace_create_docs_document",

    // Sheets tools
    "sheets.read": "google_workspace_read_sheets_spreadsheet",
    "sheets.update": "google_workspace_update_sheets_spreadsheet",
    "sheets.create": "google_workspace_create_sheets_spreadsheet",
  }

  // =============================================================================
  // Finance Agency - Policy aliases → Finance API runtime keys
  // =============================================================================

  /**
   * Finance tool mapping: policy alias → runtime key
   */
  export const FINANCE_TOOL_MAP: Record<string, string> = {
    "finance-api": "market_data_api",
    "finance.price": "market_data_api_get_price",
    "finance.historical": "market_data_api_get_historical",
    "finance.orderbook": "market_data_api_get_orderbook",
    "finance.fundamentals": "market_data_api_get_fundamentals",
    "finance.news": "market_data_api_get_news",
    "finance.technical": "market_data_api_technical_indicators",
    "finance.signals": "market_data_api_signals",
  }

  // =============================================================================
  // Knowledge Agency - Policy aliases → Native tool IDs (no transformation needed)
  // =============================================================================

  /**
   * Knowledge agency uses native tools (websearch, webfetch) directly.
   * Native tool IDs are returned as-is without transformation.
   */
  export const KNOWLEDGE_TOOL_MAP: Record<string, string> = {
    // Native tools used directly - same ID
  }

  // =============================================================================
  // NBA Agency - Native tools (no transformation needed)
  // =============================================================================

  /**
   * NBA agency uses native tools directly.
   * No mapping needed - these are native tool IDs.
   */
  export const NBA_TOOL_MAP: Record<string, string> = {
    // Native tools used directly - same ID
  }

  // =============================================================================
  // Development Agency - Native tools (no mapping needed)
  // =============================================================================

  /**
   * Development agency uses native tools which have direct ID mapping
   * No alias transformation required
   */
  export const DEVELOPMENT_TOOL_MAP: Record<string, string> = {
    // Native tools used directly - same ID
  }

  // =============================================================================
  // Generic/Fallback tools
  // =============================================================================

  export const GENERIC_TOOL_MAP: Record<string, string> = {
    skill: "skill",
    websearch: "web_search",
    webfetch: "web_fetch",
  }

  // =============================================================================
  // Agency to tool map aggregation
  // =============================================================================

  export function getAgencyToolMap(agencyId: string): Record<string, string> {
    switch (agencyId) {
      case "agency-gworkspace":
        return GWORKSPACE_TOOL_MAP
      case "agency-finance":
        return FINANCE_TOOL_MAP
      case "agency-knowledge":
        return KNOWLEDGE_TOOL_MAP
      case "agency-nba":
        return NBA_TOOL_MAP
      case "agency-development":
        return DEVELOPMENT_TOOL_MAP
      default:
        return {}
    }
  }

  // =============================================================================
  // All mappings aggregated for reverse lookup
  // =============================================================================

  export const ALL_TOOL_MAPS: Record<string, Record<string, string>> = {
    "agency-gworkspace": GWORKSPACE_TOOL_MAP,
    "agency-finance": FINANCE_TOOL_MAP,
    "agency-knowledge": KNOWLEDGE_TOOL_MAP,
    "agency-nba": NBA_TOOL_MAP,
    "agency-development": DEVELOPMENT_TOOL_MAP,
  }

  // =============================================================================
  // Reverse mapping: runtime key → canonical alias
  // =============================================================================

  export function buildReverseMap(agencyId: string): Record<string, string> {
    const forward = getAgencyToolMap(agencyId)
    const reverse: Record<string, string> = {}
    for (const [alias, runtimeKey] of Object.entries(forward)) {
      reverse[runtimeKey] = alias
    }
    return reverse
  }

  // =============================================================================
  // Check if a tool requires mapping (is an alias, not a native ID)
  // =============================================================================

  export function isAlias(toolId: string): boolean {
    // Native tools don't use dots in their IDs
    return toolId.includes(".")
  }

  // =============================================================================
  // Get all known aliases for a given agency
  // =============================================================================

  export function getAliases(agencyId: string): string[] {
    return Object.keys(getAgencyToolMap(agencyId))
  }

  // =============================================================================
  // Get all known runtime keys for a given agency
  // =============================================================================

  export function getRuntimeKeys(agencyId: string): string[] {
    return Object.values(getAgencyToolMap(agencyId))
  }
}

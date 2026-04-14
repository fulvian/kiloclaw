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
   * MCP format: {sanitizedClientName}_{toolName}
   *
   * Client name "google-workspace" sanitizes to "google-workspace" (hyphens preserved)
   * Tool names come from MCP server (e.g., "search_gmail_messages")
   * Combined: "google-workspace_search_gmail_messages"
   *
   * Example: "gmail.search" → "google-workspace_search_gmail_messages"
   */
  export const GWORKSPACE_TOOL_MAP: Record<string, string> = {
    // Gmail tools
    "gmail.search": "google-workspace_search_gmail_messages",
    "gmail.read": "google-workspace_get_gmail_message_content",
    "gmail.draft": "google-workspace_create_gmail_draft",
    "gmail.send": "google-workspace_send_gmail_message",
    "gmail.list": "google-workspace_list_gmail_messages",

    // Drive tools
    "drive.search": "google-workspace_search_drive_files",
    "drive.list": "google-workspace_list_drive_items",
    "drive.read": "google-workspace_get_drive_file_content",
    "drive.share": "google-workspace_manage_drive_access",
    "drive.create": "google-workspace_create_drive_file",

    // Calendar tools
    "calendar.list": "google-workspace_list_calendars",
    "calendar.read": "google-workspace_get_events",
    "calendar.create": "google-workspace_manage_event",
    "calendar.update": "google-workspace_manage_event",
    "calendar.delete": "google-workspace_manage_event",

    // Docs tools
    "docs.read": "google-workspace_get_doc_content",
    "docs.update": "google-workspace_update_doc_content",
    "docs.create": "google-workspace_create_doc_content",

    // Sheets tools
    "sheets.read": "google-workspace_read_sheet_values",
    "sheets.update": "google-workspace_update_sheet_values",
    "sheets.create": "google-workspace_create_sheet",
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
   * Native tool IDs: nba-games, nba-odds, nba-injuries, nba-stats
   */
  export const NBA_TOOL_MAP: Record<string, string> = {
    // NBA native tools - same ID as native tool
    "nba-games": "nba-games",
    "nba-odds": "nba-odds",
    "nba-injuries": "nba-injuries",
    "nba-stats": "nba-stats",
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

// Canonical tool ID exports for policy/runtime binding
// P0: Stabilizza identità tool e policy binding
// These canonical IDs map to actual runtime keys via ToolIdentityResolver

export type CanonicalToolId =
  // Knowledge/NBA
  | "websearch"
  | "webfetch"
  | "skill"
  // GWorkspace
  | "gmail.search"
  | "gmail.read"
  | "gmail.draft"
  | "gmail.send"
  | "drive.search"
  | "drive.list"
  | "drive.read"
  | "drive.share"
  | "calendar.list"
  | "calendar.read"
  | "calendar.create"
  | "calendar.update"
  | "docs.read"
  | "docs.update"
  | "sheets.read"
  | "sheets.update"
  // Development
  | "read"
  | "glob"
  | "grep"
  | "apply_patch"
  | "bash"
  | "codesearch"
  // Finance
  | "finance-api"

/**
 * Returns the canonical tool IDs for a given agency.
 * These are the policy-level IDs that get resolved to runtime keys
 * via ToolIdentityResolver.
 */
export function getAgencyCanonicalToolIds(agencyId: string): CanonicalToolId[] {
  switch (agencyId) {
    case "agency-knowledge":
      return ["websearch", "webfetch", "skill"]
    case "agency-nba":
      return ["websearch", "webfetch", "skill"]
    case "agency-gworkspace":
      return [
        "gmail.search",
        "gmail.read",
        "gmail.draft",
        "gmail.send",
        "drive.search",
        "drive.list",
        "drive.read",
        "drive.share",
        "calendar.list",
        "calendar.read",
        "calendar.create",
        "calendar.update",
        "docs.read",
        "docs.update",
        "sheets.read",
        "sheets.update",
      ]
    case "agency-development":
      return ["read", "glob", "grep", "apply_patch", "bash", "skill", "codesearch", "websearch", "webfetch"]
    case "agency-finance":
      return ["finance-api", "skill", "websearch", "webfetch"]
    default:
      return []
  }
}

/**
 * Check if a tool ID is a canonical policy alias (vs native or runtime key)
 */
export function isCanonicalAlias(toolId: string): boolean {
  return toolId.includes(".")
}

export const KNOWLEDGE_TOOL_ALLOWLIST = ["websearch", "webfetch", "skill"] as const
export const NBA_TOOL_ALLOWLIST = ["websearch", "webfetch", "skill"] as const
export const GWORKSPACE_TOOL_ALLOWLIST = [
  "gmail.search",
  "gmail.read",
  "gmail.draft",
  "gmail.send",
  "drive.search",
  "drive.list",
  "drive.read",
  "drive.share",
  "calendar.list",
  "calendar.read",
  "calendar.create",
  "calendar.update",
  "docs.read",
  "docs.update",
  "sheets.read",
  "sheets.update",
] as const
export const DEVELOPMENT_TOOL_ALLOWLIST = [
  "read",
  "glob",
  "grep",
  "apply_patch",
  "bash",
  "skill",
  "codesearch",
  "websearch",
  "webfetch",
] as const

export const FINANCE_TOOL_ALLOWLIST = ["finance-api", "skill", "websearch", "webfetch"] as const

export function mapKnowledgeCapabilitiesToTools(capabilities: string[]) {
  const tools = capabilities.flatMap((cap) => {
    if (["search", "web-search", "academic-research"].includes(cap)) return ["websearch"]
    if (["fact-checking", "verification", "source_grounding"].includes(cap)) return ["webfetch"]
    if (["synthesis", "information_gathering"].includes(cap)) return ["skill"]
    return []
  })
  return Array.from(new Set(tools))
}

export function mapNbaCapabilitiesToTools(capabilities: string[]) {
  const tools = capabilities.flatMap((cap) => {
    if (["schedule_live", "team_player_stats", "injury_status", "odds_markets", "game_preview"].includes(cap)) {
      return ["websearch", "webfetch", "skill"]
    }
    if (
      [
        "probability_estimation",
        "vig_removal",
        "edge_detection",
        "calibration_monitoring",
        "value_watchlist",
        "recommendation_report",
        "stake_sizing",
      ].includes(cap)
    ) {
      return ["skill", "webfetch"]
    }
    return []
  })
  return Array.from(new Set(tools))
}

export function mapGWorkspaceCapabilitiesToTools(capabilities: string[]) {
  const tools = capabilities.flatMap((cap) => {
    if (cap.startsWith("gmail.")) return ["gmail.search", "gmail.read", "gmail.draft", "gmail.send"]
    if (cap.startsWith("drive.")) return ["drive.search", "drive.list", "drive.read", "drive.share"]
    if (cap.startsWith("calendar.")) return ["calendar.list", "calendar.read", "calendar.create", "calendar.update"]
    if (cap.startsWith("docs.")) return ["docs.read", "docs.update"]
    if (cap.startsWith("sheets.")) return ["sheets.read", "sheets.update"]
    return []
  })
  return Array.from(new Set(tools))
}

export function mapDevelopmentCapabilitiesToTools(capabilities: string[]) {
  const tools = capabilities.flatMap((cap) => {
    if (["coding", "code-generation", "code-review", "refactoring"].includes(cap))
      return ["read", "glob", "grep", "apply_patch"]
    if (["debugging", "testing", "tdd"].includes(cap)) return ["bash", "read", "glob"]
    if (["planning", "document_analysis"].includes(cap)) return ["read", "glob", "grep"]
    return []
  })
  return Array.from(new Set(tools))
}

export function mapFinanceCapabilitiesToTools(capabilities: string[]) {
  const tools = capabilities.flatMap((cap) => {
    // Data Ingestion capabilities
    if (["price.current", "price.historical", "orderbook", "fundamentals", "macro", "filings", "news"].includes(cap))
      return ["finance-api"]
    // Analytics capabilities
    if (
      ["technical.indicators", "chart.patterns", "factor.analysis", "stress.test", "correlation", "sentiment"].includes(
        cap,
      )
    )
      return ["skill"]
    // Trading Operations
    if (
      ["signal.generation", "paper.trade", "order.simulation", "execution.assist", "portfolio.rebalance"].includes(cap)
    )
      return ["skill"]
    // Risk capabilities
    if (["risk.assessment", "alert.risk"].includes(cap)) return ["skill"]
    // Reporting
    if (["watchlist.view", "journal.entry", "report.generate"].includes(cap)) return ["skill"]
    return []
  })
  return Array.from(new Set(tools))
}

export function resolveAgencyAllowedTools(input: {
  agencyId?: string | null
  enabled: boolean
  capabilities?: string[]
}) {
  if (!input.enabled || !input.agencyId) {
    return {
      enabled: false,
      allowedTools: [] as string[],
    }
  }

  if (input.agencyId === "agency-knowledge") {
    const mapped = mapKnowledgeCapabilitiesToTools(input.capabilities ?? [])
    const allowedTools = Array.from(new Set([...KNOWLEDGE_TOOL_ALLOWLIST, ...mapped]))
    return {
      enabled: true,
      allowedTools,
    }
  }

  if (input.agencyId === "agency-nba") {
    const mapped = mapNbaCapabilitiesToTools(input.capabilities ?? [])
    const allowedTools = Array.from(new Set([...NBA_TOOL_ALLOWLIST, ...mapped]))
    return {
      enabled: true,
      allowedTools,
    }
  }

  if (input.agencyId === "agency-gworkspace") {
    const mapped = mapGWorkspaceCapabilitiesToTools(input.capabilities ?? [])
    const allowedTools = Array.from(new Set([...GWORKSPACE_TOOL_ALLOWLIST, ...mapped]))
    return {
      enabled: true,
      allowedTools,
    }
  }

  if (input.agencyId === "agency-development") {
    const mapped = mapDevelopmentCapabilitiesToTools(input.capabilities ?? [])
    const allowedTools = Array.from(new Set([...DEVELOPMENT_TOOL_ALLOWLIST, ...mapped]))
    return {
      enabled: true,
      allowedTools,
    }
  }

  if (input.agencyId === "agency-finance") {
    const mapped = mapFinanceCapabilitiesToTools(input.capabilities ?? [])
    const allowedTools = Array.from(new Set([...FINANCE_TOOL_ALLOWLIST, ...mapped]))
    return {
      enabled: true,
      allowedTools,
    }
  }

  return {
    enabled: false,
    allowedTools: [] as string[],
  }
}

export const KNOWLEDGE_TOOL_ALLOWLIST = ["websearch", "webfetch", "skill"] as const
export const NBA_TOOL_ALLOWLIST = ["skill"] as const
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
    if (
      [
        "schedule_live",
        "team_player_stats",
        "injury_status",
        "odds_markets",
        "game_preview",
        "probability_estimation",
        "vig_removal",
        "edge_detection",
        "calibration_monitoring",
        "value_watchlist",
        "recommendation_report",
        "stake_sizing",
      ].includes(cap)
    ) {
      return ["skill"]
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

  return {
    enabled: false,
    allowedTools: [] as string[],
  }
}

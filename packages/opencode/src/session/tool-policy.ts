export const KNOWLEDGE_TOOL_ALLOWLIST = ["websearch", "webfetch", "skill"] as const
export const NBA_TOOL_ALLOWLIST = ["webfetch", "skill"] as const

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
      return ["webfetch"]
    }
    if (["probability_estimation", "vig_removal", "edge_detection", "calibration_monitoring", "value_watchlist", "recommendation_report", "stake_sizing"].includes(cap)) {
      return ["skill"]
    }
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

  return {
    enabled: false,
    allowedTools: [] as string[],
  }
}

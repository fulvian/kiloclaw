// Canonical tool ID exports for policy/runtime binding
// P0: Stabilizza identità tool e policy binding
// These canonical IDs map to actual runtime keys via ToolIdentityResolver

import { Flag } from "@/flag/flag"

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
  // Weather
  | "weather-api"

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
    case "agency-weather":
      return ["weather-api", "skill"]
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
  "task",
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
export const WEATHER_TOOL_ALLOWLIST = ["weather-api", "skill"] as const

export type PolicyProfile = "strict" | "balanced" | "dev-local"

function resolvePolicyProfile(): PolicyProfile {
  const raw = (Flag.KILO_POLICY_LEVEL ?? "").toLowerCase()
  if (raw === "dev-local") return "dev-local"
  if (raw === "strict") return "strict"
  return "balanced"
}

function isDevLocalEnabled(input?: { profile?: PolicyProfile; trustedWorkspace?: boolean }): boolean {
  const profile = input?.profile ?? resolvePolicyProfile()
  if (profile !== "dev-local") return false

  const trustedOnly = Flag.KILO_TRUSTED_WORKSPACE_ONLY
  if (!trustedOnly) return true

  const trusted = input?.trustedWorkspace ?? Flag.KILO_TRUSTED_WORKSPACE
  return trusted
}

function getDevelopmentAllowlist(input?: { profile?: PolicyProfile; trustedWorkspace?: boolean }) {
  const devLocal = isDevLocalEnabled(input)
  if (!devLocal) return [...DEVELOPMENT_TOOL_ALLOWLIST]

  return Array.from(new Set([...DEVELOPMENT_TOOL_ALLOWLIST, "task"]))
}

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
    // Code understanding & analysis (SAFE reads)
    if (["coding", "code-generation", "code-review", "refactoring", "comparison", "document_analysis"].includes(cap))
      return ["read", "glob", "grep", "codesearch"]

    // Debugging & diagnosis (read + execute)
    if (["debugging", "troubleshooting"].includes(cap)) return ["bash", "read", "glob", "grep"]

    // Test-driven development (execution + read)
    if (["testing", "tdd"].includes(cap)) return ["bash", "read", "glob"]

    // Planning & architecture (read + doc)
    if (["planning", "code-planning", "architecture"].includes(cap)) return ["read", "glob", "grep"]

    // Patch & refactoring (read + write)
    if (["patching", "refactoring"].includes(cap)) return ["read", "glob", "apply_patch"]

    // Git operations
    if (["git_ops", "git-workflow"].includes(cap)) return ["bash", "read"] // controlled git calls

    return []
  })

  return Array.from(new Set(tools))
}

/**
 * Policy level for each development tool (FIX 5)
 */
export const DEVELOPMENT_TOOL_POLICY_LEVELS: Record<string, "SAFE" | "NOTIFY" | "CONFIRM" | "HITL" | "DENY"> = {
  read: "SAFE",
  glob: "SAFE",
  grep: "SAFE",
  codesearch: "SAFE",
  apply_patch: "NOTIFY", // Writes to filesystem
  bash: "NOTIFY", // Executes scripts (could have side effects)
  skill: "NOTIFY", // Skills may execute operations
  websearch: "NOTIFY", // External network call
  webfetch: "NOTIFY", // External network call
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

export function mapWeatherCapabilitiesToTools(capabilities: string[]) {
  const tools = capabilities.flatMap((cap) => {
    // Current conditions
    if (
      [
        "current_conditions",
        "current_observation",
        "current_astronomy",
        "weather_monitoring",
        "real_time_data",
        "temperature",
        "humidity",
        "wind",
      ].includes(cap)
    ) {
      return ["weather-api"]
    }
    // Forecast capabilities
    if (
      [
        "forecast_daily",
        "forecast_hourly",
        "forecast_probabilistic",
        "forecast_minutely",
        "prediction",
        "multi_day",
        "weather_analysis",
        "precipitation",
      ].includes(cap)
    ) {
      return ["weather-api"]
    }
    // Alert capabilities
    if (
      [
        "alerts_severe",
        "alerts_advisory",
        "alerts_summary",
        "warning_detection",
        "notification",
        "safety_alerts",
        "severe_weather",
      ].includes(cap)
    ) {
      return ["weather-api"]
    }
    return []
  })
  return Array.from(new Set(tools))
}

export function resolveAgencyAllowedTools(input: {
  agencyId?: string | null
  enabled: boolean
  capabilities?: string[]
  profile?: PolicyProfile
  trustedWorkspace?: boolean
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
    const allowlist = getDevelopmentAllowlist({
      profile: input.profile,
      trustedWorkspace: input.trustedWorkspace,
    })
    const allowedTools = Array.from(new Set([...allowlist, ...mapped]))
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

  if (input.agencyId === "agency-weather") {
    const mapped = mapWeatherCapabilitiesToTools(input.capabilities ?? [])
    const allowedTools = Array.from(new Set([...WEATHER_TOOL_ALLOWLIST, ...mapped]))
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

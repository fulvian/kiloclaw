export type PolicyLevel = "SAFE" | "NOTIFY" | "CONFIRM" | "DENY"

const POLICY: Record<string, PolicyLevel> = {
  schedule_live: "SAFE",
  team_player_stats: "SAFE",
  injury_status: "SAFE",
  odds_markets: "SAFE",
  game_preview: "SAFE",
  probability_estimation: "NOTIFY",
  vig_removal: "NOTIFY",
  edge_detection: "NOTIFY",
  calibration_monitoring: "NOTIFY",
  value_watchlist: "NOTIFY",
  recommendation_report: "NOTIFY",
  stake_sizing: "CONFIRM",
  bankroll_sizing: "CONFIRM",
  exposure_sizing: "CONFIRM",
  auto_bet: "DENY",
  auto_bet_execution: "DENY",
  execution_orders: "DENY",
  martingale: "DENY",
}

const ALIAS: Record<string, string> = {
  "schedule.live": "schedule_live",
  "team.stats": "team_player_stats",
  "player.stats": "team_player_stats",
  odds_market: "odds_markets",
  "odds.markets": "odds_markets",
  probability: "probability_estimation",
  edge: "edge_detection",
  stake: "stake_sizing",
  "stake-sizing": "stake_sizing",
  autobet: "auto_bet",
  "auto.bet": "auto_bet",
  "auto-bet": "auto_bet",
}

function normalizeOperationToken(operation: string): string {
  return operation
    .trim()
    .toLowerCase()
    .replace(/[\s.-]+/g, "_")
}

function normalizeOperation(operation: string): string {
  const raw = normalizeOperationToken(operation)
  if (!raw) return ""

  const mapped = ALIAS[raw]
  if (mapped) return mapped

  return raw
}

export namespace NbaAgency {
  export function getPolicy(operation: string): PolicyLevel {
    const op = normalizeOperation(operation)
    const level = POLICY[op]
    if (level) return level
    return "DENY"
  }

  export function requiresApproval(operation: string): boolean {
    return getPolicy(operation) === "CONFIRM"
  }

  export const normalize = normalizeOperation
}

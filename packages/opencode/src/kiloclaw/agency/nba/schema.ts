import z from "zod"

export const CONFIDENCE_CAP = 0.95

const DateTimeSchema = z.string().datetime()
const ProbabilitySchema = z.number().finite().min(0).max(1)

export const SourceSchema = z.enum(["espn", "balldontlie", "nba_api", "odds_api", "odds_bet365", "polymarket"])
export const OddsSourceSchema = z.enum(["odds_api", "odds_bet365", "parlay", "polymarket", "balldontlie"])
export const MarketSchema = z.enum(["h2h", "spreads", "totals"])
export const GameStatusSchema = z.enum(["scheduled", "live", "final", "postponed"])
export const FreshnessStateSchema = z.enum(["fresh", "stale", "missing"])
export const RecommendationActionSchema = z.enum(["lean_home", "lean_away", "lean_over", "lean_under", "no_bet"])
export const RecommendationPolicySchema = z.enum(["SAFE", "NOTIFY", "CONFIRM", "DENY"])

export function capConfidence(value: number): number {
  return Math.min(value, CONFIDENCE_CAP)
}

const ConfidenceSchema = ProbabilitySchema.transform(capConfidence)

const TeamSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
})

const DatasetFreshnessSchema = z.object({
  freshness_seconds: z.number().int().nonnegative(),
  max_freshness_seconds: z.number().int().positive(),
})

export const GameSchema = z.object({
  game_id: z.string().min(1),
  source: SourceSchema,
  start_time_utc: DateTimeSchema,
  status: GameStatusSchema,
  home_team: TeamSchema,
  away_team: TeamSchema,
  score: z
    .object({
      home: z.number().int().nonnegative().optional(),
      away: z.number().int().nonnegative().optional(),
    })
    .optional(),
  freshness_seconds: z.number().int().nonnegative(),
  freshness_state: FreshnessStateSchema,
  collected_at_utc: DateTimeSchema,
})

export const OddsSchema = z
  .object({
    odds_id: z.string().min(1),
    game_id: z.string().min(1),
    source: OddsSourceSchema,
    market: MarketSchema,
    bookmaker_or_exchange: z.string().min(1),
    outcomes: z.array(z.string().min(1)).min(2),
    implied_probabilities_raw: z.array(ProbabilitySchema).min(2),
    implied_probabilities_fair: z.array(ProbabilitySchema).min(2),
    vig_percent: z.number().finite().nonnegative(),
    freshness_seconds: z.number().int().nonnegative(),
    freshness_state: FreshnessStateSchema,
    collected_at_utc: DateTimeSchema,
  })
  .refine((value) => value.implied_probabilities_raw.length === value.implied_probabilities_fair.length, {
    message: "raw and fair implied probabilities must have the same length",
    path: ["implied_probabilities_fair"],
  })

export const SignalSchema = z.object({
  signal_id: z.string().min(1),
  game_id: z.string().min(1),
  market: MarketSchema,
  model_probability: ProbabilitySchema,
  fair_implied_probability: ProbabilitySchema,
  edge: z.number().finite(),
  value_flag: z.boolean(),
  confidence: ConfidenceSchema,
  calibration_bucket: z.string().min(1),
  stale_blocked: z.boolean(),
  freshness_seconds: z.number().int().nonnegative(),
  freshness_state: FreshnessStateSchema,
  collected_at_utc: DateTimeSchema,
})

export const RecommendationSchema = z.object({
  recommendation_id: z.string().min(1),
  signal_id: z.string().min(1),
  action: RecommendationActionSchema,
  rationale: z.string().min(1),
  confidence: ConfidenceSchema,
  constraints: z.object({
    hitl_required: z.boolean(),
    max_stake_pct: ProbabilitySchema.optional(),
  }),
  policy_level: RecommendationPolicySchema,
  emitted_at_utc: DateTimeSchema,
})

export function hasVigRemovalPreconditions(raw: number[]): boolean {
  if (raw.length < 2) return false

  const valid = raw.every((value) => Number.isFinite(value) && value > 0 && value <= 1)
  if (!valid) return false

  const overround = raw.reduce((sum, value) => sum + value, 0)
  return overround >= 1
}

function isDatasetStale(data?: z.infer<typeof DatasetFreshnessSchema>): boolean {
  if (!data) return false
  return data.freshness_seconds > data.max_freshness_seconds
}

export const StaleRecommendationInputSchema = z.object({
  odds: DatasetFreshnessSchema.optional(),
  polymarket: DatasetFreshnessSchema.optional(),
  injuries: DatasetFreshnessSchema.optional(),
})

export function shouldBlockStaleRecommendation(input: z.infer<typeof StaleRecommendationInputSchema>): boolean {
  if (!input.odds) return true
  if (isDatasetStale(input.odds)) return true
  if (isDatasetStale(input.polymarket)) return true
  if (isDatasetStale(input.injuries)) return true
  return false
}

export type Game = z.infer<typeof GameSchema>
export type Odds = z.infer<typeof OddsSchema>
export type Signal = z.infer<typeof SignalSchema>
export type Recommendation = z.infer<typeof RecommendationSchema>

export const InjuryStatusSchema = z.enum(["out", "questionable", "doubtful", "probable", "game_time_decision"])
export type InjuryStatus = z.infer<typeof InjuryStatusSchema>

export const InjurySchema = z.object({
  injury_id: z.string().min(1),
  player_id: z.string().min(1),
  player_name: z.string().min(1),
  team_id: z.string().min(1),
  team_name: z.string().min(1),
  status: InjuryStatusSchema,
  injury: z.string().min(1),
  description: z.string().min(1),
  date: z.string(),
  source: SourceSchema,
  freshness_seconds: z.number().int().nonnegative(),
  freshness_state: FreshnessStateSchema,
  collected_at_utc: DateTimeSchema,
})

export type Injury = z.infer<typeof InjurySchema>

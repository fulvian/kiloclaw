import { BusEvent } from "@/bus/bus-event"
import { MarketSchema } from "./schema"
import z from "zod"

// Freshness TTLs based on official API documentation
// Odds change rapidly - 60s max age
export const ODDS_API_MAX_AGE_SECONDS = 60
export const ODDS_BET365_MAX_AGE_SECONDS = 60
export const PARLAY_MAX_AGE_SECONDS = 60
export const POLYMARKET_MAX_AGE_SECONDS = 60

// ESPN live scores update approximately every 30 seconds
export const ESPN_SCOREBOARD_LIVE_MAX_AGE_SECONDS = 30
export const ESPN_INJURIES_MAX_AGE_SECONDS = 3600 // 1 hour - daily injury reports

// BallDontLie real-time data (games, stats update in real-time)
export const BALLDONTLIE_GAMES_MAX_AGE_SECONDS = 60
export const BALLDONTLIE_STATS_MAX_AGE_SECONDS = 60
export const BALLDONTLIE_INJURIES_MAX_AGE_SECONDS = 3600 // 1 hour - injury reports update frequently
export const BALLDONTLIE_PLAYER_PROPS_MAX_AGE_SECONDS = 60

// nba_api advanced stats are daily aggregates
export const NBA_API_ADVANCED_MAX_AGE_SECONDS = 3600 // 1 hour - daily stats refresh hourly

export const NbaFreshnessSourceSchema = z.enum([
  "odds_api",
  "odds_bet365",
  "parlay",
  "polymarket",
  "espn_scoreboard_live",
  "espn_injuries",
  "balldontlie_games",
  "balldontlie_stats",
  "balldontlie_injuries",
  "balldontlie_player_props",
  "nba_api_advanced",
])

const FRESHNESS_TTL: Record<z.infer<typeof NbaFreshnessSourceSchema>, number> = {
  odds_api: ODDS_API_MAX_AGE_SECONDS,
  odds_bet365: ODDS_BET365_MAX_AGE_SECONDS,
  parlay: PARLAY_MAX_AGE_SECONDS,
  polymarket: POLYMARKET_MAX_AGE_SECONDS,
  espn_scoreboard_live: ESPN_SCOREBOARD_LIVE_MAX_AGE_SECONDS,
  espn_injuries: ESPN_INJURIES_MAX_AGE_SECONDS,
  balldontlie_games: BALLDONTLIE_GAMES_MAX_AGE_SECONDS,
  balldontlie_stats: BALLDONTLIE_STATS_MAX_AGE_SECONDS,
  balldontlie_injuries: BALLDONTLIE_INJURIES_MAX_AGE_SECONDS,
  balldontlie_player_props: BALLDONTLIE_PLAYER_PROPS_MAX_AGE_SECONDS,
  nba_api_advanced: NBA_API_ADVANCED_MAX_AGE_SECONDS,
}

export const NbaFreshnessAssessmentSchema = z.object({
  state: z.enum(["fresh", "stale"]),
  maxAgeSeconds: z.number().int().positive(),
  ageSeconds: z.number().int().nonnegative(),
})

export function assessFreshness(source: z.infer<typeof NbaFreshnessSourceSchema>, ageSeconds: number) {
  const age = z
    .number()
    .int()
    .nonnegative()
    .parse(Math.max(0, Math.floor(ageSeconds)))
  const maxAgeSeconds = FRESHNESS_TTL[source]
  const state = age <= maxAgeSeconds ? "fresh" : "stale"
  return NbaFreshnessAssessmentSchema.parse({
    state,
    maxAgeSeconds,
    ageSeconds: age,
  })
}

export const ProviderErrorCategorySchema = z.enum(["auth_error", "rate_limited", "transient_error", "fatal_error"])

const TRANSIENT_CODE = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "ECONNABORTED",
  "ECONNREFUSED",
  "EPIPE",
  "EAI_AGAIN",
  "ENOTFOUND",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
  "ABORT_ERR",
])

export function classifyProviderError(status?: number, code?: string): z.infer<typeof ProviderErrorCategorySchema> {
  const isAuth = status === 401 || status === 403
  if (isAuth) return "auth_error"

  if (status === 429) return "rate_limited"

  const isServer = typeof status === "number" && status >= 500 && status <= 599
  if (isServer) return "transient_error"

  const normalized = typeof code === "string" ? code.toUpperCase() : ""
  if (TRANSIENT_CODE.has(normalized)) return "transient_error"

  return "fatal_error"
}

export const BackoffInputSchema = z.object({
  baseMs: z.number().int().positive(),
  maxMs: z.number().int().positive(),
  jitterMs: z.number().int().nonnegative(),
})

function seeded(seed: number): number {
  const raw = Math.sin(seed) * 10000
  return raw - Math.floor(raw)
}

export function computeBackoffMs(attempt: number, input: z.input<typeof BackoffInputSchema>, seed?: number): number {
  const parsed = BackoffInputSchema.parse(input)
  const step = Math.max(0, Math.floor(attempt))
  const exp = Math.min(parsed.maxMs, parsed.baseMs * 2 ** step)
  const random = typeof seed === "number" ? seeded(seed + step) : Math.random()
  const jitter = parsed.jitterMs === 0 ? 0 : (random * 2 - 1) * parsed.jitterMs
  const withJitter = Math.round(exp + jitter)
  const bounded = Math.max(0, Math.min(parsed.maxMs, withJitter))
  return bounded
}

const BreakerStateSchema = z.enum(["closed", "open", "half_open"])

export const NbaCircuitBreakerConfigSchema = z.object({
  failureThreshold: z.number().int().positive(),
  halfOpenAfterMs: z.number().int().positive(),
  successThreshold: z.number().int().positive(),
})

export const NbaCircuitBreakerSnapshotSchema = z.object({
  state: BreakerStateSchema,
  failures: z.number().int().nonnegative(),
  successes: z.number().int().nonnegative(),
  openedAtMs: z.number().int().nonnegative().nullable(),
})

type BreakerSnapshot = z.infer<typeof NbaCircuitBreakerSnapshotSchema>

function initial(): BreakerSnapshot {
  return {
    state: "closed",
    failures: 0,
    successes: 0,
    openedAtMs: null,
  }
}

export namespace NbaCircuitBreaker {
  export type Config = z.infer<typeof NbaCircuitBreakerConfigSchema>
  export type Snapshot = z.infer<typeof NbaCircuitBreakerSnapshotSchema>

  // Circuit breaker instance interface
  export interface Instance {
    allow(name: string, nowMs?: number): boolean
    recordSuccess(name: string, nowMs?: number): void
    recordFailure(name: string, nowMs?: number): void
    state(name: string): Snapshot
    reset(name: string): void
  }

  export function create(input: z.input<typeof NbaCircuitBreakerConfigSchema>): Instance {
    const cfg = NbaCircuitBreakerConfigSchema.parse(input)
    const all = new Map<string, BreakerSnapshot>()

    function get(name: string): BreakerSnapshot {
      return all.get(name) ?? initial()
    }

    function put(name: string, value: BreakerSnapshot): void {
      all.set(name, NbaCircuitBreakerSnapshotSchema.parse(value))
    }

    function now(inputNow?: number): number {
      return typeof inputNow === "number" ? inputNow : Date.now()
    }

    return {
      allow(name: string, nowMs?: number): boolean {
        const item = get(name)
        if (item.state === "closed") return true
        if (item.state === "half_open") return true
        const at = now(nowMs)
        const openedAtMs = item.openedAtMs ?? at
        const cooled = at - openedAtMs >= cfg.halfOpenAfterMs
        if (!cooled) return false
        put(name, {
          state: "half_open",
          failures: 0,
          successes: 0,
          openedAtMs,
        })
        return true
      },

      recordSuccess(name: string, nowMs?: number): void {
        const item = get(name)
        if (item.state === "closed") {
          put(name, initial())
          return
        }

        if (item.state === "open") return

        const successes = item.successes + 1
        const close = successes >= cfg.successThreshold
        if (close) {
          put(name, initial())
          return
        }

        const at = now(nowMs)
        const openedAtMs = item.openedAtMs ?? at

        put(name, {
          state: "half_open",
          failures: item.failures,
          successes,
          openedAtMs,
        })
      },

      recordFailure(name: string, nowMs?: number): void {
        const item = get(name)
        const at = now(nowMs)

        if (item.state === "half_open") {
          put(name, {
            state: "open",
            failures: cfg.failureThreshold,
            successes: 0,
            openedAtMs: at,
          })
          return
        }

        if (item.state === "open") {
          put(name, {
            ...item,
            openedAtMs: at,
          })
          return
        }

        const failures = item.failures + 1
        if (failures < cfg.failureThreshold) {
          put(name, {
            state: "closed",
            failures,
            successes: 0,
            openedAtMs: null,
          })
          return
        }

        put(name, {
          state: "open",
          failures,
          successes: 0,
          openedAtMs: at,
        })
      },

      state(name: string): Snapshot {
        return NbaCircuitBreakerSnapshotSchema.parse(get(name))
      },

      reset(name: string): void {
        all.delete(name)
      },
    }
  }
}

const PlanModeSchema = z.enum(["full", "degraded", "safe"])

export const MarketPlanInputSchema = z.object({
  remainingQuota: z.number().finite().nonnegative(),
  requestedMarkets: z.array(MarketSchema).min(1),
  requestedRegions: z.array(z.string().min(1)).min(1),
  minReserve: z.number().finite().nonnegative(),
  rateLimited: z.boolean().optional().default(false),
})

export const MarketPlanResultSchema = z.object({
  mode: PlanModeSchema,
  markets: z.array(MarketSchema).min(1),
  regions: z.array(z.string().min(1)).min(1),
  estimatedCost: z.number().finite().nonnegative(),
  rationale: z.string().min(1),
})

function estimate(markets: z.infer<typeof MarketSchema>[], regions: string[]): number {
  return markets.length * regions.length
}

function minimal(input: z.infer<typeof MarketPlanInputSchema>) {
  const first = input.requestedRegions[0]
  return {
    markets: ["h2h"] as z.infer<typeof MarketSchema>[],
    regions: first ? [first] : [],
  }
}

export function selectMarketPlan(input: z.input<typeof MarketPlanInputSchema>) {
  const parsed = MarketPlanInputSchema.parse(input)

  if (parsed.remainingQuota < parsed.minReserve) {
    const plan = minimal(parsed)
    return MarketPlanResultSchema.parse({
      mode: "safe",
      markets: plan.markets,
      regions: plan.regions,
      estimatedCost: estimate(plan.markets, plan.regions),
      rationale: "remaining quota below reserve; reduced to minimal market plan",
    })
  }

  if (parsed.rateLimited) {
    const plan = minimal(parsed)
    return MarketPlanResultSchema.parse({
      mode: "degraded",
      markets: plan.markets,
      regions: plan.regions,
      estimatedCost: estimate(plan.markets, plan.regions),
      rationale: "rate limited; downgraded request scope to preserve quota",
    })
  }

  return MarketPlanResultSchema.parse({
    mode: "full",
    markets: parsed.requestedMarkets,
    regions: parsed.requestedRegions,
    estimatedCost: estimate(parsed.requestedMarkets, parsed.requestedRegions),
    rationale: "quota healthy; requested market plan retained",
  })
}

export const ProviderCallOutcomeSchema = z.enum([
  "success",
  "auth_error",
  "rate_limited",
  "transient_error",
  "fatal_error",
])

export const NbaProviderCallSchema = z.object({
  provider: z.string().min(1),
  endpoint: z.string().min(1),
  latencyMs: z.number().int().nonnegative(),
  status: z.number().int().nonnegative(),
  quotaCost: z.number().finite().nonnegative(),
  retryCount: z.number().int().nonnegative(),
  outcomeCategory: ProviderCallOutcomeSchema,
})

export const Agency2ProviderCall = BusEvent.define("agency2.provider_call", NbaProviderCallSchema)

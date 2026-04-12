// ESPN Hidden API Adapter
// Public API endpoints for scores, standings, injuries, depth charts
// No API key required
// Docs: https://gist.github.com/akeaswaran/b48b02f1c94f873c6655e7129910fc3b

import type { Game, Injury } from "../schema"
import { GameSchema, InjurySchema, FreshnessStateSchema } from "../schema"
import { NbaCircuitBreaker, assessFreshness } from "../resilience"
import { Log } from "@/util/log"
import type { NbaAdapter, AdapterResult, AdapterError } from "./base"

const SITE_API = "https://site.api.espn.com/apis/site/v2"
const CORE_API = "https://sports.core.api.espn.com/v2"
const PROVIDER = "espn"

interface EspnScoreboardResponse {
  events: EspnEvent[]
}

interface EspnEvent {
  id: string
  date: string
  name: string
  competitions: EspnCompetition[]
}

interface EspnCompetition {
  id: string
  status: EspnStatus
  venue?: { name: string }
  participants: EspnParticipant[]
  odds?: EspnOdds[]
  leader?: unknown
}

interface EspnStatus {
  type: { id: string; name: string; state: string }
}

interface EspnParticipant {
  id: string
  homeAway: string
  team: EspnTeam
  score?: string
  linescores?: { value: number }[]
  records?: { summary: string }[]
}

interface EspnTeam {
  id: string
  uid: string
  name: string
  abbreviation: string
  displayName: string
  logo: string
  links?: { rel: string[]; href: string }[]
}

interface EspnOdds {
  spread?: { away?: number; home?: number }
  overUnder?: number
}

interface EspnInjuryResponse {
  injuries: EspnInjury[]
}

interface EspnInjury {
  athlete: { id: string; displayName: string }
  team: EspnTeam
  status: string
  injury: { id: string; name: string; detail: string }
  details: string
  date: string
}

interface EspnStandingsResponse {
  children: EspnStandingGroup[]
}

interface EspnStandingGroup {
  name: string
  standings: { entries: EspnStandingEntry[] }
}

interface EspnStandingEntry {
  team: EspnTeam
  stats: { name: string; value: string | number }[]
}

export class EspnAdapter implements NbaAdapter {
  readonly provider = PROVIDER
  readonly config: {
    provider: string
    baseUrl: string
    timeoutMs: number
    retryAttempts: number
    circuitBreaker: NbaCircuitBreaker.Instance
  }
  private log = Log.create({ service: `nba.adapter.${PROVIDER}` })

  constructor(
    private circuitBreaker: NbaCircuitBreaker.Instance,
    private timeoutMs = 10000,
    private retryAttempts = 3,
  ) {
    this.config = {
      provider: PROVIDER,
      baseUrl: SITE_API,
      timeoutMs,
      retryAttempts,
      circuitBreaker,
    }
  }

  private async fetch<T>(url: string): Promise<T> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs)

    try {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (!response.ok) {
        throw {
          category: "transient_error" as const,
          message: `HTTP ${response.status}`,
          retryable: true,
          statusCode: response.status,
        }
      }

      return response.json() as T
    } catch (err: any) {
      clearTimeout(timeout)

      if (err.category) throw err

      if (err.name === "AbortError") {
        throw { category: "transient_error" as const, message: "Request timeout", retryable: true }
      }

      throw { category: "fatal_error" as const, message: err.message || "Unknown error", retryable: false }
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.fetch<EspnScoreboardResponse>(`${SITE_API}/sports/basketball/nba/scoreboard?dates=20260411`)
      return true
    } catch {
      return false
    }
  }

  async getGames(options?: { dates?: string[] }): Promise<AdapterResult<Game[]>> {
    const startTime = Date.now()

    if (!this.config.circuitBreaker.allow(PROVIDER)) {
      return {
        data: null,
        error: { category: "transient_error", message: "Circuit breaker open", retryable: false },
        metadata: { provider: PROVIDER, latencyMs: Date.now() - startTime, cached: false, freshnessSeconds: 0 },
      }
    }

    try {
      // Get today's date or specified dates
      const today = new Date().toISOString().split("T")[0].replace(/-/g, "")
      const dateParam = options?.dates?.length ? options.dates[0].replace(/-/g, "") : today

      const url = `${SITE_API}/sports/basketball/nba/scoreboard?dates=${dateParam}&groups=50`
      const response = await this.fetch<EspnScoreboardResponse>(url)
      const now = Date.now()
      const games: Game[] = []

      for (const event of response.events) {
        const competition = event.competitions[0]
        if (!competition) continue

        const homeParticipant = competition.participants.find((p) => p.homeAway === "home")
        const awayParticipant = competition.participants.find((p) => p.homeAway === "away")

        if (!homeParticipant || !awayParticipant) continue

        const gameDate = new Date(event.date).getTime()
        const freshnessSeconds = Math.floor((now - gameDate) / 1000)
        const statusType = competition.status.type

        let status: Game["status"] = "scheduled"
        if (statusType.state === "postponed") status = "postponed"
        else if (statusType.state === "final") status = "final"
        else if (statusType.state === "inprogress") status = "live"

        games.push(
          GameSchema.parse({
            game_id: event.id,
            source: "espn",
            start_time_utc: event.date,
            status,
            home_team: { id: homeParticipant.team.id, name: homeParticipant.team.displayName },
            away_team: { id: awayParticipant.team.id, name: awayParticipant.team.displayName },
            score:
              homeParticipant.score && awayParticipant.score
                ? { home: parseInt(homeParticipant.score), away: parseInt(awayParticipant.score) }
                : undefined,
            freshness_seconds: freshnessSeconds,
            freshness_state: assessFreshness("espn_scoreboard_live", freshnessSeconds).state,
            collected_at_utc: new Date().toISOString(),
          }),
        )
      }

      this.config.circuitBreaker.recordSuccess(PROVIDER)

      return {
        data: games,
        error: null,
        metadata: { provider: PROVIDER, latencyMs: Date.now() - startTime, cached: false, freshnessSeconds: 0 },
      }
    } catch (err: any) {
      this.config.circuitBreaker.recordFailure(PROVIDER)
      return {
        data: null,
        error: err as AdapterError,
        metadata: { provider: PROVIDER, latencyMs: Date.now() - startTime, cached: false, freshnessSeconds: 0 },
      }
    }
  }

  async getOdds(): Promise<AdapterResult<never[]>> {
    // ESPN doesn't provide betting odds
    return { data: [], error: null, metadata: { provider: PROVIDER, latencyMs: 0, cached: false, freshnessSeconds: 0 } }
  }

  async getInjuries(options?: { teamIds?: string[] }): Promise<AdapterResult<Injury[]>> {
    const startTime = Date.now()

    if (!this.config.circuitBreaker.allow(PROVIDER)) {
      return {
        data: null,
        error: { category: "transient_error", message: "Circuit breaker open", retryable: false },
        metadata: { provider: PROVIDER, latencyMs: Date.now() - startTime, cached: false, freshnessSeconds: 0 },
      }
    }

    try {
      // ESPN injuries are fetched per-team
      // If no team specified, we need to fetch all teams first
      const injuries: Injury[] = []

      if (options?.teamIds?.length) {
        for (const teamId of options.teamIds) {
          const url = `${CORE_API}/sports/basketball/nba/teams/${teamId}/injuries`
          const response = await this.fetch<EspnInjuryResponse>(url)
          const now = Date.now()

          for (const inj of response.injuries) {
            const injuryDate = new Date(inj.date).getTime()
            const freshnessSeconds = Math.floor((now - injuryDate) / 1000)

            injuries.push(
              InjurySchema.parse({
                injury_id: `${inj.athlete.id}-${inj.date}`,
                player_id: inj.athlete.id,
                player_name: inj.athlete.displayName,
                team_id: inj.team.id,
                team_name: inj.team.name,
                status: this.mapInjuryStatus(inj.status),
                injury: inj.injury.name,
                description: inj.details || inj.injury.detail,
                date: inj.date,
                source: "espn",
                freshness_seconds: freshnessSeconds,
                freshness_state: assessFreshness("espn_injuries", freshnessSeconds).state,
                collected_at_utc: new Date().toISOString(),
              }),
            )
          }
        }
      }

      this.config.circuitBreaker.recordSuccess(PROVIDER)

      return {
        data: injuries,
        error: null,
        metadata: { provider: PROVIDER, latencyMs: Date.now() - startTime, cached: false, freshnessSeconds: 0 },
      }
    } catch (err: any) {
      this.config.circuitBreaker.recordFailure(PROVIDER)
      return {
        data: null,
        error: err as AdapterError,
        metadata: { provider: PROVIDER, latencyMs: Date.now() - startTime, cached: false, freshnessSeconds: 0 },
      }
    }
  }

  private mapInjuryStatus(status: string): Injury["status"] {
    const s = status.toLowerCase()
    if (s.includes("out")) return "out"
    if (s.includes("questionable")) return "questionable"
    if (s.includes("doubtful")) return "doubtful"
    if (s.includes("probable")) return "probable"
    return "game_time_decision"
  }
}

export const createEspnAdapter = (circuitBreaker: NbaCircuitBreaker.Instance) => new EspnAdapter(circuitBreaker)

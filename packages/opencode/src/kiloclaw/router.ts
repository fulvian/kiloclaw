import { Log } from "@/util/log"
import { fn } from "@/util/fn"
import z from "zod"
import { type Intent, type AgencyAssignment, Domain } from "./types"

// Domain scoring for intent classification
interface DomainScore {
  domain: string
  score: number
  reasons: string[]
}

// Intent classification result with detailed scoring
interface RoutingResult {
  agencyId: AgencyAssignment["agencyId"]
  confidence: number
  matchedDomain: string
  scores: DomainScore[]
  reasoning: string
}

// Intent routing interface
export interface IntentRouter {
  route(intent: Intent): Promise<RoutingResult>
  registerDomainHandler(domain: string, handler: (intent: Intent) => Promise<AgencyAssignment["agencyId"]>): void
  unregisterDomainHandler(domain: string): void
}

const DOMAIN_KEYWORDS: Record<string, string[]> = {
  development: [
    "code",
    "debug",
    "test",
    "build",
    "deploy",
    "repository",
    "git",
    "programming",
    "function",
    "class",
    "file",
    "project",
    // Italian keywords
    "codice",
    "debug",
    "programma",
    "file",
    "progetto",
  ],
  knowledge: [
    "search",
    "find",
    "query",
    "information",
    "research",
    "document",
    "knowledge",
    "database",
    "lookup",
    // Italian keywords
    "cerca",
    "cercami",
    "ricerca",
    "informazioni",
    "informazione",
    "annuncio",
    "annunci",
    "listino",
    "listino",
    "prodotto",
    "prodotti",
    " acquista",
    "vendita",
    "offerta",
  ],
  nutrition: [
    "food",
    "diet",
    "nutrition",
    "meal",
    "recipe",
    "calories",
    "health",
    "vitamin",
    "ingredient",
    // Italian keywords
    "cibo",
    "dieta",
    "nutrizione",
    "pasti",
    "ricetta",
    "calorie",
    "salute",
    "vitamin",
  ],
  weather: [
    "weather",
    "temperature",
    "forecast",
    "rain",
    "sun",
    "climate",
    "meteorological",
    // Italian keywords
    "meteo",
    "temperatura",
    "previsioni",
    "pioggia",
    "sole",
    "clima",
  ],
  custom: [],
}

function norm(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

function grams(input: string): string[] {
  if (input.length < 2) return [input]
  return Array.from({ length: input.length - 1 }, (_, idx) => input.slice(idx, idx + 2))
}

function sim(a: string, b: string): number {
  const aa = grams(a)
  const bb = grams(b)
  const hit = aa.filter((x) => bb.includes(x)).length
  const den = aa.length + bb.length
  return den > 0 ? (2 * hit) / den : 0
}

function fuzzyTokenMatch(tok: string, key: string): boolean {
  if (tok.includes(key) || key.includes(tok)) return true
  const lenGap = Math.abs(tok.length - key.length)
  if (lenGap > 2) return false
  if (tok.length < 4 || key.length < 4) return false
  return sim(tok, key) >= 0.72
}

export const Router = {
  create: fn(z.object({}), () => {
    const log = Log.create({ service: "kiloclaw.router" })
    const domainHandlers = new Map<string, (intent: Intent) => Promise<AgencyAssignment["agencyId"]>>()

    // Calculate keyword match score
    function keywordScore(intent: Intent, domain: string): number {
      const keywords = DOMAIN_KEYWORDS[domain]
      if (!keywords || keywords.length === 0) return 0

      const text = norm(`${intent.type} ${intent.description}`)
      const toks = text.split(/[^a-z0-9]+/).filter(Boolean)
      const matches = keywords.filter((raw) => {
        const key = norm(raw.trim())
        if (!key) return false
        if (text.includes(key)) return true
        return toks.some((tok) => fuzzyTokenMatch(tok, key))
      }).length
      return matches / keywords.length
    }

    // Calculate risk-adjusted score
    function riskAdjustedScore(score: number, intent: Intent): number {
      const riskMultiplier: Record<string, number> = {
        low: 1.0,
        medium: 0.9,
        high: 0.7,
        critical: 0.5,
      }
      return score * (riskMultiplier[intent.risk] ?? 1.0)
    }

    const router: IntentRouter = {
      async route(intent: Intent): Promise<RoutingResult> {
        log.info("routing intent", { intentId: intent.id, type: intent.type })

        // Calculate scores for each domain
        const scores: DomainScore[] = (["development", "knowledge", "nutrition", "weather", "custom"] as string[]).map(
          (domain) => {
            const keywordScoreValue = keywordScore(intent, domain)
            const reasons: string[] = []

            if (keywordScoreValue > 0) {
              reasons.push(`matched ${Math.round(keywordScoreValue * 100)}% domain keywords`)
            }

            return {
              domain,
              score: riskAdjustedScore(keywordScoreValue, intent),
              reasons,
            }
          },
        )

        // Sort by score descending
        scores.sort((a, b) => b.score - a.score)

        const bestMatch = scores[0]
        const matchedDomain = bestMatch.score > 0 ? bestMatch.domain : "custom"

        // Use custom handler if registered
        let agencyId: AgencyAssignment["agencyId"] = `agency-${matchedDomain}` as AgencyAssignment["agencyId"]
        const handler = domainHandlers.get(matchedDomain)
        if (handler) {
          agencyId = await handler(intent)
        }

        const confidence = bestMatch.score > 0 ? bestMatch.score : 0.5

        log.info("intent routed", {
          intentId: intent.id,
          agencyId,
          domain: matchedDomain,
          confidence,
        })

        return {
          agencyId,
          confidence,
          matchedDomain,
          scores,
          reasoning: `Matched domain "${matchedDomain}" with ${Math.round(confidence * 100)}% confidence`,
        }
      },

      registerDomainHandler(domain: string, handler: (intent: Intent) => Promise<AgencyAssignment["agencyId"]>): void {
        domainHandlers.set(domain, handler)
        log.info("domain handler registered", { domain })
      },

      unregisterDomainHandler(domain: string): void {
        domainHandlers.delete(domain)
        log.info("domain handler unregistered", { domain })
      },
    }

    return router
  }),
}

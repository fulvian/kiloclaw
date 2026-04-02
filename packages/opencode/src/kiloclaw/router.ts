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
  ],
  knowledge: ["search", "find", "query", "information", "research", "document", "knowledge", "database", "lookup"],
  nutrition: ["food", "diet", "nutrition", "meal", "recipe", "calories", "health", "vitamin", "ingredient"],
  weather: ["weather", "temperature", "forecast", "rain", "sun", "climate", "meteorological"],
  custom: [],
}

export const Router = {
  create: fn(z.object({}), () => {
    const log = Log.create({ service: "kiloclaw.router" })
    const domainHandlers = new Map<string, (intent: Intent) => Promise<AgencyAssignment["agencyId"]>>()

    // Calculate keyword match score
    function keywordScore(intent: Intent, domain: string): number {
      const keywords = DOMAIN_KEYWORDS[domain]
      if (!keywords || keywords.length === 0) return 0

      const text = `${intent.type} ${intent.description}`.toLowerCase()
      let matches = 0
      for (const keyword of keywords) {
        if (text.includes(keyword)) matches++
      }
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

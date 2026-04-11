// HybridRouter - Routes intents using keyword-based or semantic routing
// Phase 1: Integration of Semantic Router v2

import { Log } from "@/util/log"
import { Flag } from "@/flag/flag"
import { Router, type IntentRouter } from "../../../router"
import { SemanticRouter, getSemanticRouter } from "./semantic-router"
import { bootstrapAllCapabilities } from "./bootstrap"
import { bootstrapRegistries } from "../../bootstrap"
import type { SemanticIntent } from "./types"
import type { Intent, AgencyAssignment } from "../../../types"

// Domain scoring for keyword-based routing result
interface DomainScore {
  domain: string
  score: number
  reasons: string[]
}

// Keyword-based routing result
interface KeywordRoutingResult {
  agencyId: AgencyAssignment["agencyId"]
  confidence: number
  matchedDomain: string
  scores: DomainScore[]
  reasoning: string
}

// Unified routing result
export interface HybridRoutingResult {
  agencyId: AgencyAssignment["agencyId"]
  confidence: number
  matchedDomain: string
  scores: DomainScore[]
  reasoning: string
  routingMethod: "semantic" | "keyword" | "fallback"
}

// Hybrid intent router interface
export interface HybridIntentRouter {
  route(intent: Intent): Promise<HybridRoutingResult>
  registerDomainHandler(domain: string, handler: (intent: Intent) => Promise<AgencyAssignment["agencyId"]>): void
  unregisterDomainHandler(domain: string): void
}

const log = Log.create({ service: "kiloclaw.hybrid-router" })

// Singleton instance
let hybridRouterInstance: HybridIntentRouter | null = null

export const HybridRouter = {
  /**
   * Create a hybrid router that uses semantic routing with keyword fallback
   */
  create: (): HybridIntentRouter => {
    // Bootstrap registries (agencies, skills, agents, chains) before routing
    bootstrapRegistries()

    const keywordRouter = Router.create({})
    let semanticRouter: SemanticRouter | null = null

    // Initialize semantic router if enabled
    if (Flag.KILO_SEMANTIC_ROUTING_ENABLED) {
      try {
        // Bootstrap capabilities before initializing semantic router
        bootstrapAllCapabilities()
        semanticRouter = getSemanticRouter()
        log.info("semantic router initialized", { threshold: Flag.KILO_SEMANTIC_ROUTING_THRESHOLD })
      } catch (err) {
        log.warn("failed to initialize semantic router, using keyword-only", { err: String(err) })
      }
    }

    const domainHandlers = new Map<string, (intent: Intent) => Promise<AgencyAssignment["agencyId"]>>()

    const router: HybridIntentRouter = {
      async route(intent: Intent): Promise<HybridRoutingResult> {
        log.info("routing intent", { intentId: intent.id, type: intent.type })

        // Try semantic routing first if enabled
        if (semanticRouter && Flag.KILO_SEMANTIC_ROUTING_ENABLED) {
          try {
            const semanticIntent: SemanticIntent = {
              ...intent,
              description: intent.description || intent.type,
              type: intent.type as "chat" | "task" | "query",
              risk: intent.risk || "low",
            }

            const semanticResult = await semanticRouter.route(semanticIntent)

            // Check if confidence meets threshold
            if (semanticResult.finalConfidence >= Flag.KILO_SEMANTIC_ROUTING_THRESHOLD) {
              log.info("semantic routing succeeded", {
                intentId: intent.id,
                agencyId: semanticResult.capability.agencyId,
                confidence: semanticResult.finalConfidence,
              })

              // Apply domain handler if registered
              let agencyId = semanticResult.capability.agencyId as AgencyAssignment["agencyId"]
              const handler = domainHandlers.get(semanticResult.domain.domain)
              if (handler) {
                agencyId = await handler(intent)
              }

              return {
                agencyId,
                confidence: semanticResult.finalConfidence,
                matchedDomain: semanticResult.domain.domain,
                scores: [
                  {
                    domain: semanticResult.domain.domain,
                    score: semanticResult.finalConfidence,
                    reasons: [semanticResult.reasoning],
                  },
                ],
                reasoning: `Semantic routing: ${semanticResult.reasoning}`,
                routingMethod: "semantic",
              }
            }

            log.info("semantic routing confidence below threshold, falling back", {
              intentId: intent.id,
              confidence: semanticResult.finalConfidence,
              threshold: Flag.KILO_SEMANTIC_ROUTING_THRESHOLD,
            })

            // Fall through to keyword routing if threshold not met and fallback enabled
            if (!Flag.KILO_SEMANTIC_ROUTING_FALLBACK_TO_KEYWORD) {
              // Use semantic result anyway with low confidence
              return {
                agencyId: semanticResult.capability.agencyId as AgencyAssignment["agencyId"],
                confidence: semanticResult.finalConfidence,
                matchedDomain: semanticResult.domain.domain,
                scores: [
                  {
                    domain: semanticResult.domain.domain,
                    score: semanticResult.finalConfidence,
                    reasons: [semanticResult.reasoning],
                  },
                ],
                reasoning: `Semantic routing (below threshold): ${semanticResult.reasoning}`,
                routingMethod: "semantic",
              }
            }
          } catch (err) {
            log.warn("semantic routing failed, falling back to keyword", { intentId: intent.id, err: String(err) })

            // Fall through to keyword routing on error
            if (!Flag.KILO_SEMANTIC_ROUTING_FALLBACK_TO_KEYWORD) {
              throw err
            }
          }
        }

        // Keyword-based routing (fallback or disabled)
        log.info("using keyword-based routing", { intentId: intent.id })

        const keywordResult = await keywordRouter.route(intent)

        // Apply domain handler if registered
        let agencyId = keywordResult.agencyId
        const handler = domainHandlers.get(keywordResult.matchedDomain)
        if (handler) {
          agencyId = await handler(intent)
        }

        return {
          agencyId,
          confidence: keywordResult.confidence,
          matchedDomain: keywordResult.matchedDomain,
          scores: keywordResult.scores,
          reasoning: keywordResult.reasoning,
          routingMethod: "keyword",
        }
      },

      registerDomainHandler(domain: string, handler: (intent: Intent) => Promise<AgencyAssignment["agencyId"]>): void {
        domainHandlers.set(domain, handler)
        keywordRouter.registerDomainHandler(domain, handler)
        log.info("domain handler registered", { domain })
      },

      unregisterDomainHandler(domain: string): void {
        domainHandlers.delete(domain)
        keywordRouter.unregisterDomainHandler(domain)
        log.info("domain handler unregistered", { domain })
      },
    }

    return router
  },

  /**
   * Get singleton instance
   */
  getInstance(): HybridIntentRouter {
    if (!hybridRouterInstance) {
      hybridRouterInstance = HybridRouter.create()
    }
    return hybridRouterInstance
  },

  /**
   * Reset singleton (for testing)
   */
  reset(): void {
    hybridRouterInstance = null
  },
}

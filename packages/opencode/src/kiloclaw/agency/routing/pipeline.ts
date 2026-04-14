/**
 * Routing Pipeline - Multi-level routing orchestration
 * Phase 8: Dynamic Multi-Level Retrieval SOTA 2026
 * KILOCLAW_DYNAMIC_MULTI_LEVEL_RETRIEVAL_SOTA_2026-04-06.md
 *
 * Implements routing through layers L0-L3:
 * - L0 (Agency Routing): Intent classification, agency resolution, policy application
 * - L1 (Skill Discovery): Skill candidate finding from manifest/capability graph
 * - L2 (Agent Selection): Agent selection by capability, limits, health
 * - L3 (Tool Resolution): Tool resolution with policy, budget, fallback
 */

import { Log } from "@/util/log"
import { Flag } from "@/flag/flag"
import { Router, type IntentRouter } from "../../router"
import { HybridRouter, type HybridIntentRouter, type HybridRoutingResult } from "./semantic/hybrid-router"
import { CapabilityRouter, CapabilityDeniedError } from "./capability-router"
import { AgencyRegistry } from "../registry/agency-registry"
import { RoutingMetrics } from "../../telemetry/routing.metrics"
import { getRouterCache, getCapabilityCache, LRUCache } from "./lru-cache"
import type { RouteResult } from "./types"
import type { Intent } from "../../types"

const log = Log.create({ service: "kiloclaw.routing.pipeline" })

// Performance: Simple hash function for capability cache keys
function hashIntent(intent: Intent): string {
  return `${intent.type}:${intent.description || ""}:${intent.risk || ""}`
}

// Pipeline step result types
export interface L0Result {
  agencyId: string
  domain: string
  confidence: number
  reasoning: string
  latencyMs: number
}

export interface L1Result {
  routeResult: RouteResult | null
  capabilities: string[]
  latencyMs: number
}

export interface L2Result {
  agentId: string | null
  agentScore: number | null
  agentHealth: "healthy" | "degraded" | "unknown"
  latencyMs: number
}

export interface L3Result {
  toolsRequested: number
  toolsResolved: number
  toolsDenied: number
  deniedTools: string[]
  blockedTools?: string[]
  fallbackUsed: boolean
  fallbackReason?: string
  latencyMs: number
}

export interface PipelineResult {
  agencyId: string
  confidence: number
  reason: string
  layers: {
    L0: L0Result
    L1?: L1Result
    L2?: L2Result
    L3?: L3Result
  }
  fallbackUsed: boolean
  fallbackReason?: string
}

/**
 * RoutingPipeline namespace - orchestrates multi-level routing
 */
export namespace RoutingPipeline {
  /**
   * Route an intent through the multi-level pipeline
   */
  export async function route(intent: Intent): Promise<PipelineResult> {
    const startTime = Date.now()

    // L0: Agency routing
    const l0Result = await routeL0(intent)
    const l0LatencyMs = Date.now() - startTime

    // Emit L0 telemetry
    if (Flag.KILO_ROUTING_SHADOW_ENABLED) {
      await RoutingMetrics.recordLayer0({
        correlationId: intent.id,
        intent: intent.description || intent.type,
        intentType: intent.type,
        domain: l0Result.domain,
        agencyId: l0Result.agencyId,
        agencyDomain: l0Result.domain,
        confidence: l0Result.confidence,
        decision: "allowed",
        reason: l0Result.reasoning,
        latencyMs: l0LatencyMs,
      })
    }

    // L1: Skill discovery (only if dynamic routing enabled)
    let l1Result: L1Result | undefined
    let l2Result: L2Result | undefined
    let l3Result: L3Result | undefined
    let fallbackUsed = false
    let fallbackReason: string | undefined

    if (Flag.KILO_ROUTING_DYNAMIC_ENABLED) {
      const l1StartTime = Date.now()
      const result = await routeL1(intent, l0Result)
      const l1LatencyMs = Date.now() - l1StartTime

      l1Result = {
        routeResult: result.routeResult,
        capabilities: result.capabilities,
        latencyMs: l1LatencyMs,
      }

      // Emit L1 telemetry
      if (Flag.KILO_ROUTING_SHADOW_ENABLED) {
        await RoutingMetrics.recordLayer1({
          correlationId: intent.id,
          agencyId: l0Result.agencyId,
          capabilities: result.capabilities,
          skillsFound: result.routeResult?.skill ? 1 : 0,
          bestSkill: result.routeResult?.skill,
          bestSkillScore: result.routeResult?.confidence,
          decision: result.routeResult ? "allowed" : "fallback",
          reason: result.routeResult ? `Route via ${result.routeResult.type}` : "fallback to domain",
          latencyMs: l1LatencyMs,
        })
      }

      if (l1Result.routeResult) {
        l2Result = await selectAgent(l0Result.agencyId, l1Result.capabilities)
        l3Result = await resolveTools(l0Result.agencyId, l1Result.routeResult.skill, l2Result.agentId ?? undefined)
        fallbackUsed = fallbackUsed || l2Result.agentId === null || l3Result.fallbackUsed
        fallbackReason = fallbackReason ?? (l3Result.fallbackUsed ? l3Result.fallbackReason : undefined)
      } else {
        fallbackUsed = true
        fallbackReason = "capability routing fallback"
      }
    } else {
      // Legacy fallback path
      fallbackUsed = true
      fallbackReason = "dynamic routing disabled"
    }

    const totalLatencyMs = Date.now() - startTime

    return {
      agencyId: l0Result.agencyId,
      confidence: l0Result.confidence,
      reason: l1Result?.routeResult
        ? `${l1Result.routeResult.reason || l1Result.routeResult.type} via ${l1Result.routeResult.skill || l1Result.routeResult.chain || l1Result.routeResult.agent || "agent"}`
        : l0Result.reasoning,
      layers: {
        L0: l0Result,
        ...(l1Result && { L1: l1Result }),
        ...(l2Result && { L2: l2Result }),
        ...(l3Result && { L3: l3Result }),
      },
      fallbackUsed,
      fallbackReason,
    }
  }

  /**
   * L2: Agent selection by capability, limits, and health
   */
  export async function selectAgent(agencyId: string, capabilities: string[]): Promise<L2Result> {
    const startTime = Date.now()

    // Use CapabilityRouter to find agents
    const agents = CapabilityRouter.findAgentsForCapabilities(capabilities, agencyId)

    if (agents.length === 0) {
      const latencyMs = Date.now() - startTime

      // Emit L2 telemetry
      if (Flag.KILO_ROUTING_SHADOW_ENABLED) {
        await RoutingMetrics.recordLayer2({
          correlationId: "",
          agencyId,
          capabilities,
          agentsFound: 0,
          bestAgent: undefined,
          bestAgentScore: undefined,
          agentHealth: "unknown",
          decision: "fallback",
          reason: "no agents found for capabilities",
          latencyMs,
        })
      }

      return {
        agentId: null,
        agentScore: null,
        agentHealth: "unknown",
        latencyMs,
      }
    }

    // Score agents and select best
    const scored = agents.map((a) => ({
      agent: a,
      score: CapabilityRouter.matchScore(a, capabilities),
    }))
    scored.sort((a, b) => b.score - a.score)
    const best = scored[0]!

    const latencyMs = Date.now() - startTime

    // Emit L2 telemetry
    if (Flag.KILO_ROUTING_SHADOW_ENABLED) {
      await RoutingMetrics.recordLayer2({
        correlationId: "",
        agencyId,
        capabilities,
        agentsFound: agents.length,
        bestAgent: best.agent.id,
        bestAgentScore: best.score,
        agentHealth: "healthy", // TODO: integrate real health check
        decision: "allowed",
        reason: `best agent for ${capabilities.join(", ")}`,
        latencyMs,
      })
    }

    return {
      agentId: best.agent.id,
      agentScore: best.score,
      agentHealth: "healthy",
      latencyMs,
    }
  }

  /**
   * L3: Tool resolution with policy, budget, and fallback
   */
  export async function resolveTools(
    agencyId: string,
    skillId?: string,
    agentId?: string,
    requestedTools?: string[],
  ): Promise<L3Result> {
    const startTime = Date.now()
    const agency = AgencyRegistry.getAgency(agencyId)
    if (!agency) {
      const latencyMs = Date.now() - startTime
      return {
        toolsRequested: 0,
        toolsResolved: 0,
        toolsDenied: 0,
        deniedTools: [],
        fallbackUsed: true,
        fallbackReason: "agency not found",
        latencyMs,
      }
    }

    const capabilities = agency.policies.allowedCapabilities

    // Capability → Tool mapping per agency-domain
    // Specialized agencies use native adapters, not generic web tools
    const isNbaAgency = agencyId === "agency-nba"
    const isFinanceAgency = agencyId === "agency-finance"
    const isNutritionAgency = agencyId === "agency-nutrition"
    const isWeatherAgency = agencyId === "agency-weather"
    const isTravelAgency = agencyId === "agency-travel"

    const nbaCapabilityToTools: Record<string, string[]> = {
      schedule_live: ["nba-games"],
      team_player_stats: ["nba-games", "nba-stats"],
      injury_status: ["nba-injuries"],
      odds_markets: ["nba-odds"],
      game_preview: ["nba-games", "nba-stats", "nba-injuries", "skill"],
      probability_estimation: ["skill"],
      vig_removal: ["skill"],
      edge_detection: ["skill"],
      calibration_monitoring: ["skill"],
      value_watchlist: ["skill"],
      recommendation_report: ["skill"],
      stake_sizing: ["skill"],
    }

    const financeCapabilityToTools: Record<string, string[]> = {
      "price.current": ["twelve_data.prices", "polygon.quotes", "finnhub.quote"],
      "price.historical": ["twelve_data.history", "polygon.history", "alpha_vantage.history"],
      orderbook: ["polygon.orderbook", "finnhub.orderbook"],
      fundamentals: ["fmp.fundamentals", "finnhub.fundamentals"],
      macro: ["fred.data", "fmp.macro"],
      filings: ["fmp.filings"],
      news: ["finnhub.news", "fmp.news"],
      "technical.indicators": ["skill"],
      "chart.patterns": ["skill"],
      "factor.analysis": ["skill"],
      "stress.test": ["skill"],
      correlation: ["skill"],
      sentiment: ["skill"],
      "signal.generation": ["skill"],
      "paper.trade": ["skill"],
      "order.simulation": ["skill"],
      "execution.assist": ["skill"],
      "portfolio.rebalance": ["skill"],
      "alert.risk": ["skill"],
      "watchlist.view": ["skill"],
      "journal.entry": ["skill"],
      "report.generate": ["skill"],
    }

    const nutritionCapabilityToTools: Record<string, string[]> = {
      "nutrition-analysis": ["skill"],
      "food-analysis": ["usda.fooddata", "openfoodfacts.products"],
      "recipe-search": ["skill"],
      "meal-planning": ["skill"],
      "diet-generation": ["skill"],
    }

    const weatherCapabilityToTools: Record<string, string[]> = {
      "weather-query": ["openweathermap.current"],
      "weather-forecast": ["openweathermap.forecast"],
      "weather-alerts": ["openweathermap.alerts"],
    }

    // Travel agency capability mapping - includes CROSS-AGENCY DELEGATION to gworkspace
    const travelCapabilityToTools: Record<string, string[]> = {
      // Native travel capabilities
      "destination-discovery": ["skill"],
      "destination-compare": ["skill"],
      "budget-fit-check": ["skill"],
      "seasonality-analysis": ["skill"],
      "visa-doc-check": ["skill"],
      "date-window-optimization": ["skill"],
      "multi-city-optimizer": ["skill"],
      // Transport
      "flight-search": ["skill"],
      "flight-compare": ["skill"],
      "rail-search": ["skill"],
      "bus-search": ["skill"],
      "transfer-search": ["skill"],
      // Accommodation
      "hotel-search": ["skill"],
      "hotel-compare": ["skill"],
      "booking-link-hotel": ["skill"],
      "cancellation-policy-check": ["skill"],
      // Local mobility
      "local-transport-plan": ["skill"],
      "car-rental-search": ["skill"],
      "parking-check": ["skill"],
      // Dining & POI
      "restaurant-search": ["skill"],
      "restaurant-availability": ["skill"],
      "poi-search": ["skill"],
      "poi-alt-search": ["skill"],
      // Activities & Events
      "activity-search": ["skill"],
      "event-search": ["skill"],
      "event-booking-link": ["skill"],
      // Itinerary & Risk
      "itinerary-build": ["skill"],
      "itinerary-balance": ["skill"],
      "weather-risk-check": ["skill"],
      // Emergency & Advisory
      "emergency-nearby": ["skill"],
      "advisory-monitor": ["skill"],
      "audit-log": ["skill"],
      // CROSS-AGENCY DELEGATION: Travel can use gworkspace email tools
      "email-search": ["gmail.search"],
      "messages-search": ["gmail.search"],
      "email-read": ["gmail.read"],
    }

    const mapped = capabilities.flatMap((cap) => {
      // NBA-specific capability mapping
      if (isNbaAgency && cap in nbaCapabilityToTools) {
        return nbaCapabilityToTools[cap as keyof typeof nbaCapabilityToTools]
      }

      // Finance-specific capability mapping
      if (isFinanceAgency && cap in financeCapabilityToTools) {
        return financeCapabilityToTools[cap as keyof typeof financeCapabilityToTools]
      }

      // Nutrition-specific capability mapping
      if (isNutritionAgency && cap in nutritionCapabilityToTools) {
        return nutritionCapabilityToTools[cap as keyof typeof nutritionCapabilityToTools]
      }

      // Weather-specific capability mapping
      if (isWeatherAgency && cap in weatherCapabilityToTools) {
        return weatherCapabilityToTools[cap as keyof typeof weatherCapabilityToTools]
      }

      // Travel-specific capability mapping (includes cross-agency delegation)
      if (isTravelAgency && cap in travelCapabilityToTools) {
        return travelCapabilityToTools[cap as keyof typeof travelCapabilityToTools]
      }

      // Generic capability mapping (for non-specialized agencies)
      if (["search", "web-search", "academic-research"].includes(cap)) return ["websearch"]
      if (["fact-checking", "verification", "source_grounding"].includes(cap)) return ["webfetch"]
      if (["synthesis", "information_gathering"].includes(cap)) return ["skill"]
      // Don't use generic tools for specialized agencies
      if (["schedule_live", "team_player_stats", "injury_status", "odds_markets", "game_preview"].includes(cap)) {
        return isNbaAgency || isFinanceAgency || isNutritionAgency || isWeatherAgency || isTravelAgency
          ? []
          : ["websearch", "webfetch", "skill"]
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
        return isNbaAgency || isFinanceAgency || isNutritionAgency || isWeatherAgency || isTravelAgency
          ? []
          : ["skill", "webfetch"]
      }
      return []
    })
    const allowlist = Array.from(
      new Set(
        agencyId === "agency-knowledge"
          ? ["websearch", "webfetch", "skill", ...mapped]
          : agencyId === "agency-nba"
            ? [
                // NBA Agency tools - real callable tools via NbaOrchestrator
                "skill",
                "nba-games",
                "nba-odds",
                "nba-injuries",
                "nba-stats",
                // Adapter names resolved by tool-identity-map for all providers in orchestrator chain
                "balldontlie.getGames",
                "balldontlie.getInjuries",
                "balldontlie.getStats",
                "espn.getScoreboard",
                "espn.getInjuries",
                "espn.getStandings",
                "odds_bet365.getOdds",
                "odds_api.getOdds",
                "parlay.getOdds",
                "polymarket.getOdds",
                "nba_api.getStats",
                ...mapped,
              ]
            : agencyId === "agency-finance"
              ? [
                  // Finance skill executes internally, tools are provider adapters
                  "skill",
                  // Price/Market data adapters
                  "twelve_data.prices",
                  "twelve_data.history",
                  "polygon.quotes",
                  "polygon.history",
                  "polygon.orderbook",
                  "alpha_vantage.history",
                  // Fundamental/Macro data
                  "finnhub.quote",
                  "finnhub.fundamentals",
                  "finnhub.orderbook",
                  "finnhub.news",
                  "fmp.fundamentals",
                  "fmp.filings",
                  "fmp.macro",
                  "fmp.news",
                  "fred.data",
                  ...mapped,
                ]
              : agencyId === "agency-nutrition"
                ? [
                    "skill",
                    // Food/Nutrition data adapters
                    "usda.fooddata",
                    "openfoodfacts.products",
                    ...mapped,
                  ]
                : agencyId === "agency-weather"
                  ? [
                      "skill",
                      // Weather data adapters
                      "openweathermap.current",
                      "openweathermap.forecast",
                      "openweathermap.alerts",
                      ...mapped,
                    ]
                  : agencyId === "agency-gworkspace"
                    ? [
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
                        ...mapped,
                      ]
                    : agencyId === "agency-travel"
                      ? [
                          // Travel agency tools + CROSS-AGENCY gworkspace delegation for email
                          "skill",
                          // Travel native tools via adapters (when implemented)
                          // Cross-agency delegation: gmail tools from gworkspace
                          "gmail.search",
                          "gmail.read",
                          ...mapped,
                        ]
                      : agencyId === "agency-development"
                        ? [
                            "read",
                            "glob",
                            "grep",
                            "apply_patch",
                            "bash",
                            "skill",
                            "codesearch",
                            "websearch",
                            "webfetch",
                            ...mapped,
                          ]
                        : mapped,
      ),
    )
    const candidates = requestedTools ?? allowlist
    const deniedTools = candidates.filter((tool) => !allowlist.includes(tool))
    const blockedTools = deniedTools
    const toolsResolved = candidates.length - deniedTools.length

    const latencyMs = Date.now() - startTime

    if (Flag.KILO_ROUTING_SHADOW_ENABLED) {
      await RoutingMetrics.recordLayer3({
        correlationId: "",
        agencyId,
        skillId,
        agentId,
        toolsRequested: candidates.length,
        toolsResolved,
        toolsDenied: deniedTools.length,
        deniedTools,
        blockedTools,
        fallbackUsed: toolsResolved === 0,
        fallbackReason: toolsResolved === 0 ? "no tools resolved by policy" : undefined,
        decision: toolsResolved === 0 ? "fallback" : "allowed",
        reason: toolsResolved === 0 ? "no tools resolved by policy" : "tools resolved by agency policy",
        latencyMs,
      })
    }

    return {
      toolsRequested: candidates.length,
      toolsResolved,
      toolsDenied: deniedTools.length,
      deniedTools,
      blockedTools,
      fallbackUsed: toolsResolved === 0,
      fallbackReason: toolsResolved === 0 ? "no tools resolved by policy" : undefined,
      latencyMs,
    }
  }

  /**
   * L0: Agency routing - classify intent and resolve agency
   * Uses HybridRouter for semantic + keyword fallback when enabled
   */
  async function routeL0(intent: Intent): Promise<L0Result> {
    const startTime = Date.now()

    let routingResult: HybridRoutingResult

    // Use HybridRouter for semantic + keyword fallback when enabled
    if (Flag.KILO_SEMANTIC_ROUTING_ENABLED) {
      if (Flag.KILO_ROUTING_LRU_ENABLED) {
        const routerCache = getRouterCache()
        const cachedRouter = routerCache.get("hybrid") as HybridIntentRouter | undefined
        if (cachedRouter) {
          routingResult = await cachedRouter.route(intent)
        } else {
          const hybridRouter = HybridRouter.getInstance()
          routerCache.set("hybrid", hybridRouter)
          routingResult = await hybridRouter.route(intent)
        }
      } else {
        const hybridRouter = HybridRouter.getInstance()
        routingResult = await hybridRouter.route(intent)
      }
    } else {
      // Legacy keyword-based routing
      let router: IntentRouter

      if (Flag.KILO_ROUTING_LRU_ENABLED) {
        const routerCache = getRouterCache()
        const cachedRouter = routerCache.get("default") as IntentRouter | undefined
        if (cachedRouter) {
          router = cachedRouter
        } else {
          router = Router.create({})
          routerCache.set("default", router)
        }
      } else {
        router = Router.create({})
      }

      const keywordResult = await router.route(intent)
      routingResult = {
        agencyId: keywordResult.agencyId,
        confidence: keywordResult.confidence,
        matchedDomain: keywordResult.matchedDomain,
        scores: keywordResult.scores,
        reasoning: keywordResult.reasoning,
        routingMethod: "keyword",
      }
    }

    const latencyMs = Date.now() - startTime

    return {
      agencyId: routingResult.agencyId,
      domain: routingResult.matchedDomain,
      confidence: routingResult.confidence,
      reasoning: routingResult.reasoning,
      latencyMs,
    }
  }

  /**
   * L1: Skill discovery - find skill/chain/agent by capabilities
   */
  async function routeL1(
    intent: Intent,
    l0Result: L0Result,
  ): Promise<{
    routeResult: RouteResult | null
    capabilities: string[]
  }> {
    const startTime = Date.now()

    // Extract capabilities from intent
    const capabilities = extractCapabilitiesFromIntent(intent)

    // Map intent risk to urgency
    const urgency = intent.risk === "critical" ? "high" : intent.risk || "medium"

    const taskIntent = {
      intent: intent.type,
      parameters: {
        capabilities,
        ...(intent.parameters || {}),
      },
      context: {
        domain: l0Result.domain,
        urgency,
        correlationId: intent.id,
      },
    }

    try {
      const routeResult = CapabilityRouter.routeTask(taskIntent, l0Result.agencyId)
      const latencyMs = Date.now() - startTime

      return { routeResult, capabilities }
    } catch (error) {
      const latencyMs = Date.now() - startTime

      if (error instanceof CapabilityDeniedError) {
        // Policy denial
        if (Flag.KILO_ROUTING_SHADOW_ENABLED) {
          await RoutingMetrics.recordPolicyDenied({
            correlationId: intent.id,
            agencyId: l0Result.agencyId,
            capability: error.message,
            policy: "deniedCapabilities",
            reason: error.message,
          })
        }

        await RoutingMetrics.recordFallback({
          correlationId: intent.id,
          layer: "L1",
          originalRoute: "capability",
          fallbackRoute: "domain-fallback",
          reason: `Policy denied: ${error.message}`,
          latencyMs,
        })
      }

      // Return null to indicate fallback
      return { routeResult: null, capabilities }
    }
  }
}

/**
 * Extract capabilities from intent description
 * Uses LRU cache for performance optimization
 */
function extractCapabilitiesFromIntent(intent: Intent): string[] {
  // Performance: Check cache first if enabled
  if (Flag.KILO_ROUTING_LRU_ENABLED) {
    const cache = getCapabilityCache()
    const cacheKey = hashIntent(intent)
    const cached = cache.get(cacheKey)
    if (cached) {
      log.debug("capability cache hit", { intentId: intent.id })
      return cached
    }

    const capabilities = doExtractCapabilities(intent)
    cache.set(cacheKey, capabilities)
    return capabilities
  }

  return doExtractCapabilities(intent)
}

/**
 * Core capability extraction logic (uncached)
 */
function doExtractCapabilities(intent: Intent): string[] {
  const capabilities: string[] = []
  const text = `${intent.type} ${intent.description}`.toLowerCase()

  const capabilityMap: Record<string, string[]> = {
    search: ["search", "find", "lookup"],
    web: ["web", "online", "internet"],
    research: ["research", "investigate"],
    factcheck: ["fact", "verify", "check", "confirm"],
    synthesize: ["synthesize", "summarize", "combine"],
    analyze: ["analyze", "analysis", "examine"],
    code: ["code", "program", "develop", "implement"],
    debug: ["debug", "bug", "fix", "error"],
    review: ["review", "check", "examine"],
    test: ["test", "testing", "verify"],
    planning: ["plan", "planning", "roadmap"],
    nutrition: ["nutrition", "food", "diet", "meal", "calorie"],
    weather: [
      "weather",
      "temperature",
      "temperatura",
      "forecast",
      "previsioni",
      "rain",
      "pioggia",
      "sun",
      "sole",
      "snow",
      "neve",
      "meteo",
      "clima",
      "humidity",
      "umidità",
      "wind",
      "vento",
      "alert",
      "allerta",
      "warning",
      "avviso",
      "cloudy",
      "nuvoloso",
      "storm",
      "tempesta",
      "fog",
      "nebbia",
      "hot",
      "cold",
      "caldo",
      "freddo",
    ],
    nba_analysis: ["nba", "basketball", "partita", "partite", "game", "games", "analisi", "analysis"],
    schedule_live: ["schedule", "tonight", "today", "programma", "sera", "notte", "live", "score"],
    team_player_stats: ["statistiche", "stats", "player", "players", "team", "squadra", "squadre", "realizzatori"],
    injury_status: ["injury", "injuries", "infortunio", "infortuni", "roster", "formazioni"],
    odds_markets: ["odds", "quote", "quota", "scommessa", "scommesse", "betting", "mercati", "value betting"],
    edge_detection: ["value", "edge", "probabilita", "probabilità", "vig", "moneyline", "spread", "over", "under"],
    recommendation_report: ["proposta", "multipla", "puntate", "puntata", "report", "raccomandazione"],
    "drive.search": ["google drive", "drive", "search drive", "trova file", "cerca file", "ricerca file"],
    "drive.list": ["list drive", "elenca file", "cartella", "cartelle", "folder", "folders"],
    "drive.read": ["open file", "read file", "apri file", "leggi file", "documento", "documenti"],
    "gmail.search": ["gmail", "search email", "cerca email", "posta"],
    "gmail.read": ["read email", "leggi email", "messaggio"],
    "calendar.list": ["calendar", "calendario", "eventi", "events"],
    "docs.read": ["google docs", "docs", "documento google"],
    "sheets.read": ["google sheets", "sheets", "foglio", "fogli"],
  }

  for (const [capability, keywords] of Object.entries(capabilityMap)) {
    if (keywords.some((kw) => text.includes(kw))) {
      capabilities.push(capability)
    }
  }

  if (capabilities.length === 0) {
    capabilities.push(intent.type.toLowerCase())
  }

  return [...new Set(capabilities)]
}

// SemanticRouter - L0-L3 capability-based routing
// Based on SEMANTIC_ROUTER_V2_CAPABILITY_BASED.md

import { Log } from "@/util/log"
import { Flag } from "@/flag/flag"
import { type Domain } from "../../../types"
import { CapabilityRegistry, getCapabilityRegistry } from "./capability-registry"
import { CapabilityExtractor } from "./capability-extractor"
import { SkillRegistry } from "../../registry/skill-registry"
import { AgencyRegistry } from "../../registry/agency-registry"
import { getCatalog } from "../../catalog"
import { extractCapabilitiesWithFallback, classifyDomainWithLLM, type LLMCapabilityResult } from "./llm-extractor"
import {
  type SemanticIntent,
  type RoutingResult,
  type DomainDetectionResult,
  type CapabilityMatchingResult,
  type SkillSelectionResult,
  type ToolResolutionResult,
  type SemanticRouterConfig,
  type CapabilityMatch,
  DEFAULT_SEMANTIC_ROUTER_CONFIG,
  ROUTING_THRESHOLDS,
} from "./types"
import { DOMAIN_KEYWORD_HINTS, hybridScore } from "./utils"
import {
  getSemanticRouterCache,
  getCapabilityExtractionCache,
  getDomainDetectionCache,
  cacheKey,
  type CacheEntry,
} from "./cache"

const log = Log.create({ service: "kiloclaw.semantic.router" })

export class SemanticRouter {
  private capabilityRegistry: CapabilityRegistry
  private capabilityExtractor: CapabilityExtractor
  private config: SemanticRouterConfig

  constructor(config: Partial<SemanticRouterConfig> = {}) {
    this.config = { ...DEFAULT_SEMANTIC_ROUTER_CONFIG, ...config }
    this.capabilityRegistry = getCapabilityRegistry()
    this.capabilityExtractor = new CapabilityExtractor(this.capabilityRegistry)
  }

  /**
   * Route an intent through L0-L3 layers to find the best agency/skill/tool
   * Uses caching to avoid redundant computation
   */
  async route(intent: SemanticIntent): Promise<RoutingResult> {
    log.info("routing intent", { intentId: intent.id, type: intent.type, description: intent.description.slice(0, 50) })

    // Check routing cache first
    const routingCache = getSemanticRouterCache()
    const routingCacheKey = cacheKey(intent.id, intent.description)
    const cachedRouting = routingCache.get(routingCacheKey)
    if (cachedRouting) {
      log.info("routing cache hit", { intentId: intent.id })
      return cachedRouting.value as RoutingResult
    }

    // L0: Domain Detection (with caching)
    const domainResult = this.detectDomain(intent)

    // L1: Capability Matching (with caching)
    const capabilityResult = await this.matchCapabilities(intent, domainResult)

    // L2: Skill Selection
    const skillResult = this.selectSkill(capabilityResult)

    // L3: Tool Resolution
    const toolResult = this.resolveTool(skillResult)

    // Calculate final confidence
    const finalConfidence = this.calculateFinalConfidence(
      domainResult.confidence,
      capabilityResult.confidence,
      skillResult.confidence,
      toolResult?.confidence,
    )

    const result: RoutingResult = {
      intent,
      domain: domainResult,
      capability: capabilityResult,
      skill: skillResult,
      tool: toolResult,
      finalConfidence,
      reasoning: this.buildReasoning(domainResult, capabilityResult, skillResult, toolResult),
    }

    // Cache the final routing result
    routingCache.set(routingCacheKey, { value: result, timestamp: Date.now() })

    log.info("intent routed", {
      intentId: intent.id,
      agencyId: capabilityResult.agencyId,
      skillId: skillResult.skillId,
      confidence: finalConfidence,
    })

    return result
  }

  /**
   * L0: Detect domain using keyword hints and embeddings
   * Falls back to LLM-like classification when keyword matching fails
   * Uses domain detection cache for performance
   */
  private detectDomain(intent: SemanticIntent): DomainDetectionResult {
    // Check domain detection cache
    const domainCache = getDomainDetectionCache()
    const domainCacheKey = `domain:${intent.description.slice(0, 100)}`
    const cachedDomain = domainCache.get(domainCacheKey)
    if (cachedDomain) {
      return cachedDomain.value as DomainDetectionResult
    }

    const text = intent.description.toLowerCase()
    const domains: Array<{ domain: Domain; score: number; keywords: string[] }> = []

    for (const [domain, hints] of Object.entries(DOMAIN_KEYWORD_HINTS)) {
      const matchedKeywords: string[] = []
      let score = 0

      for (const hint of hints) {
        if (text.includes(hint.toLowerCase())) {
          matchedKeywords.push(hint)
          score++
        }
      }

      if (matchedKeywords.length > 0) {
        // Normalize by number of hints
        const normalizedScore = score / hints.length
        // Boost for multiple matches
        const boost = matchedKeywords.length > 2 ? 0.1 : 0
        domains.push({
          domain: domain as Domain,
          score: Math.min(normalizedScore + boost, 1.0),
          keywords: matchedKeywords,
        })
      }
    }

    let result: DomainDetectionResult

    if (domains.length === 0) {
      // LLM-like fallback for domain detection
      const llmDomain = classifyDomainWithLLM(intent)
      result = {
        domain: llmDomain as Domain,
        confidence: 0.5,
        matchedKeywords: [],
        reasoning: `LLM-assisted domain detection: ${llmDomain}`,
      }
    } else {
      // Sort by score descending
      domains.sort((a, b) => b.score - a.score)
      const best = domains[0]

      result = {
        domain: best.domain,
        confidence: best.score,
        matchedKeywords: best.keywords,
        reasoning: `Domain "${best.domain}" matched with ${best.keywords.join(", ")}`,
      }
    }

    // Cache the domain detection result
    domainCache.set(domainCacheKey, { value: result, timestamp: Date.now() })

    return result
  }

  /**
   * L1: Match capabilities using the CapabilityExtractor with LLM fallback
   * Uses capability extraction cache for performance
   */
  private async matchCapabilities(
    intent: SemanticIntent,
    domainHint: DomainDetectionResult,
  ): Promise<CapabilityMatchingResult> {
    // Check capability extraction cache
    const capCache = getCapabilityExtractionCache()
    const capCacheKey = `cap:${intent.description.slice(0, 100)}`
    const cachedCap = capCache.get(capCacheKey)
    if (cachedCap) {
      return cachedCap.value as CapabilityMatchingResult
    }

    // Try embedding + keyword extraction first
    const { capabilities: capabilityMatches, method } = await extractCapabilitiesWithFallback(intent)

    let result: CapabilityMatchingResult

    if (capabilityMatches.length === 0) {
      // LLM fallback: try to find capabilities using LLM-like heuristics
      const llmResult = await this.extractCapabilitiesWithLLMFallback(intent)
      if (llmResult.capabilities.length > 0) {
        const agencyId = this.findAgencyForCapability(llmResult.capabilities[0], domainHint.domain)
        result = {
          agencyId,
          confidence: llmResult.confidence,
          matchedCapabilities: llmResult.capabilities.map((id) => ({
            capability: { id, domain: domainHint.domain, description: "", keywords: [], metadata: {} },
            confidence: llmResult.confidence,
            matchType: "hybrid" as const,
          })),
          reasoning: llmResult.reasoning,
        }
      } else {
        // Final fallback to domain-based agency
        result = {
          agencyId: `agency-${domainHint.domain}` as any,
          confidence: domainHint.confidence * 0.8,
          matchedCapabilities: [],
          reasoning: `No capabilities matched, using domain fallback: ${domainHint.domain}`,
        }
      }
    } else {
      // Find agency by capabilities
      const topMatch = capabilityMatches[0]
      const agencyId = this.findAgencyForCapability(topMatch.capability.id, domainHint.domain)

      result = {
        agencyId,
        confidence: topMatch.confidence,
        matchedCapabilities: capabilityMatches.slice(0, 5), // Top 5 matches
        reasoning: `Best capability match (${method}): ${topMatch.capability.id} (${(topMatch.confidence * 100).toFixed(0)}%)`,
      }
    }

    // Cache the capability matching result
    capCache.set(capCacheKey, { value: result, timestamp: Date.now() })

    return result
  }

  /**
   * Extract capabilities using LLM-like heuristics as final fallback
   */
  private async extractCapabilitiesWithLLMFallback(intent: SemanticIntent): Promise<LLMCapabilityResult> {
    const registry = getCapabilityRegistry()
    const text = intent.description.toLowerCase()

    // Keyword-based capability extraction
    const keywordMap: Record<string, string> = {
      search: "web_search",
      find: "web_search",
      lookup: "information_gathering",
      research: "information_gathering",
      product: "product_research",
      price: "product_research",
      verify: "fact_verification",
      check: "fact_verification",
      fact: "fact_verification",
      code: "code_generation",
      generate: "code_generation",
      create: "code_generation",
      write: "code_generation",
      review: "code_review",
      debug: "debugging",
      bug: "debugging",
      fix: "debugging",
      error: "debugging",
      test: "testing",
      plan: "planning",
      analyze: "analysis",
      summarize: "summarization",
      explain: "explanation",
      diet: "nutrition_analysis",
      nutrition: "nutrition_analysis",
      food: "nutrition_analysis",
      recipe: "recipe_search",
      meal: "meal_planning",
      weather: "weather_query",
      forecast: "weather_query",
      document: "document_analysis",
      compare: "comparison",
      refactor: "refactoring",
    }

    const foundCapabilities = new Set<string>()

    for (const [keyword, capabilityId] of Object.entries(keywordMap)) {
      if (text.includes(keyword)) {
        const capability = registry.get(capabilityId)
        if (capability) {
          foundCapabilities.add(capabilityId)
        }
      }
    }

    if (foundCapabilities.size > 0) {
      return {
        capabilities: Array.from(foundCapabilities),
        confidence: 0.4,
        reasoning: "LLM-assisted capability extraction from keywords",
      }
    }

    return {
      capabilities: [],
      confidence: 0.1,
      reasoning: "No capabilities found even with LLM fallback",
    }
  }

  /**
   * L2: Select the best skill from matched capabilities
   */
  private selectSkill(capabilityResult: CapabilityMatchingResult): SkillSelectionResult {
    if (capabilityResult.matchedCapabilities.length === 0) {
      // Fallback to default skill for domain
      const defaultSkill = this.getDefaultSkillForDomain(capabilityResult.agencyId)
      return {
        skillId: defaultSkill,
        confidence: capabilityResult.confidence * 0.7,
        matchReason: "No capability match, using domain default",
      }
    }

    // Find skills matching the top capabilities
    const topCapabilities = capabilityResult.matchedCapabilities.slice(0, 3).map((m) => m.capability.id)
    const skills = SkillRegistry.findByCapabilities(topCapabilities)

    if (skills.length === 0) {
      const defaultSkill = this.getDefaultSkillForDomain(capabilityResult.agencyId)
      return {
        skillId: defaultSkill,
        confidence: capabilityResult.confidence * 0.6,
        matchReason: "No skills found for capabilities, using domain default",
      }
    }

    // Score skills by capability match
    const scored = skills.map((skill: { capabilities: string[]; id: string }) => {
      const matchedCaps = skill.capabilities.filter((c: string) => topCapabilities.includes(c))
      const score = matchedCaps.length / Math.max(skill.capabilities.length, 1)
      return { skill, score }
    })

    scored.sort((a, b) => b.score - a.score)
    const best = scored[0]

    return {
      skillId: best.skill.id,
      confidence: best.score * capabilityResult.confidence,
      matchReason: `Best skill match: ${best.skill.id} (${(best.score * 100).toFixed(0)}% capability match)`,
    }
  }

  /**
   * L3: Resolve the tool for the selected skill
   */
  private resolveTool(skillResult: SkillSelectionResult): ToolResolutionResult | null {
    const skill = SkillRegistry.getSkill(skillResult.skillId)
    if (!skill) {
      return null
    }

    // Get the first capability and find a tool that supports it
    const catalog = getCatalog()
    const primaryCapability = skill.capabilities[0]

    // Find tool by capability (from the tool's associated skill)
    for (const tool of catalog.listTools()) {
      const toolSkill = catalog.findByTool(tool.id)
      if (toolSkill && toolSkill.capabilities.includes(primaryCapability)) {
        return {
          toolId: tool.id,
          provider: primaryCapability, // The capability determines the provider type
          confidence: skillResult.confidence,
        }
      }
    }

    // Fallback: return the skill's primary capability as the "tool"
    return {
      toolId: primaryCapability,
      provider: primaryCapability,
      confidence: skillResult.confidence,
    }
  }

  /**
   * Find agency for a capability, using domain as fallback
   */
  private findAgencyForCapability(capabilityId: string, domainHint: Domain): string {
    // Try to find agency via AgencyRegistry
    const agencies = AgencyRegistry.getAllAgencies()
    for (const agency of agencies) {
      const allowedCaps = agency.policies?.allowedCapabilities ?? []
      if (allowedCaps.includes(capabilityId)) {
        return agency.id
      }
    }

    // Fallback to domain-based agency
    return `agency-${domainHint}` as any
  }

  /**
   * Get default skill for a domain
   */
  private getDefaultSkillForDomain(agencyId: string): string {
    const domain = agencyId.replace("agency-", "")
    if (domain === "gworkspace") {
      return "drive.search"
    }
    const defaults: Record<Domain, string> = {
      development: "code-generation",
      knowledge: "web-search",
      nutrition: "nutrition-analysis",
      weather: "weather-forecast",
      travel: "destination-discovery",
      nba: "nba-analysis",
      finance: "finance-market-data",
      custom: "web-search",
    }
    return defaults[domain as Domain] || "web-search"
  }

  /**
   * Calculate final confidence from layer confidences
   */
  private calculateFinalConfidence(
    domainConf: number,
    capabilityConf: number,
    skillConf: number,
    toolConf: number | undefined,
  ): number {
    // Weighted geometric mean
    const confidences = [domainConf, capabilityConf, skillConf]
    if (toolConf !== undefined) {
      confidences.push(toolConf)
    }

    const product = confidences.reduce((acc, c) => acc * c, 1)
    const geometricMean = Math.pow(product, 1 / confidences.length)

    // Adjust by routing thresholds
    if (geometricMean >= ROUTING_THRESHOLDS.HIGH_CONFIDENCE) {
      return geometricMean
    } else if (geometricMean >= ROUTING_THRESHOLDS.MEDIUM_CONFIDENCE) {
      return geometricMean * 0.9
    } else {
      return geometricMean * 0.8
    }
  }

  /**
   * Build human-readable reasoning
   */
  private buildReasoning(
    domain: DomainDetectionResult,
    capability: CapabilityMatchingResult,
    skill: SkillSelectionResult,
    tool: ToolResolutionResult | null,
  ): string {
    const parts: string[] = []

    parts.push(`Domain: ${domain.domain} (${(domain.confidence * 100).toFixed(0)}%)`)
    parts.push(`Agency: ${capability.agencyId} (${(capability.confidence * 100).toFixed(0)}%)`)
    parts.push(`Skill: ${skill.skillId} (${(skill.confidence * 100).toFixed(0)}%)`)

    if (tool) {
      parts.push(`Tool: ${tool.toolId} via ${tool.provider}`)
    }

    return parts.join(" → ")
  }

  /**
   * Get the capability registry for external access
   */
  getCapabilityRegistry(): CapabilityRegistry {
    return this.capabilityRegistry
  }

  /**
   * Bootstrap default capabilities for all existing skills
   */
  async bootstrapCapabilities(): Promise<void> {
    const skills = SkillRegistry.getAllSkills()

    log.info("bootstrapping capabilities for skills", { count: skills.length })

    for (const skill of skills) {
      // Create capability from skill
      const capability = {
        id: skill.capabilities[0] || skill.id,
        domain: this.inferDomainFromSkill(skill.id),
        description: skill.description,
        keywords: this.inferKeywordsFromSkill(skill),
        capabilities: skill.capabilities,
        metadata: { skillId: skill.id, version: skill.version },
      }

      this.capabilityRegistry.register(capability)
    }

    // Bootstrap embeddings
    await this.capabilityRegistry.bootstrapEmbeddings()

    log.info("capabilities bootstrapped", { count: this.capabilityRegistry.size() })
  }

  /**
   * Infer domain from skill ID
   */
  private inferDomainFromSkill(skillId: string): string {
    const skillIdLower = skillId.toLowerCase()
    if (skillIdLower.includes("code") || skillIdLower.includes("debug") || skillIdLower.includes("test")) {
      return "development"
    }
    if (skillIdLower.includes("nutrition") || skillIdLower.includes("food") || skillIdLower.includes("diet")) {
      return "nutrition"
    }
    if (skillIdLower.includes("weather") || skillIdLower.includes("forecast")) {
      return "weather"
    }
    return "knowledge"
  }

  /**
   * Infer keywords from skill definition
   */
  private inferKeywordsFromSkill(skill: { id: string; name: string; description: string }): string[] {
    const text = `${skill.id} ${skill.name} ${skill.description}`.toLowerCase()
    const keywords: string[] = []

    // Common keyword patterns
    const patterns = [
      "search",
      "find",
      "lookup",
      "research",
      "analyze",
      "generate",
      "create",
      "review",
      "debug",
      "test",
      "plan",
      "forecast",
      "check",
      "verify",
    ]

    for (const pattern of patterns) {
      if (text.includes(pattern)) {
        keywords.push(pattern)
      }
    }

    // If no keywords found, use skill ID tokens
    if (keywords.length === 0) {
      const tokens = skill.id.split(/[-_]/).filter((t) => t.length > 2)
      keywords.push(...tokens.slice(0, 3))
    }

    return keywords
  }
}

// Singleton instance
let routerInstance: SemanticRouter | null = null

export function getSemanticRouter(config?: Partial<SemanticRouterConfig>): SemanticRouter {
  if (!routerInstance) {
    routerInstance = new SemanticRouter(config)
  }
  return routerInstance
}

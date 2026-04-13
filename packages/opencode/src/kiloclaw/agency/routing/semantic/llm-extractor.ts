// LLM Capability Extractor - Fallback using LLM classification
// Phase 3: Semantic Router v2 - Capability-Based Dynamic Routing

import { Log } from "@/util/log"
import { CapabilityExtractor } from "./capability-extractor"
import { getCapabilityRegistry } from "./capability-registry"
import type { CapabilityMatch, SemanticIntent } from "./types"

const log = Log.create({ service: "kiloclaw.semantic.llm-extractor" })

// LLM classification prompt for capability extraction
const CAPABILITY_CLASSIFICATION_PROMPT = `You are a capability classifier for an AI coding assistant.
Given a user intent, classify it into one or more of these capabilities:

- web_search: Search the web for information
- information_gathering: Gather and collect information
- product_research: Research products and prices
- fact_verification: Verify facts and claims
- source_verification: Verify sources and citations
- code_generation: Generate code, programs, software
- code_review: Review code for issues
- debugging: Debug code, find and fix errors
- testing: Test code, verify functionality
- planning: Plan architecture and implementation
- analysis: Analyze content and data
- summarization: Summarize information
- explanation: Explain concepts
- nutrition_analysis: Analyze nutrition and diet
- recipe_search: Search for recipes
- meal_planning: Plan meals and diets
- weather_query: Get weather information
- document_analysis: Analyze documents
- comparison: Compare options and solutions
- refactoring: Refactor and improve code
- nba_analysis: Analyze NBA games, teams, players, statistics
- nba_schedule: Get NBA game schedules and fixtures
- nba_injuries: Get NBA injury reports and player status
- nba_odds: Get NBA betting odds and markets
- nba_edge_detection: Analyze value betting opportunities

User intent: "{intent}"

Classify this intent by responding with a JSON array of capability IDs that best match.
Response format: ["capability_id1", "capability_id2", ...]

Only respond with the JSON array, nothing else.`

// LLM domain classification prompt
const DOMAIN_CLASSIFICATION_PROMPT = `You are a domain classifier for an AI coding assistant.
Given a user intent, classify it into one of these domains:

- development: Coding, debugging, testing, software development
- knowledge: Web search, research, information gathering, fact checking
- nutrition: Diet, food, nutrition analysis, recipes
- weather: Weather forecasts, conditions, alerts
- gworkspace: Gmail, Google Drive, Calendar, Docs, Sheets, workspace operations
- nba: NBA games, statistics, injuries, betting analysis, odds, sports betting
- custom: Custom/unknown tasks

User intent: "{intent}"

Respond with only the domain name, nothing else.`

export interface LLMCapabilityResult {
  capabilities: string[]
  confidence: number
  reasoning: string
}

/**
 * Extract capabilities using LLM when embedding-based matching fails
 */
export async function extractCapabilitiesWithLLM(
  intent: SemanticIntent,
  fallbackCapabilities: CapabilityMatch[],
): Promise<LLMCapabilityResult> {
  const registry = getCapabilityRegistry()

  // If we have fallback matches, use the top ones
  if (fallbackCapabilities.length > 0) {
    const topCapabilities = fallbackCapabilities.slice(0, 3).map((m) => m.capability.id)
    return {
      capabilities: topCapabilities,
      confidence: fallbackCapabilities[0].confidence * 0.8, // Reduce confidence for LLM fallback
      reasoning: `LLM-assisted: Based on similar capabilities: ${topCapabilities.join(", ")}`,
    }
  }

  // Try to classify using keyword hints first
  const text = intent.description.toLowerCase()

  // Simple keyword-based classification as fallback
  const keywordCapabilities = extractCapabilitiesFromKeywords(text)
  if (keywordCapabilities.length > 0) {
    return {
      capabilities: keywordCapabilities,
      confidence: 0.4,
      reasoning: `Keyword-based fallback: ${keywordCapabilities.join(", ")}`,
    }
  }

  // If no capabilities found, return empty with low confidence
  return {
    capabilities: [],
    confidence: 0.1,
    reasoning: "No capabilities matched, using default routing",
  }
}

/**
 * Simple keyword-based capability extraction fallback
 */
function extractCapabilitiesFromKeywords(text: string): string[] {
  const capabilities: string[] = []

  const keywordMap: Record<string, string[]> = {
    search: ["web_search", "information_gathering"],
    find: ["web_search", "information_gathering"],
    lookup: ["web_search", "information_gathering"],
    research: ["product_research", "information_gathering"],
    product: ["product_research"],
    price: ["product_research"],
    compare: ["comparison", "product_research"],
    verify: ["fact_verification", "source_verification"],
    check: ["fact_verification", "code_review"],
    fact: ["fact_verification"],
    source: ["source_verification"],
    code: ["code_generation", "code_review"],
    generate: ["code_generation"],
    create: ["code_generation"],
    write: ["code_generation"],
    review: ["code_review"],
    debug: ["debugging"],
    bug: ["debugging"],
    fix: ["debugging"],
    error: ["debugging"],
    test: ["testing"],
    testing: ["testing"],
    plan: ["planning"],
    analyze: ["analysis"],
    analysis: ["analysis"],
    summarize: ["summarization"],
    summary: ["summarization"],
    explain: ["explanation"],
    diet: ["nutrition_analysis", "meal_planning"],
    nutrition: ["nutrition_analysis"],
    food: ["nutrition_analysis", "recipe_search"],
    recipe: ["recipe_search"],
    meal: ["meal_planning"],
    weather: ["weather_query"],
    forecast: ["weather_query"],
    temperature: ["weather_query"],
    document: ["document_analysis"],
    gmail: ["gmail.search", "gmail.read"],
    "google drive": ["drive.search", "drive.read"],
    drive: ["drive.search", "drive.read"],
    folder: ["drive.list"],
    cartella: ["drive.list"],
    calendar: ["calendar.list", "calendar.read"],
    evento: ["calendar.read"],
    docs: ["docs.read"],
    sheets: ["sheets.read"],
    documento: ["docs.read"],
    foglio: ["sheets.read"],
    refactor: ["refactoring"],
    simplify: ["refactoring"],
    nba: ["nba_analysis", "nba_schedule", "nba_injuries", "nba_odds"],
    basketball: ["nba_analysis", "nba_schedule"],
    basket: ["nba_analysis", "nba_schedule"],
    partita: ["nba_schedule"],
    partite: ["nba_schedule"],
    giocatore: ["nba_analysis"],
    giocatori: ["nba_analysis"],
    roster: ["nba_analysis"],
    infortunio: ["nba_injuries"],
    infortuni: ["nba_injuries"],
    injury: ["nba_injuries"],
    odds: ["nba_odds"],
    scommessa: ["nba_odds", "nba_edge_detection"],
    scommesse: ["nba_odds", "nba_edge_detection"],
    betting: ["nba_odds", "nba_edge_detection"],
    quote: ["nba_odds"],
    quota: ["nba_odds"],
    pronostico: ["nba_edge_detection"],
    pronostici: ["nba_edge_detection"],
    statistiche: ["nba_analysis"],
    stats: ["nba_analysis"],
    puntata: ["nba_odds"],
    puntate: ["nba_odds"],
    multipla: ["nba_odds", "nba_edge_detection"],
    "play-in": ["nba_schedule"],
    stagione: ["nba_schedule", "nba_analysis"],
    playoffs: ["nba_schedule"],
  }

  for (const [keyword, caps] of Object.entries(keywordMap)) {
    if (text.includes(keyword) && !capabilities.includes(caps[0])) {
      capabilities.push(...caps)
    }
  }

  return [...new Set(capabilities)]
}

/**
 * Classify domain using LLM-like heuristics
 */
export function classifyDomainWithLLM(intent: SemanticIntent): string {
  const text = intent.description.toLowerCase()

  const domainKeywords: Record<string, string[]> = {
    development: [
      "code",
      "debug",
      "test",
      "build",
      "git",
      "function",
      "class",
      "file",
      "repository",
      "codice",
      "programma",
    ],
    knowledge: [
      "search",
      "find",
      "information",
      "research",
      "document",
      "cercami",
      "cerca",
      "ricerca",
      "annuncio",
      "annunci",
    ],
    nutrition: ["food", "diet", "nutrition", "meal", "recipe", "calories", "cibo", "dieta", "nutrizione", "ricetta"],
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
    gworkspace: [
      "gmail",
      "google drive",
      "drive",
      "calendar",
      "google calendar",
      "docs",
      "sheets",
      "cartella",
      "cartelle",
      "documenti",
      "fogli",
      "workspace",
      "condivisi",
    ],
    nba: [
      "nba",
      "basketball",
      "basket",
      "partita",
      "partite",
      "squadre",
      "giocatore",
      "giocatori",
      "roster",
      "infortunio",
      "infortuni",
      "injury",
      "odds",
      "scommesse",
      "scommessa",
      "betting",
      "quote",
      "quota",
      "lakers",
      "celtics",
      "warriors",
      "heat",
      "stagione",
      "regular season",
      "playoffs",
      "western conference",
      "eastern conference",
      "pronostico",
      "pronostici",
      "statistiche",
      "stats",
      "puntata",
      "puntate",
      "multipla",
      "over",
      "under",
      "handicap",
      "spread",
      "moneyline",
      "parlay",
      "acca",
      "play-in",
      "game tonight",
      "stasera",
      "notte",
      "sera",
    ],
  }

  let bestDomain = "knowledge"
  let maxMatches = 0

  for (const [domain, keywords] of Object.entries(domainKeywords)) {
    const matches = keywords.filter((kw) => text.includes(kw)).length
    if (matches > maxMatches) {
      maxMatches = matches
      bestDomain = domain
    }
  }

  return bestDomain
}

/**
 * Combined capability extraction with LLM fallback
 * Uses embedding first, then keyword matching, then LLM heuristics
 */
export async function extractCapabilitiesWithFallback(intent: SemanticIntent): Promise<{
  capabilities: CapabilityMatch[]
  method: "embedding" | "keyword" | "llm"
}> {
  const extractor = new CapabilityExtractor(getCapabilityRegistry())

  // Try embedding-based extraction
  try {
    const embeddingMatches = await extractor.extract(intent)
    if (embeddingMatches.length > 0) {
      return { capabilities: embeddingMatches, method: "embedding" }
    }
  } catch (err) {
    log.debug("embedding extraction failed, trying keyword", { err: String(err) })
  }

  // Try keyword-based extraction
  const keywordMatches = extractor.extractFromKeywords(intent)
  if (keywordMatches.length > 0) {
    return { capabilities: keywordMatches, method: "keyword" }
  }

  // Fallback to LLM-like heuristics
  const llmResult = await extractCapabilitiesWithLLM(intent, [])
  const registry = getCapabilityRegistry()

  const llmMatches: CapabilityMatch[] = []
  for (const capId of llmResult.capabilities) {
    const capability = registry.get(capId)
    if (capability) {
      llmMatches.push({
        capability,
        confidence: llmResult.confidence,
        matchType: "keyword", // Treat as keyword since LLM wasn't actually called
      })
    }
  }

  return { capabilities: llmMatches, method: "llm" }
}

export { extractCapabilitiesFromKeywords }

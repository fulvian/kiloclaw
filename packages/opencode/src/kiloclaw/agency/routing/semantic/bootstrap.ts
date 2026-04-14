// Bootstrap Capabilities - Register capabilities for all existing skills
// Phase 2: Semantic Router v2 - Capability-Based Dynamic Routing

import { Log } from "@/util/log"
import { CapabilityRegistry, getCapabilityRegistry } from "./capability-registry"
import {
  developmentSkills,
  knowledgeSkills,
  nutritionSkills,
  weatherSkills,
  nbaSkills,
  financeSkills,
  travelSkills,
  allSkills,
} from "@/kiloclaw/skills"
import type { Skill } from "@/kiloclaw/skill"
import type { Domain } from "@/kiloclaw/types"

const log = Log.create({ service: "kiloclaw.semantic.bootstrap" })

// Domain inference from skill tags
function inferDomain(skill: Skill): Domain {
  const tags = skill.tags.map((t: string) => t.toLowerCase())
  const name = skill.name.toLowerCase()

  if (tags.includes("development") || tags.includes("code") || name.includes("code")) {
    return "development"
  }
  if (tags.includes("knowledge") || tags.includes("research") || name.includes("web") || name.includes("search")) {
    return "knowledge"
  }
  if (tags.includes("nutrition") || tags.includes("food") || name.includes("diet") || name.includes("recipe")) {
    return "nutrition"
  }
  if (tags.includes("weather") || name.includes("weather")) {
    return "weather"
  }
  if (tags.includes("nba") || tags.includes("sports") || tags.includes("betting")) {
    return "nba"
  }
  if (
    tags.includes("finance") ||
    tags.includes("trading") ||
    tags.includes("market") ||
    name.includes("price") ||
    name.includes("stock")
  ) {
    return "finance"
  }

  return "knowledge" // default
}

// Extract keywords from skill name and description
function extractKeywords(skill: Skill): string[] {
  const text = `${skill.name} ${skill.tags.join(" ")}`.toLowerCase()
  const keywords: string[] = []

  // Common patterns
  const patterns = [
    "search",
    "find",
    "lookup",
    "research",
    "analyze",
    "analyse",
    "generate",
    "create",
    "review",
    "debug",
    "fix",
    "test",
    "plan",
    "forecast",
    "check",
    "verify",
    "validate",
    "compare",
    "synthesize",
    "summarize",
    "explain",
    "alert",
    "current",
    "diet",
    "nutrition",
    "recipe",
    "food",
    "weather",
    "code",
    "document",
    "literature",
    "fact",
    "critical",
    "price",
    "market",
    "trade",
    "stock",
    "risk",
    "signal",
    "technical",
  ]

  for (const pattern of patterns) {
    if (text.includes(pattern)) {
      keywords.push(pattern)
    }
  }

  // Add skill name tokens
  const nameTokens = skill.name
    .toLowerCase()
    .split(/[\s\-_]+/)
    .filter((t: string) => t.length > 3 && !keywords.includes(t))
  keywords.push(...nameTokens.slice(0, 3))

  // Add capability tags
  keywords.push(...skill.capabilities.slice(0, 5))

  return [...new Set(keywords)] // deduplicate
}

/**
 * Bootstrap capabilities from all registered skills
 */
export async function bootstrapCapabilitiesFromSkills(): Promise<number> {
  const registry = getCapabilityRegistry()
  let registered = 0

  log.info("bootstrapping capabilities from skills", { skillCount: allSkills.length })

  for (const skill of allSkills) {
    const domain = inferDomain(skill)
    const keywords = extractKeywords(skill)

    // Create capability descriptor
    const capability = {
      id: skill.capabilities[0] || skill.id,
      domain,
      description: `${skill.name} - ${skill.tags.join(", ")}`,
      keywords,
      capabilities: skill.capabilities,
      metadata: {
        skillId: skill.id,
        skillName: skill.name,
        version: skill.version,
        source: "skill",
      },
    }

    try {
      registry.register(capability)
      registered++
      log.debug("registered capability from skill", { skillId: skill.id, capabilityId: capability.id })
    } catch (err) {
      // Capability might already exist, skip
      if (err instanceof Error && err.message.includes("already registered")) {
        log.debug("capability already registered, skipping", { capabilityId: capability.id })
      } else {
        log.warn("failed to register capability", { skillId: skill.id, err: String(err) })
      }
    }
  }

  log.info("capabilities bootstrapped from skills", { registered, total: allSkills.length })
  return registered
}

/**
 * Bootstrap default capabilities for development domain
 */
export function bootstrapDevelopmentCapabilities(): void {
  const registry = getCapabilityRegistry()

  const capabilities = [
    {
      id: "code_generation",
      domain: "development" as Domain,
      description: "Generate code, programs, and software components",
      keywords: ["code", "generate", "create", "write", "program", "codice", "crea"],
      capabilities: ["code-generation", "coding", "programming"],
    },
    {
      id: "code_review",
      domain: "development" as Domain,
      description: "Review code for issues, quality, and best practices",
      keywords: ["review", "code review", "check", "examine", "assess", "revisione"],
      capabilities: ["code-review", "analysis", "quality"],
    },
    {
      id: "debugging",
      domain: "development" as Domain,
      description: "Debug code, find and fix errors",
      keywords: ["debug", "bug", "fix", "error", "issue", "debugging", "problema", "risolvi"],
      capabilities: ["debugging", "diagnosis", "problem-solving"],
    },
    {
      id: "testing",
      domain: "development" as Domain,
      description: "Test code, verify functionality",
      keywords: ["test", "testing", "verify", "validate", "tdd", "unittest"],
      capabilities: ["testing", "tdd", "verification"],
    },
    {
      id: "code_planning",
      domain: "development" as Domain,
      description: "Plan code architecture and implementation",
      keywords: ["plan", "planning", "architecture", "design", "pianifica"],
      capabilities: ["planning", "code-planning", "design"],
    },
    {
      id: "refactoring",
      domain: "development" as Domain,
      description: "Refactor and simplify code",
      keywords: ["refactor", "simplify", "improve", "restructure", "rifattorizza"],
      capabilities: ["refactoring", "simplification"],
    },
    {
      id: "document_analysis",
      domain: "development" as Domain,
      description: "Analyze and understand documents",
      keywords: ["document", "analysis", "understand", "read", "documento"],
      capabilities: ["document-analysis", "understanding"],
    },
    {
      id: "comparison",
      domain: "development" as Domain,
      description: "Compare code, libraries, and solutions",
      keywords: ["compare", "comparison", "diff", "differ", "confronta"],
      capabilities: ["comparison", "diff"],
    },
  ]

  for (const cap of capabilities) {
    try {
      registry.register({
        ...cap,
        metadata: { source: "bootstrap", domain: "development" },
      })
    } catch (err) {
      // Skip if already exists
    }
  }

  log.info("development capabilities bootstrapped", { count: capabilities.length })
}

/**
 * Bootstrap default capabilities for knowledge domain
 */
export function bootstrapKnowledgeCapabilities(): void {
  const registry = getCapabilityRegistry()

  const capabilities = [
    {
      id: "web_search",
      domain: "knowledge" as Domain,
      description: "Search the web for information, products, prices",
      keywords: ["search", "find", "lookup", "web", "cercami", "cerca", "ricerca"],
      capabilities: ["web-search", "information-gathering"],
    },
    {
      id: "product_research",
      domain: "knowledge" as Domain,
      description: "Research products, compare prices",
      keywords: ["product", "products", "price", "prices", "compare", "annuncio", "annunci", "listino"],
      capabilities: ["product-research", "price-comparison"],
    },
    {
      id: "fact_check",
      domain: "knowledge" as Domain,
      description: "Verify facts and claims against sources",
      keywords: ["verify", "check", "confirm", "fact", "facts", "verifica", "conferma"],
      capabilities: ["fact-checking", "verification", "fact-verification"],
    },
    {
      id: "source_verification",
      domain: "knowledge" as Domain,
      description: "Verify sources and citations",
      keywords: ["source", "sources", "citation", "cite", "reference", "sources"],
      capabilities: ["source-verification", "citation-checking"],
    },
    {
      id: "literature_review",
      domain: "knowledge" as Domain,
      description: "Review academic and scientific literature",
      keywords: ["literature", "paper", "academic", "scientific", "review", "letteratura"],
      capabilities: ["literature-review", "academic-research"],
    },
    {
      id: "synthesis",
      domain: "knowledge" as Domain,
      description: "Synthesize information from multiple sources",
      keywords: ["synthesize", "synthesis", "combine", "merge", "sintesi"],
      capabilities: ["synthesis", "information-synthesis"],
    },
    {
      id: "critical_analysis",
      domain: "knowledge" as Domain,
      description: "Critical analysis of content and arguments",
      keywords: ["critical", "analysis", "critique", "evaluate", "critica", "analisi"],
      capabilities: ["critical-analysis", "evaluation"],
    },
    {
      id: "information_gathering",
      domain: "knowledge" as Domain,
      description: "Gather and collect information",
      keywords: ["information", "gather", "collect", "find", "informazioni"],
      capabilities: ["information-gathering", "data-collection"],
    },
  ]

  for (const cap of capabilities) {
    try {
      registry.register({
        ...cap,
        metadata: { source: "bootstrap", domain: "knowledge" },
      })
    } catch (err) {
      // Skip if already exists
    }
  }

  log.info("knowledge capabilities bootstrapped", { count: capabilities.length })
}

/**
 * Bootstrap default capabilities for nutrition domain
 */
export function bootstrapNutritionCapabilities(): void {
  const registry = getCapabilityRegistry()

  const capabilities = [
    {
      id: "nutrition_analysis",
      domain: "nutrition" as Domain,
      description: "Analyze nutrition and food composition",
      keywords: ["nutrition", "nutrients", "calories", "diet", "food", "nutrizione", "calorie"],
      capabilities: ["nutrition-analysis", "nutrient-analysis"],
    },
    {
      id: "diet_planning",
      domain: "nutrition" as Domain,
      description: "Plan diets and meal plans",
      keywords: ["diet", "diet plan", "meal plan", "planning", "dieta", "piano"],
      capabilities: ["diet-planning", "meal-planning"],
    },
    {
      id: "recipe_search",
      domain: "nutrition" as Domain,
      description: "Search for recipes",
      keywords: ["recipe", "recipes", "cook", "ricetta", "cuocere"],
      capabilities: ["recipe-search", "cooking"],
    },
    {
      id: "food_recall",
      domain: "nutrition" as Domain,
      description: "Food recall and tracking",
      keywords: ["food", "recall", "track", "cibo", "record"],
      capabilities: ["food-recall", "tracking"],
    },
    {
      id: "calorie_calculation",
      domain: "nutrition" as Domain,
      description: "Calculate calories and macros",
      keywords: ["calorie", "calories", "macros", "macro", "calcolo"],
      capabilities: ["calorie-calculation", "macro-tracking"],
    },
  ]

  for (const cap of capabilities) {
    try {
      registry.register({
        ...cap,
        metadata: { source: "bootstrap", domain: "nutrition" },
      })
    } catch (err) {
      // Skip if already exists
    }
  }

  log.info("nutrition capabilities bootstrapped", { count: capabilities.length })
}

/**
 * Bootstrap default capabilities for weather domain
 */
export function bootstrapWeatherCapabilities(): void {
  const registry = getCapabilityRegistry()

  const capabilities = [
    {
      id: "weather_forecast",
      domain: "weather" as Domain,
      description: "Get weather forecasts",
      keywords: [
        "weather",
        "forecast",
        "temperature",
        "meteo",
        "previsioni",
        "tomorrow",
        "domani",
        "weekend",
        "weekly",
        "daily",
        "rain",
        "pioggia",
        "snow",
        "neve",
        "sun",
        "sole",
        "hourly",
        "daily",
        "weekly",
        "mensile",
      ],
      capabilities: ["forecast_daily", "forecast_hourly", "forecast_probabilistic"],
    },
    {
      id: "weather_current",
      domain: "weather" as Domain,
      description: "Get current weather conditions",
      keywords: [
        "weather",
        "current",
        "now",
        "today",
        "meteo",
        "attuale",
        "temperature",
        "temperatura",
        "humidity",
        "umidità",
        "wind",
        "vento",
        "sunny",
        "cloudy",
        "nuvoloso",
        "rain",
        "pioggia",
      ],
      capabilities: ["current_conditions", "current_observation"],
    },
    {
      id: "weather_alerts",
      domain: "weather" as Domain,
      description: "Get weather alerts and warnings",
      keywords: [
        "weather",
        "alert",
        "alerts",
        "warning",
        "warnings",
        "allerta",
        "avviso",
        "severe",
        "emergency",
        "emergenza",
        "storm",
        "tempesta",
        "advisory",
        "watch",
        "hurricane",
        "tornado",
      ],
      capabilities: ["alerts_severe", "alerts_advisory", "alerts_summary"],
    },
    {
      id: "location_weather",
      domain: "weather" as Domain,
      description: "Get weather for a specific location",
      keywords: [
        "location",
        "place",
        "city",
        "location",
        "luogo",
        "città",
        "Milano",
        "Rome",
        "London",
        "Paris",
        "Berlin",
        "Madrid",
        "New York",
        "Tokyo",
        "Sydney",
        "Moskow",
      ],
      capabilities: ["current_conditions", "weather_monitoring"],
    },
  ]

  for (const cap of capabilities) {
    try {
      registry.register({
        ...cap,
        metadata: { source: "bootstrap", domain: "weather" },
      })
    } catch (err) {
      // Skip if already exists
    }
  }

  log.info("weather capabilities bootstrapped", { count: capabilities.length })
}

/**
 * Bootstrap default capabilities for Google Workspace domain
 */
export function bootstrapGWorkspaceCapabilities(): void {
  const registry = getCapabilityRegistry()

  const capabilities = [
    {
      id: "gmail.search",
      domain: "gworkspace" as Domain,
      description: "Search messages in Gmail",
      keywords: ["gmail", "email", "search", "mail", "posta"],
      capabilities: ["gmail.search", "search"],
    },
    {
      id: "gmail.read",
      domain: "gworkspace" as Domain,
      description: "Read Gmail messages",
      keywords: ["gmail", "read", "message", "messaggio"],
      capabilities: ["gmail.read", "read"],
    },
    {
      id: "drive.search",
      domain: "gworkspace" as Domain,
      description: "Search files in Google Drive",
      keywords: ["drive", "google drive", "search", "file", "documenti"],
      capabilities: ["drive.search", "search"],
    },
    {
      id: "drive.list",
      domain: "gworkspace" as Domain,
      description: "List files and folders in Google Drive",
      keywords: ["drive", "list", "folder", "cartella", "cartelle"],
      capabilities: ["drive.list", "list"],
    },
    {
      id: "drive.read",
      domain: "gworkspace" as Domain,
      description: "Read a file from Google Drive",
      keywords: ["drive", "read", "file", "documento", "documenti"],
      capabilities: ["drive.read", "read"],
    },
    {
      id: "calendar.list",
      domain: "gworkspace" as Domain,
      description: "List events from Google Calendar",
      keywords: ["calendar", "event", "events", "calendario", "evento"],
      capabilities: ["calendar.list", "calendar.read"],
    },
    {
      id: "docs.read",
      domain: "gworkspace" as Domain,
      description: "Read Google Docs documents",
      keywords: ["docs", "document", "google docs", "documento"],
      capabilities: ["docs.read", "read"],
    },
    {
      id: "sheets.read",
      domain: "gworkspace" as Domain,
      description: "Read Google Sheets spreadsheets",
      keywords: ["sheets", "spreadsheet", "google sheets", "foglio", "fogli"],
      capabilities: ["sheets.read", "read"],
    },
  ]

  for (const cap of capabilities) {
    try {
      registry.register({
        ...cap,
        metadata: { source: "bootstrap", domain: "gworkspace" },
      })
    } catch (err) {
      // Skip if already exists
    }
  }

  log.info("gworkspace capabilities bootstrapped", { count: capabilities.length })
}

/**
 * Bootstrap NBA agency capabilities
 */
function bootstrapNbaCapabilities(): void {
  const registry = getCapabilityRegistry()

  const capabilities = [
    {
      id: "nba_analysis",
      domain: "nba" as Domain,
      description:
        "Analyze NBA games for betting opportunities with probability estimation, edge detection, and guarded recommendations",
      keywords: [
        "nba",
        "basketball",
        "betting",
        "odds",
        "games",
        "teams",
        "players",
        "injuries",
        "schedule",
        "live",
        "score",
        "preview",
        "analysis",
        "scommesse",
        "quote",
        "partite",
        "squadre",
      ],
      capabilities: ["nba_analysis", "nba-analysis"],
    },
    {
      id: "nba_games",
      domain: "nba" as Domain,
      description: "Get NBA games schedule and live scores",
      keywords: ["nba", "games", "schedule", "live", "score", "scores", "today", "tonight", "partite", "stagione"],
      capabilities: ["schedule_live"],
    },
    {
      id: "nba_injuries",
      domain: "nba" as Domain,
      description: "Get NBA injury reports",
      keywords: ["injury", "injuries", "injured", "out", "doubtful", "questionable", "infortunio", "infortuni"],
      capabilities: ["injury_status"],
    },
    {
      id: "nba_odds",
      domain: "nba" as Domain,
      description: "Get NBA betting odds",
      keywords: [
        "odds",
        "betting",
        "bet",
        "moneyline",
        "spread",
        "totals",
        "over",
        "under",
        "quote",
        "scommesse",
        "quota",
      ],
      capabilities: ["odds_markets"],
    },
    {
      id: "nba_edge_detection",
      domain: "nba" as Domain,
      description: "Detect betting edges in NBA games",
      keywords: ["edge", "value", "betting", "odds", "probability", "expected", "vig", "juice"],
      capabilities: ["edge_detection"],
    },
  ]

  for (const cap of capabilities) {
    try {
      registry.register({
        ...cap,
        metadata: { source: "bootstrap", domain: "nba" },
      })
    } catch (err) {
      // Skip if already exists
    }
  }

  log.info("nba capabilities bootstrapped", { count: capabilities.length })
}

/**
 * Bootstrap Finance agency capabilities
 */
function bootstrapFinanceCapabilities(): void {
  const registry = getCapabilityRegistry()

  const capabilities = [
    // Data Ingestion
    {
      id: "finance_price_current",
      domain: "finance" as Domain,
      description: "Get current price for stocks, ETFs, crypto, forex, commodities",
      keywords: [
        "price",
        "current",
        "stock",
        "crypto",
        "bitcoin",
        "ethereum",
        "azion",
        "ETF",
        "quotazione",
        "prezzo",
        "trading",
        "market",
        "ticker",
      ],
      capabilities: ["price.current"],
    },
    {
      id: "finance_price_historical",
      domain: "finance" as Domain,
      description: "Get historical price data for technical analysis",
      keywords: ["historical", "history", "chart", " candles", "timeframe", "daily", "weekly", "monthly", "storico"],
      capabilities: ["price.historical"],
    },
    {
      id: "finance_orderbook",
      domain: "finance" as Domain,
      description: "Get order book data for crypto exchanges",
      keywords: ["orderbook", "bid", "ask", "depth", "liquidity", "libro ordini"],
      capabilities: ["orderbook"],
    },
    {
      id: "finance_fundamentals",
      domain: "finance" as Domain,
      description: "Get fundamental data: earnings, revenue, P/E ratio, book value",
      keywords: ["fundamental", "earnings", "revenue", "pe ratio", "book value", "dividend", "fondamentale", "utili"],
      capabilities: ["fundamentals"],
    },
    {
      id: "finance_macro",
      domain: "finance" as Domain,
      description: "Get macroeconomic indicators: GDP, CPI, interest rates",
      keywords: ["macro", "gdp", "cpi", "inflation", "interest rate", "unemployment", "economico", "macro"],
      capabilities: ["macro"],
    },
    {
      id: "finance_filings",
      domain: "finance" as Domain,
      description: "Get SEC filings: 10-K, 10-Q, 8-K, annual reports",
      keywords: ["sec", "filing", "10-k", "10-q", "8-k", "annual report", "sec edgar"],
      capabilities: ["filings"],
    },
    {
      id: "finance_news",
      domain: "finance" as Domain,
      description: "Get financial news and market sentiment",
      keywords: ["news", "market news", "financial news", "sentiment", "notizie", "mercati"],
      capabilities: ["news"],
    },
    // Analytics
    {
      id: "finance_technical",
      domain: "finance" as Domain,
      description: "Technical analysis with RSI, MACD, moving averages, Bollinger bands",
      keywords: [
        "technical",
        "rsi",
        "macd",
        "moving average",
        "bollinger",
        "indicators",
        "analisi tecnica",
        "indicatori",
      ],
      capabilities: ["technical.indicators"],
    },
    {
      id: "finance_patterns",
      domain: "finance" as Domain,
      description: "Chart pattern recognition: support, resistance, trends",
      keywords: [
        "pattern",
        "chart pattern",
        "support",
        "resistance",
        "trend",
        "pattern grafici",
        "supporto",
        "resistenza",
      ],
      capabilities: ["chart.patterns"],
    },
    {
      id: "finance_signal",
      domain: "finance" as Domain,
      description: "Generate trading signals with confidence scoring",
      keywords: ["signal", "trading signal", "buy", "sell", "long", "short", "segnale", "acquisto", "vendita"],
      capabilities: ["signal.generation"],
    },
    {
      id: "finance_risk",
      domain: "finance" as Domain,
      description: "Risk assessment and portfolio analysis",
      keywords: ["risk", "portfolio", "VaR", "drawdown", "Sharpe", "rischio", "portfolio", "esposizione"],
      capabilities: ["risk.assessment"],
    },
  ]

  for (const cap of capabilities) {
    try {
      registry.register({
        ...cap,
        metadata: { source: "bootstrap", domain: "finance" },
      })
    } catch (err) {
      // Skip if already exists
    }
  }

  log.info("finance capabilities bootstrapped", { count: capabilities.length })
}

/**
 * Bootstrap all default capabilities
 */
export function bootstrapAllCapabilities(): void {
  bootstrapDevelopmentCapabilities()
  bootstrapKnowledgeCapabilities()
  bootstrapNutritionCapabilities()
  bootstrapWeatherCapabilities()
  bootstrapGWorkspaceCapabilities()
  bootstrapNbaCapabilities()
  bootstrapFinanceCapabilities()

  log.info("all default capabilities bootstrapped", {
    total: getCapabilityRegistry().size(),
  })
}

/**
 * Bootstrap capabilities with embeddings (async)
 * This requires LM Studio to be available
 */
export async function bootstrapWithEmbeddings(): Promise<void> {
  const registry = getCapabilityRegistry()

  // First bootstrap all default capabilities
  bootstrapAllCapabilities()

  // Then compute embeddings
  try {
    await registry.bootstrapEmbeddings()
    log.info("capabilities bootstrapped with embeddings")
  } catch (err) {
    log.warn("failed to bootstrap embeddings, using keyword-only matching", {
      err: String(err),
    })
  }
}

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
    "react",
    "component",
    "typescript",
    "javascript",
    "python",
    "java",
    "golang",
    "rust",
    "node",
    "npm",
    "package",
    "import",
    "export",
    "module",
    "framework",
    "library",
    "api",
    "endpoint",
    "refactor",
    "lint",
    "format",
    "compile",
    "run",
    "execute",
    "script",
    "automation",
    "ci",
    "cd",
    "pipeline",
    "docker",
    "container",
    "kubernetes",
    "yaml",
    "json",
    "config",
    "schema",
    "database",
    "query",
    "sql",
    "migration",
    "patch",
    "merge",
    "pull",
    "push",
    "commit",
    "branch",
    "stash",
    // Italian keywords
    "codice",
    "debug",
    "programma",
    "file",
    "progetto",
    "compila",
    "compilare",
    "esecuzione",
    "esegui",
    "script",
    "automazione",
    "biblioteca",
    "libreria",
    "funzione",
    "classe",
    "variabile",
    "costante",
    "modulo",
    "pacchetto",
    "api",
    "endpoint",
    "refactoring",
    "rifattorizza",
    "test",
    "testing",
    "verifica",
    "validazione",
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
    // English - Core weather terms
    "weather",
    "temperature",
    "forecast",
    "rain",
    "sun",
    "climate",
    "meteorological",
    "humidity",
    "wind",
    "precipitation",
    "cloud",
    "sky",
    "storm",
    "thunder",
    "snow",
    "fog",
    "mist",
    "hail",
    "sleet",
    "drizzle",
    "shower",
    "hot",
    "cold",
    "warm",
    "cool",
    "freezing",
    "frost",
    "sunny",
    "cloudy",
    "partly",
    "overcast",
    "clear",
    "cloudy",
    "severe",
    "warning",
    "watch",
    "advisory",
    "alert",
    "emergency",
    "today",
    "tomorrow",
    "weekend",
    "hourly",
    "daily",
    "weekly",
    "monthly",
    "uv",
    "uvindex",
    "pressure",
    "visibility",
    "dewpoint",
    "dew point",
    // English - Extended
    "meteo",
    "meteorology",
    "atmospheric",
    "barometric",
    "heatwave",
    "coldfront",
    "warmfront",
    "occluded",
    "thunderstorm",
    "lightning",
    "tornado",
    "hurricane",
    "cyclone",
    "typhoon",
    "monsoon",
    "trade winds",
    "jetstream",
    "sunrise",
    "sunset",
    "dawn",
    "dusk",
    "daylight",
    "moon",
    "moonlight",
    "tides",
    "surf",
    "waves",
    "marine",
    "coastal",
    "radar",
    "satellite",
    "analysis",
    "outlook",
    "outlook",
    "pollon",
    "pollen",
    "air quality",
    "aqi",
    // Italian - Core
    "meteo",
    "tempo",
    "temperatura",
    "previsioni",
    "prevedere",
    "pioggia",
    "sole",
    "clima",
    "umidità",
    "vento",
    "precipitazioni",
    "nuvole",
    "cielo",
    "tempesta",
    "temporale",
    "neve",
    "nebbia",
    "caldo",
    "freddo",
    // Italian - Extended + Days
    "maltempo",
    "grandine",
    "allerta",
    "avviso",
    "emergenza",
    "mattina",
    "pomeriggio",
    "sera",
    "notte",
    "oggi",
    "domani",
    "dopodomani",
    "settimana",
    "weekend",
    "ferie",
    "vacanza",
    "Alba",
    "tramonto",
    // Days of week - Italian
    "giovedì",
    "venerdì",
    "sabato",
    "domenica",
    "lunedì",
    "martedì",
    "mercoledì",
    // Italian weather expressions
    "farà",
    "faranno",
    "sarà",
    "saranno",
    "bel tempo",
    "brutto tempo",
    "soleggiato",
    "nuvoloso",
    "piovoso",
    "ventoso",
    // Spanish
    "clima",
    "tiempo",
    "lluvia",
    "nublado",
    "soleado",
    "temperatura",
    "pronóstico",
    "avisos",
    "alertas",
    // French
    "météo",
    "température",
    "pluie",
    "soleil",
    "nuageux",
    "alertes",
    // German
    "wetter",
    "temperatur",
    "regen",
    "sonne",
    "bewölkt",
    // Portuguese
    "clima",
    "tempo",
    "temperatura",
    "chuva",
    "sol",
  ],
  travel: [
    // Italian - Core travel terms
    "viaggio",
    "vacanza",
    "itinerario",
    "meta",
    "destinazione",
    "partire",
    "ritorno",
    "andata",
    "soggiorno",
    "city break",
    "weekend lungo",
    "ponte",
    "ferie",
    "disponibilità",
    "finestre date",
    "prezzi voli",
    "voli",
    "volo",
    "volo economico",
    "coincidenza",
    "scalo",
    "bagaglio",
    "hotel",
    "albergo",
    "appartamento",
    "ostello",
    "resort",
    "b&b",
    "alloggio",
    "check-in",
    "check-out",
    "cancellazione gratuita",
    "non rimborsabile",
    "transfer",
    "navetta",
    "treno",
    "bus",
    "pullman",
    "autonoleggio",
    "noleggio auto",
    "patente",
    "pedaggi",
    "parcheggio",
    "trasporto locale",
    "metro",
    "tram",
    "pass turistico",
    "ristorante",
    "trattoria",
    "cucina locale",
    "prenotazione tavolo",
    "attività",
    "tour guidato",
    "museo",
    "mostra",
    "spettacolo",
    "concerto",
    "evento live",
    "biglietti evento",
    "things to do",
    "points of interest",
    "POI",
    "mappe",
    "geocoding",
    "routing",
    "meteo viaggio",
    "pioggia",
    "temperatura",
    "allerte meteo",
    "sicurezza viaggio",
    "advisory",
    "emergenza",
    "ospedale vicino",
    "farmacia vicino",
    "ambasciata",
    "consolato",
    // English - Core travel terms
    "travel",
    "trip",
    "vacation",
    "holiday",
    "destination",
    "itinerary",
    "booking",
    "flight",
    "flights",
    "hotel",
    "accommodation",
    "hostel",
    "resort",
    "apartment",
    "B&B",
    "car rental",
    "train",
    "rail",
    "bus",
    "transport",
    "restaurant",
    "dining",
    "attractions",
    "activities",
    "events",
    "tickets",
    "museum",
    "tour",
    "sightseeing",
    "explore",
    "weather",
    "forecast",
    "advisory",
    "emergency",
    "hospital",
    "pharmacy",
    "embassy",
    "passport",
    "visa",
    "itinerary",
    "schedule",
    "day trip",
    "weekend getaway",
    "travel plan",
    "travel booking",
    "trip optimizer",
    "best time to go",
    // Spanish
    "viaje",
    "vacaciones",
    "destino",
    "vuelo",
    "hotel",
    "alojamiento",
    "restaurante",
    "turismo",
    // French
    "voyage",
    "vacances",
    "destination",
    "vol",
    "hôtel",
    "voyager",
    // German
    "reise",
    "urlaub",
    "flug",
    "hotel",
    "reisen",
  ],
  gworkspace: [
    "google workspace",
    "google drive",
    "gmail",
    "gdrive",
    "google calendar",
    "calendar",
    "google docs",
    "google sheets",
    "cartella",
    "cartelle",
    "documenti",
    "fogli",
    // Email keywords
    "email",
    "mail",
    "posta elettronica",
    "messaggio",
    "messaggi",
    "inbox",
    "invio",
    "ricezione",
    "bozza",
    "draft",
    "send",
    "subject",
    "oggetto",
    "destinatario",
    "mittente",
    "allegato",
    "attachment",
    // Drive keywords
    "file",
    "files",
    "document",
    "pdf",
    "folder",
    "directory",
    "upload",
    "download",
    "condividi",
    "share",
    "permessi",
    "accesso",
    "visibilità",
    "collegamento",
    "link",
    // Calendar keywords
    "evento",
    "eventi",
    "appuntamento",
    "riunione",
    "meeting",
    "calendario",
    "data",
    "ora",
    "orario",
    "promemoria",
    "invito",
    "partecipanti",
    // Sheets/Docs keywords
    "spreadsheet",
    "foglio di calcolo",
    "excel",
    "cella",
    "celle",
    "riga",
    "righe",
    "colonna",
    "colonne",
    "formula",
    "tabella",
    "grafico",
    "chart",
    // Italian specific
    "email",
    "posta",
    "documento",
    "documenti google",
    "foglio",
    "fogli google",
    "calendario google",
    "drive google",
  ],
  nba: [
    "nba",
    "basketball",
    "basket",
    "lakers",
    "celtics",
    "warriors",
    "heat",
    "game",
    "games",
    "score",
    "scores",
    "schedule",
    "today",
    "tonight",
    "player",
    "players",
    "team",
    "teams",
    "roster",
    "injury",
    "injuries",
    "odds",
    "betting",
    "bet",
    "scommesse",
    "scommessa",
    "quote",
    "quota",
    "partita",
    "partite",
    "stagione",
    "playoffs",
    "regular season",
    "conference",
    "western",
    "eastern",
    "champions league",
    "serie a",
    "premier league",
    "bundesliga",
    "calcio",
    "football",
    "soccer",
    "tennis",
    "nfl",
    "mlb",
    "nhl",
    "mma",
    "ufc",
    "formula 1",
    "motogp",
    "golf",
    "atleta",
    "atleti",
    "campionato",
    "classifica",
    "classifiche",
    "pronostico",
    "pronostici",
    "analisi",
    "statistiche",
    "stats",
    "victory",
    "win",
    "puntata",
    "puntate",
    "multiple",
    "multipla",
    "over",
    "under",
    "handicap",
    "spread",
    "totals",
    "moneyline",
    "parlay",
    "acca",
  ],
  finance: [
    // English - Stocks/ETF/Crypto
    "stock",
    "stocks",
    "etf",
    "etfs",
    "crypto",
    "cryptocurrency",
    "bitcoin",
    "ethereum",
    "trading",
    "trader",
    "market",
    "markets",
    "price",
    "prices",
    "quote",
    "quotes",
    "ticker",
    "dividend",
    "earnings",
    "revenue",
    "profit",
    "loss",
    "portfolio",
    "investment",
    "invest",
    "investing",
    "bull",
    "bear",
    "bullish",
    "bearish",
    "long",
    "short",
    "position",
    "signal",
    "signals",
    "technical",
    "chart",
    "analysis",
    "analyst",
    "fintech",
    "financial",
    "finance",
    // Italian - Stocks/Crypto
    "azion",
    "azioni",
    "quotazione",
    "quotazioni",
    "criptovaluta",
    "criptovalute",
    "trading",
    "trader",
    "mercato",
    "mercati",
    "prezzo",
    "prezzi",
    "investimento",
    "investimenti",
    "portafoglio",
    "analisi",
    "finanza",
    "finanziario",
    "borsa",
    "listino",
    "titoli",
    "obbligazioni",
    "bond",
    "forex",
    "valute",
    // Trading specific
    "buy",
    "sell",
    "order",
    "orders",
    "bid",
    "ask",
    "spread",
    "volume",
    "liquidity",
    "leverage",
    "margin",
    "stop loss",
    "take profit",
    "paper trade",
    "backtest",
    "strategy",
    "rsi",
    "macd",
    "moving average",
    "bollinger",
  ],
  custom: [],
}

function norm(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

function tokenMatch(tok: string, key: string): boolean {
  if (tok === key) return true
  if (tok.length >= 5 && key.length >= 3 && tok.startsWith(key)) return true
  return false
}

export const Router = {
  create: fn(z.object({}), () => {
    const log = Log.create({ service: "kiloclaw.router" })
    const domainHandlers = new Map<string, (intent: Intent) => Promise<AgencyAssignment["agencyId"]>>()

    // Core keywords that should give immediate boost (highly domain-specific)
    const CORE_KEYWORDS: Record<string, string[]> = {
      nba: [
        "nba",
        "basketball",
        "basket",
        "scommesse",
        "scommessa",
        "quote",
        "quota",
        "odds",
        "betting",
        "partita",
        "partite",
        "stagione",
        "playoffs",
        "injury",
        "infortunio",
        "roster",
        "giocatore",
        "giocatori",
        "squadre",
      ],
      weather: [
        "weather",
        "meteo",
        "tempo",
        "temperature",
        "temperatura",
        "forecast",
        "previsioni",
        "prevedere",
        "rain",
        "pioggia",
        "sun",
        "sole",
        "climate",
        "clima",
        "alert",
        "allerta",
        "warning",
        "avviso",
        "humidity",
        "umidità",
        "wind",
        "vento",
        "snow",
        "neve",
        "cloudy",
        "nuvoloso",
        "storm",
        "tempesta",
        "temporale",
        "farà",
        "bel tempo",
        "brutto tempo",
        "soleggiato",
        // Days of week
        "giovedì",
        "venerdì",
        "sabato",
        "domenica",
        // Italian cities
        "Roma",
        "Milano",
        "Napoli",
        "Torino",
        "Firenze",
        "Venezia",
        "Bologna",
        "Genova",
        "Palermo",
      ],
      development: [
        "code",
        "debug",
        "build",
        "deploy",
        "git",
        "function",
        "class",
        "react",
        "component",
        "typescript",
        "javascript",
        "refactor",
        "test",
        "compile",
        "api",
        "patch",
        "merge",
        "codice",
        "rifattorizza",
        // NUOVO - high-value error-related keywords
        "error",
        "bug",
        "exception",
        "crash",
        "incident",
        "issue",
        "problem",
        "failure",
        "broken",
        "not working",
        // Italian variants
        "errore",
        "problema",
        "fallisce",
        "non funziona",
        "rotto",
      ],
      knowledge: ["search", "research", "find", "lookup", "document", "information"],
      nutrition: ["nutrition", "diet", "food", "recipe", "calories", "macros", "proteins"],
      travel: [
        "viaggio",
        "vacanza",
        "itinerario",
        "destinazione",
        "volo",
        "voli",
        "hotel",
        "prenotazione",
        "travel",
        "trip",
        "vacation",
        "destination",
        "flight",
        "booking",
        "itinerario viaggio",
        "confronto mete",
        "ottimizza date viaggio",
        "volo+hotel",
        "multi city trip",
        "prenotazione alloggio",
        "trasporti A/R",
        "noleggio auto aeroporto",
        "attività turistiche",
        "pianifica giornata",
        "biglietti concerto viaggio",
        "ristorante con prenotazione",
        "weather risk travel",
        "travel advisory",
        "emergency support travel",
        "nearest hospital travel",
        "embassy contact",
        "trip cost optimizer",
        "fare calendar",
        "travel booking link",
        "cerca voli",
        "volo economico",
        "prenotazione hotel",
        "prenotazione volo",
      ],
      gworkspace: [
        "gmail",
        "drive",
        "calendar",
        "docs",
        "sheets",
        "workspace",
        "email",
        "mail",
        "evento",
        "calendario",
        "documento",
        "foglio",
        "cartella",
      ],
      finance: [
        "stock",
        "stocks",
        "etf",
        "crypto",
        "bitcoin",
        "trading",
        "market",
        "price",
        "quote",
        "portfolio",
        "investment",
        "signal",
        "technical",
        "azion",
        "azioni",
        "criptovaluta",
        "finanza",
        "mercato",
        "prezzo",
        "trading",
      ],
    }

    // Calculate keyword match score
    function keywordScore(intent: Intent, domain: string): number {
      const keywords = DOMAIN_KEYWORDS[domain]
      if (!keywords || keywords.length === 0) return 0

      const text = norm(`${intent.type} ${intent.description}`)
      const toks = text.split(/[^a-z0-9]+/).filter(Boolean)
      const coreKeywords = CORE_KEYWORDS[domain] || []

      // Check for core keyword matches (high-value specific keywords)
      const coreMatches = coreKeywords.filter((core) => {
        const key = norm(core.trim())
        if (!key) return false
        if (key.includes(" ")) return text.includes(key)
        return toks.some((tok) => tokenMatch(tok, key))
      }).length

      const matches = keywords.filter((raw) => {
        const key = norm(raw.trim())
        if (!key) return false
        if (key.includes(" ")) return text.includes(key)
        return toks.some((tok) => tokenMatch(tok, key))
      }).length

      // Use sqrt scaling to not overly penalize short queries with few matches
      // Also add bonus for core keyword matches
      const baseScaled = Math.sqrt(matches / keywords.length)
      const coreBonus = coreMatches > 0 ? 0.2 + coreMatches * 0.1 : 0
      const base = Math.min(0.7, baseScaled * 0.7) // Cap base at 0.7 to leave room for boosts

      const type = norm(intent.type)
      const typeBoost =
        domain === "weather" && type.includes("weather")
          ? 0.2
          : domain === "development" && (type.includes("code") || type.includes("build") || type.includes("debug"))
            ? 0.2
            : domain === "knowledge" && (type.includes("search") || type.includes("research"))
              ? 0.2
              : domain === "nutrition" &&
                  (type.includes("nutrition") || type.includes("diet") || type.includes("recipe"))
                ? 0.2
                : domain === "travel" &&
                    (type.includes("travel") ||
                      type.includes("trip") ||
                      type.includes("vacation") ||
                      type.includes("flight") ||
                      type.includes("hotel") ||
                      type.includes("booking"))
                  ? 0.25
                  : domain === "gworkspace" &&
                      (type.includes("gmail") ||
                        type.includes("drive") ||
                        type.includes("calendar") ||
                        type.includes("workspace"))
                    ? 0.25
                    : domain === "nba" &&
                        (type.includes("nba") ||
                          type.includes("basketball") ||
                          type.includes("betting") ||
                          type.includes("odds") ||
                          type.includes("game") ||
                          type.includes("score"))
                      ? 0.25
                      : domain === "finance" &&
                          (type.includes("stock") ||
                            type.includes("trading") ||
                            type.includes("crypto") ||
                            type.includes("market") ||
                            type.includes("price") ||
                            type.includes("investment"))
                        ? 0.25
                        : 0
      return Math.min(1, base + coreBonus + typeBoost)
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
        const scores: DomainScore[] = (
          [
            "development",
            "knowledge",
            "nutrition",
            "weather",
            "travel",
            "gworkspace",
            "nba",
            "finance",
            "custom",
          ] as string[]
        ).map((domain) => {
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
        })

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

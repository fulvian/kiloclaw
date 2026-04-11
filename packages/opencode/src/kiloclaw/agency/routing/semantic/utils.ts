// Semantic Router Utilities

/**
 * Compute cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0

  let dot = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  const na = Math.sqrt(normA)
  const nb = Math.sqrt(normB)

  return na === 0 || nb === 0 ? 0 : dot / (na * nb)
}

/**
 * Normalize a vector to unit length
 */
export function normalizeVector(v: number[]): number[] {
  const norm = Math.sqrt(v.reduce((sum, val) => sum + val * val, 0))
  if (norm === 0) return v
  return v.map((val) => val / norm)
}

/**
 * Compute weighted combination of embedding and keyword scores
 */
export function hybridScore(embeddingScore: number, keywordScore: number, embeddingWeight = 0.7): number {
  return embeddingWeight * embeddingScore + (1 - embeddingWeight) * keywordScore
}

/**
 * Domain keyword hints for fast L0 detection
 */
export const DOMAIN_KEYWORD_HINTS: Record<string, string[]> = {
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
    "debug",
    "programma",
  ],
  knowledge: [
    "search",
    "find",
    "query",
    "information",
    "research",
    "document",
    "database",
    "lookup",
    "cerca",
    "cercami",
    "ricerca",
    "informazioni",
    "annuncio",
    "annunci",
    "listino",
    "prodotto",
    "prodotti",
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
    "cibo",
    "dieta",
    "nutrizione",
    "pasti",
    "ricetta",
  ],
  weather: [
    "weather",
    "temperature",
    "forecast",
    "rain",
    "sun",
    "climate",
    "meteo",
    "temperatura",
    "previsioni",
    "pioggia",
    "sole",
  ],
  gworkspace: [
    "google workspace",
    "google drive",
    "gmail",
    "drive",
    "calendar",
    "google calendar",
    "google docs",
    "google sheets",
    "cartella",
    "cartelle",
    "documenti",
    "fogli",
    "file condivisi",
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
    " roster",
    "infortunio",
    "infortuni",
    "injury",
    "odds",
    "scommesse",
    "scommessa",
    "betting",
    "quote",
    "quota",
    "basketball",
    "lakers",
    "celtics",
    " warriors",
    "heat",
    "serie a",
    "stagione",
    "regular season",
    "playoffs",
    "western conference",
    "eastern conference",
    "atlético",
    "real madrid",
    "barcellona",
    "calcio",
    "football",
    "soccer",
    "champions league",
    "serie a",
    "premier league",
    "bundesliga",
    "ligue 1",
    "tennis",
    "nfl",
    "mlb",
    "nhl",
    "mma",
    "ufc",
    "formula 1",
    "motogp",
    "golf",
    "atleti",
    "atleta",
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
}

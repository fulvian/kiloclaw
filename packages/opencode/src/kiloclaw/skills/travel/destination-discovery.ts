// Travel Destination Discovery Skill
// Discovers travel destinations based on user preferences, budget, and dates

import { Log } from "@/util/log"
import type { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"

const log = Log.create({ service: "kiloclaw.skill.travel-destination-discovery" })

// ============================================================================
// Types
// ============================================================================

interface TravelDestinationInput {
  query?: string
  budget?: "budget" | "mid-range" | "luxury"
  travelers?: number
  dates?: {
    start: string
    end: string
  }
  interests?: string[]
  season?: "spring" | "summer" | "autumn" | "winter"
}

interface Destination {
  id: string
  name: string
  country: string
  description: string
  bestTimeToVisit: string[]
  estimatedDailyCost: number
  currency: string
  highlights: string[]
  climate: string
  familyFriendly: boolean
  imageUrl?: string
}

interface TravelDestinationOutput {
  destinations: Destination[]
  searchParams: {
    query: string
    budget: string
    travelers: number
    season: string
  }
  provider: {
    id: string
    name: string
    attribution?: string
  }
  errors: Array<{
    provider: string
    error: string
    timestamp: string
  }>
  meta: {
    generationTimeMs: number
    resultsCount: number
  }
}

// ============================================================================
// Known Destinations Database
// ============================================================================

const DESTINATIONS_DB: Destination[] = [
  {
    id: "rome-it",
    name: "Roma",
    country: "Italia",
    description: "La capitale italiana offre storia, arte, cucina e cultura.",
    bestTimeToVisit: ["aprile-giugno", "settembre-ottobre"],
    estimatedDailyCost: 150,
    currency: "EUR",
    highlights: ["Colosseo", "Vaticano", "Fontana di Trevi"],
    climate: "Mediterraneo",
    familyFriendly: true,
  },
  {
    id: "paris-fr",
    name: "Parigi",
    country: "Francia",
    description: "La città dell'amore offre arte, moda e gastronomia.",
    bestTimeToVisit: ["aprile-giugno", "settembre-ottobre"],
    estimatedDailyCost: 200,
    currency: "EUR",
    highlights: ["Torre Eiffel", "Louvre"],
    climate: "Oceanico",
    familyFriendly: true,
  },
  {
    id: "barcelona-es",
    name: "Barcellona",
    country: "Spagna",
    description: "Città vibrante con architecture modernista e spiagge.",
    bestTimeToVisit: ["maggio-giugno", "settembre-ottobre"],
    estimatedDailyCost: 120,
    currency: "EUR",
    highlights: ["Sagrada Familia", "Park Güell"],
    climate: "Mediterraneo",
    familyFriendly: true,
  },
  {
    id: "london-gb",
    name: "Londra",
    country: "Regno Unito",
    description: "Metropoli cosmopolita con storia e musei.",
    bestTimeToVisit: ["maggio-settembre"],
    estimatedDailyCost: 220,
    currency: "GBP",
    highlights: ["Tower of London", "British Museum"],
    climate: "Oceanico",
    familyFriendly: true,
  },
  {
    id: "florence-it",
    name: "Firenze",
    country: "Italia",
    description: "Rinascimento e arte: Uffizi, Duomo e ponti storici.",
    bestTimeToVisit: ["aprile-giugno", "settembre-ottobre"],
    estimatedDailyCost: 140,
    currency: "EUR",
    highlights: ["Uffizi", "Duomo", "Piazzale Michelangelo"],
    climate: "Mediterraneo",
    familyFriendly: true,
  },
  {
    id: "venice-it",
    name: "Venezia",
    country: "Italia",
    description: "Città unica al mondo su canali con gondole.",
    bestTimeToVisit: ["marzo-maggio", "settembre-novembre"],
    estimatedDailyCost: 170,
    currency: "EUR",
    highlights: ["Basilica di San Marco", "Canal Grande"],
    climate: "Subtropicale",
    familyFriendly: false,
  },
  {
    id: "naples-it",
    name: "Napoli",
    country: "Italia",
    description: "Città vibrante con pizza, storia e prossimità a Pompei.",
    bestTimeToVisit: ["aprile-giugno", "settembre-ottobre"],
    estimatedDailyCost: 90,
    currency: "EUR",
    highlights: ["Duomo", "Museo Archeologico", "Pompei"],
    climate: "Mediterraneo",
    familyFriendly: true,
  },
  {
    id: "milan-it",
    name: "Milano",
    country: "Italia",
    description: "Capitale della moda e del design.",
    bestTimeToVisit: ["aprile-giugno", "settembre-ottobre"],
    estimatedDailyCost: 180,
    currency: "EUR",
    highlights: ["Duomo", "Galleria Vittorio Emanuele II"],
    climate: "Continentale",
    familyFriendly: true,
  },
  {
    id: "lisbon-pt",
    name: "Lisbona",
    country: "Portogallo",
    description: "Città affascinante con colline e vista sull'Oceano.",
    bestTimeToVisit: ["aprile-giugno", "settembre-ottobre"],
    estimatedDailyCost: 100,
    currency: "EUR",
    highlights: ["Belém Tower", "Alfama"],
    climate: "Mediterraneo",
    familyFriendly: true,
  },
  {
    id: "athens-gr",
    name: "Atene",
    country: "Grecia",
    description: "Culla della civiltà occidentale con Acropoli.",
    bestTimeToVisit: ["aprile-giugno", "settembre-ottobre"],
    estimatedDailyCost: 110,
    currency: "EUR",
    highlights: ["Acropoli", "Partenone", "Plaka"],
    climate: "Mediterraneo",
    familyFriendly: true,
  },
]

// ============================================================================
// Skill Definition
// ============================================================================

export const TravelDestinationDiscoverySkill: Skill = {
  id: "travel-destination-discovery" as SkillId,
  version: "1.0.0",
  name: "Travel Destination Discovery",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query for destination" },
      budget: { type: "string", enum: ["budget", "mid-range", "luxury"], description: "Budget level" },
      travelers: { type: "number", description: "Number of travelers" },
      interests: { type: "array", items: { type: "string" }, description: "User interests" },
      season: { type: "string", enum: ["spring", "summer", "autumn", "winter"] },
    },
  },
  outputSchema: {
    type: "object",
    properties: {
      destinations: { type: "array" },
      searchParams: { type: "object" },
      provider: { type: "object" },
      errors: { type: "array" },
      meta: { type: "object" },
    },
  },
  capabilities: ["destination_discovery", "destination_recommendation", "budget_analysis"],
  tags: ["travel", "destination", "discovery"],
  async execute(input: unknown, context: SkillContext): Promise<TravelDestinationOutput> {
    const startTime = Date.now()
    const errors: Array<{ provider: string; error: string; timestamp: string }> = []

    const {
      query = "",
      budget = "mid-range",
      travelers = 2,
      interests = [],
      season = "spring",
    } = input as TravelDestinationInput

    log.info("destination discovery", { correlationId: context.correlationId, query, budget, travelers })

    try {
      let results = [...DESTINATIONS_DB]

      // Budget filtering
      const budgetRanges: Record<string, { min: number; max: number }> = {
        budget: { min: 0, max: 120 },
        "mid-range": { min: 100, max: 200 },
        luxury: { min: 180, max: 1000 },
      }
      const range = budgetRanges[budget]
      if (range) {
        results = results.filter((d) => d.estimatedDailyCost >= range.min && d.estimatedDailyCost <= range.max)
      }

      // Text search
      if (query) {
        const searchTerms = query.toLowerCase().split(" ")
        results = results.filter((d) =>
          searchTerms.some(
            (term) =>
              d.name.toLowerCase().includes(term) ||
              d.country.toLowerCase().includes(term) ||
              d.description.toLowerCase().includes(term),
          ),
        )
      }

      results.sort((a, b) => {
        const aDiff = Math.abs(a.estimatedDailyCost - (range?.min ?? 150))
        const bDiff = Math.abs(b.estimatedDailyCost - (range?.min ?? 150))
        return aDiff - bDiff
      })

      return {
        destinations: results.slice(0, 6),
        searchParams: { query, budget, travelers, season },
        provider: { id: "internal", name: "Destination Database" },
        errors,
        meta: { generationTimeMs: Date.now() - startTime, resultsCount: results.length },
      }
    } catch (err) {
      log.error("destination discovery failed", { error: err instanceof Error ? err.message : String(err) })
      return {
        destinations: [],
        searchParams: { query, budget, travelers, season },
        provider: { id: "error", name: "Error" },
        errors: [
          {
            provider: "destination-discovery",
            error: err instanceof Error ? err.message : "Unknown error",
            timestamp: new Date().toISOString(),
          },
        ],
        meta: { generationTimeMs: Date.now() - startTime, resultsCount: 0 },
      }
    }
  },
}

export type { TravelDestinationInput, TravelDestinationOutput, Destination }

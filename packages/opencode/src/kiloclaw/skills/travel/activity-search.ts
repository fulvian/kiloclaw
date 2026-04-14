// Travel Activity Search Skill
// Searches for activities, tours, and attractions

import { Log } from "@/util/log"
import type { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"

const log = Log.create({ service: "kiloclaw.skill.travel-activity-search" })

interface ActivitySearchInput {
  destination: string
  date?: string
  category?: "sightseeing" | "food" | "adventure" | "culture" | "family" | "nightlife"
  priceRange?: "budget" | "mid-range" | "luxury"
  duration?: "short" | "medium" | "full_day"
}

interface ActivityOffer {
  id: string
  name: string
  description: string
  category: string
  city: string
  price: number
  currency: string
  duration: string
  rating: number
  included: string[]
  instantConfirmation: boolean
  freeCancellation: boolean
}

interface ActivitySearchOutput {
  offers: ActivityOffer[]
  searchParams: { destination: string; date?: string; category?: string; priceRange?: string }
  provider: { id: string; name: string }
  errors: Array<{ provider: string; error: string; timestamp: string }>
  meta: { generationTimeMs: number; resultsCount: number }
}

const ACTIVITIES_DB: ActivityOffer[] = [
  {
    id: "act-1",
    name: "Tour Colosseo e Foro Romano",
    description: "Tour guidato con biglietto skip-the-line",
    category: "sightseeing",
    city: "Roma",
    price: 65,
    currency: "EUR",
    duration: "3h",
    rating: 4.8,
    included: ["Biglietto skip-the-line", "Guida"],
    instantConfirmation: true,
    freeCancellation: true,
  },
  {
    id: "act-2",
    name: "Tour Vatican Museums",
    description: "Visita guidata ai Musei Vaticani e Cappella Sistina",
    category: "culture",
    city: "Roma",
    price: 45,
    currency: "EUR",
    duration: "4h",
    rating: 4.9,
    included: ["Biglietto", "Guida"],
    instantConfirmation: true,
    freeCancellation: true,
  },
  {
    id: "act-3",
    name: "Food Tour Trastevere",
    description: "Tour gastronomico di 3 ore",
    category: "food",
    city: "Roma",
    price: 85,
    currency: "EUR",
    duration: "3h",
    rating: 4.7,
    included: ["5 degustazioni", "Vino"],
    instantConfirmation: true,
    freeCancellation: true,
  },
  {
    id: "act-4",
    name: "Tour per famiglie - Roma giocosa",
    description: "Tour dedicato alle famiglie con attività per bambini",
    category: "family",
    city: "Roma",
    price: 55,
    currency: "EUR",
    duration: "2.5h",
    rating: 4.6,
    included: ["Guida per bambini", "Attività"],
    instantConfirmation: true,
    freeCancellation: true,
  },
  {
    id: "act-5",
    name: "Tour Uffizi e Accademia",
    description: "Tour guidato dei principali musei",
    category: "culture",
    city: "Firenze",
    price: 95,
    currency: "EUR",
    duration: "5h",
    rating: 4.9,
    included: ["Biglietti", "Guida"],
    instantConfirmation: true,
    freeCancellation: true,
  },
  {
    id: "act-6",
    name: "Tour Last Supper e Duomo",
    description: "Tour combinato della Cena del Signore e del Duomo",
    category: "culture",
    city: "Milano",
    price: 75,
    currency: "EUR",
    duration: "4h",
    rating: 4.8,
    included: ["Biglietti", "Guida"],
    instantConfirmation: true,
    freeCancellation: true,
  },
  {
    id: "act-7",
    name: "Tour Pompei e Ercolano",
    description: "Giornata completa agli scavi archeologici",
    category: "culture",
    city: "Napoli",
    price: 110,
    currency: "EUR",
    duration: "8h",
    rating: 4.9,
    included: ["Trasporto", "Guida", "Pranzo"],
    instantConfirmation: true,
    freeCancellation: true,
  },
  {
    id: "act-8",
    name: "Tour Louvre senza code",
    description: "Tour guidato del Louvre con skip-the-line",
    category: "culture",
    city: "Parigi",
    price: 75,
    currency: "EUR",
    duration: "3h",
    rating: 4.8,
    included: ["Biglietto prioritario", "Guida"],
    instantConfirmation: true,
    freeCancellation: true,
  },
]

export const TravelActivitySearchSkill: Skill = {
  id: "travel-activity-search" as SkillId,
  version: "1.0.0",
  name: "Travel Activity Search",
  inputSchema: {
    type: "object",
    properties: {
      destination: { type: "string" },
      date: { type: "string" },
      category: { type: "string", enum: ["sightseeing", "food", "adventure", "culture", "family", "nightlife"] },
      priceRange: { type: "string", enum: ["budget", "mid-range", "luxury"] },
      duration: { type: "string", enum: ["short", "medium", "full_day"] },
    },
    required: ["destination"],
  },
  outputSchema: {
    type: "object",
    properties: {
      offers: { type: "array" },
      searchParams: { type: "object" },
      provider: { type: "object" },
      errors: { type: "array" },
      meta: { type: "object" },
    },
  },
  capabilities: ["activity_search", "tour_booking", "attraction_info"],
  tags: ["travel", "activity", "tour"],
  async execute(input: unknown, context: SkillContext): Promise<ActivitySearchOutput> {
    const startTime = Date.now()
    const errors: Array<{ provider: string; error: string; timestamp: string }> = []
    const { destination, date, category, priceRange } = input as ActivitySearchInput

    log.info("activity search", { correlationId: context.correlationId, destination, category })

    try {
      const destNormalized = destination.toLowerCase()
      let results = ACTIVITIES_DB.filter(
        (a) => a.city.toLowerCase().includes(destNormalized) || destNormalized.includes(a.city.toLowerCase()),
      )

      if (results.length === 0) {
        results = [...ACTIVITIES_DB]
        errors.push({
          provider: "fallback",
          error: `No specific activities for ${destination}`,
          timestamp: new Date().toISOString(),
        })
      }

      if (category) results = results.filter((a) => a.category === category)
      if (priceRange) {
        const ranges: Record<string, { min: number; max: number }> = {
          budget: { min: 0, max: 50 },
          "mid-range": { min: 40, max: 100 },
          luxury: { min: 80, max: 1000 },
        }
        const range = ranges[priceRange]
        if (range) results = results.filter((a) => a.price >= range.min && a.price <= range.max)
      }

      results.sort((a, b) => b.rating - a.rating)

      return {
        offers: results.slice(0, 10),
        searchParams: { destination, date, category, priceRange },
        provider: { id: "internal", name: "Activity Database" },
        errors,
        meta: { generationTimeMs: Date.now() - startTime, resultsCount: results.length },
      }
    } catch (err) {
      log.error("activity search failed", { error: err instanceof Error ? err.message : String(err) })
      return {
        offers: [],
        searchParams: { destination, date, category, priceRange },
        provider: { id: "error", name: "Error" },
        errors: [
          {
            provider: "activity-search",
            error: err instanceof Error ? err.message : "Unknown error",
            timestamp: new Date().toISOString(),
          },
        ],
        meta: { generationTimeMs: Date.now() - startTime, resultsCount: 0 },
      }
    }
  },
}

export type { ActivitySearchInput, ActivitySearchOutput, ActivityOffer }

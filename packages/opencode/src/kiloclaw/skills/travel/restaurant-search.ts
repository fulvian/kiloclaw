// Travel Restaurant Search Skill
// Searches for restaurants at destination

import { Log } from "@/util/log"
import type { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"

const log = Log.create({ service: "kiloclaw.skill.travel-restaurant-search" })

interface RestaurantSearchInput {
  destination: string
  cuisine?: string
  priceRange?: "budget" | "mid-range" | "luxury"
  dietary?: string[]
  rating?: number
}

interface RestaurantOffer {
  id: string
  name: string
  address: string
  city: string
  cuisine: string[]
  priceLevel: number
  priceRange: string
  rating: number
  reviewCount: number
  features: string[]
  openingHours: string
  familyFriendly: boolean
  reservationsRecommended: boolean
}

interface RestaurantSearchOutput {
  offers: RestaurantOffer[]
  searchParams: { destination: string; cuisine?: string; priceRange?: string }
  provider: { id: string; name: string }
  errors: Array<{ provider: string; error: string; timestamp: string }>
  meta: { generationTimeMs: number; resultsCount: number }
}

const RESTAURANTS_DB: RestaurantOffer[] = [
  {
    id: "rest-1",
    name: "Da Enzo al 29",
    address: "Via dei Vascellari 29",
    city: "Roma",
    cuisine: ["Romana", "Italiana"],
    priceLevel: 2,
    priceRange: "€€",
    rating: 4.7,
    reviewCount: 3200,
    features: ["Cucina tradizionale", "Ambiente familiare"],
    openingHours: "12:30-15:00, 19:30-23:00",
    familyFriendly: true,
    reservationsRecommended: true,
  },
  {
    id: "rest-2",
    name: "Tonnarello",
    address: "Via della Paglia 25",
    city: "Roma",
    cuisine: ["Romana", "Pasta"],
    priceLevel: 2,
    priceRange: "€€",
    rating: 4.6,
    reviewCount: 2800,
    features: ["Pasta fatta in casa", "Specialità di mare"],
    openingHours: "12:30-15:00, 19:30-23:00",
    familyFriendly: true,
    reservationsRecommended: true,
  },
  {
    id: "rest-3",
    name: "Pizzarium",
    address: "Via della Meloria 43",
    city: "Roma",
    cuisine: ["Pizza", "Fast food"],
    priceLevel: 1,
    priceRange: "€",
    rating: 4.5,
    reviewCount: 4500,
    features: ["Pizza al taglio", "Impasto alveolato"],
    openingHours: "11:00-22:00",
    familyFriendly: true,
    reservationsRecommended: false,
  },
  {
    id: "rest-4",
    name: "Armando al Pantheon",
    address: "Via dei Pantheon 54",
    city: "Roma",
    cuisine: ["Romana", "Italiana"],
    priceLevel: 3,
    priceRange: "€€€",
    rating: 4.9,
    reviewCount: 2200,
    features: ["Vista Pantheon", "Cucina tradizionale"],
    openingHours: "12:30-15:00, 19:30-23:00",
    familyFriendly: true,
    reservationsRecommended: true,
  },
  {
    id: "rest-5",
    name: "Trattoria Sergio",
    address: "Via dei Neri 11",
    city: "Firenze",
    cuisine: ["Toscana"],
    priceLevel: 2,
    priceRange: "€€",
    rating: 4.8,
    reviewCount: 2600,
    features: ["Bistecca alla fiorentina", "Ribollita"],
    openingHours: "12:30-14:30, 19:30-22:30",
    familyFriendly: true,
    reservationsRecommended: true,
  },
  {
    id: "rest-6",
    name: "Di Matteo",
    address: "Via dei Tribunali 94",
    city: "Napoli",
    cuisine: ["Pizza", "Napoletana"],
    priceLevel: 1,
    priceRange: "€",
    rating: 4.7,
    reviewCount: 5000,
    features: ["Pizza margherita storica", "Antica pizzeria"],
    openingHours: "09:00-23:00",
    familyFriendly: true,
    reservationsRecommended: false,
  },
  {
    id: "rest-7",
    name: "Langosteria",
    address: "Via Carlo Tenca 5",
    city: "Milano",
    cuisine: ["Pesce", "Moderna"],
    priceLevel: 4,
    priceRange: "€€€€",
    rating: 4.9,
    reviewCount: 1900,
    features: ["Pesce premium", "Chef stellato"],
    openingHours: "12:30-14:30, 19:30-23:00",
    familyFriendly: false,
    reservationsRecommended: true,
  },
]

export const TravelRestaurantSearchSkill: Skill = {
  id: "travel-restaurant-search" as SkillId,
  version: "1.0.0",
  name: "Travel Restaurant Search",
  inputSchema: {
    type: "object",
    properties: {
      destination: { type: "string" },
      cuisine: { type: "string" },
      priceRange: { type: "string", enum: ["budget", "mid-range", "luxury"] },
      dietary: { type: "array", items: { type: "string" } },
      rating: { type: "number", minimum: 1, maximum: 5 },
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
  capabilities: ["restaurant_search", "cuisine_recommendation", "local_dining"],
  tags: ["travel", "restaurant", "dining", "food"],
  async execute(input: unknown, context: SkillContext): Promise<RestaurantSearchOutput> {
    const startTime = Date.now()
    const errors: Array<{ provider: string; error: string; timestamp: string }> = []
    const { destination, cuisine, priceRange, rating } = input as RestaurantSearchInput

    log.info("restaurant search", { correlationId: context.correlationId, destination, cuisine })

    try {
      const destNormalized = destination.toLowerCase()
      let results = RESTAURANTS_DB.filter(
        (r) => r.city.toLowerCase().includes(destNormalized) || destNormalized.includes(r.city.toLowerCase()),
      )

      if (results.length === 0) {
        results = [...RESTAURANTS_DB].sort((a, b) => b.reviewCount - a.reviewCount).slice(0, 6)
        errors.push({
          provider: "fallback",
          error: `No specific restaurants for ${destination}`,
          timestamp: new Date().toISOString(),
        })
      }

      if (cuisine)
        results = results.filter((r) => r.cuisine.some((c) => c.toLowerCase().includes(cuisine.toLowerCase())))
      if (priceRange) {
        const ranges: Record<string, number[]> = { budget: [1], "mid-range": [2, 3], luxury: [3, 4] }
        const levels = ranges[priceRange]
        if (levels) results = results.filter((r) => levels.includes(r.priceLevel))
      }
      if (rating) results = results.filter((r) => r.rating >= rating)

      results.sort((a, b) => b.rating - a.rating)

      return {
        offers: results.slice(0, 8),
        searchParams: { destination, cuisine, priceRange },
        provider: { id: "internal", name: "Restaurant Database" },
        errors,
        meta: { generationTimeMs: Date.now() - startTime, resultsCount: results.length },
      }
    } catch (err) {
      log.error("restaurant search failed", { error: err instanceof Error ? err.message : String(err) })
      return {
        offers: [],
        searchParams: { destination, cuisine, priceRange },
        provider: { id: "error", name: "Error" },
        errors: [
          {
            provider: "restaurant-search",
            error: err instanceof Error ? err.message : "Unknown error",
            timestamp: new Date().toISOString(),
          },
        ],
        meta: { generationTimeMs: Date.now() - startTime, resultsCount: 0 },
      }
    }
  },
}

export type { RestaurantSearchInput, RestaurantSearchOutput, RestaurantOffer }

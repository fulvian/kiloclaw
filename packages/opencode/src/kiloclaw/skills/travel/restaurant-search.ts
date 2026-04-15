// Travel Restaurant Search Skill
// Searches for restaurants at destination using Google Places API

import { Log } from "@/util/log"
import type { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"
import { googlePlacesAdapter } from "../../agency/travel/adapters/google-places"

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
  url?: string
  phone?: string
  coordinates?: { lat: number; lng: number }
}

interface RestaurantSearchOutput {
  offers: RestaurantOffer[]
  searchParams: { destination: string; cuisine?: string; priceRange?: string }
  provider: { id: string; name: string }
  errors: Array<{ provider: string; error: string; timestamp: string }>
  meta: { generationTimeMs: number; resultsCount: number }
}

// Map price level from Google Places (0-4) to our price range string
function mapPriceRange(priceLevel: number): string {
  if (priceLevel <= 1) return "€"
  if (priceLevel === 2) return "€€"
  if (priceLevel === 3) return "€€€"
  return "€€€€"
}

// Map Google Places types to cuisine categories
function extractCuisineFromTypes(types: string[]): string[] {
  const cuisineMap: Record<string, string[]> = {
    italian: ["Italian", "Italian cuisine"],
    pizza: ["Pizza"],
    sushi: ["Japanese", "Sushi"],
    chinese: ["Chinese"],
    mexican: ["Mexican"],
    indian: ["Indian"],
    french: ["French"],
    thai: ["Thai"],
    american: ["American"],
    seafood: ["Seafood"],
    steakhouse: ["Steakhouse"],
    cafe: ["Cafe", "Coffee"],
    bakery: ["Bakery"],
    bar: ["Bar"],
    fast_food: ["Fast Food"],
    ice_cream: ["Ice Cream"],
    mediterranean: ["Mediterranean"],
    greek: ["Greek"],
    spanish: ["Spanish", "Tapas"],
    vietnamese: ["Vietnamese"],
    korean: ["Korean"],
    ethiopian: ["Ethiopian"],
    german: ["German"],
    british: ["British"],
    pub: ["Pub"],
    wine_bar: ["Wine Bar"],
    cocktail_bar: ["Cocktail Bar"],
    breakfast: ["Breakfast"],
    brunch: ["Brunch"],
  }

  const cuisines: string[] = []
  for (const type of types) {
    if (cuisineMap[type]) {
      cuisines.push(...cuisineMap[type])
    }
  }
  return [...new Set(cuisines)]
}

// Infer features from place types
function inferFeatures(types: string[]): string[] {
  const features: string[] = []
  const featureIndicators: Record<string, string[]> = {
    "Outdoor seating": ["outdoor_seating"],
    "Takes reservations": ["reservations"],
    Delivery: ["delivery"],
    Takeout: ["takeout"],
    "Wheelchair accessible": ["wheelchair_accessible"],
    "Good for kids": ["good_for_kids", "family Friendly"],
    Groups: ["group"],
    Romantic: ["romantic"],
    Business: ["business_meeting"],
  }

  for (const [feature, indicators] of Object.entries(featureIndicators)) {
    if (indicators.some((ind) => types.includes(ind))) {
      features.push(feature)
    }
  }
  return features
}

export const TravelRestaurantSearchSkill: Skill = {
  id: "travel-restaurant-search" as SkillId,
  version: "1.1.0",
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
      // Convert price range to Google Places price level (0-4)
      const priceLevelMap: Record<string, number> = { budget: 1, "mid-range": 2, luxury: 3 }
      const googlePriceLevel = priceRange ? priceLevelMap[priceRange] : undefined

      // Call Google Places API
      const result = await googlePlacesAdapter.searchRestaurants({
        city: destination,
        cuisine: cuisine,
        priceLevel: googlePriceLevel,
        limit: 20,
      })

      if (!result.success || !result.data || result.data.length === 0) {
        // API failed or returned empty - log error and return empty
        if (result.error) {
          errors.push({
            provider: result.provider,
            error: `Google Places API error: ${result.error.message}`,
            timestamp: new Date().toISOString(),
          })
        }

        log.warn("Google Places returned no results", {
          destination,
          cuisine,
          error: result.error?.message,
        })

        return {
          offers: [],
          searchParams: { destination, cuisine, priceRange },
          provider: { id: "google_places", name: "Google Places API" },
          errors,
          meta: { generationTimeMs: Date.now() - startTime, resultsCount: 0 },
        }
      }

      // Transform adapter response to our format
      let offers: RestaurantOffer[] = result.data.map((place) => {
        const types = place.types || []
        const inferredCuisines = place.cuisine.length > 0 ? place.cuisine : extractCuisineFromTypes(types)

        return {
          id: place.id,
          name: place.name,
          address: place.address,
          city: destination, // Use the searched destination
          cuisine: inferredCuisines,
          priceLevel: place.priceLevel,
          priceRange: mapPriceRange(place.priceLevel),
          rating: place.rating || 0,
          reviewCount: place.reviewCount || 0,
          features: inferFeatures(types),
          openingHours: place.openingHours || "Hours not available",
          familyFriendly: types.includes("good_for_kids") || types.includes("family_friendly"),
          reservationsRecommended: types.includes("reservations"),
          url: place.url,
          phone: place.phone,
          coordinates: place.coordinates,
        }
      })

      // Filter by rating if specified
      if (rating) {
        offers = offers.filter((o) => o.rating >= rating)
      }

      // Sort by rating
      offers.sort((a, b) => b.rating - a.rating)

      log.info("restaurant search completed", {
        correlationId: context.correlationId,
        results: offers.length,
        provider: result.provider,
        latencyMs: result.latencyMs,
      })

      return {
        offers: offers.slice(0, 8),
        searchParams: { destination, cuisine, priceRange },
        provider: { id: result.provider, name: "Google Places API" },
        errors,
        meta: {
          generationTimeMs: Date.now() - startTime,
          resultsCount: offers.length,
        },
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

// Travel Activity Search Skill
// Searches for activities, tours, and attractions using Google Places + Ticketmaster

import { Log } from "@/util/log"
import type { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"
import { googlePlacesAdapter } from "../../agency/travel/adapters/google-places"
import { ticketmasterAdapter } from "../../agency/travel/adapters/ticketmaster"

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
  url?: string
  images?: string[]
}

interface ActivitySearchOutput {
  offers: ActivityOffer[]
  searchParams: { destination: string; date?: string; category?: string; priceRange?: string }
  provider: { id: string; name: string }
  errors: Array<{ provider: string; error: string; timestamp: string }>
  meta: { generationTimeMs: number; resultsCount: number }
}

// Map our category to Google Places types
function mapCategoryToPlaceTypes(category?: string): string {
  const categoryMap: Record<string, string> = {
    sightseeing: "tourist_attraction",
    culture: "museum",
    food: "restaurant",
    adventure: "amusement_park",
    family: "amusement_park",
    nightlife: "night_club",
  }
  return category ? categoryMap[category] || category : ""
}

// Map our category to Ticketmaster classification
function mapCategoryToTicketmaster(category?: string): string {
  const categoryMap: Record<string, string> = {
    culture: "Arts",
    sightseeing: "Miscellaneous",
    nightlife: "Nightlife",
    adventure: "Sports",
    family: "Family",
    food: "Food & Dining",
  }
  return category ? categoryMap[category] || category : ""
}

// Map duration input to expected duration string
function mapDuration(duration?: string): string {
  const durationMap: Record<string, string> = {
    short: "1-2h",
    medium: "2-4h",
    full_day: "6-8h",
  }
  return duration ? durationMap[duration] || duration : "2-4h"
}

// Infer included items from place types
function inferIncluded(types: string[]): string[] {
  const included: string[] = []
  if (types.includes("tourist_attraction")) included.push("Admission included")
  if (types.includes("museum")) included.push("Museum entry")
  if (types.includes("amusement_park")) included.push("Park entry")
  if (types.includes("zoo")) included.push("Zoo entry")
  return included.length > 0 ? included : ["Entry ticket"]
}

export const TravelActivitySearchSkill: Skill = {
  id: "travel-activity-search" as SkillId,
  version: "1.1.0",
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
      const allOffers: ActivityOffer[] = []

      // Search Google Places for attractions/POI (for sightseeing, culture, etc.)
      if (!category || category !== "nightlife") {
        const placeTypes = mapCategoryToPlaceTypes(category)
        const query = placeTypes ? `${placeTypes} in ${destination}` : `attractions in ${destination}`

        const placesResult = await googlePlacesAdapter.searchActivities({
          city: destination,
          category: placeTypes,
          limit: 15,
        })

        if (placesResult.success && placesResult.data && placesResult.data.length > 0) {
          const placeOffers = placesResult.data.map((place) => {
            const types = place.types || []
            return {
              id: place.id,
              name: place.name,
              description: place.description || `Visit ${place.name}`,
              category: category || "sightseeing",
              city: destination,
              price: 0, // Google Places doesn't provide prices
              currency: "EUR",
              duration: mapDuration(),
              rating: place.rating || 0,
              included: inferIncluded(types),
              instantConfirmation: types.includes("museum") || types.includes("tourist_attraction"),
              freeCancellation: true,
              url: place.url,
              images: place.images,
            }
          })
          allOffers.push(...placeOffers)
        } else if (placesResult.error) {
          errors.push({
            provider: placesResult.provider,
            error: `Google Places: ${placesResult.error.message}`,
            timestamp: new Date().toISOString(),
          })
        }
      }

      // Search Ticketmaster for events (concerts, shows, sports - especially for nightlife)
      if (
        !category ||
        category === "nightlife" ||
        category === "culture" ||
        category === "adventure" ||
        category === "family"
      ) {
        const tmCategory = mapCategoryToTicketmaster(category)

        const eventsResult = await ticketmasterAdapter.searchEvents({
          city: destination,
          date: date,
          category: tmCategory,
          limit: 10,
        })

        if (eventsResult.success && eventsResult.data && eventsResult.data.length > 0) {
          const eventOffers = eventsResult.data.map((event) => {
            return {
              id: event.id,
              name: event.name,
              description: event.description || `Event at ${event.venue}`,
              category: category || event.category || "event",
              city: destination,
              price: event.price,
              currency: event.currency,
              duration: "2-3h",
              rating: 0, // Ticketmaster doesn't provide ratings
              included: ["Event ticket"],
              instantConfirmation: true,
              freeCancellation: false,
              url: event.url,
              images: event.image ? [event.image] : [],
            }
          })
          allOffers.push(...eventOffers)
        } else if (eventsResult.error) {
          errors.push({
            provider: eventsResult.provider,
            error: `Ticketmaster: ${eventsResult.error.message}`,
            timestamp: new Date().toISOString(),
          })
        }
      }

      // Filter by price range if specified
      if (priceRange) {
        const ranges: Record<string, { min: number; max: number }> = {
          budget: { min: 0, max: 50 },
          "mid-range": { min: 40, max: 100 },
          luxury: { min: 80, max: 10000 },
        }
        const range = ranges[priceRange]
        if (range) {
          const filtered = allOffers.filter((o) => o.price >= range.min && o.price <= range.max)
          // If we filtered too much, keep the original results
          if (filtered.length > 0) {
            allOffers.length = 0
            allOffers.push(...filtered)
          }
        }
      }

      // Sort by rating (places with rating first), then by price
      allOffers.sort((a, b) => {
        if (a.rating !== b.rating) return b.rating - a.rating
        return a.price - b.price
      })

      // Determine primary provider
      const provider =
        errors.length > 0 && allOffers.length === 0
          ? { id: "error", name: "Error" }
          : errors.length > 0
            ? { id: "mixed", name: "Google Places + Ticketmaster" }
            : { id: "google_places+ticketmaster", name: "Google Places + Ticketmaster" }

      log.info("activity search completed", {
        correlationId: context.correlationId,
        results: allOffers.length,
        errors: errors.length,
      })

      return {
        offers: allOffers.slice(0, 10),
        searchParams: { destination, date, category, priceRange },
        provider,
        errors,
        meta: {
          generationTimeMs: Date.now() - startTime,
          resultsCount: allOffers.length,
        },
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

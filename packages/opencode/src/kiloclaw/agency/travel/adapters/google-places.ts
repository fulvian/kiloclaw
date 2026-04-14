// Google Places Adapter - Restaurants, POI, Geocoding
import { Log } from "@/util/log"
import {
  TravelAdapter,
  type RestaurantSearchParams,
  type ActivitySearchParams,
  type WeatherParams,
  type RestaurantSearchResult,
  type ActivitySearchResult,
  type AdapterResult,
  getApiKey,
} from "../adapter-base"

// Local type definitions
interface LocalRestaurantOffer {
  id: string
  provider: "google_places" | "opentripmap" | "generic"
  name: string
  address: string
  city: string
  cuisine: string[]
  priceLevel: number
  rating: number
  reviewCount: number
  openingHours?: string
  url?: string
  phone?: string
  coordinates: { lat: number; lng: number }
}

interface LocalActivityOffer {
  id: string
  provider: "amadeus" | "ticketmaster" | "opentripmap" | "google_places" | "generic"
  name: string
  description: string
  category: string
  city: string
  country: string
  price: number
  currency: string
  duration?: number
  rating?: number
  url?: string
  images: string[]
  openingHours?: string
}

interface TravelAdapterError {
  code: "TIMEOUT" | "RATE_LIMITED" | "INVALID_DATA" | "AUTH_ERROR" | "NOT_FOUND" | "PROVIDER_ERROR" | "UNKNOWN"
  message: string
  provider?: string
  retryAfterMs?: number
}

const log = Log.create({ service: "travel.adapter.google" })

const GOOGLE_PLACES_BASE_URL = "https://maps.googleapis.com/maps/api/place"

export class GooglePlacesAdapter extends TravelAdapter {
  readonly name = "google_places"

  constructor() {
    super(GOOGLE_PLACES_BASE_URL, 15000)
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const apiKey = await getApiKey("google")

    if (!apiKey) {
      throw {
        code: "AUTH_ERROR" as const,
        message: "Google API key not configured",
        provider: this.name,
      }
    }

    const startTime = Date.now()
    const separator = endpoint.includes("?") ? "&" : "?"
    const url = `${this.baseUrl}${endpoint}${separator}key=${apiKey}`

    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    })

    if (response.status === 429) {
      throw {
        code: "RATE_LIMITED" as const,
        message: "Google rate limit exceeded",
        provider: this.name,
        retryAfterMs: 2000,
      }
    }

    if (!response.ok) {
      const errorText = await response.text()
      throw {
        code: "PROVIDER_ERROR" as const,
        message: `Google API error: ${response.status} - ${errorText}`,
        provider: this.name,
      }
    }

    log.info(`Google Places request: ${endpoint}`, { latencyMs: Date.now() - startTime })

    return response.json()
  }

  // ==========================================================================
  // Search Methods
  // ==========================================================================

  async searchFlights(): Promise<import("../adapter-base").FlightSearchResult> {
    return { success: true, data: [], provider: this.name, latencyMs: 0 }
  }

  async searchHotels(): Promise<import("../adapter-base").HotelSearchResult> {
    return { success: true, data: [], provider: this.name, latencyMs: 0 }
  }

  async searchActivities(params: ActivitySearchParams): Promise<ActivitySearchResult> {
    // Use text search for POI/attractions
    const startTime = Date.now()

    try {
      const query = params.category
        ? `attractions in ${params.city} ${params.category}`
        : `tourist attractions in ${params.city}`

      const endpoint = `/textsearch/json?query=${encodeURIComponent(query)}&type=point_of_interest&language=en&maxprice=${params.limit || 20}`

      const response = (await this.request(endpoint)) as {
        results: Array<{
          place_id: string
          name: string
          formatted_address: string
          rating?: number
          user_ratings_total?: number
          price_level?: number
          types?: string[]
          photos?: Array<{ photo_reference: string }>
          geometry?: { location: { lat: number; lng: number } }
          opening_hours?: { weekday_text?: string[] }
        }>
        status: string
      }

      if (response.status !== "OK" || !response.results) {
        return {
          success: true,
          data: [],
          provider: this.name,
          latencyMs: Date.now() - startTime,
        }
      }

      const activities: LocalActivityOffer[] = response.results.slice(0, params.limit || 20).map((place) => ({
        id: place.place_id,
        provider: "google_places" as const,
        name: place.name,
        description: place.formatted_address || "",
        category: place.types?.[0] || "attraction",
        city: params.city,
        country: "",
        price: 0,
        currency: "EUR",
        rating: place.rating,
        url: `https://www.google.com/maps/place/?q=place_id:${place.place_id}`,
        images: place.photos
          ? place.photos
              .slice(0, 3)
              .map(
                (p) =>
                  `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photo_reference=${p.photo_reference}&key=KEY`,
              )
          : [],
        openingHours: place.opening_hours?.weekday_text?.join(", "),
      }))

      return {
        success: true,
        data: activities,
        provider: this.name,
        latencyMs: Date.now() - startTime,
      }
    } catch (error) {
      log.error("Google Places activity search failed", {
        error: error instanceof Error ? error.message : String(error),
      })
      return this.handleError(error, startTime)
    }
  }

  async searchEvents(): Promise<import("../adapter-base").EventSearchResult> {
    // Google Places doesn't have events - use Ticketmaster
    return { success: true, data: [], provider: this.name, latencyMs: 0 }
  }

  async searchRestaurants(params: RestaurantSearchParams): Promise<RestaurantSearchResult> {
    const startTime = Date.now()

    try {
      const query = params.cuisine ? `${params.cuisine} restaurants in ${params.city}` : `restaurants in ${params.city}`

      const endpoint = `/textsearch/json?query=${encodeURIComponent(query)}&type=restaurant&language=en${params.priceLevel ? `&maxprice=${params.priceLevel}` : ""}`

      const response = (await this.request(endpoint)) as {
        results: Array<{
          place_id: string
          name: string
          formatted_address: string
          rating?: number
          user_ratings_total?: number
          price_level?: number
          types?: string[]
          photos?: Array<{ photo_reference: string }>
          geometry?: { location: { lat: number; lng: number } }
          opening_hours?: { weekday_text?: string[] }
          formatted_phone_number?: string
          website?: string
        }>
        status: string
      }

      if (response.status !== "OK" || !response.results) {
        return {
          success: true,
          data: [],
          provider: this.name,
          latencyMs: Date.now() - startTime,
        }
      }

      // Extract cuisine types from types array
      const cuisineTypes = [
        "italian",
        "chinese",
        "japanese",
        "mexican",
        "indian",
        "french",
        "thai",
        "american",
        "seafood",
        "pizza",
        "sushi",
        "burger",
        "cafe",
        "bakery",
        "bar",
      ]

      const restaurants: LocalRestaurantOffer[] = response.results.slice(0, params.limit || 20).map((place) => {
        const placeCuisines = place.types?.filter((t) => cuisineTypes.includes(t)) || []

        return {
          id: place.place_id,
          provider: "google_places" as const,
          name: place.name,
          address: place.formatted_address || "",
          city: params.city,
          cuisine: placeCuisines,
          priceLevel: place.price_level || 2,
          rating: place.rating || 0,
          reviewCount: place.user_ratings_total || 0,
          openingHours: place.opening_hours?.weekday_text?.join(", "),
          url: place.website,
          phone: place.formatted_phone_number,
          coordinates: place.geometry?.location || { lat: 0, lng: 0 },
        }
      })

      return {
        success: true,
        data: restaurants,
        provider: this.name,
        latencyMs: Date.now() - startTime,
      }
    } catch (error) {
      log.error("Google Places restaurant search failed", {
        error: error instanceof Error ? error.message : String(error),
      })
      return this.handleError(error, startTime)
    }
  }

  async getWeather(params: WeatherParams): Promise<AdapterResult<unknown>> {
    // Google doesn't provide weather - use OpenWeather
    return { success: true, data: {}, provider: this.name, latencyMs: 0 }
  }

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  private handleError<T>(error: unknown, startTime: number): AdapterResult<T> {
    const code = error && typeof error === "object" && "code" in error ? (error as TravelAdapterError).code : "UNKNOWN"
    const message = error instanceof Error ? error.message : String(error)

    return {
      success: false,
      error: {
        code: code as TravelAdapterError["code"],
        message,
        provider: this.name,
      },
      provider: this.name,
      latencyMs: Date.now() - startTime,
    }
  }
}

// Export singleton
export const googlePlacesAdapter = new GooglePlacesAdapter()

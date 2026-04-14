// Ticketmaster Adapter - Events and attractions search
import { Log } from "@/util/log"
import {
  TravelAdapter,
  type EventSearchParams,
  type ActivitySearchParams,
  type RestaurantSearchParams,
  type WeatherParams,
  type EventSearchResult,
  type ActivitySearchResult,
  type RestaurantSearchResult,
  type AdapterResult,
  getApiKey,
} from "../adapter-base"

// Local type definitions to avoid circular reference
interface LocalEventOffer {
  id: string
  provider: "ticketmaster" | "generic"
  name: string
  description: string
  venue: string
  city: string
  country: string
  dateTime: string
  price: number
  currency: string
  category: string
  url: string
  image?: string
}

interface TravelAdapterError {
  code: "TIMEOUT" | "RATE_LIMITED" | "INVALID_DATA" | "AUTH_ERROR" | "NOT_FOUND" | "PROVIDER_ERROR" | "UNKNOWN"
  message: string
  provider?: string
  retryAfterMs?: number
}

const log = Log.create({ service: "travel.adapter.ticketmaster" })

const TICKETMASTER_BASE_URL = "https://app.ticketmaster.com/discovery/v2"

export class TicketmasterAdapter extends TravelAdapter {
  readonly name = "ticketmaster"

  constructor() {
    super(TICKETMASTER_BASE_URL, 30000)
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const apiKey = await getApiKey("ticketmaster")

    if (!apiKey) {
      throw { code: "AUTH_ERROR" as const, message: "Ticketmaster API key not configured", provider: this.name }
    }

    const startTime = Date.now()
    const separator = endpoint.includes("?") ? "&" : "?"
    const url = `${this.baseUrl}${endpoint}${separator}apikey=${apiKey}`

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
        message: "Ticketmaster rate limit exceeded",
        provider: this.name,
        retryAfterMs: 5000,
      }
    }

    if (!response.ok) {
      const errorText = await response.text()
      throw {
        code: "PROVIDER_ERROR" as const,
        message: `Ticketmaster API error: ${response.status} - ${errorText}`,
        provider: this.name,
      }
    }

    log.info(`Ticketmaster request: ${endpoint}`, { latencyMs: Date.now() - startTime })

    return response.json()
  }

  // ==========================================================================
  // Event Search
  // ==========================================================================

  async searchFlights(): Promise<import("../adapter-base").FlightSearchResult> {
    return { success: true, data: [], provider: this.name, latencyMs: 0 }
  }

  async searchHotels(): Promise<import("../adapter-base").HotelSearchResult> {
    return { success: true, data: [], provider: this.name, latencyMs: 0 }
  }

  async searchActivities(params: ActivitySearchParams): Promise<ActivitySearchResult> {
    // Ticketmaster uses events endpoint - redirect to events search
    const eventResult = await this.searchEvents({
      city: params.city,
      date: params.date,
      category: params.category,
      limit: params.limit,
    })

    // Convert EventOffer[] to ActivityOffer[] format
    return {
      success: eventResult.success,
      data:
        eventResult.data?.map((e) => ({
          id: e.id,
          provider: e.provider,
          name: e.name,
          description: e.description,
          category: e.category,
          city: e.city,
          country: e.country,
          price: e.price,
          currency: e.currency,
          rating: undefined,
          url: e.url,
          images: e.image ? [e.image] : [],
          openingHours: undefined,
        })) || [],
      error: eventResult.error,
      provider: eventResult.provider,
      latencyMs: eventResult.latencyMs,
    }
  }

  async searchEvents(params: EventSearchParams): Promise<EventSearchResult> {
    const startTime = Date.now()

    try {
      const endpoint = `/events.json?city=${params.city}&limit=${params.limit || 20}${params.category ? `&classificationName=${params.category}` : ""}${params.date ? `&startDateTime=${params.date}T00:00:00Z` : ""}`

      const response = (await this.request(endpoint)) as {
        page: { totalElements: number }
        _embedded?: {
          events: Array<{
            id: string
            name: string
            description?: { text: string }
            dates: {
              start: { localDate: string; localTime: string; dateTime: string }
              status: { code: string }
            }
            _embedded?: {
              venues?: Array<{ name: string; city: { name: string }; country: { name: string } }>
            }
            classifications?: Array<{ segment: { name: string }; genre: { name: string } }>
            priceRanges?: Array<{ min: number; max: number; currency: string }>
            images: Array<{ url: string; ratio: string }>
            url: string
          }>
        }
      }

      if (!response._embedded?.events) {
        return {
          success: true,
          data: [],
          provider: this.name,
          latencyMs: Date.now() - startTime,
        }
      }

      const events: LocalEventOffer[] = response._embedded.events.map((event) => {
        const venue = event._embedded?.venues?.[0]
        const classification = event.classifications?.[0]
        const priceRange = event.priceRanges?.[0]
        const image = event.images.find((img) => img.ratio === "16_9") || event.images[0]

        return {
          id: event.id,
          provider: "ticketmaster",
          name: event.name,
          description: event.description?.text || "",
          venue: venue?.name || "",
          city: venue?.city?.name || params.city,
          country: venue?.country?.name || "",
          dateTime: event.dates.start.dateTime || `${event.dates.start.localDate}T${event.dates.start.localTime}`,
          price: priceRange?.min || 0,
          currency: priceRange?.currency || "EUR",
          category: classification?.genre?.name || classification?.segment?.name || "event",
          url: event.url,
          image: image?.url,
        }
      })

      return {
        success: true,
        data: events,
        provider: this.name,
        latencyMs: Date.now() - startTime,
      }
    } catch (error) {
      log.error("Ticketmaster event search failed", {
        error: error instanceof Error ? error.message : String(error),
      })
      return this.handleError(error, startTime)
    }
  }

  async searchRestaurants(params: RestaurantSearchParams): Promise<RestaurantSearchResult> {
    // Ticketmaster doesn't provide restaurant data
    return { success: true, data: [], provider: this.name, latencyMs: 0 }
  }

  async getWeather(params: WeatherParams): Promise<AdapterResult<unknown>> {
    // Ticketmaster doesn't provide weather
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
export const ticketmasterAdapter = new TicketmasterAdapter()

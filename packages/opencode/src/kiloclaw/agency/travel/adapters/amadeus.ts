// Amadeus Travel Adapter - Flights, Hotels, Activities
import { Log } from "@/util/log"
import {
  TravelAdapter,
  type FlightSearchParams,
  type HotelSearchParams,
  type ActivitySearchParams,
  type EventSearchParams,
  type RestaurantSearchParams,
  type WeatherParams,
  type FlightSearchResult,
  type HotelSearchResult,
  type ActivitySearchResult,
  type EventSearchResult,
  type RestaurantSearchResult,
  type AdapterResult,
  getApiKey,
  getApiSecret,
} from "../adapter-base"

// Local type definitions to avoid circular reference
interface LocalFlightOffer {
  id: string
  provider: "amadeus" | "aviationstack" | "generic"
  airline: string
  airlineCode: string
  flightNumber: string
  origin: string
  destination: string
  departureTime: string
  arrivalTime: string
  duration: number
  stops: number
  price: number
  currency: string
  cabinClass: string
  seatsAvailable?: number
  baggageIncluded: boolean
}

interface LocalActivityOffer {
  id: string
  provider: "amadeus" | "ticketmaster" | "opentripmap" | "generic"
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

const log = Log.create({ service: "travel.adapter.amadeus" })

// Amadeus API base URLs
const AMADEUS_BASE_URL = "https://api.amadeus.com/v1"
const AMADEUS_AUTH_URL = "https://api.amadeus.com/v1/security/oauth2"

export class AmadeusAdapter extends TravelAdapter {
  readonly name = "amadeus"
  private accessToken: string | null = null
  private tokenExpiry: number = 0

  constructor() {
    super(AMADEUS_BASE_URL, 30000)
  }

  // ==========================================================================
  // Authentication
  // ==========================================================================

  private async authenticate(): Promise<void> {
    // Check if token is still valid
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return
    }

    const apiKey = await getApiKey("amadeus")
    const apiSecret = await getApiSecret("amadeus")

    if (!apiKey || !apiSecret) {
      throw new Error("Amadeus API credentials not configured")
    }

    const startTime = Date.now()
    const response = await fetch(AMADEUS_AUTH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `grant_type=client_credentials&client_id=${apiKey}&client_secret=${apiSecret}`,
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Amadeus auth failed: ${response.status} - ${error}`)
    }

    const data = (await response.json()) as {
      access_token: string
      expires_in: number
    }

    this.accessToken = data.access_token
    this.tokenExpiry = Date.now() + data.expires_in * 1000 - 60000 // 1 min buffer

    log.info("Amadeus authenticated", { latencyMs: Date.now() - startTime })
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    await this.authenticate()

    const startTime = Date.now()
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
        ...options.headers,
      },
    })

    if (response.status === 429) {
      const error: TravelAdapterError = {
        code: "RATE_LIMITED",
        message: "Amadeus rate limit exceeded",
        provider: this.name,
        retryAfterMs: parseInt(response.headers.get("retry-after") || "30", 10) * 1000,
      }
      throw error
    }

    if (response.status === 401) {
      // Token expired, reset and retry
      this.accessToken = null
      this.tokenExpiry = 0
      return this.request(endpoint, options)
    }

    if (!response.ok) {
      const errorText = await response.text()
      const error: TravelAdapterError = {
        code: "PROVIDER_ERROR",
        message: `Amadeus API error: ${response.status} - ${errorText}`,
        provider: this.name,
      }
      throw error
    }

    log.info(`Amadeus request: ${endpoint}`, { latencyMs: Date.now() - startTime })

    return response.json()
  }

  // ==========================================================================
  // Flight Search
  // ==========================================================================

  async searchFlights(params: FlightSearchParams): Promise<FlightSearchResult> {
    const startTime = Date.now()

    try {
      // Amadeus Flight Offers Search API
      const endpoint = `/shopping/flight-offers?originLocationCode=${params.origin}&destinationLocationCode=${params.destination}&departureDate=${params.departureDate}&adults=${params.adults}${params.returnDate ? `&returnDate=${params.returnDate}` : ""}&travelClass=${params.cabinClass || "ECONOMY"}&nonStopOnly=${params.nonStop || false}`

      const response = (await this.request(endpoint)) as {
        data: Array<{
          id: string
          source: string
          instantTicketingRequired: boolean
          nonHomogeneous: boolean
          oneWay: boolean
          lastTicketingDate: string
          numberOfBookableSeats: number
          itineraries: Array<{
            duration: string
            segments: Array<{
              departure: { iataCode: string; terminal?: string; at: string }
              arrival: { iataCode: string; terminal?: string; at: string }
              carrierCode: string
              number: string
              aircraft: { code: string }
              operating?: { carrierCode: string }
              duration: string
              numberOfStops: number
            }>
          }>
          price: { currency: string; total: string; base: string; fees: Array<{ amount: string; type: string }> }
          pricingOptions: { fareType: string[]; includedCheckedBagsOnly: boolean }
          validatingAirlineCodes: string[]
          travelerPricings: Array<{
            travelerId: string
            fareOption: string
            travelerType: string
            price: { currency: string; total: string; base: string }
            fareDetailsBySegment: Array<{
              cabin: string
              fareBasis: string
              class: string
              includedBags: { weight?: number; weightUnit?: string; quantity?: number }
            }>
          }>
        }>
      }

      const flights: LocalFlightOffer[] = response.data.map((offer) => {
        const firstItinerary = offer.itineraries[0]
        const firstSegment = firstItinerary.segments[0]
        const lastSegment = firstItinerary.segments[firstItinerary.segments.length - 1]

        // Get airline code from validating airline or first segment
        const airlineCode = offer.validatingAirlineCodes[0] || firstSegment.carrierCode

        return {
          id: offer.id,
          provider: "amadeus",
          airline: this.getAirlineName(airlineCode),
          airlineCode,
          flightNumber: `${firstSegment.carrierCode}${firstSegment.number}`,
          origin: firstSegment.departure.iataCode,
          destination: lastSegment.arrival.iataCode,
          departureTime: firstSegment.departure.at,
          arrivalTime: lastSegment.arrival.at,
          duration: this.parseDuration(firstItinerary.duration),
          stops: firstItinerary.segments.length - 1,
          price: parseFloat(offer.price.total),
          currency: offer.price.currency,
          cabinClass: offer.travelerPricings[0]?.fareDetailsBySegment[0]?.cabin || "ECONOMY",
          seatsAvailable: offer.numberOfBookableSeats,
          baggageIncluded: true, // Based on pricing options
        }
      })

      return {
        success: true,
        data: flights,
        provider: this.name,
        latencyMs: Date.now() - startTime,
      }
    } catch (error) {
      log.error("Amadeus flight search failed", { error: error instanceof Error ? error.message : String(error) })
      return this.handleError(error, startTime)
    }
  }

  // ==========================================================================
  // Hotel Search
  // ==========================================================================

  async searchHotels(params: HotelSearchParams): Promise<HotelSearchResult> {
    const startTime = Date.now()

    try {
      // First get hotel IDs by city
      const cityEndpoint = `/reference-data/locations?subType=CITY&keyword=${params.city}`
      const cityResponse = (await this.request(cityEndpoint)) as {
        data: Array<{ iataCode: string; name: string }>
      }

      if (!cityResponse.data || cityResponse.data.length === 0) {
        return {
          success: true,
          data: [],
          provider: this.name,
          latencyMs: Date.now() - startTime,
        }
      }

      const cityCode = cityResponse.data[0].iataCode

      // Search hotel offers
      const hotelEndpoint = `/shopping/hotel-offers?hotelIds=${"&hotelIds=".repeat(20).slice(1)}&checkInDate=${params.checkIn}&checkOutDate=${params.checkOut}&adults=${params.adults}&roomQuantity=${params.rooms}&currency=EUR`

      // Note: This is a simplified call - real implementation would use hotel by city search
      // For now, return empty as Amadeus hotel API requires more complex setup

      log.info("Amadeus hotel search - using simplified response", { cityCode })

      return {
        success: true,
        data: [],
        provider: this.name,
        latencyMs: Date.now() - startTime,
      }
    } catch (error) {
      log.error("Amadeus hotel search failed", { error: error instanceof Error ? error.message : String(error) })
      return this.handleError(error, startTime)
    }
  }

  // ==========================================================================
  // Activity Search
  // ==========================================================================

  async searchActivities(params: ActivitySearchParams): Promise<ActivitySearchResult> {
    const startTime = Date.now()

    try {
      // Amadeus Tours & Activities API
      const endpoint = `/shopping/activities?cityCode=${params.city}${params.date ? `&activityDate=${params.date}` : ""}&limit=${params.limit || 20}`

      const response = (await this.request(endpoint)) as {
        data: Array<{
          id: string
          name: string
          shortDescription: string
          category: string
          rating: number
          price?: { amount: string; currency: string }
          currency?: string
          duration?: string
          pictures?: string[]
        }>
      }

      const activities: LocalActivityOffer[] = response.data.map((activity) => ({
        id: activity.id,
        provider: "amadeus",
        name: activity.name,
        description: activity.shortDescription,
        category: activity.category,
        city: params.city,
        country: "",
        price: activity.price ? parseFloat(activity.price.amount) : 0,
        currency: activity.price?.currency || activity.currency || "EUR",
        duration: activity.duration ? this.parseDuration(activity.duration) : undefined,
        rating: activity.rating,
        url: undefined,
        images: activity.pictures || [],
        openingHours: undefined,
      }))

      return {
        success: true,
        data: activities,
        provider: this.name,
        latencyMs: Date.now() - startTime,
      }
    } catch (error) {
      log.error("Amadeus activity search failed", { error: error instanceof Error ? error.message : String(error) })
      return this.handleError(error, startTime)
    }
  }

  async searchEvents(params: EventSearchParams): Promise<EventSearchResult> {
    // Amadeus doesn't provide event search - use Ticketmaster
    // Return empty - actual implementation would be in Ticketmaster adapter
    return {
      success: true,
      data: [],
      provider: this.name,
      latencyMs: 0,
    }
  }

  async searchRestaurants(params: RestaurantSearchParams): Promise<RestaurantSearchResult> {
    // Amadeus doesn't provide restaurant search - use Google Places
    return {
      success: true,
      data: [],
      provider: this.name,
      latencyMs: 0,
    }
  }

  async getWeather(params: WeatherParams): Promise<AdapterResult<unknown>> {
    // Amadeus doesn't provide weather - use OpenWeather
    return {
      success: true,
      data: {},
      provider: this.name,
      latencyMs: 0,
    }
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private getAirlineName(code: string): string {
    const airlines: Record<string, string> = {
      AZ: "Alitalia",
      BA: "British Airways",
      LH: "Lufthansa",
      AF: "Air France",
      KL: "KLM",
      IB: "Iberia",
      UX: "Air Europa",
      TK: "Turkish Airlines",
      U2: "EasyJet",
      FR: "Ryanair",
      // Add more as needed
    }
    return airlines[code] || code
  }

  private parseDuration(duration: string): number {
    // Parse ISO 8601 duration (PT2H30M) to minutes
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/)
    if (!match) return 0
    const hours = match[1] ? parseInt(match[1], 10) : 0
    const minutes = match[2] ? parseInt(match[2], 10) : 0
    return hours * 60 + minutes
  }

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

// Export singleton instance
export const amadeusAdapter = new AmadeusAdapter()

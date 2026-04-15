// Travel Planning Engine - Orchestrates skills and adapters
import { Log } from "@/util/log"
import { fn } from "@/util/fn"
import * as z from "zod"
import { amadeusAdapter } from "./adapters/amadeus"
import { ticketmasterAdapter } from "./adapters/ticketmaster"
import { openWeatherAdapter } from "./adapters/openweather"
import { googlePlacesAdapter } from "./adapters/google-places"
import { googleWeatherAdapter } from "./adapters/google-weather"

const log = Log.create({ service: "travel.planner" })

// ============================================================================
// Local Type Definitions (avoid import issues)
// ============================================================================

interface LocalTravelQuery {
  origin: { code: string; name?: string; city?: string }
  destinations: Array<{ code?: string; name?: string; city: string; country?: string }>
  dateWindow: { start: string; end: string; flexibilityDays: number }
  budget: { currency: string; maxTotal: number; maxPerPerson?: number }
  party: { adults: number; children: number; infants: number; accessibilityNeeds?: string[] }
  preferences: {
    pace: "slow" | "medium" | "fast"
    interests: string[]
    cuisine?: string[]
    accommodationType?: string
    flightClass: string
  }
  constraints?: { nonStopPreferred?: boolean; maxLayoverHours?: number; minHotelRating?: number }
  correlationId: string
  sessionId?: string
}

interface LocalFlightOffer {
  id: string
  provider: string
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

interface LocalHotelOffer {
  id: string
  provider: string
  name: string
  address: string
  city: string
  country: string
  rating: number
  reviewCount: number
  pricePerNight: number
  currency: string
  roomType: string
  amenities: string[]
  images: string[]
  cancellationPolicy: string
  freeCancellation: boolean
  coordinates?: { lat: number; lng: number }
}

interface LocalActivityOffer {
  id: string
  provider: string
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

interface LocalRiskFlag {
  type: "weather" | "advisory" | "policy" | "availability"
  severity: "low" | "medium" | "high"
  message: string
  details?: Record<string, unknown>
}

interface LocalProviderTrace {
  providerUsed: string
  fallbackChainTried: string[]
  quotaState: "ok" | "exhausted" | "rate_limited" | "error"
  dataFreshness: string
  latencyMs: number
}

interface LocalDayPlan {
  day: number
  date: string
  activities: Array<{
    time: string
    type: string
    name: string
    location?: string
    duration: number
    bookingRef?: string
  }>
}

interface LocalBookingLink {
  provider: string
  type: "flight" | "hotel" | "activity" | "event" | "restaurant"
  url: string
  price: number
  currency: string
  expiresAt?: string
}

interface LocalTravelOption {
  id: string
  totalCost: number
  currency: string
  flights: LocalFlightOffer[]
  hotels: LocalHotelOffer[]
  activities: LocalActivityOffer[]
  itinerary: LocalDayPlan[]
  bookingLinks: LocalBookingLink[]
}

interface LocalTravelPlan {
  id: string
  query: LocalTravelQuery
  options: LocalTravelOption[]
  recommendedOption: string
  riskFlags: LocalRiskFlag[]
  policyLevelApplied: "SAFE" | "NOTIFY" | "CONFIRM" | "HITL" | "DENY"
  providerTrace: LocalProviderTrace
  createdAt: string
}

// ============================================================================
// Planning Engine Configuration
// ============================================================================

export interface PlannerConfig {
  maxFlightOptions: number
  maxHotelOptions: number
  maxActivitiesPerDay: number
  includeWeatherRisk: boolean
  includePriceCalendar: boolean
  defaultCurrency: string
}

export const DEFAULT_PLANNER_CONFIG: PlannerConfig = {
  maxFlightOptions: 5,
  maxHotelOptions: 5,
  maxActivitiesPerDay: 3,
  includeWeatherRisk: true,
  includePriceCalendar: true,
  defaultCurrency: "EUR",
}

// ============================================================================
// Input/Output Schemas
// ============================================================================

export const CreateTravelPlanInput = z.object({
  query: z.string().describe("Natural language travel query"),
  preferences: z
    .object({
      budget: z.number().positive().optional(),
      dates: z.string().optional(),
      travelers: z.number().int().positive().optional(),
      interests: z.array(z.string()).optional(),
    })
    .optional(),
})

export type CreateTravelPlanInput = z.infer<typeof CreateTravelPlanInput>

// ============================================================================
// Planning Engine
// ============================================================================

export class TravelPlanningEngine {
  private config: PlannerConfig
  private correlationId: string

  constructor(config: Partial<PlannerConfig> = {}, correlationId?: string) {
    this.config = { ...DEFAULT_PLANNER_CONFIG, ...config }
    this.correlationId = correlationId || crypto.randomUUID()
  }

  // ==========================================================================
  // Main Planning Flow
  // ==========================================================================

  async createPlan(query: LocalTravelQuery): Promise<LocalTravelPlan> {
    log.info("Creating travel plan", { correlationId: this.correlationId, query: query.destinations })
    const startTime = Date.now()

    const trace: LocalProviderTrace = {
      providerUsed: "orchestrator",
      fallbackChainTried: [],
      quotaState: "ok",
      dataFreshness: new Date().toISOString(),
      latencyMs: 0,
    }

    // Step 1: Search flights
    log.info("Searching flights", { correlationId: this.correlationId })
    const flights = await this.searchFlights(query)

    // Step 2: Search hotels
    log.info("Searching hotels", { correlationId: this.correlationId })
    const hotels = await this.searchHotels(query)

    // Step 3: Search activities/attractions
    log.info("Searching activities", { correlationId: this.correlationId })
    const activities = await this.searchActivities(query)

    // Step 4: Check weather risk
    const riskFlags = await this.assessRisk(query)

    // Step 5: Build options
    const currency = query.budget.currency || "EUR"
    const options = this.buildOptions(flights, hotels, activities, currency)

    // Step 6: Build itinerary
    const itinerary = this.buildItinerary(options, query)

    // Step 7: Generate booking links
    const bookingLinks = this.generateBookingLinks(flights, hotels)

    const totalLatencyMs = Date.now() - startTime
    trace.latencyMs = totalLatencyMs

    return {
      id: crypto.randomUUID(),
      query,
      options,
      recommendedOption: options[0]?.id || "",
      riskFlags,
      policyLevelApplied: this.determinePolicyLevel(options, riskFlags),
      providerTrace: trace,
      createdAt: new Date().toISOString(),
    }
  }

  // ==========================================================================
  // Search Operations with Fallback
  // ==========================================================================

  private async searchFlights(query: LocalTravelQuery): Promise<LocalFlightOffer[]> {
    const fallbackProviders = [amadeusAdapter]

    for (const provider of fallbackProviders) {
      try {
        const departureDate = query.dateWindow.start.split("T")[0]
        const returnDate = query.dateWindow.end.split("T")[0]

        const result = await provider.searchFlights({
          origin: query.origin.code,
          destination: query.destinations[0].city,
          departureDate,
          returnDate,
          adults: query.party?.adults || 1,
          cabinClass: query.preferences?.flightClass || "economy",
          nonStop: query.constraints?.nonStopPreferred,
        })

        if (result.success && result.data) {
          log.info("Flight search successful", { provider: provider.name, count: result.data.length })
          return result.data.slice(0, this.config.maxFlightOptions)
        }
      } catch (error) {
        log.warn("Flight search failed, trying next provider", {
          provider: provider.name,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    log.error("All flight providers failed")
    return []
  }

  private async searchHotels(query: LocalTravelQuery): Promise<LocalHotelOffer[]> {
    log.info("Hotel search placeholder", { destination: query.destinations[0].city })
    return []
  }

  private async searchActivities(query: LocalTravelQuery): Promise<LocalActivityOffer[]> {
    const activities: LocalActivityOffer[] = []

    const providers = [
      {
        search: () => ticketmasterAdapter.searchEvents({ city: query.destinations[0].city, limit: 10 }),
        type: "events",
      },
      {
        search: () => googlePlacesAdapter.searchActivities({ city: query.destinations[0].city, limit: 10 }),
        type: "poi",
      },
    ]

    for (const { search, type } of providers) {
      try {
        const result = await search()
        if (result.success && result.data) {
          // Normalize different offer types to LocalActivityOffer
          const normalized: LocalActivityOffer[] = result.data.map((item) => {
            const base = {
              id: item.id,
              provider: item.provider,
              name: item.name,
              description: item.description || "",
              category: item.category,
              city: item.city,
              country: item.country,
              price: item.price,
              currency: item.currency,
              url: item.url,
              images: "images" in item && Array.isArray(item.images) ? item.images : [],
              openingHours: "openingHours" in item ? item.openingHours : undefined,
            }

            // Add rating if available
            if ("rating" in item && typeof item.rating === "number") {
              return { ...base, rating: item.rating }
            }
            return base
          })
          activities.push(...normalized)
        }
      } catch (error) {
        log.warn(`Activity search (${type}) failed`, { error: error instanceof Error ? error.message : String(error) })
      }
    }

    return activities.slice(0, 20)
  }

  private async assessRisk(query: LocalTravelQuery): Promise<LocalRiskFlag[]> {
    const flags: LocalRiskFlag[] = []

    if (!this.config.includeWeatherRisk) return flags

    try {
      // Primary: Google Weather (uses Google Geocoding + Open-Meteo for actual weather)
      let result = await googleWeatherAdapter.getWeather({ city: query.destinations[0].city })
      let weatherData = result.data
      let weatherProvider = "google_weather"

      // Fallback to OpenWeather if Google Weather fails
      if (!result.success || !result.data) {
        result = await openWeatherAdapter.getWeather({ city: query.destinations[0].city })
        weatherData = result.data
        weatherProvider = "openweather"

        if (!result.success || !result.data) {
          log.warn("Both Google Weather and OpenWeather failed", {
            destination: query.destinations[0].city,
            googleError: result.error?.message,
          })
          return flags
        }
      }

      // Use the appropriate adapter's assessWeatherRisk method
      // weatherData is guaranteed to be defined here due to early return above
      const assessment =
        weatherProvider === "google_weather"
          ? this.assessGoogleWeatherRisk(weatherData!)
          : openWeatherAdapter.assessWeatherRisk(weatherData!)

      if (assessment.level !== "low") {
        flags.push({
          type: "weather",
          severity: assessment.level,
          message: assessment.reasons.join("; "),
          details: { weather: weatherData, provider: weatherProvider },
        })
      }
    } catch (error) {
      log.warn("Weather risk assessment failed", { error: error instanceof Error ? error.message : String(error) })
    }

    return flags
  }

  // Assess weather risk for Google Weather data format
  private assessGoogleWeatherRisk(data: any): { level: "low" | "medium" | "high"; reasons: string[] } {
    const reasons: string[] = []
    let riskLevel: "low" | "medium" | "high" = "low"

    if (!data?.current) return { level: "low", reasons: [] }

    const current = data.current

    // Check temperature extremes
    if (current.temperature < 0 || current.temperature > 38) {
      reasons.push(`Extreme temperature: ${current.temperature}°C`)
      riskLevel = "high"
    } else if (current.temperature < 5 || current.temperature > 35) {
      reasons.push(`Uncomfortable temperature: ${current.temperature}°C`)
      riskLevel = riskLevel === "low" ? "medium" : riskLevel
    }

    // Check for rain/thunderstorm in forecast
    const hasRain = data.forecast?.some((d: any) => d.rainProbability > 60)
    if (hasRain) {
      reasons.push("High rain probability forecast")
      riskLevel = riskLevel === "low" ? "medium" : riskLevel
    }

    // Check wind speed
    if (current.windSpeed > 50) {
      reasons.push(`High wind speed: ${current.windSpeed} km/h`)
      riskLevel = "high"
    } else if (current.windSpeed > 30) {
      reasons.push(`Strong wind: ${current.windSpeed} km/h`)
      riskLevel = riskLevel === "low" ? "medium" : riskLevel
    }

    // Check description for severe weather
    const desc = current.description?.toLowerCase() || ""
    if (desc.includes("thunder") || desc.includes("storm")) {
      reasons.push("Thunderstorm expected")
      riskLevel = "high"
    } else if (desc.includes("snow") || desc.includes("ice") || desc.includes("freezing")) {
      reasons.push("Winter weather conditions")
      riskLevel = "high"
    } else if (desc.includes("fog") || desc.includes("mist")) {
      reasons.push("Low visibility conditions")
      riskLevel = riskLevel === "low" ? "medium" : riskLevel
    }

    return { level: riskLevel, reasons }
  }

  // ==========================================================================
  // Option Building
  // ==========================================================================

  private buildOptions(
    flights: LocalFlightOffer[],
    hotels: LocalHotelOffer[],
    activities: LocalActivityOffer[],
    currency: string,
  ): LocalTravelOption[] {
    const options: LocalTravelOption[] = []

    const sortedFlights = [...flights].sort((a, b) => a.price - b.price)
    const sortedHotels = [...hotels].sort((a, b) => a.pricePerNight - b.pricePerNight)

    const cheapestFlight = sortedFlights[0]
    const cheapestHotel = sortedHotels[0]

    if (cheapestFlight) {
      const totalCost = cheapestFlight.price + (cheapestHotel?.pricePerNight || 0) * 3

      options.push({
        id: crypto.randomUUID(),
        totalCost,
        currency,
        flights: [cheapestFlight],
        hotels: cheapestHotel ? [cheapestHotel] : [],
        activities: activities.slice(0, 5),
        itinerary: this.generateBasicItinerary(cheapestFlight),
        bookingLinks: this.generateBookingLinks([cheapestFlight], cheapestHotel ? [cheapestHotel] : []),
      })
    }

    return options
  }

  private generateBasicItinerary(flight: LocalFlightOffer): LocalDayPlan[] {
    const departureDate = new Date(flight.departureTime)

    return [
      {
        day: 1,
        date: departureDate.toISOString(),
        activities: [
          {
            time: "00:00",
            type: "flight",
            name: `${flight.airline} ${flight.flightNumber}`,
            location: flight.destination,
            duration: flight.duration,
            bookingRef: flight.id,
          },
        ],
      },
    ]
  }

  private buildItinerary(options: LocalTravelOption[], query: LocalTravelQuery): LocalDayPlan[] {
    if (!options[0]) return []

    const startDate = new Date(query.dateWindow.start)
    const days: LocalDayPlan[] = []

    for (let i = 0; i < 7; i++) {
      const date = new Date(startDate)
      date.setDate(date.getDate() + i)

      days.push({
        day: i + 1,
        date: date.toISOString(),
        activities: [
          {
            time: "09:00",
            type: "free",
            name: "Explore destination",
            duration: 480,
          },
        ],
      })
    }

    return days
  }

  // ==========================================================================
  // Booking Links
  // ==========================================================================

  private generateBookingLinks(flights: LocalFlightOffer[], hotels: LocalHotelOffer[]): LocalBookingLink[] {
    const links: LocalBookingLink[] = []

    for (const flight of flights) {
      links.push({
        provider: flight.provider,
        type: "flight",
        url: `https://www.google.com/flights?q=flights+to+${flight.destination}+${flight.departureTime}`,
        price: flight.price,
        currency: flight.currency,
      })
    }

    for (const hotel of hotels) {
      links.push({
        provider: hotel.provider,
        type: "hotel",
        url: `https://www.google.com/travel/hotels?q=${hotel.name}+${hotel.city}`,
        price: hotel.pricePerNight,
        currency: hotel.currency,
      })
    }

    return links
  }

  // ==========================================================================
  // Policy Level Determination
  // ==========================================================================

  private determinePolicyLevel(
    options: LocalTravelOption[],
    riskFlags: LocalRiskFlag[],
  ): "SAFE" | "NOTIFY" | "CONFIRM" | "HITL" | "DENY" {
    if (riskFlags.some((f) => f.severity === "high")) {
      return "HITL"
    }

    const totalCost = options.reduce((sum, o) => sum + o.totalCost, 0)
    const avgCost = options.length > 0 ? totalCost / options.length : 0
    if (avgCost > 2000) {
      return "CONFIRM"
    }

    return "NOTIFY"
  }
}

// ============================================================================
// Skill Namespace for Tool Integration
// ============================================================================

export namespace TravelPlanner {
  const log = Log.create({ service: "travel.planner.skill" })

  export const createPlan = fn(
    z.object({
      destination: z.string().describe("Destination city or country"),
      startDate: z.string().describe("Start date (YYYY-MM-DD)"),
      endDate: z.string().describe("End date (YYYY-MM-DD)"),
      travelers: z.number().int().positive().default(1),
      budget: z.number().positive().optional(),
      interests: z.array(z.string()).optional(),
    }),
    async (input) => {
      log.info("Creating travel plan", { input })

      const engine = new TravelPlanningEngine()

      const query: LocalTravelQuery = {
        origin: { code: "FCO" },
        destinations: [{ city: input.destination }],
        dateWindow: {
          start: input.startDate,
          end: input.endDate,
          flexibilityDays: 3,
        },
        budget: {
          currency: "EUR",
          maxTotal: input.budget || 1000,
        },
        party: {
          adults: input.travelers,
          children: 0,
          infants: 0,
        },
        preferences: {
          pace: "medium",
          interests: input.interests || [],
          flightClass: "economy",
        },
        correlationId: crypto.randomUUID(),
      }

      try {
        const plan = await engine.createPlan(query)
        return {
          success: true,
          plan,
          recommendations: [
            `Best option: €${plan.options[0]?.totalCost.toFixed(2) || "N/A"}`,
            `Weather risk: ${plan.riskFlags.length > 0 ? plan.riskFlags.map((f) => f.message).join(", ") : "Low"}`,
            `Policy level: ${plan.policyLevelApplied}`,
          ],
        }
      } catch (error) {
        log.error("Travel planning failed", { error: error instanceof Error ? error.message : String(error) })
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        }
      }
    },
  )
}

export const travelPlanner = TravelPlanner

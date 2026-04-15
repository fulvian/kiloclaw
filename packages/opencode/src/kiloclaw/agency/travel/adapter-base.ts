// Travel Adapter Base - Abstract adapter with fallback chain support
import { Log } from "@/util/log"
import { TravelAdapterError } from "./types"

const log = Log.create({ service: "travel.adapter" })

// Import type-only aliases to avoid circular reference issues
type FlightOffer = {
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

type HotelOffer = {
  id: string
  provider: "amadeus" | "booking" | "generic"
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

type ActivityOffer = {
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
  types?: string[] // Google Places types for POI
}

type EventOffer = {
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

type RestaurantOffer = {
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
  types?: string[] // Google Places types (e.g., restaurant, cafe, bar)
}

type ProviderTrace = {
  providerUsed: string
  fallbackChainTried: string[]
  quotaState: "ok" | "exhausted" | "rate_limited" | "error"
  dataFreshness: string
  latencyMs: number
}

// ============================================================================
// Adapter Interfaces
// ============================================================================

export interface FlightSearchParams {
  origin: string
  destination: string
  departureDate: string
  returnDate?: string
  adults: number
  children?: number
  cabinClass?: string
  nonStop?: boolean
}

export interface HotelSearchParams {
  city: string
  checkIn: string
  checkOut: string
  rooms: number
  adults: number
  children?: number
  rating?: number
  amenities?: string[]
}

export interface ActivitySearchParams {
  city: string
  date?: string
  category?: string
  limit?: number
}

export interface EventSearchParams {
  city: string
  date?: string
  category?: string
  limit?: number
}

export interface RestaurantSearchParams {
  city: string
  cuisine?: string
  priceLevel?: number
  limit?: number
}

export interface WeatherParams {
  city: string
  date?: string
}

// ============================================================================
// Adapter Result Types
// ============================================================================

export interface AdapterResult<T> {
  success: boolean
  data?: T
  error?: TravelAdapterError
  provider: string
  latencyMs: number
}

export interface FlightSearchResult extends AdapterResult<FlightOffer[]> {}
export interface HotelSearchResult extends AdapterResult<HotelOffer[]> {}
export interface ActivitySearchResult extends AdapterResult<ActivityOffer[]> {}
export interface EventSearchResult extends AdapterResult<EventOffer[]> {}
export interface RestaurantSearchResult extends AdapterResult<RestaurantOffer[]> {}

// ============================================================================
// Abstract Base Adapter
// ============================================================================

export abstract class TravelAdapter {
  abstract readonly name: string
  protected readonly baseUrl: string
  protected readonly timeout: number

  constructor(baseUrl: string, timeout: number = 30000) {
    this.baseUrl = baseUrl
    this.timeout = timeout
  }

  abstract searchFlights(params: FlightSearchParams): Promise<FlightSearchResult>
  abstract searchHotels(params: HotelSearchParams): Promise<HotelSearchResult>
  abstract searchActivities(params: ActivitySearchParams): Promise<ActivitySearchResult>
  abstract searchEvents(params: EventSearchParams): Promise<EventSearchResult>
  abstract searchRestaurants(params: RestaurantSearchParams): Promise<RestaurantSearchResult>
  abstract getWeather(params: WeatherParams): Promise<AdapterResult<unknown>>

  protected createError(code: TravelAdapterError["code"], message: string, retryAfterMs?: number): TravelAdapterError {
    return {
      code,
      message,
      provider: this.name,
      retryAfterMs,
    }
  }

  protected async withTimeout<T>(promise: Promise<T>): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Request timeout")), this.timeout),
    )
    return Promise.race([promise, timeoutPromise])
  }
}

// ============================================================================
// Fallback Chain Manager
// ============================================================================

export class FallbackChain<T> {
  private adapters: TravelAdapter[]
  private currentIndex: number = 0

  constructor(adapters: TravelAdapter[]) {
    this.adapters = adapters
  }

  async execute(operation: (adapter: TravelAdapter) => Promise<AdapterResult<T>>): Promise<AdapterResult<T>> {
    const tried: string[] = []

    for (let i = 0; i < this.adapters.length; i++) {
      const adapter = this.adapters[i]
      tried.push(adapter.name)

      try {
        log.info(`Trying adapter: ${adapter.name}`, { tried })
        const result = await operation(adapter)

        if (result.success) {
          log.info(`Adapter ${adapter.name} succeeded`, { latencyMs: result.latencyMs })
          return {
            ...result,
            data: result.data,
          }
        }

        // Check if we should retry with next adapter
        if (result.error && this.shouldFallback(result.error)) {
          log.warn(`Adapter ${adapter.name} failed, trying next`, {
            error: result.error.code,
            message: result.error.message,
          })
          continue
        }

        // Return the error result if we shouldn't retry
        return result
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        log.error(`Adapter ${adapter.name} threw exception`, { error: errorMessage })

        // Continue to next adapter if it's a timeout or unknown error
        if (error instanceof Error && (error.message.includes("timeout") || !("code" in error))) {
          continue
        }

        // Return error for other exceptions
        return {
          success: false,
          error: {
            code: "UNKNOWN",
            message: errorMessage,
            provider: adapter.name,
          },
          provider: adapter.name,
          latencyMs: 0,
        }
      }
    }

    // All adapters failed
    log.error("All adapters in fallback chain failed", { tried })
    return {
      success: false,
      error: {
        code: "PROVIDER_ERROR",
        message: `All ${tried.length} providers failed: ${tried.join(", ")}`,
        retryAfterMs: 60000,
      },
      provider: tried[tried.length - 1],
      latencyMs: 0,
    }
  }

  private shouldFallback(error: TravelAdapterError): boolean {
    // Retry on these error codes
    const retryableCodes: TravelAdapterError["code"][] = ["TIMEOUT", "RATE_LIMITED", "AUTH_ERROR", "PROVIDER_ERROR"]
    return retryableCodes.includes(error.code)
  }

  reset(): void {
    this.currentIndex = 0
  }

  getTriedAdapters(): string[] {
    return this.adapters.map((a) => a.name).slice(0, this.currentIndex + 1)
  }
}

// ============================================================================
// Normalizer utilities for standardizing provider responses
// ============================================================================

export function normalizeCurrency(amount: number, fromCurrency: string, toCurrency: string = "EUR"): number {
  // TODO: Implement real exchange rate lookup
  // For now, assume same currency or return as-is
  if (fromCurrency === toCurrency) return amount
  // Placeholder - would integrate with exchange rate API
  return amount
}

export function normalizeDate(dateStr: string): string {
  // Ensure ISO 8601 format
  try {
    const date = new Date(dateStr)
    return date.toISOString()
  } catch {
    return dateStr
  }
}

export function normalizeDuration(durationStr: string): number {
  // Parse duration like "2h 30m" to minutes
  const hourMatch = durationStr.match(/(\d+)\s*h/)
  const minMatch = durationStr.match(/(\d+)\s*m/)
  const hours = hourMatch ? parseInt(hourMatch[1], 10) : 0
  const minutes = minMatch ? parseInt(minMatch[1], 10) : 0
  return hours * 60 + minutes
}

// ============================================================================
// Provider Trace Builder
// ============================================================================

export function createProviderTrace(
  provider: string,
  fallbackChain: string[],
  latencyMs: number,
  quotaState: "ok" | "exhausted" | "rate_limited" | "error" = "ok",
): ProviderTrace {
  return {
    providerUsed: provider,
    fallbackChainTried: fallbackChain,
    quotaState,
    dataFreshness: new Date().toISOString(),
    latencyMs,
  }
}

// ============================================================================
// Key Pool Loader (for API keys)
// ============================================================================

export async function getApiKey(provider: string): Promise<string | undefined> {
  // Use KeyManager for proper key rotation and rate limiting
  try {
    const { KeyManager } = await import("../key-pool")
    const manager = KeyManager.getInstance()
    const pool = manager.getPool(provider.toUpperCase())
    const keyState = pool.getKey()
    if (keyState) {
      return keyState.key
    }
  } catch (err) {
    log.debug(`KeyManager not available, falling back to env: ${err}`)
  }

  // Fallback to direct env var
  const envKey = process.env[`${provider.toUpperCase()}_API_KEY`]
  if (envKey) return envKey

  log.warn(`No API key found for provider: ${provider}`)
  return undefined
}

export async function getApiSecret(provider: string): Promise<string | undefined> {
  // Use KeyManager for proper key rotation
  try {
    const { KeyManager } = await import("../key-pool")
    const manager = KeyManager.getInstance()
    // Secrets are stored with _SECRET suffix
    const pool = manager.getPool(`${provider.toUpperCase()}_SECRET`)
    const keyState = pool.getKey()
    if (keyState) {
      return keyState.key
    }
  } catch (err) {
    log.debug(`KeyManager not available for secret, falling back to env: ${err}`)
  }

  // Fallback to direct env var
  const envSecret = process.env[`${provider.toUpperCase()}_API_SECRET`]
  if (envSecret) return envSecret

  log.warn(`No API secret found for provider: ${provider}`)
  return undefined
}

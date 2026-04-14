// Travel Agency Types - Zod schemas for travel domain
import z from "zod"

// ============================================================================
// Travel Query (input for orchestration)
// ============================================================================

export const TravelQueryOrigin = z.object({
  code: z.string().length(3).describe("IATA airport code"),
  name: z.string().optional(),
  city: z.string().optional(),
})

export const TravelQueryDestination = z.object({
  code: z.string().length(3).optional().describe("IATA airport code"),
  name: z.string().optional(),
  city: z.string(),
  country: z.string().optional(),
})

export const DateWindow = z.object({
  start: z.string().datetime().describe("ISO 8601 date"),
  end: z.string().datetime().describe("ISO 8601 date"),
  flexibilityDays: z.number().int().min(0).max(30).default(3),
})

export const Budget = z.object({
  currency: z.string().length(3).default("EUR"),
  maxTotal: z.number().positive(),
  maxPerPerson: z.number().positive().optional(),
})

export const Party = z.object({
  adults: z.number().int().min(1).default(1),
  children: z.number().int().min(0).default(0),
  infants: z.number().int().min(0).default(0),
  accessibilityNeeds: z.array(z.string()).optional(),
})

export const TravelPreferences = z.object({
  pace: z.enum(["slow", "medium", "fast"]).default("medium"),
  interests: z.array(z.string()),
  cuisine: z.array(z.string()).optional(),
  accommodationType: z.enum(["hotel", "apartment", "hostel", "resort", "b&b"]).optional(),
  flightClass: z.enum(["economy", "premium_economy", "business", "first"]).default("economy"),
})

export const TravelConstraints = z.object({
  nonStopPreferred: z.boolean().default(false),
  maxLayoverHours: z.number().int().positive().optional(),
  minHotelRating: z.number().min(1).max(5).optional(),
  connectVia: z.array(z.string()).optional(),
})

export const TravelQuery = z
  .object({
    origin: TravelQueryOrigin,
    destinations: z.array(TravelQueryDestination).min(1),
    dateWindow: DateWindow,
    budget: Budget,
    party: Party,
    preferences: TravelPreferences,
    constraints: TravelConstraints.optional(),
    correlationId: z.string().uuid(),
    sessionId: z.string().optional(),
  })
  .partial({
    party: true,
    preferences: true,
  })

export type TravelQuery = z.infer<typeof TravelQuery>

// ============================================================================
// Travel Offer (output from providers)
// ============================================================================

export const FlightOffer = z.object({
  id: z.string(),
  provider: z.enum(["amadeus", "aviationstack", "generic"]),
  airline: z.string(),
  airlineCode: z.string(),
  flightNumber: z.string(),
  origin: z.string().length(3),
  destination: z.string().length(3),
  departureTime: z.string().datetime(),
  arrivalTime: z.string().datetime(),
  duration: z.number().int().positive(),
  stops: z.number().int().min(0),
  price: z.number().positive(),
  currency: z.string().length(3),
  cabinClass: z.string(),
  seatsAvailable: z.number().int().positive().optional(),
  baggageIncluded: z.boolean().default(true),
})

export const HotelOffer = z.object({
  id: z.string(),
  provider: z.enum(["amadeus", "booking", "generic"]),
  name: z.string(),
  address: z.string(),
  city: z.string(),
  country: z.string(),
  rating: z.number().min(1).max(5),
  reviewCount: z.number().int().nonnegative(),
  pricePerNight: z.number().positive(),
  currency: z.string().length(3),
  roomType: z.string(),
  amenities: z.array(z.string()),
  images: z.array(z.string()),
  cancellationPolicy: z.string(),
  freeCancellation: z.boolean().default(false),
  coordinates: z
    .object({
      lat: z.number(),
      lng: z.number(),
    })
    .optional(),
})

export const ActivityOffer = z.object({
  id: z.string(),
  provider: z.enum(["amadeus", "ticketmaster", "opentripmap", "generic"]),
  name: z.string(),
  description: z.string(),
  category: z.string(),
  city: z.string(),
  country: z.string(),
  price: z.number().positive(),
  currency: z.string().length(3),
  duration: z.number().int().positive().optional(),
  rating: z.number().min(1).max(5).optional(),
  url: z.string().url().optional(),
  images: z.array(z.string()),
  openingHours: z.string().optional(),
})

export const EventOffer = z.object({
  id: z.string(),
  provider: z.enum(["ticketmaster", "generic"]),
  name: z.string(),
  description: z.string(),
  venue: z.string(),
  city: z.string(),
  country: z.string(),
  dateTime: z.string().datetime(),
  price: z.number().positive(),
  currency: z.string().length(3),
  category: z.string(),
  url: z.string().url(),
  image: z.string().url().optional(),
})

export const RestaurantOffer = z.object({
  id: z.string(),
  provider: z.enum(["google_places", "opentripmap", "generic"]),
  name: z.string(),
  address: z.string(),
  city: z.string(),
  cuisine: z.array(z.string()),
  priceLevel: z.number().min(1).max(4),
  rating: z.number().min(1).max(5),
  reviewCount: z.number().int().nonnegative(),
  openingHours: z.string().optional(),
  url: z.string().url().optional(),
  phone: z.string().optional(),
  coordinates: z.object({
    lat: z.number(),
    lng: z.number(),
  }),
})

// ============================================================================
// Travel Itinerary Plan (output)
// ============================================================================

export const DayPlan = z.object({
  day: z.number().int().positive(),
  date: z.string().datetime(),
  activities: z.array(
    z.object({
      time: z.string(),
      type: z.enum(["flight", "hotel_checkin", "activity", "restaurant", "transfer", "free"]),
      name: z.string(),
      location: z.string().optional(),
      duration: z.number().int().positive(),
      bookingRef: z.string().optional(),
    }),
  ),
})

export const BookingLink = z.object({
  provider: z.string(),
  type: z.enum(["flight", "hotel", "activity", "event", "restaurant"]),
  url: z.string().url(),
  price: z.number().positive(),
  currency: z.string().length(3),
  expiresAt: z.string().datetime().optional(),
})

export const RiskFlag = z.object({
  type: z.enum(["weather", "advisory", "policy", "availability"]),
  severity: z.enum(["low", "medium", "high"]),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
})

export const ProviderTrace = z.object({
  providerUsed: z.string(),
  fallbackChainTried: z.array(z.string()).default([]),
  quotaState: z.enum(["ok", "exhausted", "rate_limited", "error"]).default("ok"),
  dataFreshness: z.string().datetime(),
  latencyMs: z.number().int().nonnegative(),
})

export const TravelPlan = z.object({
  id: z.string().uuid(),
  query: TravelQuery,
  options: z.array(
    z.object({
      id: z.string(),
      totalCost: z.number().positive(),
      currency: z.string().length(3),
      flights: z.array(FlightOffer),
      hotels: z.array(HotelOffer),
      activities: z.array(ActivityOffer).default([]),
      itinerary: z.array(DayPlan),
      bookingLinks: z.array(BookingLink),
    }),
  ),
  recommendedOption: z.string(),
  riskFlags: z.array(RiskFlag).default([]),
  policyLevelApplied: z.enum(["SAFE", "NOTIFY", "CONFIRM", "HITL", "DENY"]),
  providerTrace: ProviderTrace,
  createdAt: z.string().datetime(),
})

export type TravelPlan = z.infer<typeof TravelPlan>

// ============================================================================
// Emergency Case
// ============================================================================

export const EmergencyCase = z.object({
  id: z.string().uuid(),
  type: z.enum(["medical", "theft", "lost_document", "accident", "natural_disaster", "other"]),
  location: z.object({
    city: z.string(),
    country: z.string(),
    coordinates: z
      .object({
        lat: z.number(),
        lng: z.number(),
      })
      .optional(),
  }),
  description: z.string(),
  urgency: z.enum(["low", "medium", "high", "critical"]),
  contacts: z
    .array(
      z.object({
        type: z.enum(["embassy", "hospital", "police", "fire", "emergency"]),
        name: z.string(),
        phone: z.string(),
        address: z.string().optional(),
      }),
    )
    .default([]),
  createdAt: z.string().datetime(),
})

export type EmergencyCase = z.infer<typeof EmergencyCase>

// ============================================================================
// Error Types for Travel Adapters
// ============================================================================

export const TravelAdapterError = z.object({
  code: z.enum(["TIMEOUT", "RATE_LIMITED", "INVALID_DATA", "AUTH_ERROR", "NOT_FOUND", "PROVIDER_ERROR", "UNKNOWN"]),
  message: z.string(),
  provider: z.string().optional(),
  retryAfterMs: z.number().int().positive().optional(),
})

export type TravelAdapterError = z.infer<typeof TravelAdapterError>

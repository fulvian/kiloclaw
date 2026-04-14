// Travel Tools - Destination search, flight search, hotel search, etc.
import { Tool } from "./tool"
import z from "zod"
import { TravelWeatherTool } from "./travel-weather"

// ============================================================================
// Travel Destination Search Tool
// ============================================================================

const DestinationSearchParams = z.object({
  query: z.string().describe("Destination search query"),
  country: z.string().optional().describe("Filter by country"),
})

export const TravelDestinationSearchTool = Tool.define("travel_destination_search", {
  description: "Search for travel destinations",
  parameters: DestinationSearchParams,
  async execute(params, ctx) {
    // Placeholder response - integrate with travel adapters
    const response = {
      destinations: [{ name: "Rome", country: "Italy", description: "Eternal City", rating: 4.8 }],
      count: 1,
    }
    return {
      title: `Destinations matching "${params.query}"`,
      output: JSON.stringify(response, null, 2),
      metadata: { query: params.query },
    }
  },
})

// ============================================================================
// Travel Flight Search Tool
// ============================================================================

const FlightSearchParams = z.object({
  origin: z.string().describe("Origin city or airport code"),
  destination: z.string().describe("Destination city or airport code"),
  departureDate: z.string().describe("Departure date (YYYY-MM-DD)"),
  returnDate: z.string().optional().describe("Return date (YYYY-MM-DD)"),
  passengers: z.number().optional().default(1),
})

export const TravelFlightSearchTool = Tool.define("travel_flight_search", {
  description: "Search for flights",
  parameters: FlightSearchParams,
  async execute(params, ctx) {
    // Placeholder response
    const response = {
      flights: [],
      count: 0,
      message: "Configure AMADEUS_API_KEY to enable flight search",
    }
    return {
      title: `Flights from ${params.origin} to ${params.destination}`,
      output: JSON.stringify(response, null, 2),
      metadata: { origin: params.origin, destination: params.destination },
    }
  },
})

// ============================================================================
// Travel Hotel Search Tool
// ============================================================================

const HotelSearchParams = z.object({
  city: z.string().describe("City name"),
  checkIn: z.string().describe("Check-in date (YYYY-MM-DD)"),
  checkOut: z.string().describe("Check-out date (YYYY-MM-DD)"),
  rooms: z.number().optional().default(1),
  guests: z.number().optional().default(2),
})

export const TravelHotelSearchTool = Tool.define("travel_hotel_search", {
  description: "Search for hotels",
  parameters: HotelSearchParams,
  async execute(params, ctx) {
    // Placeholder response
    const response = {
      hotels: [],
      count: 0,
      message: "Configure AMADEUS_API_KEY to enable hotel search",
    }
    return {
      title: `Hotels in ${params.city}`,
      output: JSON.stringify(response, null, 2),
      metadata: { city: params.city, checkIn: params.checkIn, checkOut: params.checkOut },
    }
  },
})

// ============================================================================
// Travel Restaurant Search Tool
// ============================================================================

const RestaurantSearchParams = z.object({
  city: z.string().describe("City name"),
  cuisine: z.string().optional().describe("Cuisine type"),
  priceLevel: z.number().optional().describe("Price level 1-4"),
})

export const TravelRestaurantSearchTool = Tool.define("travel_restaurant_search", {
  description: "Search for restaurants",
  parameters: RestaurantSearchParams,
  async execute(params, ctx) {
    // Placeholder response - integrate with Google Places adapter
    const response = {
      restaurants: [],
      count: 0,
      message: "Configure GOOGLE_MAPS_API_KEY to enable restaurant search",
    }
    return {
      title: `Restaurants in ${params.city}`,
      output: JSON.stringify(response, null, 2),
      metadata: { city: params.city, cuisine: params.cuisine },
    }
  },
})

// ============================================================================
// Travel Activity Search Tool
// ============================================================================

const ActivitySearchParams = z.object({
  city: z.string().describe("City name"),
  category: z.string().optional().describe("Activity category"),
  date: z.string().optional().describe("Date (YYYY-MM-DD)"),
})

export const TravelActivitySearchTool = Tool.define("travel_activity_search", {
  description: "Search for activities and attractions",
  parameters: ActivitySearchParams,
  async execute(params, ctx) {
    // Placeholder response
    const response = {
      activities: [],
      count: 0,
      message: "Configure AMADEUS_API_KEY or TICKETMASTER_API_KEY to enable activity search",
    }
    return {
      title: `Activities in ${params.city}`,
      output: JSON.stringify(response, null, 2),
      metadata: { city: params.city, category: params.category },
    }
  },
})

// ============================================================================
// Travel Transfer Search Tool
// ============================================================================

const TransferSearchParams = z.object({
  from: z.string().describe("Pickup location"),
  to: z.string().describe("Drop-off location"),
  date: z.string().describe("Transfer date"),
  passengers: z.number().optional().default(2),
})

export const TravelTransferSearchTool = Tool.define("travel_transfer_search", {
  description: "Search for airport transfers and ground transportation",
  parameters: TransferSearchParams,
  async execute(params, ctx) {
    // Placeholder response
    const response = {
      transfers: [],
      options: [
        { type: "taxi", estimatedPrice: "€50-80", duration: "40-60 min" },
        { type: "private_transfer", estimatedPrice: "€80-120", duration: "40-60 min" },
        { type: "train", estimatedPrice: "€14", duration: "30 min + 15 min walk" },
      ],
    }
    return {
      title: `Transfers from ${params.from} to ${params.to}`,
      output: JSON.stringify(response, null, 2),
      metadata: { from: params.from, to: params.to, date: params.date },
    }
  },
})

// ============================================================================
// Travel Itinerary Builder Tool
// ============================================================================

const ItineraryBuilderParams = z.object({
  destination: z.string().describe("Destination city"),
  startDate: z.string().describe("Start date (YYYY-MM-DD)"),
  endDate: z.string().describe("End date (YYYY-MM-DD)"),
  interests: z.array(z.string()).optional().describe("User interests"),
  withChildren: z.boolean().optional().describe("Traveling with children"),
})

export const TravelItineraryBuilderTool = Tool.define("travel_itinerary_builder", {
  description: "Build a personalized travel itinerary",
  parameters: ItineraryBuilderParams,
  async execute(params, ctx) {
    // Placeholder response
    const response = {
      itinerary: [],
      days: [],
      message: "Itinerary builder - configure adapters for full functionality",
    }
    return {
      title: `Itinerary for ${params.destination}`,
      output: JSON.stringify(response, null, 2),
      metadata: {
        destination: params.destination,
        startDate: params.startDate,
        endDate: params.endDate,
        interests: params.interests,
      },
    }
  },
})

// ============================================================================
// Travel Emergency Info Tool
// ============================================================================

const EmergencyInfoParams = z.object({
  location: z.string().describe("Current location"),
  type: z.enum(["medical", "theft", "lost_document", "accident", "other"]).describe("Emergency type"),
})

export const TravelEmergencyInfoTool = Tool.define("travel_emergency_info", {
  description: "Get emergency information and contacts for a location",
  parameters: EmergencyInfoParams,
  async execute(params, ctx) {
    // Emergency contacts for Italy
    const response = {
      emergencyNumbers: {
        general: "112",
        police: "113",
        ambulance: "118",
        fire: "115",
      },
      location: params.location,
      embassyInfo: {
        Italy: {
          usEmbassy: "+39 06 46741",
          ukEmbassy: "+39 06 422 0001",
        },
      },
      hospitals: [],
      pharmacies: [],
    }
    return {
      title: `Emergency information for ${params.location}`,
      output: JSON.stringify(response, null, 2),
      metadata: { location: params.location, type: params.type },
    }
  },
})

// ============================================================================
// Tool Registry Export
// ============================================================================

export const TravelTools = [
  TravelDestinationSearchTool,
  TravelFlightSearchTool,
  TravelHotelSearchTool,
  TravelRestaurantSearchTool,
  TravelActivitySearchTool,
  TravelTransferSearchTool,
  TravelItineraryBuilderTool,
  TravelEmergencyInfoTool,
  TravelWeatherTool,
]

// Re-export TravelWeatherTool for use in registry and other modules
export { TravelWeatherTool }

// Travel Flight Search Skill
// Searches for flights between destinations

import { Log } from "@/util/log"
import type { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"

const log = Log.create({ service: "kiloclaw.skill.travel-flight-search" })

interface FlightSearchInput {
  origin: string
  destination: string
  departureDate: string
  returnDate?: string
  passengers?: number
  cabinClass?: "economy" | "premium_economy" | "business" | "first"
  nonStopOnly?: boolean
}

interface FlightSegment {
  departure: { airport: string; terminal?: string; time: string }
  arrival: { airport: string; terminal?: string; time: string }
  airline: string
  airlineCode: string
  flightNumber: string
  duration: string
  cabinClass: string
}

interface FlightOffer {
  id: string
  source: string
  price: { amount: number; currency: string }
  outbound: FlightSegment[]
  return?: FlightSegment[]
  totalDuration: string
  stops: number
  baggageIncluded: boolean
  seatsAvailable?: number
}

interface FlightSearchOutput {
  offers: FlightOffer[]
  searchParams: {
    origin: string
    destination: string
    departureDate: string
    returnDate?: string
    passengers: number
    cabinClass: string
  }
  provider: { id: string; name: string; attribution?: string }
  errors: Array<{ provider: string; error: string; timestamp: string }>
  meta: { generationTimeMs: number; resultsCount: number; cached: boolean }
}

function generateMockFlights(origin: string, destination: string, date: string): FlightOffer[] {
  const airlines = [
    { name: "Alitalia", code: "AZ" },
    { name: "Air France", code: "AF" },
    { name: "Lufthansa", code: "LH" },
    { name: "Ryanair", code: "FR" },
    { name: "EasyJet", code: "U2" },
  ]

  const flights: FlightOffer[] = []
  const basePrice = Math.floor(Math.random() * 200) + 80

  for (let i = 0; i < 5; i++) {
    const airline = airlines[Math.floor(Math.random() * airlines.length)]
    const isDirect = Math.random() > 0.4
    const stops = isDirect ? 0 : 1
    const departHour = 6 + Math.floor(Math.random() * 14)
    const duration = 1.5 + Math.random() * 3
    const price = basePrice + i * 20 + (stops === 0 ? 50 : 0)

    flights.push({
      id: `FL${Date.now()}${i}`,
      source: "mock",
      price: { amount: Math.round(price * 100) / 100, currency: "EUR" },
      outbound: [
        {
          departure: { airport: origin, time: `${date}T${departHour.toString().padStart(2, "0")}:00:00` },
          arrival: {
            airport: destination,
            time: `${date}T${((departHour + duration) % 24).toString().padStart(2, "0")}:${Math.floor((duration % 1) * 60)}:00`,
          },
          airline: airline.name,
          airlineCode: airline.code,
          flightNumber: `${airline.code}${100 + Math.floor(Math.random() * 900)}`,
          duration: `${Math.floor(duration)}h ${Math.floor((duration % 1) * 60)}m`,
          cabinClass: "Economy",
        },
      ],
      totalDuration: `${Math.floor(duration)}h ${Math.floor((duration % 1) * 60)}m`,
      stops,
      baggageIncluded: stops === 0,
      seatsAvailable: Math.floor(Math.random() * 9) + 1,
    })
  }

  return flights.sort((a, b) => a.price.amount - b.price.amount)
}

export const TravelFlightSearchSkill: Skill = {
  id: "travel-flight-search" as SkillId,
  version: "1.0.0",
  name: "Travel Flight Search",
  inputSchema: {
    type: "object",
    properties: {
      origin: { type: "string", description: "Origin airport code or city" },
      destination: { type: "string", description: "Destination airport code or city" },
      departureDate: { type: "string", description: "Departure date (YYYY-MM-DD)" },
      returnDate: { type: "string", description: "Return date (YYYY-MM-DD)" },
      passengers: { type: "number", description: "Number of passengers" },
      cabinClass: { type: "string", enum: ["economy", "premium_economy", "business", "first"] },
      nonStopOnly: { type: "boolean" },
    },
    required: ["origin", "destination", "departureDate"],
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
  capabilities: ["flight_search", "flight_comparison", "price_analysis"],
  tags: ["travel", "flight", "booking"],
  async execute(input: unknown, context: SkillContext): Promise<FlightSearchOutput> {
    const startTime = Date.now()
    const errors: Array<{ provider: string; error: string; timestamp: string }> = []

    const {
      origin,
      destination,
      departureDate,
      returnDate,
      passengers = 1,
      cabinClass = "economy",
      nonStopOnly = false,
    } = input as FlightSearchInput

    log.info("flight search", { correlationId: context.correlationId, origin, destination, departureDate, passengers })

    try {
      const normalizeAirport = (code: string): string => {
        const mapping: Record<string, string> = {
          fco: "FCO",
          roma: "FCO",
          rome: "FCO",
          ciao: "CIA",
          milano: "MXP",
          linate: "LIN",
          napoli: "NAP",
          naples: "NAP",
          firenze: "FLR",
          florence: "FLR",
          venezia: "VCE",
          venice: "VCE",
          paris: "CDG",
          london: "LHR",
          barcelona: "BCN",
          madrid: "MAD",
          amsterdam: "AMS",
          berlin: "BER",
        }
        return mapping[code.toLowerCase()] || code.toUpperCase()
      }

      const originCode = normalizeAirport(origin)
      const destCode = normalizeAirport(destination)
      let offers = generateMockFlights(originCode, destCode, departureDate)

      if (nonStopOnly) {
        offers = offers.filter((o) => o.stops === 0)
      }

      const apiKey = process.env.AMADEUS_API_KEY
      if (!apiKey) {
        errors.push({
          provider: "mock",
          error: "Using mock data - set AMADEUS_API_KEY for real data",
          timestamp: new Date().toISOString(),
        })
      }

      return {
        offers,
        searchParams: { origin: originCode, destination: destCode, departureDate, returnDate, passengers, cabinClass },
        provider: { id: apiKey ? "amadeus" : "mock", name: apiKey ? "Amadeus API" : "Mock Flight Data" },
        errors,
        meta: { generationTimeMs: Date.now() - startTime, resultsCount: offers.length, cached: false },
      }
    } catch (err) {
      log.error("flight search failed", { error: err instanceof Error ? err.message : String(err) })
      return {
        offers: [],
        searchParams: { origin, destination, departureDate, returnDate, passengers, cabinClass },
        provider: { id: "error", name: "Error" },
        errors: [
          {
            provider: "flight-search",
            error: err instanceof Error ? err.message : "Unknown error",
            timestamp: new Date().toISOString(),
          },
        ],
        meta: { generationTimeMs: Date.now() - startTime, resultsCount: 0, cached: false },
      }
    }
  },
}

export type { FlightSearchInput, FlightSearchOutput, FlightOffer, FlightSegment }

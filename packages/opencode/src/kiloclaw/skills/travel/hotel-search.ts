// Travel Hotel Search Skill
// Searches for hotels at destination

import { Log } from "@/util/log"
import type { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"

const log = Log.create({ service: "kiloclaw.skill.travel-hotel-search" })

interface HotelSearchInput {
  destination: string
  checkIn: string
  checkOut: string
  guests?: number
  rooms?: number
  rating?: number
  priceRange?: "budget" | "mid-range" | "luxury"
  amenities?: string[]
}

interface HotelOffer {
  id: string
  name: string
  address: string
  city: string
  country: string
  rating: number
  reviewScore: number
  pricePerNight: number
  totalPrice: number
  currency: string
  roomType: string
  amenities: string[]
  cancellationPolicy: string
  freeCancellation: boolean
}

interface HotelSearchOutput {
  offers: HotelOffer[]
  searchParams: {
    destination: string
    checkIn: string
    checkOut: string
    guests: number
    rooms: number
    priceRange: string
  }
  provider: { id: string; name: string }
  errors: Array<{ provider: string; error: string; timestamp: string }>
  meta: { generationTimeMs: number; resultsCount: number; nightsCount: number }
}

function generateMockHotels(destination: string, checkIn: string, checkOut: string): HotelOffer[] {
  const dest = destination.toLowerCase()
  const hotelsByCity: Record<string, HotelOffer[]> = {
    roma: [
      {
        id: "hotel-1",
        name: "Hotel Palazzo del Mare",
        address: "Via della Lungaretta 100",
        city: "Roma",
        country: "Italia",
        rating: 4,
        reviewScore: 8.5,
        pricePerNight: 180,
        totalPrice: 360,
        currency: "EUR",
        roomType: "Camera Deluxe",
        amenities: ["WiFi", "Colazione", "Aria condizionata"],
        cancellationPolicy: "Gratis fino alle 18:00",
        freeCancellation: true,
      },
      {
        id: "hotel-2",
        name: "Grand Hotel Victoria",
        address: "Via Veneto 50",
        city: "Roma",
        country: "Italia",
        rating: 5,
        reviewScore: 9.2,
        pricePerNight: 450,
        totalPrice: 900,
        currency: "EUR",
        roomType: "Suite Executive",
        amenities: ["WiFi", "Colazione", "Spa", "Piscina"],
        cancellationPolicy: "Gratis fino a 48h prima",
        freeCancellation: true,
      },
      {
        id: "hotel-3",
        name: "Hotel Trastevere Inn",
        address: "Via di Trastevere 45",
        city: "Roma",
        country: "Italia",
        rating: 3,
        reviewScore: 7.8,
        pricePerNight: 95,
        totalPrice: 190,
        currency: "EUR",
        roomType: "Camera Standard",
        amenities: ["WiFi", "Colazione"],
        cancellationPolicy: "Non rimborsabile",
        freeCancellation: false,
      },
    ],
    milano: [
      {
        id: "hotel-4",
        name: "Hotel Milano Centrale",
        address: "Piazza Duca d'Aosta 1",
        city: "Milano",
        country: "Italia",
        rating: 4,
        reviewScore: 8.4,
        pricePerNight: 200,
        totalPrice: 400,
        currency: "EUR",
        roomType: "Camera Deluxe",
        amenities: ["WiFi", "Colazione", "Palestra"],
        cancellationPolicy: "Gratis fino alle 18:00",
        freeCancellation: true,
      },
    ],
    firenze: [
      {
        id: "hotel-5",
        name: "Hotel Pitti Palace",
        address: "Via de' Pitti 22",
        city: "Firenze",
        country: "Italia",
        rating: 4,
        reviewScore: 8.7,
        pricePerNight: 220,
        totalPrice: 440,
        currency: "EUR",
        roomType: "Camera Superior",
        amenities: ["WiFi", "Colazione", "Terrazza"],
        cancellationPolicy: "Gratis fino a 72h prima",
        freeCancellation: true,
      },
    ],
    napoli: [
      {
        id: "hotel-6",
        name: "Hotel Partenope",
        address: "Via Partenope 36",
        city: "Napoli",
        country: "Italia",
        rating: 4,
        reviewScore: 8.1,
        pricePerNight: 130,
        totalPrice: 260,
        currency: "EUR",
        roomType: "Camera Matrimoniale",
        amenities: ["WiFi", "Colazione", "Vista mare"],
        cancellationPolicy: "Non rimborsabile",
        freeCancellation: false,
      },
    ],
  }

  const defaultHotels: HotelOffer[] = [
    {
      id: "hotel-def-1",
      name: "City Center Hotel",
      address: "Main Street 100",
      city: destination,
      country: "Unknown",
      rating: 4,
      reviewScore: 8.0,
      pricePerNight: 150,
      totalPrice: 300,
      currency: "EUR",
      roomType: "Camera Standard",
      amenities: ["WiFi", "Colazione"],
      cancellationPolicy: "Gratis fino alle 18:00",
      freeCancellation: true,
    },
    {
      id: "hotel-def-2",
      name: "Grand Hotel",
      address: "Royal Avenue 50",
      city: destination,
      country: "Unknown",
      rating: 5,
      reviewScore: 9.0,
      pricePerNight: 350,
      totalPrice: 700,
      currency: "EUR",
      roomType: "Suite",
      amenities: ["WiFi", "Colazione", "Spa", "Piscina"],
      cancellationPolicy: "Gratis fino a 48h prima",
      freeCancellation: true,
    },
  ]

  const hotels = hotelsByCity[dest] || defaultHotels
  const checkInDate = new Date(checkIn)
  const checkOutDate = new Date(checkOut)
  const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24))

  return hotels.map((h) => ({ ...h, totalPrice: h.pricePerNight * Math.max(1, nights) }))
}

export const TravelHotelSearchSkill: Skill = {
  id: "travel-hotel-search" as SkillId,
  version: "1.0.0",
  name: "Travel Hotel Search",
  inputSchema: {
    type: "object",
    properties: {
      destination: { type: "string" },
      checkIn: { type: "string" },
      checkOut: { type: "string" },
      guests: { type: "number" },
      rooms: { type: "number" },
      rating: { type: "number", minimum: 1, maximum: 5 },
      priceRange: { type: "string", enum: ["budget", "mid-range", "luxury"] },
      amenities: { type: "array", items: { type: "string" } },
    },
    required: ["destination", "checkIn", "checkOut"],
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
  capabilities: ["hotel_search", "hotel_comparison", "price_analysis"],
  tags: ["travel", "hotel", "accommodation"],
  async execute(input: unknown, context: SkillContext): Promise<HotelSearchOutput> {
    const startTime = Date.now()
    const errors: Array<{ provider: string; error: string; timestamp: string }> = []
    const {
      destination,
      checkIn,
      checkOut,
      guests = 2,
      rooms = 1,
      rating,
      priceRange,
      amenities = [],
    } = input as HotelSearchInput

    log.info("hotel search", { correlationId: context.correlationId, destination, checkIn, checkOut })

    try {
      const checkInDate = new Date(checkIn)
      const checkOutDate = new Date(checkOut)
      const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24))

      if (nights < 1) {
        return {
          offers: [],
          searchParams: { destination, checkIn, checkOut, guests, rooms, priceRange: priceRange || "mid-range" },
          provider: { id: "validation", name: "Validation Error" },
          errors: [
            {
              provider: "hotel-search",
              error: "Check-out must be after check-in",
              timestamp: new Date().toISOString(),
            },
          ],
          meta: { generationTimeMs: Date.now() - startTime, resultsCount: 0, nightsCount: 0 },
        }
      }

      let offers = generateMockHotels(destination, checkIn, checkOut)

      if (rating) offers = offers.filter((h) => h.rating >= rating)
      if (priceRange) {
        const ranges: Record<string, { min: number; max: number }> = {
          budget: { min: 0, max: 120 },
          "mid-range": { min: 100, max: 250 },
          luxury: { min: 200, max: 1000 },
        }
        const range = ranges[priceRange]
        if (range) offers = offers.filter((h) => h.pricePerNight >= range.min && h.pricePerNight <= range.max)
      }

      return {
        offers,
        searchParams: { destination, checkIn, checkOut, guests, rooms, priceRange: priceRange || "mid-range" },
        provider: { id: "mock", name: "Mock Hotel Data" },
        errors,
        meta: { generationTimeMs: Date.now() - startTime, resultsCount: offers.length, nightsCount: nights },
      }
    } catch (err) {
      log.error("hotel search failed", { error: err instanceof Error ? err.message : String(err) })
      return {
        offers: [],
        searchParams: { destination, checkIn, checkOut, guests, rooms, priceRange: priceRange || "mid-range" },
        provider: { id: "error", name: "Error" },
        errors: [
          {
            provider: "hotel-search",
            error: err instanceof Error ? err.message : "Unknown error",
            timestamp: new Date().toISOString(),
          },
        ],
        meta: { generationTimeMs: Date.now() - startTime, resultsCount: 0, nightsCount: 0 },
      }
    }
  },
}

export type { HotelSearchInput, HotelSearchOutput, HotelOffer }

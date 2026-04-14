// Travel Booking Manager - Deep-link generation and tracking
import { Log } from "@/util/log"
import * as z from "zod"

const log = Log.create({ service: "travel.booking" })

// ============================================================================
// Booking Link Types
// ============================================================================

export interface BookingRequest {
  type: "flight" | "hotel" | "activity" | "event" | "restaurant"
  provider: string
  offerId: string
  price: number
  currency: string
  expiresAt?: string
  metadata?: Record<string, unknown>
}

export interface BookingLink {
  id: string
  type: BookingRequest["type"]
  provider: string
  url: string
  price: number
  currency: string
  expiresAt?: string
  createdAt: string
  clickCount: number
  conversionTracked: boolean
}

// ============================================================================
// Input Schema
// ============================================================================

export const GenerateBookingLinksInput = z.object({
  flights: z
    .array(
      z.object({
        offerId: z.string(),
        provider: z.string(),
        price: z.number(),
        currency: z.string(),
        origin: z.string(),
        destination: z.string(),
        departureTime: z.string(),
      }),
    )
    .optional(),
  hotels: z
    .array(
      z.object({
        offerId: z.string(),
        provider: z.string(),
        pricePerNight: z.number(),
        currency: z.string(),
        name: z.string(),
        city: z.string(),
      }),
    )
    .optional(),
  activities: z
    .array(
      z.object({
        offerId: z.string(),
        provider: z.string(),
        price: z.number(),
        currency: z.string(),
        name: z.string(),
        city: z.string(),
      }),
    )
    .optional(),
})

export type GenerateBookingLinksInput = z.infer<typeof GenerateBookingLinksInput>

// ============================================================================
// Booking Link Manager
// ============================================================================

export class BookingLinkManager {
  private links: Map<string, BookingLink> = new Map()

  // Generate deep-links for all offers
  generateLinks(input: GenerateBookingLinksInput): BookingLink[] {
    const generatedLinks: BookingLink[] = []

    // Generate flight links
    if (input.flights) {
      for (const flight of input.flights) {
        const link = this.createFlightLink(flight)
        generatedLinks.push(link)
        this.links.set(link.id, link)
      }
    }

    // Generate hotel links
    if (input.hotels) {
      for (const hotel of input.hotels) {
        const link = this.createHotelLink(hotel)
        generatedLinks.push(link)
        this.links.set(link.id, link)
      }
    }

    // Generate activity links
    if (input.activities) {
      for (const activity of input.activities) {
        const link = this.createActivityLink(activity)
        generatedLinks.push(link)
        this.links.set(link.id, link)
      }
    }

    log.info("Generated booking links", { count: generatedLinks.length })
    return generatedLinks
  }

  // Create flight booking link
  private createFlightLink(flight: {
    offerId: string
    provider: string
    price: number
    currency: string
    origin: string
    destination: string
    departureTime: string
  }): BookingLink {
    const providerUrls: Record<string, (f: typeof flight) => string> = {
      amadeus: (f) =>
        `https://www.google.com/flights?tl=partner&f=${f.origin.toLowerCase()}&d=${f.destination.toLowerCase()}&dt=${f.departureTime.split("T")[0]}`,
      generic: (f) => `https://www.google.com/flights?q=flights+from+${f.origin}+to+${f.destination}`,
    }

    return {
      id: `flight-${crypto.randomUUID()}`,
      type: "flight",
      provider: flight.provider,
      url: providerUrls[flight.provider]?.(flight) || providerUrls.generic(flight),
      price: flight.price,
      currency: flight.currency,
      createdAt: new Date().toISOString(),
      clickCount: 0,
      conversionTracked: false,
    }
  }

  // Create hotel booking link
  private createHotelLink(hotel: {
    offerId: string
    provider: string
    pricePerNight: number
    currency: string
    name: string
    city: string
  }): BookingLink {
    const providerUrls: Record<string, (h: typeof hotel) => string> = {
      amadeus: (h) => `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(h.name)}`,
      booking: (h) => `https://www.booking.com/hotel/search.html?dest=${encodeURIComponent(h.city)}`,
      generic: (h) =>
        `https://www.google.com/travel/hotels?q=${encodeURIComponent(h.name)}+${encodeURIComponent(h.city)}`,
    }

    return {
      id: `hotel-${crypto.randomUUID()}`,
      type: "hotel",
      provider: hotel.provider,
      url: providerUrls[hotel.provider]?.(hotel) || providerUrls.generic(hotel),
      price: hotel.pricePerNight,
      currency: hotel.currency,
      createdAt: new Date().toISOString(),
      clickCount: 0,
      conversionTracked: false,
    }
  }

  // Create activity booking link
  private createActivityLink(activity: {
    offerId: string
    provider: string
    price: number
    currency: string
    name: string
    city: string
  }): BookingLink {
    const providerUrls: Record<string, (a: typeof activity) => string> = {
      ticketmaster: (a) => `https://www.ticketmaster.com/search?q=${encodeURIComponent(a.name)}`,
      amadeus: (a) => `https://www.getyourguide.com/${encodeURIComponent(a.city)}/tours/`,
      google_places: (a) =>
        `https://www.google.com/maps/search/activities+${encodeURIComponent(a.name)}+${encodeURIComponent(a.city)}`,
      generic: (a) =>
        `https://www.google.com/search?q=book+${encodeURIComponent(a.name)}+${encodeURIComponent(a.city)}`,
    }

    return {
      id: `activity-${crypto.randomUUID()}`,
      type: "activity",
      provider: activity.provider,
      url: providerUrls[activity.provider]?.(activity) || providerUrls.generic(activity),
      price: activity.price,
      currency: activity.currency,
      createdAt: new Date().toISOString(),
      clickCount: 0,
      conversionTracked: false,
    }
  }

  // Track link click
  trackClick(linkId: string): void {
    const link = this.links.get(linkId)
    if (link) {
      link.clickCount++
      log.info("Booking link clicked", { linkId, clickCount: link.clickCount })
    }
  }

  // Get all links
  getAllLinks(): BookingLink[] {
    return Array.from(this.links.values())
  }

  // Get link by ID
  getLink(linkId: string): BookingLink | undefined {
    return this.links.get(linkId)
  }
}

// ============================================================================
// Skill Namespace
// ============================================================================

export namespace BookingSkills {
  const log = Log.create({ service: "travel.booking.skill" })
  const manager = new BookingLinkManager()

  // Generate booking links for travel offers
  export async function generateBookingLinks(input: GenerateBookingLinksInput): Promise<BookingLink[]> {
    log.info("Generating booking links", { input })
    return manager.generateLinks(input)
  }

  // Track booking link click
  export async function trackClick(linkId: string): Promise<void> {
    manager.trackClick(linkId)
  }

  // Get all generated links
  export async function getAllLinks(): Promise<BookingLink[]> {
    return manager.getAllLinks()
  }
}

export const bookingManager = BookingSkills

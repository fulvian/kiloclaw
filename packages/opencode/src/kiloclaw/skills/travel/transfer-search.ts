// Travel Transfer Search Skill
// Searches for airport transfers and ground transportation

import { Log } from "@/util/log"
import type { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"

const log = Log.create({ service: "kiloclaw.skill.travel-transfer-search" })

interface TransferSearchInput {
  from: string
  to: string
  date: string
  time?: string
  passengers?: number
  vehicleType?: "standard" | "luxury" | "van" | "bus"
}

interface TransferOffer {
  id: string
  type: "private" | "shared" | "public"
  provider: string
  vehicleType: string
  price: number
  currency: string
  duration: string
  distance?: number
  pickup: { address: string; time: string }
  dropoff: { address: string; time: string }
  features: string[]
  freeCancellation: boolean
}

interface TransferSearchOutput {
  offers: TransferOffer[]
  searchParams: { from: string; to: string; date: string; time?: string; passengers: number; vehicleType: string }
  provider: { id: string; name: string }
  errors: Array<{ provider: string; error: string; timestamp: string }>
  meta: { generationTimeMs: number; resultsCount: number }
}

function generateMockTransfers(from: string, to: string, date: string): TransferOffer[] {
  const isRome =
    from.toLowerCase().includes("fiumicino") ||
    from.toLowerCase().includes("fco") ||
    from.toLowerCase().includes("roma") ||
    to.toLowerCase().includes("fiumicino") ||
    to.toLowerCase().includes("fco") ||
    to.toLowerCase().includes("roma")

  const transfers: TransferOffer[] = []

  if (isRome) {
    transfers.push(
      {
        id: "transfer-1",
        type: "public",
        provider: "Trenitalia",
        vehicleType: "Train",
        price: 14,
        currency: "EUR",
        duration: "32 min",
        distance: 30,
        pickup: { address: "Fiumicino Airport", time: `${date}T06:00:00` },
        dropoff: { address: "Roma Termini", time: `${date}T06:32:00` },
        features: ["Air conditioning", "WiFi"],
        freeCancellation: false,
      },
      {
        id: "transfer-2",
        type: "shared",
        provider: "TerraVision",
        vehicleType: "Bus",
        price: 7,
        currency: "EUR",
        duration: "55 min",
        distance: 35,
        pickup: { address: "Fiumicino Airport", time: `${date}T08:00:00` },
        dropoff: { address: "Roma Termini", time: `${date}T08:55:00` },
        features: ["Air conditioning", "WiFi", "XL luggage"],
        freeCancellation: true,
      },
      {
        id: "transfer-3",
        type: "private",
        provider: "Welcome Limousine",
        vehicleType: "Sedan",
        price: 55,
        currency: "EUR",
        duration: "40 min",
        distance: 30,
        pickup: { address: "Fiumicino Airport", time: `${date}T10:00:00` },
        dropoff: { address: "City Center", time: `${date}T10:40:00` },
        features: ["Meet & greet", "Flight tracking", "Free waiting 60min"],
        freeCancellation: true,
      },
      {
        id: "transfer-4",
        type: "private",
        provider: "Black Lane",
        vehicleType: "Mercedes E-Class",
        price: 89,
        currency: "EUR",
        duration: "35 min",
        distance: 28,
        pickup: { address: "Fiumicino Airport", time: `${date}T10:00:00` },
        dropoff: { address: "Roma City Center", time: `${date}T10:35:00` },
        features: ["Premium sedan", "Champagne", "WiFi"],
        freeCancellation: true,
      },
      {
        id: "transfer-5",
        type: "private",
        provider: "Rome Airport Shuttle",
        vehicleType: "Van (up to 8 passengers)",
        price: 75,
        currency: "EUR",
        duration: "45 min",
        distance: 32,
        pickup: { address: "Fiumicino Airport", time: `${date}T10:15:00` },
        dropoff: { address: "Hotel District", time: `${date}T11:00:00` },
        features: ["Child seats available", "Large luggage"],
        freeCancellation: true,
      },
    )
  } else {
    transfers.push({
      id: "transfer-generic-1",
      type: "private",
      provider: "Local Transfer",
      vehicleType: "Sedan",
      price: 50,
      currency: "EUR",
      duration: "45 min",
      distance: 25,
      pickup: { address: from, time: `${date}T12:00:00` },
      dropoff: { address: to, time: `${date}T12:45:00` },
      features: ["Air conditioning"],
      freeCancellation: true,
    })
  }

  return transfers
}

export const TravelTransferSearchSkill: Skill = {
  id: "travel-transfer-search" as SkillId,
  version: "1.0.0",
  name: "Travel Transfer Search",
  inputSchema: {
    type: "object",
    properties: {
      from: { type: "string" },
      to: { type: "string" },
      date: { type: "string" },
      time: { type: "string" },
      passengers: { type: "number" },
      vehicleType: { type: "string", enum: ["standard", "luxury", "van", "bus"] },
    },
    required: ["from", "to", "date"],
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
  capabilities: ["transfer_search", "transport_comparison", "pricing_info"],
  tags: ["travel", "transfer", "transport"],
  async execute(input: unknown, context: SkillContext): Promise<TransferSearchOutput> {
    const startTime = Date.now()
    const errors: Array<{ provider: string; error: string; timestamp: string }> = []
    const { from, to, date, time, passengers = 2, vehicleType = "standard" } = input as TransferSearchInput

    log.info("transfer search", { correlationId: context.correlationId, from, to, date, passengers })

    try {
      let offers = generateMockTransfers(from, to, date)

      if (vehicleType !== "standard") {
        const typeMap: Record<string, string[]> = {
          luxury: ["Mercedes E-Class"],
          van: ["Van (up to 8 passengers)"],
          bus: ["Bus"],
        }
        const allowed = typeMap[vehicleType] || []
        if (allowed.length > 0) offers = offers.filter((o) => allowed.includes(o.vehicleType))
      }

      offers.sort((a, b) => a.price - b.price)

      return {
        offers,
        searchParams: { from, to, date, time, passengers, vehicleType },
        provider: { id: "internal", name: "Transfer Database" },
        errors,
        meta: { generationTimeMs: Date.now() - startTime, resultsCount: offers.length },
      }
    } catch (err) {
      log.error("transfer search failed", { error: err instanceof Error ? err.message : String(err) })
      return {
        offers: [],
        searchParams: { from, to, date, time, passengers, vehicleType },
        provider: { id: "error", name: "Error" },
        errors: [
          {
            provider: "transfer-search",
            error: err instanceof Error ? err.message : "Unknown error",
            timestamp: new Date().toISOString(),
          },
        ],
        meta: { generationTimeMs: Date.now() - startTime, resultsCount: 0 },
      }
    }
  },
}

export type { TransferSearchInput, TransferSearchOutput, TransferOffer }

// Travel Itinerary Builder Skill
// Builds complete travel itineraries combining all travel components

import { Log } from "@/util/log"
import type { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"

const log = Log.create({ service: "kiloclaw.skill.travel-itinerary-builder" })

interface ItineraryInput {
  destination: string
  startDate: string
  endDate: string
  travelers?: number
  hasChildren?: boolean
  childAges?: number[]
  interests?: string[]
  budget?: "budget" | "mid-range" | "luxury"
}

interface Activity {
  time: string
  title: string
  description: string
  duration: string
  location: string
  category: "transfer" | "activity" | "meal" | "relax"
  bookingRequired?: boolean
  cost?: number
  tips?: string[]
}

interface DayPlan {
  day: number
  date: string
  dayName: string
  theme?: string
  activities: Activity[]
  meals: { breakfast?: string; lunch?: string; dinner?: string }
}

interface TravelItineraryOutput {
  itinerary: {
    destination: string
    startDate: string
    endDate: string
    totalDays: number
    travelers: number
    totalEstimatedCost: number
    currency: string
    days: DayPlan[]
  }
  summary: {
    highlights: string[]
    practicalInfo: string[]
    packingSuggestions: string[]
  }
  provider: { id: string; name: string }
  errors: Array<{ provider: string; error: string; timestamp: string }>
  meta: { generationTimeMs: number }
}

const ROME_ITINERARY_TEMPLATE: Omit<DayPlan, "date" | "dayName">[] = [
  {
    day: 1,
    theme: "Arrivo e centro storico",
    activities: [
      {
        time: "10:00",
        title: "Transfer Aeroporto → Hotel",
        description: "Trasferimento privato",
        duration: "45 min",
        location: "Fiumicino → Villa Pamphili",
        category: "transfer",
        cost: 55,
        bookingRequired: true,
      },
      {
        time: "12:00",
        title: "Check-in Hotel",
        description: "Hotel con giardini",
        duration: "30 min",
        location: "Villa Pamphili",
        category: "relax",
      },
      {
        time: "13:00",
        title: "Pranzo a Trastevere",
        description: "Pasta e pizza",
        duration: "1.5h",
        location: "Trastevere",
        category: "meal",
        tips: ["Prova la carbonara da Da Enzo"],
      },
      {
        time: "15:00",
        title: "Passeggiata al Gianicolo",
        description: "Panoramica su Roma",
        duration: "1.5h",
        location: "Gianicolo",
        category: "activity",
        tips: ["Porta un gelato"],
      },
      {
        time: "19:30",
        title: "Cena a Trastevere",
        description: "Cucina romana",
        duration: "2h",
        location: "Via della Lungaretta",
        category: "meal",
      },
    ],
    meals: { breakfast: "In hotel", lunch: "Trastevere", dinner: "Via della Lungaretta" },
  },
  {
    day: 2,
    theme: "Vaticano e centro",
    activities: [
      {
        time: "08:00",
        title: "Colazione in hotel",
        description: "Buffet",
        duration: "45 min",
        location: "Villa Pamphili",
        category: "meal",
      },
      {
        time: "09:00",
        title: "Musei Vaticani e Cappella Sistina",
        description: "Tour guidato skip-the-line",
        duration: "3.5h",
        location: "Musei Vaticani",
        category: "activity",
        bookingRequired: true,
        cost: 45,
      },
      {
        time: "13:00",
        title: "Pranzo near Vatican",
        description: "Ristorante",
        duration: "1.5h",
        location: "Prati",
        category: "meal",
      },
      {
        time: "15:00",
        title: "Basilica di San Pietro",
        description: "Visita alla Basilica",
        duration: "1.5h",
        location: "San Pietro",
        category: "activity",
        tips: ["Vestiti con maniche lunghe"],
      },
      {
        time: "17:00",
        title: "Castello di San Angelo",
        description: "Fortezza papale",
        duration: "1.5h",
        location: "Castello di San Angelo",
        category: "activity",
      },
      {
        time: "20:30",
        title: "Cena in centro",
        description: "Ristorante",
        duration: "2h",
        location: "Piazza Navona",
        category: "meal",
      },
    ],
    meals: { breakfast: "In hotel", lunch: "Prati", dinner: "Piazza Navona" },
  },
  {
    day: 3,
    theme: "Antica Roma e trasferimento",
    activities: [
      {
        time: "08:30",
        title: "Colazione in hotel",
        description: "Pranzo al sacco",
        duration: "30 min",
        location: "Villa Pamphili",
        category: "meal",
      },
      {
        time: "09:30",
        title: "Colosseo e Foro Romano",
        description: "Tour guidato 3h",
        duration: "3h",
        location: "Colosseo",
        category: "activity",
        bookingRequired: true,
        cost: 65,
        tips: ["Scarpe comode OBBLIGATORIE"],
      },
      {
        time: "13:00",
        title: "Pranzo al Ghetto",
        description: "Specialità romane",
        duration: "1.5h",
        location: "Ghetto Ebraico",
        category: "meal",
      },
      {
        time: "15:00",
        title: "Check-out",
        description: "Consegna bagagli",
        duration: "30 min",
        location: "Villa Pamphili",
        category: "relax",
      },
      {
        time: "16:00",
        title: "Transfer → Monte Mario",
        description: "Auto privata",
        duration: "30 min",
        location: "Monte Mario",
        category: "transfer",
        cost: 25,
      },
      {
        time: "17:00",
        title: "Check-in Hotel",
        description: "Vista panoramica",
        duration: "30 min",
        location: "Monte Mario",
        category: "relax",
      },
      {
        time: "20:30",
        title: "Cena",
        description: "Ristorante",
        duration: "2h",
        location: "Monte Mario",
        category: "meal",
      },
    ],
    meals: { breakfast: "In hotel", lunch: "Ghetto", dinner: "Monte Mario" },
  },
  {
    day: 4,
    theme: "Partenza",
    activities: [
      {
        time: "08:30",
        title: "Colazione in hotel",
        description: "Ultimo mattino",
        duration: "45 min",
        location: "Monte Mario",
        category: "meal",
      },
      {
        time: "10:00",
        title: "Tempo libero",
        description: "Shopping o visite",
        duration: "2h",
        location: "Centro",
        category: "activity",
      },
      {
        time: "12:30",
        title: "Pranzo pre-partenza",
        description: "Gelato",
        duration: "1h",
        location: "Piazza Navona",
        category: "meal",
        tips: ["Prova Gelateria del Teatro"],
      },
      {
        time: "14:00",
        title: "Check-out",
        description: "Consegna bagagli",
        duration: "30 min",
        location: "Monte Mario",
        category: "relax",
      },
      {
        time: "15:00",
        title: "Transfer → Aeroporto",
        description: "Auto privata o treno",
        duration: "40-60 min",
        location: "Fiumicino Airport",
        category: "transfer",
        bookingRequired: true,
        cost: 55,
      },
    ],
    meals: { breakfast: "In hotel", lunch: "Piazza Navona", dinner: "N/A - in volo" },
  },
]

export const TravelItineraryBuilderSkill: Skill = {
  id: "travel-itinerary-builder" as SkillId,
  version: "1.0.0",
  name: "Travel Itinerary Builder",
  inputSchema: {
    type: "object",
    properties: {
      destination: { type: "string" },
      startDate: { type: "string" },
      endDate: { type: "string" },
      travelers: { type: "number" },
      hasChildren: { type: "boolean" },
      childAges: { type: "array", items: { type: "number" } },
      interests: { type: "array", items: { type: "string" } },
      budget: { type: "string", enum: ["budget", "mid-range", "luxury"] },
    },
    required: ["destination", "startDate", "endDate"],
  },
  outputSchema: {
    type: "object",
    properties: {
      itinerary: { type: "object" },
      summary: { type: "object" },
      provider: { type: "object" },
      errors: { type: "array" },
      meta: { type: "object" },
    },
  },
  capabilities: ["itinerary_building", "day_planning", "schedule_optimization", "cost_estimation"],
  tags: ["travel", "itinerary", "planning", "schedule"],
  async execute(input: unknown, context: SkillContext): Promise<TravelItineraryOutput> {
    const startTime = Date.now()
    const errors: Array<{ provider: string; error: string; timestamp: string }> = []
    const {
      destination,
      startDate,
      endDate,
      travelers = 2,
      hasChildren = false,
      childAges = [],
      budget = "mid-range",
    } = input as ItineraryInput

    log.info("itinerary builder", { correlationId: context.correlationId, destination, startDate, endDate, travelers })

    try {
      const start = new Date(startDate)
      const end = new Date(endDate)
      const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1

      const destNormalized = destination.toLowerCase()
      let days: DayPlan[] = []

      if (destNormalized.includes("roma") || destNormalized.includes("rome")) {
        const templateDays = ROME_ITINERARY_TEMPLATE.slice(0, totalDays)
        days = templateDays.map((d, i) => {
          const dayDate = new Date(start)
          dayDate.setDate(dayDate.getDate() + i)
          return {
            ...d,
            date: dayDate.toISOString().split("T")[0],
            dayName: dayDate.toLocaleDateString("it-IT", { weekday: "long" }),
          }
        })
      } else {
        for (let i = 0; i < totalDays; i++) {
          const dayDate = new Date(start)
          dayDate.setDate(dayDate.getDate() + i)
          days.push({
            day: i + 1,
            date: dayDate.toISOString().split("T")[0],
            dayName: dayDate.toLocaleDateString("it-IT", { weekday: "long" }),
            activities: [
              {
                time: "09:00",
                title: `Giorno ${i + 1} - Mattina`,
                description: "Attività",
                duration: "3h",
                location: destination,
                category: "activity",
              },
              {
                time: "13:00",
                title: "Pranzo",
                description: "Pausa",
                duration: "1.5h",
                location: destination,
                category: "meal",
              },
              {
                time: "15:00",
                title: `Giorno ${i + 1} - Pomeriggio`,
                description: "Attività",
                duration: "3h",
                location: destination,
                category: "activity",
              },
              {
                time: "20:00",
                title: "Cena",
                description: "Ristorante",
                duration: "2h",
                location: destination,
                category: "meal",
              },
            ],
            meals: { breakfast: "Da definire", lunch: "Da definire", dinner: "Da definire" },
          })
        }
        errors.push({
          provider: "template",
          error: `Generic template for ${destination}`,
          timestamp: new Date().toISOString(),
        })
      }

      let totalCost = 0
      days.forEach((day) => {
        day.activities.forEach((a) => {
          if (a.cost) totalCost += a.cost * travelers
        })
      })
      totalCost += 110 * 2

      const hotelNights = totalDays - 1
      const hotelRates: Record<string, number> = { budget: 80, "mid-range": 180, luxury: 400 }
      totalCost += (hotelRates[budget] || 180) * hotelNights

      return {
        itinerary: {
          destination,
          startDate,
          endDate,
          totalDays,
          travelers,
          totalEstimatedCost: Math.round(totalCost * 100) / 100,
          currency: "EUR",
          days,
        },
        summary: {
          highlights: [
            `${totalDays} giorni a ${destination}`,
            `${travelers} viaggiatori`,
            hasChildren ? `Con bambini di ${childAges.join(", ")} anni` : "Viaggio per adulti",
            `Budget: ${budget}`,
          ],
          practicalInfo: [
            "Transfer da/a aeroporto prenotati",
            "Biglietti skip-the-line per attrazioni principali",
            "Ristoranti consigliati con prenotazione",
          ],
          packingSuggestions: [
            "Abbigliamento a strati",
            "Scarpe comode per camminare",
            hasChildren ? "Pannolini e crema solare" : "",
            "Adattatore prese elettriche",
          ].filter(Boolean),
        },
        provider: { id: "internal", name: "Itinerary Builder" },
        errors,
        meta: { generationTimeMs: Date.now() - startTime },
      }
    } catch (err) {
      log.error("itinerary builder failed", { error: err instanceof Error ? err.message : String(err) })
      return {
        itinerary: {
          destination,
          startDate,
          endDate,
          totalDays: 0,
          travelers,
          totalEstimatedCost: 0,
          currency: "EUR",
          days: [],
        },
        summary: { highlights: [], practicalInfo: [], packingSuggestions: [] },
        provider: { id: "error", name: "Error" },
        errors: [
          {
            provider: "itinerary-builder",
            error: err instanceof Error ? err.message : "Unknown error",
            timestamp: new Date().toISOString(),
          },
        ],
        meta: { generationTimeMs: Date.now() - startTime },
      }
    }
  },
}

export type { ItineraryInput, TravelItineraryOutput, DayPlan }

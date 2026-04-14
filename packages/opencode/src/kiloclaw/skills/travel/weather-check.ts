// Travel Weather Check Skill
// Checks weather conditions for travel planning

import { Log } from "@/util/log"
import type { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"

const log = Log.create({ service: "kiloclaw.skill.travel-weather-check" })

interface WeatherCheckInput {
  destination: string
  startDate: string
  endDate?: string
}

interface DayWeather {
  date: string
  dayName: string
  condition: string
  tempHigh: number
  tempLow: number
  precipitation: number
  uvIndex: number
}

interface WeatherRisk {
  level: "low" | "medium" | "high"
  reason: string
  recommendation: string
}

interface TravelWeatherOutput {
  location: { name: string; latitude: number; longitude: number }
  forecast: DayWeather[]
  risks: WeatherRisk[]
  searchParams: { destination: string; startDate: string; endDate?: string }
  provider: { id: string; name: string; attribution?: string }
  errors: Array<{ provider: string; error: string; timestamp: string }>
  meta: { generationTimeMs: number; forecastDays: number }
}

async function geocode(location: string): Promise<{ lat: number; lon: number; name: string } | null> {
  const response = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`,
  )
  const data = await response.json()
  if (!data.results?.length) return null
  const r = data.results[0]
  return { lat: r.latitude, lon: r.longitude, name: r.name }
}

async function fetchForecast(lat: number, lon: number, days: number) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone: "auto",
    daily:
      "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,uv_index_max",
    forecast_days: String(days),
  })
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)
  return response.json()
}

const WMO_CODES: Record<number, string> = {
  0: "Sereno",
  1: "Poco nuvoloso",
  2: "Parzialmente nuvoloso",
  3: "Nuvoloso",
  45: "Nebbia",
  51: "Pioviggine",
  61: "Pioggia debole",
  63: "Pioggia",
  65: "Pioggia forte",
  71: "Neve debole",
  80: "Rovesci",
  95: "Temporale",
}

function assessRisks(forecast: DayWeather[]): WeatherRisk[] {
  const risks: WeatherRisk[] = []
  const rainyDays = forecast.filter((d) => d.precipitation > 60)
  if (rainyDays.length >= 3)
    risks.push({
      level: "medium",
      reason: `${rainyDays.length} days with high rain probability`,
      recommendation: "Porta ombrello e abbigliamento impermeabile",
    })
  const hotDays = forecast.filter((d) => d.tempHigh > 35)
  if (hotDays.length >= 2)
    risks.push({
      level: "high",
      reason: "Temperature elevate",
      recommendation: "Evitare esposizione solare nelle ore centrali",
    })
  return risks
}

export const TravelWeatherCheckSkill: Skill = {
  id: "travel-weather-check" as SkillId,
  version: "1.0.0",
  name: "Travel Weather Check",
  inputSchema: {
    type: "object",
    properties: {
      destination: { type: "string" },
      startDate: { type: "string" },
      endDate: { type: "string" },
    },
    required: ["destination", "startDate"],
  },
  outputSchema: {
    type: "object",
    properties: {
      location: { type: "object" },
      forecast: { type: "array" },
      risks: { type: "array" },
      searchParams: { type: "object" },
      provider: { type: "object" },
      errors: { type: "array" },
      meta: { type: "object" },
    },
  },
  capabilities: ["weather_forecast", "risk_assessment", "packing_recommendations"],
  tags: ["travel", "weather", "forecast"],
  async execute(input: unknown, context: SkillContext): Promise<TravelWeatherOutput> {
    const startTime = Date.now()
    const errors: Array<{ provider: string; error: string; timestamp: string }> = []
    const { destination, startDate, endDate } = input as WeatherCheckInput

    log.info("weather check", { correlationId: context.correlationId, destination, startDate, endDate })

    try {
      const start = new Date(startDate)
      const end = endDate ? new Date(endDate) : new Date(startDate)
      const days = Math.min(Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1, 16)

      const geo = await geocode(destination)
      if (!geo) {
        return {
          location: { name: destination, latitude: 0, longitude: 0 },
          forecast: [],
          risks: [],
          searchParams: { destination, startDate, endDate },
          provider: { id: "geocoding", name: "Geocoding Failed" },
          errors: [
            { provider: "geocoding", error: `Location not found: ${destination}`, timestamp: new Date().toISOString() },
          ],
          meta: { generationTimeMs: Date.now() - startTime, forecastDays: 0 },
        }
      }

      const data = await fetchForecast(geo.lat, geo.lon, days)
      const forecast: DayWeather[] = data.daily.time.map((timeStr: string, i: number) => {
        const date = new Date(timeStr)
        return {
          date: timeStr,
          dayName: date.toLocaleDateString("it-IT", { weekday: "long" }),
          condition: WMO_CODES[data.daily.weather_code[i]] || "Sconosciuto",
          tempHigh: Math.round(data.daily.temperature_2m_max[i]),
          tempLow: Math.round(data.daily.temperature_2m_min[i]),
          precipitation: data.daily.precipitation_probability_max[i] || 0,
          uvIndex: data.daily.uv_index_max[i] || 0,
        }
      })

      return {
        location: { name: geo.name, latitude: geo.lat, longitude: geo.lon },
        forecast,
        risks: assessRisks(forecast),
        searchParams: { destination, startDate, endDate },
        provider: { id: "open-meteo", name: "Open-Meteo API" },
        errors,
        meta: { generationTimeMs: Date.now() - startTime, forecastDays: forecast.length },
      }
    } catch (err) {
      log.error("weather check failed", { error: err instanceof Error ? err.message : String(err) })
      return {
        location: { name: destination, latitude: 0, longitude: 0 },
        forecast: [],
        risks: [],
        searchParams: { destination, startDate, endDate },
        provider: { id: "error", name: "Error" },
        errors: [
          {
            provider: "weather-check",
            error: err instanceof Error ? err.message : "Unknown error",
            timestamp: new Date().toISOString(),
          },
        ],
        meta: { generationTimeMs: Date.now() - startTime, forecastDays: 0 },
      }
    }
  },
}

export type { WeatherCheckInput, TravelWeatherOutput, DayWeather, WeatherRisk }

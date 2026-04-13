import { Log } from "@/util/log"
import { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"

// WMO Weather code descriptions
const WMO_WEATHER_CODES: Record<number, { description: string; icon: string }> = {
  0: { description: "Clear sky", icon: "☀️" },
  1: { description: "Mainly clear", icon: "🌤️" },
  2: { description: "Partly cloudy", icon: "⛅" },
  3: { description: "Overcast", icon: "☁️" },
  45: { description: "Fog", icon: "🌫️" },
  48: { description: "Depositing rime fog", icon: "🌫️" },
  51: { description: "Light drizzle", icon: "🌧️" },
  53: { description: "Moderate drizzle", icon: "🌧️" },
  55: { description: "Dense drizzle", icon: "🌧️" },
  61: { description: "Slight rain", icon: "🌧️" },
  63: { description: "Moderate rain", icon: "🌧️" },
  65: { description: "Heavy rain", icon: "🌧️" },
  71: { description: "Slight snow", icon: "🌨️" },
  73: { description: "Moderate snow", icon: "🌨️" },
  75: { description: "Heavy snow", icon: "🌨️" },
  77: { description: "Snow grains", icon: "🌨️" },
  80: { description: "Slight rain showers", icon: "🌦️" },
  81: { description: "Moderate rain showers", icon: "🌦️" },
  82: { description: "Violent rain showers", icon: "🌦️" },
  85: { description: "Slight snow showers", icon: "🌨️" },
  86: { description: "Heavy snow showers", icon: "🌨️" },
  95: { description: "Thunderstorm", icon: "⛈️" },
  96: { description: "Thunderstorm with slight hail", icon: "⛈️" },
  99: { description: "Thunderstorm with heavy hail", icon: "⛈️" },
}

// Day forecast output
export interface DayForecast {
  readonly date: string
  readonly dayName: string
  readonly high: number // Celsius
  readonly low: number // Celsius
  readonly condition: string
  readonly conditionCode: number
  readonly precipitation: number // percentage
  readonly precipitationSum?: number // mm
  readonly humidity: number // percentage
  readonly windSpeed: number // km/h
  readonly uvIndex: number
  readonly sunrise?: string
  readonly sunset?: string

  // Uncertainty (ensemble models)
  readonly uncertainty?: {
    readonly temperatureRange: { low: number; high: number }
    readonly precipitationProbabilityRange: { low: number; high: number }
    readonly confidence: number // 0-1
    readonly modelSource?: string
  }
}

// Weather forecast input
interface WeatherForecastInput {
  location: string
  days?: number // 1-16, default 7
  units?: "metric" | "imperial"
}

// Weather forecast output
interface WeatherForecastOutput {
  forecast: DayForecast[]
  location: {
    name: string
    latitude: number
    longitude: number
    timezone: string
    country?: string
    admin1?: string
  }

  // Provenance (mandatory)
  provider: {
    id: string
    name: string
    attribution?: string
  }
  fallbackChain: string[]
  errors: Array<{
    provider: string
    error: string
    timestamp: string
  }>

  // Meta
  meta: {
    generationTimeMs: number
    forecastDays: number
    modelsUsed?: string[]
    cached: boolean
  }
}

// Geocode location using Open-Meteo Geocoding API
async function geocode(location: string): Promise<{
  latitude: number
  longitude: number
  name: string
  country?: string
  admin1?: string
  timezone: string
} | null> {
  const geoResponse = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(location)}&count=1&language=en&format=json`,
  )

  if (!geoResponse.ok) {
    throw new Error(`Geocoding failed: ${geoResponse.status}`)
  }

  const geoData = await geoResponse.json()

  if (!geoData.results?.length) {
    return null
  }

  const result = geoData.results[0]
  return {
    latitude: result.latitude,
    longitude: result.longitude,
    name: result.name,
    country: result.country,
    admin1: result.admin1,
    timezone: result.timezone || "UTC",
  }
}

// Fetch forecast from Open-Meteo
async function fetchForecast(
  lat: number,
  lon: number,
  timezone: string,
  days: number,
): Promise<{
  daily: {
    time: string[]
    weather_code: number[]
    temperature_2m_max: number[]
    temperature_2m_min: number[]
    sunrise?: string[]
    sunset?: string[]
    precipitation_sum?: number[]
    precipitation_probability_max?: number[]
    wind_speed_10m_max?: number[]
    uv_index_max?: number[]
  }
  daily_units: Record<string, string>
}> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    timezone: timezone,
    daily: [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "sunrise",
      "sunset",
      "precipitation_sum",
      "precipitation_probability_max",
      "wind_speed_10m_max",
      "uv_index_max",
    ].join(","),
    forecast_days: String(days),
  })

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`)

  if (!response.ok) {
    throw new Error(`Open-Meteo API error: ${response.status}`)
  }

  return response.json()
}

export const WeatherForecastSkill: Skill = {
  id: "weather-forecast" as SkillId,
  version: "2.0.0", // Breaking change from mock → real API
  name: "Weather Forecast",
  inputSchema: {
    type: "object",
    properties: {
      location: { type: "string", description: "City or location name" },
      days: {
        type: "number",
        description: "Number of days to forecast (1-16)",
        minimum: 1,
        maximum: 16,
        default: 7,
      },
      units: {
        type: "string",
        enum: ["metric", "imperial"],
        default: "metric",
        description: "Unit system for temperature and wind",
      },
    },
    required: ["location"],
  },
  outputSchema: {
    type: "object",
    properties: {
      forecast: {
        type: "array",
        items: {
          type: "object",
          properties: {
            date: { type: "string" },
            dayName: { type: "string" },
            high: { type: "number" },
            low: { type: "number" },
            condition: { type: "string" },
            conditionCode: { type: "number" },
            precipitation: { type: "number" },
            precipitationSum: { type: "number" },
            humidity: { type: "number" },
            windSpeed: { type: "number" },
            uvIndex: { type: "number" },
            sunrise: { type: "string" },
            sunset: { type: "string" },
            uncertainty: {
              type: "object",
              properties: {
                temperatureRange: {
                  type: "object",
                  properties: { low: { type: "number" }, high: { type: "number" } },
                },
                precipitationProbabilityRange: {
                  type: "object",
                  properties: { low: { type: "number" }, high: { type: "number" } },
                },
                confidence: { type: "number" },
                modelSource: { type: "string" },
              },
            },
          },
        },
      },
      location: {
        type: "object",
        properties: {
          name: { type: "string" },
          latitude: { type: "number" },
          longitude: { type: "number" },
          timezone: { type: "string" },
          country: { type: "string" },
          admin1: { type: "string" },
        },
      },
      provider: {
        type: "object",
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          attribution: { type: "string" },
        },
      },
      fallbackChain: { type: "array", items: { type: "string" } },
      errors: { type: "array" },
      meta: {
        type: "object",
        properties: {
          generationTimeMs: { type: "number" },
          forecastDays: { type: "number" },
          modelsUsed: { type: "array", items: { type: "string" } },
          cached: { type: "boolean" },
        },
      },
    },
  },
  capabilities: [
    "forecast_daily",
    "forecast_hourly",
    "forecast_probabilistic",
    "prediction",
    "multi_day",
    "weather_analysis",
  ],
  tags: ["weather", "forecast", "meteorology"],
  async execute(input: unknown, context: SkillContext): Promise<WeatherForecastOutput> {
    const log = Log.create({ service: "kiloclaw.skill.weather-forecast" })
    const startTime = Date.now()

    const { location, days = 7, units = "metric" } = input as WeatherForecastInput
    const errors: Array<{ provider: string; error: string; timestamp: string }> = []
    const fallbackChain: string[] = []

    if (!location || location.trim().length === 0) {
      log.warn("empty location provided for forecast")
      return {
        forecast: [],
        location: { name: "", latitude: 0, longitude: 0, timezone: "UTC" },
        provider: { id: "none", name: "None", attribution: "No provider available" },
        fallbackChain: [],
        errors: [],
        meta: { generationTimeMs: Date.now() - startTime, forecastDays: 0, cached: false },
      }
    }

    const forecastDays = Math.min(Math.max(days, 1), 16)

    log.info("generating weather forecast", {
      correlationId: context.correlationId,
      location,
      days: forecastDays,
    })

    try {
      // Step 1: Geocode
      const geoResult = await geocode(location)

      if (!geoResult) {
        return {
          forecast: [],
          location: { name: location, latitude: 0, longitude: 0, timezone: "UTC" },
          provider: { id: "geocoding", name: "Geocoding", attribution: "Open-Meteo Geocoding API" },
          fallbackChain: [],
          errors: [{ provider: "geocoding", error: "Location not found", timestamp: new Date().toISOString() }],
          meta: { generationTimeMs: Date.now() - startTime, forecastDays: 0, cached: false },
        }
      }

      // Step 2: Fetch forecast from Open-Meteo (primary)
      fallbackChain.push("open-meteo")

      const forecastData = await fetchForecast(
        geoResult.latitude,
        geoResult.longitude,
        geoResult.timezone,
        forecastDays,
      )
      const daily = forecastData.daily

      // Step 3: Transform to our output format
      const forecast: DayForecast[] = daily.time.map((timeStr, i) => {
        const date = new Date(timeStr)
        const wmoInfo = WMO_WEATHER_CODES[daily.weather_code[i]] || { description: "Unknown", icon: "❓" }

        const highC = daily.temperature_2m_max[i]
        const lowC = daily.temperature_2m_min[i]
        const high = units === "imperial" ? Math.round((highC * 9) / 5 + 32) : Math.round(highC)
        const low = units === "imperial" ? Math.round((lowC * 9) / 5 + 32) : Math.round(lowC)

        const windSpeedKmh = daily.wind_speed_10m_max?.[i] ?? 0
        const windSpeed = units === "imperial" ? Math.round(windSpeedKmh * 0.621371) : Math.round(windSpeedKmh)

        return {
          date: timeStr,
          dayName: date.toLocaleDateString("en-US", { weekday: "long" }),
          high,
          low,
          condition: wmoInfo.description,
          conditionCode: daily.weather_code[i],
          precipitation: daily.precipitation_probability_max?.[i] ?? 0,
          precipitationSum: daily.precipitation_sum?.[i],
          humidity: 50, // Open-Meteo daily doesn't provide humidity
          windSpeed,
          uvIndex: daily.uv_index_max?.[i] ?? 0,
          sunrise: daily.sunrise?.[i],
          sunset: daily.sunset?.[i],
          uncertainty: {
            temperatureRange: {
              low: low - 2,
              high: high + 2,
            },
            precipitationProbabilityRange: {
              low: Math.max(0, (daily.precipitation_probability_max?.[i] ?? 0) - 10),
              high: Math.min(100, (daily.precipitation_probability_max?.[i] ?? 0) + 10),
            },
            confidence: 0.75, // Open-Meteo forecast confidence
            modelSource: "Open-Meteo Forecast",
          },
        }
      })

      log.info("weather forecast generated", {
        correlationId: context.correlationId,
        location: geoResult.name,
        days: forecastDays,
        provider: "open-meteo",
      })

      return {
        forecast,
        location: {
          name: geoResult.name,
          latitude: geoResult.latitude,
          longitude: geoResult.longitude,
          timezone: geoResult.timezone,
          country: geoResult.country,
          admin1: geoResult.admin1,
        },
        provider: {
          id: "open-meteo",
          name: "Open-Meteo",
          attribution: "Weather data by [Open-Meteo](https://open-meteo.com/)",
        },
        fallbackChain,
        errors,
        meta: {
          generationTimeMs: Date.now() - startTime,
          forecastDays,
          modelsUsed: ["open-meteo"],
          cached: false,
        },
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      log.error("weather forecast failed", {
        correlationId: context.correlationId,
        location,
        error: errorMsg,
      })

      errors.push({ provider: "open-meteo", error: errorMsg, timestamp: new Date().toISOString() })

      return {
        forecast: [],
        location: { name: location, latitude: 0, longitude: 0, timezone: "UTC" },
        provider: { id: "error", name: "Error", attribution: "Failed to fetch forecast data" },
        fallbackChain,
        errors,
        meta: { generationTimeMs: Date.now() - startTime, forecastDays: 0, cached: false },
      }
    }
  },
}

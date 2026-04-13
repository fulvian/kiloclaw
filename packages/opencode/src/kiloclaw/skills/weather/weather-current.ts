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

// Convert wind direction degrees to cardinal
function degreesToCardinal(degrees: number): string {
  const directions = [
    "N",
    "NNE",
    "NE",
    "ENE",
    "E",
    "ESE",
    "SE",
    "SSE",
    "S",
    "SSW",
    "SW",
    "WSW",
    "W",
    "WNW",
    "NW",
    "NNW",
  ]
  const index = Math.round(degrees / 22.5) % 16
  return directions[index]
}

// Current weather conditions
export interface Current {
  readonly temperature: number // Celsius
  readonly feelsLike: number // Celsius
  readonly condition: string
  readonly conditionCode: number
  readonly description: string
  readonly humidity: number // percentage
  readonly pressure: number // hPa
  readonly visibility: number // km
  readonly windSpeed: number // km/h
  readonly windDirection: string
  readonly windDirectionDegrees: number
  readonly uvIndex: number
  readonly cloudCover: number // percentage
  readonly precipitation: number // mm
  readonly isDay: boolean
}

// Weather current conditions input
interface WeatherCurrentInput {
  location: string
  units?: "metric" | "imperial"
}

// Weather current conditions output
interface WeatherCurrentOutput {
  conditions: Current
  location: {
    name: string
    latitude: number
    longitude: number
    timezone: string
    country?: string
    admin1?: string
  }
  tempF?: number // Fahrenheit (convenience)
  localTime: string
  observationTime: string

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
    cached: boolean
  }
}

// Geocode location using Open-Meteo Geocoding API
async function geocode(
  location: string,
): Promise<{
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

// Fetch current weather from Open-Meteo
async function fetchCurrentWeather(
  lat: number,
  lon: number,
  timezone: string,
): Promise<{
  current: {
    time: string
    temperature_2m: number
    relative_humidity_2m: number
    apparent_temperature: number
    is_day: number
    precipitation: number
    weather_code: number
    cloud_cover: number
    pressure_msl: number
    surface_pressure: number
    wind_speed_10m: number
    wind_direction_10m: number
    wind_gusts_10m: number
  }
  current_units: Record<string, string>
}> {
  const response = await fetch(
    `https://api.open-meteo.com/v1/current?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m&timezone=${encodeURIComponent(timezone)}`,
  )

  if (!response.ok) {
    throw new Error(`Open-Meteo API error: ${response.status}`)
  }

  return response.json()
}

export const WeatherCurrentSkill: Skill = {
  id: "weather-current" as SkillId,
  version: "2.0.0", // Breaking change from mock → real API
  name: "Current Weather Conditions",
  inputSchema: {
    type: "object",
    properties: {
      location: { type: "string", description: "City or location name" },
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
      conditions: {
        type: "object",
        properties: {
          temperature: { type: "number" },
          feelsLike: { type: "number" },
          condition: { type: "string" },
          conditionCode: { type: "number" },
          description: { type: "string" },
          humidity: { type: "number" },
          pressure: { type: "number" },
          visibility: { type: "number" },
          windSpeed: { type: "number" },
          windDirection: { type: "string" },
          windDirectionDegrees: { type: "number" },
          uvIndex: { type: "number" },
          cloudCover: { type: "number" },
          precipitation: { type: "number" },
          isDay: { type: "boolean" },
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
      tempF: { type: "number" },
      localTime: { type: "string" },
      observationTime: { type: "string" },
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
          cached: { type: "boolean" },
        },
      },
    },
  },
  capabilities: ["current_conditions", "current_observation", "weather_monitoring", "real_time_data"],
  tags: ["weather", "current", "conditions", "real-time"],
  async execute(input: unknown, context: SkillContext): Promise<WeatherCurrentOutput> {
    const log = Log.create({ service: "kiloclaw.skill.weather-current" })
    const startTime = Date.now()

    const { location, units = "metric" } = input as WeatherCurrentInput
    const errors: Array<{ provider: string; error: string; timestamp: string }> = []
    const fallbackChain: string[] = []

    if (!location || location.trim().length === 0) {
      log.warn("empty location provided for current weather")
      return {
        conditions: {
          temperature: 0,
          feelsLike: 0,
          condition: "Unknown",
          conditionCode: -1,
          description: "Location not provided",
          humidity: 0,
          pressure: 0,
          visibility: 0,
          windSpeed: 0,
          windDirection: "N/A",
          windDirectionDegrees: 0,
          uvIndex: 0,
          cloudCover: 0,
          precipitation: 0,
          isDay: false,
        },
        location: { name: "", latitude: 0, longitude: 0, timezone: "UTC" },
        tempF: 32,
        localTime: new Date().toISOString(),
        observationTime: new Date().toISOString(),
        provider: { id: "none", name: "None", attribution: "No provider available" },
        fallbackChain: [],
        errors: [],
        meta: { generationTimeMs: Date.now() - startTime, cached: false },
      }
    }

    log.info("fetching current weather", {
      correlationId: context.correlationId,
      location,
    })

    try {
      // Step 1: Geocode
      const geoResult = await geocode(location)

      if (!geoResult) {
        return {
          conditions: {
            temperature: 0,
            feelsLike: 0,
            condition: "Unknown",
            conditionCode: -1,
            description: `Location "${location}" not found`,
            humidity: 0,
            pressure: 0,
            visibility: 0,
            windSpeed: 0,
            windDirection: "N/A",
            windDirectionDegrees: 0,
            uvIndex: 0,
            cloudCover: 0,
            precipitation: 0,
            isDay: false,
          },
          location: { name: location, latitude: 0, longitude: 0, timezone: "UTC" },
          tempF: 32,
          localTime: new Date().toISOString(),
          observationTime: new Date().toISOString(),
          provider: { id: "geocoding", name: "Geocoding", attribution: "Open-Meteo Geocoding API" },
          fallbackChain: [],
          errors: [{ provider: "geocoding", error: "Location not found", timestamp: new Date().toISOString() }],
          meta: { generationTimeMs: Date.now() - startTime, cached: false },
        }
      }

      // Step 2: Fetch current weather from Open-Meteo (primary)
      fallbackChain.push("open-meteo")

      const weatherData = await fetchCurrentWeather(geoResult.latitude, geoResult.longitude, geoResult.timezone)
      const current = weatherData.current

      const wmoInfo = WMO_WEATHER_CODES[current.weather_code] || { description: "Unknown", icon: "❓" }
      const tempC = current.temperature_2m
      const tempF = units === "imperial" ? Math.round((tempC * 9) / 5 + 32) : undefined
      const windSpeed = units === "imperial" ? current.wind_speed_10m * 0.621371 : current.wind_speed_10m

      const conditions: Current = {
        temperature: Math.round(tempC * 10) / 10,
        feelsLike: Math.round(current.apparent_temperature * 10) / 10,
        condition: wmoInfo.description,
        conditionCode: current.weather_code,
        description: `${wmoInfo.icon} ${wmoInfo.description}`,
        humidity: current.relative_humidity_2m,
        pressure: Math.round(current.pressure_msl),
        visibility: 10, // Open-Meteo current doesn't provide visibility
        windSpeed: Math.round(windSpeed * 10) / 10,
        windDirection: degreesToCardinal(current.wind_direction_10m),
        windDirectionDegrees: current.wind_direction_10m,
        uvIndex: 0, // UV not in current endpoint
        cloudCover: current.cloud_cover,
        precipitation: current.precipitation,
        isDay: current.is_day === 1,
      }

      const observationTime = new Date(current.time).toISOString()
      const localTime = new Date(current.time).toLocaleString("en-US", { timeZone: geoResult.timezone })

      log.info("current weather fetched", {
        correlationId: context.correlationId,
        location: geoResult.name,
        temp: conditions.temperature,
        condition: conditions.condition,
        provider: "open-meteo",
      })

      return {
        conditions,
        location: {
          name: geoResult.name,
          latitude: geoResult.latitude,
          longitude: geoResult.longitude,
          timezone: geoResult.timezone,
          country: geoResult.country,
          admin1: geoResult.admin1,
        },
        tempF,
        localTime,
        observationTime,
        provider: {
          id: "open-meteo",
          name: "Open-Meteo",
          attribution: "Weather data by [Open-Meteo](https://open-meteo.com/)",
        },
        fallbackChain,
        errors,
        meta: { generationTimeMs: Date.now() - startTime, cached: false },
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      log.error("current weather fetch failed", {
        correlationId: context.correlationId,
        location,
        error: errorMsg,
      })

      errors.push({ provider: "open-meteo", error: errorMsg, timestamp: new Date().toISOString() })

      return {
        conditions: {
          temperature: 0,
          feelsLike: 0,
          condition: "Error",
          conditionCode: -1,
          description: `Failed to fetch weather: ${errorMsg}`,
          humidity: 0,
          pressure: 0,
          visibility: 0,
          windSpeed: 0,
          windDirection: "N/A",
          windDirectionDegrees: 0,
          uvIndex: 0,
          cloudCover: 0,
          precipitation: 0,
          isDay: false,
        },
        location: { name: location, latitude: 0, longitude: 0, timezone: "UTC" },
        tempF: 32,
        localTime: new Date().toISOString(),
        observationTime: new Date().toISOString(),
        provider: { id: "error", name: "Error", attribution: "Failed to fetch weather data" },
        fallbackChain,
        errors,
        meta: { generationTimeMs: Date.now() - startTime, cached: false },
      }
    }
  },
}

import { Log } from "@/util/log"
import { Skill, SkillContext } from "../skill"
import { SkillId } from "../types"

// Current weather conditions
export interface Current {
  readonly temperature: number // Celsius
  readonly feelsLike: number // Celsius
  readonly condition: string
  readonly description: string
  readonly humidity: number // percentage
  readonly pressure: number // hPa
  readonly visibility: number // km
  readonly windSpeed: number // km/h
  readonly windDirection: string
  readonly uvIndex: number
  readonly cloudCover: number // percentage
  readonly dewPoint: number // Celsius
}

// Weather current conditions input
interface WeatherCurrentInput {
  location: string
}

// Weather current conditions output
interface WeatherCurrentOutput {
  conditions: Current
  location: string
  temp: number // Fahrenheit (for convenience)
  localTime: string
  observationTime: string
}

// Mock current weather data generator
// In production, this would integrate with OpenWeather API
function generateMockCurrentWeather(location: string): { conditions: Current; tempF: number } {
  // Generate realistic current conditions based on location
  const hour = new Date().getHours()
  const isDay = hour >= 6 && hour < 20

  // Temperature varies by time of day
  const baseTempC = 18 + Math.sin(((hour - 6) * Math.PI) / 12) * 8
  const tempC = Math.round(baseTempC + (Math.random() - 0.5) * 5)
  const tempF = Math.round((tempC * 9) / 5 + 32)
  const feelsLikeC = Math.round(tempC - (isDay ? 2 : 4)) // Wind chill at night

  const conditions = [
    { condition: "Clear", description: "Clear skies" },
    { condition: "Partly Cloudy", description: "Partly cloudy with bright periods" },
    { condition: "Mostly Cloudy", description: "Mostly cloudy" },
    { condition: "Overcast", description: "Overcast clouds" },
    { condition: "Light Rain", description: "Light rain shower" },
    { condition: "Fog", description: "Patches of fog" },
  ]
  const weatherCondition = conditions[Math.floor(Math.random() * conditions.length)]

  return {
    conditions: {
      temperature: tempC,
      feelsLike: feelsLikeC,
      condition: isDay
        ? weatherCondition.condition
        : weatherCondition.condition.replace("Cloudy", "Clear").replace("Rain", "Drizzle"),
      description: weatherCondition.description,
      humidity: Math.round(45 + Math.random() * 40),
      pressure: Math.round(1010 + Math.random() * 20),
      visibility: Math.round(8 + Math.random() * 7),
      windSpeed: Math.round(3 + Math.random() * 20),
      windDirection: ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.floor(Math.random() * 8)],
      uvIndex: isDay ? Math.round(3 + Math.random() * 5) : 0,
      cloudCover: Math.round(Math.random() * 100),
      dewPoint: Math.round(tempC - 5 - Math.random() * 5),
    },
    tempF,
  }
}

export const WeatherCurrentSkill: Skill = {
  id: "weather-current" as SkillId,
  version: { major: 1, minor: 0, patch: 0 },
  name: "Current Weather Conditions",
  inputSchema: {
    type: "object",
    properties: {
      location: { type: "string", description: "City or location name" },
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
          description: { type: "string" },
          humidity: { type: "number" },
          pressure: { type: "number" },
          visibility: { type: "number" },
          windSpeed: { type: "number" },
          windDirection: { type: "string" },
          uvIndex: { type: "number" },
          cloudCover: { type: "number" },
          dewPoint: { type: "number" },
        },
      },
      location: { type: "string" },
      temp: { type: "number", description: "Temperature in Fahrenheit" },
      localTime: { type: "string" },
      observationTime: { type: "string" },
    },
  },
  capabilities: ["current_conditions", "weather_monitoring", "real_time_data"],
  tags: ["weather", "current", "conditions", "real-time"],
  async execute(input: unknown, context: SkillContext): Promise<WeatherCurrentOutput> {
    const log = Log.create({ service: "kiloclaw.skill.weather-current" })
    log.info("fetching current weather", {
      correlationId: context.correlationId,
      location: (input as WeatherCurrentInput).location,
    })

    const { location } = input as WeatherCurrentInput

    if (!location || location.trim().length === 0) {
      log.warn("empty location provided for current weather")
      return {
        conditions: {
          temperature: 0,
          feelsLike: 0,
          condition: "Unknown",
          description: "Location not provided",
          humidity: 0,
          pressure: 0,
          visibility: 0,
          windSpeed: 0,
          windDirection: "N/A",
          uvIndex: 0,
          cloudCover: 0,
          dewPoint: 0,
        },
        location: "",
        temp: 32,
        localTime: new Date().toISOString(),
        observationTime: new Date().toISOString(),
      }
    }

    const { conditions, tempF } = generateMockCurrentWeather(location)
    const now = new Date()

    log.info("current weather fetched", {
      correlationId: context.correlationId,
      location,
      temp: conditions.temperature,
      condition: conditions.condition,
    })

    return {
      conditions,
      location,
      temp: tempF,
      localTime: now.toLocaleString("en-US", { timeZone: "America/New_York" }),
      observationTime: now.toISOString(),
    }
  },
}

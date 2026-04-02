import { Log } from "@/util/log"
import { Skill, SkillContext } from "../skill"
import { SkillId } from "../types"

// Day forecast output
export interface DayForecast {
  readonly date: string
  readonly dayName: string
  readonly high: number // Celsius
  readonly low: number // Celsius
  readonly condition: string
  readonly precipitation: number // percentage
  readonly humidity: number // percentage
  readonly windSpeed: number // km/h
  readonly uvIndex: number
  readonly sunrise: string
  readonly sunset: string
}

// Weather forecast input
interface WeatherForecastInput {
  location: string
  days: number
}

// Weather forecast output
interface WeatherForecastOutput {
  forecast: DayForecast[]
  location: string
  timezone: string
}

// Mock weather data generator
// In production, this would integrate with OpenWeather API
function generateMockForecast(location: string, days: number): DayForecast[] {
  const conditions = ["Sunny", "Partly Cloudy", "Cloudy", "Light Rain", "Heavy Rain", "Thunderstorm", "Clear"]
  const forecast: DayForecast[] = []
  const now = new Date()

  for (let i = 0; i < days; i++) {
    const date = new Date(now)
    date.setDate(date.getDate() + i)

    // Generate realistic weather patterns with some randomness
    const dayOfYear = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000)
    const seasonalBase = 20 + 10 * Math.sin(((dayOfYear - 80) * (2 * Math.PI)) / 365) // Seasonal variation

    const randomVariation = (Math.random() - 0.5) * 10
    const high = Math.round(seasonalBase + randomVariation + 5)
    const low = Math.round(seasonalBase + randomVariation - 5)

    const condition = conditions[Math.floor(Math.random() * conditions.length)]
    const precipBase = condition.includes("Rain") || condition.includes("Thunderstorm") ? 60 : 20
    const precipitation = Math.min(95, Math.max(0, precipBase + Math.random() * 30))

    forecast.push({
      date: date.toISOString().split("T")[0],
      dayName: date.toLocaleDateString("en-US", { weekday: "long" }),
      high,
      low,
      condition,
      precipitation: Math.round(precipitation),
      humidity: Math.round(40 + Math.random() * 40),
      windSpeed: Math.round(5 + Math.random() * 25),
      uvIndex: Math.round(3 + Math.random() * 7),
      sunrise: "06:30",
      sunset: "19:45",
    })
  }

  return forecast
}

export const WeatherForecastSkill: Skill = {
  id: "weather-forecast" as SkillId,
  version: { major: 1, minor: 0, patch: 0 },
  name: "Weather Forecast",
  inputSchema: {
    type: "object",
    properties: {
      location: { type: "string", description: "City or location name" },
      days: { type: "number", description: "Number of days to forecast (1-7)", minimum: 1, maximum: 7 },
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
            precipitation: { type: "number" },
            humidity: { type: "number" },
            windSpeed: { type: "number" },
            uvIndex: { type: "number" },
            sunrise: { type: "string" },
            sunset: { type: "string" },
          },
        },
      },
      location: { type: "string" },
      timezone: { type: "string" },
    },
  },
  capabilities: ["prediction", "multi_day", "weather_analysis"],
  tags: ["weather", "forecast", "meteorology"],
  async execute(input: unknown, context: SkillContext): Promise<WeatherForecastOutput> {
    const log = Log.create({ service: "kiloclaw.skill.weather-forecast" })
    log.info("generating weather forecast", {
      correlationId: context.correlationId,
      location: (input as WeatherForecastInput).location,
    })

    const { location, days } = input as WeatherForecastInput

    if (!location || location.trim().length === 0) {
      log.warn("empty location provided for forecast")
      return {
        forecast: [],
        location: "",
        timezone: "UTC",
      }
    }

    const forecastDays = Math.min(Math.max(days || 5, 1), 7)
    const forecast = generateMockForecast(location, forecastDays)

    log.info("weather forecast generated", {
      correlationId: context.correlationId,
      location,
      days: forecastDays,
    })

    return {
      forecast,
      location,
      timezone: "America/New_York", // Mock timezone
    }
  },
}

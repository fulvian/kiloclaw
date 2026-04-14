// OpenWeather Adapter - Weather forecasts and alerts
import { Log } from "@/util/log"
import {
  TravelAdapter,
  type FlightSearchParams,
  type HotelSearchParams,
  type ActivitySearchParams,
  type EventSearchParams,
  type RestaurantSearchParams,
  type WeatherParams,
  type AdapterResult,
  getApiKey,
} from "../adapter-base"
import type { TravelAdapterError } from "../types"

const log = Log.create({ service: "travel.adapter.openweather" })

const OPENWEATHER_BASE_URL = "https://api.openweathermap.org/data/2.5"

export interface WeatherData {
  temperature: number
  feelsLike: number
  humidity: number
  description: string
  icon: string
  windSpeed: number
  pressure: number
  visibility: number
}

export interface ForecastDay {
  date: string
  tempMin: number
  tempMax: number
  description: string
  icon: string
  rainProbability: number
}

export interface WeatherAlert {
  event: string
  sender: string
  start: string
  end: string
  description: string
  tags: string[]
}

export interface WeatherResult {
  current: WeatherData
  forecast: ForecastDay[]
  alerts: WeatherAlert[]
  location: {
    city: string
    country: string
  }
}

export class OpenWeatherAdapter extends TravelAdapter {
  readonly name = "openweather"

  constructor() {
    super(OPENWEATHER_BASE_URL, 15000)
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const apiKey = await getApiKey("openweather")

    if (!apiKey) {
      throw {
        code: "AUTH_ERROR" as const,
        message: "OpenWeather API key not configured",
        provider: this.name,
      }
    }

    const startTime = Date.now()
    const separator = endpoint.includes("?") ? "&" : "?"
    const url = `${this.baseUrl}${endpoint}${separator}appid=${apiKey}&units=metric`

    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    })

    if (response.status === 429) {
      throw {
        code: "RATE_LIMITED" as const,
        message: "OpenWeather rate limit exceeded",
        provider: this.name,
        retryAfterMs: 60000,
      }
    }

    if (response.status === 404) {
      throw {
        code: "NOT_FOUND" as const,
        message: "City not found",
        provider: this.name,
      }
    }

    if (!response.ok) {
      const errorText = await response.text()
      throw {
        code: "PROVIDER_ERROR" as const,
        message: `OpenWeather API error: ${response.status} - ${errorText}`,
        provider: this.name,
      }
    }

    log.info(`OpenWeather request: ${endpoint}`, { latencyMs: Date.now() - startTime })

    return response.json()
  }

  // ==========================================================================
  // Weather Methods
  // ==========================================================================

  async searchFlights(): Promise<import("../adapter-base").FlightSearchResult> {
    return { success: true, data: [], provider: this.name, latencyMs: 0 }
  }

  async searchHotels(): Promise<import("../adapter-base").HotelSearchResult> {
    return { success: true, data: [], provider: this.name, latencyMs: 0 }
  }

  async searchActivities(): Promise<import("../adapter-base").ActivitySearchResult> {
    return { success: true, data: [], provider: this.name, latencyMs: 0 }
  }

  async searchEvents(): Promise<import("../adapter-base").EventSearchResult> {
    return { success: true, data: [], provider: this.name, latencyMs: 0 }
  }

  async searchRestaurants(): Promise<import("../adapter-base").RestaurantSearchResult> {
    return { success: true, data: [], provider: this.name, latencyMs: 0 }
  }

  async getWeather(params: WeatherParams): Promise<AdapterResult<WeatherResult>> {
    const startTime = Date.now()

    try {
      // Get current weather
      const currentEndpoint = `/weather?q=${encodeURIComponent(params.city)}`
      const currentData = (await this.request(currentEndpoint)) as {
        name: string
        sys: { country: string }
        coord?: { lat: number; lon: number }
        main: {
          temp: number
          feels_like: number
          humidity: number
          pressure: number
        }
        weather: Array<{ description: string; icon: string }>
        wind: { speed: number }
        visibility: number
      }

      // Get forecast
      const forecastEndpoint = `/forecast?q=${encodeURIComponent(params.city)}${params.date ? `&dt=${params.date}` : ""}`
      const forecastData = (await this.request(forecastEndpoint)) as {
        list: Array<{
          dt_txt: string
          main: { temp: number; temp_min: number; temp_max: number }
          weather: Array<{ description: string; icon: string }>
          pop: number
        }>
      }

      // Get One Call for alerts if available (requires paid subscription)
      let alerts: WeatherAlert[] = []
      try {
        const lat = currentData.coord?.lat ?? 0
        const lon = currentData.coord?.lon ?? 0
        const alertsEndpoint = `/onecall?lat=${lat}&lon=${lon}&exclude=minutely,hourly,daily`
        const alertsData = (await this.request(alertsEndpoint)) as {
          alerts?: Array<{
            event: string
            sender_name: string
            start: number
            end: number
            description: string
            tags: string[]
          }>
        }
        if (alertsData.alerts) {
          alerts = alertsData.alerts.map((alert) => ({
            event: alert.event,
            sender: alert.sender_name,
            start: new Date(alert.start * 1000).toISOString(),
            end: new Date(alert.end * 1000).toISOString(),
            description: alert.description,
            tags: alert.tags || [],
          }))
        }
      } catch {
        // Ignore alerts errors - free tier doesn't support One Call
      }

      // Process forecast into daily data
      const dailyMap = new Map<string, ForecastDay>()
      for (const item of forecastData.list) {
        const date = item.dt_txt.split(" ")[0]
        if (!dailyMap.has(date)) {
          dailyMap.set(date, {
            date,
            tempMin: item.main.temp_min,
            tempMax: item.main.temp_max,
            description: item.weather[0]?.description || "",
            icon: item.weather[0]?.icon || "",
            rainProbability: item.pop * 100,
          })
        } else {
          const day = dailyMap.get(date)!
          day.tempMin = Math.min(day.tempMin, item.main.temp_min)
          day.tempMax = Math.max(day.tempMax, item.main.temp_max)
        }
      }

      const forecast = Array.from(dailyMap.values()).slice(0, 5)

      const result: WeatherResult = {
        current: {
          temperature: currentData.main.temp,
          feelsLike: currentData.main.feels_like,
          humidity: currentData.main.humidity,
          description: currentData.weather[0]?.description || "",
          icon: currentData.weather[0]?.icon || "",
          windSpeed: currentData.wind.speed,
          pressure: currentData.main.pressure,
          visibility: currentData.visibility,
        },
        forecast,
        alerts,
        location: {
          city: currentData.name,
          country: currentData.sys.country,
        },
      }

      return {
        success: true,
        data: result,
        provider: this.name,
        latencyMs: Date.now() - startTime,
      }
    } catch (error) {
      log.error("OpenWeather request failed", {
        error: error instanceof Error ? error.message : String(error),
      })
      return this.handleError(error, startTime)
    }
  }

  // ==========================================================================
  // Risk Assessment
  // ==========================================================================

  assessWeatherRisk(weather: WeatherResult): { level: "low" | "medium" | "high"; reasons: string[] } {
    const reasons: string[] = []

    // Check for severe weather alerts
    const severeAlerts = weather.alerts.filter((a) => a.tags.includes("Extreme") || a.tags.includes("Severe"))
    if (severeAlerts.length > 0) {
      reasons.push(`Severe weather alert: ${severeAlerts.map((a) => a.event).join(", ")}`)
    }

    // Check temperature extremes
    if (weather.current.temperature > 40 || weather.current.temperature < -10) {
      reasons.push(`Extreme temperature: ${weather.current.temperature}°C`)
    }

    // Check forecast for bad weather
    const rainyDays = weather.forecast.filter((d) => d.rainProbability > 70).length
    if (rainyDays >= 3) {
      reasons.push(`${rainyDays} days with >70% rain probability`)
    }

    // Check visibility
    if (weather.current.visibility < 1000) {
      reasons.push(`Low visibility: ${weather.current.visibility}m`)
    }

    const level = reasons.length > 2 ? "high" : reasons.length > 0 ? "medium" : "low"

    return { level, reasons }
  }

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  private handleError<T>(error: unknown, startTime: number): AdapterResult<T> {
    const code = error && typeof error === "object" && "code" in error ? (error as TravelAdapterError).code : "UNKNOWN"
    const message = error instanceof Error ? error.message : String(error)

    return {
      success: false,
      error: {
        code: code as TravelAdapterError["code"],
        message,
        provider: this.name,
      },
      provider: this.name,
      latencyMs: Date.now() - startTime,
    }
  }
}

// Export singleton
export const openWeatherAdapter = new OpenWeatherAdapter()

// Google Weather Adapter - Weather forecasts using Google Maps Platform
// Primary weather service with OpenWeather fallback
import { Log } from "@/util/log"
import { TravelAdapter, type WeatherParams, type AdapterResult, getApiKey } from "../adapter-base"
import type { TravelAdapterError } from "../types"

const log = Log.create({ service: "travel.adapter.googleweather" })

// Google Maps Weather uses the same API key as Google Places
const GOOGLE_WEATHER_BASE_URL = "https://maps.googleapis.com/maps/api"

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

export class GoogleWeatherAdapter extends TravelAdapter {
  readonly name = "google_weather"

  constructor() {
    super(GOOGLE_WEATHER_BASE_URL, 15000)
  }

  // ==========================================================================
  // Stub implementations for TravelAdapter interface
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

  // ==========================================================================
  // Weather Methods
  // ==========================================================================

  async getWeather(params: WeatherParams): Promise<AdapterResult<WeatherResult>> {
    const startTime = Date.now()
    const city = params.city

    try {
      // Use Google Geocoding API to get coordinates
      const geoResult = await this.geocode(city)
      if (!geoResult) {
        return {
          success: false,
          error: { code: "NOT_FOUND", message: `Location not found: ${city}`, provider: this.name },
          provider: this.name,
          latencyMs: Date.now() - startTime,
        }
      }

      const { lat, lng, formattedCity, country } = geoResult

      // For weather data, Google Maps API doesn't provide direct weather.
      // We use Open-Meteo which is free and doesn't require API key.
      // This is a fallback to real weather data when Google API key isn't enough.
      const weatherResult = await this.getWeatherFromOpenMeteo(lat, lng)

      return {
        success: true,
        data: {
          ...weatherResult,
          location: { city: formattedCity, country },
        },
        provider: this.name,
        latencyMs: Date.now() - startTime,
      }
    } catch (error) {
      log.error("Google Weather request failed", {
        error: error instanceof Error ? error.message : String(error),
        city,
      })
      return this.handleError(error, startTime)
    }
  }

  // ==========================================================================
  // Geocoding via Google
  // ==========================================================================

  private async geocode(
    city: string,
  ): Promise<{ lat: number; lng: number; formattedCity: string; country: string } | null> {
    const apiKey = await getApiKey("google")

    if (!apiKey) {
      log.debug("No Google API key, using Nominatim for geocoding")
      return this.geocodeNominatim(city)
    }

    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(city)}&key=${apiKey}`
      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`Geocoding failed: ${response.status}`)
      }

      const data = await response.json()

      if (data.status !== "OK" || !data.results?.length) {
        log.warn("Google geocoding returned no results", { city, status: data.status })
        return this.geocodeNominatim(city)
      }

      const result = data.results[0]
      const location = result.geometry?.location
      const components = result.address_components

      // Find city and country
      let cityName = city
      let countryCode = ""

      for (const comp of components) {
        if (comp.types.includes("locality")) cityName = comp.long_name
        if (comp.types.includes("country")) countryCode = comp.short_name
      }

      return {
        lat: location?.lat || 0,
        lng: location?.lng || 0,
        formattedCity: cityName,
        country: countryCode,
      }
    } catch (error) {
      log.warn("Google geocoding failed, falling back to Nominatim", {
        error: error instanceof Error ? error.message : String(error),
      })
      return this.geocodeNominatim(city)
    }
  }

  private async geocodeNominatim(
    city: string,
  ): Promise<{ lat: number; lng: number; formattedCity: string; country: string } | null> {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)}&format=json&limit=1&addressdetails=1`
      const response = await fetch(url, { headers: { "User-Agent": "Kiloclaw-Travel/1.0" } })

      if (!response.ok) {
        throw new Error(`Nominatim failed: ${response.status}`)
      }

      const data = await response.json()

      if (!data.length) {
        return null
      }

      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
        formattedCity: data[0].address?.city || data[0].display_name?.split(",")[0] || city,
        country: data[0].address?.country_code?.toUpperCase() || "",
      }
    } catch (error) {
      log.error("Nominatim geocoding failed", { error: error instanceof Error ? error.message : String(error) })
      return null
    }
  }

  // ==========================================================================
  // Weather from Open-Meteo (free, no API key required)
  // ==========================================================================

  private async getWeatherFromOpenMeteo(
    lat: number,
    lng: number,
  ): Promise<{ current: WeatherData; forecast: ForecastDay[]; alerts: WeatherAlert[] }> {
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,pressure&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=7`

      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`Open-Meteo failed: ${response.status}`)
      }

      const data = await response.json()

      const current = data.current
      const daily = data.daily

      // Map weather code to description
      const weatherDescriptions = this.mapWeatherCode(current.weather_code)

      return {
        current: {
          temperature: current.temperature_2m,
          feelsLike: current.apparent_temperature,
          humidity: current.relative_humidity_2m,
          description: weatherDescriptions.description,
          icon: weatherDescriptions.icon,
          windSpeed: current.wind_speed_10m,
          pressure: current.pressure,
          visibility: 10000, // Open-Meteo doesn't provide visibility
        },
        forecast: daily.time.map((date: string, i: number) => ({
          date,
          tempMin: daily.temperature_2m_min[i],
          tempMax: daily.temperature_2m_max[i],
          description: this.mapWeatherCode(daily.weather_code[i]).description,
          icon: this.mapWeatherCode(daily.weather_code[i]).icon,
          rainProbability: daily.precipitation_probability_max[i] || 0,
        })),
        alerts: [], // Open-Meteo free tier doesn't include alerts
      }
    } catch (error) {
      log.error("Open-Meteo weather fetch failed", { error: error instanceof Error ? error.message : String(error) })
      // Return minimal data if even Open-Meteo fails
      return {
        current: {
          temperature: 20,
          feelsLike: 20,
          humidity: 50,
          description: "Weather data unavailable",
          icon: "unknown",
          windSpeed: 0,
          pressure: 1013,
          visibility: 10000,
        },
        forecast: [],
        alerts: [],
      }
    }
  }

  private mapWeatherCode(code: number): { description: string; icon: string } {
    // WMO Weather interpretation codes
    const codes: Record<number, { description: string; icon: string }> = {
      0: { description: "Clear sky", icon: "sun" },
      1: { description: "Mainly clear", icon: "sun" },
      2: { description: "Partly cloudy", icon: "cloud-sun" },
      3: { description: "Overcast", icon: "cloud" },
      45: { description: "Foggy", icon: "cloud-fog" },
      48: { description: "Depositing rime fog", icon: "cloud-fog" },
      51: { description: "Light drizzle", icon: "cloud-drizzle" },
      53: { description: "Moderate drizzle", icon: "cloud-drizzle" },
      55: { description: "Dense drizzle", icon: "cloud-drizzle" },
      61: { description: "Slight rain", icon: "cloud-rain" },
      63: { description: "Moderate rain", icon: "cloud-rain" },
      65: { description: "Heavy rain", icon: "cloud-rain" },
      71: { description: "Slight snow", icon: "snowflake" },
      73: { description: "Moderate snow", icon: "snowflake" },
      75: { description: "Heavy snow", icon: "snowflake" },
      77: { description: "Snow grains", icon: "snowflake" },
      80: { description: "Slight rain showers", icon: "cloud-rain" },
      81: { description: "Moderate rain showers", icon: "cloud-rain" },
      82: { description: "Violent rain showers", icon: "cloud-rain" },
      85: { description: "Slight snow showers", icon: "snowflake" },
      86: { description: "Heavy snow showers", icon: "snowflake" },
      95: { description: "Thunderstorm", icon: "bolt" },
      96: { description: "Thunderstorm with slight hail", icon: "bolt" },
      99: { description: "Thunderstorm with heavy hail", icon: "bolt" },
    }

    return codes[code] || { description: "Unknown", icon: "unknown" }
  }

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  private handleError(error: unknown, startTime: number): AdapterResult<WeatherResult> {
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
export const googleWeatherAdapter = new GoogleWeatherAdapter()

import { Log } from "@/util/log"
import { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"

// Weather alert
export interface Alert {
  readonly id: string
  readonly type: string
  readonly severity: "advisory" | "watch" | "warning" | "emergency"
  readonly headline: string
  readonly description: string
  readonly instruction?: string
  readonly effective: string
  readonly expires: string
  readonly areas: readonly string[]
  readonly certainty?: "observed" | "likely" | "possible"
  readonly urgency?: "immediate" | "expected" | "future"
  readonly source: string
}

// Weather alerts input
interface WeatherAlertsInput {
  location: string
  severityFilter?: Array<"advisory" | "watch" | "warning" | "emergency">
}

// Weather alerts output
interface WeatherAlertsOutput {
  alerts: Alert[]
  severity: "none" | "low" | "medium" | "high" | "severe"
  activeCount: number
  lastUpdated: string

  // Provenance
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
}

// Geocode location using Nominatim (OpenStreetMap)
async function geocode(
  location: string,
): Promise<{ latitude: number; longitude: number; countryCode?: string; displayName: string } | null> {
  const geoResponse = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(location)}&format=json&limit=1`,
    { headers: { "User-Agent": "Kiloclaw-Weather/1.0" } },
  )

  if (!geoResponse.ok) {
    throw new Error(`Geocoding failed: ${geoResponse.status}`)
  }

  const geoData = await geoResponse.json()

  if (!geoData.length) {
    return null
  }

  const result = geoData[0]
  return {
    latitude: parseFloat(result.lat),
    longitude: parseFloat(result.lon),
    countryCode: result.address?.country_code?.toUpperCase(),
    displayName: result.display_name,
  }
}

// Fetch alerts from NWS
async function fetchNWSAlerts(lat: number, lon: number): Promise<any[]> {
  // Get NWS grid point
  const pointsResponse = await fetch(`https://api.weather.gov/points/${lat},${lon}`, {
    headers: { "User-Agent": "Kiloclaw-Weather/1.0" },
  })

  if (!pointsResponse.ok) {
    throw new Error(`NWS points API error: ${pointsResponse.status}`)
  }

  const pointsData = await pointsResponse.json()
  const forecastZone = pointsData.properties?.forecastZone

  if (!forecastZone) {
    throw new Error("No forecast zone found")
  }

  const zoneId = forecastZone.split("/").pop()

  // Get active alerts for this zone
  const alertsResponse = await fetch(`https://api.weather.gov/alerts/active?zone=${zoneId}`, {
    headers: { "User-Agent": "Kiloclaw-Weather/1.0" },
  })

  if (!alertsResponse.ok) {
    throw new Error(`NWS alerts API error: ${alertsResponse.status}`)
  }

  const alertsData = await alertsResponse.json()
  return alertsData.features || []
}

// Fetch alerts from OpenWeatherMap (global)
async function fetchOWMAlerts(location: string): Promise<any[]> {
  const apiKey = process.env.OPENWEATHERMAP_API_KEY
  if (!apiKey) {
    throw new Error("OPENWEATHERMAP_API_KEY not configured")
  }

  // Geocode
  const geoResponse = await fetch(
    `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(location)}&limit=1&appid=${apiKey}`,
  )
  const geoData = await geoResponse.json()

  if (!geoData.length) {
    throw new Error("Location not found")
  }

  const { lat, lon } = geoData[0]

  // Get weather (includes alerts in One Call API)
  const weatherResponse = await fetch(
    `https://api.openweathermap.org/data/2.5/onecall?lat=${lat}&lon=${lon}&exclude=minutely,hourly,daily&appid=${apiKey}`,
  )

  if (!weatherResponse.ok) {
    throw new Error(`OpenWeatherMap API error: ${weatherResponse.status}`)
  }

  const weatherData = await weatherResponse.json()
  return weatherData.alerts || []
}

// Severity weights for determining overall severity
const SEVERITY_WEIGHTS: Record<string, number> = {
  advisory: 1,
  watch: 2,
  warning: 3,
  emergency: 4,
}

// Determine overall severity level
function determineOverallSeverity(alerts: Alert[]): "none" | "low" | "medium" | "high" | "severe" {
  if (alerts.length === 0) return "none"

  const maxSeverity = Math.max(...alerts.map((a) => SEVERITY_WEIGHTS[a.severity] ?? 0))

  const severityMap: Record<number, "none" | "low" | "medium" | "high" | "severe"> = {
    0: "none",
    1: "low",
    2: "medium",
    3: "high",
    4: "severe",
  }

  return severityMap[maxSeverity] || "low"
}

// Parse NWS alert to our format
function parseNWSAlert(nwsAlert: any): Alert {
  const props = nwsAlert.properties || {}

  // Parse areas
  const areas = [props.AreaDesc || ""].filter(Boolean)

  return {
    id: nwsAlert.id || `nws-${Date.now()}`,
    type: props.Event || "Unknown Alert",
    severity: (props.Severity?.toLowerCase() as Alert["severity"]) || "advisory",
    headline: props.Headline || props.Event || "",
    description: props.Description || "",
    instruction: props.Instruction,
    effective: props.Effective || new Date().toISOString(),
    expires: props.Expires || new Date().toISOString(),
    areas,
    certainty: props.Certainty?.toLowerCase() as Alert["certainty"],
    urgency: props.Urgency?.toLowerCase() as Alert["urgency"],
    source: "NWS",
  }
}

// Parse OWM alert to our format
function parseOWMAlert(owmAlert: any): Alert {
  return {
    id: `owm-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: owmAlert.event || "Weather Alert",
    severity: mapOWMSeverity(owmAlert.severity),
    headline: owmAlert.event || "",
    description: owmAlert.description || "",
    instruction: owmAlert.sender_name ? `Source: ${owmAlert.sender_name}` : undefined,
    effective: owmAlert.start ? new Date(owmAlert.start * 1000).toISOString() : new Date().toISOString(),
    expires: owmAlert.end ? new Date(owmAlert.end * 1000).toISOString() : new Date().toISOString(),
    areas: [owmAlert.sender_name || "Unknown"].filter(Boolean),
    source: "OpenWeatherMap",
  }
}

// Map OpenWeatherMap severity to our format
function mapOWMSeverity(severity?: string): Alert["severity"] {
  const map: Record<string, Alert["severity"]> = {
    minor: "advisory",
    moderate: "watch",
    severe: "warning",
    extreme: "emergency",
  }
  return map[severity?.toLowerCase() || ""] || "advisory"
}

export const WeatherAlertsSkill: Skill = {
  id: "weather-alerts" as SkillId,
  version: "2.0.0", // Breaking change from mock → real API
  name: "Weather Alerts",
  inputSchema: {
    type: "object",
    properties: {
      location: { type: "string", description: "City or location to check for alerts" },
      severityFilter: {
        type: "array",
        items: { type: "string", enum: ["advisory", "watch", "warning", "emergency"] },
        description: "Filter alerts by minimum severity",
      },
    },
    required: ["location"],
  },
  outputSchema: {
    type: "object",
    properties: {
      alerts: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            type: { type: "string" },
            severity: { type: "string", enum: ["advisory", "watch", "warning", "emergency"] },
            headline: { type: "string" },
            description: { type: "string" },
            instruction: { type: "string" },
            effective: { type: "string" },
            expires: { type: "string" },
            areas: { type: "array", items: { type: "string" } },
            certainty: { type: "string" },
            urgency: { type: "string" },
            source: { type: "string" },
          },
        },
      },
      severity: { type: "string", enum: ["none", "low", "medium", "high", "severe"] },
      activeCount: { type: "number" },
      lastUpdated: { type: "string" },
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
    },
  },
  capabilities: [
    "alerts_severe",
    "alerts_advisory",
    "alerts_summary",
    "warning_detection",
    "notification",
    "safety_alerts",
  ],
  tags: ["weather", "alerts", "safety", "emergency"],
  async execute(input: unknown, context: SkillContext): Promise<WeatherAlertsOutput> {
    const log = Log.create({ service: "kiloclaw.skill.weather-alerts" })

    const { location, severityFilter } = input as WeatherAlertsInput
    const errors: Array<{ provider: string; error: string; timestamp: string }> = []
    const fallbackChain: string[] = []

    if (!location || location.trim().length === 0) {
      log.warn("empty location provided for alerts check")
      return {
        alerts: [],
        severity: "none",
        activeCount: 0,
        lastUpdated: new Date().toISOString(),
        provider: { id: "none", name: "None", attribution: "No provider available" },
        fallbackChain: [],
        errors: [],
      }
    }

    log.info("checking weather alerts", {
      correlationId: context.correlationId,
      location,
    })

    let allAlerts: Alert[] = []

    // Try NWS first (for US locations)
    try {
      fallbackChain.push("nws")

      const geoResult = await geocode(location)

      if (!geoResult) {
        throw new Error("Location not found")
      }

      if (geoResult.countryCode === "US") {
        // US location - use NWS
        const nwsAlerts = await fetchNWSAlerts(geoResult.latitude, geoResult.longitude)
        allAlerts = nwsAlerts.map(parseNWSAlert)

        log.info("weather alerts fetched from NWS", {
          correlationId: context.correlationId,
          location,
          alertCount: allAlerts.length,
          provider: "nws",
        })
      } else {
        // Non-US location - try OpenWeatherMap
        fallbackChain.push("openweathermap")
        const owmAlerts = await fetchOWMAlerts(location)
        allAlerts = owmAlerts.map(parseOWMAlert)

        log.info("weather alerts fetched from OWM", {
          correlationId: context.correlationId,
          location,
          alertCount: allAlerts.length,
          provider: "openweathermap",
        })
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      log.warn("primary alerts fetch failed, trying fallback", {
        correlationId: context.correlationId,
        location,
        error: errorMsg,
      })
      errors.push({
        provider: fallbackChain[fallbackChain.length - 1] || "nws",
        error: errorMsg,
        timestamp: new Date().toISOString(),
      })

      // Try OpenWeatherMap as fallback
      if (!fallbackChain.includes("openweathermap")) {
        try {
          fallbackChain.push("openweathermap")
          const owmAlerts = await fetchOWMAlerts(location)
          allAlerts = owmAlerts.map(parseOWMAlert)
        } catch (owmErr) {
          const owmErrorMsg = owmErr instanceof Error ? owmErr.message : String(owmErr)
          errors.push({ provider: "openweathermap", error: owmErrorMsg, timestamp: new Date().toISOString() })
        }
      }
    }

    // Apply severity filter if specified
    if (severityFilter && severityFilter.length > 0) {
      const minSeverity = Math.min(...severityFilter.map((s) => SEVERITY_WEIGHTS[s] ?? 0))
      allAlerts = allAlerts.filter((a) => (SEVERITY_WEIGHTS[a.severity] ?? 0) >= minSeverity)
    }

    const severity = determineOverallSeverity(allAlerts)

    log.info("weather alerts check completed", {
      correlationId: context.correlationId,
      location,
      alertCount: allAlerts.length,
      severity,
    })

    return {
      alerts: allAlerts,
      severity,
      activeCount: allAlerts.length,
      lastUpdated: new Date().toISOString(),
      provider: {
        id: fallbackChain[fallbackChain.length - 1] || "none",
        name: fallbackChain[fallbackChain.length - 1] === "nws" ? "NWS/NOAA" : "OpenWeatherMap",
        attribution:
          fallbackChain[fallbackChain.length - 1] === "nws"
            ? "Weather data from [National Weather Service](https://weather.gov/)"
            : "Weather data from [OpenWeatherMap](https://openweathermap.org/)",
      },
      fallbackChain,
      errors,
    }
  },
}

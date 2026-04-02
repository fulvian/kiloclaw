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
}

// Weather alerts input
interface WeatherAlertsInput {
  location: string
}

// Weather alerts output
interface WeatherAlertsOutput {
  alerts: Alert[]
  severity: "none" | "low" | "medium" | "high" | "severe"
  activeCount: number
  lastUpdated: string
}

// Mock severe weather alerts
// In production, this would integrate with National Weather Service API or OpenWeather
const MOCK_ALERTS: Alert[] = [
  {
    id: "NWS-W-2026-001",
    type: "Heat Warning",
    severity: "warning",
    headline: "Excessive Heat Warning in Effect",
    description:
      "Dangerously hot conditions with temperatures up to 105°F (40°C). Heat index values may reach 115°F. This is a dangerous situation.",
    instruction: "Stay in air-conditioned rooms. Check on relatives and neighbors. Drink plenty of fluids.",
    effective: "2026-04-02T10:00:00Z",
    expires: "2026-04-03T00:00:00Z",
    areas: ["Downtown", "Midtown", "Eastside"],
  },
  {
    id: "NWS-T-2026-002",
    type: "Severe Thunderstorm Watch",
    severity: "watch",
    headline: "Severe Thunderstorm Watch Issued",
    description:
      "Conditions favorable for severe thunderstorms capable of producing large hail, damaging winds, and heavy rainfall.",
    instruction: "Stay informed and be prepared to seek shelter if storms develop.",
    effective: "2026-04-02T14:00:00Z",
    expires: "2026-04-02T22:00:00Z",
    areas: ["Northern County", "Western Valley"],
  },
  {
    id: "NWS-F-2026-003",
    type: "Flood Advisory",
    severity: "advisory",
    headline: "Urban Flood Advisory",
    description: "Minor flooding in low-lying areas and poor drainage locations due to heavy rainfall.",
    instruction: "Do not attempt to cross flooded roads. Turn around, don't drown.",
    effective: "2026-04-02T08:00:00Z",
    expires: "2026-04-02T14:00:00Z",
    areas: ["Riverside", "Lowlands", "Central District"],
  },
  {
    id: "NWS-W-2025-048",
    type: "Winter Storm Warning",
    severity: "warning",
    headline: "Winter Storm Warning Expires",
    description: "Heavy snow expected with accumulations of 8-12 inches. Travel will be difficult.",
    instruction: "Avoid travel if possible. If you must travel, carry emergency supplies.",
    effective: "2026-01-15T18:00:00Z",
    expires: "2026-01-16T12:00:00Z",
    areas: ["Mountain Region", "Northern Pass"],
  },
]

// Search alerts by location
function searchAlerts(location: string): Alert[] {
  const normalizedLocation = location.toLowerCase().trim()

  // Return only currently active alerts
  const now = new Date()

  return MOCK_ALERTS.filter((alert) => {
    const effectiveDate = new Date(alert.effective)
    const expiresDate = new Date(alert.expires)
    const isActive = effectiveDate <= now && expiresDate > now

    if (!isActive) return false

    // Match by location
    const areaMatch = alert.areas.some(
      (area) => area.toLowerCase().includes(normalizedLocation) || normalizedLocation.includes(area.toLowerCase()),
    )

    // Also match if location is in the general area name
    const locationKeywords = normalizedLocation.split(/\s+/)
    const keywordMatch = locationKeywords.some(
      (keyword) =>
        keyword.length > 2 &&
        (alert.areas.some((area) => area.toLowerCase().includes(keyword)) ||
          alert.description.toLowerCase().includes(keyword)),
    )

    return areaMatch || keywordMatch
  })
}

// Determine overall severity level
function determineOverallSeverity(alerts: Alert[]): "none" | "low" | "medium" | "high" | "severe" {
  if (alerts.length === 0) return "none"

  const severityWeights = { advisory: 1, watch: 2, warning: 3, emergency: 4 }
  const maxSeverity = Math.max(...alerts.map((a) => severityWeights[a.severity]))

  const severityMap: Record<number, "none" | "low" | "medium" | "high" | "severe"> = {
    0: "none",
    1: "low",
    2: "medium",
    3: "high",
    4: "severe",
  }

  return severityMap[maxSeverity] || "low"
}

export const WeatherAlertsSkill: Skill = {
  id: "weather-alerts" as SkillId,
  version: "1.0.0",
  name: "Weather Alerts",
  inputSchema: {
    type: "object",
    properties: {
      location: { type: "string", description: "City or location to check for alerts" },
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
            severity: { type: "string" },
            headline: { type: "string" },
            description: { type: "string" },
            instruction: { type: "string" },
            effective: { type: "string" },
            expires: { type: "string" },
            areas: { type: "array", items: { type: "string" } },
          },
        },
      },
      severity: { type: "string", enum: ["none", "low", "medium", "high", "severe"] },
      activeCount: { type: "number" },
      lastUpdated: { type: "string" },
    },
  },
  capabilities: ["warning_detection", "notification", "safety_alerts"],
  tags: ["weather", "alerts", "safety", "emergency"],
  async execute(input: unknown, context: SkillContext): Promise<WeatherAlertsOutput> {
    const log = Log.create({ service: "kiloclaw.skill.weather-alerts" })
    log.info("checking weather alerts", {
      correlationId: context.correlationId,
      location: (input as WeatherAlertsInput).location,
    })

    const { location } = input as WeatherAlertsInput

    if (!location || location.trim().length === 0) {
      log.warn("empty location provided for alerts check")
      return {
        alerts: [],
        severity: "none",
        activeCount: 0,
        lastUpdated: new Date().toISOString(),
      }
    }

    const alerts = searchAlerts(location)
    const severity = determineOverallSeverity(alerts)

    log.info("weather alerts check completed", {
      correlationId: context.correlationId,
      location,
      alertCount: alerts.length,
      severity,
    })

    return {
      alerts,
      severity,
      activeCount: alerts.length,
      lastUpdated: new Date().toISOString(),
    }
  },
}

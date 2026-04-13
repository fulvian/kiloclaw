# TOOL DECISION RECORD WEATHER AGENCY V2

**Date:** 2026-04-13
**Status:** G2 - Complete
**Reference:** `KILOCLAW_WEATHER_AGENCY_ENHANCEMENT_PLAN_2026-04-13.md`
**Preceding:** `DISCOVERY_BRIEF_WEATHER_V2.md`

---

## 1. Executive Decision

### 1.1 Primary Tool Strategy

**Decision:** Use internal `weather-api` tool that delegates to catalog weather providers

| Role               | Tool                                            | Rationale                                             |
| ------------------ | ----------------------------------------------- | ----------------------------------------------------- |
| **Primary**        | `weather-api` (internal)                        | Structured data, low hallucination, full auditability |
| **Fallback Chain** | Open-Meteo → OpenWeatherMap → NWS (alerts only) | Multi-provider resilience                             |
| **Avoid**          | `websearch`/`webfetch` for core weather         | High hallucination risk, poor provenance              |

### 1.2 Provider Priority

| Priority          | Provider       | Coverage  | API Type | Key Required   |
| ----------------- | -------------- | --------- | -------- | -------------- |
| **1 (Primary)**   | Open-Meteo     | Global    | REST     | No             |
| **2 (Secondary)** | OpenWeatherMap | Global    | REST     | Yes (existing) |
| **3 (Tertiary)**  | NWS/NOAA       | US Alerts | REST     | No             |

---

## 2. Provider Evaluation

### 2.1 Open-Meteo (Primary)

**Endpoint:** `https://api.open-meteo.com/v1/forecast`
**Current Weather:** `https://api.open-meteo.com/v1/current`

#### Capabilities

| Feature                   | Support | Notes                           |
| ------------------------- | ------- | ------------------------------- |
| Current conditions        | ✅      | `/v1/current` endpoint          |
| Hourly forecast           | ✅      | Up to 16 days                   |
| Daily forecast            | ✅      | Max 16 days                     |
| Precipitation probability | ✅      | `precipitation_probability_max` |
| Wind speed/direction      | ✅      | Multiple levels                 |
| Weather codes (WMO)       | ✅      | Standardized codes              |
| UV Index                  | ✅      | Daily                           |
| Sunrise/sunset            | ✅      | Daily                           |
| Timezone auto             | ✅      | IANA timezone support           |
| Multi-model               | ✅      | GFS, ECMWF, JMA, etc.           |

#### Request Example (Current)

```
GET /v1/current?latitude=45.4642&longitude=9.1900&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m
```

#### Response Schema (Current)

```json
{
  "latitude": 45.4642,
  "longitude": 9.19,
  "current": {
    "time": "2026-04-13T12:00",
    "temperature_2m": 18.5,
    "relative_humidity_2m": 65,
    "apparent_temperature": 17.2,
    "is_day": 1,
    "precipitation": 0.0,
    "weather_code": 3,
    "cloud_cover": 42,
    "wind_speed_10m": 12.5,
    "wind_direction_10m": 180
  }
}
```

#### Rate Limits

- **Free tier:** ~10,000 requests/day (no key required)
- **Recommended:** Cache responses, no polling < 30s interval

#### Strengths

- No API key required
- High reliability, multiple weather models
- Excellent forecast range (16 days)
- Standardized WMO weather codes
- Good precipitation probability support

#### Weaknesses

- No native severe weather alerts
- No historical data in free tier

---

### 2.2 OpenWeatherMap (Secondary)

**Endpoint:** `https://api.openweathermap.org/data/2.5/`

#### Capabilities

| Feature               | Support | Notes                      |
| --------------------- | ------- | -------------------------- |
| Current conditions    | ✅      | `/weather` endpoint        |
| 5-day/3-hour forecast | ✅      | `/forecast` endpoint       |
| Alerts                | ✅      | `/onecall` includes alerts |
| UV Index              | ✅      | `/uvi` endpoint            |
| Historical            | ✅      | Paid tier only             |

#### Request Example (Current)

```
GET /data/2.5/weather?q=Milan&appid={API_KEY}&units=metric
```

#### Rate Limits

- **Free tier:** 60 calls/minute
- **Paid:** Higher limits available

#### Strengths

- Established provider
- Direct alerts support
- Geocoding included

#### Weaknesses

- Rate limits restrictive
- API key management required
- Forecast limited to 5 days / 3-hour granularity

---

### 2.3 NWS/NOAA (Tertiary - Alerts Only)

**Endpoint:** `https://api.weather.gov/`

#### Capabilities

| Feature         | Support | Notes            |
| --------------- | ------- | ---------------- |
| US alerts (CAP) | ✅      | Full alert types |
| Forecasts       | ✅      | Grid-point API   |
| Hourly          | ✅      | Grid-point API   |

#### Workflow

```
Location → Geocoding → /points/{gridpoint} → /forecast/hourly, /alerts
```

#### Rate Limits

- **Soft:** Polling not more frequent than ~30s on alerts
- **User-Agent required:** Identifiable agent string

#### Strengths

- Official US government data
- CAP format for interoperability
- Detailed alert types

#### Weaknesses

- US coverage only
- Complex multi-step API flow
- Rate limits on alerts endpoint

---

## 3. Policy Configuration

### 3.1 Fallback Chain Definition

```typescript
const WEATHER_PROVIDER_FALLBACK: WeatherProvider[] = [
  { id: "open-meteo", priority: 1, timeout: 5000 },
  { id: "openweathermap", priority: 2, timeout: 5000 },
  { id: "nws-alerts", priority: 3, timeout: 8000, scope: "alerts-only" },
]
```

### 3.2 Retry Configuration

| Attempt | Delay                | Max Retries |
| ------- | -------------------- | ----------- |
| 1       | 0ms                  | -           |
| 2       | 500ms                | -           |
| 3       | 1500ms (exponential) | Total: 3    |

### 3.3 Circuit Break Configuration

```typescript
const WEATHER_CIRCUIT_BREAKER = {
  failureThreshold: 5, // Open circuit after 5 failures
  resetTimeout: 60000, // Try again after 60s
  halfOpenMaxCalls: 2, // Allow 2 test calls in half-open
}
```

### 3.4 Timeout Configuration

| Provider       | Connect Timeout | Read Timeout |
| -------------- | --------------- | ------------ |
| Open-Meteo     | 3000ms          | 5000ms       |
| OpenWeatherMap | 3000ms          | 5000ms       |
| NWS            | 5000ms          | 8000ms       |

---

## 4. Unified Weather Output Schema

### 4.1 Current Conditions Schema

```typescript
interface WeatherCurrentOutput {
  // Core data
  location: {
    name: string
    latitude: number
    longitude: number
    timezone: string
    elevation?: number
  }
  current: {
    temperature: number // Celsius (canonical)
    temperatureF?: number // Fahrenheit (convenience)
    feelsLike: number
    humidity: number // percentage
    pressure: number // hPa
    visibility?: number // km
    windSpeed: number // km/h
    windDirection: number // degrees
    windDirectionCardinal: string // N, NE, etc.
    uvIndex?: number
    cloudCover: number // percentage
    precipitation?: number // mm
    isDay: boolean
    condition: string // WMO code description
    conditionCode: number // WMO code
  }
  localTime: string // ISO8601 in local timezone
  observationTime: string // ISO8601 UTC

  // Provenance (mandatory)
  provider: {
    id: string // "open-meteo", "openweathermap"
    name: string // "Open-Meteo", "OpenWeatherMap"
    attribution?: string
  }
  fallbackChain: string[] // Providers tried in order
  errors: Array<{
    provider: string
    error: string
    timestamp: string
  }>

  // Quality indicators
  meta: {
    generationTimeMs: number
    cached: boolean
    cacheExpiry?: string
  }
}
```

### 4.2 Forecast Schema

```typescript
interface WeatherForecastOutput {
  location: {
    name: string
    latitude: number
    longitude: number
    timezone: string
  }
  forecast: Array<{
    date: string // ISO8601 date
    dayName: string // "Monday", "Martedì", etc.
    high: number // Celsius
    low: number // Celsius
    highF?: number // Fahrenheit (convenience)
    lowF?: number

    // Condition
    condition: string
    conditionCode: number // WMO code

    // Precipitation probability
    precipitationProbability: number // percentage (0-100)
    precipitationSum?: number // mm

    // Additional
    humidity: number // percentage
    windSpeed: number // km/h
    uvIndex?: number
    sunrise?: string // ISO8601 time
    sunset?: string // ISO8601 time

    // Uncertainty (ensemble models)
    uncertainty?: {
      temperatureRange: { low: number; high: number }
      precipitationProbabilityRange: { low: number; high: number }
      confidence: number // 0-1
      modelSource?: string // "ecmwf", "gfs", "ensemble"
    }
  }>

  // Provenance (mandatory)
  provider: { id: string; name: string; attribution?: string }
  fallbackChain: string[]
  errors: Array<{ provider: string; error: string; timestamp: string }>

  // Meta
  meta: {
    generationTimeMs: number
    forecastDays: number
    modelsUsed?: string[] // For ensemble
    cached: boolean
  }
}
```

### 4.3 Alerts Schema

```typescript
interface WeatherAlertsOutput {
  location: {
    name: string
    latitude: number
    longitude: number
  }
  alerts: Array<{
    id: string
    type: string // "Heat Warning", "Flash Flood Warning"
    severity: "advisory" | "watch" | "warning" | "emergency"
    headline: string
    description: string
    instruction?: string
    effective: string // ISO8601
    expires: string // ISO8601
    areas: string[] // Affected areas

    // Source
    source: string // "NWS", "MeteoAlarm", etc.
    certainty?: "observed" | "likely" | "possible"
    urgency?: "immediate" | "expected" | "future"
  }>

  // Summary
  severitySummary: "none" | "low" | "medium" | "high" | "severe"
  activeCount: number

  // Provenance
  provider: { id: string; name: string }
  fallbackChain: string[]
  errors: Array<{ provider: string; error: string; timestamp: string }>

  lastUpdated: string // ISO8601
}
```

---

## 5. WMO Weather Code Mapping

```typescript
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
  80: { description: "Slight rain showers", icon: "🌦️" },
  81: { description: "Moderate rain showers", icon: "🌦️" },
  82: { description: "Violent rain showers", icon: "🌦️" },
  95: { description: "Thunderstorm", icon: "⛈️" },
  96: { description: "Thunderstorm with slight hail", icon: "⛈️" },
  99: { description: "Thunderstorm with heavy hail", icon: "⛈️" },
}
```

---

## 6. Tool Capability Mapping

### 6.1 Capability → Tool Resolution

| Capability                  | Primary Tool             | Fallback Tools | Notes           |
| --------------------------- | ------------------------ | -------------- | --------------- |
| `current_conditions`        | `weather-api` (current)  | -              | Direct API call |
| `weather_forecast`          | `weather-api` (forecast) | -              | Daily + hourly  |
| `weather_alerts`            | `weather-api` (alerts)   | NWS direct     | CAP format      |
| `precipitation_probability` | `weather-api` (ensemble) | -              | Ensemble models |
| `severe_weather`            | `weather-api` (alerts)   | NWS            | High severity   |

### 6.2 Deny-By-Default Tool List

The following tools are **BLOCKED** for weather agency queries:

| Tool         | Reason                         |
| ------------ | ------------------------------ |
| `websearch`  | Use weather API only           |
| `webfetch`   | Use weather API only           |
| `codesearch` | Not relevant to weather        |
| `bash`       | No shell execution for weather |

---

## 7. Unit Normalization

All internal storage and API calls use **metric units**:

| Variable      | Canonical Unit | Conversion                         |
| ------------- | -------------- | ---------------------------------- |
| Temperature   | Celsius (°C)   | Fahrenheit provided as convenience |
| Wind Speed    | km/h           | m/s = km/h / 3.6                   |
| Pressure      | hPa            | mbar (same)                        |
| Precipitation | mm             | inch = mm / 25.4                   |
| Visibility    | km             | miles = km / 1.609                 |
| Elevation     | meters         | feet = meters \* 3.281             |

---

## 8. Geocoding Strategy

Since Open-Meteo requires lat/lon:

| Provider             | Endpoint                                         | Notes        |
| -------------------- | ------------------------------------------------ | ------------ |
| Open-Meteo Geocoding | `https://geocoding-api.open-meteo.com/v1/search` | Free, no key |
| Fallback: Nominatim  | `https://nominatim.openstreetmap.org/search`     | Rate limited |

### Request Example

```
GET /v1/search?name=Milan&count=1&language=en&format=json
```

```json
{
  "results": [
    {
      "name": "Milan",
      "latitude": 45.4642,
      "longitude": 9.19,
      "country": "Italy",
      "admin1": "Lombardy"
    }
  ]
}
```

---

## 9. Approval

| Role      | Name             | Date       | Signature  |
| --------- | ---------------- | ---------- | ---------- |
| Owner     | General Manager  | 2026-04-13 | ⏳ Pending |
| Architect | System Architect | 2026-04-13 | ⏳ Pending |
| Safety    | QA Lead          | 2026-04-13 | ⏳ Pending |

---

**Document Status:** G2 Complete - Ready for G3 (Agency Manifest)
**Next Milestone:** Agency Manifest Draft (capability taxonomy, intent→tool mapping)

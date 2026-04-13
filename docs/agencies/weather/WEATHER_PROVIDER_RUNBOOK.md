# Weather Agency Provider Runbook

## Overview

The Weather Agency provides real-time weather data through three integrated providers with automatic fallback. All weather skills use a deny-by-default policy enforced via `tool-policy.ts`.

## Providers

### 1. Open-Meteo (Primary - No API Key Required)

**Endpoint**: `https://api.open-meteo.com/v1/`

**Features**:

- Current weather observations
- Forecast up to 16 days
- Geocoding service
- No API key required for basic usage

**Rate Limits**: ~10,000 requests/day, 60/min

**API Endpoints Used**:

```
GET https://geocoding-api.open-meteo.com/v1/search
GET https://api.open-meteo.com/v1/current
GET https://api.open-meteo.com/v1/forecast
```

**Documentation**: https://open-meteo.com/en/docs

---

### 2. OpenWeatherMap (Secondary)

**Endpoint**: `https://api.openweathermap.org/data/2.5/`

**Features**:

- Current weather
- 5-day forecast
- Weather alerts (US only)

**API Key Required**: Set `OPENWEATHERMAP_API_KEY` environment variable

**Rate Limits**: 60 calls/min (free tier)

**Documentation**: https://openweathermap.org/api

---

### 3. NWS/NOAA (Tertiary - US Alerts Only)

**Endpoint**: `https://api.weather.gov/`

**Features**:

- US-only weather alerts
- WFO grid data
- Forecasts

**Rate Limits**: 2 requests/second

**Documentation**: https://www.weather.gov/documentation

---

## Fallback Chain

```
Open-Meteo → OpenWeatherMap → NWS/NOAA → Error Response
```

When primary provider fails, the skill automatically attempts the next provider in the chain. All errors are logged in the `errors` array of the response.

## Response Provenance

All weather responses include mandatory provenance metadata:

```typescript
{
  provider: {
    id: string,      // e.g., "open-meteo"
    name: string,    // e.g., "Open-Meteo"
    attribution?: string
  },
  fallbackChain: string[],  // Providers attempted
  errors: Array<{
    provider: string,
    error: string,
    timestamp: string
  }>
}
```

## Skills

### weather-current

Get current weather conditions for a location.

**Input**:

```typescript
{
  location: string,      // City or location name (required)
  units?: "metric" | "imperial"  // Default: "metric"
}
```

**Output**:

```typescript
{
  conditions: {
    temperature: number,
    feelsLike: number,
    condition: string,
    conditionCode: number,
    description: string,
    humidity: number,
    pressure: number,
    visibility: number,
    windSpeed: number,
    windDirection: string,
    windDirectionDegrees: number,
    uvIndex: number,
    cloudCover: number,
    precipitation: number,
    isDay: boolean
  },
  location: {
    name: string,
    latitude: number,
    longitude: number,
    timezone: string,
    country?: string,
    admin1?: string
  },
  tempF?: number,  // Fahrenheit (only if units="imperial")
  localTime: string,
  observationTime: string,
  provider: Provider,
  fallbackChain: string[],
  errors: Error[],
  meta: { generationTimeMs: number, cached: boolean }
}
```

---

### weather-forecast

Get multi-day weather forecast.

**Input**:

```typescript
{
  location: string,      // City or location name (required)
  days?: number,        // 1-16, default: 7
  units?: "metric" | "imperial"  // Default: "metric"
}
```

**Output**:

```typescript
{
  forecast: Array<{
    date: string,
    dayName: string,
    high: number,
    low: number,
    condition: string,
    conditionCode: number,
    precipitation: number,
    precipitationSum?: number,
    humidity: number,
    windSpeed: number,
    uvIndex: number,
    sunrise?: string,
    sunset?: string,
    uncertainty?: {
      temperatureRange: { low: number, high: number },
      precipitationProbabilityRange: { low: number, high: number },
      confidence: number,
      modelSource?: string
    }
  }>,
  location: Location,
  provider: Provider,
  fallbackChain: string[],
  errors: Error[],
  meta: { generationTimeMs: number, forecastDays: number, modelsUsed?: string[], cached: boolean }
}
```

---

### weather-alerts

Get weather alerts and warnings for a location.

**Input**:

```typescript
{
  location: string // City, US state, or coordinates
}
```

**Output**:

```typescript
{
  alerts: Array<{
    id: string,
    type: string,
    severity: "none" | "minor" | "moderate" | "severe" | "extreme",
    headline: string,
    description: string,
    instruction?: string,
    effective: string,
    expires: string,
    states?: string[]
  }>,
  severity: string,
  activeCount: number,
  lastUpdated: string,
  provider: Provider,
  fallbackChain: string[],
  errors: Error[],
  meta: { generationTimeMs: number, cached: boolean }
}
```

---

## WMO Weather Codes

Open-Meteo uses WMO weather codes for conditions:

| Code  | Description         |
| ----- | ------------------- |
| 0     | Clear sky           |
| 1     | Mainly clear        |
| 2     | Partly cloudy       |
| 3     | Overcast            |
| 45    | Fog                 |
| 48    | Depositing rime fog |
| 51-55 | Drizzle             |
| 61-65 | Rain                |
| 71-75 | Snow                |
| 80-82 | Rain showers        |
| 85-86 | Snow showers        |
| 95-99 | Thunderstorm        |

---

## Policy Configuration

### tool-policy.ts

The weather agency uses deny-by-default policy:

```typescript
const WEATHER_TOOL_ALLOWLIST = ["weather-api", "skill"]

function mapWeatherCapabilitiesToTools(capabilities: string[]): string[] {
  // Maps weather capabilities to allowed tools
  return ["weather-api", "skill"]
}
```

### prompt.ts

Weather context block instructs agents to:

- Use `weather-api` tool or weather skills exclusively
- Not use websearch/webfetch for weather queries
- Respect the deny-by-default policy

---

## Troubleshooting

### Issue: "Location not found"

- Check spelling of location name
- Try adding country code (e.g., "Paris, FR")
- Verify geocoding API is accessible

### Issue: "API error" in fallback chain

- Primary provider may be rate-limited
- Check `fallbackChain` in response to see which providers were tried
- All errors are logged with timestamps

### Issue: Temperature seems wrong

- Verify `units` parameter is set correctly
- Default is metric (Celsius)
- Use `units: "imperial"` for Fahrenheit

---

## Environment Variables

| Variable                 | Description            | Required               |
| ------------------------ | ---------------------- | ---------------------- |
| `OPENWEATHERMAP_API_KEY` | OpenWeatherMap API key | No (falls back to NWS) |
| `NWS_API_KEY`            | NWS/NOAA API key       | No                     |

---

## Caching

Weather responses include `meta.cached: boolean`. The skill does not implement internal caching - caching should be handled at the agent layer if needed.

---

## Support

For issues with:

- Open-Meteo: https://open-meteo.com/en/docs
- OpenWeatherMap: https://openweathermap.org/support
- NWS/NOAA: https://www.weather.gov/documentation

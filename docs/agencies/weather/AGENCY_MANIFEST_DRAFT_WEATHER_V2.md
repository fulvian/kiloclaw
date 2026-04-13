# AGENCY MANIFEST DRAFT WEATHER AGENCY V2

**Date:** 2026-04-13
**Status:** G3 - Agency Manifest Draft
**Reference:**

- `KILOCLAW_WEATHER_AGENCY_ENHANCEMENT_PLAN_2026-04-13.md`
- `DISCOVERY_BRIEF_WEATHER_V2.md`
- `TOOL_DECISION_RECORD_WEATHER_V2.md`

---

## 1. Agency Overview

| Property           | Value                   |
| ------------------ | ----------------------- |
| **Agency ID**      | `agency-weather`        |
| **Domain**         | `weather`               |
| **Classification** | Read-only informational |
| **Risk Level**     | Low                     |
| **Policy Default** | DENY (deny-by-default)  |

### 1.1 Agency Purpose

Provides real-time weather information, forecasts, and alerts through trusted meteorological providers. Delivers structured, provenance-tracked weather data with uncertainty communication.

### 1.2 Non-Goals (Explicit)

- No weather-triggered automatic actions (notifications sent manually)
- No weather-based trading/derivatives recommendations
- No radar imagery processing (nowcasting ML)
- No long-term climate analysis

---

## 2. Canonical Capability Taxonomy

### 2.1 Capability Hierarchy

```
weather (root domain)
├── current
│   ├── current_conditions          # Real-time temperature, humidity, wind
│   ├── current_observation         # Station-based observation
│   └── current_astronomy          # Sunrise, sunset, moon phase
├── forecast
│   ├── forecast_daily             # Day-by-day forecast (1-16 days)
│   ├── forecast_hourly            # Hour-by-hour forecast
│   ├── forecast_probabilistic     # Ensemble/probability forecast
│   └── forecast_minutely         # Minutely precipitation (where available)
├── alerts
│   ├── alerts_severe             # Warnings, watches, emergencies
│   ├── alerts_advisory           # Advisories, notices
│   └── alerts_summary            # Multi-area alert overview
├── marine
│   ├── marine_forecast           # Coastal waters
│   └── tide_predictions          # Tide tables
└── historical
    ├── historical_temperature    # Past temperature data
    └── historical_precipitation  # Past precipitation data
```

### 2.2 Capability Aliases (To Be Deprecated)

| Deprecated Alias   | Canonical Capability | Reason                   |
| ------------------ | -------------------- | ------------------------ |
| `weather-query`    | `current_conditions` | Ambiguous                |
| `weather-current`  | `current_conditions` | Naming convention        |
| `current-weather`  | `current_conditions` | Inconsistent hyphenation |
| `location-weather` | `current_conditions` | Redundant                |
| `meteo`            | `current_conditions` | Italian-only             |
| `weather-today`    | `forecast_daily`     | Time-specific            |
| `weather-tomorrow` | `forecast_daily`     | Time-specific            |
| `weather-week`     | `forecast_daily`     | Imprecise duration       |

### 2.3 L1 Capability Detection Keywords

| Capability               | Primary Keywords                          | Secondary Keywords             |
| ------------------------ | ----------------------------------------- | ------------------------------ |
| `current_conditions`     | weather, temperature, conditions, current | now, right now, today, outside |
| `forecast_daily`         | forecast, tomorrow, week, weekend, daily  | predictions, outlook, outlook  |
| `forecast_hourly`        | hourly, later, tonight, tonight           | this afternoon, morning        |
| `forecast_probabilistic` | probability, likely, chance, ensemble     | uncertainty, range, scenarios  |
| `alerts_severe`          | alert, warning, watch, emergency, severe  | danger, danger, advisory       |
| `alerts_summary`         | alerts active, any alerts                 | severe weather, warnings       |
| `current_astronomy`      | sunrise, sunset, moon                     | dawn, dusk                     |

---

## 3. Intent → Agency → Agent → Skill → Tool Mapping

### 3.1 Routing Pipeline (L0-L3)

```
User Query
    │
    ▼
[L0: Domain Classification]
    │
    ├── Intent: "weather", "meteo", "temperature", etc.
    ├── Domain: "weather"
    └── Confidence: sqrt(keyword matches) + core bonus + type boost
    │
    ▼
[L1: Capability Detection]
    │
    ├── Intent: "current_conditions", "forecast_daily", etc.
    ├── Agency: "agency-weather"
    └── Capabilities: ["current_conditions", "weather_monitoring"]
    │
    ▼
[L2: Agent Selection]
    │
    ├── Primary Agent: "weather-agent"
    └── Health Check: agent health score
    │
    ▼
[L3: Tool Resolution]
    │
    ├── Policy: WEATHER_TOOL_ALLOWLIST
    ├── Allowed Tools: ["weather-api", "skill"]
    └── Skill: "weather-current" | "weather-forecast" | "weather-alerts"
    │
    ▼
[Execution]
    │
    └── weather-api → Open-Meteo → Structured Output
```

### 3.2 Intent → Capability Resolution

| Query Patterns      | Capability               | Confidence Boost |
| ------------------- | ------------------------ | ---------------- |
| "meteo Milano"      | `current_conditions`     | +0.1             |
| "temperatura ora"   | `current_conditions`     | +0.15            |
| "previsioni domani" | `forecast_daily`         | +0.15            |
| "pioggia previsto"  | `forecast_probabilistic` | +0.2             |
| "alert maltempo"    | `alerts_severe`          | +0.2             |
| "ci sono allerte"   | `alerts_summary`         | +0.15            |

### 3.3 Skill Bindings

| Skill ID           | Capabilities                                                  | Tool                     | Provider Priority |
| ------------------ | ------------------------------------------------------------- | ------------------------ | ----------------- |
| `weather-current`  | `current_conditions`, `current_observation`                   | `weather-api` (current)  | Open-Meteo → OWM  |
| `weather-forecast` | `forecast_daily`, `forecast_hourly`, `forecast_probabilistic` | `weather-api` (forecast) | Open-Meteo → OWM  |
| `weather-alerts`   | `alerts_severe`, `alerts_advisory`, `alerts_summary`          | `weather-api` (alerts)   | OWM → NWS         |

---

## 4. Policy Matrix

### 4.1 Weather Agency Tool Policy

| Tool          | Policy Level | Justification                |
| ------------- | ------------ | ---------------------------- |
| `weather-api` | **SAFE**     | Read-only, trusted providers |
| `skill`       | **SAFE**     | Weather skills only          |
| `websearch`   | **DENY**     | Use weather API only         |
| `webfetch`    | **DENY**     | Use weather API only         |
| `bash`        | **DENY**     | No shell execution           |
| `read`        | **DENY**     | Not needed for weather       |

### 4.2 Policy Enforcement Rules

1. **Deny-by-Default:** Any tool not explicitly listed in `WEATHER_TOOL_ALLOWLIST` is blocked
2. **Runtime Hardening:** Policy enforced at runtime, independent of prompt guidance
3. **Audit Trail:** All blocked tool attempts logged with full context
4. **No Override:** Prompt cannot override policy - policy is authoritative

### 4.3 Allowed Tools Configuration

```typescript
export const WEATHER_TOOL_ALLOWLIST = [
  "weather-api", // Primary weather API tool
  "skill", // For invoking weather-* skills
] as const

export const WEATHER_TOOL_BLOCKLIST = ["websearch", "webfetch", "bash", "read", "glob", "grep", "codesearch"] as const
```

---

## 5. Provider Metadata Requirements

### 5.1 Mandatory Output Fields

Every weather response **MUST** include:

```typescript
interface WeatherProvenance {
  provider: {
    id: string // "open-meteo", "openweathermap", "nws"
    name: string // Display name
    attribution?: string // Required for some providers
    url?: string // Provider API URL
  }
  fallbackChain: string[] // Providers tried in order
  errors: Array<{
    provider: string
    error: string
    timestamp: string
  }>
  meta: {
    generationTimeMs: number
    cached: boolean
    cacheExpiry?: string
  }
}
```

### 5.2 Provider Attribution Requirements

| Provider       | Attribution Required | Format                                                               |
| -------------- | -------------------- | -------------------------------------------------------------------- |
| Open-Meteo     | Yes                  | "Weather data by [Open-Meteo](https://open-meteo.com/)"              |
| OpenWeatherMap | Yes                  | "Weather data by [OpenWeatherMap](https://openweathermap.org/)"      |
| NWS/NOAA       | Yes                  | "Weather data from [National Weather Service](https://weather.gov/)" |

---

## 6. Agent Definition

### 6.1 Weather Agent

```typescript
export const WeatherAgent: Agent = {
  id: "weather-agent",
  name: "Weather Agent",
  agencyId: "agency-weather",
  capabilities: [
    "current_conditions",
    "forecast_daily",
    "forecast_hourly",
    "forecast_probabilistic",
    "alerts_severe",
    "alerts_summary",
    "weather_monitoring",
    "real_time_data",
  ],
  skills: ["weather-current", "weather-forecast", "weather-alerts"],
  healthCheck: {
    endpoint: "weather-api",
    timeout: 5000,
    retry: 2,
  },
}
```

### 6.2 Skill Definitions

#### weather-current

```typescript
export const WeatherCurrentSkill: Skill = {
  id: "weather-current",
  agencyId: "agency-weather",
  version: "2.0.0", // Breaking change from mock → real
  name: "Current Weather Conditions",
  capabilities: ["current_conditions", "current_observation"],
  inputSchema: {
    location: { type: "string", description: "City or location name" },
    units: { type: "string", enum: ["metric", "imperial"], default: "metric" },
  },
  outputSchema: WeatherCurrentOutput, // From TDR
  tags: ["weather", "current", "conditions", "real-time"],
  provider: {
    primary: "open-meteo",
    fallback: ["openweathermap"],
  },
}
```

#### weather-forecast

```typescript
export const WeatherForecastSkill: Skill = {
  id: "weather-forecast",
  agencyId: "agency-weather",
  version: "2.0.0",
  name: "Weather Forecast",
  capabilities: ["forecast_daily", "forecast_hourly", "forecast_probabilistic"],
  inputSchema: {
    location: { type: "string" },
    days: { type: "number", minimum: 1, maximum: 16, default: 7 },
    includeHourly: { type: "boolean", default: false },
    includeProbability: { type: "boolean", default: true },
    units: { type: "string", enum: ["metric", "imperial"], default: "metric" },
  },
  outputSchema: WeatherForecastOutput,
  tags: ["weather", "forecast", "meteorology"],
  provider: {
    primary: "open-meteo",
    fallback: ["openweathermap"],
  },
}
```

#### weather-alerts

```typescript
export const WeatherAlertsSkill: Skill = {
  id: "weather-alerts",
  agencyId: "agency-weather",
  version: "2.0.0",
  name: "Weather Alerts",
  capabilities: ["alerts_severe", "alerts_advisory", "alerts_summary"],
  inputSchema: {
    location: { type: "string" },
    severityFilter: {
      type: "array",
      items: { type: "string", enum: ["advisory", "watch", "warning", "emergency"] },
    },
  },
  outputSchema: WeatherAlertsOutput,
  tags: ["weather", "alerts", "safety", "emergency"],
  provider: {
    primary: "openweathermap",
    fallback: ["nws"],
    scope: "alerts-only",
  },
}
```

---

## 7. Routing Configuration

### 7.1 Domain Keywords (Router)

**Target:** 50-100 domain keywords

```typescript
const WEATHER_DOMAIN_KEYWORDS: string[] = [
  // English - Core
  "weather",
  "temperature",
  "forecast",
  "rain",
  "sun",
  "climate",
  "meteorological",
  "humidity",
  "wind",
  "precipitation",
  "cloud",
  "sky",
  "storm",
  "thunder",
  "snow",
  "fog",
  "mist",
  "hail",
  "sleet",
  "drizzle",
  "shower",
  "hot",
  "cold",
  "warm",
  "cool",
  "freezing",
  "frost",
  "sunny",
  "cloudy",
  "partly",
  "overcast",
  "clear",
  "severe",
  "warning",
  "watch",
  "advisory",
  "alert",
  "emergency",
  "today",
  "tomorrow",
  "weekend",
  "hourly",
  "daily",
  "weekly",
  " UV",
  "uvindex",
  "pressure",
  "visibility",
  "dewpoint",
  // English - Extended
  "meteo",
  "meteorology",
  "atmospheric",
  "barometric",
  "heatwave",
  "coldfront",
  "warmfront",
  "occluded",
  "thunderstorm",
  "lightning",
  "tornado",
  "hurricane",
  "cyclone",
  "monsoon",
  "trade winds",
  "jetstream",
  "sunrise",
  "sunset",
  "dawn",
  "dusk",
  "daylight",
  "moon",
  "tides",
  "surf",
  "waves",
  "marine",
  // Italian - Core
  "meteo",
  "temperatura",
  "previsioni",
  "pioggia",
  "sole",
  "clima",
  "umido",
  "vento",
  "precipitazioni",
  "nuvole",
  "cielo",
  "tempesta",
  "neve",
  "nebbia",
  "caldo",
  "freddo",
  "caldo",
  // Italian - Extended
  "maltempo",
  "grandine",
  "temporale",
  "allerta",
  "avviso",
  "mattina",
  "pomeriggio",
  "sera",
  "notte",
  "oggi",
  "domani",
  "settimana",
  "weekend",
  "ferie",
  "vacanza",
  // Spanish
  "clima",
  "tiempo",
  "temperatura",
  "lluvia",
  "sol",
  // French
  "météo",
  "température",
  "pluie",
  "soleil",
]
```

**Target:** 15-25 core keywords

```typescript
const WEATHER_CORE_KEYWORDS: string[] = [
  // Core - high specificity
  "weather",
  "meteo",
  "temperature",
  "forecast",
  "temperatura",
  "pioggia",
  "rain",
  "sun",
  "sole",
  "alert",
  "allerta",
  "warning",
  "avviso",
  "precipitation",
  "precipitazioni",
  "humidity",
  "umidità",
  "wind",
  "vento",
  "snow",
  "neve",
  "storm",
  "tempesta",
  "humid",
  "cloudy",
  "nuvoloso",
]
```

### 7.2 Capability Bootstrap

```typescript
const WEATHER_BOOTSTRAP: CapabilityEntry = {
  domain: "weather",
  agencyId: "agency-weather",
  agentId: "weather-agent",
  capabilities: [
    // Primary capabilities
    { id: "current_conditions", confidence: 0.9 },
    { id: "forecast_daily", confidence: 0.85 },
    { id: "forecast_hourly", confidence: 0.8 },
    { id: "forecast_probabilistic", confidence: 0.75 },
    { id: "alerts_severe", confidence: 0.9 },
    { id: "alerts_summary", confidence: 0.85 },
    // Secondary capabilities
    { id: "current_observation", confidence: 0.7 },
    { id: "weather_monitoring", confidence: 0.8 },
    { id: "real_time_data", confidence: 0.75 },
  ],
  keywords: WEATHER_CORE_KEYWORDS,
  routingHints: {
    scoreThreshold: 0.35,
    minConfidenceForFallback: 0.25,
  },
}
```

---

## 8. Quality Assurance

### 8.1 Test Coverage Requirements

| Area        | Test Type    | Coverage Target                  |
| ----------- | ------------ | -------------------------------- |
| Routing     | Unit         | 100% capability → agency mapping |
| Policy      | Unit         | 100% tool allowlist/blocklist    |
| Integration | Integration  | L0→L1→L2→L3 full flow            |
| Regression  | E2E          | Key user paths                   |
| Runtime     | Verification | 9/9 criteria pass                |

### 8.2 Regression Test Cases

| ID  | Query                    | Expected Agency | Expected Skill   |
| --- | ------------------------ | --------------- | ---------------- |
| R1  | "meteo Milano"           | agency-weather  | weather-current  |
| R2  | "previsioni domani Roma" | agency-weather  | weather-forecast |
| R3  | "alert maltempo"         | agency-weather  | weather-alerts   |
| R4  | "temperature now London" | agency-weather  | weather-current  |
| R5  | "will it rain tomorrow"  | agency-weather  | weather-forecast |
| R6  | "any weather warnings"   | agency-weather  | weather-alerts   |

---

## 9. Approval

| Role      | Name             | Date       | Signature  |
| --------- | ---------------- | ---------- | ---------- |
| Owner     | General Manager  | 2026-04-13 | ⏳ Pending |
| Architect | System Architect | 2026-04-13 | ⏳ Pending |
| Safety    | QA Lead          | 2026-04-13 | ⏳ Pending |

---

**Document Status:** G3 Complete - Ready for G4 Implementation
**Next Milestone:** Implementation Phase (tool-policy.ts, prompt.ts, router.ts, catalog.ts, skills)

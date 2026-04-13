# DISCOVERY BRIEF WEATHER AGENCY V2

**Date:** 2026-04-13
**Status:** G1 - Discovery Complete
**Author:** General Manager / System Analyst
**Reference Plan:** `KILOCLAW_WEATHER_AGENCY_ENHANCEMENT_PLAN_2026-04-13.md`

---

## 1. Executive Summary

### 1.1 Objective

Production-grade enhancement of the Weather Agency from prototype/test status to production-ready component. The goal is to deliver:

- Reliable routing with 95%+ accuracy on weather queries
- Policy deny-by-default enforcement with runtime verification
- Real multi-provider weather data (current, forecast, alerts)
- Probabilistic forecast with uncertainty communication
- Operational alerts and 9/9 runtime verification pass criteria

### 1.2 Current State (As-Is Analysis)

#### Components Already Present

| Component                     | Location                                                              | Status                      |
| ----------------------------- | --------------------------------------------------------------------- | --------------------------- |
| `agency-weather` registration | `packages/opencode/src/kiloclaw/agency/bootstrap.ts`                  | ✅ Present                  |
| Weather capability bootstrap  | `packages/opencode/src/kiloclaw/agency/routing/semantic/bootstrap.ts` | ✅ Present                  |
| Domain `weather` in router    | `packages/opencode/src/kiloclaw/router.ts`                            | ✅ Present                  |
| Weather provider catalog      | `packages/opencode/src/kiloclaw/agency/catalog.ts`                    | ✅ Present (OpenWeatherMap) |
| `weather-current` skill       | `packages/opencode/src/kiloclaw/skills/weather/weather-current.ts`    | ⚠️ Mock data                |
| `weather-forecast` skill      | `packages/opencode/src/kiloclaw/skills/weather/weather-forecast.ts`   | ⚠️ Mock data                |
| `weather-alerts` skill        | `packages/opencode/src/kiloclaw/skills/weather/weather-alerts.ts`     | ⚠️ Mock data                |

#### Critical Gaps Identified

| Gap                                            | Severity | Impact                                                                                  |
| ---------------------------------------------- | -------- | --------------------------------------------------------------------------------------- |
| No `agency-weather` branch in `tool-policy.ts` | **P0**   | Risk of `allowedTools=[]` (deny total), non-deterministic runtime                       |
| No weather context block in `prompt.ts`        | **P0**   | Model receives no domain-specific "CRITICAL TOOL INSTRUCTIONS"                          |
| Weather skills use mock generators             | **P0**   | Non-verifiable, unreliable output for real usage                                        |
| Provider coverage incomplete                   | **P1**   | Missing forecast multi-day, ensemble/probability, CAP/NWS alerts                        |
| Capability naming inconsistency                | **P1**   | Drift between `weather-query`, `weather-current`, `current-weather`, `location-weather` |
| Keyword coverage undersized                    | **P1**   | ~12 weather keywords vs target 50-100 domain + 15-25 core                               |
| No weather policy/routing tests                | **P2**   | Cannot verify policy enforcement or routing correctness                                 |

---

## 2. Scope Definition

### 2.1 In-Scope (Confirmed)

- Real weather data integration: current conditions, multi-day forecast, severe weather alerts
- Uncertainty/probability communication in forecast outputs
- Policy/tool gating with deny-by-default runtime enforcement
- Test suite: unit, integration, regression + runtime verification 9/9
- Multi-provider fallback chain (primary + secondary + tertiary)
- Provider metadata in output: `providerUsed`, `fallbackChainTried`, `errorsByProvider`
- Canonical capability taxonomy for weather domain
- Keyword expansion: 50-100 domain keywords, 15-25 core keywords

### 2.2 Out-of-Scope (Explicitly Excluded)

- Nowcasting radar ML proprietary models
- Trading/weather derivatives integration
- Automatic external writes (no weather-triggered actions)
- Historical data archival
- Weather data caching layer (future optimization P2)

---

## 3. Success Criteria & KPIs

### 3.1 Primary KPIs

| KPI                      | Target                                | Measurement Method                                                                                    |
| ------------------------ | ------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Weather routing accuracy | >= 95%                                | Benchmark query set, correct agency → skill mapping                                                   |
| Policy enforcement       | 0 blocked tools in error              | Runtime verification logs                                                                             |
| Provenance tracking      | 100% responses with provider metadata | Output schema validation                                                                              |
| Response time p95        | < 2.5s (without external timeout)     | Telemetry latency buckets                                                                             |
| Runtime verification     | 9/9 criteria pass                     | `bun run dev -- --print-logs --log-level DEBUG run "previsioni meteo domani a Milano e alert attivi"` |

### 3.2 Runtime Verification 9/9 Pass Criteria

```
1. agencyId=agency-weather ✅
2. confidence>=0.4 ✅
3. policyEnforced=true ✅
4. allowedTools coherent with weather context ✅
5. blockedTools correctly applied ✅
6. no "no tools resolved by policy" errors ✅
7. L3.fallbackUsed=false (if primary available) ✅
8. providerUsed field present ✅
9. uncertainty/confidence field present (for forecasts) ✅
```

---

## 4. Risk Assessment

### 4.1 High-Priority Risks

| Risk                          | Probability | Impact | Mitigation                                                  |
| ----------------------------- | ----------- | ------ | ----------------------------------------------------------- |
| Provider rate limiting        | Medium      | High   | Cache TTL, exponential backoff, fallback provider chain     |
| Unit/timezone inconsistency   | Low         | Medium | Centralized normalization + snapshot tests                  |
| Policy/prompt drift           | Medium      | High   | Automated coherence tests allowlist vs context instructions |
| Hallucination on weather data | Medium      | High   | Responses only from provider payload + mandatory provenance |

### 4.2 Secondary Risks

| Risk                              | Probability | Impact | Mitigation                          |
| --------------------------------- | ----------- | ------ | ----------------------------------- |
| OpenWeatherMap API key management | Low         | Medium | Config-based, support multiple keys |
| NWS API availability              | Low         | Low    | Fallback to Open-Meteo              |
| Coordinate geocoding failures     | Low         | Low    | Multiple geocoding providers        |

---

## 5. Implementation Approach

### 5.1 Phased Delivery (Protocol V2)

| Phase | Gate                  | Deliverable                                             | Status      |
| ----- | --------------------- | ------------------------------------------------------- | ----------- |
| G1    | Discovery Brief       | This document                                           | ✅ Complete |
| G2    | Tool Decision Record  | Provider evaluation, policy fallback, output schema     | 🔄 Next     |
| G3    | Agency Manifest Draft | Capability taxonomy, intent→tool mapping, policy matrix | ⏳ Pending  |
| G4    | Implementation        | Core files + weather skills refactor                    | ⏳ Pending  |
| G5    | Verification          | Tests + runtime verification 9/9                        | ⏳ Pending  |
| G6    | Rollout               | Changelog, runbook, telemetry alarms                    | ⏳ Pending  |

### 5.2 Tool Strategy (Decision Record Synthesized)

**Primary Tool:** Internal weather API tool (`weather-api`) using catalog providers
**Fallback:** Secondary provider in catalog
**Avoided for core queries:** `websearch`/`webfetch` as primary path

**Rationale:**

- Reduced hallucination (structured data vs scraped content)
- Better auditability (providerUsed/fallbackChain/errors fully tracked)
- Predictable latency/costs

### 5.3 Provider Evaluation

| Provider       | Coverage                   | Pros                                | Cons                           | Status                |
| -------------- | -------------------------- | ----------------------------------- | ------------------------------ | --------------------- |
| Open-Meteo     | Global, 16-day forecast    | Free, multi-model, high reliability | No alerts native               | **Primary**           |
| OpenWeatherMap | Global, current + forecast | Established, alerts available       | Rate limits, API key required  | **Secondary**         |
| NWS/NOAA       | US alerts only             | Official, CAP format                | Limited geography, rate limits | **Tertiary (alerts)** |

---

## 6. Dependencies & Prerequisites

### 6.1 Internal Dependencies

- `session/tool-policy.ts` - Must add `agency-weather` branch
- `session/prompt.ts` - Must add weather context block
- `kiloclaw/router.ts` - Must expand weather keywords
- `kiloclaw/agency/catalog.ts` - Must extend weather providers
- `kiloclaw/agency/routing/semantic/bootstrap.ts` - Must realign capabilities

### 6.2 External Dependencies

- Open-Meteo API accessibility (no key required)
- OpenWeatherMap API key (existing or new)
- NWS API accessibility (no key required)

---

## 7. Next Steps (G2 Entry)

1. **Tool Decision Record Creation**
   - Formal provider evaluation with API contracts
   - Policy fallback/retry/timeout/circuit-break definitions
   - Unified weather output schema (current/forecast/alerts + uncertainty)

2. **Stakeholder Sign-off Required**
   - Confirm scope exclusion (nowcasting ML, trading derivatives)
   - Approve KPI targets
   - Confirm provider priority (Open-Meteo primary)

---

## 8. Approval

| Role      | Name             | Date       | Signature  |
| --------- | ---------------- | ---------- | ---------- |
| Owner     | General Manager  | 2026-04-13 | ⏳ Pending |
| Architect | System Architect | 2026-04-13 | ⏳ Pending |
| Safety    | QA Lead          | 2026-04-13 | ⏳ Pending |

---

**Document Status:** G1 Complete - Ready for G2 Entry
**Next Milestone:** Tool Decision Record (due before G4 implementation)

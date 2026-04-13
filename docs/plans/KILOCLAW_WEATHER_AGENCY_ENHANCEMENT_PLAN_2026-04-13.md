# KILOCLAW_WEATHER_AGENCY_ENHANCEMENT_PLAN_2026-04-13

## 1) Obiettivo

Potenziamento dell’agenzia meteo da prototipo/test a componente production-grade, allineata a:
- `docs/guide/KILOCLAW_AGENCY_AGENT_SKILL_TOOL_IMPLEMENTATION_GUIDE_2026-04-07.md`
- `docs/agencies/plans/KILOCLAW_AGENCY_IMPLEMENTATION_PROTOCOL_V2_2026-04-12.md`

Output atteso: routing affidabile, policy deny-by-default realmente enforce, dati meteo reali multi-provider, forecast probabilistici/comunicazione incertezza, alert operativi e test end-to-end con runtime verification 9/9.

---

## 2) Analisi stato attuale (as-is)

### 2.1 Punti già presenti
- `agency-weather` registrata in `packages/opencode/src/kiloclaw/agency/bootstrap.ts`.
- Capability weather bootstrap in `packages/opencode/src/kiloclaw/agency/routing/semantic/bootstrap.ts`.
- Domain `weather` in `packages/opencode/src/kiloclaw/router.ts`.
- Provider meteo presente nel catalogo (`openweathermap`) in `packages/opencode/src/kiloclaw/agency/catalog.ts`.
- Skill weather esistenti:
  - `weather-current`
  - `weather-forecast`
  - `weather-alerts`

### 2.2 Gap critici rispetto a guida/protocollo
1. **Tool-policy non allineata all’agenzia weather**
   - In `session/tool-policy.ts` non esiste blocco `agency-weather` in `resolveAgencyAllowedTools`.
   - Impatto: rischio `allowedTools=[]` (deny totale non gestita), comportamento non deterministico lato runtime.

2. **Context block prompt mancante per weather**
   - In `session/prompt.ts` presenti blocchi knowledge/development/nba, non weather.
   - Impatto: il modello non riceve istruzioni “CRITICAL TOOL INSTRUCTIONS” dominio-specifiche.

3. **Skill weather con dati mock**
   - `weather-current.ts`, `weather-forecast.ts`, `weather-alerts.ts` usano generatori/mock locali.
   - Impatto: output non verificabile / non affidabile per uso reale.

4. **Copertura provider incompleta**
   - Catalogo weather usa principalmente current weather OpenWeatherMap.
   - Mancano integrazioni native robuste per:
     - forecast multi-day strutturato
     - probabilità/ensemble
     - alert istituzionali (es. CAP/NWS dove applicabile)

5. **Incoerenza capability naming**
   - Diverse varianti (`weather-query`, `weather-current`, `current-weather`, `location-weather`, ecc.).
   - Impatto: drift mapping L1→L3 e policy/tool mismatch.

6. **Keyword coverage weather sottodimensionata**
   - Set ridotto in router/core keywords rispetto target protocollo (50-100 keyword dominio, 15-25 core).

7. **Test coverage non sufficiente sui gate weather**
   - Mancano test dedicati su policy weather, blocklist tool, runtime verification specifica weather.

---

## 3) Best practice esterne (evidenze online)

## 3.1 NOAA / NWS API
Fonti:
- https://weather-gov.github.io/api/general-faqs
- https://www.weather.gov/documentation/services-web-alerts

Indicazioni chiave:
- Workflow forecast robusto: **geocoding → lat/lon → `/points` → endpoint forecast/hourly**.
- Uso corretto caching HTTP (`Cache-Control`, `Last-Modified`), evitare cache-busting artificiale.
- Inserire **User-Agent identificabile** nelle chiamate.
- Rate-limit operativo: polling non più frequente di ~30s sugli alert endpoint.
- Alert in formati interoperabili (JSON-LD/CAP), utili per sistemi di allerta e decision support.

## 3.2 Open-Meteo
Fonte:
- https://open-meteo.com/en/docs

Indicazioni chiave:
- Supporto multi-modello, forecast fino a 16 giorni, timezone auto/localizzazione.
- Variabili ricche (current/hourly/daily), incluse precipitation probability e weather codes WMO.
- Endpoint idoneo come provider primario read-only ad alta copertura.

## 3.3 ECMWF
Fonte:
- https://www.ecmwf.int/en/forecasts

Indicazioni chiave:
- Approccio ensemble: comunicare non solo “valore singolo” ma range/likelihood/scenari.
- Quality monitoring continuo come parte del prodotto forecast.

---

## 4) Strategia target (to-be)

## 4.1 Principi architetturali
- Deny-by-default reale (policy runtime hard, non prompt-only).
- Un solo punto di mapping capability→tool (`session/tool-policy.ts`).
- Provider-agnostic core (niente hardcode vendor nel router/orchestrator).
- Output meteo **strutturato + confidenza/incertezza + provenance**.

## 4.2 Tool strategy (Decision Record sintetico)
- **Primary**: tool interno weather dedicato (es. `weather-api`) che usa catalog provider weather.
- **Fallback**: provider weather secondario nel catalogo.
- **Da evitare** per query weather core: `websearch`/`webfetch` come path principale.

Razionale:
- riduzione hallucination
- migliore auditabilità providerUsed/fallbackChain/errors
- latenza/costi più prevedibili

---

## 5) Piano implementativo per fasi (Protocollo V2)

## Fase 1 — Discovery (G1)
Deliverable:
- `Discovery Brief` weather enhancement (scope/KPI/risk).

Scope proposto:
- In: current/forecast/alerts reali, incertezza forecast, policy/tool gating, test/runtime verification.
- Out: nowcasting radar ML proprietario, trading/weather derivatives, scritture esterne automatiche.

KPI minimi:
- Routing weather corretto >= 95% su query benchmark.
- 0 invocazioni tool bloccati in runtime weather tests.
- 100% risposte weather con provenance provider.
- p95 risposta entro soglia definita (es. < 2.5s, senza timeout esterni).

## Fase 2 — Research tools/skills (G2)
Deliverable:
- `Tool Decision Record` formale weather.

Attività:
1. Valutazione provider meteo (Open-Meteo, OpenWeatherMap, NWS alerts per area supportata).
2. Definizione policy fallback, retry, timeout, circuit-break.
3. Schema output unico weather (current/forecast/alerts + uncertainty).

## Fase 3 — Design architetturale (G3)
Deliverable:
- `Agency Manifest Draft` weather v2.

Design decisions:
1. Capability taxonomy canonica weather (ridurre sinonimi divergenti).
2. Mapping esplicito Intent→Agency→Agent→Skill→Tool.
3. PolicyLevel standard:
   - SAFE: read-only weather query/forecast/alerts
   - NOTIFY/CONFIRM/HITL/DENY: non necessari salvo future azioni esterne
4. Provider metadata obbligatoria in output (`providerUsed`, `fallbackChainTried`, `errorsByProvider`).

## Fase 4 — Implementazione (G4)

### 4.1 File core da aggiornare (priorità alta)
1. `packages/opencode/src/session/tool-policy.ts`
   - aggiungere WEATHER allowlist
   - aggiungere `mapWeatherCapabilitiesToTools()`
   - aggiungere branch `agency-weather` in `resolveAgencyAllowedTools()`

2. `packages/opencode/src/session/prompt.ts`
   - aggiungere context block `agency-weather` con CRITICAL TOOL INSTRUCTIONS
   - allineamento 1:1 con allowlist tool-policy

3. `packages/opencode/src/kiloclaw/router.ts`
   - espansione `DOMAIN_KEYWORDS.weather` (target 50-100)
   - espansione `CORE_KEYWORDS.weather` (target 15-25)
   - mantenere formula score attuale (sqrt + core bonus + type boost)

4. `packages/opencode/src/kiloclaw/agency/routing/semantic/bootstrap.ts`
   - riallineamento capability weather canoniche e keyword coverage

5. `packages/opencode/src/kiloclaw/agency/catalog.ts`
   - estendere weather providers + fallback chain + health checks + timeout/retry

### 4.2 File weather skill/agent da rifattorizzare
- `packages/opencode/src/kiloclaw/skills/weather/weather-current.ts`
- `packages/opencode/src/kiloclaw/skills/weather/weather-forecast.ts`
- `packages/opencode/src/kiloclaw/skills/weather/weather-alerts.ts`
- `packages/opencode/src/kiloclaw/agency/agents/weather-current.ts`
- `packages/opencode/src/kiloclaw/agency/agents/forecaster.ts`
- `packages/opencode/src/kiloclaw/agency/agents/alerter.ts`

Obiettivi tecnici:
- eliminare mock data
- standardizzare output schema
- aggiungere campo uncertainty/confidence per forecast
- normalizzare unità (C/F, vento, precip) e timezone locale

## Fase 5 — Verifica (G5)

### 5.1 Test obbligatori
- `packages/opencode/test/session/tool-policy.test.ts`
  - nuovi test weather allowlist/blocklist
- nuovi test routing weather in `packages/opencode/test/kiloclaw/*`
  - query weather → `agency-weather`
  - confidence >= 0.4
- integration test intent→capability→tool weather
- regression test su bug storici (tool non autorizzati, mismatch policy/context)

### 5.2 Runtime verification obbligatoria (9/9)
Comando:
```bash
bun run dev -- --print-logs --log-level DEBUG run "previsioni meteo domani a Milano e alert attivi"
```
Pass criteria:
- `agencyId=agency-weather`
- `confidence>=0.4`
- `policyEnforced=true`
- `allowedTools` coerenti
- `blockedTools` corretti
- nessun `no tools resolved by policy`
- `L3.fallbackUsed=false` (se primario disponibile)

## Fase 6 — Rollout diretto (G6)
- changelog tecnico
- runbook operativo weather provider outages
- owner/on-call + threshold allarmi telemetry

---

## 6) Backlog operativo (prioritizzato)

P0 (bloccanti):
1. Tool-policy weather + context block weather.
2. Rimozione mock weather skills.
3. Test policy/routing weather.

P1:
4. Multi-provider weather in catalog + fallback metadata completi.
5. Uncertainty model (ensemble/probability fields) nel forecast output.
6. Keyword/core-keyword tuning weather.

P2:
7. Ottimizzazioni UX risposta meteo (riassunto + tabella + raccomandazioni).
8. Caching locale short-lived per ridurre chiamate duplicate.

---

## 7) Rischi e mitigazioni

1. **Rate limit provider**
   - Mitigazione: cache TTL, backoff, fallback provider.

2. **Incoerenza unità/timezone**
   - Mitigazione: normalizzazione centralizzata + test snapshot.

3. **Drift policy/prompt**
   - Mitigazione: test automatico di coerenza allowlist vs context instructions.

4. **Hallucination su dati meteo**
   - Mitigazione: risposte solo da payload provider + provenance obbligatoria.

---

## 8) Definition of Done

- Weather agency usa dati reali (no mock) su current/forecast/alerts.
- Policy deny-by-default attiva e verificata per `agency-weather`.
- Context block weather presente e allineato con tool-policy.
- Test unit/integration/regression verdi.
- Runtime verification 9/9 superata con evidenze log.
- Documentazione aggiornata in `docs/` con runbook e note operative.

---

## 9) File di supporto da produrre nella prossima iterazione

- `docs/agencies/weather/DISCOVERY_BRIEF_WEATHER_V2.md`
- `docs/agencies/weather/TOOL_DECISION_RECORD_WEATHER_V2.md`
- `docs/agencies/weather/AGENCY_MANIFEST_DRAFT_WEATHER_V2.md`
- `docs/agencies/weather/GO_NO_GO_REVIEW_WEATHER_V2.md`

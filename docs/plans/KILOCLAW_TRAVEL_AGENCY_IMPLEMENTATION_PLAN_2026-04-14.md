# KILOCLAW_TRAVEL_AGENCY_IMPLEMENTATION_PLAN_2026-04-14

Implementazione operativa con gate, policy e verifiche

---

## Definisci contesto

Documento allineato a:

1. `docs/guide/KILOCLAW_AGENCY_AGENT_SKILL_TOOL_IMPLEMENTATION_GUIDE_V2_2026-04-14.md`
2. `docs/agencies/plans/KILOCLAW_AGENCY_IMPLEMENTATION_PROTOCOL_V2_2026-04-12.md`

Obiettivo: implementare una nuova `agency-travel` end-to-end con enforcement runtime hard, deny-by-default e rollout diretto post-G5.

---

## Applica fasi G1-G6

| Fase         | Obiettivo                                        | Deliverable                           | Gate                                    |
| ------------ | ------------------------------------------------ | ------------------------------------- | --------------------------------------- |
| G1 Discovery | chiarire requisiti, confini, KPI, rischi         | Discovery Brief approvato             | requisiti non ambigui, KPI misurabili   |
| G2 Research  | confrontare tool nativi vs MCP/API esterne       | Tool Decision Record                  | scorecard 1-5 + rationale verificabile  |
| G3 Design    | definire catena Intent→Agency→Agent→Skill→Tool   | Agency Manifest Draft + policy matrix | deny-by-default + allowlist esplicita   |
| G4 Implement | realizzare componenti minime nei 5 file canonici | codice + config + manifest            | build/test verdi + routing test         |
| G5 Verifica  | validare funzionalità, policy e telemetria       | report test + contract telemetry      | checklist completa + 9/9 runtime        |
| G6 Rollout   | rilascio nel binary e passaggio ownership        | runbook + changelog + on-call         | go-live autorizzato, metriche in soglia |

---

## Compila discovery brief

### Scope in

- Individuazione e comparazione mete.
- Ottimizzazione date su disponibilità utente + prezzi stimati.
- Trasporti A/R destinazione (voli/treni/bus).
- Alloggi con deep-link prenotazione.
- Trasporti locali e autonoleggio.
- Ristoranti e supporto prenotazione.
- Attività/eventi con pianificazione e prenotazione.
- Supporto in viaggio per necessità/emergenze.

### Scope out

- Esecuzione pagamento diretto nel primo rilascio.
- Emissione biglietteria proprietaria.
- Gestione assicurativa o consulenza legale vincolante.
- Decisioni mediche automatiche.

### KPI

- Routing accuracy dominio travel ≥ 95%.
- Tempo medio proposta itinerario (query standard) ≤ 12s.
- Completezza piano (trasporto+alloggio+attività) ≥ 90%.
- Zero invocazioni tool fuori allowlist.
- Runtime verification pass rate 9/9 = 100%.

### Rischi principali

- Dati prezzo/availability non aggiornati o incompleti.
- Drift del routing su query miste non-travel.
- Escalation emergenze non gestita in tempo.
- Scope PCI eccessivo se si introduce payment write.

---

## Registra decisione tool

### Usa scorecard pesata (1-5)

Pesi dominio travel:

- Sicurezza 0.30
- Affidabilità 0.25
- Performance 0.20
- Token/context cost 0.15
- Maintenance 0.10

| Opzione                                             | Performance | Context cost | Affidabilità | Sicurezza | Maintenance | Score pesato |
| --------------------------------------------------- | ----------: | -----------: | -----------: | --------: | ----------: | -----------: |
| A Native-only (web search generico)                 |           2 |            2 |            2 |         3 |           4 |         2.45 |
| B API-only esterne                                  |           4 |            4 |            3 |         3 |           2 |         3.35 |
| C Ibrida (API specializzate + fallback controllato) |           4 |            4 |            4 |         4 |           3 |     **3.95** |

### Decidi

Scelta: **Opzione C Ibrida**.  
Rationale: migliora copertura travel e mantiene controllo policy/telemetry senza accoppiare il core a vendor specifici.

Fallback: provider alternativo per capability critiche, con trigger su timeout, quota esaurita e response validation failure.

---

## Mappa manifest

### Definisci catena Intent→Agency→Agent→Skill→Tool

- Intent: pianificare/ottimizzare/prenotare viaggio in sicurezza.
- Agency: `agency-travel`.
- Agent: `travel-planner`, `travel-booking-assistant`, `travel-emergency-assistant`.
- Skill: moduli specializzati per mete, date, trasporti, alloggi, attività, emergenze.
- Tool: allowlist travel + mapping capability-based.

### Imposta metadati draft

- Agency ID: `agency-travel`
- Domain: `travel`
- Version: `1.0.0`
- Deny-by-default: `true`
- Data classification: `confidential` per profilo viaggio utente, `internal` per telemetry tecnica

---

## Modifica i 5 file

### 1) `packages/opencode/src/kiloclaw/agency/bootstrap.ts`

Inserire definizione `agency-travel` in `agencyDefinitions[]` con:

- `allowedCapabilities` travel
- `deniedCapabilities` ad alto rischio
- `maxRetries`, `requiresApproval`, `dataClassification`
- `providers` primario/fallback
- `metadata` (wave, description)

### 2) `packages/opencode/src/kiloclaw/agency/routing/semantic/bootstrap.ts`

Aggiungere `bootstrapTravelCapabilities()` e chiamarla in `bootstrapAllCapabilities()`.  
Registrare capability travel con `domain: "travel"` e keywords specifiche IT+EN.

### 3) `packages/opencode/src/kiloclaw/router.ts`

Aggiungere `travel` in `DOMAIN_KEYWORDS` (50-100 keyword).  
Aggiungere `travel` in `CORE_KEYWORDS` (15-25 keyword ad alta specificità).

### 4) `packages/opencode/src/session/prompt.ts`

Aggiungere blocco agency context per `agency-travel` con:

- routing confidence/reason
- **CRITICAL TOOL INSTRUCTIONS**
- divieto esplicito uso tool non allowlist
- regole anti-allucinazione prezzi/disponibilità

### 5) `packages/opencode/src/session/tool-policy.ts`

Aggiungere `TRAVEL_TOOL_ALLOWLIST` e `mapTravelCapabilitiesToTools(capabilities)`.  
In `resolveAgencyAllowedTools()` applicare merge deduplicato tra allowlist statica e mapping capability-based.

---

## Definisci policy runtime

### Applica matrice PolicyLevel

| Azione                                        | Livello |
| --------------------------------------------- | ------- |
| Ricerca mete, prezzi, weather, POI            | SAFE    |
| Generazione itinerario e reminder             | NOTIFY  |
| Apertura deep-link di prenotazione            | CONFIRM |
| Invio dati sensibili a terze parti            | HITL    |
| Pagamento automatico non confermato           | DENY    |
| Prenotazione irreversibile senza approvazione | DENY    |

### Applica trigger HITL travel

- Costo totale > soglia configurata utente.
- Prenotazioni con penale elevata o non rimborsabile.
- Viaggi con minori, disabilità o richiesta assistenza medica.
- Operazioni su documenti sensibili (passaporto, PNR completo).
- Richiesta contatto autorità/ambasciata o emergenza sanitaria.

Regola hard: approvazione mancante/scaduta/incoerente ⇒ `DENY`.

---

## Elenca capability

Catalogo capability (32) mappato a skill e tool.

| Capability                | Skill                         | Tool                             |
| ------------------------- | ----------------------------- | -------------------------------- |
| destination-discovery     | skill-destination-discovery   | travel_destination_search        |
| destination-compare       | skill-destination-compare     | travel_destination_compare       |
| budget-fit-check          | skill-budget-fit              | travel_budget_estimator          |
| seasonality-analysis      | skill-seasonality             | travel_weather_check             |
| visa-doc-check            | skill-travel-doc-check        | travel_advisory_info             |
| date-window-optimization  | skill-date-optimizer          | travel_price_calendar            |
| multi-city-optimizer      | skill-route-optimizer         | travel_itinerary_optimizer       |
| flight-search             | skill-flight-search           | travel_flight_search             |
| flight-compare            | skill-flight-compare          | travel_flight_compare            |
| rail-search               | skill-rail-search             | travel_rail_search               |
| bus-search                | skill-bus-search              | travel_bus_search                |
| transfer-search           | skill-transfer-search         | travel_transfer_search           |
| hotel-search              | skill-hotel-search            | travel_hotel_search              |
| hotel-compare             | skill-hotel-compare           | travel_hotel_compare             |
| booking-link-hotel        | skill-booking-assist          | travel_booking_link              |
| cancellation-policy-check | skill-policy-parser           | travel_rate_policy_parse         |
| local-transport-plan      | skill-local-mobility          | travel_local_transport_plan      |
| car-rental-search         | skill-car-rental              | travel_car_rental_search         |
| parking-check             | skill-local-mobility          | travel_parking_info              |
| restaurant-search         | skill-restaurant-search       | travel_restaurant_search         |
| restaurant-availability   | skill-restaurant-availability | travel_restaurant_booking_link   |
| poi-search                | skill-poi-search              | travel_place_search_google       |
| poi-alt-search            | skill-poi-search              | travel_place_search_opentripmap  |
| activity-search           | skill-activity-search         | travel_activity_search           |
| event-search              | skill-event-search            | travel_event_search_ticketmaster |
| event-booking-link        | skill-booking-assist          | travel_event_booking_link        |
| itinerary-build           | skill-itinerary-build         | travel_itinerary_builder         |
| itinerary-balance         | skill-itinerary-balance       | travel_itinerary_optimizer       |
| weather-risk-check        | skill-weather-risk            | travel_weather_check             |
| emergency-nearby          | skill-emergency-support       | travel_emergency_info            |
| advisory-monitor          | skill-advisory-monitor        | travel_advisory_info             |
| audit-log                 | skill-compliance-log          | travel_audit_log_write           |

---

## Configura keyword

### Definisci DOMAIN_KEYWORDS travel (80, IT+EN)

`viaggio, vacanza, itinerario, meta, destinazione, partire, ritorno, andata, soggiorno, city break, weekend lungo, ponte, ferie, disponibilità, finestre date, prezzi voli, volo economico, coincidenza, scalo, bagaglio, hotel, albergo, appartamento, ostello, resort, b&b, alloggio, check-in, check-out, cancellazione gratuita, non rimborsabile, transfer, navetta, treno, bus, pullman, autonoleggio, noleggio auto, patente, pedaggi, parcheggio, trasporto locale, metro, tram, pass turistico, ristorante, trattoria, cucina locale, prenotazione tavolo, attività, tour guidato, museo, mostra, spettacolo, concerto, evento live, biglietti evento, things to do, points of interest, POI, mappe, geocoding, routing, meteo viaggio, pioggia, temperatura, allerte meteo, sicurezza viaggio, advisory, emergenza, ospedale vicino, farmacia vicino, ambasciata, consolato, travel plan, travel booking, trip optimizer, best time to go`

### Definisci CORE_KEYWORDS travel (20, IT+EN)

`itinerario viaggio, confronto mete, ottimizza date viaggio, volo+hotel, multi city trip, prenotazione alloggio, trasporti A/R, noleggio auto aeroporto, attività turistiche, pianifica giornata, biglietti concerto viaggio, ristorante con prenotazione, weather risk travel, travel advisory, emergency support travel, nearest hospital travel, embassy contact, trip cost optimizer, fare calendar, travel booking link`

---

## Applica allowlist tool

### Imposta deny-by-default

Tutti i tool sono negati quando `agencyContext.agencyId === "agency-travel"` e non sono in allowlist.

### Esplicita allowlist iniziale

`travel_destination_search, travel_destination_compare, travel_budget_estimator, travel_price_calendar, travel_flight_search, travel_flight_compare, travel_rail_search, travel_bus_search, travel_transfer_search, travel_hotel_search, travel_hotel_compare, travel_booking_link, travel_rate_policy_parse, travel_local_transport_plan, travel_car_rental_search, travel_parking_info, travel_restaurant_search, travel_restaurant_booking_link, travel_place_search_google, travel_place_search_opentripmap, travel_activity_search, travel_event_search_ticketmaster, travel_event_booking_link, travel_itinerary_builder, travel_itinerary_optimizer, travel_weather_check, travel_emergency_info, travel_advisory_info, travel_audit_log_write`

### Nega esplicitamente

`bash`, file write non richiesto, tool finanziari, tool legali, tool esterni non catalogati, qualunque tool non mappato in `mapTravelCapabilitiesToTools`.

---

## Verifica test plan

### Esegui test unit

- mapping capability→tool in `tool-policy.ts`
- deny-by-default enforcement
- parser policy livelli SAFE/NOTIFY/CONFIRM/HITL/DENY

### Esegui test integration

- pipeline intent→agency→agent→skill→tool con provider primario/fallback
- rispetto allowlist in sessione reale
- eventi telemetry obbligatori (policy denied, fallback used)

### Esegui test routing

- query travel pure, query miste, query ambigue
- confidence travel >= 0.4
- zero false positive verso domini non travel critici

### Esegui runtime verification 9/9 (obbligatorio)

1. `agencyId=agency-travel`
2. `confidence >= 0.4`
3. `allowedTools/blockedTools` coerenti
4. `policyEnforced=true`
5. `allowedTools` solo permessi
6. `blockedTools` non invocati
7. `capabilities` L1 corrette
8. assenza `no tools resolved by policy`
9. `L3.fallbackUsed=false` nei casi nominali

---

## Conduci ricerca API

Dati raccolti da fonti ufficiali note e in modalità conservativa.  
Quote, pricing e limiti possono cambiare, quindi vanno riverificati in onboarding tecnico.

| Categoria               | API                                             | Use case                                | Free tier/limit noto                                                                                    | Pro                                        | Contro                                           | Policy risk                             |
| ----------------------- | ----------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------------------ | --------------------------------------- |
| Flight/transport search | Amadeus Self-Service                            | ricerca voli/offerte e contenuti travel | rate limits ufficiali: AI/Partner 20 tps test+prod, altre API 10 tps test e 40 tps prod                 | copertura travel ampia, ambienti test/prod | quote e condizioni commerciali variabili per API | dipendenza quota/rate, possibili 429    |
| Flight/transport search | Aviationstack                                   | stato volo e dati operativi             | Free plan indicato a 100 richieste/mese                                                                 | onboarding rapido, schema semplice         | free molto limitata                              | rischio esaurimento quota               |
| Hotel/accommodation     | Amadeus Hotel APIs                              | ricerca alloggi e offerte               | limiti soggetti a piano/account; usare rate limits ufficiali + verifica pricing corrente                | integrazione unificata con trasporti       | disponibilità dipende da copertura provider      | mismatch availability vs booking finale |
| Activities/events       | Ticketmaster Discovery API                      | eventi/spettacoli e discovery           | default pubblico: 5000 richieste/giorno, 5 req/sec, 429 su superamento                                  | dataset eventi forte su live entertainment | copertura geografica non uniforme                | quota giornaliera e policy branding     |
| Activities/events       | Amadeus Tours & Activities                      | attività turistiche                     | soggetta a limiti rate Amadeus AI/Partner (20 tps)                                                      | coerente con stack travel                  | dipende da mercati coperti                       | rischio incompletezza inventario        |
| Restaurants/POI         | Google Places                                   | ricerca ristoranti/POI e dettagli       | modello pay-as-you-go con soglie gratuite per SKU (post marzo 2025)                                     | qualità POI alta, ecosistema maturo        | cost control necessario per SKU/field mask       | rischio costo inatteso                  |
| Restaurants/POI         | OpenTripMap                                     | POI turistici e geodata                 | licenza ODbL, uso/caching più flessibile                                                                | buono per discovery culturale              | qualità variabile per area                       | obblighi licenza/attribuzione ODbL      |
| Maps/geocoding/routing  | Google Maps Platform (Geocoding/Routes)         | geocoding, routing, ETA                 | billing per SKU; nota storica: credito $200/mese fino al 28-02-2025                                     | routing affidabile e completo              | costo per evento da governare                    | budget overrun se non filtrato          |
| Maps/geocoding/routing  | OpenTripMap (supporto POI geospaziale)          | arricchimento mappe POI                 | ODbL con policy permissiva di uso dati                                                                  | utile come fallback POI                    | non sostituisce routing premium                  | compliance licenza dati                 |
| Weather                 | OpenWeather                                     | meteo corrente/forecast/risk            | free pubblica: 60 call/min e 1,000,000/mese; One Call 3.0: prime 1000 call/giorno free poi pay-per-call | facile integrazione, copertura globale     | differenze tra prodotti e piani                  | limiti variabili per piano/account      |
| Advisories/emergency    | OpenWeather Alerts + Places (ospedali/farmacie) | alert meteo e punti utili emergenza     | alert inclusi nel prodotto meteo usato, Places a billing SKU                                            | supporto operativo immediato in viaggio    | non è advisory governativo completo              | richiede disclaimer e escalation umana  |

### Applica best practice operative

- Separare read planning da write booking con livelli policy diversi.
- Salvare `providerUsed`, `fallbackChainTried`, `quotaState` nei metadata tool.
- Normalizzare valuta/fuso/orari prima dell’ottimizzazione date.
- Usare cache breve su ricerche read-only per ridurre quota burn.
- Inserire disclaimer “prezzo e disponibilità da confermare al checkout”.

### Cita fonti

1. Amadeus API Rate Limits: `https://developers.amadeus.com/self-service/apis-docs/guides/developer-guides/api-rate-limits/`
2. Ticketmaster Getting Started + Discovery API v2: `https://developer.ticketmaster.com/products-and-docs/apis/getting-started/` , `https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/`
3. Aviationstack Pricing: `https://aviationstack.com/pricing`
4. OpenWeather Pricing/FAQ/One Call 3.0: `https://openweathermap.org/price` , `https://openweathermap.org/faq` , `https://openweathermap.org/api/one-call-3`
5. Google Maps Platform billing/pricing/FAQ: `https://developers.google.com/maps/billing-and-pricing/pricing` , `https://developers.google.com/maps/billing-and-pricing/overview` , `https://developers.google.com/maps/billing-and-pricing/faq`
6. OpenTripMap API: `https://dev.opentripmap.org`

---

## Gestisci compliance

### Applica GDPR

- Data minimization: salvare solo dati indispensabili a routing e piano viaggio.
- Purpose limitation: separare profilo preferenze da log tecnico.
- Retention breve e pseudonimizzazione ID sessione nei log.

### Riduci PCI scope

- Niente storage PAN/CVV.
- Solo deep-link verso checkout provider esterno.
- Nessun payment write nel rilascio v1.

### Garantisci audit trail

- Correlation ID end-to-end L0-L3.
- Log obbligatori: agencyId, capability, allowedTools, blockedTools, providerUsed, fallback.
- Eventi dedicati: `PolicyDeniedEvent`, `FallbackUsedEvent`, `EmergencyEscalationEvent`.

### Definisci emergency escalation

- Trigger: rischio sicurezza persona, richiesta sanitaria urgente, perdita documenti.
- Flusso: blocco automazione, HITL immediato, guida verso numeri locali/ambasciata.
- SLA interno: presa in carico assistente umano < 5 minuti in orario coperto.

---

## Pianifica roadmap

| Settimana | Obiettivo           | Output                                           |
| --------- | ------------------- | ------------------------------------------------ |
| W1        | G1 Discovery        | brief firmato, KPI, rischio/compliance           |
| W2        | G2 Research         | decision record, catalogo API, fallback strategy |
| W3        | G3 Design           | manifest draft, policy matrix, keyword set       |
| W4        | G4 Implement part 1 | bootstrap + router + capability registry         |
| W5        | G4 Implement part 2 | prompt context + tool-policy + allowlist         |
| W6        | G5 Verifica part 1  | unit/integration/routing suite green             |
| W7        | G5 Verifica part 2  | runtime verification 9/9 + report                |
| W8        | G6 Rollout          | release, runbook, owner on-call, monitor         |

---

## Esegui runbook

1. Freeze scope dopo G3 e apri branch implementazione.
2. Implementa solo i 5 file canonici e test obbligatori.

3. Esegui `typecheck`, unit, integration, routing test e correggi blocchi.
4. Esegui runtime verification reale con log DEBUG.

5. Compila Go/No-Go con evidenze 9/9.
6. Rilascia in main con monitoraggio stretto 48h.

7. Monitora latenza, quota error, policy deny e fallback rate.
8. Applica rollback se regressioni severe o policy breach.

---

## Dettaglia implementazione tecnica (senza rimuovere il piano esistente)

Questa sezione estende il piano con dettaglio operativo G4/G5 richiesto.

### Architettura runtime travel (componenti concreti)

```text
Intent (utente)
  -> HybridRouter L0-L3
  -> agency-travel
      -> travel-planner agent
          -> skill-* (discovery/date/transport/hotel/activity)
              -> travel_* tool (allowlist)
                  -> provider adapters (Amadeus/Ticketmaster/OpenWeather/etc.)
                      -> normalizer -> ranking -> itinerary composer
      -> travel-booking-assistant agent
          -> deep-link builder + policy/hitl checker
      -> travel-emergency-assistant agent
          -> emergency orchestrator + advisory/weather + escalation
```

### Struttura file consigliata (implementazione modulare)

> Nota: i 5 file canonici restano obbligatori. Qui vengono definiti i file applicativi aggiuntivi per una delivery completa e verificabile.

- `packages/opencode/src/kiloclaw/agency/travel/types.ts`
  - Zod schema dominio travel (Query, Offer, Itinerary, EmergencyCase)
- `packages/opencode/src/kiloclaw/agency/travel/normalizer.ts`
  - Normalizzazione prezzi/valute/fuso orario/provider
- `packages/opencode/src/kiloclaw/agency/travel/ranking.ts`
  - Scoring comparativo (prezzo, durata, rating, rischio meteo, policy)
- `packages/opencode/src/kiloclaw/agency/travel/itinerary.ts`
  - Costruzione piano giornaliero con vincoli e fallback
- `packages/opencode/src/kiloclaw/agency/travel/policy.ts`
  - Guardrail di dominio + trigger HITL travel
- `packages/opencode/src/kiloclaw/agency/travel/adapters/*.ts`
  - Adapter provider-specific (Amadeus, Ticketmaster, OpenWeather, ecc.)
- `packages/opencode/src/kiloclaw/agency/travel/tools/*.ts`
  - Tool nativi `travel_*` con metadata provider/fallback
- `packages/opencode/src/kiloclaw/agency/travel/skills/*.ts`
  - Skill atomiche registrate e riusabili
- `packages/opencode/test/kiloclaw/travel/*.test.ts`
  - unit/integration/routing/runtime tests

### Contratti dati minimi (I/O)

#### TravelQuery (input orchestrazione)

- `origin`: string (IATA/città)
- `destinations[]`: string[]
- `dateWindow`: `{ start: ISODate, end: ISODate, flexibilityDays: number }`
- `budget`: `{ currency: string, maxTotal: number }`
- `party`: `{ adults: number, children: number, accessibilityNeeds?: string[] }`
- `preferences`: `{ pace: "slow"|"medium"|"fast", interests: string[], cuisine: string[] }`
- `constraints`: `{ nonStopPreferred?: boolean, maxLayoverHours?: number, minHotelRating?: number }`

#### TravelPlan (output)

- `options[]` con breakdown costo
- `recommendedOption`
- `itineraryByDay[]`
- `bookingLinks[]` (solo deep-link)
- `riskFlags[]` (meteo/advisory/policy)
- `policyLevelApplied`
- `providerTrace`: `providerUsed`, `fallbackChainTried`, `quotaState`, `dataFreshness`

---

## API individuate (catalogo implementativo esteso)

### Provider primari/fallback per capability

| Capability Cluster   | Primario             | Fallback                                                                          | Note implementative                                                    |
| -------------------- | -------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Flight Search/Offers | Amadeus Self-Service | Aviationstack (solo operational flight data), fallback generic search controllata | Amadeus per offerte; Aviationstack non sostituisce booking fare search |

Amadeus self API
|API_KEY hBhBvYs6G5G0Ua6anUOPN1vM5ASqSWq4
SECRET API gZjo5yG92qEG8RDf

Aviationstack API
docs: https://docs.apilayer.com/aviationstack/docs/api-documentation?utm_source=dashboard&utm_medium=Referral
api key: 19c581bb7332e7ce11675f427cbc2a90

| Hotel Search | Amadeus Hotels | provider web fallback controllato | deep-link e verifica cancellazione obbligatoria |
| Activities/Tours | Amadeus Tours & Activities | Ticketmaster (eventi live) | separare “tour” da “live events” |
| Live Events/Shows | Ticketmaster Discovery API | provider alternativi in backlog | rispettare quote giornaliere/rate |
| Weather Risk | OpenWeather | provider meteo secondario in backlog | usare alert + forecast per scoring rischio |
| POI / Restaurants | Google Places | OpenTripMap (POI open data) | Places per precisione; OpenTripMap per copertura/caching |
| Maps/Geocoding/Routing | Google Maps Platform | fallback locale/non premium | field mask e quota enforcement |
| Emergency Support | OpenWeather Alerts + Places + advisory feed | escalation HITL | nessuna automazione “critical decision” |

### Endpoint/operazioni target (livello piano)

- Amadeus:
  - Flight Offers Search / Price / Inspiration / Cheapest Date
  - Hotel Search / Hotel Booking (solo se policy consente)
  - Tours & Activities
- Ticketmaster:
  - `/discovery/v2/events`
  - `/discovery/v2/venues`
  - `/discovery/v2/attractions`
- OpenWeather:
  - Current, Forecast, Alerts (piano coerente)
- Google:
  - Places (Text/Nearby/Details)
  - Geocoding
  - Routes
- OpenTripMap:
  - Place list, Place details, autosuggest, geocoordinates
- Aviationstack:
  - Flight status/operational data

> Verifica obbligatoria in onboarding: limiti, TOS, prezzi, e disponibilità endpoint per account/prodotto.

---

## API keys necessarie (single source of truth)

### Regola vincolante

Tutte le chiavi devono risiedere **solo** in:

`~/.local/share/kiloclaw/.env`

Mai inserire chiavi in altri `.env` del repository.

### Elenco chiavi consigliato per v1

| Provider           | Variabili consigliate                       | Obbligatorietà v1       | Note                          |
| ------------------ | ------------------------------------------- | ----------------------- | ----------------------------- |
| Amadeus            | `AMADEUS_API_KEY_1`, `AMADEUS_API_SECRET_1` | Obbligatoria            | auth OAuth client credentials |
| Ticketmaster       | `TICKETMASTER_API_KEY_1`                    | Obbligatoria (eventi)   | discovery quota/rate limit    |
| OpenWeather        | `OPENWEATHER_API_KEY_1`                     | Obbligatoria            | meteo + alert                 |
| Google Maps/Places | `GOOGLE_MAPS_API_KEY_1`                     | Fortemente consigliata  | geocoding/routes/places       |
| OpenTripMap        | `OPENTRIPMAP_API_KEY_1`                     | Opzionale fallback      | POI open-data                 |
| Aviationstack      | `AVIATIONSTACK_API_KEY_1`                   | Opzionale (operational) | free tier molto limitata      |

### Formato rotazione chiavi (pool)

```bash
PROVIDER_API_KEY_1=...
PROVIDER_API_KEY_2=...
# oppure
PROVIDER_API_KEYS=key1,key2,key3
```

### Integrazione key-pool (task G4)

- Aggiornare `packages/opencode/src/kiloclaw/agency/key-pool.ts` con loader provider travel.
- Definire per provider:
  - `requestsPerMinute`
  - `requestsPerDay`
  - `retryAfterMs`
- Abilitare metadata `quotaState` in ogni tool response.

### Checklist sicurezza chiavi

- [ ] Nessuna chiave hardcoded
- [ ] Nessuna chiave nei log
- [ ] Validazione startup: fail-fast se chiavi obbligatorie mancanti
- [ ] Rotazione supportata (N chiavi)
- [ ] Alert su quota >90%

---

## Piano di implementazione dettagliato per sprint (esteso)

### Sprint 1 — Foundation + Routing

- Implementare i 5 file canonici (agency, semantic bootstrap, router, prompt, tool-policy)
- Registrare capability travel L1
- Definire allowlist hard + blocked tools
- Deliverable: routing travel deterministico

### Sprint 2 — Provider layer + adapters

- Creare adapter Amadeus/Ticketmaster/OpenWeather/Google/OpenTripMap/Aviationstack
- Uniformare error model (`timeout`, `429`, `invalid_data`, `auth_error`)
- Implementare fallback chain per capability
- Deliverable: data acquisition stabile

### Sprint 3 — Skills + planning engine

- Skill: discovery, compare, date optimization, transport compare, hotel compare
- Skill: restaurants/activities/events assembler
- Skill: emergency assessor + escalation pack
- Deliverable: itinerary end-to-end (no direct payment)

### Sprint 4 — Booking assist + compliance + telemetry

- Deep-link booking manager
- HITL gates su operazioni ad impatto
- Telemetry contract (`PolicyDeniedEvent`, `FallbackUsedEvent`, `EmergencyEscalationEvent`)
- Deliverable: G5 readiness

### Sprint 5 — Verification + hardening

- Unit + integration + routing tests
- Runtime verification 9/9 reale via `bun run dev -- --print-logs --log-level DEBUG run "..."`
- Go/No-Go review
- Deliverable: G6 rollout candidate

---

## Test cases concreti (aggiuntivi)

### Routing test pack

- Query: "Organizza un weekend a Lisbona con volo+hotel e 3 attività culturali"
  - Expected: `agency-travel`, confidence > 0.4
- Query mixed-domain con termine ambiguo
  - Expected: nessun false positive se non travel-intent

### Policy test pack

- Tentativo tool non allowlist in `agency-travel`
  - Expected: blocked + telemetry event
- Richiesta prenotazione non rimborsabile oltre budget
  - Expected: HITL richiesto o DENY

### Emergency test pack

- Query: "Ho perso il passaporto a Tokyo, cosa faccio adesso?"
  - Expected: emergency flow, contatti consolato/autorità, escalation HITL

### Resilienza provider

- Primario timeout + fallback disponibile
  - Expected: fallback eseguito, `fallbackChainTried` popolato
- Quota esaurita su provider primario
  - Expected: switch provider + log `quotaState=exhausted`

---

## Governance operativa API e costi

### Budget controls obbligatori

- Budget mensile per provider (`soft` 80%, `hard` 95%)
- Circuit breaker su burst 429/5xx
- Cache TTL per read-only query ad alto volume
- Rate limiter per tool e per capability

### Regole anti-regressione

- Ogni PR che tocca policy/tool deve includere test di blocco allowlist.
- Ogni PR che aggiunge provider deve includere:
  - adapter contract test
  - fallback test
  - quota handling test

---

## Action list immediata (next commits pianificati)

1. Estendere `bootstrap.ts` con `agency-travel` + policy/capabilities baseline.
2. Aggiungere `bootstrapTravelCapabilities()` in semantic bootstrap.
3. Inserire keyword travel in `router.ts` (domain/core).
4. Inserire context block in `prompt.ts` con istruzioni tool hard.
5. Estendere `tool-policy.ts` con `TRAVEL_TOOL_ALLOWLIST` e mapping.
6. Creare adapters travel + schema normalizzato.
7. Integrare key-pool provider travel e checklist startup chiavi.
8. Implementare suite test travel + runtime verification 9/9.

# KILOCLAW_FIRST_4_AGENCIES_IMPLEMENTATION_PLAN_2026-04-09

Roadmap tecnica per quattro agenzie prioritarie.

---

## Allinea vincoli

- Applica in modo vincolante `docs/guide/KILOCLAW_AGENCY_AGENT_SKILL_TOOL_IMPLEMENTATION_GUIDE_2026-04-07.md` con gerarchia `Intent -> Core -> Agencies -> Agents -> Skills -> Tools/MCP`.
- Mantieni `deny-by-default` su tool e MCP, con policy hard centralizzata e override solo per capability esplicite.
- Gestisci catalog provider come sorgente unica di capacita esterne con health, rate-limit, cost-profile e fallback policy.
- Rendi obbligatori test e telemetry in ogni milestone: correctness, safety, latency, costo, coverage capability.

---

## Decidi architettura per agency 1

| Opzione | Pro | Contro | Quando usarla |
|---|---|---|---|
| Native-first | Payload tool-schema minimo, policy piu semplice, migliore osservabilita locale | Copertura iniziale piu bassa su superfici Google rare | Default consigliato per v1 |
| MCP-first | Time-to-market rapido su molte API Google Workspace | Overhead alto schema/prompt, latenza e fragilita auth remota | PoC esplorativi o gap temporanei |
| Hybrid | Bilancia copertura e costo, fallback progressivo | Complessita routing/policy maggiore | Produzione con rollout graduale |

**Decisione consigliata: Hybrid a dominanza native-first.**  
- Routing: `native` come path principale, `MCP` solo su capability mancanti o degraded provider.
- Gate: fallback MCP consentito solo con capability allowlisted e policy `NOTIFY` o superiore.
- Motivazione: minimizza overhead noto di MCP remoto (`google_workspace_mcp`) e preserva copertura ampia del dominio Google.

---

## Progetta Dynamic tool payload budgeting

**Obiettivo**
- Ridurre payload tool-schema per request in `packages/opencode/src/session/prompt.ts` senza perdere capacita necessarie.
- Applicare budgeting dinamico contestuale prima della risoluzione finale tool native + MCP.

**Design tecnico**
- `Tool index`: indice compatto per tool/capability con metadati (`domain`, `risk`, `cost`, `latency`, `token_size`, `provider`).
- `Lazy schema hydration`: invia solo firma minima (`name`, `summary`, `risk`) e idrata schema completo on-demand per top candidate.
- `Capability prefilter`: filtra per intent classificato, policy hard e contesto conversazionale.
- `Top-k per intent`: selezione deterministica + rerank (`relevance_score`, `safety_score`, `cost_score`) con budget token massimo.
- `Fallback window`: aggiunta progressiva di tool in caso di errore "capability not found" entro limite configurabile.
- `Prompt compiler hook`: nuovo step tra allowlist centralizzata e rendering finale tool payload.

**Metriche**
- `tool_schema_tokens_p50/p95`, `selected_tools_count`, `intent_miss_rate`, `fallback_rate`.
- `latency_end_to_end_p50/p95`, `cost_per_request`, `policy_block_rate`, `unsafe_attempt_rate`.
- KPI target v1: -40% token schema p50, -25% latenza p95, intent miss <2%.

**Rollout**
- Fase 1: shadow mode con confronto side-by-side e telemetry only.
- Fase 2: canary 10% sessioni su agenzie 1-4 con rollback immediato.
- Fase 3: default on con feature flag per agency e profilo utente.

---

## Implementa agency 1 Google Workspace

**Scope funzionale v1**
- Copri Gmail, Calendar, Drive, Docs, Sheets con operazioni read/write controllate e search cross-service.
- Mantieni fallback MCP per superfici non coperte nativamente (Meet, Forms, Classroom, admin edge-case).
- Includi modalita auth operative minime: OAuth user + service account dove applicabile.

**Inventario capability**
- Gmail: search thread, read message, draft/send, label.
- Calendar: list events, create/update event, availability check.
- Drive: search/list, permission inspect, file move/copy.
- Docs/Sheets: read structured content, append/update blocchi o range.
- Cross-service: ricerca unificata con ranking per recency + entity matching.

**Mapping tool**
- Native target: adapter Google API dedicati per ogni servizio core con interfaccia capability-level.
- MCP fallback: `google_workspace_mcp` per capability assenti, con mapping 1:1 a capability ID.
- Routing rule: `native_success -> stop`, `native_unsupported -> mcp_if_allowlisted`, `auth_error -> deny + notify`.

**Policy rischio**
| Operazione | Policy |
|---|---|
| Read metadata/contenuti non sensibili | SAFE |
| Search cross-service e summarization | NOTIFY |
| Send email, create event, share file interno | CONFIRM |
| Share pubblico, delete definitivo, policy/admin mutation | DENY (v1) |

**Strategia test**
- Contract test capability-level con fixture per Gmail/Calendar/Drive/Docs/Sheets.
- Integration test end-to-end con auth mock-safe + sandbox tenant.
- Safety test su policy matrix e tentativi bypass (deny-by-default).
- Performance test su payload budgeting con intent Google misti.

**Milestone implementazione**
- M1: capability registry + adapter Gmail/Calendar read.
- M2: Drive/Docs/Sheets core + cross-service search.
- M3: fallback MCP controllato + policy hardening.
- M4: test suite completa + telemetry dashboard agency.

---

## Implementa agency 2 Scommesse NBA

**Scope funzionale v1**
- Porting completo di `Me4BrAIn sports_nba` con handler, `nba_api` e `betting_analyzer`.
- Supporta provider ESPN, `nba_api`, BallDontLie, OddsAPI, Polymarket con merge coerente.
- Mantieni confidence cap e value-bet logic come regole centrali non bypassabili.

**Inventario capability**
- Raccolta dati: calendario, injury report, lineup, advanced stats, quote e mercati.
- Analisi: matchup model, implied probability, edge detection, value-bet scoring.
- Output: report pre-match, live watchlist, alert variazione quota.

**Mapping tool**
- Native target: connettori HTTP nativi per ESPN/BallDontLie/OddsAPI/Polymarket + wrapper `nba_api`.
- MCP fallback: solo per feed non disponibili o rate-limit bloccanti.
- Normalizzazione: schema unico `Game`, `Odds`, `Signal`, `Recommendation`.

**Policy rischio**
| Operazione | Policy |
|---|---|
| Dati e statistiche pubbliche | SAFE |
| Stima probabilistica e ranking opportunita | NOTIFY |
| Suggerimento stake sizing o esecuzione automatica | CONFIRM |
| Auto-bet, martingala aggressiva, bypass limiti utente | DENY |

**Strategia test**
- Golden test su partite storiche con expected edge/value output.
- Provider resilience test con timeout, dati incompleti e conflitti feed.
- Policy test su blocco auto-bet e enforcement confidence cap.
- Drift test periodico su calibration modello probabilistico.

**Milestone implementazione**
- M1: porting handler + normalizzazione provider.
- M2: integrazione betting_analyzer + confidence cap.
- M3: reportistica e alert + hard policy.
- M4: backtest, calibrazione, telemetry qualita segnali.

**Responsible use**
- Nessun output costituisce garanzia di vincita o consulenza professionale.
- Esporre sempre probabilita, incertezza, limiti dati e stato feed prima di ogni raccomandazione.
- Richiedere HITL esplicito per stake sizing e qualsiasi azione operativa collegata a bookmaker.
- Applicare limiti di perdita/sessione configurabili e blocco hard al superamento.

---

## Implementa agency 3 Analisi finanziaria e trading

**Scope funzionale v1**
- Porting di `Me4BrAIn finance_crypto` con handler + `finance_api`.
- Integra CoinGecko, Binance, Yahoo, Finnhub, FRED, SEC, Alpaca, Hyperliquid.
- Copri analisi multi-asset e funzioni trading con controlli di rischio obbligatori.

**Inventario capability**
- Data ingestion: prezzo, order book, fundamentals, macro, filing SEC.
- Analytics: indicatori tecnici, factor snapshot, scenario stress e correlazioni.
- Trading ops: paper-trade, order simulation, execution assistita con guardrail.
- Reporting: watchlist, alert rischio, journal decisionale.

**Mapping tool**
- Native target: adapter provider finanziari con cache TTL e quality flags.
- MCP fallback: solo per endpoint specialistici non coperti da adapter nativi.
- Execution boundary: canale operativo separato con audit trail immutabile.

**Policy rischio**
| Operazione | Policy |
|---|---|
| Market data e analisi descrittiva | SAFE |
| Segnali, scenari, ranking asset | NOTIFY |
| Generazione ordine e conferma parametri | CONFIRM |
| Esecuzione reale senza HITL, leva estrema, bypass risk limits | DENY |

**Strategia test**
- Contract test per ogni provider con mapping schema e quality flag.
- Backtest deterministico su dataset congelati per regressioni logiche.
- Safety test per limiti leva/esposizione e blocchi su dati stantii.
- Chaos test su disallineamento fonti e failure parziali.

**Milestone implementazione**
- M1: porting handler + data layer multi-provider.
- M2: analytics core + risk engine base.
- M3: trading assistito + audit trail.
- M4: test integrati, calibrazione alert, telemetry operativa.

**Responsible use**
- Nessun contenuto e consulenza finanziaria o promessa di rendimento.
- Mostrare sempre drawdown potenziale, confidenza, latenza dati e rischio controparte.
- Imporre HITL per ordini reali, modifiche leva e aggiornamenti risk profile.
- Applicare circuit breaker automatici su volatilita estrema o feed incoerenti.

---

## Implementa agency 4 Coding and development unificata

**Scope funzionale v1**
- Unifica `fulvian/kilo_kit` e `Me4BrAIn tech_coding` in un modello general-manager con phase-gate.
- Riduci MCP al minimo e privilegia tool nativi della codebase (`read`, `grep`, `glob`, `apply_patch`, test/build shell).
- Mantieni routing specialistico per task complessi multi-dominio.

**Inventario capability**
- Analisi: repository scan, dependency map, impatto modifiche.
- Progettazione: architettura, piani phased, policy e rischi tecnici.
- Sviluppo: coding, refactor, migrazioni, test authoring.
- Operazioni: CI/CD checks, sicurezza, performance, data pipeline, frontend.

**Blueprint subagent**
| Subagent | Responsabilita primaria | Input minimo | Output atteso |
|---|---|---|---|
| general-manager | Orchestrazione, phase-gate, priorita | intent, contesto repo | piano operativo + dispatch |
| system-analyst | Analisi requisiti e gap | issue/spec | requisito strutturato |
| architect | Design tecnico e tradeoff | requisiti | ADR + blueprint |
| coder | Implementazione | task atomico | patch + rationale |
| qa | Strategia test e verifica | patch/spec | test plan + evidenze |
| devops | Build/release/pipeline | repo state | pipeline update/check |
| security | Threat model e policy | design/patch | findings + mitigazioni |
| data-engineer | Flussi dati e qualita | data task | pipeline/schema update |
| frontend-specialist | UI/UX e accessibilita | ui task | componenti + test visivi |
| qlora-expert | Fine-tuning e serving LLM | ml task | piano tuning/inferenza |
| ml-engineer | Modelli e valutazione | ds/ml task | training/eval artifacts |

**Integrazione nel registry kiloclaw**
- Registra `agency.coding_unified` con capability taxonomy e policy bundle dedicato.
- Definisci `agent registry` con metadati (`domain`, `skillset`, `risk`, `cost`, `latency`) e dispatch rules phase-gate.
- Implementa `intent router` con priorita native tool e `mcp_fallback=false` di default.
- Aggiungi tracing per handoff tra subagent con correlation ID univoco.

**Policy rischio**
| Operazione | Policy |
|---|---|
| Lettura repo e analisi statica | SAFE |
| Patch codice e test locali | NOTIFY |
| Modifiche CI/release, infra, sicurezza critica | CONFIRM |
| Azioni distruttive, secret exfiltration, force operations non autorizzate | DENY |

**Strategia test**
- Multi-agent simulation test su workflow reali (bugfix, feature, refactor).
- Determinism test sul phase-gate e routing specialist.
- Security test su prompt injection e tool misuse.
- Benchmark su produttivita: tempo ciclo, pass rate test, regressioni.

**Milestone implementazione**
- M1: registry e routing base general-manager.
- M2: onboarding subagent core (analyst/architect/coder/qa).
- M3: onboarding devops/security/data/frontend/ml.
- M4: ottimizzazione cost/latency con payload budgeting pienamente attivo.

---

## Pianifica roadmap 8 settimane

| Settimana | Focus | Dipendenze | Gate |
|---|---|---|---|
| 1 | Setup programma, baseline telemetry, design budgeting | Nessuna | Architettura approvata |
| 2 | Implementa tool index + prefilter + shadow mode | W1 | KPI shadow raccolti |
| 3 | Agency 1 core native (Gmail/Calendar/Drive read) | W2 | Test contract base verdi |
| 4 | Agency 1 write path + fallback MCP controllato | W3 | Policy matrix validata |
| 5 | Agency 2 porting completo + analyzer | W2 | Backtest smoke e safety pass |
| 6 | Agency 3 porting completo + risk engine | W2 | Guardrail trading pass |
| 7 | Agency 4 registry + subagent core + phase-gate | W2 | Routing deterministico pass |
| 8 | Hardening cross-agency, canary 10%, rollout docs | W3-W7 | KPI target raggiunti |

**Gate trasversali obbligatori**
- Nessuna agency passa a canary senza policy hard + deny-by-default verificati.
- Rollout generale bloccato se `intent_miss_rate` >2% o `unsafe_attempt_rate` in crescita.
- Ogni rilascio richiede dashboard telemetry e report test firmato.

---

## Aggiorna guida

- Aggiungi sezione obbligatoria "Dynamic Tool Payload Budgeting" con pattern `tool index`, `lazy hydration`, `top-k per intent`.
- Introduci checklist "Native-first with controlled MCP fallback" con criteri oggettivi di scelta per capability.
- Formalizza matrice rischio `SAFE/NOTIFY/CONFIRM/DENY` come artefatto richiesto per ogni agency.
- Definisci standard "Provider catalog contract" con health, SLA, cost tier, auth mode, fallback.
- Inserisci template "Responsible Use" obbligatorio per domini betting/trading.
- Estendi capitolo test con suite minime: contract, policy, resilience, chaos, drift/backtest dove applicabile.
- Richiedi telemetry minima per PRD: token schema, selected tools, fallback rate, policy block rate, latency/cost.
- Documenta integrazione multi-agent registry con phase-gate e tracing handoff per agency complesse.

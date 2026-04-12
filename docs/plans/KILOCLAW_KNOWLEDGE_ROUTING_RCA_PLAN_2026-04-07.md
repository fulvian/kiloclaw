# KILOCLAW Knowledge Routing RCA + Resolution Plan

Data: 2026-04-07
Stato: Draft operativo
Ambito: routing Intent -> Agency -> Agent -> Skill -> Tool per richieste web research

---

## 1) Problema osservato

Per query di ricerca web (es. annunci MacBook Pro), il sistema mostra e usa un comportamento percepito come "Exa Web Search" invece del percorso atteso da blueprint:

Intent -> Core Orchestrator -> Knowledge Agency -> agente/skill knowledge -> tool provider catalog (Tavily, Firecrawl, Brave).

Effetto pratico: il routing sembra bypassare la Knowledge Agency o comunque non renderla verificabile/esplicita.

---

## 2) Evidenze tecniche in codebase

### 2.1 Labeling e descrizione tool sono ancora Exa-centric (misleading)

1. `packages/opencode/src/cli/cmd/run.ts:165`
   - La funzione di rendering `websearch()` stampa titolo hardcoded: `Exa Web Search "..."`.
   - Anche se il tool chiamato e `websearch`, la UI induce l'utente a credere che sia Exa nativo.

2. `packages/opencode/src/tool/websearch.txt:1`
   - Descrizione tool: "Search the web using Exa AI".
   - Incoerente con implementazione reale del tool Kiloclaw (catalog provider-based).

### 2.2 Implementazione tool `websearch` e gia catalog-based

3. `packages/opencode/src/tool/websearch.ts:43`
   - `getCatalog().listProviders("knowledge")`
   - Priorita provider: `tavily`, `firecrawl`, `brave`, `ddg`, `wikipedia`.
   - Quindi il runtime del tool non e Exa-based; il problema principale e percezione + governance incompleta.

### 2.3 Agency routing esiste ma e solo debolmente applicato

4. `packages/opencode/src/session/prompt.ts:403`
   - Viene calcolato `agencyContext` via `CoreOrchestrator.routeIntent(...)`.

5. `packages/opencode/src/session/prompt.ts:789`
   - Se `agencyId === "agency-knowledge"`, viene iniettato un blocco prompt con istruzioni "usa solo websearch".
   - Questo e un controllo soft (prompt-based), non un gate hard di policy runtime.

6. `packages/opencode/src/session/prompt.ts:917`
   - Filtra alcuni tool search nativi (`exa_search`, `exa_image_search`, `exa_news_search`, `codesearch`) solo quando Knowledge Agency e attiva.
   - Copertura parziale: non e un deny-by-capability completo.

### 2.4 Gap critico: tool MCP non filtrati per agency context

7. `packages/opencode/src/session/prompt.ts:1015`
   - I tool MCP vengono aggiunti dopo i tool standard, ma non passano dal filtro `nativeSearchToolsToFilter`.
   - Quindi eventuali tool MCP di ricerca (anche Exa-like) possono restare disponibili.

### 2.5 Gap architetturale: pipeline L0-L3 non e il percorso effettivo della chat

8. `packages/opencode/src/kiloclaw/agency/routing/pipeline.ts`
   - Implementa L0-L3 (agency, skill, agent, tool resolution), ma non e il path usato in `session/prompt.ts`.

9. `packages/opencode/src/kiloclaw/orchestrator.ts:65`
   - Usa `Router.create().route(...)` (keyword router legacy) e capability routing solo per reason/telemetria.
   - Il risultato non vincola in modo forte la selezione tool/skill a runtime chat.

10. `packages/opencode/src/kiloclaw/router.ts`
    - Classificazione keyword-based con match lessicale semplice.
    - Robustezza limitata su typo/variazioni linguistiche (es. "ricrca").

### 2.6 Segnali di integrazione incompleta

11. `packages/opencode/src/flag/flag.ts:104`
    - `KILO_ROUTING_AGENCY_CONTEXT_ENABLED` definita ma non usata altrove.
    - Indica stato intermedio: flag esiste, enforcement completo no.

---

## 3) Root causes (classificate)

### Causa A - UX/telemetria fuorviante (alta confidenza)

- Label e description del tool `websearch` ancora Exa-oriented (`run.ts`, `websearch.txt`).
- Anche quando il routing e corretto, la UI comunica il contrario.

### Causa B - Enforcement incompleto del routing agency (alta confidenza)

- Knowledge Agency in chat e applicata principalmente via prompt instruction (soft constraint).
- Mancano guardrail hard centralizzati sul set tool consentito per agency/capability.

### Causa C - Tool surface non chiusa (alta confidenza)

- Filtri applicati solo a un set statico di tool standard.
- Tool MCP search-like non filtrati in base ad agency policy.

### Causa D - Architettura target non completamente "wired" nel runtime chat (alta confidenza)

- Esiste pipeline routing L0-L3, ma il percorso reale della sessione usa ancora flusso parziale/legacy.
- L3 tool resolution (policy/budget/fallback) e placeholder, non gate operativo.

### Causa E - Classifier legacy keyword-only (media confidenza)

- In presenza di typo/lingue miste, puo degradare la confidenza o il dominio.
- Non e la causa primaria del caso mostrato, ma aumenta variabilita e comportamenti non deterministici.

---

## 4) Delta rispetto al blueprint

Riferimento: `docs/foundation/KILOCLAW_BLUEPRINT.md`

Blueprint richiede:

- gerarchia obbligatoria Intent -> Core -> Agencies -> Agents -> Skills -> Tools/MCP,
- capability-based routing,
- agency governance con policy allow/deny,
- verifiability-first con evidenze e audit.

Stato attuale (gap):

- gerarchia presente come moduli, ma enforcement runtime chat incompleto,
- policy tool per agency non centralizzata hard,
- output osservabile non allineato (UI/descrizioni legacy Exa),
- L3 resolution non pienamente implementata.

---

## 5) Best practices da applicare

1. Deny-by-default a livello runtime tool per dominio/agency (non solo prompt instruction).
2. Single source of truth per policy: una sola matrice capability -> tool allowlist/denylist, applicata sia a tool interni sia MCP.
3. Contract tests end-to-end di routing: stessa query deve produrre stesso percorso agency/tool con assert espliciti.
4. Osservabilita semantica: loggare `selectedAgency`, `allowedTools`, `blockedTools`, `actualToolCalled`, `providerUsed`.
5. Naming/UI correctness: la superficie utente deve riflettere il backend reale per evitare false diagnosi.
6. Progressive hardening: soft prompt + hard filter + policy engine, in quest'ordine ma con cutover definitivo al gate hard.

---

## 6) Piano di risoluzione

## Fase 0 - Hotfix verita operativa (oggi)

Obiettivo: eliminare segnali fuorvianti e rendere evidente il provider reale.

Task:

1. Aggiornare label CLI `run.ts`:
   - da `Exa Web Search` a `Web Search`.
2. Aggiornare `websearch.txt`:
   - rimuovere riferimento Exa,
   - descrivere routing provider catalog (Tavily/Firecrawl/Brave/DDG/Wikipedia fallback).
3. Arricchire output `websearch.ts` con metadata sempre esplicito:
   - `provider`, `fallbackChainTried`, `errorsByProvider`.

Deliverable:

- UX coerente con runtime reale.

---

## Fase 1 - Hard gate tools per Knowledge Agency (priorita massima)

Obiettivo: impedire bypass della policy via tool alternativi.

Task:

1. Estendere `resolveTools` in `session/prompt.ts` con filtro capability-based, non lista statica ID.
2. Applicare stesso filtro anche ai tool MCP (blocco search-like non autorizzati).
3. Introdurre allowlist esplicita per agency-knowledge:
   - consentiti: `websearch`, `webfetch`, `skill` (piu eventuali tool declarati da policy).
4. Integrare check su `AgencyRegistry`/policy prima di aggiungere tool al model call.

Deliverable:

- hard enforcement a runtime, indipendente dalla compliance del modello al prompt.

---

## Fase 2 - Allineamento pipeline L0-L3 nel path chat

Obiettivo: usare davvero il percorso architetturale previsto.

Task:

1. Spostare routing sessione da `CoreOrchestrator + Router legacy` a `RoutingPipeline.route(...)`.
2. Propagare output L1/L2/L3 in `agencyContext` e metadata sessione.
3. Completare L3 `resolveTools` con policy gate reale (oggi placeholder).
4. Usare `KILO_ROUTING_AGENCY_CONTEXT_ENABLED` come feature flag effettivo.

Deliverable:

- intent routing e tool routing allineati a blueprint.

---

## Fase 3 - Robustezza classifier e multilingual typo tolerance

Obiettivo: ridurre misrouting borderline.

Task:

1. Migliorare capability extraction con fuzzy matching/normalizzazione typo.
2. Estendere vocabolario italiano e intent examples (query marketplace/acquisti/annunci).
3. Soglia di confidenza + fallback deterministico verso knowledge quando intent e search-like.

Deliverable:

- classificazione piu stabile su input real-world.

---

## Fase 4 - Test, audit, regressioni

Obiettivo: prevenire regressioni future.

Task test minimi:

1. Unit test su filtro tool knowledge:
   - verifica esclusione di `codesearch`, `exa_*`, e MCP search-like.
2. Integration test session:
   - query web in italiano con typo -> `agency-knowledge` + tool call `websearch`.
3. Golden test output:
   - titolo tool non contiene "Exa".
4. Telemetry test:
   - presenza campi `agencyId`, `providerUsed`, `blockedTools`.

Deliverable:

- suite anti-regressione specifica per routing knowledge.

---

## 7) Priorita esecutive (ordine consigliato)

1. Fase 0 (immediata, rischio basso, impatto UX alto).
2. Fase 1 (sicurezza/governance, impatto architetturale medio).
3. Fase 4 (test harness per stabilizzare rollout Fase 1).
4. Fase 2 (riallineamento strutturale completo).
5. Fase 3 (ottimizzazione accuratezza classifier).

---

## 8) Criteri di accettazione

1. Query web search produce sempre:
   - `agencyId = agency-knowledge`
   - tool chiamato: `websearch` (o allowlist knowledge)
   - provider effettivo visibile in output metadata.
2. Nessun tool Exa/MCP search non autorizzato e disponibile quando agency e knowledge.
3. Nessuna occorrenza stringa UI "Exa Web Search" nei path runtime CLI.
4. Test routing knowledge verdi in CI.
5. Audit log include percorso completo L0-L3 e reason chain.

---

## 9) Rischi e mitigazioni

Rischio: bloccare tool legittimi non previsti in allowlist.
Mitigazione: rollout con flag + logging `blockedTools` + fallback controllato.

Rischio: regressioni su agenti non-knowledge.
Mitigazione: filtri condizionali per agency + test cross-domain (development/nutrition/weather).

Rischio: false confidence dal solo routing prompt.
Mitigazione: hard gate lato `resolveTools` e policy engine.

---

## 10) Conclusione RCA

Il comportamento osservato deriva da una combinazione di:

- nomenclatura legacy Exa non aggiornata,
- enforcement parziale del routing agency,
- mancato filtro MCP search tools,
- integrazione incompleta della pipeline L0-L3 nel path di chat.

Il sistema non e completamente "rotto": il tool `websearch` gia usa catalog provider knowledge.
Il problema principale e di governance runtime + coerenza end-to-end (policy hard, UI, test).

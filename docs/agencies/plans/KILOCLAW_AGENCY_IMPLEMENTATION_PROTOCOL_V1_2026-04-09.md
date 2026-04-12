# KILOCLAW_AGENCY_IMPLEMENTATION_PROTOCOL_V1_2026-04-09

Protocollo operativo per agenzie con gate e controlli.

---

## Applica le fasi

Usa queste fasi in ordine, senza saltare gate. Ogni gate richiede evidenze tracciabili.

1. **Fase 1 - Discovery con utente**
   - Obiettivo: chiarire bisogni reali, vincoli, rischi, confini operativi
   - Deliverable: `Discovery Brief` approvato
   - Classifica dominio: `task spot` vs `progetto continuativo`; se `progetto continuativo`, esegui valutazione `LLM Wiki fit check`
   - Gate `G1`: requisiti non ambigui, KPI misurabili, limiti rischio e legali firmati

2. **Fase 2 - Research su tools/skills online**
   - Obiettivo: confrontare alternative native vs MCP e motivare la scelta
   - Deliverable: `Tool Decision Record` completo
   - Gate `G2`: decisione tool con score e rationale verificabile

3. **Fase 3 - Design architetturale**
   - Obiettivo: definire mapping Intent -> Agency -> Agent -> Skill -> Tool e policy runtime
   - Deliverable: `Agency Manifest Draft` + diagramma flusso + policy
   - Gate `G3`: deny-by-default attivo, allowlist esplicita, fallback provider definito

4. **Fase 4 - Implementazione**
   - Obiettivo: realizzare componenti minime necessarie secondo design approvato
   - Deliverable: codice, config, manifest, migrazioni, note operative
   - Gate `G4`: build/test locali verdi, nessun scope creep non autorizzato

5. **Fase 5 - Verifica**
   - Obiettivo: validare funzionalita, regressioni, telemetria, sicurezza operativa
   - Deliverable: report test + evidenze telemetry contract
   - Gate `G5`: checklist minima completa e criteri accettazione soddisfatti

6. **Fase 6 - Rollout**
   - Obiettivo: rilascio controllato con monitoraggio e rollback pronto
   - Deliverable: piano rollout, changelog, runbook, owner on-call
   - Gate `G6`: go-live autorizzato + metriche post-release in soglia

---

## Conduci discovery

La Discovery e una discussione strutturata tra coding agent e utente, con output concreti e verificabili. Niente sviluppo prima di `G1`.

**Template domande pratiche**

- Problema reale: quale risultato operativo deve cambiare da domani
- Utenti target: chi usa la soluzione, con quale frequenza, in quale contesto
- Input/output: quali dati entrano, quali dati escono, in quale formato
- Flusso attuale: cosa succede oggi, dove sono errori, ritardi, costi
- Vincoli tecnici: stack, ambienti, limiti performance, dipendenze obbligate
- Vincoli operativi: SLA, finestre deploy, ownership, escalation
- Sicurezza: dati sensibili, segreti, retention, audit trail richiesto
- Legale/compliance: licenze, GDPR, geofence, policy interne
- Rischio: cosa non deve mai accadere, severita, impatto massimo accettabile
- Successo: KPI iniziali, target, orizzonte temporale, soglia go/no-go

**Output attesi non ambigui**

- Scope in/out in punti numerati
- User intent principali con esempi reali
- Casi limite critici
- KPI con formula, baseline, target, finestra di misura
- RACI minimo (owner, reviewer, approvatore)
- Registro rischi con severita/probabilita e mitigazioni
- Confini legali espliciti e azioni vietate

**KPI minimi Discovery**

- `% requisiti con criterio di accettazione`: target 100%
- `% KPI con baseline e target`: target 100%
- `tempo medio chiarimento requisito critico`: target definito per team
- `% rischi high con mitigazione`: target 100%

**Limiti rischio e confini legali**

- Definisci soglie hard per perdita dati, azioni irreversibili, costo massimo per run
- Definisci blocchi legali hard: dati personali, mercati regolati, automazioni vietate
- Se i confini non sono chiari, stato obbligatorio: `NO-GO`

**LLM Wiki fit check (solo per agency project-oriented)**

- Criteri GO: continuita temporale, conoscenza cumulativa da mantenere, valore di citazione/provenance
- Criteri NO-GO: richieste one-shot, alta volatilita senza memoria utile
- Regola architetturale: `LLM Wiki` e artefatto compilato opzionale sopra il sistema 4-layer, non una sostituzione

---

## Confronta gli strumenti

Usa un metodo unico per scegliere tra tool nativi e MCP. Registra tutto nel `Tool Decision Record`.

**Metodo di confronto (scorecard)**

- Valuta ogni opzione su scala 1-5 per:
  - performance (latency, throughput, error rate)
  - token/context cost (prompt size, schema size, retries)
  - affidabilita (stabilita API, timeout, fallback behavior)
  - sicurezza (permessi, isolamento, secret handling, auditability)
  - maintenance (upgrade effort, docs quality, ownership, lock-in)
- Applica pesi per dominio (esempio: sicurezza 30%, affidabilita 25%, performance 20%, cost 15%, maintenance 10%)
- Calcola score totale e seleziona opzione con miglior tradeoff, non solo punteggio massimo

**Regole decisionali**

- Preferisci native tool se equivalenti e con minore context footprint
- Usa MCP quando aggiunge capacita necessarie non coperte nativamente
- Richiedi fallback per tool con affidabilita non provata o SLA assente
- Blocca tool senza modello permessi chiaro o audit trail

---

## Disegna la catena

Il design deve mappare in modo esplicito l intera catena operativa. Nessuna capacita implicita.

**Mapping obbligatorio**

- `Intent`: cosa vuole ottenere l utente
- `Agency`: orchestrazione di alto livello
- `Agent`: unita esecutiva per sotto-obiettivo
- `Skill`: comportamento specializzato riusabile
- `Tool`: capacita concreta invocabile

**Policy obbligatorie**

- Hard deny-by-default su tutte le capability
- Capability allowlist per agent e per fase
- Se `LLM Wiki` e approvata, modellala come capability esplicita (`wiki.ingest`, `wiki.query`, `wiki.lint`) con allowlist e budget context dedicato
- Metadata provider/fallback:
  - provider primario
  - provider fallback
  - trigger di switch
  - limite retry/backoff
- Separazione azioni read-only vs write
- Guardrail su azioni esterne e su workspace

**Check context footprint esplicito**

- Numero tool esposti per agent: target minimo necessario
- Dimensione schema input/output per tool: riduci campi non usati
- Strategia lazy-loading:
  - carica skill/tool solo quando richiesti dal task
  - evita pre-caricamento globale
  - rilascia context non necessario dopo uso
- Budget context per step e per run con soglie hard

---

## Implementa con gate

Implementa solo cio che e approvato in `G3`. Ogni deviazione richiede update del manifest e nuovo review.

**Regole operative**

- Traccia ogni change a requisito Discovery
- Mantieni configurazioni versionate e replicabili
- Aggiungi telemetry minima per ogni decisione critica
- Blocca feature extra non richieste dal perimetro approvato
- Anti over-engineering: introduci solo capability wiki minime se il fit check e `GO`; default `OFF` negli altri casi

---

## Verifica in modo minimo

Usa questa checklist minima prima di `G5`. Tutti i test devono essere ripetibili.

**Checklist test**

- Unit test: logica core, policy gates, fallback routing
- Integration test: catena Intent -> Tool con dipendenze reali o sandbox fedeli
- Regression test: casi storici critici e bug fix principali
- Telemetry contract test: eventi obbligatori, campi richiesti, cardinalita stabile

**Criteri di accettazione**

- 100% test critici verdi
- Nessun bug severita alta aperto
- Error budget e latency nei limiti definiti in Discovery
- Telemetry valida e consumabile da monitoraggio
- Evidenze archiviate in report versione specifica

---

## Applica hitl per alto rischio

Per domini ad alto rischio, il sistema passa in HITL obbligatorio. Esempi: betting, trading, azioni esterne su workspace.

**Trigger HITL hard**

- Invio ordini o puntate
- Scrittura/modifica/cancellazione file fuori perimetro consentito
- Operazioni finanziarie o legali regolamentate
- Azioni irreversibili o con impatto economico diretto

**Protocollo HITL**

- Step 1: genera piano azione con impatto stimato
- Step 2: mostra diff/anteprima e rischi
- Step 3: richiedi approvazione umana esplicita con ID approvatore
- Step 4: esegui con logging completo e correlation id
- Step 5: genera post-action report e possibilita rollback dove applicabile

**Regola**

- Se approvazione manca, scade o e incoerente: `DENY` automatico

---

## Aggiorna la guida ufficiale

Aggiorna la guida ufficiale quando cambia il comportamento operativo o il contratto di implementazione. Usa PR docs formale.

**Quando aggiornare**

- Nuova fase, gate o criterio di accettazione
- Nuova policy sicurezza o HITL
- Nuovo standard mapping o context footprint
- Cambio checklist test o telemetry contract
- Introduzione/rimozione tool class o fallback policy

**Processo PR docs**

1. Apri branch docs dedicato
2. Aggiorna guida canonica e riferimenti correlati
3. Aggiungi sezione `Change rationale` con impatto e backward compatibility
4. Collega evidenze: issue, decision record, report test
5. Richiedi review tecnica + review compliance (se applicabile)
6. Merge solo con check docs lint e link check verdi

---

## Usa i template

### Discovery Brief

```md
# Discovery Brief

## Contesto

- Problema operativo:
- Utenti coinvolti:
- Processo attuale:

## Obiettivi

- Obiettivo 1:
- Obiettivo 2:

## Scope

- In scope:
- Out of scope:

## LLM Wiki fit check

- Esito: GO | NO-GO | N/A
- Rationale breve:

## KPI

- KPI:
  - Formula:
  - Baseline:
  - Target:
  - Finestra misura:

## Vincoli

- Tecnici:
- Operativi:
- Sicurezza:
- Legali:

## Rischi

- Rischio:
  - Severita:
  - Probabilita:
  - Mitigazione:
  - Limite hard:

## Decisione gate

- Stato G1: GO | NO-GO
- Owner:
- Data:
```

### Tool Decision Record

```md
# Tool Decision Record

## Caso d uso

- Intent:
- Requisiti minimi:

## Opzioni

- Opzione A (Native):
- Opzione B (MCP):
- Opzione C (Ibrida):

## Scorecard (1-5)

| Criterio           | Peso |   A |   B |   C |
| ------------------ | ---: | --: | --: | --: |
| Performance        | 0.20 |     |     |     |
| Token/context cost | 0.15 |     |     |     |
| Affidabilita       | 0.25 |     |     |     |
| Sicurezza          | 0.30 |     |     |     |
| Maintenance        | 0.10 |     |     |     |

## Decisione

- Scelta:
- Rationale:
- Fallback:
- Trigger switch:
- Stato G2: GO | NO-GO
```

### Agency Manifest Draft

```md
# Agency Manifest Draft

## Mapping

- Intent:
- Agency:
- Agent:
- Skill:
- Tool:

## Policy

- Deny-by-default: true
- Capability allowlist:
  - agent:
    - capability:
- Read/Write boundaries:
- Workspace boundaries:

## Provider metadata

- Primary provider:
- Fallback provider:
- Retry policy:
- Timeout policy:

## Context footprint

- Tool esposti:
- Dimensione schema totale:
- Lazy-loading strategy:
- Budget context per step:
- Stato G3: GO | NO-GO
```

### Go/No-Go Review

```md
# Go No-Go Review

## Stato gate

- G1:
- G2:
- G3:
- G4:
- G5:
- G6:

## Evidenze

- Build:
- Unit:
- Integration:
- Regression:
- Telemetry contract:
- Security checks:
- **Post-deployment runtime verification** (`bun run dev` con query reale):
  - Log file:
  - Criteri passati (N/8):
  - `policyEnforced`: YES/NO
  - `websearch` invocato: YES/NO (deve essere NO)
  - `blockedTools` corretti: YES/NO

## Rischio residuo

- Livello:
- Motivazione:
- Mitigazioni attive:

## Decisione finale

- Esito: GO | NO-GO
- Condizioni:
- Owner:
- Approvatore:
- Data:
```

---

## Routing Implementation Checklist (Obbligatorio)

Ogni nuova agency richiede la seguente checklist di routing. Senza questa checklist verificata, l'agenzia NON funzionera in produzione.

### A. Aggiunta Domain al type system

```typescript
// types.ts - Domain enum
export const Domain = z.enum(["development", "knowledge", "nutrition", "weather", "nba", "custom"])
```

### B. Aggiunta DOMAIN_KEYWORDS in router.ts

Ogni dominio richiede keywords specifiche con:

1. **CORE_KEYWORDS**: 15-25 termini ad alta specificita per il dominio
   - Devono essere termini che raramente appaiono in altri domini
   - Esempio NBA: ["nba", "basketball", "scommesse", "quote", "odds", "partita", "betting"]

2. **EXTENDED_KEYWORDS**: 50-100 termini correlati
   - Includi sinonimi, termini correlati, e variazioni linguistiche
   - Include termini sia in inglese che italiano per query multilinguali

### C. Formula di scoring corretta

La formula legacy `matches / totalKeywords` NON funziona per domini con molte keywords. Usare:

```typescript
// 1. Core keyword bonus (alta priorita per match specifici)
const coreMatches = coreKeywords.filter((k) => text.includes(k)).length
const coreBonus = coreMatches > 0 ? 0.2 + coreMatches * 0.1 : 0

// 2. Scaled base score (sqrt per non penalizzare query brevi)
const baseScaled = Math.sqrt(matches / totalKeywords)
const base = Math.min(0.7, baseScaled * 0.7) // Cap base at 0.7

// 3. Type boost per query matching il tipo
const typeBoost = typeIncludes(domainSpecificTerms) ? 0.25 : 0

// 4. Score finale
return Math.min(1, base + coreBonus + typeBoost)
```

### D. Bootstrap agencies in HybridRouter (CRITICO)

L'AgencyRegistry deve essere bootstrapped PRIMA del routing. In `hybrid-router.ts`:

```typescript
export const HybridRouter = {
  create: (): HybridIntentRouter => {
    // CRITICAL: Bootstrap agencies before routing
    bootstrapRegistries()
    bootstrapAllCapabilities()

    const keywordRouter = Router.create({})
    // ... resto init
  },
}
```

### E. Bootstrap capabilities

In `agency/routing/semantic/bootstrap.ts`, aggiungere capability bootstrap per il nuovo dominio:

```typescript
export function bootstrapAllCapabilities(): void {
  bootstrapDevelopmentCapabilities()
  bootstrapKnowledgeCapabilities()
  bootstrapNutritionCapabilities()
  bootstrapWeatherCapabilities()
  bootstrapGWorkspaceCapabilities()
  bootstrapNbaCapabilities() // AGGIUNGERE SEMPRE
}
```

### F. Test di routing end-to-end (Obbligatorio per G4)

```typescript
describe("NBA Routing", () => {
  it("routes NBA query to agency-nba", async () => {
    bootstrapRegistries()
    HybridRouter.reset()
    const router = HybridRouter.create()

    const intent: Intent = {
      id: "test-nba-1",
      type: "query",
      description: "analizza partite NBA per questa notte",
      risk: "low",
    }

    const result = await router.route(intent)
    expect(result.agencyId).toBe("agency-nba")
    expect(result.confidence).toBeGreaterThan(0.4) // Minimo 40%
  })
})
```

### G. Gate G4 aggiornato - Routing Verification

Oltre ai test unitari standard, G4 richiede:

- [ ] Routing test per ogni query di esempio dal Discovery Brief
- [ ] Confidence score >= 40% per query representative
- [ ] Agency correttamente registrata in AgencyRegistry
- [ ] Nessun fallback a "custom" o "knowledge" per query del dominio

### H. Fallback domain mapping

Se il routing fallisce, il sistema cade in "custom" che mappa a web-search. Per evitare questo:

- Verificare che il dominio abbia almeno 3 CORE_KEYWORDS
- Il typeBoost deve essere >= 0.2 per il dominio
- Se il confidence e < 0.3, investigate - il routing sta fallendo silenziosamente

### I. Agency Context Block in System Prompt (CRITICO - NON OBBLIO)

Dopo il routing, il sistema inietta un blocco contesto nel system prompt. Questo blocco CONTIENE ISTRUZIONI CRITICHE che dicono al modello quale skill/tool usare.

**IL BLOCCO CONTESTO DEVE ESSERE AGGIUNTO PER OGNI NUOVA AGENZIA in `prompt.ts`**

Localizzazione: `packages/opencode/src/session/prompt.ts` linea ~877

Pattern attuale (SOLO per agency-knowledge):

```typescript
if (Flag.KILO_ROUTING_AGENCY_CONTEXT_ENABLED && agencyContext) {
  if (agencyContext.agencyId === "agency-knowledge") {
    // BLOCCO KNOWLEDGE
  } else if (agencyContext.agencyId === "agency-nba") {
    // BLOCCO NBA (AGGIUNTO RECENTEMENTE)
  }
  // AGGIUNGERE NUOVO BLOCCO PER OGNI NUOVA AGENZIA QUI
}
```

**Ogni blocco agenzia deve contenere:**

1. **Header commento**: `<!-- Agency Context: [Nome] -->`
2. **Routing info**: confidence, reason, source
3. **Layer info** (se disponibile): L1 capabilities, L2 agent, L3 tools
4. **CRITICAL TOOL INSTRUCTIONS**: Quali tool USARE e quali NON USARE
   - Questo e' il punto cruciale - dice al modello di usare l'agenzia corretta
5. **Skill instructions**: Quale skill caricare per l'agenzia
6. **Domain-specific guardrails**: Warning specifici per il dominio

**Esempio blocco NBA (da usare come template):**

```typescript
} else if (agencyContext.agencyId === "agency-nba") {
  agencyBlock = [
    "",
    "<!-- Agency Context: NBA Betting Agency -->",
    "This conversation has been routed to the NBA Betting Agency.",
    `Routing confidence: ${Math.round(agencyContext.confidence * 100)}%`,
    // ... routing info ...
    "",
    "CRITICAL TOOL INSTRUCTIONS:",
    "- For NBA analysis, use the 'nba-analysis' skill which provides game data, odds, and betting recommendations",
    "- DO NOT use generic web search for NBA queries",
    "- DO NOT make up NBA statistics or odds - use the NBA Agency data providers",
    "- All betting recommendations require human approval (HITL) before execution",
    "",
    "NBA Agency provides: NBA game analysis, betting odds, injury reports, value betting detection, and guarded recommendations.",
    "Available tools: nba-analysis skill (REQUIRED for NBA queries), webfetch (for supplementary data only).",
    "IMPORTANT: Never suggest actual bets without clear odds comparison and value assessment.",
    "",
  ].join("\n")
}
```

**G4 Requirement aggiornato:**

- [ ] Agency Context Block creato in `prompt.ts`
- [ ] Istruzioni tool corrette (quali usare, quali NON usare)
- [ ] Skill instructions per caricare l'agenzia
- [ ] Domain-specific guardrails

**Test del blocco contesto (obbligatorio):**

Verificare che il system prompt contenga il blocco contesto corretto:

1. Inietta query del dominio
2. Verifica log per `agency routed` con `agencyId: "agency-[dominio]"`
3. Verifica che il system prompt contenga il blocco contesto corretto
4. Verifica che le istruzioni tool siano corrette

**Sintomo se il blocco contesto manca:**

Il modello usa web search invece dell'agenzia specializzata, anche se il routing dice `agency-nba` o altra agenzia. Questo perche' il system prompt non ha le istruzioni corrette.

---

## Esegui governance finale

Questo protocollo e vincolante per ogni nuova agency e per refactor che cambiano behavior. Se un gate fallisce, il flusso torna alla fase precedente con aggiornamento degli artefatti.

---

## Runtime Verification Obbligatoria dopo attivazione flag (Post-Deployment)

Dopo aver attivato il flag `KILO_ROUTING_AGENCY_CONTEXT_ENABLED=true` in deployment, e **obbligatorio** eseguire un test runtime reale con `bun run dev` PRIMA di considerare l'implementazione completa. Questo passaggio non e sostituibile da test unitari o di integrazione.

### Perche e obbligatorio

I test runtime catturano failure che i test statici non possono rilevare:

- Il blocco contesto agency viene effettivamente iniettato nel system prompt
- La policy tool viene applicata correttamente dal session layer
- Il routing L0-L3 produce i tool corretti in condizioni reali
- I log mostrano `policyEnforced=true` e `blockedTools` corretti
- Il modello NON usa tool non permessi (es. `websearch` per agency-nba)

### Comando di test obbligatorio

```bash
# Query NBA di riferimento per verifica runtime
bun run dev -- --print-logs --log-level DEBUG run "Analizza le partite NBA di stasera e prepara un report betting completo: forma ultime 10 gare, pace, offensive/defensive rating, injury report aggiornato, probabili quintetti, back-to-back, travel spot, confronto quote bookmaker e stima edge con stake consigliato"
```

### Criteri di passaggio (obbligatori, tutti devono essere verdi)

| #   | Criterio                                   | Log pattern da cercare                                                        |
| --- | ------------------------------------------ | ----------------------------------------------------------------------------- |
| 1   | Agency routed a quella corretta            | `agencyId=agency-[dominio]`                                                   |
| 2   | Confidence >= 40%                          | `confidence=0.x`                                                              |
| 3   | Policy tool enforce = true                 | `policyEnforced=true`                                                         |
| 4   | allowedTools contiene solo i tool permessi | `allowedTools=["webfetch","skill"]` (NBA)                                     |
| 5   | websearch/blocced_tools NON invocato       | `blockedTools=.*websearch.*` presente + nessun `tool call.*websearch` nei log |
| 6   | Capability L1 corrette                     | `capabilities=["nba_analysis","schedule_live",...]`                           |
| 7   | Nessun `no tools resolved by policy`       | assente nei log                                                               |
| 8   | Fallback NOT used                          | `fallbackUsed=false`                                                          |

### Evidenze richieste per G6

1. **Screenshot/estratto log** con tutti i criteri #1-#8 verificabili
2. **File di log completo** salvato in: `~/.local/share/kilo/tool-output/`
3. ** Nessuna invocazione tool non permessa** - verificare con grep sui log

### Template frase di check-in nel Go/No-Go Review

```
## Post-Deployment Runtime Verification

- Command executed: `bun run dev -- --print-logs --log-level DEBUG run "[query specifica del dominio]"`
- Log file: [path al file in ~/.local/share/kilo/tool-output/]
- Criteri passati: [N/N]
- tool-policy enforced: YES/NO
- websearch invoked: YES/NO (deve essere NO)
- blockedTools contiene tool non permessi: [lista]
- Decisione: PROCEED / BLOCK
```

### Fallimento del test runtime

Se anche solo UNO dei criteri #1-#8 fallisce:

1. NON procedere a G6
2. Torna a G4 con evidenza dei log
3. Correggi il componente guasto (prompt.ts, tool-policy.ts, pipeline.ts, capability extraction)
4. Ripeti il test runtime dopo la fix
5. Documenta la root cause nel Go/No-Go Review

---

## Routing Implementation Checklist (Obbligatorio)

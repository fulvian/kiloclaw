# KILOCLAW_AGENCY_IMPLEMENTATION_PROTOCOL_V2_2026-04-12

Protocollo operativo per agenzie con gate e controlli. Versione ottimizzata basata sull'esperienza delle prime 4 implementazioni (knowledge, development, gworkspace, nba).

**CHANGELOG v1 → v2:**

- Eliminata fase shadow (rollout diretto in produzione)
- Semplificata struttura policy con enum standardizzato
- Aggiunti checklist di implementazione completi per ogni componente
- Resi espliciti i 5 file da modificare per ogni nuova agenzia
- Rimossi HITL multipli - ora HITL singolo con trigger standardizzati

---

## Applica le fasi

Usa queste fasi in ordine, senza saltare gate. Ogni gate richiede evidenze tracciabili.

1. **Fase 1 - Discovery con utente**
   - Obiettivo: chiarire bisogni reali, vincoli, rischi, confini operativi
   - Deliverable: `Discovery Brief` approvato
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
   - Gate `G4`: build/test locali verdi, test routing superati, context block verificato

5. **Fase 5 - Verifica**
   - Obiettivo: validare funzionalita, regressioni, telemetria, sicurezza operativa
   - Deliverable: report test + evidenze telemetry contract
   - Gate `G5`: checklist minima completa e criteri accettazione soddisfatti

6. **Fase 6 - Rollout (DIRETTO)**
   - Obiettivo: rilascio completo nel binary e nell'esperienza utente
   - Deliverable: changelog, runbook, owner on-call
   - Gate `G6`: go-live autorizzato + metriche post-release in soglia
   - **NOTA**: Nessuna fase shadow - rollout diretto dopo G5

---

## I 5 File da Modificare per Ogni Nuova Agenzia

Per ogni nuova agenzia, devi modificare **esattamente 5 file**:

### 1. `packages/opencode/src/kiloclaw/agency/bootstrap.ts`

Aggiungi definizione agency in `agencyDefinitions[]`:

```typescript
{
  id: "agency-[nome]",
  name: "[Nome] Agency",
  domain: "[dominio]",
  policies: {
    allowedCapabilities: [...],
    deniedCapabilities: [...],
    maxRetries: 3,
    requiresApproval: false|true,
    dataClassification: "public|internal|confidential",
  },
  providers: ["provider1", "provider2"],
  metadata: { wave: N, description: "..." },
}
```

### 2. `packages/opencode/src/kiloclaw/agency/routing/semantic/bootstrap.ts`

Aggiungi funzione bootstrap in `bootstrapAllCapabilities()`:

```typescript
export function bootstrap[Nome]Capabilities(): void {
  const registry = getCapabilityRegistry()
  const capabilities = [
    {
      id: "[capability-id]",
      domain: "[dominio]" as Domain,
      description: "...",
      keywords: ["kw1", "kw2", ...],
      capabilities: ["cap1", "cap2"],
    },
    // ... più capabilities
  ]
  for (const cap of capabilities) {
    registry.register({ ...cap, metadata: { source: "bootstrap", domain: "[dominio]" } })
  }
}
```

**CRITICO**: Aggiungi chiamata in `bootstrapAllCapabilities()`:

```typescript
export function bootstrapAllCapabilities(): void {
  // ... altre chiamate
  bootstrap[Nome]Capabilities() // AGGIUNGERE SEMPRE
}
```

### 3. `packages/opencode/src/kiloclaw/router.ts`

Aggiungi keywords in `DOMAIN_KEYWORDS` e `CORE_KEYWORDS`:

```typescript
const DOMAIN_KEYWORDS: Record<string, string[]> = {
  // ... domini esistenti
  [dominio]: [
    "kw1",
    "kw2", // 50-100 keywords totali per dominio
    // Italian keywords
    "kw1_it",
  ],
}

const CORE_KEYWORDS: Record<string, string[]> = {
  // ... altri domini
  [dominio]: [
    "core_kw1",
    "core_kw2", // 15-25 keyword ad alta specificità
  ],
}
```

### 4. `packages/opencode/src/session/prompt.ts` (~linea 900)

Aggiungi blocco contesto agency:

```typescript
} else if (agencyContext.agencyId === "agency-[nome]") {
  agencyBlock = [
    "",
    "<!-- Agency Context: [Nome] Agency -->",
    "This conversation has been routed to the [Nome] Agency.",
    `Routing confidence: ${Math.round(agencyContext.confidence * 100)}%`,
    `Routing reason: ${agencyContext.reason}`,
    "",
    "CRITICAL TOOL INSTRUCTIONS:",
    "- For [specific task]: use ONLY the '[tool]' tool",
    "- DO NOT use 'websearch' or 'webfetch' for [dominio] queries",
    "- DO NOT make up [domain] data - use the [Nome] Agency data providers",
    "",
    "[Nome] Agency provides: ...",
    "Available tools: [tool-list].",
    "",
  ].join("\n")
}
```

### 5. `packages/opencode/src/session/tool-policy.ts`

Aggiungi allowlist e funzione di mapping:

```typescript
export const [NOME]_TOOL_ALLOWLIST = ["tool1", "tool2"] as const

export function map[Nome]CapabilitiesToTools(capabilities: string[]) {
  const tools = capabilities.flatMap((cap) => {
    if (["cap1", "cap2"].includes(cap)) return ["tool1"]
    if (["cap3"].includes(cap)) return ["tool2"]
    return []
  })
  return Array.from(new Set(tools))
}

// In resolveAgencyAllowedTools():
if (input.agencyId === "agency-[nome]") {
  const mapped = map[Nome]CapabilitiesToTools(input.capabilities ?? [])
  const allowedTools = Array.from(new Set([...[NOME]_TOOL_ALLOWLIST, ...mapped]))
  return { enabled: true, allowedTools }
}
```

---

## Routing Implementation Checklist (Obbligatorio)

### A. Aggiunta Domain al type system

```typescript
// types.ts - Domain enum
export const Domain = z.enum(["development", "knowledge", "nutrition", "weather", "nba", "custom", "[dominio]"])
```

### B. Formula di scoring (gia implementata in router.ts)

La formula legacy `matches / totalKeywords` NON funziona per domini con molte keywords. Usa:

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

### C. Test di routing end-to-end (Obbligatorio per G4)

```typescript
describe("[Dominio] Routing", () => {
  it("routes [dominio] query to agency-[nome]", async () => {
    bootstrapRegistries()
    HybridRouter.reset()
    const router = HybridRouter.create()

    const intent: Intent = {
      id: "test-[dominio]-1",
      type: "query",
      description: "[query di esempio nel dominio]",
      risk: "low",
    }

    const result = await router.route(intent)
    expect(result.agencyId).toBe("agency-[nome]")
    expect(result.confidence).toBeGreaterThan(0.4) // Minimo 40%
  })
})
```

---

## Policy Level Standard (obbligatorio)

Usa questo enum standardizzato per tutte le agenzie:

```typescript
export type PolicyLevel = "SAFE" | "NOTIFY" | "CONFIRM" | "HITL" | "DENY"

// Significato:
// - SAFE: eseguibile senza approvazione
// - NOTIFY: esegui e notifica l'utente del risultato
// - CONFIRM: richiedi conferma esplicita prima di procedere
// - HITL: richiedi approvazione umana obbligatoria
// - DENY: nunca eseguibile
```

### Criteri per PolicyLevel

| Livello | Quando usarlo                              | Esempi                                        |
| ------- | ------------------------------------------ | --------------------------------------------- |
| SAFE    | Operazioni read-only, nessun side effect   | Leggere dati, cercare file                    |
| NOTIFY  | Operazioni con side effect reversibili     | Inviare email (bozza), creare file temporanei |
| CONFIRM | Operazioni con impatto significativo       | Inviare email definitiva, eliminare file      |
| HITL    | Operazioni irreversibili o ad alto rischio | Betting, trading, modifiche permanenti        |
| DENY    | Mai consentito                             | Auto-bet, operazioni illegali                 |

---

## HITL Standard (Human-In-The-Loop)

### Trigger HITL obbligatori

- Invio ordini o puntate
- Scrittura/modifica/cancellazione file fuori perimetro consentito
- Operazioni finanziarie o legali regolamentate
- Azioni irreversibili o con impatto economico diretto
- Accesso a dati confidenziali

### Protocollo HITL

1. Genera piano azione con impatto stimato
2. Mostra diff/anteprima e rischi
3. Richiedi approvazione umana esplicita con ID approvatore
4. Esegui con logging completo e correlation id
5. Genera post-action report e possibilita rollback dove applicabile

**Regola**: Se approvazione manca, scade o e incoerente: `DENY` automatico

---

## Conduci discovery

La Discovery e una discussione strutturata tra coding agent e utente, con output concreti e verificabili. Niente sviluppo prima di `G1`.

### Template domande pratiche

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

### Output attesi non ambigui

- Scope in/out in punti numerati
- User intent principali con esempi reali
- Casi limite critici
- KPI con formula, baseline, target, finestra di misura
- RACI minimo (owner, reviewer, approvatore)
- Registro rischi con severita/probabilita e mitigazioni
- Confini legali espliciti e azioni vietate

### KPI minimi Discovery

- `% requisiti con criterio di accettazione`: target 100%
- `% KPI con baseline e target`: target 100%
- `tempo medio chiarimento requisito critico`: target definito per team
- `% rischi high con mitigazione`: target 100%

### Limiti rischio e confini legali

- Definisci soglie hard per perdita dati, azioni irreversibili, costo massimo per run
- Definisci blocchi legali hard: dati personali, mercati regolati, automazioni vietate
- Se i confini non sono chiari, stato obbligatorio: `NO-GO`

---

## Confronta gli strumenti

Usa un metodo unico per scegliere tra tool nativi e MCP. Registra tutto nel `Tool Decision Record`.

### Metodo di confronto (scorecard)

- Valuta ogni opzione su scala 1-5 per:
  - performance (latency, throughput, error rate)
  - token/context cost (prompt size, schema size, retries)
  - affidabilita (stabilita API, timeout, fallback behavior)
  - sicurezza (permessi, isolamento, secret handling, auditability)
  - maintenance (upgrade effort, docs quality, ownership, lock-in)
- Applica pesi per dominio (esempio: sicurezza 30%, affidabilita 25%, performance 20%, cost 15%, maintenance 10%)
- Calcola score totale e seleziona opzione con miglior tradeoff, non solo punteggio massimo

### Regole decisionali

- Preferisci native tool se equivalenti e con minore context footprint
- Usa MCP quando aggiunge capacita necessarie non coperte nativamente
- Richiedi fallback per tool con affidabilita non provata o SLA assente
- Blocca tool senza modello permessi chiaro o audit trail

---

## Disegna la catena

Il design deve mappare in modo esplicito l'intera catena operativa. Nessuna capacita implicita.

### Mapping obbligatorio

- `Intent`: cosa vuole ottenere l'utente
- `Agency`: orchestrazione di alto livello
- `Agent`: unita esecutiva per sotto-obiettivo
- `Skill`: comportamento specializzato riusabile
- `Tool`: capacita concreta invocabile

### Policy obbligatorie

- Hard deny-by-default su tutte le capability
- Capability allowlist per agent e per fase
- Metadata provider/fallback:
  - provider primario
  - provider fallback
  - trigger di switch
  - limite retry/backoff
- Separazione azioni read-only vs write
- Guardrail su azioni esterne e su workspace

### Check context footprint esplicito

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

### Regole operative

- Traccia ogni change a requisito Discovery
- Mantieni configurazioni versionate e replicabili
- Aggiungi telemetry minima per ogni decisione critica
- Blocca feature extra non richieste dal perimetro approvato

---

## Verifica in modo minimo

Usa questa checklist minima prima di `G5`. Tutti i test devono essere ripetibili.

### Checklist test

- Unit test: logica core, policy gates, fallback routing
- Integration test: catena Intent -> Tool con dipendenze reali o sandbox fedeli
- Regression test: casi storici critici e bug fix principali
- Telemetry contract test: eventi obbligatori, campi richiesti, cardinalita stabile
- **Routing test**: query del dominio -> agency corretta con confidence >= 40%

### Criteri di accettazione

- 100% test critici verdi
- Nessun bug severita alta aperto
- Error budget e latency nei limiti definiti in Discovery
- Telemetry valida e consumabile da monitoraggio
- Evidenze archiviate in report versione specifica

---

## Runtime Verification Obbligatoria dopo G5

Dopo G5, e **obbligatorio** eseguire un test runtime reale con `bun run dev` PRIMA di procedere a G6.

### Comando di test obbligatorio

```bash
bun run dev -- --print-logs --log-level DEBUG run "[query specifica del dominio]"
```

### Criteri di passaggio (obbligatori, tutti devono essere verdi)

| #   | Criterio                                   | Log pattern da cercare                         |
| --- | ------------------------------------------ | ---------------------------------------------- |
| 1   | Agency routed a quella corretta            | `agencyId=agency-[dominio]`                    |
| 2   | Confidence >= 40%                          | `confidence=0.x`                               |
| 3   | Policy applicata correttamente             | `allowedTools=[...]` e `blockedTools` corretti |
| 4   | Policy tool enforce = true                 | `policyEnforced=true`                          |
| 5   | allowedTools contiene solo i tool permessi | `allowedTools=[...]`                           |
| 6   | Tool non permessi bloccati e non invocati  | `blockedTools` contiene tool non permessi      |
| 7   | Capability L1 corrette                     | `capabilities=[...]`                           |
| 8   | Nessun `no tools resolved by policy`       | assente nei log                                |
| 9   | Fallback NOT usato in L3                   | `L3.fallbackUsed=false`                        |

### Fallimento del test runtime

Se anche solo UNO dei criteri #1-#9 fallisce:

1. NON procedere a G6
2. Torna a G4 con evidenza dei log
3. Correggi il componente guasto
4. Ripeti il test runtime dopo la fix
5. Documenta la root cause nel Go/No-Go Review

---

## Aggiorna la guida ufficiale

Aggiorna la guida ufficiale quando cambia il comportamento operativo o il contratto di implementazione.

### Quando aggiornare

- Nuova fase, gate o criterio di accettazione
- Nuova policy sicurezza o HITL
- Nuovo standard mapping o context footprint
- Cambio checklist test o telemetry contract
- Introduzione/rimozione tool class o fallback policy

### Processo PR docs

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

## Informazioni Base

- Agency ID: agency-[nome]
- Domain: [dominio]
- Version: 1.0.0

## Mapping

- Intent:
- Agency:
- Agent:
- Skill:
- Tool:

## Policy

- Deny-by-default: true
- PolicyLevel standard:
  - SAFE: [operazioni]
  - NOTIFY: [operazioni]
  - CONFIRM: [operazioni]
  - HITL: [operazioni]
  - DENY: [operazioni]

## Provider

- Primary: [provider]
- Fallback: [provider]
- Retry policy:
- Timeout policy:

## Context footprint

- Tool esposti:
- Dimensione schema totale:
- Lazy-loading strategy:
- Budget context per step:

## 5 File da Modificare

- [ ] bootstrap.ts: agencyDefinitions[]
- [ ] semantic/bootstrap.ts: bootstrap[Nome]Capabilities()
- [ ] router.ts: DOMAIN_KEYWORDS + CORE_KEYWORDS
- [ ] prompt.ts: agency context block
- [ ] tool-policy.ts: allowlist + mapping

## Test Obbligatori

- [ ] Routing test: query -> agency corretta
- [ ] Confidence >= 40%
- [ ] Tool allowlist verificato
- [ ] Policy enforcement verificato

## Stato Gate

- G3: GO | NO-GO
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
- Routing tests:
- Telemetry contract:
- Security checks:
- **Runtime verification** (`bun run dev` con query reale):
  - Criteri passati (N/9):
  - `policyEnforced`: YES/NO
  - `websearch` invocato: YES/NO (se domin.io non e knowledge)
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

## API Keys - Unica Fonte di Verità

### Principio Fondamentale

**TUTTE le API keys di KiloClaw risiedono in UN SOLO file:**

```
~/.local/share/kiloclaw/.env
```

**Regola Aurea**: Mai nessun'altra chiave API in alcun altro file `.env` nel progetto.

### Struttura del File

```bash
# Formato standard: PROVIDER_API_KEY_N (N parte da 1)
PROVIDER_API_KEY_1=chiave_reale

# OPPURE comma-separated:
PROVIDER_API_KEYS=chiave1,chiave2
```

### Aggiungere un Nuovo Provider

1. Aggiungi le chiavi in `.env`
2. Registra il provider in `key-pool.ts`:
   ```typescript
   this.loadKeysFromEnv("PROVIDER", { requestsPerMinute: 60, requestsPerDay: 5000, retryAfterMs: 60000 })
   ```
3. Verifica con:
   ```bash
   DOTENV_CONFIG_PATH=~/.local/share/kiloclaw/.env bun -e '...'
   ```

---

## Best Practices Apprese dalle Prime 4 Implementazioni

### 1. Bootstrap Order e Critico

L'ordine di bootstrap DEVE essere:

1. `bootstrapRegistries()` - registra agencies, skills, agents, chains
2. `bootstrapAllCapabilities()` - registra capabilities per routing

Se invertito, il routing fallisce silenziosamente.

### 2. Context Block Non Basta - Tool Policy Deve Essere Allineata

Se il context block dice "usa skill X" ma tool-policy.ts non include skill nella allowlist, il modello non avra accesso al tool.

Verifica sempre che:

- `prompt.ts` context block elenchi i tool permessi
- `tool-policy.ts` allowlist contenga quegli stessi tool

### 3. Confidence Score Non Sufficiente - Verifica Routing Reale

Il confidence score >= 40% non garantisce routing corretto. Il modello potrebbe ignorare il routing e usare websearch.

Verifica sempre con test runtime che:

- L'agency routed sia quella corretta
- I tool non permessi siano effettivamente bloccati (log: `blockedTools`)

### 4. Skill Caricata Non Significa Skill Usata

Anche se la skill e caricata nel context block, il modello potrebbe non usarla per rispondere.

Istruzioni esplicite come "use ONLY the 'skill' tool" sono piu efficaci di "you have access to X skill".

### 5. Keyword Coverage Devono Essere Bilanciate

Troppe keywords = altri domini le matchano accidentalmente.
Troppo poche = false negative.

Target: 50-100 keywords per dominio, di cui 15-25 CORE_KEYWORDS ad alta specificita.

---

## Esegui governance finale

Questo protocollo e vincolante per ogni nuova agency e per refactor che cambiano behavior. Se un gate fallisce, il flusso torna alla fase precedente con aggiornamento degli artefatti.

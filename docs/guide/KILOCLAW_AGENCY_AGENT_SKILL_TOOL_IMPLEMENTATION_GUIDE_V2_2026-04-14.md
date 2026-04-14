# Playbook Kiloclaw - Guida Implementazione Agenzie V2

**Versione**: 2.0-2026-04-14
**Stato**: Canonico - Sostituisce la guida del 7 aprile
**Basi**: `KILOCLAW_AGENCY_AGENT_SKILL_TOOL_IMPLEMENTATION_GUIDE_2026-04-07.md` + Protocollo V2 del 12 aprile
**Complementare a**: `KILOCLAW_AGENCY_IMPLEMENTATION_PROTOCOL_V2_2026-04-12.md`

Guida operativa per implementare agenzie sicure, verificabili e production-ready.

---

## SEZIONE 1: Principi Fondamentali

### 1.1 Gerarchia Obbligatoria

```
Intent → Core/Orchestrator → Agencies → Agents → Skills → Tools/MCP
```

Questa gerarchia è **sempre obbligatoria**. Nessuna scorciatoia consentita.

### 1.2 Principi Non Negoziabili

- **Policy runtime hard** vs **prompt soft**: la policy è enforcement deterministico, il prompt è solo guidance linguistica. Il modello può ignorare il prompt ma non la policy.
- **Deny-by-default**: implementa sempre deny-by-default su capability e tool surface, poi apri solo con allowlist esplicita.
- **Core agnostico**: mai hardcodare edge case vendor-specific dentro orchestrator, routing o policy engine.
- **API Keys**: tutte le chiavi risiedono in `~/.local/share/kiloclaw/.env`. Mai altrove.

### 1.3 Componenti e Responsabilità

| Componente        | File                                      | Responsabilità                               |
| ----------------- | ----------------------------------------- | -------------------------------------------- |
| Instrada intent   | `orchestrator.ts` + `pipeline.ts` (L0-L3) | Assegnazione iniziale + routing stratificato |
| Registra dominio  | `agency-registry.ts` + `types.ts`         | Policy e dominio agency                      |
| Pubblica agent    | `agency-definitions.ts`                   | FlexibleAgentRegistry                        |
| Pubblica skill    | `skill-registry.ts` + `bootstrap.ts`      | Registrazione skill                          |
| Risolvi tool      | `prompt.ts:1009` + `tool-policy.ts`       | Gate runtime e policy centralizzata          |
| Emetti telemetria | `routing.metrics.ts`                      | Eventi L0-L3 con correlationId               |

---

## SEZIONE 2: Lifecycle di Implementazione (G1-G6)

### Panoramica Fasi

| Fase         | Obiettivo                          | Deliverable                      | Gate                                        |
| ------------ | ---------------------------------- | -------------------------------- | ------------------------------------------- |
| G1 Discovery | Chiarire bisogni, vincoli, rischi  | Discovery Brief approvato        | Requisiti non ambigui, KPI misurabili       |
| G2 Research  | Confrontare native vs MCP          | Tool Decision Record             | Score e rationale verificabile              |
| G3 Design    | Definire mapping + policy runtime  | Agency Manifest Draft            | deny-by-default attivo, allowlist esplicita |
| G4 Implement | Realizzare componenti minime       | codice, config, manifest         | Build/test verdi, routing test passati      |
| G5 Verifica  | Validare funzionalità e telemetria | Report test + telemetry contract | Checklist completa, criteri soddisfatti     |
| G6 Rollout   | Rilascio nel binary                | changelog, runbook, owner        | Go-live autorizzato, metriche in soglia     |

**Nessuna fase shadow** - rollout diretto dopo G5.

---

## SEZIONE 3: I 5 File da Modificare per Ogni Nuova Agenzia

Per ogni nuova agenzia, devi modificare **esattamente 5 file**:

### File 1: `packages/opencode/src/kiloclaw/agency/bootstrap.ts`

Aggiungi definizione in `agencyDefinitions[]`:

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

### File 2: `packages/opencode/src/kiloclaw/agency/routing/semantic/bootstrap.ts`

Aggiungi funzione bootstrap e chiamala in `bootstrapAllCapabilities()`:

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
  ]
  for (const cap of capabilities) {
    registry.register({ ...cap, metadata: { source: "bootstrap", domain: "[dominio]" } })
  }
}

// In bootstrapAllCapabilities():
// AGGIUNGERE SEMPRE: bootstrap[Nome]Capabilities()
```

**ORDINE CRITICO**: L'ordine di bootstrap DEVE essere:

1. `bootstrapRegistries()` - agencies, skills, agents, chains
2. `bootstrapAllCapabilities()` - capabilities per routing

Se invertito, il routing fallisce **silenziosamente**.

### File 3: `packages/opencode/src/kiloclaw/router.ts`

Aggiungi keywords in `DOMAIN_KEYWORDS` e `CORE_KEYWORDS`:

```typescript
const DOMAIN_KEYWORDS: Record<string, string[]> = {
  // ... domini esistenti
  [dominio]: [
    "kw1",
    "kw2", // 50-100 keywords totali per dominio
    // Italian keywords
    "kw1_it",
    "kw2_it",
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

**Formula di scoring** (già implementata in router.ts):

```typescript
// 1. Core keyword bonus
const coreMatches = coreKeywords.filter((k) => text.includes(k)).length
const coreBonus = coreMatches > 0 ? 0.2 + coreMatches * 0.1 : 0

// 2. Scaled base score (sqrt per non penalizzare query brevi)
const baseScaled = Math.sqrt(matches / totalKeywords)
const base = Math.min(0.7, baseScaled * 0.7)

// 3. Type boost
const typeBoost = typeIncludes(domainSpecificTerms) ? 0.25 : 0

// 4. Score finale
return Math.min(1, base + coreBonus + typeBoost)
```

### File 4: `packages/opencode/src/session/prompt.ts` (~linea 1000)

Aggiungi blocco contesto agency con **CRITICAL TOOL INSTRUCTIONS**:

```typescript
} else if (agencyContext.agencyId === "agency-[nome]") {
  agencyBlock = [
    "",
    "<!-- Agency Context: [Nome] Agency -->",
    "This conversation has been routed to the [Nome] Agency.",
    `Routing confidence: ${Math.round(agencyContext.confidence * 100)}%`,
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

**CRITICO**: Il context block DEVE allineare con tool-policy.ts. Se il context block dice "usa skill X" ma tool-policy.ts non include quella skill nella allowlist, il modello non avrà accesso al tool.

### File 5: `packages/opencode/src/session/tool-policy.ts`

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

## SEZIONE 4: PolicyLevel Standard

Usa questo enum standardizzato per tutte le agenzie:

```typescript
export type PolicyLevel = "SAFE" | "NOTIFY" | "CONFIRM" | "HITL" | "DENY"
```

| Livello | Quando Usarlo                              | Esempi                                        |
| ------- | ------------------------------------------ | --------------------------------------------- |
| SAFE    | Operazioni read-only, nessun side effect   | Leggere dati, cercare file                    |
| NOTIFY  | Operazioni con side effect reversibili     | Inviare email (bozza), creare file temporanei |
| CONFIRM | Operazioni con impatto significativo       | Inviare email definitiva, eliminare file      |
| HITL    | Operazioni irreversibili o ad alto rischio | Betting, trading, modifiche permanenti        |
| DENY    | Mai consentito                             | Auto-bet, operazioni illegali                 |

### HITL Standard (Human-In-The-Loop)

**Trigger HITL obbligatori**:

- Invio ordini o puntate
- Scrittura/modifica/cancellazione file fuori perimetro consentito
- Operazioni finanziarie o legali regolamentate
- Azioni irreversibili o con impatto economico diretto

**Regola**: Se approvazione manca, scade o è incoerente → `DENY` automatico.

---

## SEZIONE 5: Aggiungere una Nuova Agency

### Step-by-Step

1. **Definisci schema e policy** in `AgencyDefinitionSchema`
2. **Registra** in `bootstrap.ts` con `id` stabile (`agency-<domain>`)
3. **Aggiorna routing L0** in `router.ts` con keywords (50-100 totali, 15-25 core)
4. **Aggiungi capabilities** in `semantic/bootstrap.ts`
5. **Aggiungi context block** in `prompt.ts`
6. **Aggiungi tool policy** in `tool-policy.ts`
7. **Aggiungi test** di registrazione e routing

### Snippet Riferimento (bootstrap.ts)

```typescript
{
  id: "agency-legal",
  name: "Legal Agency",
  domain: "legal",
  policies: {
    allowedCapabilities: ["contract-analysis", "source_grounding"],
    deniedCapabilities: ["code-execution"],
    maxRetries: 2,
    requiresApproval: true,
    dataClassification: "confidential",
  },
  providers: ["tavily"],
  metadata: { wave: 3, description: "Legal research" },
}
```

---

## SEZIONE 6: Aggiungere un Nuovo Agent

- Definisci agent come **bundle di capability**, non come elenco task hardcoded
- Usa `FlexibleAgentDefinitionSchema`
- `permission` minima default: `PermissionNext.fromConfig({ "*": "deny" })`
- Associa a `primaryAgency` corretta, `secondaryAgencies` solo se verificato
- **Versiona sempre in semver** e documenta breaking changes nella PR

### Snippet Riferimento

```typescript
FlexibleAgentRegistry.registerAgent({
  id: "contract-reviewer",
  name: "Contract Reviewer",
  primaryAgency: "agency-legal",
  secondaryAgencies: ["agency-knowledge"],
  capabilities: ["contract-analysis", "risk-assessment"],
  skills: ["contract-parse", "clause-risk-check"],
  constraints: { timeoutMs: 45_000, maxConcurrentTasks: 2 },
  version: "1.0.0",
  description: "Analizza contratti e segnala rischi",
  permission: PermissionNext.fromConfig({ "*": "deny", read: "allow", webfetch: "allow" }),
  mode: "subagent",
})
```

---

## SEZIONE 7: Aggiungere una Nuova Skill

- Crea skill con **input/output schema espliciti**
- Capability tags coerenti con il registry
- Evita skill monolitiche → preferisci step componibili
- Se richiede contesto, dichiara `providesContext`
- Output **deterministico e verificabile** con evidenze

### Snippet Riferimento

```typescript
SkillRegistry.registerSkill({
  id: "clause-risk-check",
  name: "Clause Risk Check",
  version: "1.0.0",
  description: "Valuta rischio clausole contrattuali",
  inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  outputSchema: { type: "object", properties: { risks: { type: "array" } } },
  capabilities: ["risk-assessment", "source_grounding"],
  tags: ["legal"],
})
```

---

## SEZIONE 8: Aggiungere un Nuovo Tool

### Tool Interni

```typescript
export const LegalSearchTool = Tool.define("legal_search", async () => ({
  description: "Ricerca fonti giuridiche",
  parameters: z.object({ query: z.string() }),
  async execute(args, ctx) {
    await ctx.ask({
      permission: "websearch",
      patterns: [args.query],
      always: ["*"],
      metadata: { query: args.query, capability: "contract-analysis" },
    })
    return {
      title: `Legal search: ${args.query}`,
      output: "...",
      metadata: { providerUsed: "tavily", fallbackChainTried: ["tavily", "brave"] },
    }
  },
}))
```

### Tool MCP

- Integra tramite `MCP.tools()` in `packages/opencode/src/mcp/index.ts`
- **Sempre** dal gate in `session/prompt.ts`
- Native tool e MCP tool condividono la stessa allowlist capability-based

---

## SEZIONE 9: Policy e Governance

### Regole Fondamentali

- **Centralizza mapping** capability → tool in `tool-policy.ts`
- **Deny-by-default** quando agencyContext è attivo
- **Fallback provider** nel catalogo, mai nel core routing
- **Nessuna allowlist implicita** - solo esplicita

### Guardrail Pre-Merge (Obbligatori)

| Gate | Criterio                                                       |
| ---- | -------------------------------------------------------------- |
| G1   | Nessun tool non autorizzato visibile in `resolveTools`         |
| G2   | MCP incluso nello stesso filtro policy dei tool interni        |
| G3   | Nessuna regola vendor-specific hardcoded nel core              |
| G4   | Metadata provider/fallback sempre presente nei tool di ricerca |

---

## SEZIONE 10: Observability e Audit

### Eventi Obbligatori

- `RoutingMetrics.recordLayer0/1/2/3` con `decision`, `reason`, `latencyMs`, `timestamp`
- `PolicyDeniedEvent` e `FallbackUsedEvent` in ogni denial/fallback reale
- Log: `agencyId`, `allowedTools`, `blockedTools`, route chain

### Metriche Minime

- p50/p95/p99 latenza per layer L0-L3
- hit/miss cache router e capability
- tasso fallback per layer
- `toolsDenied` e `blockedTools` count
- provider distribution e fallback chain depth

---

## SEZIONE 11: Testing Strategy

### Suite Obbligatoria

```bash
# Unit test
bun test --cwd packages/opencode test/session/tool-policy.test.ts

# Integration test
bun test --cwd packages/opencode test/kiloclaw/routing-pipeline.test.ts

# Typecheck
bun run --cwd packages/opencode typecheck
```

### Test di Routing End-to-End (Obbligatorio per G4)

```typescript
describe("[Dominio] Routing", () => {
  it("routes [dominio] query to agency-[nome]", async () => {
    bootstrapRegistries()
    HybridRouter.reset()
    const router = HybridRouter.create()

    const intent: Intent = {
      id: "test-[dominio]-1",
      type: "query",
      description: "[query di esempio]",
      risk: "low",
    }

    const result = await router.route(intent)
    expect(result.agencyId).toBe("agency-[nome]")
    expect(result.confidence).toBeGreaterThan(0.4) // Minimo 40%
  })
})
```

---

## SEZIONE 12: Best Practices dalle Prime Implementazioni

### 1. Bootstrap Order è Critico

L'ordine **DEVE** essere:

1. `bootstrapRegistries()` → agencies, skills, agents, chains
2. `bootstrapAllCapabilities()` → capabilities per routing

Se invertito, routing fallisce silenziosamente.

### 2. Context Block Non Basta - Tool Policy Deve Essere Allineata

Verifica sempre che:

- `prompt.ts` context block elenchi i tool permessi
- `tool-policy.ts` allowlist contenga quegli stessi tool

### 3. Confidence Score Non Sufficiente - Verifica Routing Reale

Confidence >= 40% **non garantisce** routing corretto. Il modello potrebbe ignorare il routing e usare websearch.

Verifica con test runtime che:

- L'agency routed sia quella corretta
- I tool non permessi siano effettivamente bloccati (log: `blockedTools`)

### 4. Skill Caricata Non Significa Skill Usata

Istruzioni esplicite `"use ONLY the 'skill' tool"` sono più efficaci di `"you have access to X skill"`.

### 5. Keyword Coverage Devono Essere Bilanciate

- Troppe keywords → altri domini le matchano accidentalmente
- Troppo poche → false negative

**Target**: 50-100 keywords per dominio, di cui 15-25 CORE_KEYWORDS ad alta specificità.

---

## SEZIONE 13: Runtime Verification Obbligatoria (Post-G5)

Dopo G5, **obbligatorio** eseguire test runtime reale:

```bash
bun run dev -- --print-logs --log-level DEBUG run "[query specifica del dominio]"
```

### Criteri di Passaggio (9/9 Obbligatori)

| #   | Criterio                            | Log Pattern                                    |
| --- | ----------------------------------- | ---------------------------------------------- |
| 1   | Agency routed corretta              | `agencyId=agency-[dominio]`                    |
| 2   | Confidence >= 40%                   | `confidence=0.x`                               |
| 3   | Policy applicata                    | `allowedTools=[...]` e `blockedTools` corretti |
| 4   | Policy enforce = true               | `policyEnforced=true`                          |
| 5   | allowedTools contiene solo permessi | `allowedTools=[...]`                           |
| 6   | blockedTools non invocati           | `blockedTools` contiene non-permessi           |
| 7   | Capability L1 corrette              | `capabilities=[...]`                           |
| 8   | Nessun "no tools resolved"          | assente nei log                                |
| 9   | Fallback NOT used in L3             | `L3.fallbackUsed=false`                        |

### Failure Protocol

Se anche **UNO** dei criteri fallisce:

1. **NON** procedere a G6
2. Torna a G4 con evidenza dei log
3. Correggi il componente guasto
4. Ripeti il test runtime
5. Documenta root cause nel Go/No-Go Review

---

## SEZIONE 14: Anti-Pattern da Evitare

### ❌ Policy nel Prompt (Errato)

```ts
if (agencyId === "agency-knowledge") {
  // solo istruzione soft, nessun gate hard
  prompt += "Usa websearch"
}
```

### ✅ Policy Hard nel Runtime (Corretto)

```ts
const policy = resolveAgencyAllowedTools({ agencyId, enabled: Flag.KILO_ROUTING_AGENCY_CONTEXT_ENABLED, capabilities })
if (policy.enabled && !policy.allowedTools.includes(tool.id)) return
```

### Altri Anti-Pattern

- **Allowlist duplicata**: non mantenere mapping tool in file scollegati
- **Core vendor-coupled**: non scrivere `if provider === "X"` in orchestrator
- **Fallback opaco**: non nascondere fallback chain nei metadata
- **Test incompleti**: non fermarti al green unit test quando il bug era end-to-end

---

## SEZIONE 15: Rollout e Governance

### Sequenza Rollout

1. `hard-gate canary`: enforcement su traffico limitato
2. `full rollout`: allarga dopo due cicli senza regressioni
3. `stabilize`: consolida test golden e regression

### Definition of Done (Pre-Merge)

- Policy runtime hard blocca tool fuori allowlist
- Core agnostico, provider risolti via catalogo
- Audit chain L0-L3 con reason e correlation
- Test verdi + regressione specifica del cambiamento
- Documentazione aggiornata

### Blocchi Pre-Merge Obbligatori

| Blocker   | Condizione                                             |
| --------- | ------------------------------------------------------ |
| BLOCKER-1 | Mancato gate deny-by-default nel path sessione         |
| BLOCKER-2 | MCP non passa dal filtro policy centrale               |
| BLOCKER-3 | Metadata provider/fallback assente in tool search-like |
| BLOCKER-4 | Assenza test anti-regressione per il bug motivante     |
| BLOCKER-5 | Regressione naming/UI che maschera provider reale      |

---

## SEZIONE 16: FAQ Operativa per Agenti LLM

- **Prompt dice una cosa e policy runtime un'altra**: applica sempre la policy runtime hard
- **Provider fallisce**: prova fallback catalogato, registra `fallbackChainTried` con errori
- **Nuovo provider**: aggiungilo in `agency/catalog.ts`, non nel core orchestrator
- **Capability non matcha**: fallback deterministico + `FallbackUsedEvent` con reason
- **Tool MCP non previsto**: blocca esposizione in `resolveTools` con stessa allowlist centralizzata
- **Mancata evidenza audit**: considera change incompleta, non pronta al merge

**Regola anti-allucinazione**: scrivi policy nei moduli runtime (`tool-policy`, registries, pipeline), usa il prompt solo per comportamento linguistico e stile output.

---

## APPENDICE: Template Operativi

### Discovery Brief Template

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

## Decisione Gate

- Stato G1: GO | NO-GO
- Owner:
- Data:
```

### Go/No-Go Review Template

```md
# Go No-Go Review

## Stato Gate

- G1:
- G2:
- G3:
- G4:
- G5:
- G6:

## Runtime Verification

- Criteri passati (N/9):
- `policyEnforced`: YES/NO
- `websearch` invocato: YES/NO
- `blockedTools` corretti: YES/NO

## Decisione Finale

- Esito: GO | NO-GO
- Owner:
- Approvatore:
- Data:
```

# Playbook Kiloclaw

Guida operativa per estensioni sicure e verificabili.

## 1) Fissa scopo e principi non negoziabili

- Tratta questo documento come single source of truth per introdurre nuove agency, agent, skill e tool nel runtime Kiloclaw.
- Applica sempre gerarchia obbligatoria `Intent -> Core/Orchestrator -> Agencies -> Agents -> Skills -> Tools/MCP` senza scorciatoie.
- Separa policy runtime hard (enforcement) da istruzioni prompt soft (guidance), perché il modello può ignorare la guidance.
- Implementa `deny-by-default` su superficie tool e capability, poi apri solo con allowlist esplicita.
- Mantieni il core agnostico: vietato hardcodare edge case vendor-specific dentro orchestrazione, routing o policy engine.

---

## 2) Mappa componenti e responsabilita

- **Instrada intent**: usa `packages/opencode/src/kiloclaw/orchestrator.ts` per assegnazione iniziale e `packages/opencode/src/kiloclaw/agency/routing/pipeline.ts` per routing L0-L3.
- **Registra dominio**: definisci policy e dominio in `packages/opencode/src/kiloclaw/agency/registry/types.ts` e registra tramite `packages/opencode/src/kiloclaw/agency/registry/agency-registry.ts`.
- **Pubblica agent**: inserisci definizioni in `packages/opencode/src/kiloclaw/agency/agency-definitions.ts` usando `FlexibleAgentRegistry`.
- **Pubblica skill**: registra in `packages/opencode/src/kiloclaw/agency/registry/skill-registry.ts` e bootstrap in `packages/opencode/src/kiloclaw/agency/bootstrap.ts`.
- **Risolvi tool**: applica gate runtime in `packages/opencode/src/session/prompt.ts:1009` e policy centralizzata in `packages/opencode/src/session/tool-policy.ts`.
- **Emetti telemetria**: usa eventi in `packages/opencode/src/kiloclaw/telemetry/routing.metrics.ts` e log con `correlationId`.

---

## 3) Aggiungi una nuova agency

- Definisci schema e policy in `AgencyDefinitionSchema` con capability consentite e negate, classificazione dati e retry massimi.
- Registra la nuova agency in bootstrap (`packages/opencode/src/kiloclaw/agency/bootstrap.ts`) con `id` stabile (`agency-<domain>`) e `domain` univoco.
- Mappa provider solo nel catalogo (`packages/opencode/src/kiloclaw/agency/catalog.ts`) senza dipendenze dirette del core verso provider concreti.
- Aggiorna routing L0 per il nuovo dominio tramite classifier/router, evitando keyword rigide non internazionalizzate.
- Aggiungi test di registrazione e collisione dominio in `packages/opencode/test/kiloclaw/*`.

Snippet di riferimento:

```ts
AgencyRegistry.registerAgency({
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
})
```

---

## 4) Aggiungi un nuovo agent

- Definisci agent come bundle di capability, non come elenco task hardcoded, usando `FlexibleAgentDefinitionSchema`.
- Mantieni `permission` minima per default con `PermissionNext.fromConfig({ "*": "deny" })` e apri solo le azioni necessarie.
- Associa agent a `primaryAgency` corretta e usa `secondaryAgencies` solo se esiste un caso verificato.
- Versiona sempre in semver e documenta cambiamenti breaking nella PR.
- Verifica match capability con `FlexibleAgentRegistry.findByCapabilities` e aggiungi test di ranking.

Snippet di riferimento:

```ts
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
  prompt: "Segui policy runtime, cita evidenze, evita assunzioni",
  permission: PermissionNext.fromConfig({ "*": "deny", read: "allow", webfetch: "allow" }),
  mode: "subagent",
})
```

---

## 5) Aggiungi una nuova skill

- Crea skill con input/output schema espliciti e capability tags coerenti con il registry.
- Evita skill monolitiche, preferisci step componibili riusabili da chain.
- Registra skill in bootstrap o manifest loader, poi valida risoluzione capability con `SkillRegistry.findByCapabilities`.
- Se la skill richiede contesto, dichiara `providesContext` e documenta dipendenze.
- Mantieni output deterministico e verificabile con evidenze o riferimenti fonte.

Snippet di riferimento:

```ts
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

## 6) Aggiungi un nuovo tool interno o MCP

- Definisci tool interni con `Tool.define` in `packages/opencode/src/tool/*.ts` e registra in `packages/opencode/src/tool/registry.ts`.
- Applica `ctx.ask` e metadata strutturato in ogni execute, includendo campi audit minimi.
- Per tool MCP, integra tramite `MCP.tools()` (`packages/opencode/src/mcp/index.ts`) e passa sempre dal gate in `session/prompt.ts`.
- Vieta bypass policy: native tool e MCP tool devono condividere la stessa allowlist capability-based.
- Non introdurre nomi UI fuorvianti rispetto al provider reale.

Snippet tool interno:

```ts
export const LegalSearchTool = Tool.define("legal_search", async () => ({
  description: "Ricerca fonti giuridiche con audit metadata",
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
      metadata: {
        providerUsed: "tavily",
        fallbackChainTried: ["tavily", "brave"],
        errorsByProvider: {},
      },
    }
  },
}))
```

---

## 7) Applica policy e governance

- Centralizza mapping capability -> tool in `packages/opencode/src/session/tool-policy.ts` e riusalo in ogni path runtime.
- Usa deny-by-default quando `agencyContext` è attivo, poi abilita solo tool presenti in allowlist esplicita.
- Gestisci fallback provider nel catalogo, non nel core routing, e ritorna metadata `providerUsed`, `fallbackChainTried`, `errorsByProvider`.
- Impedisci allowlist implicite o inferite da naming, perché creano drift e regressioni silenziose.
- Mantieni policy di dominio fuori da prompt e fuori da singoli tool.

Guardrail obbligatorio prima merge:

- `Gate 1`: nessun tool non autorizzato visibile al modello in `resolveTools`
- `Gate 2`: MCP incluso nello stesso filtro policy dei tool interni
- `Gate 3`: nessuna regola vendor-specific hardcoded nel core runtime
- `Gate 4`: metadata provider/fallback sempre presente nei tool di ricerca

---

## 8) Implementa observability e audit

- Emetti eventi L0-L3 via `RoutingMetrics.recordLayer0/1/2/3` con `decision`, `reason`, `latencyMs`, `timestamp`.
- Pubblica `PolicyDeniedEvent` e `FallbackUsedEvent` in ogni denial/fallback reale.
- In sessione logga `agencyId`, `allowedTools`, `blockedTools` e route chain in `packages/opencode/src/session/prompt.ts`.
- Salva audit policy con `AuditRepo.log` quando un’azione è negata o approvata in `orchestrator.ts`.
- Assicurati che ogni evento sia correlabile con `correlationId` unico end-to-end.

Metriche minime richieste:

- p50/p95/p99 latenza per layer L0-L3
- hit/miss cache router e capability
- tasso fallback per layer
- conteggio `toolsDenied` e `blockedTools`
- distribution provider e fallback chain depth

---

## 9) Definisci strategy di testing

- Copri unit test per mapping policy, capability matching e schema validation.
- Copri integration test per percorso completo intent -> agency -> skill -> agent -> tools con assert su metadata.
- Aggiungi contract test per eventi telemetrici e shape payload (`routing.metrics.ts`).
- Aggiungi regression test per bug reali già risolti, inclusi typo multilingual e blocco tool non autorizzati.
- Mantieni golden test su output UX critico per evitare labeling fuorviante.

Suite minima consigliata:

- `packages/opencode/test/session/tool-policy.test.ts`
- `packages/opencode/test/kiloclaw/routing-pipeline.test.ts`
- `packages/opencode/test/tool/websearch.test.ts`
- nuovi test dominio-specifico in `packages/opencode/test/kiloclaw/`

Comandi di verifica:

```bash
bun run --cwd packages/opencode typecheck
bun test --cwd packages/opencode test/session/tool-policy.test.ts test/kiloclaw/routing-pipeline.test.ts test/tool/websearch.test.ts
```

---

## 10) Chiudi PR con definition of done

- Conferma che policy runtime hard blocchi i tool fuori allowlist in tutti i path.
- Conferma che il core resti agnostico e che i provider siano risolti via catalogo.
- Conferma presenza di audit chain L0-L3 con reason e correlation.
- Conferma test verdi e aggiunta almeno una regression specifica del cambiamento.
- Conferma documentazione aggiornata in `docs/` con impatti operativi e rollout notes.

Blocchi pre-merge obbligatori:

- `BLOCKER`: manca gate deny-by-default nel path sessione
- `BLOCKER`: MCP non passa dal filtro policy centrale
- `BLOCKER`: metadata provider/fallback assente in output tool search-like
- `BLOCKER`: assenza test anti-regressione per il bug che motivava la change
- `BLOCKER`: regressione naming/UI che maschera provider reale

---

## 11) Evita anti-pattern comuni

- **Policy nel prompt**: non affidare enforcement a testo prompt, perché non è un controllo deterministico.
- **Allowlist duplicata**: non mantenere mapping tool in più file scollegati, perché diverge in produzione.
- **Core vendor-coupled**: non scrivere `if provider === "X"` in orchestrator o pipeline.
- **Fallback opaco**: non nascondere fallback chain e errori provider nei metadata.
- **Test incompleti**: non fermarti al green unit test quando il bug era end-to-end.

Esempio errato:

```ts
if (agencyId === "agency-knowledge") {
  // solo istruzione soft, nessun gate hard
  prompt += "Usa websearch"
}
```

Esempio corretto:

```ts
const policy = resolveAgencyAllowedTools({ agencyId, enabled: Flag.KILO_ROUTING_AGENCY_CONTEXT_ENABLED, capabilities })
if (policy.enabled && !policy.allowedTools.includes(tool.id)) return
```

---

## 12) I 5 file da modificare per ogni nuova agenzia

Per ogni nuova agenzia, devi modificare **esattamente 5 file**:

### 1. `packages/opencode/src/kiloclaw/agency/bootstrap.ts`

Aggiungi definizione agency in `agencyDefinitions[]`.

### 2. `packages/opencode/src/kiloclaw/agency/routing/semantic/bootstrap.ts`

Aggiungi funzione `bootstrap[Nome]Capabilities()` e chiamala in `bootstrapAllCapabilities()`.

**CRITICO**: L'ordine di bootstrap DEVE essere:
1. `bootstrapRegistries()` - agencies, skills, agents, chains
2. `bootstrapAllCapabilities()` - capabilities per routing

Se invertito, il routing fallisce silenziosamente.

### 3. `packages/opencode/src/kiloclaw/router.ts`

Aggiungi keywords in `DOMAIN_KEYWORDS` e `CORE_KEYWORDS`:
- 50-100 keywords totali per dominio
- 15-25 CORE_KEYWORDS ad alta specificità
- Keywords italiane se dominio italiano

### 4. `packages/opencode/src/session/prompt.ts` (~linea 900)

Aggiungi blocco contesto agency con istruzioni CRITICAL TOOL.

**CRITICO**: Il context block DEVE allineare con tool-policy.ts. Se il context block dice "usa skill X" ma tool-policy.ts non include quella skill nella allowlist, il modello non avrà accesso al tool.

### 5. `packages/opencode/src/session/tool-policy.ts`

Aggiungi allowlist e funzione `map[Nome]CapabilitiesToTools()`.

---

## 12b) Best practices dalle prime implementazioni

### 1. Bootstrap Order è Critico

L'ordine di bootstrap DEVE essere:
1. `bootstrapRegistries()` - registra agencies, skills, agents, chains
2. `bootstrapAllCapabilities()` - registra capabilities per routing

Se invertito, il routing fallisce silenziosamente.

### 2. Context Block Non Basta - Tool Policy Deve Essere Allineata

Se il context block dice "usa skill X" ma tool-policy.ts non include skill nella allowlist, il modello non avrà accesso al tool.

Verifica sempre che:
- `prompt.ts` context block elenchi i tool permessi
- `tool-policy.ts` allowlist contenga quegli stessi tool

### 3. Confidence Score Non Sufficiente - Verifica Routing Reale

Il confidence score >= 40% non garantisce routing corretto. Il modello potrebbe ignorare il routing e usare websearch.

Verifica sempre con test runtime che:
- L'agency routed sia quella corretta
- I tool non permessi siano effettivamente bloccati (log: `blockedTools`)

### 4. Skill Caricata Non Significa Skill Usata

Anche se la skill è caricata nel context block, il modello potrebbe non usarla per rispondere.

Istruzioni esplicite come "use ONLY the 'skill' tool" sono più efficaci di "you have access to X skill".

### 5. Keyword Coverage Devono Essere Bilanciate

Troppe keywords = altri domini le matchano accidentalmente.
Troppo poche = false negative.

Target: 50-100 keywords per dominio, di cui 15-25 CORE_KEYWORDS ad alta specificità.

---

## 12c) PolicyLevel Standard

Usa questo enum standardizzato per tutte le agenzie:

```typescript
export type PolicyLevel = "SAFE" | "NOTIFY" | "CONFIRM" | "HITL" | "DENY"
```

| Livello | Quando usarlo | Esempi |
|---------|---------------|--------|
| SAFE | Operazioni read-only, nessun side effect | Leggere dati, cercare file |
| NOTIFY | Operazioni con side effect reversibili | Inviare email (bozza), creare file temporanei |
| CONFIRM | Operazioni con impatto significativo | Inviare email definitiva, eliminare file |
| HITL | Operazioni irreversibili o ad alto rischio | Betting, trading, modifiche permanenti |
| DENY | Mai consentito | Auto-bet, operazioni illegali |

---

## 12d) Usa template pronti all'uso

Template agency manifest (`schema.ts` compatibile):

```ts
export const agencyManifest = {
  id: "agency-legal",
  version: "1.0.0",
  name: "Legal Agency",
  description: "Gestisce ricerca e analisi legale",
  compatibility: { minVersion: "1.0.0", deprecated: false },
  capabilities: ["contract-analysis", "source_grounding"],
  tags: ["legal"],
  domain: "legal",
  policies: {
    allowedCapabilities: ["contract-analysis", "source_grounding"],
    deniedCapabilities: ["code-execution"],
    maxRetries: 2,
    requiresApproval: true,
    dataClassification: "confidential",
  },
  providers: ["tavily"],
  metadata: {},
}
```

Template agent definition:

```ts
export const legalAgent = {
  id: "contract-reviewer",
  name: "Contract Reviewer",
  primaryAgency: "agency-legal",
  secondaryAgencies: ["agency-knowledge"],
  capabilities: ["contract-analysis", "risk-assessment"],
  skills: ["contract-parse", "clause-risk-check"],
  constraints: { timeoutMs: 45_000 },
  version: "1.0.0",
  mode: "subagent",
}
```

Template skill definition:

```ts
export const clauseRiskSkill = {
  id: "clause-risk-check",
  name: "Clause Risk Check",
  version: "1.0.0",
  description: "Analizza rischio clausole",
  inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] },
  outputSchema: { type: "object", properties: { risks: { type: "array" } } },
  capabilities: ["risk-assessment"],
  tags: ["legal"],
}
```

Template test policy tool:

```ts
test("blocca tool non in allowlist", () => {
  const result = resolveAgencyAllowedTools({
    agencyId: "agency-knowledge",
    enabled: true,
    capabilities: ["search", "verification"],
  })

  expect(result.allowedTools).toContain("websearch")
  expect(result.allowedTools).not.toContain("codesearch")
  expect(result.allowedTools).not.toContain("exa_search")
})
```

---

## 13) Gestisci rollout sicuro

- Introduci ogni cambiamento dietro flag in `packages/opencode/src/flag/flag.ts`.
- **Runtime verification obbligatoria** dopo G5: esegui `bun run dev -- --print-logs --log-level DEBUG run "[query]"`.
- Applica canary su subset di sessioni/progetti e monitora `toolsDenied`, fallback ratio e latenza L0-L3.
- Definisci rollback immediato via flag toggle senza rollback codice.
- Congela merge se audit trail o metadata provider mostrano drift rispetto al comportamento atteso.

### Sequenza rollout (dopo V2 Protocol)

**Nota**: Eliminata fase shadow - rollout diretto dopo G5.

1. `hard-gate canary`: enforcement su traffico limitato
2. `full rollout`: allarga dopo due cicli senza regressioni
3. `stabilize`: consolida test golden e regression

### Criteri runtime obbligatori (9/9 dopo G5)

Esegui `bun run dev -- --print-logs --log-level DEBUG run "[query]"`.

| #   | Criterio                            | Log Pattern                                    |
| --- | ----------------------------------- | ---------------------------------------------- |
| 1   | Agency routed corretta              | `agencyId=agency-[dominio]`                    |
| 2   | Confidence >= 40%                   | `confidence=0.x`                               |
| 3   | Policy applicata                    | `allowedTools=[...]` e `blockedTools` corretti |
| 4   | Policy enforce = true               | `policyEnforced=true`                          |
| 5   | allowedTools contiene solo permessi | `allowedTools=[...]`                           |
| 6   | blockedTools non invocati           | `blockedTools` contiene solo non-permessi      |
| 7   | Capability L1 corrette              | `capabilities=[...]`                           |
| 8   | Nessun "no tools resolved"          | assente nei log                                |
| 9   | Fallback NOT used in L3             | `L3.fallbackUsed=false`                        |

**Failure protocol**: Se anche UNO fallisce, torna a G4, correggi, ripeti test, documenta root cause.

---

## 14) Risolvi FAQ operativa per agenti LLM

- **Se il prompt dice una cosa e la policy runtime un’altra**: applica sempre la policy runtime hard.
- **Se un provider fallisce**: prova fallback catalogato e registra `fallbackChainTried` con errori.
- **Se devo integrare un nuovo provider**: aggiungilo in `agency/catalog.ts`, non nel core orchestrator.
- **Se la capability non matcha**: fallback deterministico e telemetria `FallbackUsedEvent` con reason esplicita.
- **Se compare un tool MCP non previsto**: bloccane esposizione in `resolveTools` con stessa allowlist centralizzata.
- **Se manca evidenza audit**: considera la change incompleta e non pronta al merge.

Regola anti-allucinazione da applicare sempre:

- Scrivi policy nei moduli runtime (`tool-policy`, registries, pipeline), usa il prompt solo per comportamento linguistico e stile output.

# DEBUG APPROFONDITO AGENZIA DEVELOPMENT

**Data**: 2026-04-13  
**Protocolli**: V2 Implementation Protocol + Implementation Guide + Development Agency Refoundation Plan  
**Status**: 🔴 CRITICITÀ IDENTIFICATE - G3/G4 GATE BLOCCATE

---

## EXECUTIVE SUMMARY

Analisi della agenzia development vs. Protocollo V2 e guideline canonica ha rivelato **7 criticità BLOCKER** e **5 imprecisioni** che impediscono il passaggio del gate G4 (Runtime Verification).

### Outcome

```
✅ Bootstrap registries: COMPLETO (agencies, skills, agents, chains)
✅ Semantic router capabilities: FUNZIONANTE (domain inference + keywords)
✅ Router scoring: IMPLEMENTATO (core keywords + scaled base score)
⚠️  Development Agency definizione: INCOMPLETA (providers=[], policies incomplete)
❌ Tool Policy mapping: DRIFT RISPETTO PROMPT CONTEXT
❌ Runtime enforcement: MANCANTI LOG E VERIFICHE
❌ Fallback policy: NON TRACCIATO IN AUDIT
❌ Policy level (SAFE/NOTIFY/CONFIRM/HITL/DENY): NON PRESENTE
❌ 5 File modifiche: SOLO 2/5 COMPLETI
```

---

## CRITICITÀ IDENTIFICATE (PRIORITY ORDER)

### 🔴 BLOCKER 1: Development Agency providers[] VUOTA

**File**: `packages/opencode/src/kiloclaw/agency/bootstrap.ts:88`  
**Linea**:

```typescript
{
  id: "agency-development",
  name: "Development Agency",
  domain: "development",
  policies: {
    allowedCapabilities: ["coding", "debugging", "refactoring", "code-generation", "code-review", "testing", "tdd"],
    deniedCapabilities: [],
    maxRetries: 3,
    requiresApproval: false,
    dataClassification: "internal",
  },
  providers: [],  // ⚠️ EMPTY - VIOLATES PROTOCOL
  metadata: { wave: 1, description: "Coding, review, and delivery assistance" },
}
```

**Impatto**:

- Non conforme al design `Agency Manifest` (sezione provider necessaria)
- Nessun provider fallback definito per native-first strategy
- Impedisce validazione del contratto compatibilità C1-C7

**Soluzione richiesta**:

```typescript
providers: ["native", "firecrawl"] // native-first + fallback ricerca
```

---

### 🔴 BLOCKER 2: Policy Level enum ASSENTE

**Protocolo**: KILOCLAW_AGENCY_IMPLEMENTATION_PROTOCOL_V2 § Policy Level Standard (linea 238-261)  
**Stato**: NON IMPLEMENTATO

**Cosa manca**:

- Nessuna definizione di `PolicyLevel = "SAFE" | "NOTIFY" | "CONFIRM" | "HITL" | "DENY"`
- Development agency non ha mappatura esplicita per ogni capability
- Tool policy ignora severità operativa

**Impatto**: Impossibile verificare controllo deny-by-default su operazioni critiche come:

- `git reset --hard` (dovrebbe essere DENY)
- `bash` execution con secret patterns (dovrebbe essere CONFIRM)
- `apply_patch` in file critici (dovrebbe essere CONFIRM)

**Soluzione richiesta**:

```typescript
// packages/opencode/src/kiloclaw/agency/types.ts
export type PolicyLevel = "SAFE" | "NOTIFY" | "CONFIRM" | "HITL" | "DENY"

// packages/opencode/src/kiloclaw/agency/bootstrap.ts
const agencyDefinitions: AgencyDefinition[] = [
  {
    id: "agency-development",
    policies: {
      allowedCapabilities: [...],
      deniedCapabilities: ["destructive_git", "secret_export"],
      policyMapping: {
        "read": "SAFE",
        "glob": "SAFE",
        "grep": "SAFE",
        "apply_patch": "CONFIRM",
        "bash": "NOTIFY",
        "codesearch": "SAFE",
      }
    }
  }
]
```

---

### 🔴 BLOCKER 3: Drift Context Block vs Tool Policy

**File**: `prompt.ts:1074-1090` vs `tool-policy.ts:104-114`

**Diagnosi**:

```typescript
// prompt.ts dice (GUIDANCE - soft):
"Use native development tools first: read, glob, grep, apply_patch, and bash"

// tool-policy.ts dice (POLICY - hard):
DEVELOPMENT_TOOL_ALLOWLIST = [
  "read",
  "glob",
  "grep",
  "apply_patch",
  "bash",
  "skill",
  "codesearch",
  "websearch",
  "webfetch",
]
```

**Problema**: Il context block elenca solo native tools, ma `tool-policy` include `websearch`, `webfetch`, e `skill`. Se il modello ignora il guidance e usa `websearch` per development query, niente lo blocca.

**Protocollo violation**:

- Guida canonica § 12b.2 "Context Block Non Basta - Tool Policy Deve Essere Allineata"
- Tool policy deve essere **deterministica**, non affidarsi a prompt soft guidance

**Verifica richiesta**:

```bash
# Runtime test - dovrebbe BLOCCARE websearch per development query
bun run dev -- --print-logs --log-level DEBUG run "debug TypeError in my React component"
# Log atteso: blockedTools=[websearch], allowedTools=[read,glob,grep,apply_patch,bash,skill,codesearch]
```

---

### 🔴 BLOCKER 4: I 5 File modifiche - Solo 2/5 COMPLETI

**Protocollo**: KILOCLAW_AGENCY_IMPLEMENTATION_PROTOCOL_V2 § I 5 File (linea 52-180)

| #   | File                                   | Status        | Criterio                                                      |
| --- | -------------------------------------- | ------------- | ------------------------------------------------------------- |
| 1   | `agency/bootstrap.ts`                  | ✅ COMPLETO   | agencyDefinitions[] OK (ma providers=[] vuoto)                |
| 2   | `agency/routing/semantic/bootstrap.ts` | ✅ COMPLETO   | bootstrapDevelopmentCapabilities() OK                         |
| 3   | `kiloclaw/router.ts`                   | ⚠️ PARZIALE   | DOMAIN_KEYWORDS OK, MA MANCANO CORE_KEYWORDS                  |
| 4   | `session/prompt.ts`                    | ⚠️ PARZIALE   | Agency context block OK, MA context footprint non documentato |
| 5   | `session/tool-policy.ts`               | ❌ INCOMPLETO | mapDevelopmentCapabilitiesToTools() ignora policy level       |

**Dettagli File 3 (router.ts)**:

```typescript
// DOMAIN_KEYWORDS: 119 keywords, OK
// CORE_KEYWORDS: 19 keywords, OK

// MA: Linea 480-500, CORE_KEYWORDS["development"] è SUBOTTIMALE
const CORE_KEYWORDS: Record<string, string[]> = {
  development: [
    "code",
    "debug",
    "build",
    "deploy",
    "git",
    "function",
    "class",
    "react",
    "component",
    "typescript",
    "javascript",
    "refactor",
    "test",
    "compile",
    "api",
    "patch",
    "merge",
    "codice",
    "rifattorizza",
  ], // 19 keywords - ACCETTABILE ma non include: "error", "bug", "incident", "crash"
}
```

**Dettagli File 4 (prompt.ts)**:

- Context block aggiunto ✅
- Ma "context footprint esplicito" (linea 377-386 del protocollo) NON documentato
- Campo mancante: "numero tool esposti per agent"
- Campo mancante: "strategia lazy-loading"

**Dettagli File 5 (tool-policy.ts)**:

```typescript
export function mapDevelopmentCapabilitiesToTools(capabilities: string[]) {
  // Ignora POLICY LEVEL per ogni mappatura
  // Non distingue fra SAFE/NOTIFY/CONFIRM/DENY
  // Esempio: coding -> [read, glob, grep, apply_patch]
  // Ma apply_patch dovrebbe essere CONFIRM, non SAFE
}
```

---

### 🔴 BLOCKER 5: Runtime Verification Log Pattern ASSENTE

**Protocollo**: KILOCLAW_AGENCY_IMPLEMENTATION_PROTOCOL_V2 § Runtime Verification (linea 424-456)

**Criterio G5**: Prima di G6, eseguire `bun run dev` e verificare 9/9 criteri.

**Criteri e Log Patterns**:

| #   | Criterio                   | Log Pattern Atteso                      | Status               |
| --- | -------------------------- | --------------------------------------- | -------------------- |
| 1   | Agency routed corretta     | `agencyId=agency-development`           | ❓ NON TESTATO       |
| 2   | Confidence >= 40%          | `confidence=0.x` (x >= 40)              | ❓ NON TESTATO       |
| 3   | Policy applicata           | `allowedTools=[...] blockedTools=[...]` | ❓ PARZIALE          |
| 4   | Policy enforce = true      | `policyEnforced=true`                   | ❌ MANCA LOG         |
| 5   | allowedTools solo permessi | `allowedTools=[read,glob,grep,...]`     | ❌ MANCA VALIDAZIONE |
| 6   | Tool non permessi bloccati | `blockedTools` NON invocati             | ❌ MANCA ASSERTION   |
| 7   | Capability L1 corrette     | `capabilities=[coding,debugging,...]`   | ❌ MANCA LOG         |
| 8   | Nessun "no tools resolved" | assente nei log                         | ❓ NON VERIFICATO    |
| 9   | Fallback NOT usato L3      | `L3.fallbackUsed=false`                 | ⚠️ PARZIALE          |

**Esempio di log che manca**:

```
[development-routing] agencyId=agency-development confidence=0.85
 capabilities=[coding,debugging,tdd]
 policyEnforced=true
 allowedTools=[read,glob,grep,apply_patch,bash,skill,codesearch]
 blockedTools=[websearch,webfetch]
 L3.fallbackUsed=false
```

---

### 🔴 BLOCKER 6: Fallback Policy Tracking NON IMPLEMENTATO

**Protocollo**: KILOCLAW_DEVELOPMENT_AGENCY_REFOUNDATION_PLAN § Fallback policy (linea 196-213)

**Tabella decisionale assente**:

```
Caso | Decisione
-----|----------
adapter nativo disponibile | usa nativo
adapter nativo timeout/transient fail | retry controllato, poi MCP consentito
capability non implementata nativamente | MCP consentito + ticket debito tecnico
policy DENY | blocco hard
operation con secret/distruttiva | fallback vietato
```

**Impatto**:

- Nessun meccanismo deterministico per scegliere fra native e MCP
- Fallback chain non tracciata in telemetry
- Nessun `fallbackChainTried` metadata negli output

**Codice mancante**:

```typescript
// packages/opencode/src/kiloclaw/tooling/native/fallback-policy.ts (NON ESISTE)
export function decideFallback(input: {
  nativeAvailable: boolean
  nativeError?: Error
  capability: string
  policy: PolicyLevel
}): "native" | "mcp" | "deny" {
  if (input.policy === "DENY") return "deny"
  if (input.nativeAvailable && !input.nativeError) return "native"
  if (input.nativeError?.message.includes("TIMEOUT")) return "mcp" // consentito
  if (input.nativeError) return "native" // retry
  return "mcp" // capability gap
}
```

---

### 🔴 BLOCKER 7: Auto-Repair Cycle NON IMPLEMENTATO

**Protocollo**: KILOCLAW_DEVELOPMENT_AGENCY_REFOUNDATION_PLAN § Auto-riparazione (linea 216-238)

**Stato**: File non esiste

```
packages/opencode/src/kiloclaw/runtime/auto-repair.ts (NON ESISTE)
packages/opencode/src/kiloclaw/runtime/error-taxonomy.ts (NON ESISTE)
```

**Manca**:

- Error classification (runtime.exception, build.fail, test.fail, policy.block, tool.contract.fail)
- Auto-trigger routing verso intent `auto-repair`
- 3-strike protocol con decision logic
- Rollback automatico post-fail
- Telemetry `RuntimeRemediationMetrics` (file esiste ma usage incompleto)

**Impatto su Development Agency**:

- Nessun meccanismo autonomo di repair
- Violazione del contratto C1 (behavioral parity con `kilo_kit`)

---

## IMPRECISIONI MINORI

### ⚠️ Issue 1: Router Keywords Incomplete per Development

**File**: `router.ts:480-500`  
**CORE_KEYWORDS** mancano:

- `error`, `bug`, `exception`, `crash`, `incident` (development queries comuni)
- `issue`, `problem`, `failure` (bug report pattern)

**Impatto**: Query come "fix error in my code" potrebbe non raggiungere confidence >= 40%  
**Soluzione**: Aggiungere 5-10 keywords ad alta specificità

```typescript
development: [
  "code",
  "debug",
  "build",
  "deploy",
  "git",
  "function",
  "class",
  "react",
  "component",
  "typescript",
  "javascript",
  "refactor",
  "test",
  "compile",
  "api",
  "patch",
  "merge",
  "error",
  "bug",
  "exception",
  "crash",
  "incident", // AGGIUNGERE
  "issue",
  "problem",
  "failure", // AGGIUNGERE
  "codice",
  "rifattorizza",
]
```

---

### ⚠️ Issue 2: Policy Mapping Incomplete

**File**: `tool-policy.ts:163-172`

```typescript
export function mapDevelopmentCapabilitiesToTools(capabilities: string[]) {
  const tools = capabilities.flatMap((cap) => {
    if (["coding", "code-generation", "code-review", "refactoring"].includes(cap))
      return ["read", "glob", "grep", "apply_patch"]
    if (["debugging", "testing", "tdd"].includes(cap)) return ["bash", "read", "glob"]
    if (["planning", "document_analysis"].includes(cap)) return ["read", "glob", "grep"]
    return [] // ⚠️ UNHANDLED: "code-review", "refactoring" come singole capability
  })
  return Array.from(new Set(tools))
}
```

**Manca handler per**:

- `planning` -> dovrebbe includere `bash` per `bun run dev`
- `document_analysis` -> dovrebbe escludere `bash`
- `tdd` -> dovrebbe **SOLO** bash, non read/glob inzialmente

---

### ⚠️ Issue 3: Skill Aliases Onda 1-4 Sono Override, Non Complement

**File**: `bootstrap.ts:365-917`

```typescript
// Linea 367-469: onda1SkillAliases
const onda1SkillAliases: SkillDefinition[] = [
  {
    id: "systematic-debugging",  // Potrebbe collidere con skill registrata da allSkills
    name: "Systematic Debugging",
    ...
  },
  // ... 8 skill totali in onda 1
]

for (const skill of onda1SkillAliases) {
  try {
    SkillRegistry.registerSkill(skill)
    // Se fallisce con "already registered", silent skip
    // Ma se la skill registrata ha schema diverso, crea DRIFT
  } catch (error: any) {
    if (error?.message?.includes("already registered")) {
      log.debug("skill alias already registered, skipping")
    }
  }
}
```

**Protocollo violation**:

- Non è chiaro quali skill provengono da `allSkills` vs. aliases
- Nessuna validazione di schema parity
- Nessun conflict detection

**Soluzione**: Implementare skill version pinning con schema validation

---

### ⚠️ Issue 4: Bootstrap Order Non Verificato

**Protocollo**: Guida canonica § 12b.1 "Bootstrap Order è Critico"

**Ordine in bootstrap.ts**:

```typescript
function doBootstrap(): void {
  // 1. Register agencies ✅
  for (const agency of agencyDefinitions) {
    AgencyRegistry.registerAgency(agency)
  }

  // 2. Register skills ✅
  for (const skill of allSkills) {
    SkillRegistry.registerSkill(definition)
  }

  // ... skill aliases (onda 1-4)

  // 3. Register agents ✅
  registerFlexibleAgents()

  // 4. Register chains ✅
  for (const chain of chainDefinitions) {
    ChainRegistry.registerChain(chain)
  }
}

// bootstrapAllCapabilities() NON è chiamato qui!
export function bootstrapRegistries(): void {
  if (bootstrapped) return
  doBootstrap()
  bootstrapped = true
}

// Capability bootstrap è SEPARATO:
export async function bootstrapWithEmbeddings(): Promise<void> {
  bootstrapAllCapabilities() // Called separately!
}
```

**Problema**: Se `bootstrapAllCapabilities()` non è chiamato, il routing semantic fallisce silenziosamente.

**Verifica richiesta**: Assicurare che `bootstrapAllCapabilities()` sia sempre chiamato subito dopo `bootstrapRegistries()`.

---

### ⚠️ Issue 5: Telemetry Incomplete

**File**: `prompt.ts:613, 1701-1702`

Viene loggato:

```typescript
allowedTools,
blockedTools,
```

Ma MANCA:

- `policyEnforced` (true/false)
- `fallbackChainTried` (array di providers tentati)
- `errorsByProvider` (errori per provider)
- `routeConfidence` (L0-L3 confidence scores)
- `policyLevel` per ogni tool (SAFE/NOTIFY/CONFIRM/HITL/DENY)

---

## PLAN DI REMEDIATION (ORDERED BY BLOCKER)

### Fase 1: Policy Level e Tool Policy Alignment (24h)

**1.1 Definisci PolicyLevel enum**

- File: `packages/opencode/src/kiloclaw/agency/types.ts`
- Aggiungi `type PolicyLevel = "SAFE" | "NOTIFY" | "CONFIRM" | "HITL" | "DENY"`
- Mappa ogni capability development a policy level

**1.2 Allinea prompt.ts con tool-policy.ts**

- Aggiorna `prompt.ts:1074-1090` per riflettere allowlist effettivo
- Aggiungi disclaimer esplicito: "Hard policy blocks overwrite soft guidance"

**1.3 Implementa fallback policy deterministica**

- File: `packages/opencode/src/kiloclaw/tooling/native/fallback-policy.ts`
- Implementa tabella decisionale (6 casi)

### Fase 2: Development Agency Definition (8h)

**2.1 Popola providers**

```typescript
providers: ["native", "firecrawl"] // native-first strategy
```

**2.2 Aggiungi policyMapping**

```typescript
policies: {
  policyMapping: {
    "read": "SAFE",
    "glob": "SAFE",
    "grep": "SAFE",
    "apply_patch": "CONFIRM",
    "bash": "NOTIFY",
    "codesearch": "SAFE",
  }
}
```

### Fase 3: I 5 File Completion (16h)

**3.1 File 3: router.ts CORE_KEYWORDS**

- Aggiungi 8 keywords: error, bug, exception, crash, incident, issue, problem, failure

**3.2 File 4: prompt.ts context footprint**

- Aggiungi sezione "Context Footprint" nel context block
- Documenta: # tool, schema size, lazy-loading strategy

**3.3 File 5: tool-policy.ts mapDevelopmentCapabilitiesToTools**

- Estendi mapping per tutte le capability
- Aggiungi policy level per ogni mapping

### Fase 4: Runtime Verification Logging (12h)

**4.1 Implementa metriche L0-L3**

- File: `packages/opencode/src/kiloclaw/telemetry/routing.metrics.ts`
- Log policyEnforced, fallbackChainTried, errorsByProvider

**4.2 Aggiungi assert nel prompt.ts**

- Linea 1700-1710: Assert allowedTools != blockedTools intersection
- Log tutti i 9 criteri di G5

### Fase 5: Auto-Repair Framework (24h)

**5.1 Implementa error taxonomy**

- File: `packages/opencode/src/kiloclaw/runtime/error-taxonomy.ts`
- Classifica: exception, build.fail, test.fail, policy.block, tool.contract.fail

**5.2 Implementa auto-repair cycle**

- File: `packages/opencode/src/kiloclaw/runtime/auto-repair.ts`
- 3-strike protocol + rollback logic

---

## TESTING CHECKLIST (G4 Gate)

Prima di procedere a G5:

```bash
# Test 1: Bootstrap order
bun test packages/opencode/test/kiloclaw/bootstrap.test.ts

# Test 2: Development agency capabilities
bun test packages/opencode/test/kiloclaw/semantic-router.test.ts --grep "development"

# Test 3: Tool policy enforcement
bun test packages/opencode/test/session/tool-policy.test.ts --grep "development"

# Test 4: Runtime routing verification
bun run dev -- --print-logs --log-level DEBUG run \
  "debug TypeError in my React component" \
  2>&1 | grep -E "agencyId=agency-development|policyEnforced=true|blockedTools=\[websearch"

# Test 5: Fallback policy
bun test packages/opencode/test/kiloclaw/fallback-policy.test.ts

# Test 6: Auto-repair
bun test packages/opencode/test/kiloclaw/auto-repair.test.ts --grep "3-strike"
```

---

## RIFERIMENTI PROTOCOLLO

- KILOCLAW_AGENCY_IMPLEMENTATION_PROTOCOL_V2_2026-04-12 § Policy Level Standard (linea 238)
- KILOCLAW_AGENCY_IMPLEMENTATION_PROTOCOL_V2_2026-04-12 § Runtime Verification (linea 424)
- KILOCLAW_AGENCY_IMPLEMENTATION_PROTOCOL_V2_2026-04-12 § I 5 File da Modificare (linea 52)
- KILOCLAW_AGENCY_AGENT_SKILL_TOOL_IMPLEMENTATION_GUIDE_2026-04-07 § 12b Best Practices (linea 286)
- KILOCLAW_DEVELOPMENT_AGENCY_REFOUNDATION_PLAN_2026-04-12 § Fallback Policy (linea 196)
- KILOCLAW_DEVELOPMENT_AGENCY_REFOUNDATION_PLAN_2026-04-12 § Auto-Riparazione (linea 216)

---

## NEXT STEPS

1. ⏱️ **Immediato (oggi)**: Creare PR per Fase 1 (Policy Level + Fallback)
2. ⏱️ **Domani**: Completare I 5 File (Fase 2-3)
3. ⏱️ **Dopodomani**: Runtime Verification + Auto-Repair (Fase 4-5)
4. ⏱️ **Verifica G4**: Eseguire test checklist e 9/9 criteri runtime
5. ⏱️ **Milestone G5**: Report finale con parity score >= 99%

---

**Status**: 🔴 BLOCCATO SU G3/G4  
**Owner**: Development Agency Team  
**Reviewer**: Architecture Board  
**Escalation**: Required for gate approval

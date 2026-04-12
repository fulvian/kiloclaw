# KILOCLAW_SYSTEM_CHECKUP_PROTOCOL_V1_2026-04-12

> Protocollo operativo per la verifica completa, sistematica e tracciabile di tutta l'architettura KiloClaw e delle sue agenzie-agenti-skills-tools implementate.

**Riferimenti:**

- Blueprint: `docs/foundation/KILOCLAW_BLUEPRINT.md`
- Implementation Protocol: `docs/agencies/plans/KILOCLAW_AGENCY_IMPLEMENTATION_PROTOCOL_V2_2026-04-12.md`
- Agency Implementation Guide: `docs/guide/KILOCLAW_AGENCY_AGENT_SKILL_TOOL_IMPLEMENTATION_GUIDE_2026-04-07.md`

**Filosofia:** Ogni claim deve essere verificato con evidenze. Nessuna affermazione di funzionamento senza riscontro nei log, nei test, o nell'audit trail.

---

## 1. Panoramica del Sistema di Verifica

### 1.1 Architettura Verificabile

```
KILOCLAW CORE
├── Agency System (6 agencies)
│   ├── agency-knowledge
│   ├── agency-development
│   ├── agency-nutrition
│   ├── agency-weather
│   ├── agency-gworkspace
│   └── agency-nba
├── Agent System (15+ agents)
├── Skill System (32+ skills)
├── Tool System (26+ tools)
├── Provider System (multiple per agency)
├── Routing Pipeline (L0-L3)
├── Policy Engine
├── Memory 4-Layer
├── Proactive System
├── Audit Trail
└── Service Health
```

### 1.2 Registri e Cataloghi Centrali

| Registro                | Localizzazione                                   | Tipo Dato                               | Verifica   |
| ----------------------- | ------------------------------------------------ | --------------------------------------- | ---------- |
| `AgencyRegistry`        | `agency/registry/agency-registry.ts`             | `Map<AgencyId, AgencyDefinition>`       | 6 agencies |
| `FlexibleAgentRegistry` | `agency/registry/agent-registry.ts`              | `Map<AgentId, FlexibleAgentDefinition>` | 15+ agents |
| `SkillRegistry`         | `agency/registry/skill-registry.ts`              | `Map<SkillId, SkillDefinition>`         | 32+ skills |
| `ChainRegistry`         | `agency/registry/chain-registry.ts`              | `Map<ChainId, SkillChain>`              | chains     |
| `ToolRegistry`          | `tool/registry.ts`                               | `Map<ToolId, Tool.Info>`                | 26+ tools  |
| `AgencyCatalog`         | `agency/catalog.ts`                              | providers, indexes                      | providers  |
| `CapabilityRegistry`    | `agency/routing/semantic/capability-registry.ts` | capability descriptors                  | routing    |
| `KeyPool`               | `agency/key-pool.ts`                             | API keys with rotation                  | providers  |

---

## 2. Checklist di Verifica per Componente

### 2.1 Verifica Agency

**Checklist Obbligatoria:**

```markdown
## Agency Verification Checklist

Per ogni agency, verificare:

### Registro

- [ ] Agency registrata in `AgencyRegistry` con `registerAgency()`
- [ ] Domain unico (nessun duplicato in `domainIndex`)
- [ ] Policy `deny-by-default` attiva
- [ ] `allowedCapabilities` definita e non vuota
- [ ] `deniedCapabilities` definita (anche se vuota)
- [ ] `dataClassification` impostata (public|internal|confidential)
- [ ] `maxRetries` definito
- [ ] `requiresApproval` booleano corretto

### Routing Keywords

- [ ] Agency presente in `router.ts` `DOMAIN_KEYWORDS`
- [ ] Agency presente in `router.ts` `CORE_KEYWORDS`
- [ ] Keywords bilanciate: 50-100 totali, 15-25 core
- [ ] Keywords italiane presenti se dominio italiano

### Tool Policy

- [ ] Tool allowlist definita in `tool-policy.ts`
- [ ] Funzione `map[Agencia]CapabilitiesToTools()` implementata
- [ ] Mapping Capabilities -> Tools corretto e completo
- [ ] Tool non permessi bloccati correttamente

### Prompt Context

- [ ] Block contesto agency in `prompt.ts`
- [ ] Istruzioni CRITICAL TOOL precise
- [ ] Lista tool disponibili corretta

### Bootstrap

- [ ] Agency presente in `bootstrap.ts` `agencyDefinitions[]`
- [ ] Ordine bootstrap corretto (agency prima di skill)
```

### 2.2 Verifica Agent

**Checklist Obbligatoria:**

```markdown
## Agent Verification Checklist

Per ogni agent, verificare:

### Registro

- [ ] Agent registrato in `FlexibleAgentRegistry`
- [ ] `id` unico nel sistema
- [ ] `primaryAgency` punti a agency esistente
- [ ] `secondaryAgencies` puntino ad agencies esistenti (se presenti)
- [ ] `capabilities` allineate con policy agency

### Prompt

- [ ] System prompt definito
- [ ] Capabilities matchino le skill disponibili
- [ ] Permission scope corretto

### Routing

- [ ] Agent trovato da `findAgentsForCapabilities()`
- [ ] Score di matching calcolato correttamente
- [ ] Ordine di selezione corretto (score più alto primo)
```

### 2.3 Verifica Skill

**Checklist Obbligatoria:**

```markdown
## Skill Verification Checklist

Per ogni skill, verificare:

### Registro

- [ ] Skill registrata in `SkillRegistry`
- [ ] `id` unico nel sistema
- [ ] `version` in formato semver
- [ ] `inputSchema` validato
- [ ] `outputSchema` validato
- [ ] `capabilities` array non vuoto
- [ ] `tags` array non vuoto

### Catalog

- [ ] Skill indicizzata per capabilities in `capabilitiesIndex`
- [ ] Skill indicizzata per tags in `tagIndex`
- [ ] Lookup `findByCapabilities()` funziona
- [ ] Lookup `findByTag()` funziona

### Bootstrap

- [ ] Skill presente in `allSkills` (o alias)
- [ ] Skill importata in `bootstrap.ts`
- [ ] `skillToDefinition()` conversion corretta
```

### 2.4 Verifica Tool

**Checklist Obbligatoria:**

```markdown
## Tool Verification Checklist

Per ogni tool, verificare:

### Registro

- [ ] Tool registrato in `ToolRegistry`
- [ ] Tool presente in `tool/registry.ts` `all()`
- [ ] `id` unico
- [ ] `description` presente
- [ ] `parameters` schema Zod validato
- [ ] Funzione `execute()` implementata

### Policy Mapping

- [ ] Tool mappato in `pipeline.ts` `resolveTools()`
- [ ] Tool presente in allowlist agency quando appropriato
- [ ] Tool bloccato per agency senza permesso

### Agency-Specific

- [ ] `websearch` → agency-knowledge allowlist
- [ ] `webfetch` → agency-knowledge allowlist
- [ ] `skill` → tutti gli agency con skill
- [ ] File tools (`read`, `write`, `edit`) → agency-development
```

### 2.5 Verifica Provider

**Checklist Obbligatoria:**

```markdown
## Provider Verification Checklist

Per ogni provider, verificare:

### Registro

- [ ] Provider registrato in `AgencyCatalog`
- [ ] `name` unico
- [ ] `agency` punti a domain valido
- [ ] Funzione `search()` implementata
- [ ] Funzione `health()` implementata
- [ ] Funzione `extract()` implementata (se disponibile)

### Key Pool

- [ ] Provider registrato in `KeyManager`
- [ ] Rate limits configurati (`requestsPerMinute`, `requestsPerDay`)
- [ ] Retry policy definita
- [ ] API keys caricate da env (`~/.local/share/kiloclaw/.env`)

### Health Check

- [ ] `health()` ritorna `true` quando funzionante
- [ ] `health()` ritorna `false` quando non raggiungibile
- [ ] Rate limit handling corretto (429 → retry)
```

---

## 3. Verifiche di Routing

### 3.1 Verifica L0 (Agency Routing)

```bash
# Test di routing per ogni dominio
bun run dev -- --print-logs --log-level DEBUG run "cerca notizie su IA"  # → agency-knowledge
bun run dev -- --print-logs --log-level DEBUG run "scrivi una funzione"  # → agency-development
bun run dev -- --print-logs --log-level DEBUG run "meteo Roma"           # → agency-weather
bun run dev -- --print-logs --log-level DEBUG run "calorie pasta"        # → agency-nutrition
```

**Criteri di Passaggio:**

| Criterio               | Log Pattern                 | Soglia    |
| ---------------------- | --------------------------- | --------- |
| Agency routed corretta | `agencyId=agency-[dominio]` | 100%      |
| Confidence             | `confidence=0.x`            | >= 0.40   |
| Domain match           | `matchedDomain=[dominio]`   | 100%      |
| Reasoning              | `reasoning=.*`              | non vuoto |

### 3.2 Verifica L1 (Skill Discovery)

**Criteri di Passaggio:**

| Criterio              | Log Pattern            | Soglia            |
| --------------------- | ---------------------- | ----------------- |
| Capability extraction | `capabilities=\[.*\]`  | non vuoto         |
| Skill trovata         | `bestSkill=[skill-id]` | non null          |
| Skill score           | `bestSkillScore=0.x`   | > 0               |
| Fallback non usato    | `fallbackUsed=false`   | L1 deve risolvere |

### 3.3 Verifica L2 (Agent Selection)

**Criteri di Passaggio:**

| Criterio           | Log Pattern            | Soglia   |
| ------------------ | ---------------------- | -------- |
| Agent trovato      | `bestAgent=[agent-id]` | non null |
| Agent score        | `bestAgentScore=0.x`   | > 0      |
| Agents disponibili | `agentsFound=N`        | >= 1     |

### 3.4 Verifica L3 (Tool Resolution)

**Criteri di Passaggio:**

| Criterio          | Log Pattern                   | Soglia                       |
| ----------------- | ----------------------------- | ---------------------------- |
| Tools resolved    | `toolsResolved=N`             | >= 1                         |
| Tools denied      | `toolsDenied=N`               | = 0 per agency autorizzato   |
| Blocked tools     | `blockedTools=\[.*\]`         | vuoto per agency autorizzato |
| Fallback not used | `fallbackUsed=false`          | L3 deve risolvere            |
| No policy errors  | `no tools resolved by policy` | assente                      |

### 3.5 Verifica Routing Cross-Domain

```bash
# Verifica che domini non facciano override accidentale
bun run dev -- --print-logs --log-level DEBUG run "cerca pizza vicino a me"
# NON deve matchare nutrition se query è generica

bun run dev -- --print-logs --log-level DEBUG run "partita NBA stanotte"
# DEVE matchare agency-nba
```

---

## 4. Verifiche di Policy

### 4.1 Policy Engine

```bash
# Verifica Policy Engine
cd packages/opencode && bun test test/kiloclaw/policy.test.ts
```

**Criteri di Passaggio:**

| Test              | Descrizione              | Soglia |
| ----------------- | ------------------------ | ------ |
| Policy evaluation | Regole statiche valutate | 100%   |
| Risk calculation  | Dynamic risk calcolato   | 100%   |
| Caching           | Cache policy funzionante | 100%   |

### 4.2 Guardrail

```bash
# Verifica Guardrail
cd packages/opencode && bun test test/kiloclaw/guardrail.test.ts
```

**Criteri di Passaggio:**

| Test              | Descrizione             | Soglia |
| ----------------- | ----------------------- | ------ |
| Kill switch       | Kill switch attivo      | 100%   |
| Data exfiltration | PII detection           | 100%   |
| Escalation        | Double gate funzionante | 100%   |

### 4.3 Tool Policy Alignment

**Verifica CRITICA:** Il context block in `prompt.ts` DEVE allineare con `tool-policy.ts`

```bash
# Script di verifica allineamento
node -e "
const agency = 'agency-knowledge'
const contextTools = ['websearch', 'webfetch', 'skill'] // dal prompt.ts
const policyTools = [...] // dalla allowlist in tool-policy.ts

const mismatch = contextTools.filter(t => !policyTools.includes(t))
if (mismatch.length > 0) {
  console.error('MISMATCH:', mismatch)
  process.exit(1)
}
console.log('OK: Context block aligned with tool policy')
"
```

---

## 5. Verifiche di Sistema

### 5.1 Bootstrap Verification

```bash
# Verifica bootstrap
cd packages/opencode && bun run -e '
import { bootstrapRegistries, getBootstrapStats, resetBootstrap } from "./src/kiloclaw/agency/bootstrap"

resetBootstrap()
bootstrapRegistries()
const stats = getBootstrapStats()

console.log("=== Bootstrap Stats ===")
console.log("Agencies:", stats.agencies)
console.log("Skills:", stats.skills)
console.log("Agents:", stats.agents)
console.log("Chains:", stats.chains)

// Verify expected counts
if (stats.agencies < 6) throw new Error("Expected at least 6 agencies")
if (stats.skills < 30) throw new Error("Expected at least 30 skills")
if (stats.agents < 10) throw new Error("Expected at least 10 agents")
'
```

### 5.2 Registry Consistency Check

```bash
# Verifica consistenza tra registri
cd packages/opencode && bun run -e '
import { AgencyRegistry } from "./src/kiloclaw/agency/registry/agency-registry"
import { SkillRegistry } from "./src/kiloclaw/agency/registry/skill-registry"
import { FlexibleAgentRegistry } from "./src/kiloclaw/agency/registry/agent-registry"

const agencies = AgencyRegistry.getAllAgencies()
const skills = SkillRegistry.getAllSkills()
const agents = FlexibleAgentRegistry.getAllAgents()

console.log("=== Registry Consistency ===")
console.log("Agencies:", agencies.length)
console.log("Skills:", skills.length)
console.log("Agents:", agents.length)

// Check agency domains are unique
const domains = agencies.map(a => a.domain)
const uniqueDomains = new Set(domains)
if (domains.length !== uniqueDomains.size) {
  throw new Error("Duplicate agency domains found")
}

// Check agent capabilities reference valid agencies
for (const agent of agents) {
  if (!AgencyRegistry.getAgency(agent.primaryAgency)) {
    throw new Error(`Agent ${agent.id} references invalid primaryAgency: ${agent.primaryAgency}`)
  }
  for (const sec of agent.secondaryAgencies) {
    if (!AgencyRegistry.getAgency(sec)) {
      throw new Error(`Agent ${agent.id} references invalid secondaryAgency: ${sec}`)
    }
  }
}

// Check skill capabilities are referenced
for (const skill of skills) {
  for (const cap of skill.capabilities) {
    const skillsWithCap = SkillRegistry.findByCapabilities([cap])
    if (skillsWithCap.length === 0) {
      console.warn(`Capability ${cap} not found by any skill`)
    }
  }
}

console.log("Consistency check PASSED")
'
```

### 5.3 Service Health Check

```bash
# Verifica service health
cd packages/opencode && bun run -e '
import { ServiceHealth } from "./src/kiloclaw/service-health"

const report = await ServiceHealth.checkAll()

console.log("=== Service Health ===")
console.log("Healthy:", report.healthy.length)
console.log("Degraded:", report.degraded.length)
console.log("Unavailable:", report.unavailable.length)
console.log("Unknown:", report.unknown.length)
console.log("All Required Healthy:", report.allRequiredHealthy)

if (!report.allRequiredHealthy) {
  const warnings = ServiceHealth.formatWarnings(report)
  warnings.forEach(w => console.warn(w))
  process.exit(1)
}
'
```

### 5.4 Telemetry Contract Check

```bash
# Verifica telemetry events
cd packages/opencode && bun test test/kiloclaw/runtime.test.ts -- --grep "telemetry"
```

**Eventi Obbligatori:**

| Event             | Campo                        | Verifica |
| ----------------- | ---------------------------- | -------- |
| `routing.layer0`  | agencyId, confidence, domain | 100%     |
| `routing.layer1`  | capabilities, skillsFound    | 100%     |
| `routing.layer2`  | agentsFound, bestAgent       | 100%     |
| `routing.layer3`  | toolsResolved, toolsDenied   | 100%     |
| `policy.denied`   | agencyId, capability         | 100%     |
| `policy.approved` | agencyId, capability         | 100%     |

---

## 6. Verifiche di Runtime

### 6.1 Runtime Verification Command

```bash
# Verifica runtime completa (post-G5)
bun run dev -- --print-logs --log-level DEBUG run "[query specifica del dominio]"
```

### 6.2 Criteri di Passaggio Runtime (9/9 obbligatori)

| #   | Criterio                  | Log Pattern                                    | Passaggio |
| --- | ------------------------- | ---------------------------------------------- | --------- |
| 1   | Agency routed corretta    | `agencyId=agency-[dominio]`                    | SÌ/NO     |
| 2   | Confidence >= 40%         | `confidence=0.x` dove x >= 0.4                 | SÌ/NO     |
| 3   | Policy applicata          | `allowedTools=[...]` e `blockedTools` corretti | SÌ/NO     |
| 4   | Policy enforce = true     | `policyEnforced=true`                          | SÌ/NO     |
| 5   | allowedTools corretto     | `allowedTools=[...]` contiene solo permessi    | SÌ/NO     |
| 6   | blockedTools non invocati | `blockedTools` contiene solo non-permessi      | SÌ/NO     |
| 7   | Capability L1 corrette    | `capabilities=[...]`                           | SÌ/NO     |
| 8   | No "no tools resolved"    | assente nei log                                | SÌ/NO     |
| 9   | Fallback NOT used in L3   | `L3.fallbackUsed=false`                        | SÌ/NO     |

### 6.3 Failure Protocol

Se anche UNO dei criteri #1-#9 fallisce:

1. **NON procedere** a G6 o rilascio
2. **Tornare a G4** con evidenza dei log
3. **Correggere** il componente guasto
4. **Ripetere** il test runtime dopo la fix
5. **Documentare** la root cause nel Go/No-Go Review
6. **Aggiornare** la checklist con il caso mancato

---

## 7. Verifiche Periodiche

### 7.1 Verifica Giornaliera (Daily Health)

```bash
#!/bin/bash
# daily-health-check.sh

cd /home/fulvio/coding/kiloclaw

echo "=== Daily Health Check $(date) ==="

# 1. Service Health
echo "[1/5] Service Health..."
cd packages/opencode && bun run -e '
import { ServiceHealth } from "./src/kiloclaw/service-health"
const report = await ServiceHealth.checkAll()
if (!report.allRequiredHealthy) {
  console.error("SERVICE HEALTH FAILED")
  process.exit(1)
}
console.log("OK")
' || exit 1

# 2. Registry Bootstrap
echo "[2/5] Registry Bootstrap..."
cd packages/opencode && bun run -e '
import { bootstrapRegistries, getBootstrapStats, resetBootstrap } from "./src/kiloclaw/agency/bootstrap"
resetBootstrap()
bootstrapRegistries()
const stats = getBootstrapStats()
if (stats.agencies < 6 || stats.skills < 30) {
  console.error("BOOTSTRAP FAILED")
  process.exit(1)
}
console.log("OK:", stats)
' || exit 1

# 3. Routing Tests
echo "[3/5] Routing Tests..."
cd packages/opencode && bun test test/kiloclaw/ -- --grep "Routing" || exit 1

# 4. Policy Tests
echo "[4/5] Policy Tests..."
cd packages/opencode && bun test test/kiloclaw/policy.test.ts || exit 1

# 5. Safety Tests
echo "[5/5] Safety Tests..."
cd packages/opencode && bun test test/kiloclaw/safety.test.ts || exit 1

echo "=== Daily Health Check PASSED ==="
```

### 7.2 Verifica Settimanale (Weekly Deep Dive)

```bash
#!/bin/bash
# weekly-deep-check.sh

cd /home/fulvio/coding/kiloclaw

echo "=== Weekly Deep Check $(date) ==="

# 1. Full Test Suite
echo "[1/8] Full Test Suite..."
cd packages/opencode && bun test test/kiloclaw/ || exit 1

# 2. All Routing Domains
echo "[2/8] All Domain Routing..."
for domain in knowledge development nutrition weather gworkspace nba; do
  bun run dev -- --print-logs --log-level DEBUG run "[query per $domain]" | grep -q "agencyId=agency-$domain" || {
    echo "FAILED: $domain routing"
    exit 1
  }
done

# 3. Memory Layer Tests
echo "[3/8] Memory Consistency..."
cd packages/opencode && bun test test/kiloclaw/memory.test.ts || exit 1

# 4. Audit Trail
echo "[4/8] Audit Trail..."
cd packages/opencode && bun test test/kiloclaw/ -- --grep "audit" || exit 1

# 5. Provider Health
echo "[5/8] Provider Health..."
cd packages/opencode && bun run -e '
import { getCatalog } from "./src/kiloclaw/agency/catalog"
const catalog = getCatalog()
const providers = catalog.listProviders()
for (const p of providers) {
  const healthy = await p.health()
  if (!healthy) {
    console.warn(`Provider ${p.name} unhealthy`)
  }
}
console.log("Provider health checked:", providers.length)
' || exit 1

# 6. Registry Consistency
echo "[6/8] Registry Consistency..."
cd packages/opencode && bun run -e '
import { AgencyRegistry } from "./src/kiloclaw/agency/registry/agency-registry"
import { SkillRegistry } from "./src/kiloclaw/agency/registry/skill-registry"
import { FlexibleAgentRegistry } from "./src/kiloclaw/agency/registry/agent-registry"
const agencies = AgencyRegistry.getAllAgencies()
const skills = SkillRegistry.getAllSkills()
const agents = FlexibleAgentRegistry.getAllAgents()
const domains = agencies.map(a => a.domain)
if (domains.length !== new Set(domains).size) throw new Error("Duplicate domains")
if (skills.length < 30) throw new Error("Too few skills")
if (agents.length < 10) throw new Error("Too few agents")
console.log("Consistency OK - A:", agencies.length, "S:", skills.length, "Ag:", agents.length)
' || exit 1

# 7. Benchmark Suite
echo "[7/8] Benchmark Suite..."
cd packages/opencode && bun test test/kiloclaw/benchmark.test.ts || exit 1

# 8. Eval Deterministic
echo "[8/8] Eval Deterministic..."
cd packages/opencode && bun test test/kiloclaw/eval-deterministic.test.ts || exit 1

echo "=== Weekly Deep Check PASSED ==="
```

---

## 8. Catalogo Completo Stato Registri

### 8.1 Stato Corrente (Aprile 2026)

| Componente | Quantità | Stato        | Ultima Verifica |
| ---------- | -------- | ------------ | --------------- |
| Agencies   | 6        | ✅ OPERATIVE | 2026-04-12      |
| Agents     | 15+      | ✅ OPERATIVE | 2026-04-12      |
| Skills     | 32+      | ✅ OPERATIVE | 2026-04-12      |
| Chains     | 4+       | ✅ OPERATIVE | 2026-04-12      |
| Tools      | 26+      | ✅ OPERATIVE | 2026-04-12      |
| Providers  | 19+      | ✅ OPERATIVE | 2026-04-12      |

### 8.2 Schema Aggiornamento Catalogo

Quando si aggiunge una nuova agency/agent/skill/tool, aggiornare:

```markdown
| [Componente] | [Quantità] | [Stato] | [Data] |
| ------------ | ---------- | ------- | ------ |
```

### 8.3 Template Nuova Registrazione

```markdown
### [Nome Componente] - [Data Inserimento]

- **ID:** [id-univoco]
- **Agency:** [agency di appartenenza]
- **Capabilities:** [lista capabilities]
- **Tags:** [lista tags]
- **Stato:** OPERATIVE | DEPRECATED | REMOVED
- **Verificato:** [data] - [esito]
```

---

## 9. Troubleshooting Common Issues

### 9.1 Agency Non Routed Correttamente

**Sintomo:** `agencyId=null` o agency sbagliata

**Diagnosi:**

1. Verificare keywords in `router.ts` `DOMAIN_KEYWORDS`
2. Verificare score: `confidence` < 0.4 indica keywords insufficienti
3. Verificare bootstrap: `AgencyRegistry` contains agency

**Fix:**

```bash
# Verifica keywords
grep -A 20 "'[dominio]'" packages/opencode/src/kiloclaw/router.ts

# Verifica registro
cd packages/opencode && bun run -e '
import { AgencyRegistry } from "./src/kiloclaw/agency/registry/agency-registry"
console.log(AgencyRegistry.getAllAgencies())
'
```

### 9.2 Skill Non Trovata in L1

**Sintomo:** `bestSkill=null` nonostante capability richiesta

**Diagnosi:**

1. Verificare skill in `SkillRegistry`
2. Verificare capability mapping in `pipeline.ts` `extractCapabilitiesFromIntent()`
3. Verificare allineamento capability → skill

**Fix:**

```bash
# Verifica capability extraction
cd packages/opencode && bun run -e '
import { SkillRegistry } from "./src/kiloclaw/agency/registry/skill-registry"
const skills = SkillRegistry.findByCapabilities(["search"])
console.log("Skills for search:", skills.map(s => s.id))
'
```

### 9.3 Tools Non Permessi Bloccati

**Sintomo:** `toolsDenied > 0` o `blockedTools` non vuoto per agency autorizzato

**Diagnosi:**

1. Verificare allowlist in `pipeline.ts` `resolveTools()`
2. Verificare mapping in `tool-policy.ts`
3. Verificare context block in `prompt.ts`

**Fix:**

```bash
# Verifica tool allowlist
grep -A 50 "agency-[dominio]" packages/opencode/src/kiloclaw/agency/routing/pipeline.ts | grep -A 20 "allowlist"

# Verifica tool policy
grep -A 10 "[NOME]_TOOL_ALLOWLIST" packages/opencode/src/session/tool-policy.ts
```

### 9.4 Provider Non Funzionante

**Sintomo:** `health()` returns `false` o errori API

**Diagnosi:**

1. Verificare API key in `~/.local/share/kiloclaw/.env`
2. Verificare rate limits
3. Verificare network connectivity

**Fix:**

```bash
# Verifica chiavi
cat ~/.local/share/kiloclaw/.env | grep -i "[PROVIDER]"

# Test provider health
cd packages/opencode && bun run -e '
import { getCatalog } from "./src/kiloclaw/agency/catalog"
const catalog = getCatalog()
const provider = catalog.getProvider("[nome]")
console.log("Health:", await provider.health())
'
```

---

## 10. Report e Evidenze

### 10.1 Template Report Verifica

```markdown
# Verifica [Tipo] - [Data]

**Eseguita da:** [nome]
**Durata:** [minuti]

## Risultato Globale

- **Stato:** ✅ PASS | ❌ FAIL | ⚠️ WARNING
- **Criteri passati:** [N/M]

## Dettaglio Criteri

| #   | Criterio | Risultato | Evidenza               |
| --- | -------- | --------- | ---------------------- |
| 1   | ...      | PASS/FAIL | [log pattern o errore] |
| ... | ...      | ...       | ...                    |

## Issue Identificati

| Severity | Issue | Fix Necessaria | Priorità |
| -------- | ----- | -------------- | -------- |
| HIGH     | ...   | ...            | ...      |
| MEDIUM   | ...   | ...            | ...      |
| LOW      | ...   | ...            | ...      |

## Raccomandazioni

- ...
```

### 10.2 Evidenze Richieste

Ogni verifica deve produrre:

1. **Log completi** del test run
2. **Screenshot** se UI coinvolta
3. **Output numerico** dei benchmark
4. **Stack trace** se errori
5. **Reference** al commit verificato

---

## 11. Automazione Verifiche

### 11.1 CI/CD Integration

```yaml
# .github/workflows/kiloclaw-checkup.yml
name: KiloClaw System Checkup

on:
  push:
    branches: [main, develop]
  schedule:
    - cron: "0 8 * * *" # Daily at 8 AM

jobs:
  daily-health:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Bun
        uses: oven-sh/setup-bun@v1

      - name: Daily Health Check
        run: ./scripts/daily-health-check.sh

      - name: Upload Logs
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: health-logs
          path: logs/

  weekly-deep:
    runs-on: ubuntu-latest
    if: github.event.schedule == '0 8 * * 0' # Sunday
    steps:
      - uses: actions/checkout@v4
      - name: Setup Bun
        uses: oven-sh/setup-bun@v1
      - name: Weekly Deep Check
        run: ./scripts/weekly-deep-check.sh
```

---

## 12. Change Log

| Versione | Data       | Autore        | Modifiche      |
| -------- | ---------- | ------------- | -------------- |
| v1       | 2026-04-12 | KiloClaw Team | Prima versione |

---

**Protocollo vincolante** per ogni verifica di sistema. Chiunque esegua check-up deve seguire questa procedura e produrre le evidenze documentate.

# Kiloclaw Blueprint

> Fondazioni per autonomia, governance e crescita modulare.

## 1. Definisci visione

Kiloclaw nasce come fork di KiloCode CLI, ma il target è diventare un assistente AI sempre attivo, proattivo e cross-dominio. La piattaforma deve operare in modo autonomo dal runtime KiloCode installato localmente, senza dipendenze operative condivise.

Il perimetro 2026 è SOTA su orchestrazione multi-agente, osservabilità completa, policy-first execution e memory-driven intelligence. Ogni decisione architetturale viene valutata in base a compliance, verificabilità e sicurezza operativa.

---

## 2. Imposta principi

1. **Compliance-first**: ogni azione è valutata contro policy legali, privacy, sicurezza e consenso utente.

2. **Verifiability-first**: ogni output critico deve essere tracciabile a evidenze, fonti o run log.

3. **Isolation-by-default**: processi, namespace, config, storage e telemetria sono separati da KiloCode.

4. **Safe proactivity**: iniziativa autonoma consentita solo dentro guardrail dinamici e budget di rischio.

5. **Least privilege runtime**: tool, MCP e integrazioni partono senza permessi e scalano per autorizzazione esplicita.

6. **Memory as system**: la memoria non è accessoria, ma layer portante di routing, planning e personalizzazione.

7. **Agency governance**: ogni agency ha KPI, policy e audit path separati.

8. **Evoluzione incrementale**: migrazione da ARIA e KiloCode in step compatibili e reversibili.

---

## 3. Progetta architettura target

L'architettura segue la gerarchia obbligatoria: **Intent → Core Orchestrator → Agencies → Agents → Skills → Tools/MCP**. Il Core governa routing, policy enforcement, memoria globale, scheduling e osservabilità con capability-based routing.

```text
+---------------------------------------------------------------+
|                         INTENT (natural language)            |
+------------------------------+--------------------------------+
                               |
               +---------------v----------------+
               |    KILOCLAW CORE ORCHESTRATOR  |
               |  Intent Classifier              |
               |  Capability Router  ←-- NEW    |
               |  Policy Engine                  |
               |  Memory Broker                  |
               |  Scheduler                      |
               +---------------+----------------+
                               |
               +---------------v----------------+
               |         AGENCIES               |
               |  Governance boundaries with:    |
               |  - Policies (allowed/denied)   |
               |  - Providers (API keys, limits) |
               |  - Domain context               |
               |  - Audit trail                  |
               +---------------+----------------+
                               |
               +---------------v----------------+
               |         AGENTS                  |
               |  Capability bundles that:      |
               |  - Can belong to multiple       |
               |    agencies (cross-agency)     |
               |  - Declare capabilities         |
               |  - Use skills dynamically      |
               +---------------+----------------+
                               |
               +---------------v----------------+
               |    SKILL REGISTRY (Dynamic)     |
               |  Versioned capabilities with:   |
               |  - Input/output schemas        |
               |  - Capability tags (flexible)  |
               |  - Composition support (chains)|
               |  - Runtime registration         |
               +---------------+----------------+
                               |
               +---------------v----------------+
               |      TOOL/MCP LAYER             |
               |  Tavily | Brave | Firecrawl |   |
               |  USDA | OpenWeatherMap | MCP    |
               +-------------------------------+
```

### 3.1 Definisci responsabilità gerarchiche

- **Intent**: Natural language input with context (domain, urgency, preferences, correlation ID)
- **Core Orchestrator**: Classifica intent, assegna agency, applica policy e unifica memoria. Include **CapabilityRouter** per routing basato su capabilities invece che su tipi fissi.
- **Agency**: Coordina un dominio funzionale con autonomia operativa limitata da policy governance.
- **Agent**: Esegue task specializzati con capacità dichiarate come capability tags flessibili.
- **Skill**: Capability riusabile versionata con schema I/O JSON, composabile in pipeline (SkillChain).
- **Tools/MCP**: Livello di esecuzione esterno con controlli di permissioning e audit.

### 3.2 Tipi Flessibili (Capability-Based)

I tipi chiusi (enum) vengono sostituiti con tipi flessibili per enable estensibilità runtime:

```typescript
// TaskIntent - invece di TaskType enum chiuso
const TaskIntent = z.object({
  intent: z.string(),                    // "search", "analyze", "generate", ANY
  parameters: z.record(z.unknown()),    // Parametri dinamici
  context: z.object({
    domain: z.string().optional(),      // Agency domain context
    urgency: z.enum(["low", "medium", "high"]).optional(),
    preferences: z.record(z.unknown()).optional(),
    correlationId: z.string().optional(),
  }),
})

// SkillDefinition - capability con metadata
const SkillDefinition = z.object({
  id: SkillId,
  name: z.string(),
  version: SemanticVersion,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
  capabilities: z.array(z.string()),    // Tag flessibili: ["search", "web"]
  tags: z.array(z.string()),            // Dominio: ["knowledge", "research"]
  requires: z.array(z.string()).optional(),
  execute(input: unknown, context: SkillContext): Promise<unknown>
})

// SkillChain - composizione dinamica
const SkillChain = z.object({
  id: z.string(),
  steps: z.array(z.object({
    skillId: z.string(),
    inputTransform: z.function().optional(),
    outputTransform: z.function().optional(),
    condition: z.string().optional(),
  })),
  outputSchema: JsonSchema,
})
```

### 3.3 Routing Architettura

**CapabilityRouter** (invece di TaskType matching):

```typescript
class CapabilityRouter {
  findSkillsForCapabilities(required: string[]): SkillDefinition[]
  findAgentsForCapabilities(required: string[], agency?: string): AgentDefinition[]
  composeChain(taskIntent: TaskIntent): SkillChain | SkillDefinition
  matchScore(agent: AgentDefinition, required: string[]): number
}
```

### 3.4 Percorso Migrazione

| Fase    | Obiettivo                                       | Compatibilità    |
| ------- | ----------------------------------------------- | ---------------- |
| Phase 1 | Aggiungere capability tags alle skill esistenti | Non-breaking     |
| Phase 2 | Rendere TaskType flessibile (graduale)          | Backwards compat |
| Phase 3 | Implementare Skill Chains                       | Nuova feature    |
| Phase 4 | Runtime registration                            | Nuova feature    |
| Phase 5 | Rimuovere legacy (opzionale)                    | Breaking finale  |

### 3.5 Ciclo Esecuzione with Capability Routing

```text
[User/Event] -> [Intent Classification]
      -> [Capability Router: find skills/agents by capabilities]
      -> [Score-based matching with threshold]
      -> [Compose Skill Chain if needed] -> [Agency Policy Gate]
      -> [Agent Plan] -> [Skill Chain Execution] -> [Tool/MCP Calls]
      -> [Evidence Check] -> [Policy Gate] -> [Response/Action]
      -> [Memory Writeback + Audit Log]
```

### 3.6 Struttura File (Nuovi Moduli)

```
packages/opencode/src/kiloclaw/
├── agency/
│   ├── catalog.ts           # Keep
│   ├── key-pool.ts          # Keep
│   ├── index.ts             # Update exports
│   ├── types.ts             # REFACTOR: Add flexible types
│   │
│   ├── registry/            # NEW: Dynamic registries
│   │   ├── skill-registry.ts
│   │   ├── agent-registry.ts
│   │   ├── agency-registry.ts
│   │   └── chain-registry.ts
│   │
│   ├── routing/             # NEW: Capability routing
│   │   ├── capability-router.ts
│   │   ├── intent-classifier.ts
│   │   └── chain-composer.ts
│   │
│   └── agents/             # Keep existing agents, update types
```

---

## 4. Struttura memoria 4-layer

I quattro layer sono obbligatori e indipendenti per storage, retention e retrieval. Il broker memoria del Core unifica accesso e policy.

### 4.1 Definisci layer

| Layer      | Scopo                                         | TTL/Retention                         | Storage target              | Accesso primario         |
| ---------- | --------------------------------------------- | ------------------------------------- | --------------------------- | ------------------------ |
| Working    | Contesto operativo live di sessione           | minuti/ore                            | in-memory + cache locale    | agent runtime            |
| Episodic   | Eventi e task conclusi con timeline           | 30-180 giorni                         | event store append-only     | orchestrator + analytics |
| Semantic   | Fatti consolidati e conoscenza utente/sistema | lungo termine con review periodica    | vector + graph + docs store | retrieval cross-agency   |
| Procedural | Strategie, playbook, policy e skill patterns  | versionato, senza scadenza automatica | registry versioned          | planner + skill engine   |

### 4.2 Definisci lifecycle dati

1. **Capture**: ogni run produce artefatti minimi (intent, plan, evidenze, outcome).
2. **Classify**: il broker assegna layer, sensibilità e livello di confidenza.
3. **Retain**: retention policy per layer, dominio e tipo dato.
4. **Refresh**: consolidamento periodico episodic -> semantic/procedural.
5. **Purge**: cancellazione sicura per scadenza, diritto oblio o policy breach.

### 4.3 Definisci retrieval policy

- Working è letto sempre per continuità conversazionale e task chaining.
- Episodic è letto per contesto recente e spiegabilità decisionale.
- Semantic è letto per grounding cross-session e personalizzazione robusta.
- Procedural è letto per scegliere workflow approvati e ridurre drift operativo.
- Retrieval usa ranking multi-fattore: recency, relevance, confidence, sensitivity, provenance.

---

## 5. Governa runtime

La governance runtime deve impedire azioni non verificabili, invasive o fuori policy. Il sistema usa policy statiche e guardrail dinamici per agency e rischio.

### 5.1 Definisci permissioning

- **Scope per tool**: read, write, execute, network, external API.
- **Scope per agency**: capability allowlist e denylist per dominio.
- **Scope per dati**: classificazione P0-P3 con obbligo minimizzazione.
- **Escalation**: richieste high-risk richiedono consenso esplicito o doppio gate.

### 5.2 Definisci guardrails

- Risk score per action plan prima dell’esecuzione.
- Budget giornaliero di proattività per tipo azione e impatto.
- Kill-switch globale e per agency.
- Fallback a modalità consultiva quando policy non soddisfatta.

### 5.3 Definisci privacy, retention e auditability

- **Privacy**: data minimization, masking selettivo, encryption at rest.
- **Retention**: policy per layer e per classe dato sensibile.
- **Auditability**: event log immutabile con correlation ID per run, tool call e decision gate.
- **Explainability**: ogni output critico include rationale breve ed evidenze.

### 5.4 Abilita proattività sicura

- Trigger proattivi solo da segnali consentiti (schedule, reminder, anomalie).
- Zero esecuzione silente su azioni irreversibili.
- Output proattivo in modalità “suggest then act” per domini non critici.

---

## 6. Isola stack da Kilocode

L’isolamento deve essere totale su identità applicativa, filesystem, telemetria e integrazioni. Kiloclaw non deve leggere né scrivere in percorsi o config operative di KiloCode.

### 6.1 Applica separazione tecnica

| Dominio              | KiloCode (legacy/fork source) | Kiloclaw target (obbligatorio)         |
| -------------------- | ----------------------------- | -------------------------------------- |
| Namespace runtime    | `kilocode` / `opencode`       | `kiloclaw`                             |
| Config prefix env    | `KILO_*`, `OPENCODE_*`        | `KILOCLAW_*`                           |
| Data dir             | percorsi KiloCode locali      | `~/.kiloclaw/` dedicato                |
| Binary               | `kilo`                        | `kiloclaw`                             |
| Branding UI/CLI      | nomi/loghi upstream           | identità Kiloclaw                      |
| Telemetria           | endpoint/progetto KiloCode    | pipeline dedicata, chiavi dedicate     |
| Provider keys        | variabili condivise           | secret namespace Kiloclaw              |
| Marketplace/registry | feed upstream                 | catalogo Kiloclaw o mirror controllato |

### 6.2 Definisci invarianti di isolamento

- Nessuna migrazione automatica di token/chiavi da installazioni KiloCode locali.
- Nessun path fallback su directory KiloCode in caso di config mancante.
- Nessuna telemetria verso project ID KiloCode.
- Nessun plugin marketplace senza firma/policy compatibile Kiloclaw.

---

## 7. Mappa agencies iniziali

La base concettuale ARIA viene migrata nel Core TS target (`packages/opencode/src/**`) con priorità alle quattro agency iniziali. Le agency future entrano tramite **registry versionato** e policy contract con **capability-based routing**.

### 7.1 Definisci matrice iniziale

| Agency      | Origine ARIA | Missione in Kiloclaw                                   | Stato migrazione |
| ----------- | ------------ | ------------------------------------------------------ | ---------------- |
| development | presente     | coding, review, test, delivery assistita               | wave 1           |
| knowledge   | presente     | ricerca, sintesi, grounding, knowledge ops             | wave 1           |
| nutrition   | presente     | piani nutrizionali, tracking, suggerimenti contestuali | wave 2           |
| weather     | presente     | forecast, alert meteo, impatti attività                | wave 2           |

### 7.2 Pianifica espansione (con Capability Registry)

| Agency futura | Obiettivo                                | Dipendenze principali          | Capability Tags                              |
| ------------- | ---------------------------------------- | ------------------------------ | -------------------------------------------- |
| creative      | contenuti, design, brainstorming         | media tools, style memory      | `["creative", "content", "design"]`          |
| productivity  | planning, routine, reminder intelligenti | scheduler, calendar connectors | `["planning", "scheduling", "productivity"]` |
| personal      | benessere, finanza personale, life ops   | privacy tiers elevati          | `["personal", "finance", "wellbeing"]`       |
| analytics     | insight dati, forecasting operativo      | data connectors, report engine | `["analytics", "data", "forecasting"]`       |

### 7.3 Agency Domain Flessibile

Gli agency domain non sono più enum chiusi ma **stringe flessibili** validate via schema:

```typescript
const AgencyDefinition = z.object({
  id: AgencyId,
  name: z.string(),
  domain: z.string(), // "knowledge", "development", "nutrition", "custom:anything"
  policies: z.object({
    allowedCapabilities: z.array(z.string()),
    deniedCapabilities: z.array(z.string()),
    // ...
  }),
  providers: z.array(z.string()),
  metadata: z.record(z.unknown()),
})
```

---

## 8. Migra configurazioni ARIA

La migrazione config da ARIA a Kiloclaw deve essere deterministica, versionata e senza side effect. Si usa uno schema map esplicito con fallback vietati verso prefissi ARIA/KILO.

### 8.1 Definisci schema map env

| ARIA env                              | Kiloclaw env                          | Regola migrazione  |
| ------------------------------------- | ------------------------------------- | ------------------ |
| `ARIA_ENABLED`                        | `KILOCLAW_CORE_ENABLED`               | cast bool diretto  |
| `ARIA_ROUTING_DEFAULT_AGENCY`         | `KILOCLAW_ROUTING_DEFAULT_AGENCY`     | enum validate      |
| `ARIA_ROUTING_CONFIDENCE_THRESHOLD`   | `KILOCLAW_ROUTING_CONFIDENCE`         | clamp [0,1]        |
| `ARIA_ROUTING_ENABLE_FALLBACK`        | `KILOCLAW_ROUTING_FALLBACK`           | bool diretto       |
| `ARIA_AGENCIES_DEVELOPMENT_ENABLED`   | `KILOCLAW_AGENCY_DEVELOPMENT_ENABLED` | bool diretto       |
| `ARIA_AGENCIES_KNOWLEDGE_ENABLED`     | `KILOCLAW_AGENCY_KNOWLEDGE_ENABLED`   | bool diretto       |
| `ARIA_AGENCIES_NUTRITION_ENABLED`     | `KILOCLAW_AGENCY_NUTRITION_ENABLED`   | bool diretto       |
| `ARIA_AGENCIES_WEATHER_ENABLED`       | `KILOCLAW_AGENCY_WEATHER_ENABLED`     | bool diretto       |
| `ARIA_SCHEDULER_MAX_CONCURRENT_TASKS` | `KILOCLAW_SCHED_MAX_CONCURRENT`       | min 1, max policy  |
| `ARIA_SCHEDULER_DEFAULT_PRIORITY`     | `KILOCLAW_SCHED_DEFAULT_PRIORITY`     | range 0-100        |
| `ARIA_SCHEDULER_DISPATCH_INTERVAL_MS` | `KILOCLAW_SCHED_DISPATCH_MS`          | min 100            |
| `ARIA_SCHEDULER_RECOVERY_POLICY`      | `KILOCLAW_SCHED_RECOVERY_POLICY`      | enum strict        |
| `ARIA_GUARDRAILS_ALLOW_PROACTIVE`     | `KILOCLAW_PROACTIVE_ENABLED`          | bool + policy gate |
| `ARIA_GUARDRAILS_MAX_DAILY_ACTIONS`   | `KILOCLAW_PROACTIVE_DAILY_BUDGET`     | min 0              |

### 8.2 Applica policy env e secret

- Prefisso unico accettato in runtime: `KILOCLAW_`.
- Le variabili `ARIA_*`, `KILO_*`, `OPENCODE_*` sono ignorate salvo comando esplicito di migration tool offline.
- Secret provider in namespace dedicato con key rotation e audit trail.
- La migrazione genera report firmato: chiave mappata, valore trasformato, outcome validazione.

### 8.3 Definisci rollout migrazione

1. Export controllato da ARIA config snapshot.
2. Transform con schema map versionato.
3. Validate con policy engine e test di bootstrap.
4. Activate solo su data-dir Kiloclaw pulito.
5. Verify con smoke test agency routing e memory write/read.

---

## 9. Controlla rischi e anti-pattern

### 9.1 Elenca rischi principali

| Rischio                   | Impatto                          | Mitigazione                           |
| ------------------------- | -------------------------------- | ------------------------------------- |
| Drift da fork KiloCode    | regressioni e coupling nascosto  | boundary test + contract checks       |
| Memory over-retention     | rischio privacy/compliance       | retention hard policy + purge job     |
| Proattività aggressiva    | perdita fiducia utente           | risk budget + confirmation gate       |
| Tool sprawl non governato | superficie attacco ampia         | capability registry + least privilege |
| Config contamination      | comportamento non deterministico | prefisso unico + validator strict     |
| Telemetry leakage         | esposizione metadata             | endpoint isolati + redaction          |

### 9.2 Evita anti-pattern

- Copiare 1:1 il runtime KiloCode senza rifattorizzare boundary e naming.
- Usare memoria unica non stratificata per tutti i casi d’uso.
- Consentire fallback impliciti verso provider key legacy.
- Applicare proattività senza scoring rischio e consenso.
- Trattare skills come prompt statici non versionati.

### 9.3 Definisci criteri di accettazione

1. Avvio Kiloclaw senza leggere config, data-dir o secret KiloCode locali.
2. Routing gerarchico funzionante su Core -> Agency -> Agent -> Skill -> Tool/MCP.
3. **CapabilityRouter** attivo: routing basato su capabilities invece che TaskType enum.
4. Memoria 4-layer attiva con retrieval policy verificabile via log.
5. Audit trail completo per ogni azione high-impact.
6. Migrazione ARIA config ripetibile e idempotente con report.
7. Guardrail proattivi con budget giornaliero e kill-switch testato.
8. Telemetria e branding completamente separati da KiloCode.
9. **SkillChain composition** supportata per pipeline dinamiche.
10. **Runtime registration** di skills/agents/agencies (Phase 4).

---

## 10. Confronta piattaforme

### 10.1 Differenze chiave ARIA vs KiloCode vs Kiloclaw

| Asse           | ARIA                                                | KiloCode                            | Kiloclaw (target)                             |
| -------------- | --------------------------------------------------- | ----------------------------------- | --------------------------------------------- |
| Natura         | assistente autonomo in evoluzione                   | coding-agent CLI                    | assistente AI 360° sempre attivo              |
| Architettura   | core + agency model iniziale                        | agent/tool centrico                 | orchestrazione gerarchica completa            |
| Dominio        | multi-dominio con focus personale                   | sviluppo software                   | multi-dominio con governance enterprise-ready |
| Memoria        | framework 4-layer concettuale/implementato parziale | session/history orientata coding    | 4-layer obbligatoria con lifecycle policy     |
| Proattività    | presente con guardrail                              | limitata e reattiva                 | proattività sicura, misurata, auditabile      |
| Isolamento     | standalone da open fork                             | prodotto sorgente                   | isolamento totale tecnico e operativo         |
| Compliance     | design orientato                                    | non primario come principio globale | compliance-first by architecture              |
| Verificabilità | presente in blueprint                               | tool/result oriented                | verifiability-first end-to-end                |

### 10.2 Definisci traiettoria finale

Kiloclaw converge verso una piattaforma assistant-native, non una semplice variante CLI per coding. Il successo dipende da isolamento reale, governance rigorosa e memoria stratificata resa operativa nel core TypeScript.

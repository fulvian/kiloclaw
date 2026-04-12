# Semantic Intent Router v2 - Capability-Based Dynamic Routing

> Piano di implementazione per un sistema di routing scalabile per Kiloclaw

**Status**: Implemented
**Data**: 2026-04-07
**Autore**: AI Assistant

---

## Stato Implementazione

### Completato ✅

| Fase | Descrizione                                             | Stato |
| ---- | ------------------------------------------------------- | ----- |
| 1    | Integrazione HybridRouter (semantic + keyword fallback) | ✅    |
| 2    | Bootstrap Capabilities per Skills esistenti             | ✅    |
| 3    | LLM Fallback per edge cases                             | ✅    |
| 4    | Caching per performance (LRU cache)                     | ✅    |
| 5    | Testing completo (43 test)                              | ✅    |
| 6    | Cutover - Abilitato di default                          | ✅    |

### File Creati

```
packages/opencode/src/kiloclaw/agency/routing/semantic/
├── types.ts                    # CapabilityDescriptor, SemanticIntent, RoutingResult
├── utils.ts                    # cosineSimilarity, hybridScore, DOMAIN_KEYWORD_HINTS
├── capability-registry.ts      # Registry con embedding + keyword matching
├── capability-extractor.ts     # Estrazione capabilities da intent
├── semantic-router.ts          # Router principale L0-L3 (con caching)
├── hybrid-router.ts           # Hybrid semantic + keyword fallback
├── llm-extractor.ts            # LLM fallback per edge cases
├── bootstrap.ts               # Bootstrap capabilities da skills
├── cache.ts                   # Caching per routing
└── index.ts                   # Barrel exports

packages/opencode/test/kiloclaw/
├── semantic-router.test.ts     # 27 test unitari
└── hybrid-router.test.ts       # 16 test integrazione
```

### Bug Fix Importanti

#### 1. LM Studio lifecycle.ts - isModelLoaded

**Problema**: La funzione `isModelLoaded` cercava `model.loaded` che non esiste nell'API di LM Studio. Il modello embedding era caricato ma non rilevato.

**Fix**: Cambiato il controllo da `model.loaded` a `loaded_instances.length > 0`:

```typescript
// Prima (sbagliato)
return data.models.some((model) => model.id === modelId && model.loaded)

// Dopo (corretto)
return data.models.some((model) => {
  const isMatch = model.id === modelId || model.model === modelId
  const isLoaded = Array.isArray(model.loaded_instances) && model.loaded_instances.length > 0
  return isMatch && isLoaded
})
```

#### 2. HybridRouter - Bootstrap mai chiamato

**Problema**: `bootstrapAllCapabilities()` non veniva mai invocato prima del routing, lasciando il registry vuoto.

**Fix**: Aggiunto bootstrap prima dell'inizializzazione del semantic router in `hybrid-router.ts`.

#### 3. Capability ID Mismatch

**Problema**: `DEFAULT_CAPABILITY_KEYWORDS` usava ID come "web_search" ma il bootstrap registrava capability con ID come "search" (derivati da `skill.capabilities[0]`).

**Fix**: Corretti gli ID in `capability-extractor.ts` per corrispondere a quelli registrati dal bootstrap.

### Configuration Flags

```typescript
// Abilitato di default - disabilita con KILO_SEMANTIC_ROUTING_ENABLED=false
KILO_SEMANTIC_ROUTING_ENABLED = !falsy("KILO_SEMANTIC_ROUTING_ENABLED")

// Soglia di confidenza per routing semantico
KILO_SEMANTIC_ROUTING_THRESHOLD = 0.5

// Fallback al router keyword se semantic fallisce
KILO_SEMANTIC_ROUTING_FALLBACK_TO_KEYWORD = true
```

### Embedding Model

- **Modello**: `text-embedding-mxbai-embed-large-v1`
- **Provider**: LM Studio locale
- **Dimensione**: 1024 floats
- **URL**: `http://127.0.0.1:1234`

---

## 1. Problematica

### 1.1 Soluzione Attuale (Keyword-Based)

Il router attuale usa keyword matching hardcoded:

```typescript
const DOMAIN_KEYWORDS: Record<string, string[]> = {
  knowledge: ["search", "find", "query", "information", "research", ...],
  // ...
}
```

**Problemi**:

- Non scala oltre poche decine di keyword
- Non gestisce multilingual (solo inglese)
- Fragile: "cercami annunci" non match "search"
- Manutenzione manuale continua

### 1.2 Soluzioni Scartate

**Hardcoded Utterances** (aurelio-labs semantic-router style):

```typescript
const utterances = [
  "cerca annunci MacBook",
  "search for MacBook ads",
  // ... migliaia di esempi
]
```

- Non scala con centinaia di agencies
- Edge cases ignorati
- Manutenzione insostenibile

**LLM-Only Classification**:

- Costoso a runtime
- Latenza elevata
- Overkill per routing base

---

## 2. Principi Architetturali

### 2.1 Da LangGraph, CrewAI, AutoGen

**LangGraph**: Graph-based routing con LLM classification
**CrewAI**: Role-based agents con capability declaration
**Semantic Kernel**: planners che usano semantic matching

### 2.2 Principi Fondamentali

1. **Declarative Capability Registration**: Le agencies dichiarano capabilities, non frasi
2. **Dynamic Capability Matching**: Intent → Capabilities → Agency (no hardcoded mapping)
3. **Hierarchical Routing**: Domain (L0) → Agency → Subdomain (L1) → Skills (L2) → Tools (L3)
4. **Multilingual by Design**: Embeddings nativi, non keyword translation

---

## 3. Architettura Proposta

### 3.1 Layer Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      SEMANTIC LAYER                              │
│  ┌─────────────┐    ┌──────────────┐    ┌─────────────────┐   │
│  │ Intent      │───▶│ Capability    │───▶│ Agency Registry │   │
│  │ Classifier  │    │ Extractor     │    │ (dynamic)      │   │
│  └─────────────┘    └──────────────┘    └─────────────────┘   │
│         │                                        │              │
│         ▼                                        ▼              │
│  ┌─────────────┐                       ┌─────────────────┐    │
│  │ Query       │◀──────────────────────│ Skill Registry  │    │
│  │ Understanding│                       │ (dynamic)       │    │
│  └─────────────┘                       └─────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Flusso di Routing

```
User Input: "cercami annunci MacBook usato"
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ L0: DOMAIN DETECTION (Keyword + Embedding)                        │
│ - "cercami" → hint: domain = knowledge                          │
│ - Embedding similarity con domain centroids                      │
│ - Output: { domain: "knowledge", confidence: 0.72 }            │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ L1: CAPABILITY MATCHING                                           │
│ - Estrai capabilities dall'intent: [information_gathering,       │
│   product_research, price_comparison]                            │
│ - Query Agency Registry: chi ha queste capabilities?             │
│ - agency-knowledge ha [web_search, product_research] ✓           │
│ - Output: { agencyId: "agency-knowledge", confidence: 0.85 }     │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ L2: SKILL SELECTION                                               │
│ - Lista skills disponibili in agency-knowledge:                  │
│   [web_search, fact_check, synthesis, deep_research]             │
│ - Best match per intent: web_search (primary)                     │
│ - Output: { skillId: "web_research", confidence: 0.92 }          │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│ L3: TOOL RESOLUTION                                               │
│ - web_research → tool: websearch (Tavily/Brave via catalog)     │
│ - Filtra tools non-agency: codesearch (Exa MCP) ✗               │
│ - Output: { toolId: "websearch", provider: "tavily" }         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Componenti Chiave

### 4.1 CapabilityDescriptor

```typescript
interface CapabilityDescriptor {
  id: string // e.g., "web_search", "product_research"
  domain: Domain // e.g., "knowledge", "development"
  description: string // Descrizione semantica
  keywords: string[] // Keyword L0 per fast match (opzionale)
  embedding?: number[] // Pre-computed embedding del capability
  constraints?: {
    max_results?: number
    requires_auth?: boolean
    latency_budget_ms?: number
  }
  metadata: Record<string, unknown>
}
```

### 4.2 IntentClassifier

```typescript
interface Intent {
  id: string
  description: string // Raw user input
  type: "chat" | "task" | "query"
  risk: "low" | "medium" | "high" | "critical"
  context?: {
    history?: string[]
    preferences?: Record<string, unknown>
  }
}

interface IntentClassification {
  domains: Array<{ domain: Domain; confidence: number }>
  capabilities: Array<{ capability: string; confidence: number }>
  reasoning: string
}
```

### 4.3 CapabilityExtractor

Estrae capabilities dall'intent usando:

1. **Embedding similarity** con capability centroids
2. **LLM classification** come fallback (per edge cases)

```typescript
class CapabilityExtractor {
  // Pre-computed embeddings per capabilities
  private capabilityEmbeddings: Map<string, number[]>

  async extract(intent: Intent): Promise<CapabilityMatch[]>

  private async computeEmbedding(text: string): Promise<number[]>

  private findSimilarCapabilities(query: number[]): CapabilityMatch[]
}
```

### 4.4 AgencyRegistry

Registro dinamico delle agencies con capabilities:

```typescript
interface Agency {
  id: AgencyId
  domain: Domain
  name: string
  capabilities: CapabilityDescriptor[]
  skills: SkillDescriptor[]
  policies: Policy[]
  auditTrail: boolean
}

class AgencyRegistry {
  private agencies: Map<AgencyId, Agency>

  register(agency: Agency): void
  findByCapability(capabilities: string[]): Agency[]
  getCapabilities(agencyId: AgencyId): CapabilityDescriptor[]
}
```

---

## 5. Scalabilità

### 5.1 Centinaia di Agencies

| Approccio               | Scalabilità                       |
| ----------------------- | --------------------------------- |
| Keyword matching        | O(n) con n=keywords → non scala   |
| Utterance matching      | O(n) con n=utterances → non scala |
| **Capability matching** | O(1) con indexing → scala         |

### 5.2 Migliaia di Skills

- Skills sono raggruppati per capability
- Lookup per capability ID → O(1)
- Non serve iterare su tutti gli skills

### 5.3 Decine di Migliaia di Tools

- Tool resolution tramite Agency Catalog (già implementato)
- Skills → Tools mapping è interno all'agency

### 5.4 Multilingual

Gli embeddings gestiscono nativamente:

- "cercami" ≈ "search" ≈ "recherche" (stesso intent semantico)
- "annunci" ≈ "ads" ≈ "annonces" (stesso product intent)

---

## 6. Implementazione Proposta

### 6.1 Fase 1: Refactor AgencyCatalog

Rendere AgencyCatalog il registro centrale:

```typescript
// packages/opencode/src/kiloclaw/agency/registry/capability-registry.ts

export class CapabilityRegistry {
  private capabilities: Map<string, CapabilityDescriptor> = new Map()

  register(capability: CapabilityDescriptor): void {
    this.capabilities.set(capability.id, capability)
    // Pre-compute embedding for semantic matching
  }

  findSimilar(query: string, threshold: number): CapabilityDescriptor[] {
    // Vector similarity search
  }

  findByDomain(domain: Domain): CapabilityDescriptor[] {
    // Filter by domain
  }
}
```

### 6.2 Fase 2: Refactor Router

Da keyword → capability-based:

```typescript
// packages/opencode/src/kiloclaw/router/v2/

export class SemanticRouter {
  private capabilityRegistry: CapabilityRegistry
  private agencyRegistry: AgencyRegistry

  async route(intent: Intent): Promise<RoutingResult> {
    // L0: Fast domain detection (optional, can skip)
    const domains = await this.detectDomains(intent)

    // L1: Capability extraction
    const capabilities = await this.capabilityExtractor.extract(intent)

    // L2: Agency matching
    const agency = await this.findAgency(capabilities)

    // L3: Skill selection
    const skills = await this.selectSkills(agency, capabilities)

    return { domains, capabilities, agency, skills }
  }
}
```

### 6.3 Fase 3: Bootstrap Capabilities

Registrare capabilities per ogni skill esistente:

```typescript
// WebSearchSkill
{
  id: "web_research",
  domain: "knowledge",
  description: "Search the web for information, products, prices",
  capabilities: ["information_gathering", "web_search", "product_research"],
  keywords: ["search", "find", "lookup", "cercami", "cerca"]
}

// FactCheckSkill
{
  id: "fact_check",
  domain: "knowledge",
  description: "Verify facts and claims against sources",
  capabilities: ["fact_verification", "source_checking", "claim_validation"],
  keywords: ["verify", "check", "conferma", "verifica"]
}
```

---

## 7. Vantaggi vs Soluzione Attuale

| Aspetto        | Keyword-Based     | Capability-Based          |
| -------------- | ----------------- | ------------------------- |
| Scalabilità    | O(keywords)       | O(1) con indexing         |
| Multilingual   | No (keyword dict) | Sì (embeddings)           |
| Edge cases     | Fragile           | Robusto (semantic)        |
| Manutenzione   | Alta              | Bassa                     |
| Nuove agencies | Manuale           | Automatico (registration) |
| Nuove lingue   | Nuove keyword     | Già supportato            |

---

## 8. Dipendenze

- **Embeddings**: Servizio per computare embeddings (OpenAI, Gemini, o locale)
- **Vector similarity**: Approssimazione efficiente (FAISS, hnswlib, o embedded)
- **LLM fallback**: Per edge cases non risolvibili con embeddings

---

## 9. Testing

### 9.1 Unit Tests

- Capability extraction per edge cases
- Similarity threshold calibration
- Multilingual detection

### 9.2 Integration Tests

- End-to-end routing flow
- Agency registration and lookup
- Skill selection accuracy

### 9.3 Load Tests

- Latency con 100+ agencies
- Scalabilità a 1000+ skills

---

## 10. Timeline Stimata

| Fase | Descrizione                                       | Complessità |
| ---- | ------------------------------------------------- | ----------- |
| 1    | Refactor AgencyCatalog come registry capabilities | Media       |
| 2    | Implementare CapabilityExtractor con embeddings   | Alta        |
| 3    | Refactor Router per capability matching           | Alta        |
| 4    | Bootstrap capabilities per skills esistenti       | Bassa       |
| 5    | Testing e calibration                             | Media       |

---

## 11. Riferimenti

- [LangGraph Routing](https://langchain-ai.github.io/langgraph/concepts/routing/)
- [Semantic Router - aurelio-labs](https://github.com/aurelio-labs/semantic-router)
- [CrewAI Routing](https://docs.crewai.com/)
- [Microsoft Semantic Kernel](https://learn.microsoft.com/en-us/semantic-kernel/)
- [Hybrid Search Best Practices](https://programmingbrain.com/2025/05/keyword-vs-semantic-search-with-ai)

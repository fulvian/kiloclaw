# Piano di Implementazione: Eliminazione Agenti Nativi OpenCode

**Data**: 2026-04-04
**Stato**: In revisione
**Versione**: 2.0

---

## Contesto

Il sistema attuale ha **due sistemi paralleli di agenti** che non comunicano:

| Sistema  | Registry                | Agenti                             | Visibilità CLI        |
| -------- | ----------------------- | ---------------------------------- | --------------------- |
| Native   | `Agent.list()`          | code, plan, debug, router, ask...  | `kilocode agent list` |
| Flexible | `FlexibleAgentRegistry` | researcher, coder, nutritionist... | `kiloclaw agent list` |

**Problema**: Gli agenti flexible sono visibili ma **non utilizzabili** dal Task tool, che risolve solo tramite `Agent.get()` (nativi).

---

## Obiettivo

Eliminare gli agenti nativi OpenCode e utilizzare esclusivamente gli agenti flexible di Kiloclaw con routing capability-based.

---

## Analisi del Gap

```
Task Tool → Agent.get() → Solo agenti NATIVI (code, plan, debug...)
                         ↓
            FlexibleAgentRegistry (researcher, coder...)
            È VISIBILE MA NON USABILE!
```

**Root Cause**:

- `FlexibleAgentDefinition` contiene solo metadati (id, name, capabilities)
- **Manca**: prompt, permissions, execution model
- Gli agenti flexible non sono collegati al Task tool

---

## Piano di Implementazione

### Fase 1: Estendere FlexibleAgentDefinition

**Obiettivo**: Trasformare i flexible agents in agenti completi con prompt e permissions.

```typescript
// packages/opencode/src/kiloclaw/agency/registry/types.ts

interface FlexibleAgentDefinition {
  id: string
  name: string
  primaryAgency: AgencyName
  secondaryAgencies: AgencyName[]
  capabilities: string[] // Capability tags
  skills: string[] // Associated skills
  description: string // Human-readable description

  // NUOVI CAMPI
  prompt: string // System prompt per l'agente
  permission: PermissionNext.Ruleset // Permissions per i tool
  mode: "primary" | "subagent" // Ruolo nell'architettura

  constraints: AgentConstraints
  version: string
}
```

**Deliverable**: Tipi aggiornati con validazione Zod

---

### Fase 2: Aggiornare gli Agenti Flexible esistenti

**Obiettivo**: Aggiungere prompt e permissions a tutti i 13 agenti esistenti.

**Agenti da aggiornare**:

```
researcher, coder, nutritionist, weather-current, educator, analyst,
code-reviewer, debugger, planner, recipe-searcher, diet-planner,
forecaster, alerter
```

**File**: `packages/opencode/src/kiloclaw/agency/agents/*.ts`

**Esempio struttura**:

```typescript
export const coderAgentDefinition: FlexibleAgentDefinition = {
  id: "coder",
  name: "Coder",
  primaryAgency: "development",
  secondaryAgencies: ["knowledge"],
  capabilities: ["code-generation", "code-modification", "bug-fixing"],
  skills: ["tdd", "debugging"],
  description: "Agente specializzato in sviluppo codice",
  prompt: `You are a coding agent specialized in...
  
  Guidelines:
  1. Write clean, maintainable code
  2. Follow project conventions
  3. Include tests for new functionality
  ...`,
  permission: PermissionNext.merge(
    defaults,
    PermissionNext.fromConfig({
      "*": "deny",
      read: "allow",
      edit: "allow",
      write: "allow",
      bash: "allow",
      // ... altre permissions
    }),
  ),
  mode: "primary",
  constraints: {},
  version: "1.0.0",
}
```

**Deliverable**: 13 file aggiornati con prompt e permissions

---

### Fase 3: Modificare Task Tool per Flexible Agents

**Obiettivo**: Bridgare il Task tool al FlexibleAgentRegistry.

```typescript
// packages/opencode/src/tool/task.ts

// Modificare resolveAgent():
async function resolveAgent(agentId: string, caller: PermissionContext) {
  // 1. Prova flexible registry
  const flexible = FlexibleAgentRegistry.getAgent(agentId)
  if (flexible) {
    // Valida permissions del chiamante
    PermissionNext.evaluate("task", flexible.name, caller.permission)
    return { type: "flexible", agent: flexible }
  }

  // 2. Fallback native agents (per backward compatibility)
  const native = Agent.get(agentId)
  if (native) {
    return { type: "native", agent: native }
  }

  throw new Error(`Agent not found: ${agentId}`)
}

// In execute():
const resolved = await resolveAgent(params.subagent_type, ctx)

if (resolved.type === "flexible") {
  // Esegui tramite Session con flexible agent config
  const session = await Session.create({
    agent: resolved.agent.name,
    prompt: resolved.agent.prompt,
    permission: resolved.agent.permission,
    // ... altre config
  })
  return session.prompt(params)
} else {
  // Comportamento native esistente
  return originalExecute(params, ctx)
}
```

**Deliverable**: Task tool che supporta sia flexible che native agents

---

### Fase 4: Unificare la Lista Agenti

**Obiettivo**: Una sola fonte di verità per la lista agenti.

```typescript
// packages/opencode/src/agent/agent.ts

// Modificare Agent.list() per includere flexible agents
export async function list() {
  const cfg = await Config.get()
  const nativeAgents = await state() // Agenti nativi esistenti

  // Recupera tutti gli agenti flexible
  const flexibleAgents = FlexibleAgentRegistry.getAllAgents()

  // Converti flexible in formato compatibile
  const flexibleAsInfo = Object.fromEntries(
    flexibleAgents.map((a) => [
      a.id,
      {
        name: a.name,
        description: a.description,
        mode: a.mode,
        native: false,
        hidden: false,
        permission: a.permission,
        prompt: a.prompt,
      },
    ]),
  )

  // Merge (flexible sovrascrive nativi con stesso ID)
  return pipe({ ...nativeAgents, ...flexibleAsInfo }, values(), sortBy([(x) => (x.name === "router" ? 0 : 1), "asc"]))
}
```

**Deliverable**: Lista unificata che include router + tutti flexible

---

### Fase 5: Eliminare Agenti Nativi Superflui

**Obiettivo**: Rimuovere gli agenti nativi OpenCode (eccetto router e system agents).

**Mantieni** (necessari per il sistema):

- `router` - Entry point per routing
- `compaction` - Compattazione conversazione
- `title` - Generazione titoli
- `summary` - Summarization

**Rimuovi**:

- `code` → sostituito da `coder` (flexible)
- `plan` → sostituito da `planner` (flexible)
- `debug` → sostituito da `debugger` (flexible)
- `ask` → sostituito da `researcher` o `educator` (flexible)
- `general` → sostituito da agenti flexible specifici
- `explore` → funzionalità integrata in `coder` o nuovo agente
- `orchestrator` → deprecato, sostituito da `router`

**File**: `packages/opencode/src/agent/agent.ts`

**Deliverable**: Codice pulito senza duplicati

---

### Fase 6: Aggiornare Router per Delegare a Flexible

**Obiettivo**: Aggiornare il prompt del router per usare CapabilityRouter e delegare a flexible agents.

```typescript
// packages/opencode/src/agent/prompt/router.txt

// Aggiornare con mapping esplicito:

### Agent Selection Mapping

| Capability | Flexible Agent |
|------------|----------------|
| code-generation, code-modification | coder |
| bug-fixing, debugging | debugger |
| code-review | code-reviewer |
| task-planning, code-planning | planner |
| web-search, academic-research | researcher |
| fact-checking, source-verification | researcher |
| summarization, explanation | educator |
| data-analysis, comparison | analyst |
| nutrition-analysis, food-analysis | nutritionist |
| weather-query, weather-forecast | weather-current |
| recipe-search | recipe-searcher |
| meal-planning, diet-generation | diet-planner |
| weather-alerts | alerter |

### Routing Protocol

1. Classify user intent using keywords
2. Map to capabilities
3. Select best matching flexible agent
4. Use Task tool: `{ subagent_type: "<agent_id>", prompt: "...", description: "..." }`
5. For complex tasks, chain multiple agents sequentially
6. For independent subtasks, parallelize with multiple Task calls
```

**Deliverable**: Router prompt aggiornato con mapping esplicito

---

### Fase 7: CLI - Scegliere il Sistema di Riferimento

**Decisione Required**: Il progetto è Kiloclaw, non Kilocode.

**Opzione A**: Usare `kiloclaw agent list` come unico comando

```
PRO: Nomen omen - nome corretto del progetto
PRO: Tutti gli agenti (router + flexible) in un'unica lista
CON: Break backward compatibility per chi usa kilocode
```

**Opzione B**: Rinominare `kilocode agent list` in `kiloclaw agent list`

```
PRO: CLI unificata sotto kiloclaw
PRO: Nessun riferimento a kilocode
CON: Richiede symlink o deprecation
```

**Raccomandazione**: **Opzione A** - `kiloclaw agent list` diventa l'unico comando, `kilocode agent list` viene rimosso.

**Azioni**:

1. Unificare `AgentCommand` in `kiloclaw.ts`
2. Rimuovere comando `kilocode agent` (o deprecare)
3. Aggiornare help text

**Deliverable**: CLI con unico punto di accesso

---

## Dipendenze e Ordine di Implementazione

```
Fase 1: Estendere types
    ↓
Fase 2: Aggiornare 13 agenti
    ↓
Fase 3: Bridge Task tool
    ↓
Fase 4: Unify list
    ↓
Fase 5: Remove natives
    ↓
Fase 6: Update router
    ↓
Fase 7: CLI cleanup
```

---

## Tempo Stimato

| Fase                 | Complessità | Note                           |
| -------------------- | ----------- | ------------------------------ |
| 1. Estendere types   | Bassa       | Aggiungere campi allo schema   |
| 2. Aggiornare agenti | Media       | 13 agenti × ~30 righe ciascuno |
| 3. Bridge task tool  | Alta        | Cambiamento critico            |
| 4. Unify list        | Media       | Merge registries               |
| 5. Remove natives    | Media       | Rimuovere codice + test        |
| 6. Update router     | Bassa       | Aggiornare prompt              |
| 7. CLI               | Bassa       | Redirect comando               |

---

## Criteri di Successo

1. `kiloclaw agent list` mostra tutti gli agenti (router + flexible)
2. Il router delega correttamente agli agenti flexible
3. Task tool esegue flexible agents con prompt e permissions corretti
4. Nessun riferimento a "kilocode" nella CLI
5. Test passano per tutte le nuove funzionalità

---

## Note

- Il router USA CapabilityRouter ma con mapping esplicito agli agenti
- Flexible agents mantengono la struttura capability-based per future evoluzioni
- Backward compatibility mantenuta dove possibile senza compromettere l'architettura

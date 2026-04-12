# Audit architettura

Diagnosi severa su skill, policy tool e runtime.

---

## Sintetizza il quadro esecutivo

Il sistema di agency/skill è in stato **critico funzionale**: la pipeline decide bene il dominio, ma quasi mai abilita gli strumenti reali previsti da quel dominio.

L’effetto operativo è un fallback frequente verso strumenti generici di ricerca web, con perdita di affidabilità, copertura funzionale e controllo di policy.

La causa principale non è la classificazione intent, ma la rottura tra **identità tool di policy**, **chiavi tool runtime MCP** e **assenza di esecuzione skill reale nel loop sessione**.

---

## Mappa il percorso runtime

### Percorso attuale (runtime effettivo)

1. `packages/opencode/src/session/prompt.ts` chiama `RoutingPipeline.route(intent)` (riga ~509) per ottenere contesto agency.
2. Lo stesso file usa `resolveAgencyAllowedTools(...)` (riga ~1398) e filtra i tool in `resolveTools()`.
3. Il filtro sui tool nativi usa match esatto su `item.id` (`ToolRegistry.tools`) e sui tool MCP usa match esatto su `key` (`Object.entries(await MCP.tools())`, righe ~1494-1501).
4. `skill` tool (`packages/opencode/src/tool/skill.ts`) restituisce blocchi testuali `<skill_content ...>`, senza invocare la logica implementativa delle skill agency.
5. Il modello riceve prompt+toolset filtrato e procede nel loop standard LLM tool-calls.

### Percorso atteso (design dichiarato)

1. Routing L0-L3 seleziona agency/capability/agent/tool.
2. Skill scelta dovrebbe eseguire la sua implementazione reale con tool dominio-specifici.
3. Policy dovrebbe consentire solo tool autorizzati, ma con mapping coerente tra alias policy e nomi runtime.
4. Loop dovrebbe verificare che la chain agency venga eseguita end-to-end, non solo descritta in prompt.

### Gap architetturale

`RoutingPipeline.route()` oggi influenza contesto e filtraggio, ma non innesca la catena esecutiva skill/agent registrata in `kiloclaw/agency`.

In pratica è un router di contesto, non un orchestratore esecutivo.

---

## Elenca le evidenze dal codice

- `packages/opencode/src/session/prompt.ts`:
  - usa `resolveAgencyAllowedTools` per costruire allowlist (`~1398`).
  - filtra `ToolRegistry` con `item.id` e match esatto (`~1445`).
  - filtra `MCP.tools()` con `key` e match esatto (`~1497`).
  - chiama `RoutingPipeline.route(intent)` solo per arricchire contesto (`~509`).

- `packages/opencode/src/session/tool-policy.ts`:
  - allowlist GWorkspace contiene ID astratti tipo `gmail.search`, `drive.search`, `calendar.list`.
  - allowlist Finance include `finance-api` come alias astratto.

- `packages/opencode/src/mcp/index.ts`:
  - `MCP.tools()` costruisce chiavi runtime con formato sanitizzato `"<client>_<tool>"` (`result[sanitizedClientName + "_" + sanitizedToolName]`, ~720).
  - questo formato non coincide con alias policy a punti (`gmail.search`).

- `packages/opencode/src/tool/skill.ts`:
  - per skill agency (`knowledge/development/nutrition/weather/nba`) ritorna testo `<skill_content ...>` e metadati.
  - non esegue `agencySkill.execute(...)` nel path del tool `skill`.

- `packages/opencode/src/kiloclaw/agency/agents/exec.ts`:
  - `runSkill(...)` esiste ed esegue davvero `skill.execute(...)`.

- `packages/opencode/src/kiloclaw/agency/chain-executor.ts`:
  - `executeChain(...)` e `executeBestChain(...)` esistono e orchestrano skill reali.

- `packages/opencode/src/session/*`:
  - non ci sono chiamate a `runSkill`, `executeChain` o `executeBestChain` nel loop sessione.

- Test presenti:
  - `packages/opencode/test/session/tool-policy.test.ts` valida mapping/allowlist locale.
  - `packages/opencode/test/kiloclaw/routing-pipeline.test.ts` valida routing L0-L3 e allow/deny L3.
  - non ci sono integration test robusti su “skill selezionata -> tool previsti effettivamente chiamati”.

---

## Classifica le cause radice

### 1) Incoerenza identità tool policy vs runtime (impatto: massimo)

Le policy usano alias astratti (`gmail.search`), mentre MCP espone chiavi concrete sanitizzate (`google_workspace_search_gmail_messages`).

Con confronto stringa-esatta in `resolveTools()`, l’allowlist fallisce e i tool dominio-specifici vengono bloccati.

### 2) Skill tool non esecutivo (impatto: massimo)

Il tool `skill` carica istruzioni testuali ma non invoca la logica implementata in `kiloclaw/skills/*`.

Questo crea una falsa percezione di “skill attiva”, mentre il runtime resta nel comportamento generico del modello.

### 3) Routing usato come contesto, non come orchestrazione (impatto: alto)

`RoutingPipeline.route()` decide agency/capabilities ma non attiva i path `runSkill/executeChain`.

La separazione tra “decisione” ed “esecuzione” è rimasta incompleta.

### 4) Copertura test sbilanciata su unit test (impatto: alto)

I test verificano mapping e gating in isolamento, ma non la traversata completa sessione->tool->skill->tool-call.

Manca la prova che il comportamento desiderato emerga nel loop reale.

### 5) Prompt guardrails compensano bug strutturali (impatto: medio)

Molte istruzioni “CRITICAL TOOL INSTRUCTIONS” tentano di guidare il modello dove il runtime non garantisce coerenza.

Questo riduce robustezza e aumenta regressioni silenziose.

---

## Valuta overengineering e implementation gap

Il problema dominante è **missing implementation**, non complessità insufficiente.

Esistono già routing multilayer, registri agency/chain/skill e runtime skill executor, ma il loop sessione non li integra nel punto critico.

C’è anche una quota di **overengineering compensativo**: molti layer decisionali e prompt policy, senza un binding runtime forte tra decisione e invocazione effettiva.

Il risultato è un’architettura ricca ma non “chiusa” end-to-end.

---

## Confronta le opzioni strategiche

### Opzione A — MCP-first

**Pro**
- Uniforma integrazioni esterne su standard MCP `tools/list` e `tools/call`.
- Riduce frammentazione tra tool nativi e provider specifici.

**Contro**
- Richiede aliasing/normalizzazione rigorosa dei nomi tool, oggi assente.
- Aumenta dipendenza da naming e qualità schema dei server MCP.

### Opzione B — Ibrida (raccomandata)

**Pro**
- Mantiene tool nativi per core loop affidabile e MCP per domini esterni.
- Permette introduzione graduale di un `ToolIdentityResolver` senza riscrittura totale.

**Contro**
- Richiede disciplina su mapping canonico e test cross-layer.
- Introduce una matrice di compatibilità da governare.

### Opzione C — Native-first

**Pro**
- Massimo controllo locale su naming, policy e comportamento.
- Minore variabilità dovuta a server esterni.

**Contro**
- Riduce scalabilità integrazioni dominio-specifiche.
- Duplica capacità già disponibili via MCP e aumenta costo manutentivo.

### Raccomandazione

Adottare **opzione ibrida** con identità tool canonica e binding esecutivo esplicito tra routing e chain executor.

Il target è eliminare mismatch nominale e trasformare “skill loading” in “skill execution” dove previsto dalla policy.

---

## Definisci il piano di remediation

### P0 — Stabilizza identità e blocchi critici (immediato)

1. Introdurre `ToolIdentityResolver` unico con mapping alias->runtime key.
2. Normalizzare allowlist agency su ID canonici (es. `gworkspace.gmail.search`) e risoluzione a chiavi MCP reali.
3. Aggiornare `resolveTools()` in `session/prompt.ts` per usare resolver, non confronto stringa diretta.
4. Introdurre metrica/telemetria: `tool_policy_allowed`, `tool_policy_blocked`, `policy_alias_miss`.

**Criteri di accettazione P0**
- `gmail.search` risolve almeno una chiave MCP reale presente.
- Nessun tool consentito da policy viene bloccato per mismatch nominale.
- Log strutturati mostrano mapping alias->key runtime in ogni sessione agency.

### P1 — Collega routing a esecuzione skill reale

1. Aggiungere execution bridge nel loop sessione: se route L1/L2 identifica skill/chain eseguibile, chiamare `runSkill()` o `executeChain()`.
2. Mantenere tool `skill` solo per skill documentali, distinguendo chiaramente `load-skill` vs `execute-skill`.
3. Evitare che output `<skill_content>` sia considerato completamento operativo.

**Criteri di accettazione P1**
- Per agency skill eseguibile, sessione produce `tool-call` o step chain reali tracciati.
- Nessun caso “skill loaded ma non eseguita” nei flussi agency target.

### P2 — Rafforza test end-to-end e rollout sicuro

1. Aggiungere integration test per flusso completo sessione/routing/policy/tool execution.
2. Aggiungere test di regressione per fallback improprio su websearch generico.
3. Introdurre canary release con metriche di successo per agency.

**Criteri di accettazione P2**
- Test E2E verdi su knowledge, gworkspace, finance, nba.
- Riduzione misurabile fallback generico e aumento tool-domain call rate.

---

## Aggiungi i test mancanti

- `packages/opencode/test/session/agency-skill-execution.e2e.test.ts`
  - scenario: intent knowledge -> route -> skill selezionata -> esecuzione reale -> tool domain chiamato.

- `packages/opencode/test/session/tool-identity-resolver.test.ts`
  - scenario: alias `gmail.search` / `finance-api` / `websearch` -> chiavi runtime corrette (native+MCP).

- `packages/opencode/test/session/gworkspace-policy-mcp-integration.test.ts`
  - scenario: allowlist GWorkspace abilita effettivamente tool MCP sanitizzati.

- `packages/opencode/test/session/routing-to-chain-executor.integration.test.ts`
  - scenario: `RoutingPipeline.route` + bridge sessione invoca `executeChain` quando previsto.

- `packages/opencode/test/session/no-silent-fallback.test.ts`
  - scenario: se policy consente tool specialistico e mapping esiste, fallback generico deve essere negato.

---

## Gestisci rischi e rollback

| Rischio | Probabilità | Impatto | Mitigazione | Rollback |
|---|---|---|---|---|
| Mapping alias incompleto rompe tool validi | Media | Alto | Resolver con fallback controllato + telemetry | Feature flag su resolver, ritorno a policy attuale |
| Bridge esecutivo introduce loop inattesi | Media | Alto | Guardrail di step/timeouts + circuit breaker | Disabilitare bridge con flag runtime |
| Regressioni su agent legacy | Alta | Medio | Test matrice agent/agency + canary progressivo | Rollback per agency, non globale |
| Sovraccarico log/telemetria | Bassa | Medio | Sampling e livelli log | Riduzione verbosity via config |
| Divergenza policy tra ambienti | Media | Medio | Snapshot policy in CI + contract tests | Ripristino snapshot policy precedente |

Strategia di rollout: flag per agency (`knowledge`, `gworkspace`, `finance`, `nba`) con attivazione incrementale e SLO minimi prima di espansione.

---

## Applica i riferimenti di best practice

- OpenAI Function Calling: toolset iniziale piccolo, descrizioni precise, schema rigoroso, namespace coerenti, tool discovery/deferred loading.
- OpenAI o3/o4-mini prompting: confini tool espliciti, ordine d’uso vincolato, validazione stretta, evitare comportamento “lazy” o promesse differite.
- MCP spec (`tools/list`, `tools/call`): nomi univoci, schema affidabile, separazione chiara discovery/esecuzione e controlli HITL.
- OpenAI Agents SDK MCP: filtri statici/dinamici allow/deny, caching controllato, approval policy, metadata coerenti.
- Anthropic tool use: distinzione netta tra tool client-side e server-side, policy esplicite per uso tool.

Riferimenti utili:
- https://platform.openai.com/docs/guides/function-calling
- https://platform.openai.com/docs/guides/reasoning-best-practices
- https://spec.modelcontextprotocol.io
- https://openai.github.io/openai-agents-python/mcp
- https://docs.anthropic.com/en/docs/agents-and-tools/tool-use

---

## Concludi con raccomandazione finale

Eseguire subito **P0+P1** sotto feature flag, perché il difetto è strutturale e oggi impedisce il funzionamento effettivo delle agency skill-based.

Decisione operativa: standardizzare identità tool con resolver canonico e collegare il routing alla esecuzione skill/chain reale nel loop sessione, lasciando i prompt guardrail come supporto e non come meccanismo primario di controllo.

# LLM Wiki Kiloclaw

Analisi decisionale per memoria operativa verificabile.

---

## Definisci obiettivo

Questo documento valuta l’integrazione del pattern LLM Wiki proposto da Karpathy nel runtime Kiloclaw, con focus su fattibilità tecnica, rischi operativi e impatto architetturale.

L’analisi combina fonti esterne e evidenze locali del repository per arrivare a una raccomandazione architetturale eseguibile.

---

## Riassumi il pattern

Il gist di Karpathy propone un passaggio da RAG “stateless” a una knowledge base persistente che cresce nel tempo e che viene mantenuta dall’agente LLM, non dall’utente.

Il modello è tripartito: `raw sources` immutabili, `wiki` compilata e aggiornata incrementalmente, `schema` operativo che governa ingest/query/lint.

| Asse | RAG classico | LLM Wiki |
|---|---|---|
| Unità primaria | chunk dinamici | pagine strutturate persistenti |
| Aggiornamento conoscenza | al query-time | all’ingest-time + lint periodico |
| Costo cognitivo umano | alto mantenimento manuale | alto setup iniziale, basso mantenimento |
| Rischio tipico | risposte incoerenti run-to-run | errore persistente se non governato |
| Valore cumulativo | limitato | crescente e compounding |

Fonte principale: [Karpathy gist](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f).

---

## Mappa i segnali dal thread

Dal thread emerge un consenso forte sul valore del pattern e una preoccupazione ricorrente: gli errori smettono di essere effimeri e diventano persistenti.

Le discussioni convergono su provenance, contradiction handling, invalidazione, costi e latenza, con prime implementazioni OSS già in esercizio.

| Segnale | Implicazione per Kiloclaw |
|---|---|
| “Compounding artifact” utile | ottimo fit con memory-first blueprint |
| “Persistent errors” | serve governance forte prima del rollout |
| Interesse su tool CLI/MCP | integrazione naturale col plugin layer |
| Domande su scala/costi | KPI di budget e recall quality obbligatori |

---

## Elenca i repo relativi alla discussione

### Repo relativo alla discussione

Il repository principale emerso nel thread è **Axiom Wiki**, citato esplicitamente come implementazione open-source end-to-end orientata CLI.

Altri progetti rilevanti mostrano varianti di design utili per benchmark e composizione ibrida.

| Ruolo | Repository | Nota pratica |
|---|---|---|
| Principale dal thread | [abubakarsiddik31/axiom-wiki](https://github.com/abubakarsiddik31/axiom-wiki) | CLI completa ingest/query/map/sync/lint/review/mcp |
| Plugin-oriented | [AgriciDaniel/claude-obsidian](https://github.com/AgriciDaniel/claude-obsidian) | workflow Obsidian + hot cache + contradiction callouts |
| Skill-pack workflow | [peterzhangbo/LLMWikiController](https://github.com/peterzhangbo/LLMWikiController) | Import→Ingest→Query/Synthesis→Lint, forte disciplina raw/wiki |
| Alternativa AST-centric | [Houseofmvps/codesight](https://github.com/Houseofmvps/codesight) | wiki compilata da AST, costi bassi, ottimo per codice |
| App desktop estesa | [nashsu/llm_wiki](https://github.com/nashsu/llm_wiki) | grafi, review async, deep research, query pipeline 4-fasi |
| Agent skill set | [SamurAIGPT/llm-wiki-agent](https://github.com/SamurAIGPT/llm-wiki-agent) | ingest/query/lint/graph per agent CLI |
| Search engine locale | [tobi/qmd](https://github.com/tobi/qmd) | BM25+vector+rerank locale, MCP pronto |

---

## Mostra applicazioni reali

### Applicazioni pratiche già implementate

Le implementazioni sotto sono già pubbliche e operative, con pattern replicabili in Kiloclaw.

I claim prestazionali sono per lo più self-reported, quindi vanno trattati come benchmark preliminari e non come evidenza definitiva.

| Caso | Implementazione | Evidenza utile | Link |
|---|---|---|---|
| Wiki CLI persistente | Axiom Wiki | ingest incrementale, sync da `git diff`, review contraddizioni, `usage.log` costi | https://github.com/abubakarsiddik31/axiom-wiki |
| Knowledge companion Obsidian | claude-obsidian | hot cache sessionale, lint multi-categoria, `/autoresearch`, seed vault | https://github.com/AgriciDaniel/claude-obsidian |
| Workflow skill-based | LLMWikiController | separazione rigida raw/wiki, skill specifiche bootstrap/import/ingest/lint | https://github.com/peterzhangbo/LLMWikiController |
| Code wiki compilata | codesight | wiki da AST, tool MCP dedicati per wiki index/article/lint | https://github.com/Houseofmvps/codesight |
| Desktop knowledge graph | llm_wiki | relevance model a più segnali, Louvain clustering, queue review HITL | https://github.com/nashsu/llm_wiki |
| Agent package minimale | llm-wiki-agent | pattern ingest/query/lint/graph pronto per agent loop | https://github.com/SamurAIGPT/llm-wiki-agent |
| Retrieval locale robusto | qmd | query ibrida locale, reranking, supporto MCP/CLI per recall ad alte prestazioni | https://github.com/tobi/qmd |

---

## Confronta con Kiloclaw

### Fit con Kiloclaw

Le evidenze locali indicano che Kiloclaw ha già quasi tutti i mattoni necessari per una LLM Wiki governata, con un vantaggio importante su auditabilità e policy rispetto a molte implementazioni OSS attuali.

Il gap principale non è tecnologico ma di orchestrazione prodotto: manca un layer “wiki compiler” esplicito con lifecycle dedicato e standard di qualità unificati.

| Capacità richiesta LLM Wiki | Evidenza locale | Valutazione fit |
|---|---|---|
| Memoria stratificata | `docs/architecture/MEMORY_4_LAYER.md` | Forte |
| Governance memory-first | `docs/foundation/KILOCLAW_BLUEPRINT.md` | Forte |
| Broker persistente + retrieval ranking | `packages/opencode/src/kiloclaw/memory/memory.broker.v2.ts` | Forte |
| Knowledge graph per espansione semantica | `packages/opencode/src/kiloclaw/memory/memory.graph.ts` | Forte |
| Repository persistente + audit chain | `packages/opencode/src/kiloclaw/memory/memory.repository.ts` | Molto forte |
| Plugin recall/injection runtime | `packages/opencode/src/kiloclaw/memory/plugin.ts` | Forte |
| Policy e audit nell’orchestrator | `packages/opencode/src/kiloclaw/orchestrator.ts` | Medio-forte |

Punto critico da risolvere: l’orchestrator mostra ancora un broker memory locale semplificato in-memory, quindi il coupling con `MemoryBrokerV2` va completato per un comportamento production-grade uniforme.

---

## Evidenzia differenze architetturali

Il pattern Karpathy è volutamente astratto e file-centrico, mentre Kiloclaw è già un sistema runtime policy-first con domini memory, graph e audit separati.

Questo rende possibile una versione “LLM Wiki enterprise-grade”, ma impone rigore maggiore su contraddizioni, provenance e regole di promozione della conoscenza.

| Dimensione | Pattern LLM Wiki | Architettura Kiloclaw attuale | Impatto integrazione |
|---|---|---|---|
| Layer concettuali | raw/wiki/schema | working/episodic/semantic/procedural + policy/orchestrator | Richiede mapping operativo chiaro |
| Stato persistenza | spesso markdown-only | SQLite/Drizzle + vector + graph + audit log | Vantaggio forte su compliance |
| Routing | agent workflow implicito | orchestrator + policy engine | Più controllo, più complessità |
| Provenance | spesso frontmatter | provenance + audit repo + hash chain | Vantaggio decisivo |
| Contradiction management | variabile tra progetti | disponibile a livello memory/policy, non standardizzato wiki-level | Da formalizzare |
| Recall runtime | indici wiki + search | plugin recall, retrieve ranking, semantic trigger | Ottima base per query wiki-aware |

---

## Definisci best practice operative

Le pratiche sotto sono prioritarie per evitare che la LLM Wiki diventi una sorgente di drift persistente.

Queste pratiche sono allineate sia alle criticità emerse nel thread sia alle capacità già presenti nel codice Kiloclaw.

| Area | Best practice operativa | Controllo minimo |
|---|---|---|
| Provenance | ogni claim deve avere `source_ids`, `ingest_run_id`, `confidence`, `timestamp` | rifiuta write semantic senza metadati |
| Contradiction handling | mai overwrite silenzioso, crea `conflict nodes` e stato `open/resolved` | lint blocca promozione se conflitto high-confidence aperto |
| Linting | lint periodico su orfani, dead links, claims senza fonte, pagine stale | job schedulato + score salute wiki |
| Governance | policy gate per azioni irreversibili e promozioni ad alto impatto | review obbligatoria per policy scope sensibili |
| HITL | review queue con priorità su conflitti e claim critici | SLO di review e fallback consultivo |
| Costo/latenza | budget token per ingest/query, retrieval tiered, caching | KPI costo per ingest e p95 query |
| Versioning | versiona pagine wiki e procedure di sintesi | changelog machine-readable + diff semantic |
| Auditability | append-only audit con correlation id end-to-end | verifica catena hash e report integrità |

---

## Proponi integrazione graduale

L’approccio consigliato è incrementale con gate rigidi per qualità e rischio.

Ogni fase deve chiudersi con metriche misurabili e rollback semplice.

### Fase MVP

Obiettivo: introdurre `wiki compiler loop` su fonti selezionate e query con citazioni verificabili.

| Elemento | Scelta concreta |
|---|---|
| Componenti | `wiki.ingest`, `wiki.query`, `wiki.lint` come capability nel dominio `knowledge` |
| Target file/namespace | `packages/opencode/src/kiloclaw/memory/plugin.ts`, `packages/opencode/src/kiloclaw/memory/memory.broker.v2.ts`, `packages/opencode/src/kiloclaw/orchestrator.ts` |
| Persistenza | usare `SemanticMemoryRepo`, `EpisodicMemoryRepo`, `GraphMemoryRepo` via broker v2 |
| Policy | hard gate su write senza provenance e su update che altera claim ad alta confidenza |
| Acceptance criteria | 95% risposte query con almeno 1 citazione valida, zero write semantic senza fonte |
| KPI | recall precision@5, costo medio ingest/doc, p95 latenza query, conflict-open-rate |

### Fase Beta

Obiettivo: aprire a più domini, introdurre review queue e lint continuo con remediation guidata.

| Elemento | Scelta concreta |
|---|---|
| Componenti | contradiction queue, quality score, maintenance scheduler wiki-aware |
| Target file/namespace | `packages/opencode/src/kiloclaw/memory/memory.repository.ts`, `packages/opencode/src/kiloclaw/memory/memory.graph.ts`, `packages/opencode/src/kiloclaw/memory/plugin.ts` |
| Governance | policy differenziata per tier dati e agency scope |
| Acceptance criteria | riduzione conflitti non risolti >40%, orphan pages <5%, stale claims <10% |
| KPI | contradiction resolution time, wiki health score, hit-rate su contesto recuperato |

### Fase Production

Obiettivo: consolidare affidabilità, audit legale/compliance e scalabilità operativa.

| Elemento | Scelta concreta |
|---|---|
| Componenti | audit report automatico, rollback semantico, budget enforcement multi-tenant |
| Target file/namespace | `packages/opencode/src/kiloclaw/memory/memory.repository.ts`, `packages/opencode/src/kiloclaw/orchestrator.ts`, `docs/architecture/MEMORY_4_LAYER.md` |
| Governance | policy-as-code completa, SLO ufficiali, runbook incidenti knowledge integrity |
| Acceptance criteria | chain audit valida 100%, p95 query sotto soglia target, drift score in calo continuo |
| KPI | audit pass rate, trusted-answer rate, costo mensile per tenant, MTTR incidenti knowledge |

---

## Definisci criteri di successo

Una LLM Wiki in Kiloclaw ha successo solo se migliora insieme qualità decisionale e controllo operativo.

Il solo aumento di contenuto non è un indicatore valido.

| KPI | Target iniziale | Motivazione |
|---|---|---|
| Citation validity rate | >= 95% | evita sintesi non verificabili |
| Contradiction unresolved > 14 giorni | <= 10% | limita drift persistente |
| Trusted-answer rate (human sampled) | >= 85% | misura qualità reale di output |
| Ingest cost per source | trend decrescente | sostenibilità economica |
| Query p95 latency | sotto budget prodotto | UX stabile per uso quotidiano |
| Audit chain integrity | 100% | requisito compliance e forensics |

---

## Identifica rischi e anti-pattern

I rischi principali sono gestibili, ma solo con regole esplicite e enforcement automatico.

Il rischio massimo è trasformare la wiki in “verità apparente” senza tracciabilità operativa.

| Rischio / anti-pattern | Effetto | Mitigazione |
|---|---|---|
| Overwrite silenzioso di claim | perdita storia e bias cumulativo | conflict node + merge policy + audit mandatory |
| Wiki bloat non governato | latenza e costi crescenti | archivio freddo, pruning, TTL logico su pagine obsolete |
| Recall indiscriminato | contesto rumoroso e risposte instabili | retrieval budget per layer + reranking + soglie dinamiche |
| Promozione automatica senza HITL | propagazione errori ad alta confidenza | gate umano su domini critici e conflitti |
| Schema drift tra agenti | incoerenza semantica | schema contract centralizzato e lint blocking |
| Metriche vanity (solo volume pagine) | falsa sensazione di progresso | KPI qualità/affidabilità prima del throughput |
| Coupling incompleto orchestrator-memory | doppia logica e bug non deterministici | unificare broker runtime e policy hooks |

---

## Formula raccomandazione

**Raccomandazione: conditional-go.**

Il fit tecnico con Kiloclaw è alto grazie a memory 4-layer, broker v2, graph, audit e policy orchestration già disponibili, ma la messa in produzione deve essere condizionata a tre prerequisiti non negoziabili.

| Condizione | Stato richiesto prima del rollout ampio |
|---|---|
| Provenance e contradiction governance | enforcement hard nel write path + lint bloccante |
| Integrazione orchestrator con broker v2 | percorso unico runtime per recall/write/audit |
| KPI operativi in dashboard | costo, latenza, qualità citazioni, drift, audit integrity |

Se queste condizioni sono rispettate, Kiloclaw può superare il pattern “wiki assistita” e diventare una piattaforma di memoria compilata realmente governata.

---

## Cita fonti

### Fonti esterne

- Karpathy, **LLM Wiki gist**: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- Axiom Wiki: https://github.com/abubakarsiddik31/axiom-wiki
- claude-obsidian: https://github.com/AgriciDaniel/claude-obsidian
- LLMWikiController: https://github.com/peterzhangbo/LLMWikiController
- codesight: https://github.com/Houseofmvps/codesight
- llm_wiki: https://github.com/nashsu/llm_wiki
- llm-wiki-agent: https://github.com/SamurAIGPT/llm-wiki-agent
- qmd: https://github.com/tobi/qmd

### Evidenze locali

- `docs/foundation/KILOCLAW_BLUEPRINT.md`
- `docs/architecture/MEMORY_4_LAYER.md`
- `packages/opencode/src/kiloclaw/memory/memory.broker.v2.ts`
- `packages/opencode/src/kiloclaw/memory/memory.graph.ts`
- `packages/opencode/src/kiloclaw/memory/memory.repository.ts`
- `packages/opencode/src/kiloclaw/memory/plugin.ts`
- `packages/opencode/src/kiloclaw/orchestrator.ts`

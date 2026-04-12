# KILOCLAW_DEVELOPMENT_AGENCY_REFOUNDATION_PLAN_2026-04-12

Piano esecutivo per migrazione completa native-first.

---

## Definisci mandato

- Questo piano impone **migrazione completa**, senza semplificazioni e senza riduzione funzionale rispetto a `fulvian/kilo_kit`.
- Obiettivo primario: portare in Kiloclaw **tutti** gli agenti/subagenti e **tutte** le skill, preservando parita comportamentale e allineamento architetturale Kiloclaw.
- Obiettivo di adattamento core: convertire i percorsi MCP-heavy in percorsi nativi Kiloclaw, mantenendo fallback MCP solo dove la copertura nativa non e ancora completa.
- Vincoli hard: compliance Kiloclaw, policy deny-by-default, auditability end-to-end, rispetto protocollo `G1..G6`.

### Blocca i non negoziabili

| ID | Vincolo | Regola esecutiva |
|---|---|---|
| N1 | No simplification | Nessuna capability viene rimossa o declassata |
| N2 | No feature reduction | Ogni comportamento `kilo_kit` ha equivalente Kiloclaw |
| N3 | Full parity | KPI di parita funzionale globale >= 99% |
| N4 | Native-first | Prima scelta sempre native adapter |
| N5 | MCP fallback | Attivo solo per capability gap tracciati |
| N6 | Safe autonomy | Auto-riparazione consentita solo entro policy SAFE/NOTIFY/CONFIRM/DENY |

---

## Esegui protocollo G1..G6

| Gate | Fase | Deliverable obbligatorio | Criterio GO |
|---|---|---|---|
| G1 | Discovery | Discovery brief completo + inventario baseline `kilo_kit` | requisiti non ambigui, baseline congelata |
| G2 | Research | Tool Decision Record + factory design | strategia native-first validata, fallback policy approvata |
| G3 | Design | manifest agency, mapping intent->agency->agent->skill->tool, contratti compatibilita | deny-by-default e contratti di regressione pronti |
| G4 | Build | implementazione adapter nativi, fallback MCP, migrazione agent/skill, auto-trigger repair | build verde, test fase verdi, telemetry attiva |
| G5 | Verify | suite parity vs baseline, security tests, report KPI | parita globale >= 99%, zero regressioni P0/P1 |
| G6 | Rollout | shadow/canary/graduale + runbook rollback | soglie in target e rollback verificato |

### Pianifica il calendario operativo

| Sprint | Focus | Gate |
|---|---|---|
| W1 | Baseline, inventario completo, contratti, TDR | G1-G2 |
| W2 | Design finale + bootstrap factory adapter | G3 |
| W3 | Migrazione ondate 1-2 (agenti core + skill core) | G4 parziale |
| W4 | Migrazione ondate 3-4 (agenti specialistici + skill avanzate) | G4 |
| W5 | Migrazione ondata 5 (chiusura totale) + parity hardening | G5 |
| W6 | Shadow, canary, graduale, rollback drill | G6 |

---

## Definisci strategia di migrazione completa

### Copri l inventario agenti e subagenti

| `kilo_kit` agente | Ruolo target Kiloclaw | Agency target | Stato migrazione | Parity check |
|---|---|---|---|---|
| `general-manager` | orchestratore sviluppo cross-fase | `agency-development` | pianificato | obbligatorio |
| `system-analyst` | analisi requisiti, incident triage | `agency-development` | pianificato | obbligatorio |
| `architect` | design tecnico e decisioni strutturali | `agency-development` | pianificato | obbligatorio |
| `coder` | implementazione feature/fix | `agency-development` | pianificato | obbligatorio |
| `qa` | test design e quality gate | `agency-development` | pianificato | obbligatorio |
| `devops` | build, pipeline, release safety | `agency-development` | pianificato | obbligatorio |
| `security-engineer` | security review e hardening | `agency-development` | pianificato | obbligatorio |
| `frontend-specialist` | UX/UI code path | `agency-development` | pianificato | obbligatorio |
| `data-engineer` | data pipeline e schema evolution | `agency-development` | pianificato | obbligatorio |
| `ml-engineer` | training/inferenza integration | `agency-development` | pianificato | obbligatorio |
| `qlora-expert` | fine-tuning QLoRA e ottimizzazione | `agency-development` | pianificato | obbligatorio |

### Copri l inventario completo skill

| `kilo_kit` skill | Stato target Kiloclaw | Adapter primario | Fallback MCP | Checklist parita |
|---|---|---|---|---|
| `anti-patterns` | migrata | native rules engine | no | scenario equivalenti |
| `api-development` | migrata | native docs/code tools | condizionale | output spec equivalenti |
| `brainstorming` | migrata | native planning stack | no | struttura output equivalente |
| `code-review-discipline` | migrata | native review workflow | no | findings equivalenti |
| `context-engineering` | migrata | native context router | condizionale | quality equivalenti |
| `database-design` | migrata | native analysis + tests | no | ddl/model equivalenti |
| `deep-research` | migrata | native search providers | condizionale | citazioni equivalenti |
| `dispatching-parallel-agents` | migrata | native orchestrator | no | parallel fanout equivalente |
| `executing-plans` | migrata | native phase runner | no | gate execution equivalente |
| `finishing-a-development-branch` | migrata | native git flow tools | no | completion checklist equivalente |
| `knowledge-graph-memory` | migrata | memory 4-layer nativo | no | retrieval equivalenti |
| `multi-agent-orchestration` | migrata | agency runtime nativo | no | handoff equivalenti |
| `performance-optimization` | migrata | native profiling toolchain | condizionale | miglioramenti equivalenti |
| `planning-with-files` | migrata | native file planner | no | artifact equivalenti |
| `receiving-code-review` | migrata | native review intake | no | loop fix equivalenti |
| `requesting-code-review` | migrata | native review request | no | pacchetto review equivalente |
| `security-audit` | migrata | native security scanners | condizionale | findings equivalenti |
| `spec-driven-development` | migrata | native spec workflow | no | allineamento spec equivalente |
| `subagent-driven-development` | migrata | native subagent dispatcher | no | coordinamento equivalente |
| `systematic-debugging` | migrata | native debug flow | no | root-cause equivalente |
| `tavily-research` | migrata | native web research stack | condizionale | copertura fonti equivalente |
| `test-driven-development` | migrata | native test-first workflow | no | ciclo red-green equivalente |
| `using-git-worktrees` | migrata | native worktree ops | no | isolamento equivalente |
| `using-superpowers` | migrata | native skill loader | no | attivazione equivalente |
| `verification-before-completion` | migrata | native verify gate | no | prove equivalenti |
| `visual-companion` | migrata | native visual workflow | condizionale | output visuale equivalente |
| `writing-plans` | migrata | native planning templates | no | piano equivalente |
| `writing-skills` | migrata | native skill authoring | no | qualita skill equivalente |
| `yagni-enforcement` | migrata | native policy lint | no | enforcement equivalente |

### Rendi operativa la checklist di parita

- Ogni riga inventario ha `owner`, `deadline`, `status`, `evidence link` e `parity score`.
- Nessuna riga puo andare in `done` senza test comparativo vs baseline `kilo_kit` e verifica manuale campionata.
- Le righe con fallback MCP restano `provisioned` finche l adapter nativo non raggiunge parity >= 99% su capability specifica.

---

## Registra la decisione strumenti

### Mantieni il tool decision record

| Criterio | Peso | Native-first | MCP-first | Ibrido con factory |
|---|---:|---:|---:|---:|
| Prestazioni | 0.20 | 4.7 | 2.6 | 4.5 |
| Costo contesto/token | 0.15 | 4.8 | 2.1 | 4.4 |
| Sicurezza e compliance | 0.30 | 4.9 | 2.0 | 4.6 |
| Affidabilita runtime | 0.20 | 4.5 | 3.0 | 4.6 |
| Manutenibilita | 0.15 | 4.4 | 3.1 | 4.7 |
| **Totale pesato** | **1.00** | **4.69** | **2.49** | **4.57** |

### Conferma la scelta

- Strategia ufficiale: **native-first con factory di conversione e fallback MCP confinato**.
- Motivazione: massimizza parita e sicurezza senza perdere copertura funzionale durante la transizione.
- Regola di routing: native adapter obbligatorio, fallback MCP solo su capability non ancora completata e mai su policy `DENY`.

---

## Disegna la catena operativa

### Mappa intent->agency->agent->skill->tool

| Intent | Agency | Agent | Skill primaria | Tool nativi | Fallback MCP |
|---|---|---|---|---|---|
| bug/error/malfunction runtime | `agency-development` | `system-analyst` + `coder` + `qa` | `systematic-debugging`, `verification-before-completion` | `read`, `grep`, `glob`, `apply_patch`, `bash` | solo gap certificato |
| nuova feature complessa | `agency-development` | `architect` + `coder` | `spec-driven-development`, `test-driven-development` | `read`, `glob`, `apply_patch`, `bash` | no default |
| quality hardening | `agency-development` | `qa` + `code-reviewer` | `code-review-discipline`, `receiving-code-review` | `read`, `grep`, `bash` | no default |
| security hardening | `agency-development` | `security-engineer` | `security-audit`, `anti-patterns` | `read`, `grep`, `bash` | solo scanner non nativo |
| devops/release prep | `agency-development` | `devops` | `finishing-a-development-branch`, `using-git-worktrees` | `bash`, `git_*`, `read` | no su operazioni distruttive |
| data/ml tuning | `agency-development` | `data-engineer` + `ml-engineer` + `qlora-expert` | `performance-optimization` | `bash`, `read`, `glob` | solo su tool specialistici mancanti |
| ricerca e contesto | `agency-development` | `system-analyst` | `deep-research`, `context-engineering`, `tavily-research` | provider web nativi | consentito per parity temporanea |
| design frontend visuale | `agency-development` | `frontend-specialist` | `visual-companion` | tooling UI nativo | consentito se adapter incompleto |

### Applica policy deny-by-default

| Classe azione | Policy | Esempi |
|---|---|---|
| Analisi e lettura locale | SAFE | `read`, `glob`, `grep` |
| Patch locale + test | NOTIFY | `apply_patch`, `bun run test` |
| Modifiche pipeline, policy, security files | CONFIRM | editing CI, regole auth, config critiche |
| Azioni irreversibili o esfiltrazione | DENY | `git reset --hard`, delete massivo, secret export |

---

## Definisci i contratti di compatibilita

### Garantisci assenza regressioni vs `kilo_kit`

| Contratto | Oggetto | Verifica |
|---|---|---|
| C1 Behavioral parity | stesso input operativo produce stesso outcome semantico | golden tests intent-based |
| C2 Tool-call parity | sequenza capability-equivalente | trace diff + normalizzazione |
| C3 Safety parity | stesse azioni bloccate/consentite in policy critica | security regression suite |
| C4 Error parity | stessa classificazione errori e stop conditions | error taxonomy tests |
| C5 Output parity | formato output e campi obbligatori equivalenti | schema validation |
| C6 Latency budget | degradazione accettabile in migrazione | benchmark SLO |
| C7 Audit parity | stessa tracciabilita decisionale | audit chain validation |

### Definisci il baseline harness

- Baseline ufficiale: replay di task suite `kilo_kit` congelata in W1, con dataset versionato e seed fisso.
- Metodo: esecuzione dual-run (`kilo_kit` vs Kiloclaw) con comparatore strutturale e semantic scorer.
- Exit minima: tutti i contratti `C1..C7` passano, con parita globale >= 99% e nessun fail P0/P1.

---

## Costruisci la factory di conversione MCP->native

### Progetta adapter per capability

| Capability | Adapter nativo target | File target repo | Stato iniziale |
|---|---|---|---|
| file_ops | `NativeFileAdapter` | `packages/opencode/src/kiloclaw/tooling/native/file-adapter.ts` | to-create |
| git_ops | `NativeGitAdapter` | `packages/opencode/src/kiloclaw/tooling/native/git-adapter.ts` | to-create |
| build_test_ops | `NativeBuildAdapter` | `packages/opencode/src/kiloclaw/tooling/native/build-adapter.ts` | to-create |
| web_research_ops | `NativeResearchAdapter` | `packages/opencode/src/kiloclaw/tooling/native/research-adapter.ts` | to-create |
| browser_ops | `NativeBrowserAdapter` | `packages/opencode/src/kiloclaw/tooling/native/browser-adapter.ts` | to-create |
| github_ops | `NativeGithubAdapter` | `packages/opencode/src/kiloclaw/tooling/native/github-adapter.ts` | to-create |
| memory_ops | `NativeMemoryAdapter` | `packages/opencode/src/kiloclaw/tooling/native/memory-adapter.ts` | to-create |
| visual_ops | `NativeVisualAdapter` | `packages/opencode/src/kiloclaw/tooling/native/visual-adapter.ts` | to-create |
| orchestration_ops | `NativeOrchestrationAdapter` | `packages/opencode/src/kiloclaw/tooling/native/orchestration-adapter.ts` | to-create |

### Definisci fallback policy deterministica

| Caso | Decisione |
|---|---|
| adapter nativo disponibile e sano | usa nativo |
| adapter nativo timeout/transient fail | retry nativo controllato, poi fallback MCP consentito |
| capability non implementata nativamente | fallback MCP consentito con ticket di debito tecnico |
| policy `DENY` | blocco hard, nessun fallback |
| operation con secret o distruttiva | fallback vietato |

### Applica la sequenza factory

1. Resolve capability richiesta dall intent.
2. Seleziona adapter nativo per capability.
3. Esegui probe salute adapter.
4. Route su nativo o fallback MCP secondo tabella policy.
5. Registra `route_reason`, `adapter_id`, `fallback_flag`, `policy_decision` in audit.

---

## Attiva auto-riparazione sicura

### Auto-trigger su malfunzionamenti

- Trigger automatici: `runtime.exception`, `build.fail`, `test.fail`, `policy.block`, `tool.contract.fail`.
- Routing automatico: intent `auto-repair` verso `agency-development` con correlation id, snapshot stato e limite workspace.
- Ciclo autonomo: detect -> classify -> plan -> patch -> verify -> decide -> close/rollback.

### Mantieni protocollo 3-strike

| Tentativo | Regola | Uscita |
|---|---|---|
| Strike 1 | fix minimo mirato | chiudi se passano test critici |
| Strike 2 | strategia alternativa | chiudi con evidenza differenziale |
| Strike 3 | revisione ipotesi + fallback confinato | se fallisce: stop write e incident report |
| Post 3 | blocco automatico | escalation umana obbligatoria |

### Vincola la sicurezza operativa

- Nessuna azione `DENY` viene eseguita in autonomia.
- Rollback automatico obbligatorio se verifiche post-fix falliscono.
- Tutte le azioni auto-riparazione emettono eventi telemetrici firmati e auditabili.

---

## Integra LLM wiki in modalita condizionata

### Mantieni la memoria 4-layer

| Layer | Ruolo | Persistenza |
|---|---|---|
| L1 sessione | contesto task corrente | volatile |
| L2 progetto | conoscenza operativa locale | persistente locale |
| L3 cross-progetto | pattern condivisi verificati | persistente controllata |
| L4 wiki compilata | sintesi citata con provenance | persistente governata |

### Condiziona l attivazione wiki

- Decisione: **CONDITIONAL-GO**, default `OFF` fino al completamento guardrail e parity gates.
- Capability wiki: `wiki.ingest`, `wiki.query`, `wiki.lint` sopra layer L1-L4 senza sostituzione stack memoria.
- Guardrail: provenance obbligatoria, conflict node obbligatorio, lint bloccante su conflitti high severity.

---

## Pianifica backlog file-level

### Aggiorna il core agency e routing

- `packages/opencode/src/kiloclaw/agency/bootstrap.ts`
- `packages/opencode/src/kiloclaw/agency/catalog.ts`
- `packages/opencode/src/kiloclaw/agency/agency-definitions.ts`
- `packages/opencode/src/kiloclaw/agency/routing/semantic/bootstrap.ts`
- `packages/opencode/src/kiloclaw/agency/routing/semantic/semantic-router.ts`
- `packages/opencode/src/kiloclaw/agency/routing/semantic/hybrid-router.ts`
- `packages/opencode/src/kiloclaw/agency/routing/semantic/utils.ts`

### Implementa factory e policy runtime

- `packages/opencode/src/kiloclaw/tooling/native/factory.ts` (to-create)
- `packages/opencode/src/kiloclaw/tooling/native/fallback-policy.ts` (to-create)
- `packages/opencode/src/kiloclaw/tooling/native/capability-registry.ts` (to-create)
- `packages/opencode/src/kiloclaw/orchestrator.ts`
- `packages/opencode/src/kiloclaw/policy/engine.ts`
- `packages/opencode/src/kiloclaw/policy/rules.ts`
- `packages/opencode/src/kiloclaw/runtime/auto-repair.ts` (to-create)
- `packages/opencode/src/kiloclaw/runtime/error-taxonomy.ts` (to-create)

### Integra memoria e wiki

- `packages/opencode/src/kiloclaw/memory/memory.broker.v2.ts`
- `packages/opencode/src/kiloclaw/memory/memory.repository.ts`
- `packages/opencode/src/kiloclaw/memory/memory.graph.ts`
- `packages/opencode/src/kiloclaw/memory/plugin.ts`
- `packages/opencode/src/kiloclaw/config/wiki.flags.ts` (to-create)

### Estendi telemetria e reportistica

- `packages/opencode/src/kiloclaw/telemetry/runtime-repair.metrics.ts` (to-create)
- `packages/opencode/src/kiloclaw/telemetry/parity.metrics.ts` (to-create)
- `packages/opencode/src/kiloclaw/telemetry/fallback.metrics.ts` (to-create)

---

## Esegui migrazione a ondate complete

### Onda 0 - Congela baseline

- Scope: freeze benchmark `kilo_kit`, catalogo completo agent/skill/tool, definizione contratti `C1..C7`.
- Copertura: 100% inventario in stato `mapped`.
- Gate accettazione: dataset baseline versionato, comparator pronto, nessuna riga inventario senza owner.

### Onda 1 - Migra orchestrazione e core sviluppo

- Agenti: `general-manager`, `system-analyst`, `architect`, `coder`, `qa`.
- Skill: `systematic-debugging`, `test-driven-development`, `verification-before-completion`, `planning-with-files`, `executing-plans`, `writing-plans`, `subagent-driven-development`, `multi-agent-orchestration`, `dispatching-parallel-agents`.
- Gate accettazione: parity >= 99% su suite core e zero regressioni P0/P1.

### Onda 2 - Migra sicurezza, ops e revisione

- Agenti: `devops`, `security-engineer`.
- Skill: `security-audit`, `code-review-discipline`, `requesting-code-review`, `receiving-code-review`, `finishing-a-development-branch`, `using-git-worktrees`, `anti-patterns`, `yagni-enforcement`.
- Gate accettazione: contratti `C3`, `C4`, `C7` verdi al 100%.

### Onda 3 - Migra dominio frontend, data e ML

- Agenti: `frontend-specialist`, `data-engineer`, `ml-engineer`, `qlora-expert`.
- Skill: `performance-optimization`, `database-design`, `api-development`, `visual-companion`, `spec-driven-development`.
- Gate accettazione: parity >= 99% su task specialistici e SLO latenza entro budget.

### Onda 4 - Migra ricerca e memoria avanzata

- Agenti: consolidamento `system-analyst` su ricerca estesa.
- Skill: `deep-research`, `tavily-research`, `context-engineering`, `knowledge-graph-memory`, `using-superpowers`, `writing-skills`, `brainstorming`.
- Gate accettazione: coverage citazioni >= 95%, parita funzionale >= 99%, fallback MCP sotto soglia.

### Onda 5 - Chiudi parity e dismetti dipendenze MCP non necessarie

- Scope: hardening finale, riduzione fallback residui, promozione wiki condizionata.
- Copertura: tutte le skill e tutti gli agenti in stato `parity-certified`.
- Gate accettazione: KPI globali rispettati per 14 giorni continuativi.

---

## Misura feature parity e validazione

### Fissa KPI obbligatori

| KPI | Formula | Target |
|---|---|---:|
| Global feature parity | `capability_passed / capability_total` | >= 99.0% |
| Agent parity | `agent_scenari_passed / agent_scenari_total` | >= 99.0% |
| Skill parity | `skill_scenari_passed / skill_scenari_total` | >= 99.0% |
| Native execution ratio | `native_calls / total_calls` | >= 90.0% |
| MCP fallback ratio | `mcp_fallback_calls / total_calls` | <= 10.0% |
| Auto-repair success | `auto_repair_closed / auto_repair_triggered` | >= 70.0% |
| P0/P1 regression | conteggio regressioni critiche | 0 |

### Valida contro baseline `kilo_kit`

- Metodo principale: dual-run comparativo con diff semantico e diff strutturale per ogni scenario.
- Metodo secondario: replay incidenti storici e task complessi multi-agente con scoring cieco.
- Criterio finale: `pass` solo se tutti i contratti compatibilita passano e KPI restano in soglia per due cicli consecutivi.

---

## Verifica test e qualita

### Esegui la suite obbligatoria

| Tipo | File | Criterio |
|---|---|---|
| Unit routing/policy | `packages/opencode/test/kiloclaw/semantic-router.test.ts` | pass totale |
| Unit hybrid/fallback | `packages/opencode/test/kiloclaw/hybrid-router.test.ts` | pass totale |
| Runtime regression | `packages/opencode/test/kiloclaw/runtime.test.ts` | pass totale |
| Tool policy | `packages/opencode/test/session/tool-policy.test.ts` | pass totale |
| Auto-repair | `packages/opencode/test/kiloclaw/auto-repair.test.ts` (to-create) | 3-strike conforme |
| Factory adapter | `packages/opencode/test/kiloclaw/native-factory.test.ts` (to-create) | routing deterministico |
| Compatibility harness | `packages/opencode/test/kiloclaw/kilo-kit-parity.test.ts` (to-create) | parity >= 99% |
| Wiki guardrail | `packages/opencode/test/kiloclaw/wiki-capabilities.test.ts` (to-create) | provenance + conflict policy |
| Security fallback | `packages/opencode/test/kiloclaw/security-mcp-fallback.test.ts` (to-create) | nessun bypass deny |

---

## Esegui rollout controllato

### Applica le fasi di rilascio

| Fase | Traffico | Obiettivo | Exit |
|---|---:|---|---|
| Shadow | 100% mirror, 0% write reale | confrontare decisioni runtime | delta errori <= 5% |
| Canary | 5-10% sessioni | validare stabilita e KPI | 72h in soglia |
| Graduale | 25% -> 50% -> 100% | estendere copertura | nessun allarme critico |
| Rollback drill | simulazione completa | verificare recupero | recovery <= 5 min |

### Mantieni runbook operativo

- Runbook principale: `docs/agencies/runbooks/AGENCY_DEVELOPMENT_FULL_MIGRATION_RUNBOOK_2026-04-12.md` (to-create).
- Runbook incidenti auto-repair: `docs/agencies/runbooks/AGENCY_DEVELOPMENT_AUTO_REPAIR_RUNBOOK_2026-04-12.md`.
- Rollback documentato per ogni ondata con trigger, owner e comando operativo.

---

## Gestisci rischi e mitigazioni

| Rischio | Prob. | Impatto | Mitigazione |
|---|---|---|---|
| Parity sotto 99% su skill complesse | media | alto | blocco gate, hardening dedicato, estensione test |
| Eccesso fallback MCP | media | alto | cap fallback, alerting, piano adapter accelerato |
| Divergenza comportamento agenti specialistici | media | alto | contratti C1/C2 per agente, replay task storici |
| Auto-repair regressivo | media | alto | 3-strike, rollback automatico, stop write post-fail |
| Drift wiki layer L4 | media | medio-alto | lint bloccante, conflict nodes, governance provenance |
| Bypass policy edge-case | bassa | alto | security suite continua, deny-by-default hard checks |

---

## Chiudi definizione di done

- Tutti i gate `G1..G6` sono in stato GO con evidenze tracciate.
- Tutti gli agenti/subagenti `kilo_kit` e tutte le skill risultano migrate e `parity-certified`.
- KPI globali rispettati con `Global feature parity >= 99%` e regressioni critiche pari a zero.
- Architettura intent->agency->agent->skill->tool e protocollo di fallback sono in produzione con audit completo.
- Auto-trigger su malfunzionamenti e auto-riparazione sicura sono attivi e verificati in canary e graduale.
- Integrazione LLM Wiki resta condizionata e conforme al modello memoria 4-layer.

---

## Cita riferimenti

### Fonti locali

- `docs/agencies/plans/KILOCLAW_AGENCY_IMPLEMENTATION_PROTOCOL_V1_2026-04-09.md`
- `docs/agencies/plans/KILOCLAW_FIRST_4_AGENCIES_IMPLEMENTATION_PLAN_2026-04-09.md`
- `docs/analysis/KILOCLAW_LLM_WIKI_INTEGRATION_ANALYSIS_2026-04-12.md`
- `packages/opencode/src/kiloclaw/agency/bootstrap.ts`
- `packages/opencode/src/kiloclaw/agency/catalog.ts`
- `packages/opencode/src/kiloclaw/agency/agency-definitions.ts`
- `packages/opencode/src/kiloclaw/agency/routing/semantic/bootstrap.ts`
- `packages/opencode/src/kiloclaw/agency/routing/semantic/semantic-router.ts`
- `packages/opencode/src/kiloclaw/agency/routing/semantic/hybrid-router.ts`
- `packages/opencode/src/kiloclaw/orchestrator.ts`

### Fonti esterne

- `https://github.com/fulvian/kilo_kit`
- `https://github.com/fulvian/kilo_kit/tree/main/agents`
- `https://github.com/fulvian/kilo_kit/tree/main/skills`
- `https://github.com/fulvian/kilo_kit/blob/main/MCP_ANALYSIS_REPORT.md`
- `https://modelcontextprotocol.io/docs/tutorials/security/security_best_practices`
- `https://sre.google/sre-book/reliable-product-launches/`
- `https://sre.google/sre-book/emergency-response/`
- `https://genai.owasp.org/llm-top-10/`

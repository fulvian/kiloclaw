# Routing dinamico

Piano operativo SOTA 2026 per bootstrap lazy.

---

## Definisci sintesi esecutiva

Obiettivo: migrare Kiloclaw da bootstrap monolitico eager a architettura dinamica multi-livello con caricamento lazy, routing spiegabile e contratti versionati.

Il piano riduce latenza iniziale, evita coupling rigido tra moduli e rende verificabile ogni decisione di routing da Layer 0 a Layer 3.

---

## Conferma stato verificato

Le verifiche già eseguite sono usate come baseline e non vanno ripetute prima di P0.

| Area | Evidenza verificata | Stato |
|---|---|---|
| Typecheck `packages/opencode` | `bun run --cwd packages/opencode typecheck` | ✅ pass |
| Test agency | `bun run --cwd packages/opencode test test/kiloclaw/agency/` | ✅ 164 pass |
| Reachability arXiv | HTTP 200 + entry presente | ✅ |
| Reachability PubMed | HTTP 200 + id list presente | ✅ |
| Reachability CrossRef | HTTP 200 + items presenti | ✅ |
| Reachability DDG | HTTP 200 | ✅ |
| Circular deps scan | `bun x madge packages/opencode/src/kiloclaw --extensions ts --circular` | ⚠️ 4 cicli |

Cicli rilevati: `agency.ts > agent.ts`, `types.ts > agency/registry/types.ts`, `memory.adapter.ts > orchestrator.ts`, `memory/index.ts > memory/memory.backfill.ts`.

---

## Analizza gap contro blueprint 1-10

Blueprint target (1-10) per il passaggio a dinamico multi-livello.

| # | Criterio blueprint | Stato attuale | Gap concreto | Azione piano |
|---|---|---|---|---|
| 1 | Routing per livelli separati | Routing misto in `orchestrator.ts` | Confini L0-L3 non espliciti | Introdurre pipeline `routing/pipeline.ts` |
| 2 | Registri lazy | `bootstrapRegistries()` eager globale | Carico upfront non necessario | Lazy loader per agency/skill/agent/tool |
| 3 | Discovery a manifest | Definizioni hardcoded sparse | Nessun indice unico versionato | Manifest JSON/TS con digest + compat |
| 4 | Cache ibrida | Solo stato runtime in memoria | Warm-up non persistente | Hot cache in-memory + cold manifest |
| 5 | Context isolato per agency | Context costruito per dominio | Rischio leakage cross-agency | Finestre contestuali agency-scoped |
| 6 | Contratti compatibilità | Tipi presenti ma non negoziati | Upgrade non governato | `apiVersion`, `capVersion`, `schemaVersion` |
| 7 | Policy routing corretta | Bug: policy check usa `domain` | Deny list agenzia bypassabile | Passare `agencyId` a `CapabilityRouter` |
| 8 | Dipendenze acicliche | 4 cicli attivi | Fragilità refactor/testing | Inversione dipendenze + boundary modules |
| 9 | Osservabilità livelli | Log parziali e non uniformi | Debug root-cause lento | Eventi strutturati L0-L3 con correlation id |
| 10 | Rollout sicuro | Flag parziali ma non end-to-end | Rischio regressioni nascoste | Shadow mode + canary + rollback rapido |

---

## Progetta architettura target 2026

### Definisci livelli

- **Layer 0 (agency routing):** classifica intento, risolve `agencyId`, applica policy agenzia.
- **Layer 1 (skill discovery):** trova skill candidate da manifest e capability graph.
- **Layer 2 (agent selection):** seleziona agente per capability, limiti e health.
- **Layer 3 (tool resolution):** risolve tool con policy, budget e fallback.

### Adotta registri lazy

- Caricare registri solo al primo accesso per agency/skill/agent/tool.
- Evitare bootstrap globale in `CoreOrchestrator.create()`.

### Introduci discovery a manifest

- Manifest versionato per agency/skill/agent/tool in `packages/opencode/src/kiloclaw/agency/manifests/`.
- Ogni record include `id`, `version`, `compat`, `capabilities`, `policies`, `hash`.

### Combina hot-cache e cold-manifest

- **Hot-cache:** mappe in memoria con TTL breve per routing ad alta frequenza.
- **Cold-manifest:** fonte di verità su disco per restart e invalidazione coerente.

### Isola finestre contestuali per agenzia

- Creare envelope context per agency con token budget e provenance.
- Bloccare iniezione cross-agency salvo regola esplicita `allowCrossAgency`.

### Versiona contratti e compatibilità

- Contratti minimi: `routingSchemaVersion`, `manifestVersion`, `capabilityContractVersion`.
- Strategia compat: minor forward-compatible, major con migration guard.

### Correggi bug di policy routing

In `packages/opencode/src/kiloclaw/orchestrator.ts`, `CapabilityRouter.routeTask(taskIntent, routingResult.matchedDomain)` deve diventare `CapabilityRouter.routeTask(taskIntent, agencyId)`.

Questo riallinea il policy check con `AgencyRegistry.getDeniedCapabilities(agency)` in `packages/opencode/src/kiloclaw/agency/routing/capability-router.ts`.

---

## Pianifica roadmap P0-P3

### P0 Stabilizza e misura (1 sprint)

**Obiettivo:** fissare bug policy, introdurre telemetria di base, congelare baseline.

**Task principali**
- Correggere passaggio `agencyId` in `orchestrator.ts`.
- Aggiungere eventi `routing.layer0.decision`, `routing.policy.denied`, `routing.fallback.used`.
- Creare flag: `KILO_ROUTING_DYNAMIC_ENABLED=false`, `KILO_ROUTING_SHADOW_ENABLED=true`.

**Impatto file (`src`)**
- `packages/opencode/src/kiloclaw/orchestrator.ts`
- `packages/opencode/src/kiloclaw/agency/routing/capability-router.ts`
- `packages/opencode/src/kiloclaw/telemetry/index.ts`
- `packages/opencode/src/kiloclaw/service-health.ts`

**Impatto file (`test`)**
- `packages/opencode/test/kiloclaw/agency/routing/capability-router.test.ts`
- `packages/opencode/test/kiloclaw/smoke-routing-memory.test.ts`
- `packages/opencode/test/kiloclaw/policy.test.ts`

### P1 Introduci runtime dinamico L0-L1 (2 sprint)

**Obiettivo:** separare Layer 0 e Layer 1 con registri lazy e manifest discovery.

**Task principali**
- Aggiungere `routing/pipeline.ts` con step L0 e L1.
- Creare `agency/manifest-loader.ts` + indice manifest.
- Convertire bootstrap eager in init lazy per registri.

**Impatto file (`src`)**
- `packages/opencode/src/kiloclaw/agency/bootstrap.ts`
- `packages/opencode/src/kiloclaw/agency/registry/index.ts`
- `packages/opencode/src/kiloclaw/agency/registry/agency-registry.ts`
- `packages/opencode/src/kiloclaw/agency/registry/skill-registry.ts`
- `packages/opencode/src/kiloclaw/agency/routing/intent-classifier.ts`
- `packages/opencode/src/kiloclaw/agency/routing/chain-composer.ts`
- `packages/opencode/src/kiloclaw/agency/catalog.ts`
- `packages/opencode/src/kiloclaw/agency/manifests/*.json` (nuovi)

**Impatto file (`test`)**
- `packages/opencode/test/kiloclaw/agency/registry/agency-registry.test.ts`
- `packages/opencode/test/kiloclaw/agency/registry/skill-registry.test.ts`
- `packages/opencode/test/kiloclaw/agency/routing/intent-classifier.test.ts`
- `packages/opencode/test/kiloclaw/runtime.test.ts`

### P2 Completa L2-L3 e policy contestuale (2 sprint)

**Obiettivo:** selezione agente e tool resolution con contratti versionati e budget.

**Task principali**
- Introdurre selettore agenti con health e limiti runtime.
- Introdurre resolver tool con deny/allow list agency-scoped.
- Agganciare context windows per agency con policy di injection.

**Impatto file (`src`)**
- `packages/opencode/src/kiloclaw/agency/routing/capability-router.ts`
- `packages/opencode/src/kiloclaw/agency/registry/agent-registry.ts`
- `packages/opencode/src/kiloclaw/agency/factory.ts`
- `packages/opencode/src/kiloclaw/agency/types.ts`
- `packages/opencode/src/kiloclaw/memory/memory.injection-policy.ts`
- `packages/opencode/src/kiloclaw/memory/plugin.ts`

**Impatto file (`test`)**
- `packages/opencode/test/kiloclaw/agency/registry/agent-registry.test.ts`
- `packages/opencode/test/kiloclaw/agency/routing/chain-composer.test.ts`
- `packages/opencode/test/kiloclaw/guardrail.test.ts`
- `packages/opencode/test/kiloclaw/safety.test.ts`

### P3 Hardening e rollout progressivo (1-2 sprint)

**Obiettivo:** performance, resilienza, canary e go-live.

**Task principali**
- Attivare shadow mode comparativo vecchio vs nuovo routing.
- Ottimizzare cache TTL/LRU e fallback degradato.
- Eseguire canary per percentuali crescenti di traffico.

**Impatto file (`src`)**
- `packages/opencode/src/kiloclaw/orchestrator.ts`
- `packages/opencode/src/kiloclaw/telemetry/index.ts`
- `packages/opencode/src/kiloclaw/service-health.ts`
- `packages/opencode/src/kiloclaw/config.ts`

**Impatto file (`test`)**
- `packages/opencode/test/kiloclaw/benchmark.test.ts`
- `packages/opencode/test/kiloclaw/eval-deterministic.test.ts`
- `packages/opencode/test/kiloclaw/memory-production-integration.test.ts`

---

## Rimuovi dipendenze circolari

### Ciclo 1: `agency.ts > agent.ts`

**Causa probabile:** `agent.ts` importa tipi da `agency.ts` e `agency.ts` importa `Agent` da `agent.ts`.

**Rimedio:** estrarre tipi condivisi (`Task`, `ExecutionContext`, `ExecutionResult`) in `packages/opencode/src/kiloclaw/agency/contracts.ts` e fare import unidirezionale da entrambi.

### Ciclo 2: `types.ts > agency/registry/types.ts`

**Causa probabile:** `types.ts` re-exporta da registry e registry dipende da `types.ts`.

**Rimedio:** creare `packages/opencode/src/kiloclaw/types.base.ts` senza re-export registry, poi `types.ts` diventa facade senza dipendenze inverse.

### Ciclo 3: `memory.adapter.ts > orchestrator.ts`

**Causa probabile:** adapter e orchestrator si referenziano per memoria/orchestrazione.

**Rimedio:** introdurre interfaccia neutra `orchestrator.contract.ts` e injection di dipendenza dal bootstrap esterno.

### Ciclo 4: `memory/index.ts > memory/memory.backfill.ts`

**Causa probabile:** barrel `index.ts` importa backfill che reimporta moduli dal barrel.

**Rimedio:** eliminare import dal barrel in moduli interni, usare import diretti e mantenere barrel solo per entrypoint esterni.

### Regole di sicurezza refactor

- Un ciclo rimosso per volta con test verdi ad ogni step.
- Bloccare nuove cicliche in CI con `madge --circular` come check obbligatorio.

---

## Definisci strategia test completa

### Copri unit

| Test proposto | File | Dimostra |
|---|---|---|
| `routes_with_agency_id_for_policy_check` | `packages/opencode/test/kiloclaw/agency/routing/capability-router.test.ts` | Bug fix dominio→agencyId corretto |
| `denied_capability_blocks_route_for_agency` | stesso file | Enforcement policy per agenzia |
| `manifest_loader_rejects_incompatible_version` | `packages/opencode/test/kiloclaw/runtime.test.ts` | Guard compatibilità contratti |
| `lazy_registry_loads_on_first_access_only` | `packages/opencode/test/kiloclaw/agency/registry/agency-registry.test.ts` | Lazy init reale |

### Copri integration

| Test proposto | File | Dimostra |
|---|---|---|
| `pipeline_layer0_to_layer3_resolves_consistent_target` | `packages/opencode/test/kiloclaw/smoke-routing-memory.test.ts` | Coerenza end-to-end routing |
| `shadow_mode_emits_diff_without_user_impact` | `packages/opencode/test/kiloclaw/eval-deterministic.test.ts` | Shadow comparativo sicuro |
| `agency_scoped_context_blocks_cross_injection` | `packages/opencode/test/kiloclaw/memory-injection-policy.test.ts` | Isolamento contesto |

### Copri E2E e regressione

| Test proposto | File | Dimostra |
|---|---|---|
| `e2e_knowledge_query_uses_manifest_skill_then_agent` | `packages/opencode/test/kiloclaw/memory-production-integration.test.ts` | Percorso reale su stack dinamico |
| `regression_legacy_router_matches_previous_assignment_threshold` | `packages/opencode/test/kiloclaw/benchmark.test.ts` | Compatibilità funzionale |

### Copri performance e carico

| Test proposto | File | Dimostra |
|---|---|---|
| `perf_cold_start_registry_under_120ms` | `packages/opencode/test/kiloclaw/benchmark.test.ts` | Miglioramento bootstrap |
| `load_200_rps_routing_p95_under_35ms` | `packages/opencode/test/kiloclaw/benchmark.test.ts` | Scalabilità L0-L3 |
| `cache_hit_ratio_above_85_percent_in_hot_path` | `packages/opencode/test/kiloclaw/benchmark.test.ts` | Efficacia cache ibrida |

---

## Fissa target prestazionali

Target quantitativi da validare in P3 su hardware CI standard.

| KPI | Baseline stimata | Target go-live |
|---|---|---|
| Startup orchestrator (cold) | ~250-400 ms | ≤ 150 ms |
| Routing p95 (L0-L3) | ~45-70 ms | ≤ 35 ms |
| Routing p99 (L0-L3) | ~90-130 ms | ≤ 70 ms |
| Manifest load cold | N/A | ≤ 120 ms |
| Cache hit hot path | N/A | ≥ 85% |
| Error budget routing | N/A | < 0.5% 5xx equivalenti |
| Drift assegnazione vs legacy | N/A | ≤ 2% fuori tolleranza |

---

## Gestisci rischi e mitigazioni

| Rischio | Impatto | Mitigazione |
|---|---|---|
| Regressione assegnazione agency | Alto | Shadow mode + diff reporter + soglia stop |
| Manifest incoerenti tra versioni | Alto | Validazione schema + hash + fail closed |
| Latenza extra da policy layering | Medio | Cache LRU + precompute capability index |
| Nuovi cicli durante refactor | Medio | Check CI `madge --circular` su PR |
| Telemetria insufficiente in canary | Medio | Eventi obbligatori per ogni layer |
| Rollout troppo rapido | Alto | Ramp-up a step con gate automatici |

---

## Esegui rollout progressivo

### Usa feature flag

- `KILO_ROUTING_DYNAMIC_ENABLED`
- `KILO_ROUTING_SHADOW_ENABLED`
- `KILO_ROUTING_MANIFEST_ENABLED`
- `KILO_ROUTING_AGENCY_CONTEXT_ENABLED`

### Applica sequenza canary

1. **Stage 0% user-facing / 100% shadow**: confronto output nuovo vs legacy.
2. **Canary 5%**: traffico reale limitato con auto-rollback su SLO breach.
3. **Canary 25%**: attivare monitor p95/p99 e denied policy correctness.
4. **Canary 50%**: bloccare merge non essenziali e monitorare 24h.
5. **GA 100%**: mantenere legacy path per 1 release come fallback.

### Definisci observability minima

- Dashboard per `routing.layer.latency`, `routing.decision`, `policy.denied`, `fallback.rate`.
- Alert su `fallback.rate > 3%` per 10 minuti o `policy.denied mismatch > 0`.

---

## Prepara rollback rapido

Rollback in meno di 5 minuti senza migrazioni distruttive.

**Procedura**
- Disattivare `KILO_ROUTING_DYNAMIC_ENABLED`.
- Mantenere `KILO_ROUTING_SHADOW_ENABLED` per analisi post-incidente.
- Ripristinare path legacy in `orchestrator.ts` senza revert completo del branch.
- Se necessario, revert PR sequenziale a partire da P3→P0.

**Precondizioni**
- Nessuna modifica irreversibile di storage condiviso nel path nuovo.
- Manifest backward-compatible o ignorabili a flag spento.

---

## Chiudi con done e checklist

### Definisci definition of done

- Bug `domain` vs `agencyId` risolto con test dedicato verde.
- 4 cicli madge eliminati e check CI permanente.
- Routing dinamico L0-L3 attivo dietro flag e validato in shadow.
- KPI prestazionali rispettati per 3 run consecutive in CI e 24h canary.
- Documentazione aggiornata in `docs/architecture` e `docs/release`.

### Esegui checklist go-live

- [ ] Typecheck `packages/opencode` verde.
- [ ] Test mirati `test/kiloclaw/agency/` verdi.
- [ ] Test regressione routing verdi.
- [ ] Test perf/load verdi sui target.
- [ ] Dashboard e alert attivi.
- [ ] Flag e playbook rollback verificati.
- [ ] Report canary firmato con evidenze.

---

## Suddividi PR in modo sicuro

1. **PR-1 (bugfix policy routing):** fix `agencyId` + test unit mirato.
2. **PR-2 (telemetria e shadow):** eventi L0-L3 + flag shadow.
3. **PR-3 (lazy registries):** refactor bootstrap e registry load-on-demand.
4. **PR-4 (manifest discovery):** loader, schema, validazione compat.
5. **PR-5 (pipeline L0-L1):** orchestrazione livelli iniziali.
6. **PR-6 (pipeline L2-L3):** selezione agent/tool e policy context.
7. **PR-7 (circular remediation A/B):** cicli 1 e 2.
8. **PR-8 (circular remediation C/D):** cicli 3 e 4.
9. **PR-9 (perf hardening):** cache tuning, benchmark, SLO checks.
10. **PR-10 (rollout docs):** playbook, checklist, note rilascio.

Ogni PR deve restare piccola, con scope unico e prova verificabile in test o metrica.

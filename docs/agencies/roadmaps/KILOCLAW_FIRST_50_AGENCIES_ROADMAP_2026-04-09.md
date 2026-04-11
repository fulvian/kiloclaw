# Kiloclaw Roadmap - Prime 50 Agencies

Roadmap strategica e operativa per popolare l'universo agencies di Kiloclaw in modo capillare, verificabile e governato.

Riferimenti obbligatori:
- `docs/foundation/KILOCLAW_BLUEPRINT.md`
- `docs/guide/KILOCLAW_AGENCY_AGENT_SKILL_TOOL_IMPLEMENTATION_GUIDE_2026-04-07.md`

Data: 2026-04-09
Owner: Core Orchestrator / Agency Platform

---

## 1) Obiettivo della roadmap

Costruire le prime 50 agencies come "sistema nervoso" di Kiloclaw, coprendo:
- scibile umano ad alto impatto pratico (knowledge, science, legal, health, finance, education, operations)
- capacita operative concrete su internet e PC (ricerca, automazione browser, file ops, sviluppo, integrazioni)
- governance enterprise-grade (policy-first, audit, HITL, least privilege)

Esito atteso: un ecosistema modulare in cui ogni agency e indipendente per policy e audit trail, ma interoperabile via CapabilityRouter e SkillChain.

---

## 2) Criteri di priorita

1. **Utilita trasversale immediata**: prima le agencies con valore orizzontale (development, knowledge, productivity, security, data).
2. **Rischio controllabile**: domini high-risk (medical, legal, finance) entrano con gate HITL e capability ridotte.
3. **Copertura capillare**: bilanciamento tra domini professionali, personali, scientifici e operativi.
4. **Prontezza toolchain**: si priorizzano agency supportate dai tool gia disponibili nel runtime.
5. **Evidenza e verificabilita**: ogni agency deve produrre output tracciabili a fonti/log/artefatti.

---

## 3) Blueprint operativo per ogni agency

Ogni agency deve nascere con il seguente pacchetto minimo:
- `agency manifest` (id stabile, domain, policy, provider catalog)
- `2-4 agent` iniziali capability-based
- `8-20 skill` versionate con schema I/O esplicito
- `tool policy` deny-by-default con allowlist capability-driven
- `test suite` (unit + integration + regression + telemetry contract)
- `audit profile` (eventi L0-L3, fallback chain, tools denied)

---

## 4) Le prime 50 agencies

Legenda:
- **Wave**: ordine di implementazione (W1..W5)
- **Risk**: Low / Medium / High (con HITL obbligatorio per High)

| # | Agency ID | Missione | Capability tags iniziali | Wave | Risk |
|---|---|---|---|---|---|
| 1 | `agency-development` | Coding, refactor, test, delivery | `code-generation`, `code-review`, `testing`, `debugging` | W1 | Medium |
| 2 | `agency-knowledge` | Ricerca, sintesi, grounding, fact-check | `search`, `verification`, `summarization`, `citation` | W1 | Medium |
| 3 | `agency-productivity` | Planning personale/team, routine, scheduling | `planning`, `scheduling`, `prioritization`, `tracking` | W1 | Low |
| 4 | `agency-personal` | Life ops personale e benessere quotidiano | `life-ops`, `habit-support`, `decision-support` | W1 | Medium |
| 5 | `agency-analytics` | Insight dati, forecasting, reporting | `data-analysis`, `forecasting`, `dashboarding` | W1 | Medium |
| 6 | `agency-pc-automation` | Automazione operativa locale su PC | `file-ops`, `workflow-automation`, `local-execution` | W1 | High |
| 7 | `agency-web-automation` | Automazione web/browsing orientata task | `web-navigation`, `form-automation`, `web-extraction` | W1 | High |
| 8 | `agency-devops` | CI/CD, ambienti, rilascio e reliability | `deployment`, `ci-cd`, `infra-ops`, `runbook` | W1 | High |
| 9 | `agency-data-engineering` | ETL/ELT, pipeline, data quality | `ingestion`, `transformation`, `data-quality` | W1 | Medium |
| 10 | `agency-security` | Security posture, hardening, secure-by-default | `threat-modeling`, `hardening`, `security-audit` | W1 | High |
| 11 | `agency-finance` | Finanza personale/business e cash planning | `budgeting`, `cashflow-analysis`, `cost-optimization` | W2 | High |
| 12 | `agency-legal` | Legal ops, contratti, policy legal check | `contract-analysis`, `legal-research`, `risk-flagging` | W2 | High |
| 13 | `agency-healthcare` | Supporto health literacy e patient ops | `clinical-info-search`, `care-planning-support` | W2 | High |
| 14 | `agency-education` | Percorsi di studio e tutoring adattivo | `curriculum-design`, `tutoring`, `assessment` | W2 | Medium |
| 15 | `agency-research-science` | Workflow di ricerca scientifica | `literature-review`, `hypothesis-mapping`, `evidence-synthesis` | W2 | Medium |
| 16 | `agency-creative` | Ideazione contenuti e concept generation | `brainstorming`, `story-structuring`, `creative-iteration` | W2 | Low |
| 17 | `agency-design-ux` | UX research, IA, prototipazione e copy UX | `ux-research`, `wireframing`, `interaction-design` | W2 | Medium |
| 18 | `agency-media-production` | Pipeline contenuti media multi-formato | `scriptwriting`, `asset-planning`, `publishing-workflow` | W2 | Medium |
| 19 | `agency-marketing-growth` | Growth loops, campagne, esperimenti | `campaign-design`, `seo-research`, `conversion-optimization` | W2 | Medium |
| 20 | `agency-sales-revops` | Sales enablement, pipeline e revops | `lead-qualification`, `pipeline-ops`, `proposal-automation` | W2 | Medium |
| 21 | `agency-customer-support` | Support ops, knowledge base, triage ticket | `ticket-triage`, `kb-maintenance`, `response-drafting` | W3 | Medium |
| 22 | `agency-hr-talent` | Recruiting, onboarding, performance ops | `talent-sourcing`, `interview-ops`, `people-analytics` | W3 | High |
| 23 | `agency-procurement` | Sourcing, vendor compare, acquisti | `vendor-evaluation`, `rfq-automation`, `cost-comparison` | W3 | Medium |
| 24 | `agency-operations-supply-chain` | Ops processuali e supply planning | `demand-planning`, `inventory-ops`, `process-optimization` | W3 | Medium |
| 25 | `agency-project-program` | PM/PGM execution e governance delivery | `roadmapping`, `risk-tracking`, `milestone-control` | W3 | Low |
| 26 | `agency-compliance-risk` | GRC, controlli e conformita operativa | `control-mapping`, `risk-register`, `audit-prep` | W3 | High |
| 27 | `agency-privacy-dpo` | Privacy ops, DPIA, data minimization | `privacy-assessment`, `data-mapping`, `retention-governance` | W3 | High |
| 28 | `agency-threat-intel` | Threat intelligence e monitoring esterno | `threat-monitoring`, `ioc-tracking`, `intel-synthesis` | W3 | High |
| 29 | `agency-incident-response` | Triage incidenti e playbook response | `incident-triage`, `timeline-reconstruction`, `postmortem` | W3 | High |
| 30 | `agency-quality-assurance` | QA funzionale, regression e test strategy | `test-design`, `regression-analysis`, `quality-gates` | W3 | Medium |
| 31 | `agency-iot-smarthome` | Automazioni ambienti smart e device orchestration | `device-automation`, `rule-orchestration`, `home-ops` | W4 | High |
| 32 | `agency-travel-mobility` | Pianificazione viaggi e mobilita operativa | `itinerary-planning`, `booking-analysis`, `mobility-optimization` | W4 | Medium |
| 33 | `agency-real-estate` | Ricerca immobili, diligence e gestione asset | `listing-analysis`, `valuation-support`, `document-check` | W4 | High |
| 34 | `agency-energy-sustainability` | Efficienza energetica e sostenibilita operativa | `energy-audit`, `efficiency-planning`, `impact-tracking` | W4 | Medium |
| 35 | `agency-agriculture-food` | Agro-data, coltivazioni, filiera alimentare | `crop-planning`, `agri-advisory`, `food-supply-analysis` | W4 | Medium |
| 36 | `agency-climate-environment` | Impatti clima, scenari e adattamento | `climate-risk-analysis`, `environmental-monitoring` | W4 | Medium |
| 37 | `agency-geospatial-mapping` | Analisi geospaziale e mapping decisionale | `map-analysis`, `location-intelligence`, `geo-visualization` | W4 | Medium |
| 38 | `agency-public-policy` | Policy analysis e impatto regolatorio | `policy-research`, `impact-assessment`, `stakeholder-mapping` | W4 | High |
| 39 | `agency-civic-services` | Servizi civici, pratiche e orientamento cittadino | `service-discovery`, `procedure-guidance`, `eligibility-check` | W4 | Medium |
| 40 | `agency-nonprofit-impact` | Program design e impatto sociale | `impact-modeling`, `grant-support`, `program-ops` | W4 | Medium |
| 41 | `agency-entrepreneurship-startup` | Venture building e startup ops | `idea-validation`, `go-to-market-planning`, `unit-economics` | W5 | Medium |
| 42 | `agency-manufacturing-industrial` | Processi industriali e manufacturing ops | `process-control`, `quality-monitoring`, `maintenance-planning` | W5 | High |
| 43 | `agency-biomedical-bioinformatics` | Bioinformatics e workflow biomedicali | `omics-analysis-support`, `protocol-assist`, `evidence-mapping` | W5 | High |
| 44 | `agency-chemistry-materials` | R&D materiali e chimica applicata | `materials-research`, `property-analysis`, `experiment-planning` | W5 | High |
| 45 | `agency-physics-engineering` | Simulazioni e problem solving ingegneristico | `modeling-support`, `numerical-analysis`, `design-assist` | W5 | Medium |
| 46 | `agency-language-localization` | Traduzione, localizzazione, QA linguistico | `translation`, `localization`, `terminology-management` | W5 | Low |
| 47 | `agency-negotiation-mediation` | Negoziazione, conflitti, mediazione | `negotiation-strategy`, `conflict-analysis`, `proposal-drafting` | W5 | Medium |
| 48 | `agency-learning-coach` | Coaching apprendimento continuo e upskilling | `skill-gap-analysis`, `learning-plan`, `practice-loop` | W5 | Low |
| 49 | `agency-family-caregiving` | Supporto caregiving e coordinamento familiare | `care-coordination`, `routine-management`, `resource-navigation` | W5 | High |
| 50 | `agency-meta-governance` | Governance cross-agency, quality e evoluzione | `policy-orchestration`, `registry-governance`, `drift-detection` | W5 | High |

---

## 5) Piano temporale di implementazione

### Wave 1 - Foundation Operativa (Agenzie 1-10)
Focus: core capability, automazione internet/PC, sviluppo e sicurezza di base.

Deliverable:
- bootstrap completo di 10 agencies con registry e policy isolate
- prime SkillChain cross-agency (`knowledge` <-> `development`, `security` <-> `devops`)
- baseline KPI e osservabilita L0-L3

### Wave 2 - Knowledge Economy (Agenzie 11-20)
Focus: domini professionali ad alta domanda (finance, legal, health, edu, growth).

Deliverable:
- HITL forte su `finance`, `legal`, `healthcare`
- fallback provider tracciato in metadata su tutte le skill di ricerca
- test anti-hallucination per decisioni a impatto utente

### Wave 3 - Enterprise Governance (Agenzie 21-30)
Focus: operations aziendali, compliance, privacy, incident response, QA.

Deliverable:
- catalogo playbook procedurali versionati (procedural memory)
- contract test su policy gate e blocco tool non autorizzati
- report consolidato di risk scoring per agency

### Wave 4 - World Ops (Agenzie 31-40)
Focus: domini fisici e istituzionali (IoT, travel, energy, climate, civic).

Deliverable:
- connettori esterni con least privilege e kill-switch dedicati
- policy geografiche/giurisdizionali per domini regolati
- estensione retrieval multi-layer per segnali ambientali/territoriali

### Wave 5 - Frontier Domains (Agenzie 41-50)
Focus: startup, industrial, bio, science avanzata, meta-governance.

Deliverable:
- framework di validazione scientifica rinforzata (evidence-first)
- maturity model v1.0 per tutte le 50 agencies
- governance adattiva anti-drift con audit comparativo tra release

---

## 6) Architettura dei primi archetipi agent per agency

Per accelerare lo scaling delle 50 agencies, ogni agency parte con 4 archetipi standard:
- `planner-agent`: decomposizione task, risk pre-check, chain composition
- `operator-agent`: esecuzione skill/tool con policy gate
- `validator-agent`: verifica evidenze, coerenza, compliance
- `reporter-agent`: output strutturato, audit metadata, memory writeback

Beneficio: pattern uniforme, test riusabili, onboarding rapido di nuove agencies.

---

## 7) Guardrail obbligatori per domini High Risk

Agenzie High Risk (es. legal, healthcare, finance, security, privacy, incident response, biomedical):
- `requiresApproval=true` per azioni irreversibili o ad alto impatto
- modalita "suggest then act" di default
- citazione fonti obbligatoria su output decisionali
- blocco hard di capability non consentite da policy di dominio
- registrazione `PolicyDeniedEvent` e `FallbackUsedEvent` obbligatoria

---

## 8) KPI di successo della roadmap

KPI tecnici:
- percentuale skill con schema I/O validato >= 98%
- test pass rate su suite policy/routing >= 95%
- p95 latenza routing L0-L3 entro budget definito per wave
- `toolsDenied` non attesi in trend decrescente per 3 release consecutive

KPI prodotto:
- task completion verificabile per agency >= 85%
- tasso output con evidenze/fonte >= 90% per agenzie knowledge-intensive
- riduzione interventi manuali in workflow ripetitivi >= 40%

KPI governance:
- 100% azioni high-impact con audit trail completo
- 0 bypass policy hard rilevati in canary/full rollout
- rollback readiness via feature flag disponibile per ogni nuova agency

---

## 9) Backlog tecnico minimo per avvio implementazione

1. Creare manifest stub per tutte le 50 agencies in registry versionato.
2. Definire capability taxonomy unica (naming, sinonimi, deprecazioni).
3. Generare template agent/skill/test per bootstrap rapido.
4. Predisporre dashboard telemetry dedicata a routing/policy/fallback.
5. Introdurre scorecard di maturita per agency (L1 -> L5).

---

## 10) Note di allineamento strategico

- Questa roadmap non replica rigidamente i cataloghi esterni citati; li usa come ispirazione per breadth e composability.
- L'obiettivo non e "piu agenzie possibili", ma "agenzie governabili, verificabili, evolvibili".
- Ogni wave termina con quality gate formale prima di passare alla successiva.

---

## 11) Definition of Ready per agenzia

Un'agenzia e pronta a entrare in implementazione solo se:
- domain e policy sono definiti e validati
- capability tags sono mappati su tool allowlist centrale
- esistono test minimi per deny-by-default e routing capability-based
- e definita la strategia HITL (se Medium/High risk)
- e previsto il piano di rollout (shadow -> canary -> full)

Con questa roadmap, Kiloclaw puo costruire un universo di 50 agencies ampio ma disciplinato, in grado di coprire concretamente internet + PC operations e una parte sostanziale dello scibile umano senza perdere controllo architetturale.

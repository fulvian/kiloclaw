# KILOCLAW_FIRST_50_AGENCIES_ROADMAP_V2_2026-04-09

Piano personal-assistant-first per vita e lavoro quotidiani.

---

## Definisci obiettivo

- Sposta il baricentro da coding automation a assistenza personale operativa, con priorita su tempo, attenzione e continuita giornaliera.
- Copri produttivita personale, coordinamento lavoro-vita, gestione comunicazioni e automazioni internet/PC come asse principale dei primi rilasci.
- Tratta sviluppo software come dominio secondario, utile ma non prioritario nelle prime ondate.

---

## Fissa principi

- Applica personal-first by default: ogni agency deve dimostrare valore nel quotidiano entro 7 giorni.
- Integra memoria multilayer (sessione, breve termine, lungo termine) per preferenze, contesti ricorrenti e follow-up.
- Usa skill crystallization per trasformare flussi ripetuti in playbook riusabili e versionati.
- Adotta risk levels SAFE, NOTIFY, CONFIRM, DENY come policy unificata di esecuzione.
- Mantieni least privilege, con scopes minimi, consenso esplicito e rotazione periodica dei token.
- Imposta read-only mode come default iniziale per nuove integrazioni e abilita scrittura solo dopo verifica.
- Applica HITL obbligatorio per invii, cancellazioni e azioni irreversibili o ad alto impatto.

---

## Classifica capability

- `daily-briefing`: sintesi mattutina, agenda, priorita, meteo, traffico e alert.
- `comms`: email, chat, messaggistica multicanale e follow-up.
- `schedule`: calendari personali, familiari e professionali con conflitti e ottimizzazione slot.
- `tasks`: cattura, triage, delega, reminder e chiusura task.
- `knowledge`: note, documenti, memoria personale e retrieval contestuale.
- `files`: ingest, tagging, ricerca, archiviazione e lifecycle documentale.
- `internet-pc-automation`: browser workflows, moduli, copie dati e routine desktop.
- `personal-crm`: relazioni, contatti, promemoria sociali e storico interazioni.
- `home-family`: spesa, casa, eventi, figli, appuntamenti familiari.
- `finance-admin`: bollette, abbonamenti, scadenze, riconciliazione personale.
- `health-care`: diario salute e aderenza routine con governance forte.
- `work-ops`: meeting notes to tasks, allineamenti, report operativi.
- `development`: coding, review e CI monitor come area non primaria.

---

## Progetta agency Google Workspace

- `agencyId`: `google-workspace-orchestrator`.
- Missione: rendere Gmail, Calendar, Drive e suite Workspace il sistema operativo personale per pianificazione, comunicazione e execution.
- Modalita iniziale: read-only globale, con onboarding per superficie e consenso granulare.

**Superfici e policy operative**

| Superficie | Uso principale | Scopes minimi consigliati | Default | Gate HITL |
|---|---|---|---|---|
| Gmail | triage inbox, bozze, follow-up | `gmail.readonly` | read-only | `CONFIRM` per `send`, `trash`, `delete` |
| Calendar | agenda, conflitti, blocchi focus | `calendar.readonly` | read-only | `CONFIRM` per create/update/delete eventi |
| Drive | ricerca file, sintesi contenuti | `drive.readonly` | read-only | `CONFIRM` per move/share/delete |
| Docs | lettura e sintesi documenti | `documents.readonly` | read-only | `CONFIRM` per edit massivi |
| Sheets | lettura KPI e piani | `spreadsheets.readonly` | read-only | `CONFIRM` per write formula/data |
| Chat | riepilogo thread e follow-up | `chat.messages.readonly`, `chat.spaces.readonly` | read-only | `CONFIRM` per post messaggi |
| Meet | lettura meeting e note linkate | scope Meet read-only disponibile | read-only | `CONFIRM` per create/modify |
| Tasks | lista task personale | `tasks.readonly` | read-only | `CONFIRM` per complete/delete |
| Contacts | rubrica e deduplica | `contacts.readonly` | read-only | `CONFIRM` per merge/delete |
| Admin (opzionale) | solo tenant governance | `admin.directory.*.readonly` | disabled | `DENY` fuori tenant owner |

**Regole di sicurezza Workspace**

- Consenti `SAFE` per read/list/search/summarize senza effetti esterni.
- Applica `NOTIFY` su bozza, tagging, label e proposte cambi non distruttivi.
- Applica `CONFIRM` su invio email, cancellazioni, condivisioni esterne e modifiche calendario.
- Applica `DENY` su bulk delete, forwarding esterno massivo e export contatti senza policy.
- Registra audit trail con utente, scope, oggetto, prima/dopo e motivazione sintetica.
- Abilita rollback assistito dove possibile, con undo window e snapshot pre-azione.

**Flussi prioritari Workspace**

- Morning brief: agenda + email urgenti + task top 3 + blocchi focus suggeriti.
- Inbox declutter: classifica email, prepara bozze, propone archiviazione e reminder follow-up.
- Meeting notes to tasks: trasforma note Meet/Docs in task con owner, deadline e stato.
- Family + work calendar merge: unifica vincoli personali/professionali e riduce conflitti.
- Personal CRM: aggiorna contatti da Gmail/Calendar e suggerisce prossimi touchpoint.

---

## Pianifica wave W1-W5

| Wave | Obiettivo operativo | Focus capability | Criterio uscita |
|---|---|---|---|
| W1 | utilita giornaliera immediata | daily-briefing, comms, schedule, tasks | 5 automazioni usate 4 giorni su 7 |
| W2 | coordinamento multicanale | knowledge, files, messaging, workspace write gated | riduzione 30% tempo triage inbox |
| W3 | lavoro-vita integrato | home-family, finance-admin, travel, internet-pc-automation | 80% scadenze personali rispettate |
| W4 | domini sensibili con governance | health-care, legal-admin, claims | zero azioni ad alto rischio senza HITL |
| W5 | estensioni avanzate | work-ops avanzate, development, analytics | adozione stabile >60% utenti target |

---

## Elenca prime 50 agencies

| # | agencyId | Missione breve | Capability tags | Wave | Risk |
|---|---|---|---|---|---|
| 1 | morning-brief-orchestrator | Avvia la giornata con priorita e contesto unico | daily-briefing,schedule,tasks | W1 | SAFE |
| 2 | inbox-declutter-assistant | Riduce rumore inbox e propone azioni chiare | comms,gmail,tasks | W1 | NOTIFY |
| 3 | calendar-conflict-resolver | Elimina conflitti e protegge blocchi focus | schedule,calendar,focus | W1 | NOTIFY |
| 4 | task-triage-executor | Trasforma input sparsi in task eseguibili | tasks,knowledge,execution | W1 | SAFE |
| 5 | focus-block-planner | Pianifica deep work e pause con vincoli reali | schedule,focus,wellbeing | W1 | SAFE |
| 6 | personal-crm-nudger | Mantiene relazioni vive con reminder contestuali | personal-crm,comms,contacts | W1 | NOTIFY |
| 7 | family-calendar-sync | Coordina impegni familiari e scolastici | home-family,schedule,calendar | W1 | NOTIFY |
| 8 | meeting-notes-tasker | Converte note meeting in task con owner | work-ops,knowledge,tasks | W1 | SAFE |
| 9 | multi-channel-inbox-hub | Unifica email, chat e messaggi in una coda | comms,messaging,triage | W1 | NOTIFY |
| 10 | errands-shopping-planner | Organizza commissioni, liste e finestre utili | home-family,tasks,automation | W1 | SAFE |
| 11 | bills-subscription-watch | Monitora bollette, rinnovi e sprechi ricorrenti | finance-admin,alerts,files | W1 | NOTIFY |
| 12 | home-maintenance-reminder | Previene dimenticanze su casa e manutenzioni | home-family,tasks,reminders | W1 | SAFE |
| 13 | commute-day-optimizer | Ottimizza spostamenti con agenda e traffico | daily-briefing,schedule,travel | W1 | SAFE |
| 14 | wellness-routine-coach | Sostiene routine sonno, movimento e recupero | wellbeing,habits,reminders | W1 | NOTIFY |
| 15 | personal-doc-capture | Cattura e classifica documenti personali rapidi | files,ocr,knowledge | W1 | SAFE |
| 16 | google-workspace-orchestrator | Coordina Gmail Calendar Drive Docs Sheets Chat Meet | workspace,comms,schedule,files | W1 | CONFIRM |
| 17 | memory-layer-core | Gestisce memoria multilayer e preferenze utente | knowledge,memory,personalization | W2 | SAFE |
| 18 | skill-crystallizer | Converte routine in skill riusabili e versionate | automation,knowledge,playbooks | W2 | SAFE |
| 19 | web-research-scout | Raccoglie fonti e sintesi operative affidabili | internet,research,knowledge | W2 | NOTIFY |
| 20 | browser-pc-automation-runner | Esegue routine browser e desktop ripetitive | internet-pc-automation,rpa | W2 | CONFIRM |
| 21 | file-lifecycle-manager | Applica naming, retention e archiviazione intelligente | files,governance,automation | W2 | NOTIFY |
| 22 | notion-sync-assistant | Sincronizza appunti e piani tra strumenti personali | knowledge,notion,tasks | W2 | NOTIFY |
| 23 | message-drafter-multichannel | Prepara bozze coerenti per canali diversi | messaging,comms,writing | W2 | CONFIRM |
| 24 | travel-planner-personal | Costruisce itinerari con vincoli tempo e budget | travel,schedule,finance-admin | W3 | NOTIFY |
| 25 | personal-finance-copilot | Classifica spese e segnala derive di budget | finance-admin,analytics,alerts | W3 | NOTIFY |
| 26 | development-workbench | Supporta coding task e automazioni tecniche | development,automation,cli | W5 | NOTIFY |
| 27 | code-review-assistant | Evidenzia rischi e regressioni nel codice | development,quality,review | W5 | NOTIFY |
| 28 | bug-triage-coordinator | Prioritizza bug e assegna ownership chiara | development,work-ops,tasks | W5 | SAFE |
| 29 | ci-health-monitor | Sorveglia pipeline e allerta su fallimenti critici | development,monitoring,alerts | W5 | NOTIFY |
| 30 | cloud-cost-watchdog | Rileva costi anomali e suggerisce correzioni | finance-admin,cloud,monitoring | W4 | NOTIFY |
| 31 | procurement-assistant | Traccia richieste acquisto e stato approvazioni | work-ops,finance-admin,files | W3 | NOTIFY |
| 32 | vendor-followup-manager | Automatizza follow-up con fornitori e scadenze | work-ops,comms,tasks | W3 | NOTIFY |
| 33 | recruiting-coordinator | Organizza pipeline candidati e comunicazioni | work-ops,comms,schedule | W4 | CONFIRM |
| 34 | interview-ops-assistant | Coordina colloqui, feedback e decision log | work-ops,schedule,knowledge | W4 | NOTIFY |
| 35 | legal-intake-organizer | Classifica documenti legali e scadenze correlate | legal-admin,files,alerts | W4 | CONFIRM |
| 36 | contract-deadline-guard | Previene rinnovi involontari e penali contrattuali | legal-admin,finance-admin,alerts | W4 | NOTIFY |
| 37 | healthcare-admin-assistant | Gestisce appuntamenti medici e documenti clinici | health-care,schedule,files | W4 | CONFIRM |
| 38 | symptom-journal-coach | Registra segnali salute e trend non diagnostici | health-care,tracking,knowledge | W4 | CONFIRM |
| 39 | medication-adherence-helper | Ricorda assunzioni e verifica aderenza giornaliera | health-care,reminders,safety | W4 | CONFIRM |
| 40 | insurance-claims-helper | Guida raccolta prove e invio pratiche assicurative | health-care,legal-admin,files | W4 | CONFIRM |
| 41 | emergency-prep-coordinator | Mantiene checklist emergenza e contatti critici | safety,home-family,files | W3 | NOTIFY |
| 42 | household-budget-planner | Pianifica budget familiare e obiettivi mensili | finance-admin,home-family,planning | W3 | SAFE |
| 43 | event-planning-assistant | Coordina eventi personali con timeline e fornitori | home-family,schedule,comms | W3 | NOTIFY |
| 44 | gift-reminder-planner | Gestisce ricorrenze e idee regalo contestuali | personal-crm,home-family,tasks | W3 | SAFE |
| 45 | digital-security-hygiene | Controlla password, MFA e posture account | security,governance,alerts | W3 | CONFIRM |
| 46 | privacy-rights-requester | Prepara richieste privacy e tracciamento esiti | privacy,legal-admin,files | W4 | CONFIRM |
| 47 | backup-restore-guardian | Verifica backup e test di ripristino periodici | security,files,monitoring | W3 | NOTIFY |
| 48 | community-engagement-helper | Pianifica interazioni con community e gruppi | personal-crm,messaging,schedule | W3 | SAFE |
| 49 | volunteer-coordinator | Coordina attivita volontariato e disponibilita | home-family,schedule,work-ops | W3 | SAFE |
| 50 | weekly-retro-coach | Produce retro settimanale con azioni migliorative | daily-briefing,knowledge,planning | W2 | SAFE |

---

## Applica guardrail sicurezza

- Usa policy engine centralizzato con matrice `capability x risk x destination`.
- Imposta `SAFE` senza conferma, `NOTIFY` con log utente, `CONFIRM` con approvazione esplicita e `DENY` bloccante.
- Richiedi HITL per invii esterni, cancellazioni, pagamenti, condivisioni pubbliche e modifiche massive.
- Abilita sandbox per automazioni internet/PC con allowlist domini e rate limits.
- Proteggi domini health con consenso specifico, minimizzazione dati e retention breve.
- Registra audit immutabile e alert su pattern anomali o escalation ripetute.

---

## Misura KPI adozione personale

- `daily_active_personal_users`: utenti attivi giornalieri su use case personali.
- `time_saved_per_day_min`: minuti risparmiati medi per utente al giorno.
- `inbox_zero_days_per_month`: giorni mese con inbox sotto soglia target.
- `calendar_conflicts_resolved_rate`: percentuale conflitti agenda risolti automaticamente.
- `task_completion_7d_rate`: percentuale task chiusi entro 7 giorni dalla creazione.
- `hitl_acceptance_rate`: quota azioni CONFIRM approvate al primo tentativo.
- `automation_success_rate`: percentuale run completati senza intervento manuale.
- `high_risk_incidents`: numero incidenti CONFIRM/DENY per 1000 esecuzioni.

---

## Esegui backlog wave1

- Definisci schema capability tags e risk policy comune per tutte le agency W1.
- Implementa `morning-brief-orchestrator` con fonti agenda, inbox top, task top 3.
- Rilascia `inbox-declutter-assistant` in read-only con suggerimenti azione e bozza.
- Rilascia `calendar-conflict-resolver` con proposta slot e protezione focus blocks.
- Implementa `task-triage-executor` con parsing note/messaggi e priorita automatica.
- Avvia `google-workspace-orchestrator` con OAuth incrementale e scope minimi read-only.
- Aggiungi HITL gateway per `send/delete/share` con preview diff prima della conferma.
- Integra memoria multilayer per preferenze orari, canali e stile comunicativo.
- Pubblica playbook cristallizzati per morning brief, inbox declutter e meeting-to-task.
- Configura audit trail, dashboard KPI e alert sicurezza per eventi CONFIRM/DENY.
- Esegui pilot 2 settimane con utenti reali e revisione settimanale KPI.
- Promuovi a write-gated solo le funzioni che superano soglie sicurezza e affidabilita.

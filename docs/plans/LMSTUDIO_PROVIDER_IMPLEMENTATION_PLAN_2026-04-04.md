# Piano implementazione LM Studio

Piano tecnico per integrare LM Studio come provider locale in kiloclaw/opencode, con discovery modelli, load on-demand e uso in sessioni CLI.

---

## Obiettivo

Integrare LM Studio come provider locale di prima classe per usare modelli locali in sessioni CLI senza setup manuale continuo.
L’integrazione deve coprire discovery modelli, load automatico e avvio automatico del servizio locale.

---

## Stato attuale nel repo

- È già presente documentazione/configurazione per `provider.lmstudio` via `@ai-sdk/openai-compatible`
- Base URL già nota: `http://localhost:1234/v1`
- Pattern attuale orientato a endpoint OpenAI-compatible
- Setup tipico oggi: avvio LM Studio e caricamento modello manuali

Riferimenti fattuali consolidati:

1. Endpoint OpenAI-compatible LM Studio su `/v1/*`
   - `GET /v1/models`
   - `POST /v1/responses`
   - `POST /v1/chat/completions`
   - `POST /v1/embeddings`
   - `POST /v1/completions`
2. Endpoint REST nativi LM Studio su `/api/v1/*`
   - `GET /api/v1/models`
   - `POST /api/v1/models/load`
   - `POST /api/v1/models/unload`
   - `POST /api/v1/models/download`
3. Best practice headless LM Studio
   - `lms daemon up` (llmster daemon)
   - opzionale `lms server start`
   - su Linux possibile integrazione systemd
4. Plugin esterno esistente `agustif/opencode-lmstudio`
   - usa hook config
   - fa discovery via `/v1/models`
   - auto-detect porte
   - crea config provider in automatico

---

## Decisione di architettura (build vs plugin)

Raccomandazione esplicita: **plugin-first** per ridurre rischio e tempo di adozione, poi hardening upstream se i segnali operativi sono positivi.

| Opzione              | Pro                                                               | Contro                                            | Decisione                     |
| -------------------- | ----------------------------------------------------------------- | ------------------------------------------------- | ----------------------------- |
| Plugin-first         | Time-to-value rapido, impatto ridotto sul core, rollback semplice | Possibile variabilità qualità plugin terzo        | **Fase iniziale consigliata** |
| Build core immediata | Controllo completo, UX uniforme nel core                          | Più effort iniziale, maggiore rischio regressioni | Rimandata a fase di hardening |

Decisione operativa:

- Fase 0-2: usare/adattare approccio plugin (anche ispirato a `opencode-lmstudio`)
- Fase 3+: consolidare nel core solo ciò che dimostra stabilità e valore

---

## Best practice consigliata

- Usare endpoint `/v1/*` per inferenza compatibile con stack esistente provider OpenAI-compatible
- Usare endpoint `/api/v1/*` per lifecycle modelli (load/unload/download)
- Avvio headless preferito via `lms daemon up`
- Implementare controllo salute con retry backoff breve
- Supportare porta custom e auto-discovery controllata
- Fallire in modo degradato, non bloccare CLI se LM Studio non parte

Comandi di riferimento:

```bash
lms daemon up
lms server start
```

---

## Piano a fasi (Phase 0..6)

### Phase 0 - Validazione tecnica e baseline

- [ ] Verificare disponibilità binario `lms` su Linux/macOS/Windows
- [ ] Verificare endpoint raggiungibili su host/porta configurata
- [ ] Definire matrice OS e prerequisiti minimi
- [ ] Validare compatibilità con config attuale `provider.lmstudio`

Deliverable:

- Documento baseline compatibilità + fallback per OS

### Phase 1 - Discovery modelli

- [ ] Implementare discovery primario via `GET /v1/models`
- [ ] Aggiungere fallback discovery via `GET /api/v1/models`
- [ ] Normalizzare output in un unico schema interno
- [ ] Gestire stato servizio down con errore guidato

Deliverable:

- Comando/flow CLI che mostra tutti i modelli locali disponibili

### Phase 2 - Load on-demand

- [ ] Implementare `POST /api/v1/models/load` prima di iniziare una sessione
- [ ] Introdurre policy `autoload: on-demand | never`
- [ ] Introdurre timeout configurabile e retry limitato
- [ ] Opzionale: unload a fine sessione con `POST /api/v1/models/unload`

Deliverable:

- Sessione CLI che carica automaticamente il modello richiesto se non già attivo

### Phase 3 - Startup automatico LM Studio

- [ ] Rilevare server non disponibile e tentare avvio autonomo
- [ ] Linux: tentare `lms daemon up`, poi supporto systemd quando disponibile
- [ ] macOS: tentare `lms daemon up`, fallback istruzioni guidate
- [ ] Windows: tentare `lms daemon up` via processo shell compatibile
- [ ] Implementare fallback sicuro se avvio fallisce

Deliverable:

- Sequenza automatica startup + verifica health + fallback non bloccante

### Phase 4 - Integrazione sessioni CLI

- [ ] Collegare provider LM Studio al resolver modelli sessione
- [ ] Selezione modello da lista discovery con override utente
- [ ] Routing inferenza verso `/v1/chat/completions` e/o `/v1/responses`
- [ ] Messaggi errore coerenti con provider locali

Deliverable:

- Uso end-to-end in sessione CLI con modello locale

### Phase 5 - Osservabilità, sicurezza, hardening

- [ ] Log strutturati su startup, discovery, load, inferenza
- [ ] Metriche minime su latenza, error rate, startup success rate
- [ ] Sanitizzazione log su path locali e metadati sensibili
- [ ] Backoff/circuit breaker su failure ripetute

Deliverable:

- Profilo operativo stabile e debuggabile

### Phase 6 - Valutazione upstream core

- [ ] Raccogliere evidenze da adozione plugin-first
- [ ] Decidere se mantenere plugin o portare nel core
- [ ] Se upstream: minimizzare diff e rispettare convenzioni monorepo

Deliverable:

- Decision record finale plugin vs core

---

## API contract/flow

### Flusso principale

1. Health check server LM Studio
2. Se down: tentativo startup autonomo
3. Discovery modelli (`GET /v1/models`, fallback `/api/v1/models`)
4. Se modello richiesto non loaded: `POST /api/v1/models/load`
5. Avvio sessione e chiamate inferenza su `/v1/chat/completions` o `/v1/responses`

### Esempi API

Discovery:

```http
GET http://localhost:1234/v1/models
```

Load modello on-demand:

```http
POST http://localhost:1234/api/v1/models/load
Content-Type: application/json

{
  "model": "qwen2.5-coder-7b-instruct",
  "ttl": 1800,
  "priority": "normal"
}
```

Chat completion sessione:

```http
POST http://localhost:1234/v1/chat/completions
Content-Type: application/json

{
  "model": "qwen2.5-coder-7b-instruct",
  "messages": [
    { "role": "user", "content": "Scrivi una funzione di parsing" }
  ]
}
```

### Pseudoflow startup con fallback

```text
if server reachable -> proceed
if not reachable -> run lms daemon up
if reachable after retry -> proceed
if still unreachable -> keep CLI usable and show guided local-only warning
```

---

## Sicurezza

- Limitare default a `localhost`
- Non esporre token o path locali nei log
- Validare input modello prima di chiamare endpoint load/unload
- Evitare esecuzioni shell non sicure, usare invocazioni comando parametrizzate
- Gestire download modelli come operazione esplicita utente

---

## Telemetria/observability

Eventi minimi:

- `lmstudio.start.attempt`
- `lmstudio.start.success`
- `lmstudio.start.failure`
- `lmstudio.models.discovered`
- `lmstudio.model.load.requested`
- `lmstudio.model.load.success`
- `lmstudio.model.load.failure`
- `lmstudio.inference.request`
- `lmstudio.inference.error`

Metriche minime:

| Metrica                    | Tipo  | Obiettivo                    |
| -------------------------- | ----- | ---------------------------- |
| Startup success rate       | ratio | >95% su ambienti compatibili |
| Time to first token locale | p95   | soglia da baseline Phase 0   |
| Model load latency         | p95   | stabile tra release          |
| Error rate inferenza       | ratio | trend in calo                |

---

## Test strategy

Livelli test:

- Test unitari su parser discovery e mapping schema modelli
- Test integrazione con LM Studio reale locale (no mock del comportamento core)
- Test e2e CLI: startup -> discovery -> load -> sessione
- Test cross-platform su matrix Linux/macOS/Windows

Checklist test critici:

- [ ] Server già attivo
- [ ] Server non attivo ma avviabile
- [ ] Server non avviabile (fallback)
- [ ] Modello già loaded
- [ ] Modello non loaded e caricabile
- [ ] Modello non presente
- [ ] Porta custom configurata

---

## Rollout

1. Canary interna con plugin-first
2. Raccolta metriche e feedback su 1-2 release
3. Hardening error handling e startup
4. Estensione graduale come default locale consigliato

Feature flags consigliate:

- `lmstudio.autoStart`
- `lmstudio.autoLoadModel`
- `lmstudio.discoveryFallbackApiV1`

---

## Rischi+mitigazioni

| Rischio                                     | Impatto | Mitigazione                                |
| ------------------------------------------- | ------- | ------------------------------------------ |
| Differenze versioni LM Studio               | Medio   | Compat matrix e capability detection       |
| Startup automatico instabile su alcuni host | Alto    | Retry limitato + fallback non bloccante    |
| Endpoint nativi variabili                   | Medio   | Adapter isolato e test integrazione        |
| UX confusa tra manuale/automatico           | Medio   | Migrazione guidata e flag espliciti        |
| Regressioni nel core                        | Alto    | Plugin-first e upstream solo dopo evidenze |

---

## Definition of Done

Acceptance criteria obbligatori:

### Discovery lista modelli

- [ ] CLI mostra elenco completo modelli locali da `GET /v1/models`
- [ ] Se `/v1/models` fallisce, fallback a `/api/v1/models` con messaggio chiaro

### Load on demand

- [ ] Quando un modello richiesto non è attivo, viene invocato `POST /api/v1/models/load`
- [ ] Sessione parte automaticamente dopo load riuscito
- [ ] In caso di errore load, output azionabile e non ambiguo

### Uso in sessioni CLI

- [ ] Prompt utente eseguito con modello LM Studio selezionato
- [ ] Risposta ricevuta via endpoint `/v1/chat/completions` o `/v1/responses`
- [ ] Parametri principali modello configurabili da settings CLI

### Startup automatico

- [ ] Se LM Studio non è attivo, il sistema tenta avvio autonomo
- [ ] Linux/macOS/Windows coperti con strategia specifica
- [ ] Se avvio fallisce, CLI resta operativa e fornisce fallback guidato

---

## Migrazione

Transizione da modalità manuale a modalità automatizzata:

1. Stato attuale: utente avvia LM Studio e carica modello manualmente
2. Nuovo default consigliato: auto-start + auto-load on-demand tramite flag
3. Compatibilità: mantenere modalità manuale (`autoStart=false`, `autoLoadModel=false`)
4. Rollback immediato: disabilitare flag senza rimuovere provider LM Studio

Impatto utente:

- Setup iniziale più semplice
- Minore frizione all’avvio sessione locale
- Percorso manuale ancora disponibile per ambienti controllati

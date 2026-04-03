# Stabilizzazione aprile 2026

> Stato tecnico consolidato per runtime e CLI.

---

## Conferma blocchi infrastrutturali

Risolto il blocco installazione Bun con configurazione PATH coerente per ambienti locali e CI. Stabilizzato anche il launcher ESM dei binari `bin/kiloclaw` e `bin/kilo` con avvio consistente.

---

## Registra fix core

Completato il parsing config env con prefisso `KILOCLAW_*` in modalità strict. Corretto il typo nel mapping della scheduler recovery policy.

Resa persistente la memoria dell'orchestrator tra cicli operativi previsti. Sistemato il fallback del capability router per evitare errori su capability non risolte al primo match.

---

## Allinea integrazione agent-skill

L'integrazione reale agent → skill è ora attiva nel flusso operativo standard. Gli agent principali mappati sono:

- `development-agent`
- `knowledge-agent`
- `nutrition-agent`
- `weather-agent`

---

## Documenta verifiche

Eseguito typecheck completo con esito positivo. Eseguiti test Kiloclaw totali con esito pass.

Eseguito smoke test end-to-end su routing capability e persistenza memoria con esito pass. Nessuna regressione bloccante rilevata nella finestra di stabilizzazione.

---

## Come lanciare Kiloclaw CLI in dev mode

Usa questi comandi aggiornati per avviare e validare la CLI in sviluppo:

```bash
# avvio dev dal root monorepo
bun run dev

# esecuzione diretta della CLI dal package core
bun run --cwd packages/opencode --conditions=browser src/index.ts

# build launcher locale e binario in ./bin/kilo
bun script/local-bin.ts

# verifica typecheck del core
bun run --cwd packages/opencode typecheck

# esecuzione test completi del core
bun run --cwd packages/opencode test
```

Per usare il launcher locale dopo la build, esegui `./bin/kilo` o `./bin/kiloclaw` dal workspace corrente.

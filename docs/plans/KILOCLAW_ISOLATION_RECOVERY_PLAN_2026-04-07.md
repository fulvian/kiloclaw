# KILOCLAW Isolation Recovery Plan (2026-04-07)

## Objective

Ripristinare un avvio realmente isolato di Kiloclaw da `bun run dev`, eliminando la dipendenza operativa da identita, percorsi, config e behavior Kilo/Kilocode nel runtime CLI di sviluppo.

## Incident Summary

- Sintomo utente: `bun run dev` avvia ancora un runtime percepito come Kilo/Kilocode, non Kiloclaw.
- Impatto: impossibile validare in modo affidabile l'isolamento richiesto dal programma Kiloclaw.
- Severita: alta (blocca test realistici di Wave 5/6 su isolation integrity).

## Deep Findings (Codebase + Runtime)

### 1) Root entrypoint non isolato

- Root `dev` punta a `packages/opencode/src/index.ts` (CLI Kilo) via `package.json`.
- `scriptName(Brand.name())` cambia solo il prefisso comandi (`kiloclaw`) ma non il resto del prodotto.
- Evidenza runtime: `bun run dev -- --help` mostra `kiloclaw` come command name ma descrizioni tipo `start kilo tui`, `run kilo with a message`.

### 2) Branding patch solo superficiale

- `packages/opencode/src/cli/brand.ts` cambia esclusivamente il nome script.
- Grande quantita di stringhe hardcoded `kilo`/`kilocode` in comandi, TUI, endpoint, telemetry, install/upgrade, UX copy.
- Contatore su aree startup-critical: decine di riferimenti in `index.ts`, `cli/*`, `config/*`, `global/index.ts`, `installation/index.ts`.

### 3) Product identity hardcoded nel core

- `packages/opencode/src/global/index.ts`: `const app = "kilo"` (storage/config/cache path).
- `packages/opencode/src/installation/index.ts`: user-agent `kilo/...`, upgrade/feed `@kilocode/cli`, release endpoint `Kilo-Org/kilocode`.
- `packages/opencode/src/cli/network.ts`: default `kilo.local`.

### 4) Legacy coupling non completamente rimosso

- Introdotta flag `KILO_DISABLE_KILOCODE_LEGACY`, utile ma non sufficiente per isolamento totale.
- Anche con legacy disable, il runtime resta semanticamente Kilo (comandi, endpoint, provider flow, copy, telemetria, schema URL).

### 5) Verifica su debug/config

- `debug skill` con runtime isolato e legacy off: nessuna sorgente `.kilocode` (miglioramento reale).
- `debug config`: restano token/valori Kilo (es. schema `app.kilo.ai/config.json`, prompt Kilo-specific), quindi isolamento ancora incompleto.

## Git History Findings

- Sui file chiave startup (`package.json`, `packages/opencode/src/index.ts`, `packages/opencode/src/global/index.ts`) la cronologia mostra base storica originata dal bootstrap iniziale del fork.
- Non emerge una regressione singola recente che spieghi da sola il problema: il gap e architetturale, non un singolo commit bug.

## External Research Findings

1. Yargs docs (`https://yargs.js.org/`): `scriptName()` influenza il nome comando in help/usage, non rebrandizza automaticamente descrizioni, UX text, endpoint o path.
2. Databricks CLI migration docs (`https://docs.databricks.com/aws/en/dev-tools/cli/migrate`): con legacy e new CLI coesistenti servono bin/path distinti e precedenza PATH esplicita; naming da solo non evita ambiguita operativa.
3. NPM scripts docs (`https://docs.npmjs.com/cli/v10/using-npm/scripts/`): env nei package scripts e supportato; quindi il problema non e "env non applicate", ma il perimetro di override insufficiente.

## Root Cause

Il problema non e nel comando `bun run dev` in se, ma nel fatto che avvia ancora il CLI product stack Kilo (`packages/opencode/src/index.ts`) con branding/runtime identity distribuita in molti moduli.

In sintesi:

- `dev` usa il binario/entrypoint sbagliato per l'obiettivo di isolamento Kiloclaw.
- L'attuale fix agisce sul livello cosmetico (`scriptName`) e su una parte del legacy loading, ma non sulla product identity e sui boundary di runtime.

## Recovery Strategy (Complete, Non-Superficial)

### Phase A - Product Boundary Hard Split (P0)

1. Introdurre `ProductProfile` centralizzato (`kiloclaw` vs `kilo`) con:
   - command name
   - app id (global paths)
   - config schema URL
   - mdns domain
   - user-agent prefix
   - cloud endpoints
2. Rimuovere hardcoded product literals dai moduli startup-critical:
   - `index.ts`, `global/index.ts`, `installation/index.ts`, `cli/network.ts`, `cli/cmd/*`.
3. Root `dev` deve avviare profile `kiloclaw` by default (non best-effort).

### Phase B - Dedicated Kiloclaw Entrypoint (P0)

1. Creare entrypoint dedicato `packages/opencode/src/kiloclaw/cli/index.ts`.
2. Questo entrypoint non deve importare path Kilo cloud/gateway se non esplicitamente abilitati.
3. Aggiornare `package.json` root:
   - `dev` -> entrypoint Kiloclaw.
   - `dev:kilo` opzionale per compat/testing legacy.

### Phase C - Config/Storage Isolation Hard Enforcement (P0)

1. Nuovi namespace canonici:
   - `.kiloclaw/` (project)
   - `~/.config/kiloclaw`, `~/.local/share/kiloclaw`, `~/.cache/kiloclaw`, `~/.local/state/kiloclaw`.
2. Lettura `.kilo`/`.kilocode` solo in modalita import/migration esplicita (one-shot), mai in runtime normale.
3. Kill-switch: `KILOCLAW_STRICT_ISOLATION=true` (default in dev), fail-fast se rileva namespace legacy non autorizzato.

### Phase D - De-Kilo Command Surface (P1)

1. Aggiornare command descriptions/help text/TUI labels da `kilo` -> `kiloclaw`.
2. Rimuovere endpoint hardcoded `kilo.ai`/`kilo.internal` dal path default; usare profile config.
3. Spostare integrazioni cloud Kilo in adapter separato opzionale (`integration/kilo-compat`).

### Phase E - Verification & Guardrails (P0)

1. Nuove suite obbligatorie:
   - `startup-isolation.test.ts`
   - `product-profile.test.ts`
   - `legacy-import-gate.test.ts`
2. Golden tests runtime:
   - `bun run dev -- --help` non contiene `run kilo`, `start kilo`, `kilo.local`, `@kilocode/cli`.
   - `debug config`/`debug skill` non includono `.kilocode`, schema `app.kilo.ai`, o path `~/.config/kilo` in strict mode.
3. CI gate:
   - Regex denylist su output startup/help.
   - Failure automatica su hardcoded legacy literals nei moduli startup-critical.

### Phase F - Rollout & Safety (P1)

1. Rollout in 3 step:
   - local strict
   - staging strict
   - canary users
2. Rollback controllato:
   - `KILOCLAW_PROFILE=kilo-compat` (temporaneo)
   - no rollback su audit append-only.

## Execution Plan (Sequenced)

1. Inventory completa riferimenti Kilo/Kilocode nei moduli di bootstrap.
2. Introduzione `ProductProfile` e refactor startup stack.
3. Creazione entrypoint Kiloclaw dedicato + script root aggiornati.
4. Isolamento directory/config/storage con strict mode default.
5. Refactor command/TUI surface e endpoint defaults.
6. Aggiunta test/gate CI di isolamento.
7. Staging drill + canary + closure report.

## Acceptance Criteria (Must Pass)

1. `bun run dev` avvia entrypoint Kiloclaw dedicato (non `src/index.ts` legacy).
2. Nessun riferimento runtime a namespace/path/endpoint Kilo in strict mode.
3. Output help/TUI completamente Kiloclaw (nessuna stringa "run kilo", "start kilo").
4. Nessun caricamento config/skills da `.kilo`/`.kilocode` salvo migration command esplicito.
5. Test suite isolamento verde + gate CI denylist verde.

## Risks and Mitigations

- Rischio: regressione compat con ecosistema attuale Kilo.
  - Mitigazione: profile `kilo-compat` separato e temporaneo.
- Rischio: refactor ampio su startup.
  - Mitigazione: rollout per fasi con golden tests e canary.
- Rischio: drift futuro verso hardcoded legacy.
  - Mitigazione: lint/CI denylist + ownership code review obbligatoria su bootstrap.

## Immediate Next Actions

1. Bloccare merge di ulteriori patch cosmetiche su `scriptName` senza boundary split.
2. Avviare subito Phase A+B (ProductProfile + entrypoint Kiloclaw dedicato).
3. Implementare in parallelo i test di accettazione della Phase E per guidare il refactor.

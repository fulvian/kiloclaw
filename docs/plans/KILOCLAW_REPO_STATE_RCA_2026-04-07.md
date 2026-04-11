# KILOCLAW Repo State RCA (2026-04-07)

## Problem

Da questa mattina `bun run dev` non si comporta come atteso per Kiloclaw e sembra che il repository sia tornato a uno stato precedente.

## Evidence Collected

### Branch and HEAD state

- Branch corrente: `docs/agency-guide-canonical`
- HEAD corrente: `b77c983`
- Upstream: `origin/docs/agency-guide-canonical`

### Reflog timeline (key events)

- `2026-04-07 10:44:34 +0200`: checkout da `refactor/kilocode-elimination` a `docs/agency-guide-canonical`
- `2026-04-07 10:45:45 +0200`: cherry-pick di commit docs su branch docs

### Where the morning implementation still exists

- Commit della mattina (es. `7828449`, `02c190d`) esistono e sono contenuti nel branch `refactor/kilocode-elimination`.
- `git branch --contains 7828449` -> `refactor/kilocode-elimination`.

### Integrity check

- `git fsck --full` non mostra oggetti corrotti; solo oggetti dangling (normali dopo reset/cherry-pick/rewrite locali).

### Runtime behavior difference driver

- In `refactor/kilocode-elimination`, `packages/opencode/src/index.ts` aveva `scriptName("kiloclaw")` e wiring CLI aggiuntivo (`KiloclawCommand`).
- Nel branch docs corrente, tale stato non e presente allo stesso livello: quindi il runtime percepito torna verso behavior Kilo-oriented.

## Root Cause

Non emerge corruzione repository.

La causa principale e un cambio branch non riallineato:

1. Lo sviluppo funzionale Kiloclaw e rimasto su `refactor/kilocode-elimination`.
2. La sessione corrente ha continuato lavori su `docs/agency-guide-canonical` (branch di documentazione).
3. Questo ha creato la percezione di rollback/perdita, ma i commit della mattina sono ancora nel DAG git del branch refactor.

## Secondary Contributor

- Presenza di molte modifiche non committate nel working tree corrente, che rende piu difficile distinguere stato branch vs stato WIP.

## Recovery Path (Safe)

1. Creare un backup branch dell'attuale working tree (non perdere WIP).
2. Stash completo (`-u`) o commit WIP locale.
3. Tornare a `refactor/kilocode-elimination`.
4. Rieseguire `bun run dev` su quel branch e verificare startup/help.
5. Portare in modo controllato solo le modifiche desiderate dal branch docs al branch refactor (cherry-pick o patch selettiva).

## Conclusion

Il repository non risulta corrotto; il problema e uno split di stato tra branch (refactor vs docs) e non un reset globale dei contenuti.

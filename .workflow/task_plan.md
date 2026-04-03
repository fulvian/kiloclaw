# KILOCLAW REFACTORING PLAN - ELIMINAZIONE COMPLETA KILOCODE

## OBIETTIVO
Refactoring completo per eliminare OGNI riferimento a KiloCode e correggere errori di spelling (kilocaw → kiloclaw)

## FASI

### Fase 0: ANALISI (in corso)
- [x] Identificare 864+ riferimenti a "kilocode"
- [x] Identificare directory problematiche:
  - `src/kilocode/` - KiloCode originale (ELIMINARE)
  - `src/kilocaw/` - typo manca 'l' (ELIMINARE)  
  - `src/kiloclaw/` - namespace corretto (MANTENERE)
- [ ] Identificare tutti gli import `@kilocode/*`
- [ ] Identificare tutti i file con `// kilocode_change`
- [ ] Identificare tutti i service name "kilocode" nei log

### Fase 1: BACKUP E ANALISI STRUTTURALE
- [ ] Git backup/branch
- [ ] Mappare tutte le dipendenze `@kilocode/*`
- [ ] Identificare cosa può essere rimosso vs sostituito

### Fase 2: ELIMINAZIONE `src/kilocode/`
- [ ] Verificare che nulla in `src/kiloclaw/` importi da `src/kilocode/`
- [ ] Eliminare tutti i 31 file in `src/kilocode/`
- [ ] Verificare nessun import residuo

### Fase 3: ELIMINAZIONE `src/kilocaw/` (typo)
- [ ] Verificare che nulla importi da `src/kilocaw/`
- [ ] Eliminare tutti i file in `src/kilocaw/`
- [ ] Cercare riferimenti "kilocaw" e correggere in "kiloclaw"

### Fase 4: CORREZIONE SPELLING "kilocaw" → "kiloclaw"
- [ ] Cercare tutti i file con "kilocaw" (non "kiloclaw")
- [ ] Correggere spelling in tutti i file

### Fase 5: RIMUOVERE `// kilocode_change` MARKERS
- [ ] Identificare tutti i marker `// kilocode_change`
- [ ] Rimuovere i marker ma mantenere codice valido dove appropriato
- [ ] Rimuovere codice legacy KiloCode non più necessario

### Fase 6: SOSTITUIRE DIPENDENZE `@kilocode/*`
- [ ] `@kilocode/kilo-gateway` → valutare sostituzione/eliminazione
- [ ] `@kilocode/kilo-telemetry` → valutare sostituzione/eliminazione
- [ ] `@kilocode/sdk/v2` → valutare sostituzione/eliminazione
- [ ] `@kilocode/plugin` → valutare sostituzione/eliminazione

### Fase 7: VERIFICA FINALE
- [ ] Zero riferimenti "kilocode" nel codebase
- [ ] Zero riferimenti "kilocaw" (typo) nel codebase
- [ ] Tutti i 528 test kiloclaw passano
- [ ] Pre-push hook passa

## ERRORI INCONTRATI
(to be filled during execution)

## DECISIONI
(to be filled during execution)

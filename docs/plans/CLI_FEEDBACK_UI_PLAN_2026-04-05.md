# CLI Feedback UI - Piano Implementativo

**Data:** 2026-04-05  
**Status:** ✅ Completato e Committato  
**Ultimo Commit:** `da11b31` + staged changes per session feedback on exit  
**Scope:** Aggiungere sistema di feedback intuitivo al CLI TUI

---

## Comportamento Finale Implementato

### Feedback Inline (Response-Level)

- **Pollice visibile** dopo ogni risposta
- **NO timeout** - resta visibile FINO a quando l'utente:
  - Clicca 👍 (registra "up", mostra "✓ Feedback registrato")
  - Clicca 👎 (registra "down" con motivo categorico)
  - Invia un follow-up (pollice si nasconde)
- **Conferma visiva**: "✓ Feedback registrato - Grazie!" dopo ogni invio

### Feedback Negativo - Categorie Predefinite

Invece di free-text, l'utente sceglie da 7 categorie fisse:

| Codice                 | Descrizione                     |
| ---------------------- | ------------------------------- |
| `wrong_info`           | Informazione sbagliata          |
| `not_relevant`         | Non pertinente                  |
| `too_verbose`          | Troppo prolisso                 |
| `task_partial`         | Task parzialmente completato    |
| `bad_style`            | Stile comunicazione inadeguato  |
| `task_failed`          | Task fallito                    |
| `expectation_mismatch` | Non era quello che mi aspettavo |

### Session Feedback (on Exit)

Quando l'utente tenta di uscire, viene chiesto feedback opzionale sulla sessione:

**Trigger:** `/exit`, `/new`, `/sessions`, `exit` command, Ctrl+D, Double Ctrl+C

**Flow:**

1. Utente digita `/exit` (o altro comando di exit)
2. Appare `SessionFeedbackDialog` con pollice 👍👎
3. Utente può: inviare feedback (con motivo opzionale) OPPURE saltare
4. Dopo submit/skip, l'exit viene eseguito

---

## Differenze dal Piano Originale

| Punto del Piano                 | Implementazione Reale                                    |
| ------------------------------- | -------------------------------------------------------- |
| Timeout 60s                     | **NO timeout** - resta visibile                          |
| Free-text per feedback negativo | **Categorie predefinite** (più semplice, più usabile)    |
| Alt+G / Alt+B shortcuts         | **Non implementato** (OpenTUI non espone `alt` modifier) |
| Auto-hide su nuovo messaggio    | Sì, via `pendingFeedbackMessageId`                       |
| Session feedback on exit        | **Implementato** con `pendingExitAction` callback        |

---

---

## 1. Analisi Entry Point

### Struttura CLI TUI

```
packages/opencode/src/cli/cmd/tui/
├── routes/session/
│   ├── index.tsx          # Sessione principale, rendering messaggi
│   ├── TextPart.tsx        # Rendering testo risposta (riga 1495)
│   ├── ToolPart.tsx        # Rendering tool output
│   └── footer.tsx          # Footer barra status
├── component/prompt/       # Input utente
├── routes/home.tsx         # Home page
└── app.tsx                # App principale
```

### Punto di Integrazione

I messaggi assistant vengono renderizzati in `session/index.tsx`:

- `TextPart` (riga 1495) → risposta testuale
- `ToolPart` (riga 1532) → output tool
- `ReasoningPart` (riga 1462) → ragionamento

**Opzione scelta**: Barra inline sotto l'ultimo messaggio assistant con 👍 👎

---

## 2. Best Practice Ricerca

### Linee Guida UX

1. **Thumbs Up/Down** - Il più semplice e universale
   - Microsoft Copilot, Slack, Reddit usano questo pattern
   - Meno cognitivo di 5 stelle
   - Benchmark: 10-30% feedback rate vs 2-5% per survey

2. **Inline Feedback** - Appare DOPO la risposta
   - Non intrusivo, non blocca il flusso
   - Visibile solo quando c'è una risposta completa

3. **Optional Comment** - Chiede "perché?" solo dopo -/+
   - Non obbligatorio
   - Utente può ignorare

4. **Keyboard Shortcuts** - 👍 = `Alt+g` (good), 👎 = `Alt+b` (bad)
   - Power user lo adorano
   - Non blocking per mouse users

### Riferimenti

- [NNGroup: User Feedback Requests](https://www.nngroup.com/articles/user-feedback/)
- [Appcues: Star vs Thumbs Rating](https://www.appcues.com/blog/rating-system-ux-star-thumbs)
- [Microsoft: Thumbs feedback for agents](https://learn.microsoft.com/en-us/power-platform/release-plan/2025wave1/microsoft-copilot-studio/collect-thumbs-up-or-down-feedback-comments-agents)

---

## 3. Design Proposto

### UX Flow

```
1. L'utente invia una domanda
2. L'assistente risponde
3. Sotto la risposta appare:
   ┌─────────────────────────────────────┐
   │ Questa risposta è stata utile?       │
   │    👍 Sì          👎 No             │
   └─────────────────────────────────────┘

4a. Se l'utente clicca 👍:
    → Feedback registrato come "up"
    → Barra scompare con messaggio "Grazie!"

4b. Se l'utente clicca 👎:
    → Appare un campo opzionale:
    ┌─────────────────────────────────────┐
    │ Perché non è stata utile? (opzionale) │
    │ [________________________]           │
    │ [Invia] [Salta]                    │
    └─────────────────────────────────────┘

5. L'utente può anche usare tastiera:
   - `Alt+g` = Good (👍)
   - `Alt+b` = Bad (👎)
   - `Esc` = Chiudi senza inviare
```

### Aspetto Visivo

- **Stile**: Minimo, non intrusivo, grigio scuro
- **Posizione**: Sotto l'ultimo messaggio assistant, allineato a sinistra
- **Animazione**: Fade in lento (300ms) dopo fine streaming
- **Timeout**: Scompare dopo 60s se non interagito

---

## 4. Architettura Tecnica

### Componenti da Creare

```
packages/opencode/src/cli/cmd/tui/
├── routes/session/
│   └── feedback-bar.tsx      # NEW - Barra feedback inline
```

### Integrazione in session/index.tsx

```tsx
// Dopo il rendering dell'ultimo messaggio assistant:
// (circa riga 1500-1530, dentro TextPart)

// Se è l'ultimo messaggio E streaming completato:
<Show when={isLastMessage && !streaming}>
  <FeedbackBar
    messageId={props.message.id}
    sessionId={props.message.sessionID}
    onFeedback={(vote, reason?) => handleFeedback(vote, reason)}
  />
</Show>
```

### Flusso Dati

```typescript
// 1. UI captura feedback
FeedbackBar.onFeedback = (vote, reason?) => {
  const event = {
    id: crypto.randomUUID(),
    tenantId: "local",
    userId: getCurrentUserId(),
    sessionId: sessionId,
    target: { type: "response", id: messageId },
    vote: vote, // 'up' | 'down'
    reason: reason, // optional string
    ts: Date.now(),
  }

  // 2. Chiama backend
  FeedbackProcessor.process(event)
}
```

### Keyboard Shortcuts

Da aggiungere in `useKeyboard` o `useKeybind`:

```typescript
// Global keyboard handler in app.tsx o session/index.tsx
useKeybind({
  "alt+g": () => submitQuickFeedback("up"),
  "alt+b": () => submitQuickFeedback("down"),
})
```

---

## 5. Schema Feedback Backend (già implementato)

```typescript
// packages/opencode/src/kiloclaw/feedback/contract.ts
FeedbackEvent = {
  id: uuid,
  tenantId: string,
  userId?: string,
  sessionId?: string,
  target: {
    type: 'response' | 'task' | 'proactive_action' | 'memory_retrieval',
    id: string
  },
  vote: 'up' | 'down',
  reason?: FeedbackReasonCode,  // wrong_fact, irrelevant, etc.
  correction?: string,           // per feedback negativo
  ts: number
}
```

---

## 6. Piano Implementazione

### Step 1: FeedbackBar Component ✅

- [x] Creare `feedback-bar.tsx`
- [x] UI: 👍 👎 buttons con styling minimal
- [x] Animazione fade-in
- [x] **NO timeout** - resta visibile fino a interazione
- [x] Conferma visiva "✓ Feedback registrato - Grazie!"
- [x] `stopPropagation` per evitare bubbling eventi
- [x] Keyboard shortcuts - **Non implementato** (OpenTUI non espone `alt` modifier)

### Step 2: Integrazione Sessione ✅

- [x] Mostrare FeedbackBar sotto ultimo messaggio assistant
- [x] Logica: solo dopo streaming completato
- [x] Auto-hide quando utente invia follow-up (`pendingFeedbackMessageId`)

### Step 3: Feedback Negativo Categorico ✅

- [x] 7 categorie predefinite (invece di free-text)
- [x] Pulsanti "Invia" / "Salta"
- [x] Integrato con FeedbackProcessor

### Step 4: Backend Integration ✅

- [x] Collegare UI a FeedbackProcessor
- [x] MemoryDb singleton initialization fix
- [x] Test end-to-end

### Step 5: Session Feedback on Exit ✅

- [x] `SessionFeedbackDialog` per feedback su exit
- [x] Intercettazione comandi exit (`/exit`, `/new`, `/sessions`, `exit`, Ctrl+D, Ctrl+C)
- [x] `pendingExitAction` callback per eseguire exit DOPO feedback
- [x] `requestSessionFeedback()` con callback opzionale

---

## 7. Acceptance Criteria

1. ✅ Utente vede barra feedback dopo ogni risposta
2. ✅ Click su 👍 registra feedback "up" e nasconde barra
3. ✅ Click su 👎 mostra categorie predefinite (no free-text)
4. ✅ Shortcut Alt+G / Alt+B - **Non implementato** per limitazioni OpenTUI
5. ✅ Feedback appare in `feedback_events` DB
6. ✅ Feedback viene processato da FeedbackLearner
7. ✅ UI è minimal e non intrusiva
8. ✅ NO timeout - resta visibile fino a interazione
9. ✅ Session feedback chiesto prima di exit commands
10. ⏳ Rate di feedback > 10% - **Da verificare in produzione**

---

## 8. File Modificati/Creati

### Core Implementation

| File                              | Descrizione                                                       |
| --------------------------------- | ----------------------------------------------------------------- |
| `routes/session/feedback-bar.tsx` | Componente FeedbackBar + SessionFeedbackDialog                    |
| `routes/session/index.tsx`        | Integrazione FeedbackBar, show dialog on pending session feedback |
| `component/prompt/index.tsx`      | Intercetta `exit` command, Ctrl+D, Ctrl+C                         |
| `app.tsx`                         | Intercetta `/exit`, `/new`, `/sessions` commands                  |

### Backend (già esistenti)

| File                             | Ruolo                       |
| -------------------------------- | --------------------------- |
| `kiloclaw/feedback/contract.ts`  | FeedbackReasonCode enum     |
| `kiloclaw/feedback/processor.ts` | FeedbackProcessor.process() |
| `kiloclaw/memory/memory.db.ts`   | MemoryDb singleton init     |

---

## 9. Comandi Utili

```bash
# Test interattivo
bun run dev

# Verifica feedback nel DB
cd packages/opencode && bun -e "
const db = require('bun:sqlite');
const sqlite = new db.Database('.kilocode/memory.db');
console.log(JSON.stringify(sqlite.query(
  'SELECT * FROM feedback_events ORDER BY created_at DESC LIMIT 10'
).all(), null, 2));
"

# Typecheck
bun run typecheck
```

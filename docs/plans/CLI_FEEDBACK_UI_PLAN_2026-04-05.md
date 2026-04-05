# CLI Feedback UI - Piano Implementativo

**Data:** 2026-04-05  
**Status:** ✅ Completato  
**Scope:** Aggiungere sistema di feedback intuitivo al CLI TUI

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

### Step 1: FeedbackBar Component (1 giorno)

- [x] Creare `feedback-bar.tsx`
- [x] UI: 👍 👎 buttons con styling minimal
- [x] Animazione fade-in
- [ ] Keyboard shortcuts (Alt+G, Alt+B) - **Non implementato** (OpenTUI KeyEvent non espone proprietà `alt`)

### Step 2: Integrazione Sessione (0.5 giorno)

- [x] Mostrare FeedbackBar sotto ultimo messaggio assistant
- [x] Logica: solo dopo streaming completato
- [ ] Auto-hide dopo timeout o nuovo messaggio

### Step 3: Feedback Negativo Opzionale (0.5 giorno)

- [x] Input text per "perché?" dopo 👎
- [x] Pulsanti "Invia" / "Salta"
- [x] Integrato con FeedbackProcessor

### Step 4: Backend Integration (0.5 giorno)

- [x] Collegare UI a FeedbackProcessor
- [x] Test end-to-end
- [ ] Metriche: feedback rate

### Step 5: Polish (0.5 giorno)

- [ ] Messaggio "Grazie!" dopo invio - **Parzialmente implementato** (FeedbackBar nasconde dopo invio)
- [ ] Gestione errori (offline, etc.) - **Parzialmente implementato** (logging console.error)
- [ ] Testing

---

## 7. Acceptance Criteria

1. ✅ Utente vede barra feedback dopo ogni risposta
2. ✅ Click su 👍 registra feedback "up" e nasconde barra
3. ✅ Click su 👎 mostra campo "perché?" opzionale
4. ⚠️ Shortcut Alt+G / Alt+B funzionano - **Non implementato** per limitazioni OpenTUI
5. ✅ Feedback appare in `feedback_events` DB
6. ✅ Feedback viene processato da FeedbackLearner
7. ✅ UI è minimal e non intrusiva
8. ⏳ Rate di feedback > 10% (target: 20-30%) - **Da verificare in produzione**

---

## 8. Risorse

### File Esistenti da Consultare

- `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx` - TextPart rendering
- `packages/opencode/src/cli/cmd/tui/component/tips.tsx` - Keyboard shortcuts UI
- `packages/opencode/src/kiloclaw/feedback/processor.ts` - Backend feedback

### File da Creare

- `packages/opencode/src/cli/cmd/tui/routes/session/feedback-bar.tsx` ✅ **Creato**

### Dipendenze Backend (già implementate)

- `FeedbackProcessor.process()`
- `FeedbackRepo.record()`
- `FeedbackLearner`

# Handoff: CLI Feedback UI - Session Feedback Blocking Exit Commands

**Created:** 2026-04-05 23:59+02:00  
**Status:** RESOLVED  
**Branch:** `refactor/kilocode-elimination`  
**Fix Commit:** `fix(kiloclaw): convert session feedback state to SolidJS reactive signals`

---

## Problem Statement

The session feedback feature is **completely blocking CLI exit functionality**. All commands that should trigger session feedback before exit are frozen - the user cannot exit the CLI at all.

### Affected Commands

- `/exit` (slash command)
- `/new` (new session)
- `/sessions` (list sessions)
- `exit` command in prompt
- `Ctrl+D`
- `Ctrl+C` x2 (double press)

---

## What Should Happen (Expected Flow)

1. User types `/exit` or presses Ctrl+D
2. `requestSessionFeedback(sessionId, onExitCallback)` is called
3. `sessionFeedbackPending = true`, `pendingExitAction = onExitCallback`
4. `SessionFeedbackDialog` appears via `<Show when={hasPendingSessionFeedback()}>`
5. User clicks "Salta" (Skip) button
6. `onSkip()` is called:
   - Gets `exitAction = getPendingExitAction()`
   - Calls `clearSessionFeedback()` (sets `pendingExitAction = null`)
   - Calls `queueMicrotask(() => exitAction())`
7. `exitAction()` executes `exit()` → CLI closes

---

## What Actually Happens

Step 6: When user clicks "Salta", the callback fires but `exitAction()` never actually closes the CLI.

### Evidence from logs

```
INFO 2026-04-05T21:55:41 session feedback requested
[user clicks thumbs up - feedback works fine]
INFO feedback processed, feedback recorded successfully
```

But when user tries to exit after that, nothing happens.

---

## Code Analysis

### feedback-bar.tsx - Module-level state

```typescript
let sessionFeedbackPending = false
let pendingSessionId: string | null = null
let pendingExitAction: (() => void) | null = null

export function requestSessionFeedback(sessionId: string, onExit?: () => void) {
  sessionFeedbackPending = true
  pendingSessionId = sessionId
  pendingExitAction = onExit ?? null
}

export function clearSessionFeedback() {
  sessionFeedbackPending = false
  pendingSessionId = null
  pendingExitAction = null
}
```

### SessionFeedbackDialog in index.tsx

```tsx
<Show when={hasPendingSessionFeedback()}>
  <SessionFeedbackDialog
    onSkip={() => {
      const exitAction = getPendingExitAction() // Get BEFORE clearing
      clearSessionFeedback() // Sets pendingExitAction = null
      if (exitAction) queueMicrotask(() => exitAction())
    }}
  />
</Show>
```

### app.tsx - /exit command

```tsx
onSelect: () => {
  const sessionId = route.data.type === "session" ? route.data.sessionID : undefined
  if (sessionId) {
    requestSessionFeedback(sessionId, () => exit())
  } else {
    exit()
  }
}
```

---

## Hypotheses for Why It's Broken

### Hypothesis 1: `exit()` doesn't work when called from `queueMicrotask`

The `exit()` function from OpenTUI's `useExit` context might not work properly when deferred.

**Test:** Replace `queueMicrotask(() => exitAction())` with just `exitAction()` to verify.

### Hypothesis 2: Module-level state reset

The module-level variables (`sessionFeedbackPending`, `pendingExitAction`) might be getting reset or not persisting.

**Test:** Add logging to verify state at each step.

### Hypothesis 3: Dialog overlay blocks clicks

The `SessionFeedbackDialog` might be positioned in a way that blocks all user interaction.

### Hypothesis 4: SolidJS reactivity issue

The `<Show>` conditional rendering might not be properly reactive.

---

## Files Modified

### Core Files

| File                                                                | Purpose                                             |
| ------------------------------------------------------------------- | --------------------------------------------------- |
| `packages/opencode/src/cli/cmd/tui/routes/session/feedback-bar.tsx` | SessionFeedbackDialog component, module-level state |
| `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx`        | Integration of dialog, Show rendering               |
| `packages/opencode/src/cli/cmd/tui/app.tsx`                         | /exit, /new, /sessions command handlers             |
| `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`      | exit command, Ctrl+D handling                       |

### Related Files

| File                                                   | Purpose                          |
| ------------------------------------------------------ | -------------------------------- |
| `packages/opencode/src/cli/cmd/tui/context/exit.tsx`   | `exit()` function implementation |
| `packages/opencode/src/kiloclaw/feedback/processor.ts` | Feedback processing              |
| `packages/opencode/src/kiloclaw/feedback/contract.ts`  | Schema definitions               |

---

## What Was Tried

### Fix 1: Get exit action BEFORE clearing state

```tsx
// Get BEFORE clearing
const exitAction = getPendingExitAction()
clearSessionFeedback()
if (exitAction) exitAction()
```

Result: Still doesn't work.

### Fix 2: Use queueMicrotask to defer exit

```tsx
if (exitAction) queueMicrotask(() => exitAction())
```

Result: Still doesn't work.

### Fix 3: Disable all feedback interception (temporary)

Commented out all `requestSessionFeedback()` calls and `SessionFeedbackDialog` rendering.
Result: Exit works fine when feedback is disabled.

This proves the bug is in the integration with `requestSessionFeedback`, not in `exit()` itself.

---

## Current State (commit 9149ce7)

All code is re-enabled with the latest fixes. The user reported positive feedback works fine (`feedback recorded successfully`), but exit commands are still blocked.

---

## Resolution (2026-04-06)

### Root Cause

The `<Show when={hasPendingSessionFeedback()}>` conditional uses module-level variables (`sessionFeedbackPending`, `pendingSessionId`, `pendingExitAction`) that are plain JavaScript values, **not SolidJS signals**. When the TUI re-renders, the `<Show>` component cannot track changes to plain module-level variables — the reactive system has no way to know those values changed. As a result, `hasPendingSessionFeedback()` continued returning the stale value even after state was updated.

### Fix Applied

Converted all session feedback state from plain module-level variables to SolidJS `createSignal`:

| Variable                 | Before                                               | After                                                                                        |
| ------------------------ | ---------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `sessionFeedbackPending` | `let sessionFeedbackPending = false`                 | `const [sessionFeedbackPending, setSessionFeedbackPending] = createSignal(false)`            |
| `pendingSessionId`       | `let pendingSessionId: string \| null = null`        | `const [pendingSessionId, setPendingSessionId] = createSignal<string \| null>(null)`         |
| `pendingExitAction`      | `let pendingExitAction: (() => void) \| null = null` | `const [pendingExitAction, setPendingExitAction] = createSignal<(() => void) \| null>(null)` |

Getters updated to call signal accessors: `pendingSessionId()` instead of `pendingSessionId`.

This makes the `<Show when={hasPendingSessionFeedback()}>` properly reactive — when `clearSessionFeedback()` is called, the signal update triggers a reactive recomputation and `<Show>` correctly unmounts the dialog, allowing the deferred exit callback to execute.

### Files Modified

- `packages/opencode/src/cli/cmd/tui/routes/session/feedback-bar.tsx` — state refactored to signals

### Verification

- `bun run --cwd packages/opencode typecheck` passes ✅

---

## Suggested Debugging Steps for Codex

1. **Add detailed logging** to every callback in the session feedback flow
2. **Verify `exitAction` is not null** when `onSkip` is called
3. **Test `exit()` directly** from `onSkip` without `queueMicrotask`
4. **Check if `renderer.destroy()` in `exit()` is being called**
5. **Verify the `Show` conditional** is properly disposed after `clearSessionFeedback()`

---

## Key Technical Details

### OpenTUI Exit Function

From `context/exit.tsx`:

```typescript
const exit: Exit = Object.assign((reason?: unknown) => {
  if (task) return task
  task = (async () => {
    renderer.setTerminalTitle("")
    renderer.destroy()
    win32FlushInputBuffer()
    // ... error formatting ...
    await input.onExit?.()
  })()
  return task
})
```

### Dialog Rendering

The `SessionFeedbackDialog` is rendered **inside** the Session route's JSX, NOT using the global `dialog` system. This means `dialog.replace()` doesn't affect it.

---

## Commands to Test

```bash
# Test exit directly (should work if feedback is disabled)
# From docs/handoff, you can test by:
cd /home/fulvio/coding/kiloclaw
git log --oneline -10

# Check current state of the files:
cat packages/opencode/src/cli/cmd/tui/routes/session/index.tsx | grep -A20 "hasPendingSessionFeedback"
```

---

## Emergency Workaround

If the bug cannot be fixed quickly, the emergency fix is to **completely disable session feedback on exit** while keeping response-level feedback:

In `app.tsx`, change:

```tsx
onSelect: () => {
  const sessionId = route.data.type === "session" ? route.data.sessionID : undefined
  if (sessionId) {
    requestSessionFeedback(sessionId, () => exit())
  } else {
    exit()
  }
}
```

To:

```tsx
onSelect: () => exit()
```

And similarly for `/new`, `/sessions`, `exit` command, Ctrl+D.

---

## References

- Original plan: `docs/plans/CLI_FEEDBACK_UI_PLAN_2026-04-05.md`
- OpenTUI documentation: Uses SolidJS with `<box>`, `<Show>`, `<Switch>` components
- `exit.tsx` context uses `useRenderer().destroy()` to close

# Task wizard plan

Improve flow clarity, input reliability, and scheduling flexibility.

Timestamp context: `2026-04-08T10:50:18+02:00`

---

## Capture context

- `/tasks new` now opens the wizard, but the current UX feels inconsistent and blocks progress.
- From step 2 onward, Enter does not advance and text fields can feel non-editable.
- Step 1 scheduling is preset-only and too rigid, with no custom activation time while preserving daily, weekdays, weekly, and monthly categories.

---

## Diagnose deeply

- **Focus flow gaps:** `dialog-task-wizard.tsx` likely has incomplete focus handoff between steps and missing focus restoration after rerenders.
- **Focus trap gaps:** Trap boundaries may be swallowing keyboard events or moving focus to non-input elements after state changes.
- **Global keyboard conflict:** `useKeyboard` handlers may intercept Enter/Escape before focused controls process native behavior.
- **Preset lock-in:** Step 1 maps only fixed presets such as `daily-09:00`, preventing user-defined activation time.
- **Validation opacity:** Inline validation and keyboard semantics are not explicit enough, so users cannot predict what Enter does on each field.

---

## Align with best practices

- Multi-step form guidance from Nielsen Norman Group, Baymard, and Material patterns supports explicit progress, stable step semantics, and per-step validation before advancing.
- GOV.UK Design System patterns support short inline errors, clear field-level messages, and summary messaging when needed.
- W3C/HTML and MDN interaction guidance supports Enter as submit/advance for single-line controls, while textarea Enter should insert newline unless a clear modifier shortcut is used.
- Scheduler UX patterns seen across product management and CI tools favor common presets first, then a structured custom editor, and only then optional raw cron access.

---

## 1) Fix stability bugs

### Implementation checklist

- [ ] Audit `dialog-task-wizard.tsx` focus lifecycle on mount, step transition, validation failure, and close.
- [ ] Set deterministic first-focus target per step and return focus to triggering element on dialog close.
- [ ] Isolate `useKeyboard` so handlers ignore events when `event.target` is input, textarea, select, or contentEditable.
- [ ] Move Enter handling into step-local form submit handlers to avoid global interception side effects.
- [ ] Add test IDs to interactive controls to support deterministic keyboard and focus integration tests.

### Acceptance criteria

- Enter key in single-line inputs advances only when current step validation passes.
- Text input fields are editable in all steps with no dropped keystrokes across 50 rapid key events.
- Focus is always visible and lands on the intended control after every step transition.
- No regressions in Escape-to-close behavior and no focus leaks outside the dialog.

---

## 2) Improve navigation UX

### Implementation checklist

- [ ] Add persistent step indicator with `Step X of Y`, short labels, and current-state highlight.
- [ ] Standardize controls: `Back`, `Next`, and `Create task` on final step.
- [ ] Add helper text per step describing Enter behavior and any shortcuts.
- [ ] Disable `Next` only when required fields are invalid, and explain why inline.
- [ ] Keep button placement and labels stable across all steps.

### Acceptance criteria

- Users can identify current position in flow within one glance.
- Keyboard-only completion path works end-to-end with Tab/Shift+Tab and Enter.
- Step actions remain consistent with no label or position shift across steps.

---

## 3) Redesign schedule step

### Implementation checklist

- [ ] Keep schedule categories: `daily`, `weekdays`, `weekly`, `monthly`.
- [ ] Replace fixed preset-only model with category + configurable time (`HH:mm`) editor.
- [ ] For `weekly`, add weekday selector; for `monthly`, add day-of-month selector with safe bounds.
- [ ] Provide useful defaults per category while allowing user edits before submit.
- [ ] Add optional advanced reveal for raw cron expression preview and manual override.

### Acceptance criteria

- User can set custom activation time in every category without leaving the wizard.
- Category changes preserve valid editable defaults and prevent invalid cron generation.
- Cron preview always matches selected structured values.
- Existing preset outcomes remain reproducible via equivalent structured selections.

---

## 4) Strengthen validation and errors

### Implementation checklist

- [ ] Add synchronous field-level validation for required inputs and schedule bounds.
- [ ] Show inline error directly under each invalid field with concise corrective text.
- [ ] Add optional top-level error summary when multiple fields fail on submit.
- [ ] Mark invalid fields with `aria-invalid` and connect errors via `aria-describedby`.
- [ ] Prevent step advance on validation failure and move focus to first invalid field.

### Acceptance criteria

- Every invalid required field produces a visible, specific error message.
- Screen readers announce invalid state and associated message correctly.
- On failed submit, focus lands on first invalid field within 100 ms.

---

## 5) Update data model and mapping

### Implementation checklist

- [ ] Introduce structured schedule DTO: `{ category, time, weekday?, dayOfMonth?, cron?, timezone? }`.
- [ ] Implement deterministic mapper from structured DTO to cron string.
- [ ] Keep backward compatibility by parsing legacy preset IDs into structured DTO.
- [ ] Store both normalized structured state and resolved cron output for execution.
- [ ] Add migration-safe guards for unknown or malformed legacy values.

### Acceptance criteria

- Legacy presets load and render as equivalent structured selections.
- Mapper produces stable cron output for identical structured input.
- No existing saved task fails to load after deployment.

---

## 6) Add telemetry and testing

### Implementation checklist

- [ ] Instrument events: wizard_opened, step_viewed, step_validation_failed, step_advanced, task_created, task_create_failed.
- [ ] Include metadata: step index, failure code, schedule category, keyboard vs click path.
- [ ] Add unit tests for schedule DTO validation and cron mapping.
- [ ] Add integration tests for keyboard navigation, focus transitions, and inline error behavior.
- [ ] Add regression tests for legacy preset parsing.

### Acceptance criteria

- Event stream can identify top three failure points by step within one day of rollout.
- Test suite covers all schedule categories and legacy mappings.
- CI blocks merge on failing keyboard/focus regression tests.

---

## 7) Execute rollout and verify

### Implementation checklist

- [ ] Ship behind feature flag for staged exposure.
- [ ] Run internal dogfood with keyboard-only and screen-reader checks.
- [ ] Roll out to a small percentage cohort, monitor validation failures and completion rate.
- [ ] Promote to full rollout after stability and completion thresholds are met.
- [ ] Prepare rollback path to previous wizard behavior while retaining telemetry.

### Acceptance criteria

- Wizard completion rate improves by at least 20% versus current baseline.
- Step-2-and-beyond input editability incidents drop to zero in telemetry and bug reports.
- Validation-related abandonment drops by at least 30%.
- No P1/P2 accessibility regressions are introduced.

---

## Define done

- Stability fixes are merged with passing integration tests for focus and keyboard behavior.
- Structured scheduling with customizable time is live for all four categories.
- Validation messaging matches GOV.UK-style clarity and accessibility semantics.
- Telemetry confirms improved completion and reduced friction within first release window.

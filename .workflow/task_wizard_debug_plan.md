# Task Wizard Debug Enhancement Plan

**Started:** 2026-04-08T10:53:00+02:00
**Reference:** `docs/plans/KILOCLAW_TASK_WIZARD_DEBUG_ENHANCEMENT_PLAN_2026-04-08.md`

## Goal

Improve flow clarity, input reliability, and scheduling flexibility for the Task Wizard (`/tasks new`).

---

## Phase 1: Stability Bugs (Keyboard/Focus)

### Issues

- `useKeyboard` intercepts Enter/Escape before focused controls process them
- Focus doesn't restore after step transitions
- Text fields non-editable from step 2 onward

### Fixes

- [x] Isolate `useKeyboard` to ignore events when `event.target` is input/textarea/select
- [x] Add deterministic first-focus target per step
- [x] Return focus to triggering element on dialog close
- [x] Move Enter handling into step-local form submit handlers
- [x] Add test IDs to interactive controls

### Files Modified

- `packages/opencode/src/cli/cmd/tui/ui/dialog-task-wizard.tsx`

---

## Phase 2: Navigation UX

### Improvements

- [ ] Persistent step indicator with `Step X of Y`, labels, current-state highlight
- [ ] Standardize controls: `Back`, `Next`, `Create task` on final step
- [ ] Helper text per step describing Enter behavior
- [ ] Disable `Next` only when required fields invalid, explain inline
- [ ] Stable button placement and labels across steps

### Acceptance

- [ ] Users can identify current position in flow within one glance
- [ ] Keyboard-only completion path works end-to-end

---

## Phase 3: Schedule Step Redesign

### Current Problem

Preset-only model with fixed times like `daily-09:00`, `weekdays-09:00` etc.

### New Structure

- Keep categories: `daily`, `weekdays`, `weekly`, `monthly`
- Category + configurable time (HH:mm) editor
- For `weekly`: weekday selector
- For `monthly`: day-of-month selector
- Optional raw cron preview and override

### Files to Modify

- `packages/opencode/src/cli/cmd/tui/ui/dialog-task-wizard.tsx` (ScheduleStep)
- `packages/opencode/src/kiloclaw/proactive/scheduled-task.ts` (DTO schema)
- `packages/opencode/src/kiloclaw/proactive/schedule-parse.ts` (mapper)

---

## Phase 4: Validation & Errors

### Improvements

- [ ] Synchronous field-level validation for required inputs
- [ ] Inline error under each invalid field
- [ ] Optional top-level error summary
- [ ] `aria-invalid` and `aria-describedby` attributes
- [ ] Prevent step advance on validation failure, focus first invalid field

### Acceptance

- [ ] Every invalid required field produces visible, specific error message
- [ ] Screen readers announce invalid state correctly
- [ ] On failed submit, focus lands on first invalid field within 100ms

---

## Phase 5: Data Model & Mapping

### New Structured Schedule DTO

```typescript
{
  category: "daily" | "weekdays" | "weekly" | "monthly"
  time: string // HH:mm format
  weekday?: number // 0-6 for weekly
  dayOfMonth?: number // 1-31 for monthly
  cron?: string // advanced override
  timezone?: string
}
```

### Mapper Requirements

- [ ] Deterministic mapper from structured DTO to cron string
- [ ] Backward compatibility: parse legacy preset IDs into structured DTO
- [ ] Migration-safe guards for unknown/malformed legacy values

---

## Phase 6: Telemetry

### Events to Add

- `wizard_step_viewed` - when step becomes visible
- `wizard_step_validation_failed` - when validation fails
- `wizard_step_advanced` - successful step transition
- `wizard_input_changed` - field value changes (for editability tracking)

### Metadata

- step index, failure code, schedule category
- keyboard vs click path

---

## Phase 7: Testing

### Unit Tests

- [ ] Schedule DTO validation
- [ ] Cron mapping for all categories
- [ ] Legacy preset parsing

### Integration Tests

- [ ] Keyboard navigation
- [ ] Focus transitions
- [ ] Inline error behavior
- [ ] Regression tests for legacy preset

---

## Errors Encountered

| Error | Resolution |
| ----- | ---------- |
| TBD   | TBD        |

---

## Implementation Log

| Date       | Phase | Status      | Notes                 |
| ---------- | ----- | ----------- | --------------------- |
| 2026-04-08 | 1     | in_progress | Creating task_plan.md |

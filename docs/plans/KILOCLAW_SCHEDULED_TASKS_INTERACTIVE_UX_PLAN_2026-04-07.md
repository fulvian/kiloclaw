---
title: "Task UX"
description: "Interactive scheduling with guided terminal workflows"
---

# Task UX

## Align outcome

This plan upgrades scheduled-task UX from flag-heavy CLI usage to interactive-first flows.
It extends `docs/plans/KILOCLAW_SCHEDULED_TASKS_UX_RUNTIME_SPEC_2026-04-07.md` without changing its runtime safety contract.

- Keep the baseline runtime semantics from sections 4-13 of the spec.
- Shift the default entry point to slash commands, guided wizard steps, and management views in TUI.
- Preserve automation through explicit non-interactive paths and stable JSON output.

---

## Set architecture

- **Primary interaction layers**
  - Slash launcher in prompt (`/tasks`, `/tasks new`, `/tasks show <id>`)
  - Guided wizard for create and edit
  - Browse views for status, runs, failures, and DLQ
- **Data and runtime source of truth**
  - Keep scheduled state in `ProactiveTaskStore` and `ProactiveSchedulerEngine`
  - Reuse `scheduled-task.ts` and `schedule-parse.ts` for validation and preview
- **Discoverability model**
  - Mirror Slack/Mattermost style: one root slash entry with sub-actions and inline help
  - Mirror VS Code palette style: searchable command dialog entries with short descriptions
- **Progressive disclosure**
  - Default view shows name, schedule, next run, status
  - Advanced knobs appear only in wizard advanced step and detail side panel

---

## Define grammar

Use one canonical slash root: `/tasks`.
Subcommands are parsed from argument text, matching GH CLI dual-mode behavior.

```text
<input>          ::= "/tasks" [<ws> <subcmd>]
<subcmd>         ::= "help"
                   | "new" [<ws> "--advanced"]
                   | "list" [<ws> <list_opts>]
                   | "show" <ws> <task_id>
                   | "edit" <ws> <task_id>
                   | "pause" <ws> <task_id>
                   | "resume" <ws> <task_id>
                   | "run" <ws> <task_id>
                   | "delete" <ws> <task_id>
                   | "runs" <ws> <task_id> [<ws> <run_opts>]
                   | "dlq" [<ws> <dlq_opts>]
                   | "replay" <ws> <dlq_id>
<list_opts>      ::= ["--status" <ws> <status>] [<ws> "--json"]
<run_opts>       ::= ["--failed"] [<ws> "--limit" <ws> <int>] [<ws> "--json"]
<dlq_opts>       ::= ["--task" <ws> <task_id>] [<ws> "--ready"] [<ws> "--json"]
<status>         ::= "active" | "paused" | "dlq"
```

- `/tasks` with no args opens the management list and keeps focus in TUI.
- `/tasks new` opens wizard step 1 with simple defaults prefilled.
- `/tasks new --advanced` opens wizard with advanced section expanded.
- `/tasks help` renders command reference and examples in an in-app dialog.
- Invalid forms return one-line usage hints and keep the input intact.

---

## Design wizard

- **State machine**
  - `idle -> schedule -> intent -> reliability -> policy -> review -> saving -> done`
  - `* -> canceled` and `* -> error` transitions keep draft data
  - `error -> review` allows correction without data loss
- **Step content**
  - `schedule`: preset vs cron, timezone, DST policy, next two runs preview
  - `intent`: name and prompt payload
  - `reliability`: retry, backoff, concurrency, missed-run behavior
  - `policy`: approval mode and quiet hours
  - `review`: plain-language summary plus risk and gate expectations
- **Validation**
  - Field-level validation at step exit using `ScheduledTaskCreateSchema` and `validateSchedule`
  - Cross-field validation in review, including timezone and quiet-hour constraints
  - Human errors follow `cause + fix` format in one line
- **Draft handling**
  - Autosave after every valid step transition
  - Draft key format: `tui.tasks.wizard.<session_or_global>.<draft_id>` in TUI KV state
  - Resume prompt appears when opening `/tasks new` with an unfinished draft
  - Draft expiry defaults to 7 days, with explicit discard action

---

## Build views

- **List view**
  - Columns: `id`, `name`, `schedule`, `nextRun`, `status`, `lastOutcome`
  - Filters: status, timezone, text search, failed-only
  - Actions: create, edit, pause, resume, run now, show details, delete
- **Detail view**
  - Header: core identity and upcoming run window
  - Panels: runtime knobs, policy controls, gate summary, last error
  - Actions: open runs, open DLQ entries, edit, pause/resume, run now
- **Runs view**
  - Paginated table for `scheduled_task_run` style fields from `ProactiveTaskStore.getRuns`
  - Quick filters for `failed`, `blocked`, `policy_denied`, `budget_exceeded`
  - Expand row for attempt timing, correlation, idempotency, gate reasons
- **Failure and DLQ view**
  - Unified error board grouped by task
  - Retry actions: replay one, replay selected, clear entry after replay success
  - Guardrail: replay still executes policy checks and approval requirements

---

## Keep compatibility

- Interactive-first is default for humans, not for scripts.
- Existing `kilo task` commands remain available and unchanged in phase 1.

- **Mode rules**
  - TTY interactive use: wizard and TUI views by default
  - Non-TTY or `--json`: current non-interactive behavior remains deterministic
  - Add `kilo task create --interactive` and `kilo task update --interactive` as explicit bridge
- **Migration rules**
  - All slash and wizard actions call the same underlying create/update functions as CLI flags
  - Keep output contract parity by sharing formatter helpers for both paths
  - Maintain compatibility alias `kiloclaw task` unchanged
- **Automation guarantees**
  - No required prompts when `--json` or `--non-interactive` is set
  - Exit codes and error messages stay stable for CI scripts

---

## Map implementation

Phase order is designed to ship value early while containing risk.
Each phase maps to existing repo surfaces and concrete file targets.

### Phase 1: Add slash entry and parser

- Extend slash metadata and command registration in `packages/opencode/src/cli/cmd/tui/app.tsx`
- Add prompt-level `/tasks` command parsing in `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`
- Add task-specific TUI event shapes in `packages/opencode/src/cli/cmd/tui/event.ts`
- Add transport hooks for new events in `packages/opencode/src/server/routes/tui.ts`
- Add `task help` renderer dialog in `packages/opencode/src/cli/cmd/tui/ui` (new task help file)

### Phase 2: Build wizard primitives

- Add wizard component and per-step subcomponents under `packages/opencode/src/cli/cmd/tui/component` (new task wizard files)
- Add draft persistence helpers in `packages/opencode/src/cli/cmd/tui/context/kv.tsx` call sites
- Reuse validation from `packages/opencode/src/kiloclaw/proactive/scheduled-task.ts`
- Reuse next-run preview from `packages/opencode/src/kiloclaw/proactive/schedule-parse.ts`
- Add create/update service adapter in `packages/opencode/src/cli/cmd/task.ts` (shared invocation helper)

### Phase 3: Build management and monitoring views

- Add list/detail/runs/DLQ dialogs under `packages/opencode/src/cli/cmd/tui/component` (new task dialog files)
- Wire list and detail actions to store methods in `packages/opencode/src/kiloclaw/proactive/scheduler.store.ts`
- Surface run execution and replay actions through `packages/opencode/src/kiloclaw/proactive/scheduler.engine.ts`
- Add explainability strings from `packages/opencode/src/kiloclaw/proactive/explain.ts`

### Phase 4: Unify interactive and non-interactive command paths

- Extract shared formatter and action functions from `packages/opencode/src/cli/cmd/task.ts`
- Add dual-mode switches and strict non-interactive guards in `packages/opencode/src/cli/cmd/task.ts`
- Keep existing command signatures stable and add interactive flags only as additive

### Phase 5: Harden telemetry and rollout controls

- Add UX telemetry emission points in `packages/opencode/src/cli/cmd/tui` surfaces
- Add metrics hooks in `packages/opencode/src/kiloclaw/proactive/scheduler.engine.ts`
- Gate features with runtime flags in config/flag access points (`@/flag/flag` usage sites)
- Add rollout docs in `docs/plans` and operational notes in `docs/guide` if needed

---

## Verify behavior

- **Unit tests**
  - Slash parser coverage for all grammar branches
  - Wizard step validators and draft serialization
  - Schedule preview edge cases around timezone and DST
- **Integration tests**
  - End-to-end create and edit through shared service adapter
  - Runs and DLQ actions against `ProactiveTaskStore`
  - Compatibility checks for `--json` and non-interactive mode
- **E2E tests**
  - TUI flow test for `/tasks new` to save
  - TUI flow test for `/tasks`, open detail, run now, inspect last run
  - TUI flow test for DLQ replay path
- **Manual checks**
  - Keyboard-only navigation and escape behavior
  - Low-height terminal layout resilience
  - Clear error copy for blocked policy and invalid cron

Suggested test files:

- `packages/opencode/test/cli/task-command.test.ts`
- `packages/opencode/test/kiloclaw/scheduled-task-schema.test.ts`
- `packages/opencode/test/kiloclaw/scheduled-task-runtime.test.ts`
- `packages/opencode/test/cli/tui/thread.test.ts` plus new task-specific TUI tests

Acceptance criteria:

1. `/tasks` opens list view in one action from prompt.
2. `/tasks new` completes create flow without any required flags.
3. Wizard resume restores all prior draft fields exactly.
4. List and detail views reflect persisted values from store.
5. Runs view shows correlation and gate outcome for latest run.
6. DLQ replay action creates a new run and links source entry.
7. `kilo task create --json` remains non-interactive and schema-stable.
8. `kilo task update` with existing flags behaves exactly as before.

---

## Measure rollout

- **Product metrics**
  - `tasks_ux_opened_total`
  - `tasks_wizard_started_total`
  - `tasks_wizard_completed_total`
  - `tasks_wizard_abandoned_total`
  - `tasks_action_total{action}` for pause/resume/run/replay/delete
- **Quality metrics**
  - Validation error rate per step
  - Time-to-create and time-to-fix after first failure
  - Replay success ratio and DLQ re-entry ratio
- **Rollout guards**
  - `KILOCLAW_TASKS_TUI_ENABLED` for slash and views
  - `KILOCLAW_TASKS_WIZARD_ENABLED` for guided flow
  - `KILOCLAW_TASKS_TUI_MONITORING_ENABLED` for runs and DLQ screens
  - Keep baseline flags from runtime spec for scheduler and migration
- **Kill switches**
  - Disable wizard and views independently
  - Force fallback to existing `kilo task` command handlers

---

## Manage risks

| Risk                                  | Impact                | Mitigation                                                                  |
| ------------------------------------- | --------------------- | --------------------------------------------------------------------------- |
| Parser ambiguity in free-form prompt  | Wrong action dispatch | Restrict `/tasks` grammar and show usage preview before destructive actions |
| Wizard complexity creates drop-off    | Users return to flags | Keep simple path under 4 steps and hide advanced by default                 |
| Drift between wizard and CLI behavior | Inconsistent outcomes | Route both paths through shared create/update helpers                       |
| TUI overload in small terminals       | Poor usability        | Add compact mode and scroll-safe panels for list/detail                     |
| Replay misuse for risky actions       | Safety regression     | Keep policy and approval gates enforced at runtime only                     |

---

## Set boundaries

- No redesign of scheduler runtime internals beyond integration hooks needed for UX.
- No cross-project orchestration or cloud sync in this iteration.
- No GUI outside terminal and current TUI framework.
- No removal of existing `kilo task` flags in this plan.

---

## Show examples

Slash examples for in-session flows:

```text
/tasks
/tasks help
/tasks new
/tasks new --advanced
/tasks show task_01HZYF4S8M0V6Y6Q7C2N2J9R5A
/tasks edit task_01HZYF4S8M0V6Y6Q7C2N2J9R5A
/tasks runs task_01HZYF4S8M0V6Y6Q7C2N2J9R5A --failed --limit 20
/tasks dlq --ready
/tasks replay dlq_01J0M8Q9E5B3YQ2YQ9A1YH2K4M
```

Wizard interaction example:

```text
Step 1 Schedule
- Preset: weekdays-09:00
- Timezone: Europe/Rome
- Preview: next 2 runs

Step 2 Intent
- Name: weekday summary
- Prompt: summarize open PR risk

Step 3 Reliability
- Retry: exponential, max 3
- Concurrency: forbid

Step 4 Review
- Summary: Runs weekdays at 09:00 Europe/Rome
- Safety: approval auto, quiet hours none
```

Management view action row example:

```text
task_01...  weekday summary  0 9 * * 1-5  2026-04-08T07:00:00Z  active  success
Actions: [Enter details] [r run now] [p pause] [e edit] [d delete]
```

---

## Complete DoD

- [ ] `/tasks` slash root is discoverable in autocomplete and help dialog.
- [ ] Slash grammar routes all supported subcommands with clear error hints.
- [ ] Wizard supports create, edit, save draft, resume draft, and discard draft.
- [ ] Wizard uses baseline schedule/runtime schemas and does not fork validation logic.
- [ ] List/detail/runs/DLQ views are keyboard-navigable and render in small terminals.
- [ ] Run now and replay actions surface gate outcomes and correlation IDs.
- [ ] Existing `kilo task` flag workflows remain backward compatible.
- [ ] Non-interactive and `--json` mode remain prompt-free and script-safe.
- [ ] Unit, integration, and TUI flow tests pass in CI.
- [ ] Telemetry counters, rollout flags, and kill switches are implemented and documented.

---
title: "Scheduled Tasks Enhancement Plan"
description: "Deep analysis and robust enhancement roadmap for scheduling runtime + TUI task management"
date: "2026-04-08"
---

# Scheduler Revamp Plan

Reliable runs, clear status, and durable visibility.

---

## Executive Summary
- Unify schedule computation by replacing timezone-blind `calculateNextRun()` with the existing timezone-aware `nextRuns()` path everywhere.
- Introduce a durable task lifecycle with explicit one-shot vs recurring semantics, archived/completed visibility, and no silent disappearance from task views.
- Add a Task Timeline surface that shows scheduled slot, actual start, finish, outcome, and replay lineage in one place.
- Ship in phases behind feature flags, with hard kill switches for new execution, timeline, and notifications paths.

---

## Current-State Deep Analysis
- Creation and update already parse timezone and compute `nextRunAt` with `nextRuns({ cron, timezone })` in `packages/opencode/src/kiloclaw/proactive/scheduled-task.ts`.
- Runtime success path recomputes `nextRunAt` via simplified `calculateNextRun(task.scheduleCron)` in `packages/opencode/src/kiloclaw/proactive/scheduler.engine.ts`, which ignores timezone and full cron semantics.
- TUI slash parsing only handles `/tasks`, `/tasks list`, `/tasks new` in `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`, while help advertises richer commands in `packages/opencode/src/cli/cmd/tui/ui/dialog-task-help.tsx`.
- Some TUI actions are placeholders: run/replay emit "Phase 4" toasts in `packages/opencode/src/cli/cmd/tui/app.tsx` instead of executing workflows.
- Pause/resume from detail mutates status directly in TUI (`ProactiveTaskStore.update(...status...)`) without robust reschedule semantics in `packages/opencode/src/cli/cmd/tui/app.tsx`.
- Task list/detail/runs/DLQ views read store using `createMemo` with direct store calls and no explicit refresh subscription in `dialog-task-list.tsx`, `dialog-task-detail.tsx`, `dialog-task-runs.tsx`, and `dialog-task-dlq.tsx`.
- Persistence exists in SQLite tables `proactive_tasks`, `proactive_task_runs`, `proactive_dlq`, and `proactive_runtime_lease` in `packages/opencode/src/kiloclaw/proactive/scheduler.store.ts`.
- Status enum includes `completed`, but current scheduler paths do not clearly surface one-off completion lifecycle and archive UX.

---

## Root Cause Hypotheses by symptom
- **Next run shows ~23h after +5m schedule:** runtime recomputation uses hour/minute daily fallback and local clock semantics, not timezone-aware cron expansion.
- **Tasks appear to disappear:** reactive freshness gaps in TUI views can show stale data; status transitions and filtering can hide items without explicit archived/completed surfaces.
- **Execution status unclear:** run/replay placeholders and fragmented views force users to infer state from partial signals.
- **Pause/resume confusion:** direct status toggles can leave `nextRunAt` inconsistent with user intent and trigger policy.
- **Operational uncertainty:** daemon lease exists, but status is not first-class in `/tasks` flows, so users cannot quickly diagnose scheduler liveness.

---

## Target Product UX
- Split creation into explicit **One-shot** and **Recurring** modes with clear copy and defaults.
- Show timezone on every schedule line, with dual rendering: `Local` and `UTC` side by side.
- Keep all tasks visible by default with status chips (`active`, `paused`, `running`, `completed`, `archived`, `dlq`, `failed`), never silently drop completed items.
- Add **Task Timeline** view with rows: scheduled slot, dequeue/start, finish, outcome, retry/replay link, and actor (auto/manual).
- Add explicit actions: `Run now`, `Replay run`, `Replay DLQ entry`, and `Rerun with same payload` with idempotency safeguards.
- Surface daemon health inline in `/tasks` header: `running`, `lease stale`, or `stopped`, plus quick hint command.

---

## Target Runtime Architecture
- Use one schedule engine for both create/update and post-run recompute, based on `nextRuns()` and parsed task timezone.
- Introduce a scheduler coordinator with clear phases: due selection, lease/fence check, execution dispatch, outcome commit, next occurrence commit.
- Add a durable run-state ledger: `queued -> started -> finished|failed|skipped|expired`.
- Treat manual run and replay as first-class execution intents with typed metadata (`intent=manual|replay|scheduled`).
- Keep lease/fencing enforcement in runtime, and include fence token on run rows for leader-safety traceability.

---

## Data Model Enhancements
- Add `schedule_type` to `proactive_tasks`: `one_shot | recurring`.
- Add `state` to `proactive_tasks`: `active | paused | running | completed | archived | dlq | failed`.
- Add `archived_at`, `completed_at`, `last_scheduled_for`, `timezone`, `cron_expr`, and `display_schedule` columns.
- Add `run_type` and `parent_run_id` to `proactive_task_runs` for replay lineage and manual rerun traceability.
- Add `dedupe_window_ms` and `idempotency_scope` to `trigger_config` (or normalized columns) for guardrails.
- Add optional `notifications` config with channel preferences and severity thresholds.

---

## Scheduling Semantics (timezone/DST/misfire)
- Resolve next fire times only through `nextRuns({ cron, timezone })` for all lifecycle points.
- Define one-shot semantics as "consume once then move to completed," never auto-convert to daily recurrence.
- Implement DST policy explicitly: `skip-duplicate` and `run-twice`, using scheduled slot identity rather than wall-clock-only heuristics.
- Implement misfire policy with strict rules: `skip`, `catchup_one`, `catchup_all` bounded by `startingDeadlineMs`.
- Store and display `scheduled_for` separately from `started_at` to preserve intent under delays.
- On resume, recompute from current time and policy, and write an audit event explaining what changed.

---

## Monitoring & Observability
- Emit structured events for lifecycle transitions (`task_state_changed`, `run_started`, `run_finished`, `run_replayed`).
- Add counters and histograms: scheduling latency, execution latency, success rate, replay rate, misfire count.
- Add dashboardable gauges from daemon runtime: lease TTL remaining, pending queue size, DLQ size, tick delay.
- Correlate all events with `task_id`, `run_id`, `trace_id`, `correlation_id`, and `fence_token`.
- Expand health checks to validate scheduler progression, not only lease existence.

---

## TUI/CLI UX Enhancements
- Extend `/tasks` parser to support `show`, `edit`, `runs`, `pause`, `resume`, `run`, `dlq`, `replay`, and `help`.
- Replace Phase-4 toasts with actual action dispatches that execute and then refresh views.
- Add explicit refresh loop or subscription in task dialogs, with bounded polling fallback for local-only mode.
- Add timeline panel in detail and runs screens, and include local+UTC timestamps on all run records.
- Add archive/completed toggles in list filters and default visibility for recently completed one-shot tasks.
- Mirror all key actions in non-interactive CLI with consistent output contracts and JSON schema.

---

## Notification Strategy
- Always show in-app toast for run failure, DLQ move, replay success, and state transitions.
- Add CLI summary digest command for recent activity and pending issues.
- Add optional channels: desktop notification, webhook, and email, each controlled by per-task policy.
- Sign webhook payloads and include replay-safe identifiers.
- Batch low-priority successes to reduce noise and alert fatigue.

---

## Reliability & Recovery
- On startup, run health and consistency checks: lease validity, stuck `running` tasks, overdue tasks, orphan runs.
- Add recovery job to mark stale `running` runs as failed or retry according to policy.
- Ensure idempotent replay by dedupe key and dedupe window, with explicit override flag for forced rerun.
- Persist transition journal entries before and after execution to survive abrupt shutdowns.
- Add kill switches to disable replay, disable new scheduling engine, and disable outbound notifications independently.

---

## Security
- Validate and sanitize task prompts and notification payload templates before persistence.
- Redact sensitive fields in logs and UI surfaces, including webhook secrets and credential-like substrings.
- Enforce webhook signing (HMAC) and optional mTLS/allowlist for outbound channels.
- Require explicit permission for manual replay/rerun actions in high-risk contexts.
- Add audit trail entries for pause/resume/delete/replay with actor and timestamp.

---

## Rollout Plan (phases + feature flags)
- **Phase 0: Instrument**
  - Add metrics, timeline fields, and dual timestamp rendering behind `KILOCLAW_TASK_TIMELINE_V1`.
- **Phase 1: Correct schedule engine**
  - Route post-run recompute through timezone-aware `nextRuns` behind `KILOCLAW_SCHEDULER_NEXTRUN_UNIFIED`.
- **Phase 2: State machine + archive UX**
  - Introduce durable states and archived/completed surfaces behind `KILOCLAW_TASK_STATE_V2`.
- **Phase 3: Real run/replay actions**
  - Replace placeholders with full execution intents behind `KILOCLAW_TASK_ACTIONS_EXEC`.
- **Phase 4: Notifications**
  - Enable channel fanout behind `KILOCLAW_TASK_NOTIFY_V1`.
- **Phase 5: Default on**
  - Gradually ramp flags by cohort and retain rollback toggles for two release cycles.

---

## Test Strategy
- Add unit tests for cron/timezone/DST/misfire matrix, including edge dates and ambiguous local times.
- Add integration tests for create->run->nextRun recompute parity between creation and runtime paths.
- Add state machine tests for one-shot completion, archival, replay lineage, and pause/resume transitions.
- Add TUI command parser tests to match help surface and reject unsupported syntax cleanly.
- Add daemon recovery tests for stale leases, stale running runs, and restart reconciliation.
- Add end-to-end tests for notification fanout with mocked channels and signature verification.

---

## Acceptance Criteria
- Scheduling a one-shot task at local `+5m` executes once and ends in `completed` with no daily rollover.
- Recurring tasks always recompute next run using timezone-aware cron semantics and display local+UTC.
- `/tasks` views never hide completed/archived tasks unless filtered out explicitly.
- Timeline view shows scheduled slot, start, finish, outcome, and replay/manual lineage for each run.
- Replay and manual rerun enforce idempotency defaults and require explicit force override.
- Daemon status is visible from task UX and reflects lease health within one refresh interval.

---

## Risks & Mitigations
- **Migration risk:** new columns and states may break older clients; mitigate with backward-compatible reads and lazy migration.
- **Behavioral drift:** cron semantics changes may surprise users; mitigate with preview diff in update flow.
- **Notification overload:** too many alerts can reduce trust; mitigate with per-channel thresholds and digest mode.
- **Replay abuse:** repeated reruns can cause side effects; mitigate with dedupe windows and policy gates.
- **Operational regressions:** runtime refactor can affect stability; mitigate with phased flags and canary cohorts.

---

## Backlog with concrete file paths
- `packages/opencode/src/kiloclaw/proactive/scheduler.engine.ts`  
  Replace `calculateNextRun` path with timezone-aware recompute and typed execution intents.
- `packages/opencode/src/kiloclaw/proactive/scheduled-task.ts`  
  Add one-shot/recurring model fields and normalized schedule metadata in create/update builders.
- `packages/opencode/src/kiloclaw/proactive/scheduler.store.ts`  
  Add schema migrations for task state v2, timeline fields, replay lineage, and notification config.
- `packages/opencode/src/kiloclaw/proactive/task-formatter.ts`  
  Add dual local/UTC rendering and timeline row formatting helpers.
- `packages/opencode/src/cli/cmd/task.ts`  
  Add archive/list filters, replay/rerun commands, and daemon health summary output.
- `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx`  
  Expand `/tasks` parser to match help surface and route commands consistently.
- `packages/opencode/src/cli/cmd/tui/app.tsx`  
  Replace Phase-4 placeholders with real run/replay actions and refresh triggers.
- `packages/opencode/src/cli/cmd/tui/ui/dialog-task-list.tsx`  
  Add status v2 chips, completed/archived visibility, and reactive refresh mechanism.
- `packages/opencode/src/cli/cmd/tui/ui/dialog-task-detail.tsx`  
  Add Task Timeline, dual timestamps, daemon status badge, and explicit one-shot semantics.
- `packages/opencode/src/cli/cmd/tui/ui/dialog-task-runs.tsx`  
  Add replay/rerun controls with idempotency hints and lineage display.
- `packages/opencode/src/cli/cmd/tui/ui/dialog-task-dlq.tsx`  
  Wire replay to runtime intent API and show parent/child run relationships.
- `packages/opencode/src/kiloclaw/proactive/runtime/service-manager.ts`  
  Add startup consistency checks and richer scheduler health diagnostics.
- `packages/opencode/src/kiloclaw/service-health.ts`  
  Surface progression health checks beyond lease presence.
- `packages/opencode/test/kiloclaw/scheduled-task-runtime.test.ts`  
  Add timezone parity and one-shot completion scenarios.
- `packages/opencode/test/cli/task-command.test.ts`  
  Add parser/help parity and action coverage tests for new `/tasks` subcommands.

---

## KPIs/SLOs
- **SLO:** 99.9% of due runs start within 60s of scheduled slot under healthy daemon.
- **SLO:** 99.99% run record durability for started runs (no missing terminal outcome after recovery window).
- **KPI:** <1% mismatch rate between displayed next run and computed runtime next run.
- **KPI:** 0 silent task disappearance incidents (all hidden states are filter-driven and reversible).
- **KPI:** replay safety ratio >99% (dedupe prevents unintended duplicate side effects).
- **KPI:** mean time to diagnose scheduler outage <5 minutes via built-in status surfaces.

---

## Source References
- `packages/opencode/src/kiloclaw/proactive/schedule-parse.ts:211` (`nextRuns` timezone-aware cron expansion).
- `packages/opencode/src/kiloclaw/proactive/scheduled-task.ts:73` (timezone validation and create path).
- `packages/opencode/src/kiloclaw/proactive/scheduled-task.ts:160` (update path computes `nextRunAt` with `nextRuns`).
- `packages/opencode/src/kiloclaw/proactive/scheduler.engine.ts:392` (success path recalculates via `calculateNextRun`).
- `packages/opencode/src/kiloclaw/proactive/scheduler.engine.ts:550` (`calculateNextRun` simplified minute/hour logic).
- `packages/opencode/src/cli/cmd/tui/component/prompt/index.tsx:625` (`/tasks` parser currently limited).
- `packages/opencode/src/cli/cmd/tui/ui/dialog-task-help.tsx:48` (help advertises broader command set).
- `packages/opencode/src/cli/cmd/tui/app.tsx:876` and `packages/opencode/src/cli/cmd/tui/app.tsx:915` (Phase-4 placeholder toasts).
- `packages/opencode/src/cli/cmd/tui/app.tsx:863` and `packages/opencode/src/cli/cmd/tui/app.tsx:869` (direct pause/resume status updates).
- `packages/opencode/src/cli/cmd/tui/ui/dialog-task-list.tsx:35` (store query via `createMemo`).
- `packages/opencode/src/cli/cmd/tui/ui/dialog-task-detail.tsx:40` (task detail direct store query via `createMemo`).
- `packages/opencode/src/cli/cmd/tui/ui/dialog-task-runs.tsx:26` (runs direct store query via `createMemo`).
- `packages/opencode/src/kiloclaw/proactive/scheduler.store.ts:168` (SQLite schema for tasks, runs, DLQ, lease).
- `packages/opencode/src/kiloclaw/proactive/scheduler.store.ts:15` (`TaskStatus` enum includes `completed`).
- `packages/opencode/src/kiloclaw/service-health.ts:366` (scheduled daemon health check via lease).
- `packages/opencode/src/cli/cmd/daemon.ts:61` (daemon status command surfaces lease and queue stats).

### External references consulted
- Cron DST behavior and timezone handling: `https://man7.org/linux/man-pages/man5/crontab.5.html`
- Missed jobs, coalescing, job persistence patterns: `https://apscheduler.readthedocs.io/en/3.x/userguide.html`
- Cron trigger misfire semantics: `https://www.quartz-scheduler.org/documentation/quartz-2.3.0/tutorials/tutorial-lesson-06.html`
- Cron controller semantics (`startingDeadlineSeconds`, `concurrencyPolicy`, `timeZone`, history limits): `https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/`
- Retry and backoff with jitter best practices: `https://docs.bullmq.io/guide/retrying-failing-jobs`
- Alerting best practices (symptom-based, low-noise): `https://prometheus.io/docs/practices/alerting/`

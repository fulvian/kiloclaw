---
title: "Scheduled tasks spec"
description: "User-safe autonomy with predictable runtime behavior"
---

# Scheduled tasks spec

## 1) Define scope and status

| Field | Value |
|---|---|
| Status | Proposed for implementation |
| Date | 2026-04-07 |
| Owners | CLI Core, Kiloclaw Runtime, Safety/Policy |
| Reviewers | DX, Security, SRE, Product |

**Define scope**
- Specify user-facing scheduled/autonomous tasks for Kiloclaw CLI, built on the existing internal proactive scheduler stack.
- Cover UX, CLI contract, runtime semantics, policy hooks, observability, migration, rollout, and test gates.
- Target `packages/opencode` as the primary implementation surface with strict project/runtime isolation.

**Define non-goals**
- Do not redesign the existing internal budget, policy, retry, and DLQ engines from scratch.
- Do not add cross-tenant orchestration or distributed workers in this phase.
- Do not expose irreversible autonomous actions without explicit HITL controls.

---

## 2) State problem and objectives

Current proactive primitives are strong internally but not yet productized for users.
Users need a simple default flow with predictable behavior and optional advanced control.

**State key problems**
- Existing scheduler interfaces are implementation-centric, not task-centric for everyday CLI users.
- Timezone, DST, and missed-run behavior are not consistently explainable at the CLI surface.
- Reliability knobs exist but are not normalized into a stable user contract.
- Isolation boundaries must remain strict while adding persistent user-configured schedules.

**Set objectives**
- Provide dual-mode UX: simple by default, advanced when explicitly requested.
- Guarantee deterministic lifecycle semantics for create, run, retry, DLQ, replay, and pause/resume.
- Integrate policy/budget/HITL checks into every run with visible reasons.
- Ship with production-grade observability and measurable SLOs.

---

## 3) Derive research-backed principles

**Adopt scheduling syntax users already recognize**
- Use standard 5-field cron as the advanced default because users already know it from GitHub Actions and cloud schedulers.
- Keep timezone explicit and defaulted, and explain it in every `show` output ([GitHub Actions schedule docs](https://docs.github.com/en/actions/using-workflows/workflow-syntax-for-github-actions#onschedule), [Google Cloud Scheduler cron/timezone docs](https://cloud.google.com/scheduler/docs/configuring/cron-job-schedules)).

**Treat timezone as first-class configuration**
- Persist schedule expression plus IANA timezone on each task, and compute next run from that pair.
- Support DST safely with explicit duplicate/skip policy per task ([Google Cloud Scheduler timezone guidance](https://cloud.google.com/scheduler/docs/configuring/cron-job-schedules)).

**Separate triggering from delivery guarantees**
- Keep scheduling cadence independent from retry, dead-letter handling, and replay semantics.
- Model retries and DLQ as execution outcomes, consistent with EventBridge guidance ([AWS EventBridge scheduling/retry/DLQ concepts](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-create-rule-schedule.html)).

**Design for resilient background processing**
- Use idempotent execution contracts, bounded retries, and recoverable shutdown/restart behavior.
- Capture traceable run history and correlation IDs for supportability ([Azure background jobs best practices](https://learn.microsoft.com/en-us/azure/architecture/best-practices/background-jobs)).

**Prefer progressive disclosure in CLI UX**
- Start users with presets and safe defaults, then expose advanced knobs only when asked.
- Show plain-language summaries for every schedule and every block/deny decision.

---

## 4) Define dual-mode UX

### Simple mode

**Set defaults and presets**
- Default creation flow is interactive preset selection unless `--cron` is provided.
- Presets: `hourly`, `daily-09:00`, `weekdays-09:00`, `weekly-mon-09:00`, `monthly-1st-09:00`.
- Defaults: `timezone=local`, `retry.maxAttempts=3`, `retry.backoff=exponential`, `concurrency=forbid`, `missedRun=catchup_one`, `enabled=true`.

**Explain in plain language**
- Show generated schedule summary like: `Runs weekdays at 09:00 Europe/Rome`.
- Show risk and approval summary like: `May require approval when action is irreversible`.

### Advanced mode

**Expose full controls**
- Enable `--cron`, `--timezone`, `--dst-policy`, `--retry-*`, `--concurrency`, `--starting-deadline`, `--missed-run-policy`, and `--quiet-hours`.
- Support validation-only and dry-run next occurrence previews before saving.

**Preserve safety defaults**
- Advanced mode cannot disable mandatory policy gates.
- Advanced mode can tune reliability, but cannot bypass irreversible-action constraints.

### Progressive disclosure rules

- Show only schedule + name + enabled state in default list output.
- Show reliability, gate outcomes, and recent runs in `show` or `--verbose` output.
- Print one-line fix hints for validation failures and policy blocks.

### Explainability and safety messaging

- Every blocked run emits reason classes: `policy_denied`, `budget_exceeded`, `quiet_hours`, `approval_required`.
- `show` includes `lastGateDecision` and `nextEligibleRunAt` for transparency.

---

## 5) Specify command-line product

### Define command surface

`kilo task` is the canonical command group.
`kiloclaw task` is a compatibility alias with identical behavior.

| Command | Purpose |
|---|---|
| `kilo task create` | Create a scheduled task |
| `kilo task list` | List tasks |
| `kilo task show <id>` | Show details and recent runs |
| `kilo task pause <id>` | Pause task execution |
| `kilo task resume <id>` | Resume task execution |
| `kilo task run-now <id>` | Trigger immediate run |
| `kilo task delete <id>` | Delete task and future schedule |
| `kilo task update <id>` | Update schedule and runtime knobs |
| `kilo task validate` | Validate cron/preset and options |

### Define create/update flags

| Flag | Type | Default | Notes |
|---|---|---|---|
| `--name` | string | required | Human-readable label |
| `--prompt` | string | required | Task intent payload |
| `--preset` | enum | `daily-09:00` | Ignored if `--cron` set |
| `--cron` | string | none | 5-field cron expression |
| `--timezone` | string | local IANA tz | Example `Europe/Rome` |
| `--dst-policy` | enum | `skip-duplicate` | `skip-duplicate` \| `run-twice` |
| `--retry-max-attempts` | int | 3 | Includes first attempt |
| `--retry-backoff` | enum | `exponential` | `fixed` \| `exponential` |
| `--retry-base-ms` | int | 30000 | Base delay |
| `--retry-max-ms` | int | 900000 | Cap delay |
| `--retry-jitter` | float | 0.2 | 0.0 to 0.5 |
| `--concurrency` | enum | `forbid` | `allow` \| `forbid` \| `replace` |
| `--starting-deadline-ms` | int | 600000 | Max lateness to start |
| `--missed-run-policy` | enum | `catchup_one` | `skip` \| `catchup_one` \| `catchup_all` |
| `--quiet-hours` | range | none | Local timezone quiet window |
| `--require-approval` | enum | `auto` | `auto` \| `always` \| `never-low-risk` |
| `--enabled` | bool | true | Create in active state |
| `--json` | bool | false | Machine-readable output |
| `--dry-run` | bool | false | Validate and preview only |

### Define list/show output

**Human output default**
- `list`: columns `id`, `name`, `schedule`, `nextRun`, `status`, `lastOutcome`.
- `show`: adds `policy`, `budget`, `retry`, `DLQ`, `recentRuns`, and `lastError`.

**JSON output schema**
- Always include `task`, `nextRuns[]`, `runtime`, `policy`, `lastRun`, and `links` fields.
- `run-now` JSON includes `runId`, `accepted`, `gateDecision`, and `executionMode`.

### Show concrete CLI examples

```bash
kilo task create --name "daily repo scan" --prompt "scan repo for flaky tests" --preset daily-09:00
kilo task create --name "weekday summary" --prompt "summarize open PR risk" --preset weekdays-09:00 --timezone Europe/Rome
kilo task create --name "nightly security check" --prompt "run security audit checklist" --cron "0 2 * * *" --timezone UTC
kilo task create --name "high reliability" --prompt "refresh dependency report" --cron "*/30 * * * *" --retry-max-attempts 5 --retry-backoff exponential --retry-base-ms 10000 --retry-max-ms 600000
kilo task list
kilo task list --json
kilo task show task_01HZYF4S8M0V6Y6Q7C2N2J9R5A
kilo task pause task_01HZYF4S8M0V6Y6Q7C2N2J9R5A
kilo task resume task_01HZYF4S8M0V6Y6Q7C2N2J9R5A
kilo task run-now task_01HZYF4S8M0V6Y6Q7C2N2J9R5A --json
kilo task update task_01HZYF4S8M0V6Y6Q7C2N2J9R5A --cron "15 9 * * 1-5" --timezone Europe/Rome --concurrency replace
kilo task validate --cron "0 25 * * *" --timezone Europe/Rome
kilo task delete task_01HZYF4S8M0V6Y6Q7C2N2J9R5A
```

---

## 6) Define data model and persistence

### Define entities

| Entity | Purpose |
|---|---|
| `scheduled_task` | User-visible task definition and runtime defaults |
| `scheduled_task_run` | Immutable run record per execution attempt |
| `scheduled_task_dlq` | Dead-letter entries for exhausted/blocked runs |
| `scheduled_task_event` | Audit/event log for lifecycle changes |

### Define `scheduled_task` fields

| Field | Type | Required | Default |
|---|---|---|---|
| `id` | ULID string | yes | generated |
| `tenant_id` | string | yes | workspace/project scoped |
| `namespace` | string | yes | `kiloclaw.scheduled.v1` |
| `name` | string | yes | none |
| `prompt` | text | yes | none |
| `mode` | enum | yes | `simple` |
| `schedule_kind` | enum | yes | `preset` |
| `schedule_expr` | string | yes | preset-derived cron |
| `timezone` | string | yes | local IANA timezone |
| `dst_policy` | enum | yes | `skip-duplicate` |
| `status` | enum | yes | `active` |
| `enabled` | boolean | yes | true |
| `concurrency_policy` | enum | yes | `forbid` |
| `starting_deadline_ms` | int | yes | 600000 |
| `missed_run_policy` | enum | yes | `catchup_one` |
| `retry_max_attempts` | int | yes | 3 |
| `retry_backoff` | enum | yes | `exponential` |
| `retry_base_ms` | int | yes | 30000 |
| `retry_max_ms` | int | yes | 900000 |
| `retry_jitter` | float | yes | 0.2 |
| `require_approval` | enum | yes | `auto` |
| `quiet_hours_json` | text/json | no | null |
| `idempotency_salt` | string | yes | generated |
| `next_run_at` | epoch ms | no | computed |
| `last_run_at` | epoch ms | no | null |
| `last_outcome` | enum | no | null |
| `created_at` | epoch ms | yes | now |
| `updated_at` | epoch ms | yes | now |

### Define run and DLQ fields

- `scheduled_task_run` includes `run_id`, `task_id`, `attempt`, `scheduled_for`, `started_at`, `finished_at`, `outcome`, `gate_decision_json`, `error_code`, `error_message`, `correlation_id`, `idempotency_key`, and `trace_id`.
- `scheduled_task_dlq` includes `dlq_id`, `task_id`, `run_id`, `reason`, `payload_json`, `first_failed_at`, `ready_for_replay_at`, and `replay_count`.

### Define statuses and transitions

| Status | Meaning | Allowed transitions |
|---|---|---|
| `active` | Eligible for scheduling | `paused`, `deleting` |
| `paused` | Temporarily disabled | `active`, `deleting` |
| `dlq` | Has unresolved DLQ entries | `active`, `paused`, `deleting` |
| `deleting` | Tombstone in progress | `deleted` |
| `deleted` | Soft-deleted record | none |

### Define identifiers

- `correlation_id` is generated per user action and propagated into all derived run events.
- `idempotency_key` is `sha256(task_id + scheduled_for + attempt + idempotency_salt)` and must be unique.

### Define nextRun and DST semantics

- Compute `next_run_at` from `schedule_expr + timezone` using timezone-aware cron evaluation.
- Spring-forward nonexistent local times are skipped and marked with event `dst_skip`.
- Fall-back duplicated local times run once by default, or twice when `dst_policy=run-twice`.

---

## 7) Define execution semantics

### Define retry and backoff

- Attempt count includes initial attempt, so default `3` means `1 initial + 2 retries`.
- Exponential backoff uses `delay = min(retry_max_ms, retry_base_ms * 2^(attempt-1))` with jitter.
- Fixed backoff uses `delay = retry_base_ms` with jitter.

### Define DLQ and replay

- Move run to DLQ when attempts are exhausted or policy/budget block is marked non-retriable.
- `run-now --replay-dlq <dlq_id>` rehydrates payload and creates a new run with linked `replayed_from_dlq_id`.
- Replay honors current policy and budget checks, and does not bypass approval requirements.

### Define concurrency and missed runs

| Knob | Default | Behavior |
|---|---|---|
| `concurrency=allow` | no | Allow overlapping runs |
| `concurrency=forbid` | yes | Skip new run while one is active |
| `concurrency=replace` | no | Cancel running attempt, start latest |
| `starting_deadline_ms=600000` | yes | Skip if run starts too late |
| `missed_run_policy=skip` | no | Drop missed ticks |
| `missed_run_policy=catchup_one` | yes | Run one catch-up then resume schedule |
| `missed_run_policy=catchup_all` | no | Replay all missed ticks up to cap |

### Define shutdown and restart behavior

- On graceful shutdown, scheduler stops claiming new runs and marks in-flight tasks as `running_shutdown_pending` in memory.
- On restart, reconciliation scans stale `running` entries and marks them `lost` if beyond grace window.
- Lost runs follow missed-run policy and retry policy before DLQ fallback.

---

## 8) Integrate policy and safety

### Define integration points

- Pre-run gate: evaluate risk, budget, and HITL requirements before claiming execution budget.
- Mid-run guard: enforce irreversible-action checks at tool invocation checkpoints.
- Post-run gate: record gate decisions and reasons in immutable run metadata.

### Define irreversible-action constraints

- Any action tagged irreversible must require explicit approval regardless of mode.
- `require_approval=never-low-risk` only applies to actions classified low risk.

### Define user controls

- Per-user kill switch: `kilo task kill-switch --on|--off` blocks all autonomous execution.
- Quiet hours: configured per task or user profile and enforced in local timezone.
- Quiet-hour blocked runs are deferred, not failed, unless `starting_deadline_ms` expires.

---

## 9) Define observability and SLOs

### Define metrics

- Counters: `kiloclaw_sched_runs_total{outcome}`, `kiloclaw_sched_gate_blocks_total{reason}`, `kiloclaw_sched_dlq_total`.
- Gauges: `kiloclaw_sched_tasks_active`, `kiloclaw_sched_runs_inflight`, `kiloclaw_sched_dlq_ready`.
- Histograms: `kiloclaw_sched_run_duration_ms`, `kiloclaw_sched_queue_lag_ms`, `kiloclaw_sched_recovery_lag_ms`.

### Define logs and traces

- Structured logs include `task_id`, `run_id`, `correlation_id`, `idempotency_key`, `tenant_id`, `policy_outcome`.
- Traces create one root span per run and child spans for policy, budget, tool calls, and persistence.

### Define SLOs and alerts

| SLO | Target | Alert threshold |
|---|---|---|
| Scheduler tick freshness | p99 < 5s | > 15s for 5m |
| Run start lag | p95 < 30s | > 120s for 10m |
| Run success ratio | >= 99% for retriable workloads | < 97% for 15m |
| DLQ growth | stable or decreasing | +20% over 30m |
| Recovery completeness after restart | 100% reconciled | any unreconciled after 5m |

### Define operations dashboard

- Panels: active tasks by status, next runs heatmap, run outcomes trend, DLQ queue and age, policy block reasons.
- Health endpoints: `scheduler_alive`, `scheduler_tick_age_ms`, `dlq_processor_alive`, `policy_gate_latency_ms`.

---

## 10) Define security and compliance

- Enforce least privilege for scheduler worker capabilities and avoid privilege escalation from stored prompts.
- Store no raw secrets in task definitions, and reference secret handles from existing credential systems.
- Apply data minimization by persisting only required task context and redacting sensitive run payload fields.
- Keep append-only audit records for task lifecycle events and approval decisions.
- Support exportable audit trails for incident review and compliance evidence.

---

## 11) Plan backward compatibility and migration

### Define migration from legacy proactive data

- Source: `.kiloclaw/proactive.db` (`proactive_tasks`, `proactive_task_runs`, `proactive_dlq`) where present.
- Target: namespaced tables in `kilo.db` under `kiloclaw.scheduled.v1` schema ownership.
- Strategy: one-time idempotent migration job with checkpointing and dry-run mode.

### Define namespace isolation rules

- New scheduler tables and keys must use `kiloclaw_sched_*` naming and `namespace=kiloclaw.scheduled.v1`.
- Legacy tables remain read-only during migration and are never mutated post-cutover.
- No cross-read between legacy and new namespaces after migration completion flag is set.

### Define compatibility behavior

- Existing internal scheduler APIs continue to function through an adapter layer during transition.
- CLI reads from new namespace only after migration success marker is present.

---

## 12) Define testing and release gates

### Define test layers

- Unit tests: cron parsing, next-run computation, DST handling, backoff math, idempotency key generation.
- Integration tests: create/update/list/show lifecycle, run-now path, policy blocks, budget exhaustion, DLQ replay.
- End-to-end tests: CLI invocation to persisted outcomes across restart boundaries.
- Chaos tests: crash during run, DB lock contention, delayed ticks, clock skew and DST boundary windows.

### Define acceptance criteria

1. `create` with preset computes a valid cron and persists timezone.
2. `create --cron` rejects invalid cron with actionable error.
3. `list` human output and `--json` output stay schema-consistent.
4. `show` reports next two runs and last gate decision.
5. `pause` prevents scheduled execution without deleting task state.
6. `resume` restores scheduled execution and recomputes next run.
7. `run-now` creates a run record with correlation and idempotency keys.
8. Retry behavior follows configured max attempts and backoff bounds.
9. Exhausted retries produce DLQ entries with replay metadata.
10. Restart reconciliation marks stale running runs as `lost` and recovers per policy.
11. Quiet-hours deferral works and does not bypass policy checks.
12. Irreversible actions always require explicit approval.
13. Migration runs idempotently and preserves historical run counts.
14. Namespace isolation checks fail if legacy namespace is written after cutover.

### Define release gates

- All acceptance criteria pass in CI and staging.
- No P0 security findings remain open.
- Canary SLOs remain within thresholds for 7 consecutive days.

---

## 13) Plan staged rollout

| Stage | Scope | Exit criteria |
|---|---|---|
| Local | Developer machines and fixtures | Green unit/integration suite |
| Staging | Internal shared environment | Migration dry-run + restart tests pass |
| Canary | 5% opted-in users | SLOs green for 7 days, no sev1 incidents |
| GA | All users | Feature flags default on |

**Define feature flags**
- `KILOCLAW_SCHED_TASKS_ENABLED` gates CLI surface.
- `KILOCLAW_SCHED_TASKS_RUNTIME_V1` gates new runtime execution path.
- `KILOCLAW_SCHED_TASKS_MIGRATION_V1` gates migration rollout.

**Define rollback**
- Disable runtime flag to stop new executions while preserving task definitions.
- Re-enable legacy adapter for read-only visibility until fix rollout.
- Keep run audit logs immutable across rollback to preserve incident evidence.

---

## 14) Define implementation backlog

### P0

| Work item | File-level targets |
|---|---|
| Add CLI command group and handlers | `packages/opencode/src/cli/cmd/task.ts`, `packages/opencode/src/cli/cmd/cmd.ts`, `packages/opencode/src/index.ts` |
| Add scheduler domain schemas and validators | `packages/opencode/src/kiloclaw/proactive/scheduled-task.ts`, `packages/opencode/src/kiloclaw/proactive/schedule-parse.ts` |
| Add durable tables and DAO layer in core DB | `packages/opencode/src/storage/schema.ts`, `packages/opencode/src/kiloclaw/proactive/scheduled-task.sql.ts`, `packages/opencode/migration/20260407xxxxxx_sched_tasks_v1/migration.sql` |
| Integrate runtime with policy/budget/HITL | `packages/opencode/src/kiloclaw/proactive/scheduler.engine.ts`, `packages/opencode/src/kiloclaw/proactive/policy-gate.ts`, `packages/opencode/src/kiloclaw/hitl/irreversible.ts` |
| Add command tests and lifecycle integration tests | `packages/opencode/test/cli/task.test.ts`, `packages/opencode/test/kiloclaw/scheduled-task-runtime.test.ts` |

### P1

| Work item | File-level targets |
|---|---|
| Add migration adapter from legacy proactive DB | `packages/opencode/src/kiloclaw/proactive/migrate-legacy.ts`, `packages/opencode/test/kiloclaw/scheduled-task-migration.test.ts` |
| Add explainability messages and JSON output schema docs | `packages/opencode/src/kiloclaw/proactive/explain.ts`, `docs/guide/SCHEDULED_TASKS_CLI_REFERENCE.md` |
| Add observability metrics and dashboards plumbing | `packages/opencode/src/kiloclaw/proactive/metrics.ts`, `packages/opencode/src/kiloclaw/proactive/scheduler.engine.ts` |

### P2

| Work item | File-level targets |
|---|---|
| Add advanced presets and localized summaries | `packages/opencode/src/kiloclaw/proactive/presets.ts`, `packages/opencode/src/cli/ui.ts` |
| Add optional replay batching and DLQ filters | `packages/opencode/src/cli/cmd/task.ts`, `packages/opencode/src/kiloclaw/proactive/scheduler.store.ts` |
| Add SRE runbook and operational docs | `docs/guide/SCHEDULED_TASKS_OPERATIONS.md`, `docs/guide/SCHEDULED_TASKS_INCIDENT_RUNBOOK.md` |

---

## 15) Assess risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Ambiguous timezone handling around DST | Missed or duplicate runs | Persist timezone + explicit DST policy and test transitions |
| Overlapping runs causing side effects | Data corruption or duplicate actions | Default `concurrency=forbid` and idempotency key enforcement |
| Retry storms under systemic failures | Resource exhaustion | Backoff+jitter caps, per-tenant throttles, DLQ cutoff |
| Policy bypass via advanced flags | Safety regression | Hard-stop checks in runtime, not only CLI validation |
| Migration data drift | Lost historical context | Checksums, dual-read validation, idempotent migration checkpoints |
| Observability gaps | Slow incident response | Mandatory run IDs, correlation IDs, and SLO-based alerts |

---

## 16) Recommend final decision and checklist

**Recommend go/no-go**
- Go for staged implementation with P0 scope first, behind runtime and CLI feature flags.
- Enforce strict safety posture where irreversible actions remain approval-gated regardless of mode.

**Complete go/no-go checklist**
- [ ] CLI commands implemented with stable human and JSON output contracts.
- [ ] Timezone and DST behavior validated with deterministic tests.
- [ ] Retry, backoff, and DLQ semantics verified end-to-end.
- [ ] Policy, budget, and HITL integration enforced in runtime path.
- [ ] Idempotency key uniqueness and correlation propagation verified.
- [ ] Graceful shutdown and restart reconciliation pass chaos tests.
- [ ] Migration dry-run and production migration plan approved.
- [ ] Namespace isolation checks automated in CI.
- [ ] Observability dashboards and alerts active in staging and canary.
- [ ] Security review complete with no unresolved high-severity findings.
- [ ] Canary SLOs green for 7 days before GA.

**Final recommendation**
- Proceed with this specification as the implementation baseline for user-facing scheduled/autonomous tasks in Kiloclaw CLI.
- Lock the CLI contract and JSON schema early to prevent drift during rollout.

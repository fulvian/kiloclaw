---
title: "Runtime plan"
description: "Persistent scheduled execution outside interactive lifecycle"
---

# Runtime plan

## Frame scope

This plan introduces a long-running service process that executes scheduled tasks even when no TUI or CLI session is active.
It is implementation-ready, staged for low risk, and aligned with existing proactive scheduler code.

- Goals:
  - Keep scheduled tasks running without any interactive session.
  - Preserve current task CRUD and run history behavior.
  - Support Linux first, then macOS and Windows service modes.
  - Improve reliability with lease-based singleton scheduling and crash recovery.
- Non-goals:
  - Replacing the current task schema or rewriting proactive policy logic.
  - Building distributed multi-node scheduling in phase 1.
  - Changing user-facing task command grammar in this effort.

---

## Assess baseline

Current scheduler pieces are solid but process-bound, so task execution only happens while the process that started the engine is alive.
This prevents true background execution when users close TUI sessions.

- Existing building blocks:
  - `packages/opencode/src/kiloclaw/proactive/scheduler.engine.ts`: tick loop, retries, DLQ processing, run recording.
  - `packages/opencode/src/kiloclaw/proactive/scheduler.store.ts`: SQLite persistence for tasks, runs, DLQ.
  - `packages/opencode/src/kiloclaw/proactive/scheduler-service.ts`: claim/complete/fail flow on `TaskLedger`.
  - `packages/opencode/src/kiloclaw/proactive/worker.ts`: idempotent in-process execution wrapper.
  - `packages/opencode/src/kiloclaw/proactive/task-ledger.ts`: JSON ledger with reconcile support.
- Key limitations:
  - No dedicated runtime entrypoint that starts on boot and survives user logout.
  - No durable leader lease to enforce one active scheduler instance.
  - Cron next-run computation in engine is currently minimal and not full cron semantics.
  - No OS service packaging with restart/watchdog hardening.

---

## Define architecture

Add a new service mode inside `packages/opencode` that owns scheduling ticks and worker execution.
Interactive sessions become control-plane clients, while the daemon becomes the data-plane executor.

- Components:
  - `Scheduled Runtime` process: boot, lease acquire/renew, reconcile, tick, execute, shutdown.
  - `Lease store`: SQLite-backed lease row with TTL and fencing token.
  - `Execution engine`: existing `ProactiveSchedulerEngine` with cron and misfire upgrades.
  - `Worker adapter`: executes task payload through existing policy and budget gates.
  - `Control API`: optional local IPC/HTTP for health, stats, pause, and drain.
- Data flow:
  - CLI/TUI writes tasks into `proactive_tasks`.
  - Runtime reads due tasks, claims lease, records runs, and updates status.
  - Runtime emits metrics/logs and heartbeat state.
- Control flow:
  - Boot -> open DB -> migrate -> acquire lease -> reconcile -> start tick loops.
  - Tick -> pull due tasks -> enforce policy -> run task -> persist outcome.
  - Shutdown -> stop intake -> wait inflight -> release lease -> exit cleanly.

```text
CLI/TUI -> ProactiveTaskStore (SQLite) <- Scheduled Runtime Service
                                  |             |
                                  |             +-> Worker adapter -> task action
                                  |
                                  +-> Runs/DLQ/Lease tables -> telemetry/health
```

---

## Integrate OS

Ship one runtime binary mode and three service wrappers.
Linux is production target first, while macOS and Windows are supported for dev and desktop parity.

- Add service mode command:

```bash
bun run --cwd packages/opencode --conditions=browser src/index.ts daemon run --project /path/to/repo
```

- Linux `systemd` unit template (`/etc/systemd/system/kiloclaw-scheduler.service`):

```ini
[Unit]
Description=KiloClaw Scheduled Task Service
After=network.target
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Type=notify
NotifyAccess=main
ExecStart=/usr/bin/kilo daemon run --project %h/coding/kiloclaw
ExecReload=/bin/kill -HUP $MAINPID
Restart=on-failure
RestartSec=5s
WatchdogSec=30s
TimeoutStartSec=30s
TimeoutStopSec=45s
User=kiloclaw
Group=kiloclaw
WorkingDirectory=%h/coding/kiloclaw
Environment=NODE_ENV=production
Environment=KILOCLAW_PROACTIVE_DB_PATH=%h/.local/share/kiloclaw/proactive.db
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=%h/.local/share/kiloclaw %h/coding/kiloclaw/.kiloclaw
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
LockPersonality=true
MemoryDenyWriteExecute=true
SystemCallFilter=@system-service

[Install]
WantedBy=multi-user.target
```

- Linux commands:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now kiloclaw-scheduler.service
systemctl status kiloclaw-scheduler.service
journalctl -u kiloclaw-scheduler.service -f
```

- macOS `launchd` template (`~/Library/LaunchAgents/dev.kiloclaw.scheduler.plist`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key><string>dev.kiloclaw.scheduler</string>
    <key>ProgramArguments</key>
    <array>
      <string>/usr/local/bin/kilo</string>
      <string>daemon</string>
      <string>run</string>
      <string>--project</string>
      <string>/Users/fulvio/coding/kiloclaw</string>
    </array>
    <key>WorkingDirectory</key><string>/Users/fulvio/coding/kiloclaw</string>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>ThrottleInterval</key><integer>10</integer>
    <key>EnvironmentVariables</key>
    <dict>
      <key>KILOCLAW_PROACTIVE_DB_PATH</key><string>/Users/fulvio/.local/share/kiloclaw/proactive.db</string>
    </dict>
    <key>StandardOutPath</key><string>/tmp/kiloclaw-scheduler.out.log</string>
    <key>StandardErrorPath</key><string>/tmp/kiloclaw-scheduler.err.log</string>
  </dict>
</plist>
```

- Windows Service mode strategy:
  - Add `daemon run --service` behavior for non-interactive process hosting.
  - Use SCM recovery options and exit codes so non-zero exits trigger restart.
  - Distinguish graceful stop (exit 0) from crash/fatal loop (exit 1+).

```powershell
sc.exe create KiloClawScheduler binPath= "C:\\kilo\\kilo.exe daemon run --project C:\\repo\\kiloclaw --service" start= auto
sc.exe failure KiloClawScheduler reset= 86400 actions= restart/5000/restart/10000/restart/30000
sc.exe start KiloClawScheduler
sc.exe query KiloClawScheduler
```

---

## Harden reliability

Use at-least-once execution with strict idempotency boundaries.
Runtime correctness depends on lease ownership, startup reconciliation, and explicit misfire policy.

- Lease and leader election:
  - Add `proactive_runtime_lease` table keyed by `lease_name` (`scheduled_runtime`).
  - Fields: `owner_id`, `fence_token`, `expires_at`, `updated_at`, `version`.
  - Acquire with compare-and-swap transaction, renew every `ttl/3`, and stop execution immediately on renew failure.
  - Use `fence_token` in run records to detect stale worker writes.
- Startup reconciliation:
  - On boot, scan tasks in `running` or stale claimed state and transition to retryable queued or lost.
  - Recompute `next_run_at` from cron and timezone for active tasks with missing or stale schedule.
  - Run DLQ readiness sweep before first normal tick.
- Misfire semantics:
  - `skip`: move to next cron fire time only.
  - `catchup_one`: execute once immediately, then move to next future slot.
  - `catchup_all`: execute each missed fire up to `max_catchup` guard.
  - Respect `starting_deadline_ms`; if lateness exceeds deadline, mark skipped with reason.
- Retry, DLQ, and idempotency:
  - Keep exponential backoff with jitter and max cap.
  - Move to DLQ only after retry budget exhausted or non-retryable classification.
  - Add `idempotency_key` uniqueness window per task run attempt and scheduled slot.
  - Persist `correlation_id`, `trace_id`, and `fence_token` on each run record.

---

## Enforce security

Run service identities with least privilege and constrained filesystem access.
Treat task payload execution as untrusted-by-default from an operating-system perspective.

- Service user model:
  - Dedicated non-login account on Linux (`kiloclaw`).
  - No admin rights for Windows service account unless explicitly required.
  - LaunchAgent scope for macOS user mode, not root daemon for phase 1.
- Filesystem boundaries:
  - Read-only repo where possible and explicit writable paths for DB, logs, and temp.
  - Deny access to unrelated home paths and secrets directories.
- Process hardening:
  - `NoNewPrivileges=true`, syscall filtering, private tmp, memory execution restrictions.
  - Bound environment variables and avoid inheriting interactive shell tokens.
- Secrets handling:
  - No secrets in unit files when avoidable; prefer `EnvironmentFile` or OS secret stores.
  - Redact sensitive payload fields from logs and run metadata.

---

## Instrument operations

Expose health and behavior telemetry that can prove runtime correctness.
Use explicit SLOs so rollout can be gated by measured behavior.

- Metrics to emit:
  - `scheduler_lease_acquire_total`, `scheduler_lease_renew_fail_total`.
  - `scheduler_tick_duration_ms`, `scheduler_tick_lag_ms`.
  - `task_due_total`, `task_run_total{outcome=...}`, `task_misfire_total{policy=...}`.
  - `task_retry_total`, `task_dlq_total`, `task_idempotency_replay_total`.
- Logs and traces:
  - Structured JSON logs with `task_id`, `run_id`, `correlation_id`, `fence_token`.
  - One trace span per run attempt, linked to policy gate and worker subspans.
- Health endpoints and checks:
  - `daemon status` command prints lease owner, last tick, inflight, queue depth.
  - Optional local HTTP `/healthz` and `/readyz` for service supervisors.
- Initial SLOs:
  - 99.9% of due tasks started within 30s of scheduled time.
  - 99.5% successful lease renewals over 24h windows.
  - DLQ growth rate stable and bounded under normal load.
- Alerts:
  - No active lease holder for more than 2 tick intervals.
  - Tick lag p95 over 2x configured tick interval.
  - DLQ entries older than 1h above threshold.

---

## Model failures

Use this table to drive runbooks and automated checks.
All rows should map to explicit log keys and alert conditions.

| Scenario                           | Detection                                             | Mitigation                                                   |
| ---------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| Process crash during run           | Missing heartbeat, non-zero exit, stale running tasks | Restart by supervisor, reconcile stale tasks on boot         |
| DB file lock contention            | SQLite busy errors and lease renew misses             | Busy timeout, bounded retry, fail closed and restart         |
| Split-brain runtime                | Two owners observed with conflicting fence token      | Lease CAS + fence token checks, loser self-terminates        |
| Clock skew or jump                 | Sudden tick lag spike or negative lateness            | Use monotonic timers for intervals, cap catchup window       |
| Long GC or event loop stall        | Watchdog miss and tick duration spike                 | `sd_notify` watchdog ping, restart on missed intervals       |
| Task hangs forever                 | Run timeout exceeded                                  | Mark timed_out, retry or DLQ by policy                       |
| Poison message task                | Repeated same error signature to max retries          | Backoff with jitter, quarantine to DLQ, operator replay gate |
| Corrupt cron/timezone config       | Validation failure on load/update                     | Reject update, keep prior valid schedule, emit warning       |
| Disk full                          | SQLite write failure and log IO errors                | Fail task safely, alert critical, halt new claims            |
| Permission regression after deploy | Service start failures, path access denied            | Startup preflight checks, documented ACL baseline            |
| Upgrade with schema mismatch       | Migration error on boot                               | Versioned migrations, rollback path, startup abort           |
| Graceful shutdown timeout          | Stop signal then forced kill by supervisor            | Drain mode, bounded wait, persist unfinished claims          |

---

## Roll out safely

Ship in phases with explicit kill switches to reduce blast radius.
Each phase can be disabled without data loss.

- Phase 0: groundwork
  - Add feature flag `KILOCLAW_DAEMON_RUNTIME_ENABLED=false` default.
  - Add lease table migration and read-only status command.
- Phase 1: shadow mode
  - Run daemon tick loop without executing tasks, only compare due calculations.
  - Emit diff metrics between daemon plan and current store state.
- Phase 2: canary execution
  - Execute only tasks tagged `runtime=daemon-canary`.
  - Limit concurrency to 1 and enforce strict `catchup_one`.
- Phase 3: partial production
  - Enable 10-25% tenants or local projects via allowlist.
  - Keep interactive fallback path available as emergency mode.
- Phase 4: default on
  - Daemon execution becomes default runtime.
  - Keep kill switches for lease, execution, and DLQ replay.

- Kill switches:
  - `KILOCLAW_DAEMON_RUNTIME_ENABLED=false` disables daemon scheduler loop.
  - `KILOCLAW_DAEMON_EXECUTION_ENABLED=false` keeps polling but skips run execution.
  - `KILOCLAW_DAEMON_LEASE_REQUIRED=true` blocks execution if lease not held.
  - `KILOCLAW_DAEMON_MISFIRE_MODE=skip` global emergency clamp.

---

## Validate quality

Testing must prove correctness across restarts, failures, and time semantics.
Use deterministic clocks in unit tests and real process restarts in integration tests.

- Unit tests:
  - Lease acquire/renew/expire and fencing logic.
  - Cron next-run with timezone and DST boundaries.
  - Misfire policy behavior for `skip`, `catchup_one`, `catchup_all`.
  - Idempotency key generation and replay suppression.
- Integration tests:
  - Start daemon, schedule tasks, kill daemon, confirm restart continues runs.
  - Verify only one active executor with two daemon instances.
  - Validate retry->DLQ lifecycle and manual replay flow.
- Chaos tests:
  - Inject DB busy, disk full, and forced process kill.
  - Randomly delay tick loop to test watchdog and lag alerts.
- Manual ops checks:
  - Linux systemd install/start/stop/restart and log review.
  - macOS launchctl load/unload and crash restart behavior.
  - Windows service install/recovery behavior with non-zero exits.

---

## Sequence backlog

Backlog is ordered for minimal coupling and reversible rollout.
Paths below are concrete edits or new files inside this repo.

- Runtime entrypoint and lifecycle:
  - Add `packages/opencode/src/cli/cmd/daemon.ts` for `daemon run|status|drain` commands.
  - Wire command registration in `packages/opencode/src/cli/cmd/index.ts`.
  - Add `packages/opencode/src/kiloclaw/proactive/runtime/daemon.ts` for process lifecycle.
  - Add `packages/opencode/src/kiloclaw/proactive/runtime/notify.ts` for `sd_notify` integration.
- Lease and storage:
  - Extend `packages/opencode/src/kiloclaw/proactive/scheduler.store.ts` with lease table and CRUD.
  - Add transactional lease methods: `acquireLease`, `renewLease`, `releaseLease`, `getLease`.
  - Add optional run column for `fence_token` and migration guard.
- Scheduler semantics:
  - Upgrade cron/timezone handling in `packages/opencode/src/kiloclaw/proactive/scheduler.engine.ts` by reusing `schedule-parse.ts`.
  - Add explicit misfire policy handling using fields from `scheduled-task.ts` config.
  - Add startup reconciliation method that repairs stale running states.
- Worker/idempotency:
  - Extend `packages/opencode/src/kiloclaw/proactive/worker.ts` to persist idempotency cache boundaries.
  - Align `packages/opencode/src/kiloclaw/proactive/task-ledger.ts` transitions with daemon reconciliation.
- Telemetry and health:
  - Add daemon metrics in `packages/opencode/src/kiloclaw/telemetry/proactive.metrics.ts`.
  - Add structured runtime health snapshot command output in new daemon CLI command.
- Service packaging assets:
  - Add `packaging/systemd/kiloclaw-scheduler.service` template.
  - Add `packaging/launchd/dev.kiloclaw.scheduler.plist` template.
  - Add `packaging/windows/kiloclaw-scheduler.ps1` install and recovery script.
- Tests:
  - Add `packages/opencode/test/kiloclaw/proactive/daemon.lease.test.ts`.
  - Add `packages/opencode/test/kiloclaw/proactive/daemon.misfire.test.ts`.
  - Add `packages/opencode/test/kiloclaw/proactive/daemon.recovery.test.ts`.
  - Add `packages/opencode/test/cli/daemon-command.test.ts`.
- Docs and runbooks:
  - Add `docs/guide/SCHEDULED_TASKS_DAEMON_OPERATIONS.md`.
  - Add `docs/qa/SCHEDULED_TASKS_DAEMON_TEST_MATRIX.md`.

---

## Set acceptance

Delivery is done when these checks pass in CI and manual smoke environments.
Any failed criterion blocks rollout beyond canary.

- Functional:
  - Tasks execute on schedule with no interactive session running.
  - Only one active runtime executes tasks for a given project/tenant.
  - Misfire behavior matches configured policy and deadline.
  - Retry and DLQ behavior is deterministic and observable.
- Operational:
  - Linux service survives reboot and auto-recovers from crash.
  - Runtime reports healthy lease ownership and watchdog heartbeat.
  - Shutdown drains in-flight tasks within configured timeout.
- Security:
  - Service runs as non-privileged identity with bounded filesystem access.
  - Logs contain no secret payload values and include required trace fields.
- Quality:
  - New unit and integration suites pass reliably.
  - Manual platform checklists complete for Linux, macOS, and Windows.

Definition of done:

- Phase 0-3 completed and documented with rollback steps.
- Packaging templates committed and validated in at least one host per OS family.
- Runbook published with failure table mappings and first-response commands.

---

## Cite sources

- systemd unit and service behavior:
  - https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html
  - https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html
  - https://www.freedesktop.org/software/systemd/man/latest/sd_notify.html
- Microsoft Learn Windows service worker guidance:
  - https://learn.microsoft.com/en-us/dotnet/core/extensions/windows-service
  - https://learn.microsoft.com/en-us/dotnet/core/extensions/workers
  - https://learn.microsoft.com/en-us/windows/win32/services/service-control-manager
- Quartz cron and misfire references:
  - https://www.quartz-scheduler.org/documentation/quartz-2.3.0/tutorials/crontrigger.html
  - https://www.quartz-scheduler.org/documentation/quartz-2.3.0/tutorials/tutorial-lesson-06.html
  - https://www.quartz-scheduler.org/api/2.3.0/org/quartz/CronTrigger.html

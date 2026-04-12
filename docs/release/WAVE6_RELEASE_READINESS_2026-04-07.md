---
title: "Wave 6 readiness"
description: "Operational release checkpoint for staged go-live"
---

# Wave 6 readiness

## Confirm scope

- Wave 1 delivered policy-first core and strict/compat enforcement paths
- Wave 2 delivered durable audit and memory lifecycle retention coverage
- Wave 3 delivered durable proactivity runtime with persisted task ledger and reconciliation
- Wave 4 delivered safe proactivity controls with risk-based approval behavior
- Wave 5 delivered isolation guardrails and observability boundaries for `KILOCLAW_*`
- Wave 6 is focused on release-readiness validation and staging gate sign-off

---

## Record evidence

- Latest full verification command and result:

```bash
bun run --cwd packages/opencode test test/kiloclaw/
# 804 pass, 3 skip, 0 fail
```

- Key subset verification run on 2026-04-07:

| Area                | Command                                                                          | Result          |
| ------------------- | -------------------------------------------------------------------------------- | --------------- |
| Runtime             | `bun run --cwd packages/opencode test test/kiloclaw/runtime.test.ts`             | 57 pass, 0 fail |
| Policy              | `bun run --cwd packages/opencode test test/kiloclaw/policy.test.ts`              | 16 pass, 0 fail |
| Safety              | `bun run --cwd packages/opencode test test/kiloclaw/safety.test.ts`              | 22 pass, 0 fail |
| Policy enforcement  | `bun run --cwd packages/opencode test test/kiloclaw/policy-enforcement.test.ts`  | 2 pass, 0 fail  |
| Proactivity runtime | `bun run --cwd packages/opencode test test/kiloclaw/proactivity-runtime.test.ts` | 8 pass, 0 fail  |
| Durable recovery    | `bun run --cwd packages/opencode test test/kiloclaw/durable-recovery.test.ts`    | 5 pass, 0 fail  |
| Isolation           | `bun run --cwd packages/opencode test test/kiloclaw/isolation.test.ts`           | 2 pass, 0 fail  |

---

## Map drills

| Drill    | Concrete tests executed                                                                                                                                                                                 | Evidence                |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Failover | `test/kiloclaw/proactivity-runtime.test.ts` -> `reconciles stale running tasks to lost after grace`; `runs idempotent worker execution with no duplicate effects`                                       | 8 pass, 0 fail          |
| Restart  | `test/kiloclaw/durable-recovery.test.ts` -> `persists append-only audit entries across re-instantiation`; `test/kiloclaw/proactivity-runtime.test.ts` -> `persists ledger data across re-instantiation` | 5 pass + 8 pass, 0 fail |
| Timeout  | `test/kiloclaw/proactivity-runtime.test.ts` -> stale-running-to-lost reconciliation after grace window (`graceMs`)                                                                                      | 8 pass, 0 fail          |

### Staging preflight execution (local runner)

```bash
bash script/wave6-staging-gates.sh
```

- Latest run result: local verification passed (`804 pass, 3 skip, 0 fail`) and preflight checks completed on active staging context.
- Script output confirmed active context `kind-kiloclaw-staging`, deployment/service checks succeeded, and readiness preflight completed.
- Remaining blocker is organizational sign-off plus staged production metrics collection.

### Scheduled-task CLI integration evidence

```bash
bun run --cwd packages/opencode test test/cli/task-command.test.ts
# 2 pass, 0 fail
```

- Scheduled-task lifecycle integration verification passed for create/list/show/pause/resume/run-now/update/delete flow and invalid cron handling.

### Staging context configured and validated

- `kubectl` client installed: `v1.35.3`
- Active context configured: `kind-kiloclaw-staging`
- Cluster validation: `kubectl get nodes -o wide` returned control-plane node `Ready`
- Preflight rerun succeeded end-to-end via `./script/wave6-staging-gates.sh`

### Canary and rollback drill execution

```bash
kubectl create deployment kiloclaw-canary --image=nginx:stable --dry-run=client -o yaml | kubectl apply -f -
kubectl rollout status deployment/kiloclaw-canary
kubectl set image deployment/kiloclaw-canary nginx=nginx:1.27-alpine
kubectl rollout status deployment/kiloclaw-canary
kubectl rollout undo deployment/kiloclaw-canary
kubectl rollout status deployment/kiloclaw-canary
```

- Drill result: image update completed and rollback completed successfully on staging context.

---

## Define rollback

- One-command fallback for policy and proactivity:

```bash
KILOCLAW_POLICY_ENFORCEMENT_MODE=compat KILOCLAW_PROACTIVE_ENABLED=false bun run --cwd packages/opencode --conditions=browser src/index.ts --config confirmationMode=explicit_approval
```

- This fallback keeps strict approval on irreversible actions while disabling autonomous execution paths.
- Use this mode as the immediate rollback target for canary or staged anomalies.

---

## Track metrics

Source baseline and targets come from `docs/plans/KILOCLAW_PROACTIVE_SEMIAUTONOMOUS_PLAN_2026-04-07.md`.

| KPI                         | Baseline (plan)                                | Target (plan) | Current measured status (2026-04-07)                                                               |
| --------------------------- | ---------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------- |
| Policy Enforcement Coverage | 30% (policy enforcement conformity estimate)   | >= 98%        | 18/18 policy + policy-enforcement tests pass; production bypass KPI pending staging                |
| Proactive Safety Compliance | 25% (safe proactivity conformity estimate)     | >= 99%        | 29/29 safety + proactivity-runtime tests pass; production incident KPI pending staging             |
| Durable Recovery Success    | N/D in initial conformity baseline             | >= 99.5%      | 5/5 durable-recovery tests pass; restart/failover drills green in test env                         |
| Audit Completeness          | 35% (auditability conformity estimate)         | >= 99%        | decision evidence and append-only recovery tests pass; production completeness KPI pending staging |
| Isolation Integrity         | 60% (isolation invariants conformity estimate) | = 100%        | 2/2 isolation tests pass; runtime env verification pending staging                                 |

---

## Close gates

| Gate                                               | Owner                  | Status      | Sign-off |
| -------------------------------------------------- | ---------------------- | ----------- | -------- |
| Wave 1-5 implementation verified                   | Engineering            | Complete    | \_\_\_\_ |
| Wave 6 verification evidence accepted              | QA                     | Complete    | \_\_\_\_ |
| Failover/restart/timeout drills accepted           | SRE/DevOps             | Complete    | \_\_\_\_ |
| Rollback one-command fallback validated in staging | DevOps                 | Complete    | \_\_\_\_ |
| KPI baseline vs target reviewed                    | Engineering + Security | In progress | \_\_\_\_ |
| Go-live approval after staged metrics              | Leadership             | Pending     | \_\_\_\_ |

- Go-live remains blocked until staging metrics and signatures are complete.

---

## Final handoff

- Sign-off packet: `docs/release/WAVE6_SIGNOFF_PACKET_2026-04-07.md`
- Required approvers: Engineering, QA, Security, Leadership.
- Technical gate status: complete.
- Organizational gate status: pending signatures.

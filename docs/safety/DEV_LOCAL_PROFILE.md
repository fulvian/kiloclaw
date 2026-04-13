# Dev-Local Policy Profile

> Controlled friction reduction for personal/local development.

## Purpose

`dev-local` reduces non-critical guardrail friction in a **trusted local workspace** while keeping hard safety boundaries for destructive and high-risk paths.

This profile is designed for personal projects where faster iteration is needed.

## Activation

Set environment variables:

```bash
KILO_POLICY_LEVEL=dev-local
KILO_TRUSTED_WORKSPACE=true
KILO_TRUSTED_WORKSPACE_ONLY=true
```

### Safety gate

- If `KILO_TRUSTED_WORKSPACE_ONLY=true` (default), `dev-local` is active **only** when `KILO_TRUSTED_WORKSPACE=true`.
- If workspace is not trusted, behavior falls back to `balanced`.

## Current behavior changes

### 1) Development agency tool policy (`session/tool-policy.ts`)

- Base allowlist remains unchanged for `strict` and `balanced`.
- In trusted `dev-local`, development allowlist is extended with:
  - `task`

### 2) Proactive gate defaults (`kiloclaw/proactive/policy-gate.ts`)

In trusted `dev-local`, default constructor behavior is relaxed:

- `riskThreshold`: `critical` (instead of `high`)
- `allowOverBudget`: `true` (instead of `false`)

Explicit constructor config still has precedence.

## What is NOT disabled

- No removal of deny-by-default architecture.
- No blanket bypass for destructive/irreversible actions.
- No bypass of secret-handling or high-risk policy controls.

## Rollback

Immediate rollback to baseline:

```bash
KILO_POLICY_LEVEL=balanced
```

or unset profile env vars.

## Validation

Run focused tests:

```bash
bun run --cwd packages/opencode test test/session/tool-policy.test.ts test/session/tool-policy-development.test.ts test/session/tool-policy-dev-local.test.ts test/kiloclaw/policy-level.test.ts
```

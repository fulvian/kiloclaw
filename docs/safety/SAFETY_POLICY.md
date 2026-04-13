# Safety Policy Documentation

> Kiloclaw Safety Architecture - Phase 5 Implementation

## Overview

Kiloclaw implements a multi-layered safety architecture based on ADR-003. The system uses static policies, dynamic guardrails, and human-in-the-loop checkpoints to ensure safe operation of autonomous AI agents.

## Architecture Layers

### 1. Policy Engine

The Policy Engine (`packages/opencode/src/kiloclaw/policy/`) is the central component for evaluating actions against safety rules.

#### Components:

- **`rules.ts`** - Static rule definitions, risk thresholds, and policy types
- **`engine.ts`** - Core PolicyEngine class for evaluating actions
- **`dynamic.ts`** - Dynamic risk calculation based on action context
- **`validator.ts`** - Zod schemas for policy validation

#### Risk Thresholds:

```typescript
const RISK_THRESHOLDS = {
  low: 0.2, // Proceed with logging
  medium: 0.5, // Proceed with enhanced logging
  high: 0.75, // Require confirmation
  critical: 0.9, // Block or require explicit approval
}
```

#### Key Features:

- **Static Rules**: Predefined rules registered at startup
- **Dynamic Risk Scoring**: Calculates risk based on 5 factors:
  - Reversibility (weight: 0.25)
  - Data Sensitivity (weight: 0.30)
  - Scope (weight: 0.20)
  - Autonomy (weight: 0.10)
  - External Impact (weight: 0.15)
- **Policy Caching**: Results cached for 5 seconds to reduce latency

### 2. Guardrails

Guardrails (`packages/opencode/src/kiloclaw/guardrail/`) provide specific protection for different action types.

#### Tool Call Guardrail (`tool-guard.ts`)

- Validates tool execution permissions
- Scope checking: read, write, execute, network, external_api, filesystem
- Kill switch support (global + per-agency)
- Audit logging for all tool calls

#### Data Exfiltration Guardrail (`data-exfiltration.ts`)

- Detects PII patterns in action parameters
- Classification-based blocking (P0_Critical, P1_High)
- External transmission detection
- Patterns monitored:
  - Email addresses
  - Phone numbers
  - SSN
  - Credit card numbers
  - API keys
  - Passwords

#### Escalation Handler (`escalation.ts`)

- Routes high-risk actions to appropriate contacts
- Supports: user, admin, audit contacts
- Requires explicit consent for high-risk actions
- Double-gate approval for critical actions

#### Risk Scorer (`risk-scorer.ts`)

- Calculates risk scores for actions
- Configurable factor weights
- Provides recommendations: allow, confirm, block

### 3. Proactivity Framework

The Proactivity Framework (`packages/opencode/src/kiloclaw/proactive/`) controls autonomous actions.

#### Trigger System (`trigger.ts`)

- **TriggerSignal** types: schedule, reminder, anomaly, threshold
- **TriggerEvaluator** matches events against registered conditions

#### Budget Manager (`budget.ts`)

- Tracks daily proactive action consumption
- Separate limits per proaction type:
  - suggestions: 50/day
  - notifications: 30/day
  - low-risk actions: 10/day
- Auto-reset at midnight

#### Scheduler (`scheduler.ts`)

- Manages scheduled and triggered tasks
- Budget-aware execution
- Event logging for all task operations

#### Limits (`limits.ts`)

- Confirmation modes: none, suggest_then_act, explicit_approval
- Configurable limits per action type
- Policy export for persistence

### 4. Human-in-the-Loop (HITL)

HITL Checkpoints (`packages/opencode/src/kiloclaw/hitl/`) ensure human oversight.

#### Checkpoint System (`checkpoint.ts`)

- Blocks execution for high-risk actions
- Registry for managing active checkpoints
- Risk-based checkpoint requirements

#### Approval Workflow (`approval.ts`)

- **ApprovalType**: implicit, explicit, dual_gate
- Request/response workflow
- Expiration handling
- Convenience methods: approve(), reject(), delegate()

#### Irreversible Action Detection (`irreversible.ts`)

- 40+ irreversible action patterns
- Automatic classification
- Safety recommendations

## Safety Principles

1. **Zero silent execution** on irreversible actions
2. **Risk score mandatory** before any action execution
3. **Daily proactive budget** per action type and impact level
4. **Global + per-agency kill switches** always accessible
5. **Fallback to consultative mode** when policy not satisfied
6. **Immutable audit log** with correlation ID for every decision point

## Usage Examples

### Policy Engine

```typescript
import { PolicyEngine } from "./policy/engine"
import { Policy } from "./policy/rules"

const engine = new PolicyEngine({ enableCaching: true })

// Register a static rule
engine.registerRule({
  id: "block-destructive",
  description: "Block destructive actions",
  severity: "critical",
  check: (context) => context.sessionId.includes("blocked"),
})

// Evaluate an action
const result = engine.evaluate(context, action)
if (!result.allowed) {
  console.log("Action blocked:", result.reason)
}
```

### Tool Call Guardrail

```typescript
import { ToolCallGuardrail } from "./guardrail/tool-guard"

const guardrail = new ToolCallGuardrail({
  globalKillSwitch: false,
  perAgencyKillSwitch: {},
})

// Evaluate tool call
const result = guardrail.evaluate(context, action)
if (result.escalationRequired) {
  // Route to appropriate contact
}
```

### Kill Switch

```typescript
// Global kill switch
guardrail.setKillSwitch(true)

// Agency-specific
guardrail.setKillSwitch(true, "agency-nutrition")

// Check status
if (guardrail.isKillSwitchActive("agency-nutrition")) {
  // Agency disabled
}
```

### Data Exfiltration Prevention

```typescript
import { DataExfiltrationGuardrail } from "./guardrail/data-exfiltration"

const guardrail = new DataExfiltrationGuardrail({
  blockOnClassification: ["P0_Critical", "P1_High"],
})

const result = guardrail.evaluate(context, action)
if (!result.allowed) {
  // Block data exfiltration
}
```

## Configuration

### Environment Variables

```bash
# Enable proactivity
KILOCLAW_PROACTIVE_ENABLED=true

# Daily budget
KILOCLAW_PROACTIVE_DAILY_BUDGET=100

# Risk thresholds (JSON)
KILOCLAW_RISK_THRESHOLDS='{"low":0.2,"medium":0.5,"high":0.75,"critical":0.9}'

# Dev-local profile (optional, for trusted personal workspace)
KILO_POLICY_LEVEL=dev-local
KILO_TRUSTED_WORKSPACE=true
KILO_TRUSTED_WORKSPACE_ONLY=true
```

See `DEV_LOCAL_PROFILE.md` for exact behavior changes, safety boundaries, and rollback.

## Testing

Run safety tests:

```bash
bun test test/kiloclaw/safety.test.ts
bun test test/kiloclaw/policy.test.ts
bun test test/kiloclaw/guardrail.test.ts
```

## Audit Trail

All safety decisions are logged with:

- Correlation ID
- Timestamp
- Actor (core/agency/agent)
- Action details
- Decision (approved/blocked/escalated)
- Risk score
- Policy version

See `orchestrator.audit()` interface for audit logging.

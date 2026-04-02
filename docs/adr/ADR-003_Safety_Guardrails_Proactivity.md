# ADR-003: Safety, Guardrails and Proactivity Policy

> **Status**: Draft  
> **Date**: 2026-04-02  
> **Deciders**: Architect, Orchestrator

## Context

Kiloclaw operates autonomously with proactive capabilities. This introduces risks:

- Unverified actions with irreversible consequences
- Invasive data access without consent
- Over-aggressive proactivity degrading user trust
- Tool sprawl expanding attack surface
- Policy bypass attempts

The system must enforce safety through static policies, dynamic guardrails, and human-in-the-loop checkpoints.

## Decision

### Permissioning System

```typescript
// Tool-level scopes
interface ToolPermission {
  readonly tool: ToolId
  readonly scopes: PermissionScope[]
}

enum PermissionScope {
  Read = "read",           // File system read, API GET
  Write = "write",         // File system write, API POST/PUT
  Execute = "execute",     // Command execution, tool activation
  Network = "network",     // External network calls
  ExternalAPI = "external_api" // Third-party integrations
}

// Agency-level capabilities
interface AgencyCapability {
  readonly agency: AgencyId
  readonly allowedTools: ToolId[]
  readonly deniedTools: ToolId[]
  readonly maxConcurrentTasks: number
}

// Data-level classification
enum DataClassification {
  P0_Critical = "critical"  // Highest sensitivity
  P1_High = "high"
  P2_Medium = "medium"
  P3_Low = "low"
}

// Escalation for high-risk actions
interface EscalationPolicy {
  readonly requiresExplicitConsent: boolean
  readonly requiresDoubleGate: boolean
  readonly escalationContact: "user" | "admin" | "audit"
}
```

### Risk Scoring

```typescript
interface RiskScore {
  readonly action: Action
  readonly score: number // 0-1, higher = more risky
  readonly factors: RiskFactor[]
  readonly threshold: number
}

interface RiskFactor {
  readonly type: "reversibility" | "data_sensitivity" | "scope" | "autonomy" | "external_impact"
  readonly weight: number
  readonly value: number
}

// Thresholds
const RISK_THRESHOLDS = {
  low: 0.2, // Proceed with logging
  medium: 0.5, // Proceed with enhanced logging
  high: 0.75, // Require confirmation
  critical: 0.9, // Block or require explicit approval
}
```

### Guardrails

```typescript
interface Guardrail {
  readonly id: GuardrailId
  readonly name: string
  readonly type: "static" | "dynamic"

  // Evaluation
  evaluate(context: ActionContext): GuardrailResult

  // Configuration
  readonly config: GuardrailConfig
}

interface GuardrailConfig {
  // Risk score threshold
  riskThreshold: number

  // Daily budget for proactive actions
  dailyBudget?: {
    total: number
    byImpactLevel: Record<ImpactLevel, number>
  }

  // Kill switch
  globalKillSwitch: boolean
  perAgencyKillSwitch: Record<AgencyId, boolean>

  // Fallback mode
  fallbackToConsultative: boolean // Suggest but don't act
}
```

### Proactivity Framework

```typescript
interface ProactivityPolicy {
  // Allowed trigger signals
  readonly allowedTriggers: TriggerSignal[]

  // Proaction types
  readonly allowedProactions: ProactionType[]

  // Budget management
  readonly dailyBudget: ProactiveBudget

  // Confirmation requirements
  readonly confirmationMode: ConfirmationMode
}

enum TriggerSignal {
  Schedule = "schedule", // Time-based triggers
  Reminder = "reminder", // User-set reminders
  Anomaly = "anomaly", // Detected anomalies
  Threshold = "threshold", // Metric thresholds
}

enum ProactionType {
  Suggest = "suggest", // Suggest then wait
  Notify = "notify", // Notify only
  ActLowRisk = "act_low_risk", // Act on low-risk items
}

enum ConfirmationMode {
  None = "none", // No confirmation needed
  SuggestThenAct = "suggest_then_act", // Confirm before acting
  ExplicitApproval = "explicit_approval", // Full approval flow
}

// Budget tracking
interface ProactiveBudget {
  readonly totalDaily: number
  readonly remaining: number
  readonly resetsAt: Date

  consume(amount: number, type: ProactionType): boolean
  checkLimit(type: ProactionType): boolean
}
```

### Human-in-the-Loop Checkpoints

```typescript
interface HitlCheckpoint {
  readonly id: CheckpointId
  readonly action: Action
  readonly riskLevel: RiskLevel
  readonly requiredApproval: ApprovalType

  // Blocking point in execution
  block(): Promise<ApprovalResult>
}

enum ApprovalType {
  Implicit = "implicit", // User continues action
  Explicit = "explicit", // User approves specific action
  DualGate = "dual_gate", // Two approvers required
}

// Actions requiring explicit HitL
const HITL_REQUIRED_ACTIONS = [
  "delete_data",
  "external_api_write",
  "file_system_write_irreversible",
  "consent_data_sharing",
  "financial_transaction",
]
```

### Audit Trail

```typescript
interface AuditEvent {
  readonly id: AuditEventId
  readonly correlationId: CorrelationId
  readonly timestamp: Date
  readonly actor: "core" | AgencyId | AgentId
  readonly action: Action
  readonly decision: "approved" | "blocked" | "escalated"
  readonly riskScore: RiskScore
  readonly policyVersion: string
  readonly context: ActionContext
}

interface ActionContext {
  readonly userId?: string
  readonly sessionId: string
  readonly agencyId?: AgencyId
  readonly agentId?: AgentId
  readonly toolIds: ToolId[]
  readonly dataClassification: DataClassification[]
  readonly evidenceIds: EvidenceId[]
}
```

## Safety Principles

1. **Zero silent execution** on irreversible actions
2. **Risk score mandatory** before any action execution
3. **Daily proactive budget** per action type and impact level
4. **Global + per-agency kill switches** always accessible
5. **Fallback to consultative mode** when policy not satisfied
6. **Immutable audit log** with correlation ID for every decision point

## Consequences

### Positive

- Comprehensive risk management across all action types
- Budget-based proactivity prevents user trust degradation
- Explicit audit trail enables compliance verification
- Kill switches provide emergency stop capability

### Negative

- Additional latency from risk scoring and policy checks
- Complexity in configuring and maintaining policies
- Potential for over-restriction affecting usability

### Mitigations

- Policy caching for repeated action patterns
- Asynchronous policy evaluation where possible
- Configurable thresholds tuned by success metrics

## References

- KILOCLAW_BLUEPRINT.md Section 5
- KILOCLAW_FOUNDATION_PLAN.md Phase 5 (Proactivity/Safety)

# Risk Matrix

> Kiloclaw Risk Assessment and Mitigation - Phase 5

## Overview

This document defines the risk categories, impact levels, and mitigation strategies for Kiloclaw's autonomous operations.

## Risk Categories

### Category 1: Data Security Risks

| Risk                     | Impact   | Likelihood | Severity | Mitigation                                 | Owner         |
| ------------------------ | -------- | ---------- | -------- | ------------------------------------------ | ------------- |
| PII exfiltration         | Critical | Low        | Critical | DataExfiltrationGuardrail + PII detection  | Security Team |
| Credential exposure      | Critical | Medium     | Critical | Input validation + secret scanning         | Security Team |
| Unauthorized data access | High     | Low        | High     | Scope validation + permission checks       | Platform Team |
| Data corruption          | High     | Medium     | High     | Reversibility checks + transaction logging | Core Team     |

### Category 2: Operational Risks

| Risk                     | Impact | Likelihood | Severity | Mitigation                              | Owner         |
| ------------------------ | ------ | ---------- | -------- | --------------------------------------- | ------------- |
| Uncontrolled proactivity | High   | Medium     | High     | Budget limits + confirmation modes      | Product Team  |
| Resource exhaustion      | Medium | Medium     | Medium   | Scheduler limits + rate limiting        | Platform Team |
| Cascade failures         | High   | Low        | High     | Circuit breakers + graceful degradation | Core Team     |
| Deadlock conditions      | Medium | Low        | Medium   | Timeout enforcement + async patterns    | Core Team     |

### Category 3: Action Risks

| Risk                    | Impact   | Likelihood | Severity | Mitigation                              | Owner         |
| ----------------------- | -------- | ---------- | -------- | --------------------------------------- | ------------- |
| Irreversible actions    | Critical | Medium     | Critical | HITL checkpoints + dual-gate approval   | Security Team |
| External API abuse      | High     | Low        | High     | Rate limiting + API validation          | Platform Team |
| File system damage      | High     | Low        | High     | Scope validation + dry-run option       | Platform Team |
| Network security issues | High     | Medium     | High     | Network scope restrictions + monitoring | Security Team |

### Category 4: Trust Risks

| Risk                           | Impact | Likelihood | Severity | Mitigation                         | Owner        |
| ------------------------------ | ------ | ---------- | -------- | ---------------------------------- | ------------ |
| User surprise from proactivity | Medium | High       | Medium   | Confirmation modes + transparency  | Product Team |
| Confidence mismatch            | Medium | Medium     | Medium   | Confidence scoring in routing      | ML Team      |
| Explainability gaps            | Medium | Low        | Medium   | Audit trail + rationale generation | Core Team    |

## Risk Scoring Methodology

### Factor Weights

| Factor           | Weight | Description                                 |
| ---------------- | ------ | ------------------------------------------- |
| Reversibility    | 0.25   | Can the action be undone?                   |
| Data Sensitivity | 0.30   | What classification of data is involved?    |
| Scope            | 0.20   | How many tools/systems are affected?        |
| Autonomy         | 0.10   | Is this agency-initiated vs user-requested? |
| External Impact  | 0.15   | Does this affect external systems?          |

### Score Calculation

```
RiskScore = Σ (factor_weight × factor_value)

factor_value range: 0.0 - 1.0
```

### Threshold Classification

| Score Range | Level    | Action                             |
| ----------- | -------- | ---------------------------------- |
| 0.0 - 0.2   | Low      | Proceed with logging               |
| 0.2 - 0.5   | Medium   | Proceed with enhanced logging      |
| 0.5 - 0.75  | High     | Require confirmation               |
| 0.75 - 1.0  | Critical | Block or require explicit approval |

## Mitigation Strategies

### 1. Prevention (Reduce Likelihood)

- **Policy Engine**: Evaluate all actions before execution
- **Static Rules**: Register known dangerous patterns
- **Dynamic Scoring**: Calculate risk in real-time
- **Guardrails**: Special-purpose safety checks

### 2. Detection (Reduce Time to Response)

- **Audit Logging**: All decisions logged with correlation IDs
- **Anomaly Detection**: Trigger-based alerts for unusual patterns
- **Health Checks**: Tool and service monitoring

### 3. Recovery (Reduce Impact)

- **Reversibility Checks**: Block irreversible actions by default
- **Checkpoint System**: Human-in-the-loop for critical actions
- **Rollback Support**: Maintain state for potential undo
- **Escalation Paths**: Route to humans when automated decisions uncertain

## Action Classification Matrix

| Action Type        | Reversibility      | Data Sensitivity | Scope           | External  | Auto Score | Level    |
| ------------------ | ------------------ | ---------------- | --------------- | --------- | ---------- | -------- |
| read_file          | Reversible (0.1)   | Low (0.25)       | Single (0.2)    | No (0.15) | ~0.18      | Low      |
| write_file         | Reversible (0.1)   | Medium (0.5)     | Single (0.25)   | No (0.15) | ~0.25      | Medium   |
| delete_data        | Irreversible (0.9) | High (0.75)      | Multiple (0.45) | No (0.15) | ~0.56      | High     |
| external_api_write | Irreversible (0.9) | High (0.75)      | Multiple (0.6)  | Yes (0.8) | ~0.78      | Critical |
| drop_database      | Irreversible (0.9) | Critical (1.0)   | Multiple (0.8)  | No (0.15) | ~0.72      | High     |

## Escalation Matrix

| Risk Level | Required Approval | Escalation Contact | Confirmation Mode |
| ---------- | ----------------- | ------------------ | ----------------- |
| Low        | None              | Audit              | None              |
| Medium     | Implicit          | Audit              | None              |
| High       | Explicit          | User               | suggest_then_act  |
| Critical   | Dual Gate         | Admin              | explicit_approval |

## Risk Acceptance Criteria

Actions are considered safe to proceed when:

1. **Low Risk**: Score < 0.2, no irreversible actions
2. **Medium Risk**: Score < 0.5, standard logging enabled
3. **High Risk**: Score < 0.75, user confirmation received
4. **Critical**: Score >= 0.75 or irreversible, dual-gate approval required

## Testing Requirements

| Scenario                | Test Type   | Pass Criteria            |
| ----------------------- | ----------- | ------------------------ |
| Low-risk action allowed | Unit        | Result.allowed = true    |
| Critical risk blocked   | Unit        | Result.allowed = false   |
| Budget exhaustion       | Integration | Proactive actions queued |
| Dual-gate approval      | Integration | Two approvers confirm    |
| Kill switch activated   | Chaos       | All actions blocked      |

## Review Cadence

- **Weekly**: Review anomaly detection triggers
- **Monthly**: Update risk thresholds based on data
- **Quarterly**: Full risk matrix review with stakeholders
- **On-demand**: After any safety incident

## Related Documents

- `SAFETY_POLICY.md` - Safety architecture documentation
- `PROACTIVITY_LIMITS.md` - Proactivity framework documentation
- `ADR-003_Safety_Guardrails_Proactivity.md` - Architecture decision record

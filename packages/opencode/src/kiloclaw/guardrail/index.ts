// Kiloclaw Guardrail - Barrel exports

// Tool call guardrail
export {
  ToolCallGuardrail,
  ToolCallGuardrail$,
  type Guardrail,
  type GuardrailResult,
  type GuardrailConfig,
} from "./tool-guard"

// Data exfiltration guardrail
export { DataExfiltrationGuardrail, DataExfiltrationGuardrail$ } from "./data-exfiltration"

// Escalation handler
export {
  EscalationHandler,
  EscalationHandler$,
  type EscalationPolicy,
  type EscalationResult,
  type EscalationContact,
} from "./escalation"

// Risk scorer
export { RiskScorer, RiskScorer$, type ScoredResult } from "./risk-scorer"

// Kiloclaw Policy - Barrel exports

// Rules and types - selectively export to avoid RiskFactor conflict
export {
  PermissionScope,
  DataClassification,
  RISK_THRESHOLDS,
  type RiskLevel,
  type ToolPermission,
  type AgencyCapability,
  type EscalationPolicy,
  type RiskScore,
  type RiskFactor,
  type GuardrailType,
  type Guardrail,
  type GuardrailResult,
  type StaticRule,
  type ActionContext,
  type AuditEvent,
  type PolicyEngineConfig,
  Policy,
} from "./rules"

// Policy engine
export { PolicyEngine, PolicyEngine$ } from "./engine"

// Dynamic risk calculation - export but skip RiskFactor since it's duplicated in rules
export {
  type RiskFactorType,
  type DynamicRiskScore,
  type RiskCalculationInput,
  DynamicRiskCalculator,
  DynamicRisk,
} from "./dynamic"

// Validation schemas
export * from "./validator"

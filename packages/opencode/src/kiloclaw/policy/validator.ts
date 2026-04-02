import z from "zod"
import {
  PermissionScope,
  DataClassification,
  RISK_THRESHOLDS,
  type ToolPermission,
  type AgencyCapability,
  type EscalationPolicy,
  type RiskScore,
  type StaticRule,
  type ActionContext,
} from "./rules"

// Zod schemas for all policy types

// Tool permission schema
export const ToolPermissionSchema = z.object({
  tool: z.string().min(1),
  scopes: z.array(PermissionScope).min(1),
})

// Agency capability schema
export const AgencyCapabilitySchema = z.object({
  agency: z.string().min(1),
  allowedTools: z.array(z.string()),
  deniedTools: z.array(z.string()).default([]),
  maxConcurrentTasks: z.number().int().positive().default(5),
})

// Escalation policy schema
export const EscalationPolicySchema = z.object({
  requiresExplicitConsent: z.boolean(),
  requiresDoubleGate: z.boolean(),
  escalationContact: z.enum(["user", "admin", "audit"]),
})

// Risk factor schema
export const RiskFactorSchema = z.object({
  type: z.enum(["reversibility", "data_sensitivity", "scope", "autonomy", "external_impact"]),
  weight: z.number().min(0).max(1),
  value: z.number().min(0).max(1),
})

// Risk score schema
export const RiskScoreSchema = z.object({
  action: z.object({
    type: z.string(),
    target: z.string().optional(),
    parameters: z.record(z.string(), z.unknown()).optional(),
  }),
  score: z.number().min(0).max(1),
  factors: z.array(RiskFactorSchema),
  threshold: z.enum(["low", "medium", "high", "critical"]),
})

// Static rule schema
export const StaticRuleSchema = z.object({
  id: z.string().min(1),
  description: z.string(),
  check: z.function().optional(), // Runtime function, not serializable
  severity: z.enum(["low", "medium", "high", "critical"]),
})

// Action context schema
export const ActionContextSchema = z.object({
  userId: z.string().optional(),
  sessionId: z.string().min(1),
  agencyId: z.string().optional(),
  agentId: z.string().optional(),
  toolIds: z.array(z.string()).default([]),
  dataClassification: z.array(DataClassification).default([]),
  correlationId: z.string().min(1),
})

// Policy engine config schema
export const PolicyEngineConfigSchema = z.object({
  enableCaching: z.boolean().default(true),
  cacheTTLMs: z.number().int().positive().default(5000),
  fallbackToConsultative: z.boolean().default(true),
})

// Guardrail config schema
export const GuardrailConfigSchema = z.object({
  riskThreshold: z.number().min(0).max(1).default(0.5),
  dailyBudget: z
    .object({
      total: z.number().int().nonnegative(),
      byImpactLevel: z.record(z.enum(["low", "medium", "high", "critical"]), z.number().int().nonnegative()),
    })
    .optional(),
  globalKillSwitch: z.boolean().default(false),
  perAgencyKillSwitch: z.record(z.string(), z.boolean()).default({}),
  fallbackToConsultative: z.boolean().default(false),
})

// Validate tool permission
export function validateToolPermission(data: unknown): ToolPermission {
  return ToolPermissionSchema.parse(data)
}

// Validate agency capability
export function validateAgencyCapability(data: unknown): AgencyCapability {
  return AgencyCapabilitySchema.parse(data)
}

// Validate escalation policy
export function validateEscalationPolicy(data: unknown): EscalationPolicy {
  return EscalationPolicySchema.parse(data)
}

// Validate risk score
export function validateRiskScore(data: unknown): RiskScore {
  return RiskScoreSchema.parse(data)
}

// Validate action context
export function validateActionContext(data: unknown): ActionContext {
  return ActionContextSchema.parse(data)
}

// Check if risk score is within valid range
export function isValidRiskScore(score: number): boolean {
  return score >= 0 && score <= 1
}

// Check if thresholds are properly ordered
export function areThresholdsValid(): boolean {
  return (
    RISK_THRESHOLDS.low < RISK_THRESHOLDS.medium &&
    RISK_THRESHOLDS.medium < RISK_THRESHOLDS.high &&
    RISK_THRESHOLDS.high < RISK_THRESHOLDS.critical
  )
}

// Safe parse functions that return null instead of throwing
export const safeParse = {
  toolPermission: (data: unknown) => ToolPermissionSchema.safeParse(data),
  agencyCapability: (data: unknown) => AgencyCapabilitySchema.safeParse(data),
  escalationPolicy: (data: unknown) => EscalationPolicySchema.safeParse(data),
  riskScore: (data: unknown) => RiskScoreSchema.safeParse(data),
  actionContext: (data: unknown) => ActionContextSchema.safeParse(data),
}

// Namespace exports
export namespace PolicyValidator {
  export const Schema = {
    ToolPermission: ToolPermissionSchema,
    AgencyCapability: AgencyCapabilitySchema,
    EscalationPolicy: EscalationPolicySchema,
    RiskScore: RiskScoreSchema,
    RiskFactor: RiskFactorSchema,
    ActionContext: ActionContextSchema,
    PolicyEngineConfig: PolicyEngineConfigSchema,
    GuardrailConfig: GuardrailConfigSchema,
  }

  export function validate(data: unknown, schema: z.ZodSchema): boolean {
    return schema.safeParse(data).success
  }

  export function getErrors(data: unknown, schema: z.ZodSchema): string[] {
    const result = schema.safeParse(data)
    if (result.success) return []
    return result.error.issues.map((e: z.ZodIssue) => `${e.path.join(".")}: ${e.message}`)
  }
}

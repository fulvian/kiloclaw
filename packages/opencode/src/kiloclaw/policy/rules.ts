import z from "zod"
import { Log } from "@/util/log"
import { fn } from "@/util/fn"
import type { Action, DataClassification, PermissionScope } from "../types"

// Re-export PermissionScope and DataClassification from types for convenience
export { PermissionScope } from "../types"
export { DataClassification } from "../types"

// Risk level thresholds
export const RISK_THRESHOLDS = {
  low: 0.2,
  medium: 0.5,
  high: 0.75,
  critical: 0.9,
} as const

export type RiskLevel = keyof typeof RISK_THRESHOLDS

// Tool permission definition
export interface ToolPermission {
  readonly tool: string
  readonly scopes: PermissionScope[]
}

// Agency capability definition
export interface AgencyCapability {
  readonly agency: string
  readonly allowedTools: string[]
  readonly deniedTools: string[]
  readonly maxConcurrentTasks: number
}

// Escalation policy for high-risk actions
export interface EscalationPolicy {
  readonly requiresExplicitConsent: boolean
  readonly requiresDoubleGate: boolean
  readonly escalationContact: "user" | "admin" | "audit"
}

// Risk score with factors
export interface RiskScore {
  readonly action: Action
  readonly score: number // 0-1, higher = more risky
  readonly factors: RiskFactor[]
  readonly threshold: RiskLevel
}

export interface RiskFactor {
  readonly type: "reversibility" | "data_sensitivity" | "scope" | "autonomy" | "external_impact"
  readonly weight: number
  readonly value: number
}

// Guardrail types
export const GuardrailType = z.enum(["static", "dynamic"])
export type GuardrailType = z.infer<typeof GuardrailType>

// Guardrail interface
export interface Guardrail {
  readonly id: string
  readonly name: string
  readonly type: GuardrailType
  evaluate(context: ActionContext, action: Action): GuardrailResult
}

// Guardrail result
export interface GuardrailResult {
  readonly allowed: boolean
  readonly reason: string
  readonly riskScore?: number
  readonly escalationRequired: boolean
}

// Static rule definition
export interface StaticRule {
  readonly id: string
  readonly description: string
  readonly check: (context: ActionContext) => boolean
  readonly severity: RiskLevel
}

// Action context for evaluation - extends PolicyContext with additional fields
export interface ActionContext {
  readonly userId?: string
  readonly sessionId: string
  readonly agencyId?: string
  readonly agentId?: string
  readonly toolIds: string[]
  readonly dataClassification: DataClassification[]
  readonly correlationId: string
}

// Audit event structure
export interface AuditEvent {
  readonly id: string
  readonly correlationId: string
  readonly timestamp: Date
  readonly actor: "core" | string
  readonly action: Action
  readonly decision: "approved" | "blocked" | "escalated"
  readonly riskScore: RiskScore
  readonly policyVersion: string
  readonly context: ActionContext
}

// Policy engine configuration
export interface PolicyEngineConfig {
  readonly enableCaching: boolean
  readonly cacheTTLMs: number
  readonly fallbackToConsultative: boolean
}

// Policy namespace with factories and helpers
export namespace Policy {
  // Zod schemas for validation
  export const RiskScoreSchema = z.object({
    score: z.number().min(0).max(1),
    threshold: z.enum(["low", "medium", "high", "critical"]),
    action: z.object({
      type: z.string(),
      target: z.string().optional(),
      parameters: z.record(z.string(), z.unknown()).optional(),
    }),
    factors: z.array(
      z.object({
        type: z.enum(["reversibility", "data_sensitivity", "scope", "autonomy", "external_impact"]),
        weight: z.number().min(0).max(1),
        value: z.number().min(0).max(1),
      }),
    ),
  })

  export const ActionContextSchema = z.object({
    userId: z.string().optional(),
    sessionId: z.string(),
    agencyId: z.string().optional(),
    agentId: z.string().optional(),
    toolIds: z.array(z.string()),
    dataClassification: z.array(z.string()),
    correlationId: z.string(),
  })

  export const ToolPermissionSchema = z.object({
    tool: z.string(),
    scopes: z.array(z.string()),
  })

  export const AgencyCapabilitySchema = z.object({
    agency: z.string(),
    allowedTools: z.array(z.string()),
    deniedTools: z.array(z.string()),
    maxConcurrentTasks: z.number().int().positive(),
  })

  export const EscalationPolicySchema = z.object({
    requiresExplicitConsent: z.boolean(),
    requiresDoubleGate: z.boolean(),
    escalationContact: z.enum(["user", "admin", "audit"]),
  })

  // Create action context from basic params
  export function createContext(input: {
    sessionId: string
    agencyId?: string
    agentId?: string
    toolIds?: string[]
    dataClassification?: DataClassification[]
    correlationId?: string
  }): ActionContext {
    return {
      sessionId: input.sessionId,
      agencyId: input.agencyId,
      agentId: input.agentId,
      toolIds: input.toolIds ?? [],
      dataClassification: input.dataClassification ?? [],
      correlationId: input.correlationId ?? crypto.randomUUID(),
    }
  }

  // Classify risk level from score
  export function classifyRisk(score: number): RiskLevel {
    if (score >= RISK_THRESHOLDS.critical) return "critical"
    if (score >= RISK_THRESHOLDS.high) return "high"
    if (score >= RISK_THRESHOLDS.medium) return "medium"
    return "low"
  }

  // Check if risk exceeds threshold
  export function exceedsThreshold(score: number, level: RiskLevel): boolean {
    return score >= RISK_THRESHOLDS[level]
  }
}

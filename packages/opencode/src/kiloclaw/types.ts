import z from "zod"

// Base identifier types
export const AgencyId = z.string().brand<"AgencyId">()
export type AgencyId = z.infer<typeof AgencyId>

export const AgentId = z.string().brand<"AgentId">()
export type AgentId = z.infer<typeof AgentId>

export const SkillId = z.string().brand<"SkillId">()
export type SkillId = z.infer<typeof SkillId>

export const ToolId = z.string().brand<"ToolId">()
export type ToolId = z.infer<typeof ToolId>

export const CorrelationId = z.string().brand<"CorrelationId">()
export type CorrelationId = z.infer<typeof CorrelationId>

// Semantic version (e.g., "1.2.3")
export const SemanticVersion = z.string().regex(/^\d+\.\d+\.\d+$/, "Must be semver format (x.y.z)")
export type SemanticVersion = z.infer<typeof SemanticVersion>

// Duration in milliseconds
export const Duration = z.number().int().nonnegative()
export type Duration = z.infer<typeof Duration>

// Domain types
export const Domain = z.enum(["development", "knowledge", "nutrition", "weather", "nba", "finance", "custom"])
export type Domain = z.infer<typeof Domain>

// Status types
export const AgencyStatus = z.enum(["idle", "running", "paused", "stopped", "error"])
export type AgencyStatus = z.infer<typeof AgencyStatus>

export const AgentStatus = z.enum(["idle", "busy", "error", "unavailable"])
export type AgentStatus = z.infer<typeof AgentStatus>

export const TaskStatus = z.enum(["pending", "running", "completed", "failed", "cancelled", "timeout"])
export type TaskStatus = z.infer<typeof TaskStatus>

// JSON Schema type (using Zod schema as a proxy)
export interface JsonSchema {
  readonly type: string
  readonly properties?: Record<string, JsonSchema>
  readonly required?: readonly string[]
  readonly items?: JsonSchema
  readonly enum?: unknown[]
  readonly const?: unknown
  readonly additionalProperties?: boolean | JsonSchema
  readonly $ref?: string
  readonly description?: string
}

// Capability and limit sets
export const CapabilitySet = z.record(z.string(), z.unknown())
export type CapabilitySet = z.infer<typeof CapabilitySet>

export const LimitSet = z
  .object({
    maxConcurrentTasks: z.number().int().positive().optional(),
    maxRetries: z.number().int().nonnegative().optional(),
    timeoutMs: Duration.optional(),
    memoryLimitMb: z.number().int().positive().optional(),
  })
  .strict()
export type LimitSet = z.infer<typeof LimitSet>

// Permission scopes
export const PermissionScope = z.enum(["read", "write", "execute", "network", "external_api", "filesystem"])
export type PermissionScope = z.infer<typeof PermissionScope>

export const PermissionSet = z.array(PermissionScope)
export type PermissionSet = z.infer<typeof PermissionSet>

// Data classification levels
export const DataClassification = z.enum(["P0_Critical", "P1_High", "P2_Medium", "P3_Low"])
export type DataClassification = z.infer<typeof DataClassification>

// Intent and action types for policy engine
export const Intent = z.object({
  id: z.string(),
  type: z.string(),
  description: z.string(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  risk: z.enum(["low", "medium", "high", "critical"]).default("low"),
})
export type Intent = z.infer<typeof Intent>

export const Action = z.object({
  type: z.string(),
  target: z.string().optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
})
export type Action = z.infer<typeof Action>

// Policy context and result
export const PolicyContext = z.object({
  agencyId: AgencyId,
  agentId: AgentId.optional(),
  intent: Intent.optional(),
  action: Action.optional(),
  userApproved: z.boolean().optional(),
  correlationId: CorrelationId,
})
export type PolicyContext = z.infer<typeof PolicyContext>

export const PolicyResult = z.object({
  allowed: z.boolean(),
  reason: z.string().optional(),
  requiresApproval: z.boolean().default(false),
})
export type PolicyResult = z.infer<typeof PolicyResult>

// Agency assignment result
export const AgencyAssignment = z.object({
  agencyId: AgencyId,
  confidence: z.number().min(0).max(1),
  reason: z.string().optional(),
})
export type AgencyAssignment = z.infer<typeof AgencyAssignment>

// Re-export flexible agency types from agency module
export type { TaskIntent, RouteResult } from "./agency/routing/types"
export { TaskIntentSchema, RouteResultSchema, migrateLegacyTaskType } from "./agency/routing/types"

export type {
  SkillDefinition,
  SkillChain,
  SkillChainStep,
  AgencyDefinition,
  AgencyPolicies,
  FlexibleAgentDefinition,
  AgentConstraints,
} from "./agency/registry/types"
export {
  SkillDefinitionSchema,
  SkillChainSchema,
  SkillChainStepSchema,
  AgencyDefinitionSchema,
  AgencyPoliciesSchema,
  FlexibleAgentDefinitionSchema,
  AgentConstraintsSchema,
} from "./agency/registry/types"

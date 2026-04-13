// Registry types for capability-based agency architecture
// Phase 1: Flexible Agency Architecture

import z from "zod"

// kilocode_change start - removed SemanticVersion re-export to break circular dependency
// The version field in schemas uses inline z.string().regex() validation
// kilocode_change end

// PermissionNext.Rule import for agent permissions
import { PermissionNext } from "@/permission/next"

// SkillDefinition - versioned capability with capability tags
export const SkillDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "Must be semver format (x.y.z)"),
  description: z.string(),

  // JSON Schema for validation
  inputSchema: z.record(z.string(), z.unknown()),
  outputSchema: z.record(z.string(), z.unknown()),

  // FLEXIBLE capability tags
  capabilities: z.array(z.string()).min(1),
  tags: z.array(z.string()).default([]),

  // Optional dependencies
  requires: z.array(z.string()).optional(),
  providesContext: z.array(z.string()).optional(),
})

export type SkillDefinition = z.infer<typeof SkillDefinitionSchema>

// SkillChainStep - single step in a skill chain
export const SkillChainStepSchema = z.object({
  skillId: z.string(),
  inputTransform: z.string().optional(),
  outputTransform: z.string().optional(),
  condition: z.string().optional(),
})

export type SkillChainStep = z.infer<typeof SkillChainStepSchema>

// SkillChain - composition of skills
export const SkillChainSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().default(""),
  steps: z.array(SkillChainStepSchema).min(1),
  outputSchema: z.record(z.string(), z.unknown()),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "Must be semver format (x.y.z)"),
})

export type SkillChain = z.infer<typeof SkillChainSchema>

// AgencyPolicies - governance policies for agency
export const AgencyPoliciesSchema = z.object({
  allowedCapabilities: z.array(z.string()).default([]),
  deniedCapabilities: z.array(z.string()).default([]),
  maxRetries: z.number().int().nonnegative().default(3),
  requiresApproval: z.boolean().default(false),
  dataClassification: z.enum(["public", "internal", "confidential", "restricted"]).default("internal"),
  // FIX 2: Policy level mapping (optional, for policy enforcement)
  policyMapping: z.record(z.string(), z.string()).optional(),
})

export type AgencyPolicies = z.infer<typeof AgencyPoliciesSchema>

// AgencyMetadata - metadata for agency (allows any structure but documents known keys)
export const AgencyMetadataSchema = z
  .object({
    wave: z.number().optional(),
    description: z.string().optional(),
    nativeAdapters: z.array(z.string()).optional(),
    policyEnforced: z.boolean().optional(),
    contextFootprint: z
      .object({
        toolsExposed: z.number().optional(),
        schemaSizeEstimate: z.string().optional(),
        lazyLoadingStrategy: z.string().optional(),
        budgetContextPerStep: z.string().optional(),
      })
      .optional(),
  })
  .passthrough() // Allow any additional properties

export type AgencyMetadata = z.infer<typeof AgencyMetadataSchema>

// AgencyDefinition - flexible domain agency with governance
export const AgencyDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  domain: z.string(), // Flexible domain - "knowledge", "development", "nutrition", "custom:anything"
  policies: AgencyPoliciesSchema,
  providers: z.array(z.string()).default([]),
  metadata: AgencyMetadataSchema.optional(),
})

export type AgencyDefinition = z.infer<typeof AgencyDefinitionSchema>

// AgentConstraints - constraints for agent execution
export const AgentConstraintsSchema = z.object({
  maxConcurrentTasks: z.number().int().positive().optional(),
  timeoutMs: z.number().int().nonnegative().optional(),
  allowedDomains: z.array(z.string()).optional(),
})

export type AgentConstraints = z.infer<typeof AgentConstraintsSchema>

// AgentDefinition - capability bundle (flexible, replaces legacy)
// Extended with prompt, permission, mode, description for full agent integration
export const FlexibleAgentDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  primaryAgency: z.string(),
  secondaryAgencies: z.array(z.string()).default([]),
  capabilities: z.array(z.string()).min(1),
  skills: z.array(z.string()).default([]),
  constraints: AgentConstraintsSchema.default({}),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "Must be semver format (x.y.z)"),

  // Extended fields for agent integration (Phase 1: Eliminazione Nativi)
  // Made all optional to maintain backward compatibility during migration
  description: z.string().optional(),
  prompt: z.string().optional(),
  permission: PermissionNext.Ruleset.optional(),
  mode: z.enum(["primary", "subagent"]).optional(),
})

export type FlexibleAgentDefinition = z.infer<typeof FlexibleAgentDefinitionSchema>

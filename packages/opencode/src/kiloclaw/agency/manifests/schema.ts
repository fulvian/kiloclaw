/**
 * Manifest Schema - Versioned manifest definitions
 * Phase 8: Dynamic Multi-Level Retrieval SOTA 2026
 * KILOCLAW_DYNAMIC_MULTI_LEVEL_RETRIEVAL_SOTA_2026-04-06.md
 *
 * Defines schemas for versioned manifests used in lazy discovery:
 * - ManifestHeader: Common metadata (version, compat, hash)
 * - AgencyManifest: Agency capability and policy manifest
 * - SkillManifest: Skill capability and dependency manifest
 * - AgentManifest: Agent capability and constraint manifest
 * - ChainManifest: Skill chain composition manifest
 */

import z from "zod"

// =============================================================================
// Semantic Version
// =============================================================================

export const SemanticVersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/, "Must be semver format (x.y.z)")
export type SemanticVersion = z.infer<typeof SemanticVersionSchema>

// =============================================================================
// Compatibility Contract
// =============================================================================

export const CompatibilityContractSchema = z.object({
  minVersion: SemanticVersionSchema,
  maxVersion: SemanticVersionSchema.optional(),
  deprecated: z.boolean().default(false),
  migrationGuide: z.string().optional(),
})
export type CompatibilityContract = z.infer<typeof CompatibilityContractSchema>

// =============================================================================
// Manifest Header (common to all manifests)
// =============================================================================

export const ManifestHeaderSchema = z.object({
  id: z.string().min(1),
  version: SemanticVersionSchema,
  name: z.string().min(1),
  description: z.string().default(""),
  compatibility: CompatibilityContractSchema,
  capabilities: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  hash: z.string().length(64).optional(), // SHA-256 hex digest
  createdAt: z.number().int().positive().optional(),
  updatedAt: z.number().int().positive().optional(),
})
export type ManifestHeader = z.infer<typeof ManifestHeaderSchema>

// =============================================================================
// Agency Manifest
// =============================================================================

export const AgencyPoliciesManifestSchema = z.object({
  allowedCapabilities: z.array(z.string()).default([]),
  deniedCapabilities: z.array(z.string()).default([]),
  maxRetries: z.number().int().nonnegative().default(3),
  requiresApproval: z.boolean().default(false),
  dataClassification: z.enum(["public", "internal", "confidential", "restricted"]).default("internal"),
})
export type AgencyPoliciesManifest = z.infer<typeof AgencyPoliciesManifestSchema>

export const AgencyManifestSchema = ManifestHeaderSchema.extend({
  domain: z.string(),
  policies: AgencyPoliciesManifestSchema,
  providers: z.array(z.string()).default([]),
  metadata: z.record(z.string(), z.unknown()).default({}),
})
export type AgencyManifest = z.infer<typeof AgencyManifestSchema>

// =============================================================================
// Skill Manifest
// =============================================================================

export const SkillManifestSchema = ManifestHeaderSchema.extend({
  inputSchema: z.record(z.string(), z.unknown()),
  outputSchema: z.record(z.string(), z.unknown()),
  requires: z.array(z.string()).default([]),
  providesContext: z.array(z.string()).default([]),
  dependencies: z
    .array(
      z.object({
        skillId: z.string(),
        version: SemanticVersionSchema,
        optional: z.boolean().default(false),
      }),
    )
    .default([]),
})
export type SkillManifest = z.infer<typeof SkillManifestSchema>

// =============================================================================
// Agent Manifest
// =============================================================================

export const AgentConstraintsManifestSchema = z.object({
  maxConcurrentTasks: z.number().int().nonnegative().optional(),
  maxRetries: z.number().int().nonnegative().optional(),
  timeoutMs: z.number().int().positive().optional(),
  memoryBudgetMb: z.number().int().positive().optional(),
})
export type AgentConstraintsManifestSchema = z.infer<typeof AgentConstraintsManifestSchema>

export const AgentManifestSchema = ManifestHeaderSchema.extend({
  primaryAgency: z.string(),
  secondaryAgencies: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  constraints: AgentConstraintsManifestSchema.default({}),
})
export type AgentManifest = z.infer<typeof AgentManifestSchema>

// =============================================================================
// Chain Manifest
// =============================================================================

export const ChainStepManifestSchema = z.object({
  skillId: z.string(),
  inputTransform: z.string().optional(),
  outputTransform: z.string().optional(),
  condition: z.string().optional(),
})
export type ChainStepManifest = z.infer<typeof ChainStepManifestSchema>

export const ChainManifestSchema = ManifestHeaderSchema.extend({
  steps: z.array(ChainStepManifestSchema).min(1),
})
export type ChainManifest = z.infer<typeof ChainManifestSchema>

// =============================================================================
// Manifest Index (catalog of all manifests)
// =============================================================================

export const ManifestIndexSchema = z.object({
  version: SemanticVersionSchema,
  manifests: z.object({
    agencies: z.record(z.string(), SemanticVersionSchema),
    skills: z.record(z.string(), SemanticVersionSchema),
    agents: z.record(z.string(), SemanticVersionSchema),
    chains: z.record(z.string(), SemanticVersionSchema),
  }),
  updatedAt: z.number().int().positive(),
})
export type ManifestIndex = z.infer<typeof ManifestIndexSchema>

// =============================================================================
// Validation helpers
// =============================================================================

export function isCompatible(manifestVersion: string, contract: CompatibilityContract): boolean {
  const manifest = parseVersion(manifestVersion)
  const min = parseVersion(contract.minVersion)
  const max = contract.maxVersion ? parseVersion(contract.maxVersion) : null

  if (manifest.major !== min.major) return false
  if (manifest.minor < min.minor) return false
  if (max && (manifest.minor > max.minor || (manifest.minor === max.minor && manifest.patch > max.patch))) return false

  return true
}

function parseVersion(v: string): { major: number; minor: number; patch: number } {
  const [major, minor, patch] = v.split(".").map(Number)
  return { major, minor, patch }
}

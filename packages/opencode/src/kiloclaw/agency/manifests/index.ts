// Manifest module barrel exports
// Phase 8: Dynamic Multi-Level Retrieval SOTA 2026

// Schema definitions
export {
  CompatibilityContractSchema,
  ManifestHeaderSchema,
  AgencyManifestSchema,
  SkillManifestSchema,
  AgentManifestSchema,
  ChainManifestSchema,
  ManifestIndexSchema,
  isCompatible,
  type CompatibilityContract,
  type ManifestHeader,
  type AgencyManifest,
  type SkillManifest,
  type AgentManifest,
  type ChainManifest,
  type ManifestIndex,
  type ChainStepManifest,
  type AgencyPoliciesManifest,
} from "./schema"

// Loader (use ManifestLoader.isEnabled, ManifestLoader.isLoaded, etc.)
export { ManifestLoader, type ManifestType } from "./loader"

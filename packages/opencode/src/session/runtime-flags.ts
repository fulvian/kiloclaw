/**
 * Runtime Feature Flags - Skills/Tools Runtime Remediation
 * P0/P1: Tool Identity Resolver + Execution Bridge
 *
 * Feature flags for controlling the runtime remediation features.
 * These flags enable progressive rollout with shadow mode support.
 */

import { Flag } from "@/flag/flag"

// =============================================================================
// P0: Tool Identity Resolver
// =============================================================================

/**
 * Master enable for ToolIdentityResolver
 * Default: false (shadow mode until validated)
 */
export const TOOL_IDENTITY_RESOLVER_ENABLED = () => !!Flag.KILO_RUNTIME_TOOL_IDENTITY_RESOLVER_ENABLED

/**
 * Shadow mode for resolver - logs resolution without enforcing
 * Default: true (observe only)
 */
export const TOOL_IDENTITY_RESOLVER_SHADOW = () => !Flag.KILO_RUNTIME_TOOL_IDENTITY_RESOLVER_SHADOW

// =============================================================================
// P1: Session Execution Bridge
// =============================================================================

/**
 * Master enable for execution bridge (runSkill/executeChain in session loop)
 * Default: false (disabled until validated)
 */
export const SESSION_EXECUTION_BRIDGE_ENABLED = () => !!Flag.KILO_RUNTIME_SESSION_EXECUTION_BRIDGE_ENABLED

/**
 * Shadow mode for execution bridge - logs without executing
 * Default: true
 */
export const SESSION_EXECUTION_BRIDGE_SHADOW = () => !Flag.KILO_RUNTIME_SESSION_EXECUTION_BRIDGE_SHADOW

/**
 * Max steps for chain execution in bridge
 * Default: 10
 */
export const SESSION_EXECUTION_BRIDGE_MAX_STEPS = () => Flag.KILO_RUNTIME_SESSION_EXECUTION_BRIDGE_MAX_STEPS

/**
 * Timeout for chain execution in milliseconds
 * Default: 60000 (60 seconds)
 */
export const SESSION_EXECUTION_BRIDGE_TIMEOUT_MS = () => Flag.KILO_RUNTIME_SESSION_EXECUTION_BRIDGE_TIMEOUT_MS

// =============================================================================
// Skill Tool Execute Mode
// =============================================================================

/**
 * Enable execute mode in skill tool (vs document-only load)
 * When disabled, skill tool only returns skill content (documental)
 * When enabled, skill tool can trigger actual skill execution
 * Default: false (document-only until validated)
 */
export const SKILL_TOOL_EXECUTE_MODE_ENABLED = () => !!Flag.KILO_RUNTIME_SKILL_TOOL_EXECUTE_MODE_ENABLED

/**
 * Guardrail: prevent false completion from skill_content output
 * When enabled, checks for execution evidence before marking complete
 * Default: true
 */
export const SKILL_NO_SILENT_FALLBACK_ENABLED = () => !Flag.KILO_RUNTIME_SKILL_NO_SILENT_FALLBACK

// =============================================================================
// Agency-specific flags (for canary rollout)
// =============================================================================

export type AgencyId = "knowledge" | "gworkspace" | "finance" | "nba" | "development"

/**
 * Enable resolver for specific agency
 */
export const isAgencyResolverEnabled = (agency: AgencyId): boolean => {
  switch (agency) {
    case "knowledge":
      return !!Flag.KILO_RUNTIME_AGENCY_KNOWLEDGE_RESOLVER_ENABLED
    case "gworkspace":
      return !!Flag.KILO_RUNTIME_AGENCY_GWORKSPACE_RESOLVER_ENABLED
    case "finance":
      return !!Flag.KILO_RUNTIME_AGENCY_FINANCE_RESOLVER_ENABLED
    case "nba":
      return !!Flag.KILO_RUNTIME_AGENCY_NBA_RESOLVER_ENABLED
    case "development":
      return !!Flag.KILO_RUNTIME_AGENCY_DEVELOPMENT_RESOLVER_ENABLED
    default:
      return false
  }
}

/**
 * Enable execution bridge for specific agency
 */
export const isAgencyBridgeEnabled = (agency: AgencyId): boolean => {
  switch (agency) {
    case "knowledge":
      return !!Flag.KILO_RUNTIME_AGENCY_KNOWLEDGE_BRIDGE_ENABLED
    case "gworkspace":
      return !!Flag.KILO_RUNTIME_AGENCY_GWORKSPACE_BRIDGE_ENABLED
    case "finance":
      return !!Flag.KILO_RUNTIME_AGENCY_FINANCE_BRIDGE_ENABLED
    case "nba":
      return !!Flag.KILO_RUNTIME_AGENCY_NBA_BRIDGE_ENABLED
    case "development":
      return !!Flag.KILO_RUNTIME_AGENCY_DEVELOPMENT_BRIDGE_ENABLED
    default:
      return false
  }
}

// =============================================================================
// Metric thresholds (for alerting)
// =============================================================================

/**
 * Max acceptable policy_alias_miss_rate (percentage)
 * Default: 2%
 */
export const POLICY_ALIAS_MISS_THRESHOLD = () => Flag.KILO_RUNTIME_POLICY_ALIAS_MISS_THRESHOLD

/**
 * Max acceptable skill_loaded_not_executed count
 * Default: 0 (must be zero in operational paths)
 */
export const SKILL_NOT_EXECUTED_THRESHOLD = () => Flag.KILO_RUNTIME_SKILL_NOT_EXECUTED_THRESHOLD

/**
 * Max acceptable generic_fallback_rate increase vs baseline (percentage)
 * Default: 20%
 */
export const GENERIC_FALLBACK_RATE_THRESHOLD = () => Flag.KILO_RUNTIME_GENERIC_FALLBACK_RATE_THRESHOLD

/**
 * Min acceptable agency_chain_success_rate (percentage)
 * Default: 95%
 */
export const AGENCY_CHAIN_SUCCESS_THRESHOLD = () => Flag.KILO_RUNTIME_AGENCY_CHAIN_SUCCESS_THRESHOLD

// =============================================================================
// Feature flag configuration interface (for runtime config)
// =============================================================================

export interface RuntimeFlags {
  toolIdentityResolver: {
    enabled: boolean
    shadow: boolean
  }
  sessionExecutionBridge: {
    enabled: boolean
    shadow: boolean
    maxSteps: number
    timeoutMs: number
  }
  skillTool: {
    executeMode: boolean
    noSilentFallback: boolean
  }
  agency: Partial<Record<AgencyId, { resolver: boolean; bridge: boolean }>>
  thresholds: {
    policyAliasMissRate: number
    skillNotExecuted: number
    genericFallbackRate: number
    agencyChainSuccessRate: number
  }
}

/**
 * Get current runtime flag configuration
 */
export function getRuntimeFlags(): RuntimeFlags {
  return {
    toolIdentityResolver: {
      enabled: TOOL_IDENTITY_RESOLVER_ENABLED(),
      shadow: TOOL_IDENTITY_RESOLVER_SHADOW(),
    },
    sessionExecutionBridge: {
      enabled: SESSION_EXECUTION_BRIDGE_ENABLED(),
      shadow: SESSION_EXECUTION_BRIDGE_SHADOW(),
      maxSteps: SESSION_EXECUTION_BRIDGE_MAX_STEPS(),
      timeoutMs: SESSION_EXECUTION_BRIDGE_TIMEOUT_MS(),
    },
    skillTool: {
      executeMode: SKILL_TOOL_EXECUTE_MODE_ENABLED(),
      noSilentFallback: SKILL_NO_SILENT_FALLBACK_ENABLED(),
    },
    agency: {
      knowledge: {
        resolver: isAgencyResolverEnabled("knowledge"),
        bridge: isAgencyBridgeEnabled("knowledge"),
      },
      gworkspace: {
        resolver: isAgencyResolverEnabled("gworkspace"),
        bridge: isAgencyBridgeEnabled("gworkspace"),
      },
      finance: {
        resolver: isAgencyResolverEnabled("finance"),
        bridge: isAgencyBridgeEnabled("finance"),
      },
      nba: {
        resolver: isAgencyResolverEnabled("nba"),
        bridge: isAgencyBridgeEnabled("nba"),
      },
      development: {
        resolver: isAgencyResolverEnabled("development"),
        bridge: isAgencyBridgeEnabled("development"),
      },
    },
    thresholds: {
      policyAliasMissRate: POLICY_ALIAS_MISS_THRESHOLD(),
      skillNotExecuted: SKILL_NOT_EXECUTED_THRESHOLD(),
      genericFallbackRate: GENERIC_FALLBACK_RATE_THRESHOLD(),
      agencyChainSuccessRate: AGENCY_CHAIN_SUCCESS_THRESHOLD(),
    },
  }
}

/**
 * Tool Identity Resolver - Single source of truth for alias → runtime mapping
 * P0: Stabilizza identità tool e policy binding
 *
 * Resolves policy tool aliases to actual runtime keys used by:
 * - Native tools (direct ID match)
 * - MCP clients (sanitized client_tool format)
 */

import { Log } from "@/util/log"
import { ToolIdentityMap } from "./tool-identity-map"
import { Flag } from "@/flag/flag"

const log = Log.create({ service: "session.tool-identity-resolver" })

// =============================================================================
// Resolver Types
// =============================================================================

export interface ResolveResult {
  /** The canonical policy alias (input) */
  alias: string
  /** The actual runtime key to use */
  runtimeKey: string
  /** Which type of tool system */
  toolType: "native" | "mcp" | "unknown"
  /** Whether resolution succeeded */
  resolved: boolean
  /** Reason if not resolved */
  reason?: string
}

export interface ResolutionMetrics {
  alias: string
  canonical: string
  runtime: string
  toolType: "native" | "mcp" | "unknown"
  hit: boolean
}

// =============================================================================
// ToolIdentityResolver Namespace
// =============================================================================

export namespace ToolIdentityResolver {
  const log = Log.create({ service: "session.tool-identity-resolver" })
  // =============================================================================
  // Feature Flags (Shadow mode - observe only by default)
  // =============================================================================

  /** Enable resolver enforcement (default: false - shadow mode) */
  export const RESOLVER_ENABLED = () => !!Flag.KILO_RUNTIME_TOOL_IDENTITY_RESOLVER_ENABLED

  /** Shadow mode: log resolution without enforcing (default: true) */
  export const RESOLVER_SHADOW_MODE = () => !Flag.KILO_RUNTIME_TOOL_IDENTITY_RESOLVER_SHADOW

  // =============================================================================
  // Core Resolution Functions
  // =============================================================================

  /**
   * Resolve a policy alias to a runtime key
   * Uses canonical mapping for MCP tools, direct ID for native tools
   *
   * @param alias - The policy tool alias (e.g., "gmail.search", "websearch", "finance-api")
   * @param agencyId - The agency context for mapping lookup
   * @param knownMcpKeys - Set of known MCP runtime keys (from MCP.tools())
   * @returns Resolution result with runtime key and type
   */
  export function resolve(alias: string, agencyId: string, knownMcpKeys?: Set<string>): ResolveResult {
    // First, check if alias is in any agency map (handles both dotted and dashed aliases)
    const agencyMap = ToolIdentityMap.getAgencyToolMap(agencyId)
    if (agencyMap[alias]) {
      const runtimeKey = agencyMap[alias]!

      // Verify runtime key exists in known MCP keys (if provided)
      if (knownMcpKeys && !knownMcpKeys.has(runtimeKey)) {
        log.warn("alias maps to runtime key not in MCP keys", {
          alias,
          runtimeKey,
          knownKeys: Array.from(knownMcpKeys).slice(0, 10),
        })
        return {
          alias,
          runtimeKey,
          toolType: "mcp",
          resolved: false,
          reason: `runtime key "${runtimeKey}" not found in MCP tools`,
        }
      }

      return {
        alias,
        runtimeKey,
        toolType: "mcp",
        resolved: true,
      }
    }

    // If alias doesn't have a dot (native tool pattern), treat as native tool ID
    // Don't apply generic fallback map - native tools pass through unchanged
    if (!alias.includes(".")) {
      // Check if it's actually a known MCP key
      if (knownMcpKeys?.has(alias)) {
        return {
          alias,
          runtimeKey: alias,
          toolType: "mcp",
          resolved: true,
        }
      }
      // Native tool ID - return as-is
      return {
        alias,
        runtimeKey: alias,
        toolType: "native",
        resolved: true,
      }
    }

    // Dotted alias not in any map - unresolved
    return {
      alias,
      runtimeKey: alias,
      toolType: "unknown",
      resolved: false,
      reason: `alias "${alias}" not found in agency "${agencyId}" mapping`,
    }
  }

  /**
   * Resolve multiple aliases at once
   */
  export function resolveAll(aliases: string[], agencyId: string, knownMcpKeys?: Set<string>): ResolveResult[] {
    return aliases.map((alias) => resolve(alias, agencyId, knownMcpKeys))
  }

  /**
   * Filter a list of tools based on policy allowlist using resolver
   *
   * @param requestedTools - Tools requested (can be policy aliases or runtime keys)
   * @param allowedAliases - Policy allowlist of aliases
   * @param agencyId - Agency context
   * @param knownMcpKeys - Known MCP runtime keys
   * @returns Object with allowed and blocked tool lists
   */
  export function filterByPolicy(
    requestedTools: string[],
    allowedAliases: string[],
    agencyId: string,
    knownMcpKeys?: Set<string>,
  ): { allowed: string[]; blocked: string[]; blockedReason: Record<string, string> } {
    const allowed: string[] = []
    const blocked: string[] = []
    const blockedReason: Record<string, string> = {}

    // Build a set of allowed aliases for O(1) lookup
    const allowedSet = new Set(allowedAliases)

    // Build a map of runtime key -> alias for allowlist entries
    const allowlistRuntimeToAlias: Record<string, string> = {}
    for (const alias of allowedAliases) {
      const result = resolve(alias, agencyId, knownMcpKeys)
      if (result.resolved) {
        allowlistRuntimeToAlias[result.runtimeKey] = alias
      }
    }

    for (const tool of requestedTools) {
      // Direct match in allowed set (alias match)
      if (allowedSet.has(tool)) {
        allowed.push(tool)
        continue
      }

      // Check if tool is a runtime key that matches an allowed alias
      if (allowlistRuntimeToAlias[tool]) {
        allowed.push(tool)
        continue
      }

      // Try to resolve the tool
      const result = resolve(tool, agencyId, knownMcpKeys)

      if (result.resolved && allowedSet.has(result.alias)) {
        // The resolved alias is in the allowlist
        allowed.push(result.runtimeKey)
      } else if (!result.resolved) {
        blocked.push(tool)
        blockedReason[tool] = result.reason ?? "unknown"
      } else {
        // Resolved but alias not in allowlist
        blocked.push(tool)
        blockedReason[tool] = `resolved alias "${result.alias}" not in policy allowlist`
      }
    }

    return { allowed, blocked, blockedReason }
  }

  /**
   * Normalize an agency allowlist to canonical IDs
   * Ensures allowlist uses consistent canonical IDs that match runtime
   */
  export function normalizeAllowlist(allowlist: string[], agencyId: string): string[] {
    const normalized: string[] = []
    const seen = new Set<string>()

    for (const alias of allowlist) {
      const result = resolve(alias, agencyId)
      // Avoid duplicates
      if (!seen.has(result.runtimeKey)) {
        normalized.push(result.runtimeKey)
        seen.add(result.runtimeKey)
      }
    }

    return normalized
  }

  // =============================================================================
  // Telemetry / Metrics
  // =============================================================================

  /**
   * Record a resolution event for metrics
   */
  export function recordResolution(metrics: ResolutionMetrics): void {
    if (RESOLVER_SHADOW_MODE()) {
      log.debug("tool_identity_resolved", metrics)
    } else {
      log.info("tool_identity_resolved", metrics)
    }
  }

  /**
   * Record a resolution miss (alias not found)
   */
  export function recordMiss(alias: string, agencyId: string, reason: string): void {
    log.warn("tool_identity_miss", { alias, agencyId, reason })
  }

  // =============================================================================
  // Utility Functions
  // =============================================================================

  /**
   * Check if two tool IDs refer to the same tool
   * (one might be alias, other might be runtime key)
   */
  export function areEquivalent(toolId1: string, toolId2: string, agencyId: string): boolean {
    if (toolId1 === toolId2) return true

    const result1 = resolve(toolId1, agencyId)
    const result2 = resolve(toolId2, agencyId)

    return result1.runtimeKey === result2.runtimeKey
  }

  /**
   * Get the canonical alias for a runtime key (reverse lookup)
   */
  export function getCanonicalAlias(runtimeKey: string, agencyId: string): string | undefined {
    const reverseMap = ToolIdentityMap.buildReverseMap(agencyId)
    return reverseMap[runtimeKey]
  }

  /**
   * Validate that all tools in an allowlist can be resolved
   */
  export function validateAllowlist(
    allowlist: string[],
    agencyId: string,
  ): {
    valid: boolean
    unresolved: string[]
    reasons: Record<string, string>
  } {
    const unresolved: string[] = []
    const reasons: Record<string, string> = {}

    for (const alias of allowlist) {
      const result = resolve(alias, agencyId)
      if (!result.resolved) {
        unresolved.push(alias)
        reasons[alias] = result.reason ?? "unknown"
      }
    }

    return {
      valid: unresolved.length === 0,
      unresolved,
      reasons,
    }
  }
}

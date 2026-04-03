/**
 * Config Legacy Adapter Layer for Kiloclaw
 *
 * Provides backward compatibility during migration from ARIA to Kiloclaw.
 * Transforms ARIA configs, maps environment variables, and parses legacy conventions.
 */

import { Log } from "@/util/log"
import { fn } from "@/util/fn"
import z from "zod"
import type { ConfigInfo } from "@/kiloclaw/config"

// ============================================================================
// Types
// ============================================================================

/**
 * Memory conventions parsed from ARIA.md
 */
export interface MemoryConventions {
  version: string
  layers: {
    working?: LayerConfig
    episodic?: LayerConfig
    semantic?: LayerConfig
    procedural?: LayerConfig
  }
  skills?: SkillConfig[]
  metadata?: Record<string, unknown>
}

interface LayerConfig {
  enabled: boolean
  retention?: string
  ttl?: string
  path?: string
}

interface SkillConfig {
  id: string
  enabled: boolean
  layer?: string
}

/**
 * Migration report with diff
 */
export interface MigrationReport {
  timestamp: string
  ariaVersion: string
  kiloclawVersion: string
  changes: MigrationChange[]
  warnings: string[]
  summary: {
    total: number
    mapped: number
    skipped: number
    issues: number
  }
}

interface MigrationChange {
  path: string
  type: "added" | "removed" | "modified" | "renamed"
  oldValue?: unknown
  newValue?: unknown
  description: string
}

/**
 * Dual-read result containing merged environment and any deprecation notices
 */
interface DualReadResult {
  env: Record<string, string>
  deprecated: string[]
  warnings: string[]
}

// ============================================================================
// Constants
// ============================================================================

const ARIA_PREFIX = "ARIA_"
const KILOCLAW_PREFIX = "KILOCLAW_"

// ARIA env var mappings per ARIA_TO_KILOCLAW_MAPPING.md Section 5.1
const AGENCY_ENV_MAPPINGS: Record<string, { kiloclaw: string; transform: (v: string) => string | boolean | number }> = {
  ARIA_ENABLED: { kiloclaw: "KILOCLAW_CORE_ENABLED", transform: (v) => v === "true" },
  ARIA_ROUTING_DEFAULT_AGENCY: { kiloclaw: "KILOCLAW_ROUTING_DEFAULT_AGENCY", transform: (v) => v },
  ARIA_ROUTING_CONFIDENCE_THRESHOLD: {
    kiloclaw: "KILOCLAW_ROUTING_CONFIDENCE",
    transform: (v) => clamp01(parseFloat(v)),
  },
  ARIA_ROUTING_ENABLE_FALLBACK: { kiloclaw: "KILOCLAW_ROUTING_FALLBACK", transform: (v) => v === "true" },
  ARIA_AGENCIES_DEVELOPMENT_ENABLED: {
    kiloclaw: "KILOCLAW_AGENCY_DEVELOPMENT_ENABLED",
    transform: (v) => v === "true",
  },
  ARIA_AGENCIES_KNOWLEDGE_ENABLED: { kiloclaw: "KILOCLAW_AGENCY_KNOWLEDGE_ENABLED", transform: (v) => v === "true" },
  ARIA_AGENCIES_NUTRITION_ENABLED: { kiloclaw: "KILOCLAW_AGENCY_NUTRITION_ENABLED", transform: (v) => v === "true" },
  ARIA_AGENCIES_WEATHER_ENABLED: { kiloclaw: "KILOCLAW_AGENCY_WEATHER_ENABLED", transform: (v) => v === "true" },
}

const SCHEDULER_ENV_MAPPINGS: Record<
  string,
  { kiloclaw: string; transform: (v: string) => string | boolean | number }
> = {
  ARIA_SCHEDULER_MAX_CONCURRENT_TASKS: {
    kiloclaw: "KILOCLAW_SCHED_MAX_CONCURRENT",
    transform: (v) => Math.max(1, parseInt(v, 10)),
  },
  ARIA_SCHEDULER_DEFAULT_PRIORITY: {
    kiloclaw: "KILOCLAW_SCHED_DEFAULT_PRIORITY",
    transform: (v) => clampRange(0, 100, parseInt(v, 10)),
  },
  ARIA_SCHEDULER_DISPATCH_INTERVAL_MS: {
    kiloclaw: "KILOCLAW_SCHED_DISPATCH_MS",
    transform: (v) => Math.max(100, parseInt(v, 10)),
  },
  ARIA_SCHEDULER_RECOVERY_POLICY: { kiloclaw: "KILOCLAW_SCHED_RECOVERY_POLICY", transform: (v) => v },
}

const GUARDRAIL_ENV_MAPPINGS: Record<
  string,
  { kiloclaw: string; transform: (v: string) => string | boolean | number }
> = {
  ARIA_GUARDRAILS_ALLOW_PROACTIVE: { kiloclaw: "KILOCLAW_PROACTIVE_ENABLED", transform: (v) => v === "true" },
  ARIA_GUARDRAILS_MAX_DAILY_ACTIONS: {
    kiloclaw: "KILOCLAW_PROACTIVE_DAILY_BUDGET",
    transform: (v) => Math.max(0, parseInt(v, 10)),
  },
}

const ALL_ARIA_ENV_MAPPINGS = {
  ...AGENCY_ENV_MAPPINGS,
  ...SCHEDULER_ENV_MAPPINGS,
  ...GUARDRAIL_ENV_MAPPINGS,
}

// Valid agency enum values
const VALID_AGENCIES = ["development", "knowledge", "nutrition", "weather"] as const

// Recovery policy enum values
const VALID_RECOVERY_POLICIES = ["strict", "relaxed", "none"] as const

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Schema for migrated agency config
 */
const MigratedAgencySchema = z.object({
  id: z.string(),
  domain: z.string(),
  enabled: z.boolean().default(true),
  config: z.record(z.string(), z.unknown()).default({}),
})

/**
 * Schema for migrated telemetry config
 */
const MigratedTelemetrySchema = z.object({
  enabled: z.boolean().default(true),
  endpoint: z.string().default("https://telemetry.kiloclaw.io"),
  projectId: z.string().default("kiloclaw-dev"),
})

/**
 * Schema for migrated config validation
 */
export const MigratedConfigSchema = z.object({
  logLevel: z.enum(["DEBUG", "INFO", "WARN", "ERROR"]).default("INFO"),
  debug: z.boolean().default(false),
  agencies: z.array(MigratedAgencySchema).default([]),
  plugins: z.array(z.string()).default([]),
  telemetry: MigratedTelemetrySchema.optional().default({
    enabled: true,
    endpoint: "https://telemetry.kiloclaw.io",
    projectId: "kiloclaw-dev",
  }),
})

export type MigratedConfig = z.infer<typeof MigratedConfigSchema>

/**
 * Schema for ARIA config section in .opencode.json
 */
const AriaConfigSectionSchema = z.object({
  agencies: z
    .array(
      z.object({
        id: z.string(),
        domain: z.string(),
        enabled: z.boolean().optional(),
        config: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .optional(),
  routing: z
    .object({
      defaultAgency: z.string().optional(),
      confidenceThreshold: z.number().optional(),
      enableFallback: z.boolean().optional(),
    })
    .optional(),
  scheduler: z
    .object({
      maxConcurrentTasks: z.number().optional(),
      defaultPriority: z.number().optional(),
      dispatchIntervalMs: z.number().optional(),
      recoveryPolicy: z.string().optional(),
    })
    .optional(),
  guardrails: z
    .object({
      allowProactive: z.boolean().optional(),
      maxDailyActions: z.number().optional(),
    })
    .optional(),
  telemetry: z
    .object({
      enabled: z.boolean().optional(),
      endpoint: z.string().optional(),
      projectId: z.string().optional(),
    })
    .optional(),
  memory: z
    .object({
      working: z.record(z.string(), z.unknown()).optional(),
      episodic: z.record(z.string(), z.unknown()).optional(),
      semantic: z.record(z.string(), z.unknown()).optional(),
      procedural: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
})

/**
 * Schema for ARIA.md conventions parser
 */
const AriaMdLayerSchema = z.object({
  enabled: z.boolean().default(true),
  retention: z.string().optional(),
  ttl: z.string().optional(),
  path: z.string().optional(),
})

const AriaMdSkillSchema = z.object({
  id: z.string(),
  enabled: z.boolean().default(true),
  layer: z.string().optional(),
})

const AriaMdSchema = z.object({
  version: z.string().default("1.0"),
  layers: z
    .object({
      working: AriaMdLayerSchema.optional(),
      episodic: AriaMdLayerSchema.optional(),
      semantic: AriaMdLayerSchema.optional(),
      procedural: AriaMdLayerSchema.optional(),
    })
    .default({}),
  skills: z.array(AriaMdSkillSchema).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

// ============================================================================
// Helper Functions
// ============================================================================

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function clampRange(min: number, max: number, value: number): number {
  return Math.min(max, Math.max(min, value))
}

function isAriaVar(key: string): boolean {
  return key.startsWith(ARIA_PREFIX)
}

function isKiloclawVar(key: string): boolean {
  return key.startsWith(KILOCLAW_PREFIX)
}

function stripPrefix(key: string, prefix: string): string {
  return key.substring(prefix.length)
}

// ============================================================================
// Legacy Adapter Namespace
// ============================================================================

export namespace LegacyAdapter {
  const log = Log.create({ service: "kiloclaw.config-legacy-adapter" })

  /**
   * Transform ARIA config section to Kiloclaw format
   */
  export const transformAriaConfig = fn(z.unknown(), (ariaConfig: unknown): Partial<ConfigInfo> => {
    log.debug("transforming ARIA config", { hasConfig: !!ariaConfig })

    const parsed = AriaConfigSectionSchema.safeParse(ariaConfig)
    if (!parsed.success) {
      log.warn("failed to parse ARIA config, using defaults", {
        error: parsed.error.message,
      })
      return {}
    }

    const aria = parsed.data
    const result: Partial<ConfigInfo> = {
      agencies: [],
      telemetry: {
        enabled: true,
        endpoint: "https://telemetry.kiloclaw.io",
        projectId: "kiloclaw-dev",
      },
    }

    // Transform agencies
    if (aria.agencies) {
      result.agencies = aria.agencies.map((a) => ({
        id: a.id,
        domain: a.domain,
        enabled: a.enabled ?? true,
        config: a.config ?? {},
      }))
    }

    // Transform routing to agency config
    if (aria.routing) {
      let defaultAgency = result.agencies?.find((a) => a.id === "default")
      if (!defaultAgency) {
        defaultAgency = {
          id: "default",
          domain: "core",
          enabled: true,
          config: {},
        }
        result.agencies!.unshift(defaultAgency)
      }
      if (aria.routing.defaultAgency) {
        defaultAgency.config = {
          ...defaultAgency.config,
          defaultAgency: aria.routing.defaultAgency,
        }
      }
    }

    // Transform scheduler settings
    if (aria.scheduler) {
      let defaultAgency = result.agencies?.find((a) => a.id === "default")
      if (!defaultAgency) {
        defaultAgency = {
          id: "default",
          domain: "core",
          enabled: true,
          config: {},
        }
        result.agencies!.unshift(defaultAgency)
      }

      const schedConfig: Record<string, unknown> = {}
      if (aria.scheduler.maxConcurrentTasks !== undefined) {
        schedConfig.maxConcurrentTasks = Math.max(1, aria.scheduler.maxConcurrentTasks)
      }
      if (aria.scheduler.defaultPriority !== undefined) {
        schedConfig.defaultPriority = clampRange(0, 100, aria.scheduler.defaultPriority)
      }
      if (aria.scheduler.dispatchIntervalMs !== undefined) {
        schedConfig.dispatchIntervalMs = Math.max(100, aria.scheduler.dispatchIntervalMs)
      }
      if (aria.scheduler.recoveryPolicy !== undefined) {
        schedConfig.recoveryPolicy = aria.scheduler.recoveryPolicy
      }
      // Store in default agency config
      defaultAgency.config = { ...defaultAgency.config, scheduler: schedConfig }
    }

    // Transform telemetry
    if (aria.telemetry) {
      result.telemetry = {
        enabled: aria.telemetry.enabled ?? true,
        endpoint: aria.telemetry.endpoint ?? "https://telemetry.kiloclaw.io",
        projectId: aria.telemetry.projectId ?? "kiloclaw-dev",
      }
    }

    log.info("ARIA config transformed successfully", {
      agencyCount: result.agencies?.length ?? 0,
    })

    return result
  })

  /**
   * Map ARIA_AGENCY_* env vars to KILOCLAW_AGENCY_* format with dual-read
   *
   * Dual-read strategy:
   * - Read ARIA_* vars first (if present, emit deprecation warning)
   * - Transform to KILOCLAW_* equivalent
   * - KILOCLAW_* vars take precedence if both present
   */
  export function mapAgencyEnv(env: Record<string, string>): DualReadResult {
    const result: Record<string, string> = {}
    const deprecated: string[] = []
    const warnings: string[] = []

    // First pass: map ARIA vars to KILOCLAW equivalents
    for (const [key, value] of Object.entries(env)) {
      if (!isAriaVar(key)) continue

      const mapping = ALL_ARIA_ENV_MAPPINGS[key]
      if (!mapping) continue

      // Emit deprecation warning
      deprecated.push(key)
      warnings.push(
        `DEPRECATED: ${key} is deprecated. Use ${mapping.kiloclaw} instead. ` +
          `ARIA_* environment variables will be removed in a future release.`,
      )

      // Transform value
      const transformed = mapping.transform(value)
      result[mapping.kiloclaw] = String(transformed)
    }

    // Second pass: KILOCLAW_* vars take precedence
    for (const [key, value] of Object.entries(env)) {
      if (!isKiloclawVar(key)) continue
      result[key] = value
    }

    return { env: result, deprecated, warnings }
  }

  /**
   * Map ARIA_MEMORY_* env vars to KILOCLAW_MEMORY_* format
   */
  export function mapMemoryEnv(env: Record<string, string>): DualReadResult {
    const result: Record<string, string> = {}
    const deprecated: string[] = []
    const warnings: string[] = []

    const MEMORY_PREFIX = "ARIA_MEMORY_"
    const KILOCLAW_MEMORY_PREFIX = "KILOCLAW_MEMORY_"

    for (const [key, value] of Object.entries(env)) {
      if (!isAriaVar(key)) continue

      // Handle ARIA_MEMORY_* pattern
      if (key.startsWith(MEMORY_PREFIX)) {
        const suffix = stripPrefix(key, MEMORY_PREFIX)
        const kiloclawKey = KILOCLAW_MEMORY_PREFIX + suffix

        deprecated.push(key)
        warnings.push(
          `DEPRECATED: ${key} is deprecated. Use ${kiloclawKey} instead. ` +
            `Memory layer settings should be configured in kiloclaw.config.json.`,
        )

        result[kiloclawKey] = value
      }
    }

    // KILOCLAW_MEMORY_* vars take precedence
    for (const [key, value] of Object.entries(env)) {
      if (key.startsWith(KILOCLAW_MEMORY_PREFIX)) {
        result[key] = value
      }
    }

    return { env: result, deprecated, warnings }
  }

  /**
   * Map ARIA_TOOL_* env vars to KILOCLAW_TOOL_* format with validation
   */
  export function mapToolEnv(env: Record<string, string>): DualReadResult {
    const result: Record<string, string> = {}
    const deprecated: string[] = []
    const warnings: string[] = []

    const TOOL_PREFIX = "ARIA_TOOL_"
    const KILOCLAW_TOOL_PREFIX = "KILOCLAW_TOOL_"

    // Valid tool permission scopes
    const VALID_SCOPES = ["read", "write", "execute", "network", "external_api", "filesystem"] as const

    for (const [key, value] of Object.entries(env)) {
      if (!isAriaVar(key)) continue

      // Handle ARIA_TOOL_* pattern
      if (key.startsWith(TOOL_PREFIX)) {
        const suffix = stripPrefix(key, TOOL_PREFIX)
        const kiloclawKey = KILOCLAW_TOOL_PREFIX + suffix

        deprecated.push(key)

        // Validate tool permission scope if it's a scope-related setting
        if (suffix.includes("SCOPE") || suffix.includes("PERMISSION")) {
          const scopes = value.split(",").map((s) => s.trim())
          const invalidScopes = scopes.filter((s) => !VALID_SCOPES.includes(s as (typeof VALID_SCOPES)[number]))

          if (invalidScopes.length > 0) {
            warnings.push(
              `WARNING: ${key} contains invalid scope(s): ${invalidScopes.join(", ")}. ` +
                `Valid scopes are: ${VALID_SCOPES.join(", ")}. ` +
                `This tool configuration will be blocked.`,
            )
            // Don't map invalid tool configs
            continue
          }
        }

        warnings.push(
          `DEPRECATED: ${key} is deprecated. Use ${kiloclawKey} instead. ` +
            `Tool permissions should be configured in kiloclaw.config.json.`,
        )

        result[kiloclawKey] = value
      }
    }

    // KILOCLAW_TOOL_* vars take precedence
    for (const [key, value] of Object.entries(env)) {
      if (key.startsWith(KILOCLAW_TOOL_PREFIX)) {
        result[key] = value
      }
    }

    return { env: result, deprecated, warnings }
  }

  /**
   * Log all deprecation warnings
   */
  export function logDeprecationWarnings(warnings: string[]): void {
    for (const warning of warnings) {
      log.warn("legacy config adapter", { warning })
    }
  }
}

// ============================================================================
// ARIA.md Adapter Namespace
// ============================================================================

export namespace AriaMdAdapter {
  const log = Log.create({ service: "kiloclaw.aria-md-adapter" })

  /**
   * Parse ARIA.md memory conventions
   *
   * Expected format:
   * ```markdown
   * # ARIA Memory Conventions
   *
   * ## Version
   * 1.0
   *
   * ## Layers
   * ### Working Memory
   * - enabled: true
   * - retention: session
   * - ttl: 1h
   *
   * ### Episodic Memory
   * - enabled: true
   * - retention: 30d
   *
   * ## Skills
   * - code_review: enabled
   * - debugging: enabled
   * ```
   */
  export function parseAriaConventions(content: string): MemoryConventions {
    log.debug("parsing ARIA.md conventions")

    const lines = content.split("\n")
    const conventions: MemoryConventions = {
      version: "1.0",
      layers: {},
      skills: [],
      metadata: {},
    }

    let currentSection: "layers" | "skills" | "metadata" | "none" = "none"
    let currentLayer: string | null = null

    for (const line of lines) {
      const trimmed = line.trim()

      // Detect sections
      if (trimmed.startsWith("#") && trimmed.toLowerCase().includes("version")) {
        continue
      }

      if (trimmed === "## Layers" || trimmed === "## Memory Layers") {
        currentSection = "layers"
        continue
      }

      if (trimmed === "## Skills") {
        currentSection = "skills"
        continue
      }

      if (trimmed === "## Metadata" || trimmed === "## Metadata") {
        currentSection = "metadata"
        continue
      }

      // Parse layer sections
      if (trimmed.startsWith("### ")) {
        const rawLayerName = trimmed.substring(4).trim().toLowerCase()
        // Match "working memory" -> "working", "episodic memory" -> "episodic", etc.
        const layerName = rawLayerName.replace(/\s*memory\s*$/i, "").trim()
        if (["working", "episodic", "semantic", "procedural"].includes(layerName)) {
          currentLayer = layerName
          conventions.layers[layerName as keyof typeof conventions.layers] = { enabled: true }
        }
        continue
      }

      // Parse layer properties
      if (currentLayer && trimmed.startsWith("- ")) {
        const property = trimmed.substring(2)
        const [key, ...valueParts] = property.split(":")
        const value = valueParts.join(":").trim()

        const layerConfig = conventions.layers[currentLayer as keyof typeof conventions.layers]!
        switch (key.trim()) {
          case "enabled":
            layerConfig.enabled = value === "true"
            break
          case "retention":
            layerConfig.retention = value
            break
          case "ttl":
            layerConfig.ttl = value
            break
          case "path":
            layerConfig.path = value
            break
        }
        continue
      }

      // Parse skills
      if (currentSection === "skills" && trimmed.startsWith("- ")) {
        const skillDef = trimmed.substring(2)
        const [skillId, enabledStr] = skillDef.split(":").map((s) => s.trim())
        conventions.skills?.push({
          id: skillId,
          enabled: enabledStr !== "disabled",
        })
      }
    }

    log.info("ARIA.md conventions parsed", {
      layers: Object.keys(conventions.layers).length,
      skills: conventions.skills?.length ?? 0,
    })

    return conventions
  }

  /**
   * Export to KILOCLAW_MEMORY.md format
   *
   * Converts ARIA conventions to the new 4-layer memory model format
   */
  export function exportToKiloclaw(conventions: MemoryConventions): string {
    log.debug("exporting to KILOCLAW_MEMORY.md format")

    const lines: string[] = [
      "# Kiloclaw Memory Configuration",
      "",
      "> **Migration**: Converted from ARIA.md conventions",
      "> **Date**: " + new Date().toISOString(),
      "",
      "## Version",
      conventions.version,
      "",
      "## Memory Layers",
      "",
    ]

    // Export each layer
    const layerOrder = ["working", "episodic", "semantic", "procedural"] as const

    for (const layerName of layerOrder) {
      const layer = conventions.layers[layerName]
      if (!layer) continue

      lines.push(`### ${layerName.charAt(0).toUpperCase() + layerName.slice(1)} Memory`)
      lines.push("")
      lines.push(`- **enabled**: ${layer.enabled}`)
      if (layer.retention) lines.push(`- **retention**: ${layer.retention}`)
      if (layer.ttl) lines.push(`- **ttl**: ${layer.ttl}`)
      if (layer.path) lines.push(`- **path**: ${layer.path}`)
      lines.push("")
    }

    // Export skills
    if (conventions.skills && conventions.skills.length > 0) {
      lines.push("## Skill Registry")
      lines.push("")
      lines.push("| Skill ID | Enabled | Default Layer |")
      lines.push("| -------- | ------- | ------------- |")

      for (const skill of conventions.skills) {
        const layer = skill.layer ?? "procedural"
        lines.push(`| ${skill.id} | ${skill.enabled} | ${layer} |`)
      }

      lines.push("")
    }

    // Export metadata
    if (conventions.metadata && Object.keys(conventions.metadata).length > 0) {
      lines.push("## Metadata")
      lines.push("")
      for (const [key, value] of Object.entries(conventions.metadata)) {
        lines.push(`- **${key}**: ${value}`)
      }
      lines.push("")
    }

    return lines.join("\n")
  }

  /**
   * Generate migration report with diff
   */
  export function generateMigrationReport(ariaContent: string, kiloclawContent: string): MigrationReport {
    log.info("generating migration report")

    const ariaConventions = parseAriaConventions(ariaContent)
    const kiloclawExport = exportToKiloclaw(ariaConventions)

    const changes: MigrationChange[] = []

    // Detect changes between original ARIA content and exported Kiloclaw format
    const ariaLines = ariaContent.split("\n")
    const kiloclawLines = kiloclawExport.split("\n")

    // Simple diff detection
    const maxLines = Math.max(ariaLines.length, kiloclawLines.length)
    for (let i = 0; i < maxLines; i++) {
      const ariaLine = ariaLines[i]
      const kiloclawLine = kiloclawLines[i]

      if (ariaLine === undefined) {
        changes.push({
          path: `line ${i + 1}`,
          type: "added",
          newValue: kiloclawLine,
          description: "Line added in Kiloclaw format",
        })
      } else if (kiloclawLine === undefined) {
        changes.push({
          path: `line ${i + 1}`,
          type: "removed",
          oldValue: ariaLine,
          description: "Line removed from ARIA format",
        })
      } else if (ariaLine !== kiloclawLine) {
        // Check if it's a header change (## -> ### etc)
        if (ariaLine.startsWith("#") || kiloclawLine.startsWith("#")) {
          changes.push({
            path: `line ${i + 1}`,
            type: "modified",
            oldValue: ariaLine,
            newValue: kiloclawLine,
            description: "Header formatting updated",
          })
        }
      }
    }

    const warnings: string[] = []

    // Add migration warnings
    if (Object.keys(ariaConventions.layers).length > 0) {
      warnings.push(
        "Memory layer configuration has been converted to KILOCLAW_MEMORY.md format. " +
          "Please review the generated configuration and adjust as needed.",
      )
    }

    if (ariaConventions.skills && ariaConventions.skills.length > 0) {
      warnings.push(
        "Skill configurations have been migrated. " +
          "Verify that all skills are properly registered in the new skill registry.",
      )
    }

    const summary = {
      total: changes.length,
      mapped: changes.filter((c) => c.type === "added" || c.type === "modified").length,
      skipped: changes.filter((c) => c.type === "removed").length,
      issues: warnings.length,
    }

    const report: MigrationReport = {
      timestamp: new Date().toISOString(),
      ariaVersion: ariaConventions.version,
      kiloclawVersion: "2.0",
      changes,
      warnings,
      summary,
    }

    log.info("migration report generated", { summary })

    return report
  }
}

// ============================================================================
// Config Validation
// ============================================================================

/**
 * Validate migrated config against schema
 */
export function validateMigratedConfig(config: unknown): {
  valid: boolean
  errors?: z.ZodError
  config?: MigratedConfig
} {
  const result = MigratedConfigSchema.safeParse(config)

  if (!result.success) {
    return { valid: false, errors: result.error }
  }

  return { valid: true, config: result.data }
}

/**
 * Validate agency ID against known agencies
 */
export function validateAgencyId(agencyId: string): boolean {
  return VALID_AGENCIES.includes(agencyId as (typeof VALID_AGENCIES)[number])
}

/**
 * Validate recovery policy
 */
export function validateRecoveryPolicy(policy: string): boolean {
  return VALID_RECOVERY_POLICIES.includes(policy as (typeof VALID_RECOVERY_POLICIES)[number])
}

// ============================================================================
// Convenience Exports
// ============================================================================

export { ALL_ARIA_ENV_MAPPINGS, VALID_AGENCIES, VALID_RECOVERY_POLICIES }

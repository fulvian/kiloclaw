import { Log } from "@/util/log"
import { fn } from "@/util/fn"
import { mergeDeep } from "remeda"
import z from "zod"

// Config interface
export interface ConfigInfo {
  logLevel: "DEBUG" | "INFO" | "WARN" | "ERROR"
  debug: boolean
  policyEnforcementMode: "strict" | "compat"
  agencies: AgencyConfig[]
  plugins: string[]
  telemetry: TelemetryConfig
}

export interface AgencyConfig {
  id: string
  domain: string
  enabled: boolean
  config: Record<string, unknown>
}

export interface TelemetryConfig {
  enabled: boolean
  endpoint: string
  projectId: string
}

export interface ConfigLoader {
  config: ConfigInfo
  getAgencyConfig(agencyId: string): Partial<ConfigInfo>
  reload(): void
}

// Schema for config validation
const ConfigInfoSchema = z.object({
  logLevel: z.enum(["DEBUG", "INFO", "WARN", "ERROR"]).default("INFO"),
  debug: z.boolean().default(false),
  policyEnforcementMode: z.enum(["strict", "compat"]).default("strict"),
  agencies: z
    .array(
      z.object({
        id: z.string(),
        domain: z.string(),
        enabled: z.boolean().default(true),
        config: z.record(z.string(), z.unknown()).default({}),
      }),
    )
    .default([]),
  plugins: z.array(z.string()).default([]),
  telemetry: z
    .object({
      enabled: z.boolean().default(true),
      endpoint: z.string().default("https://telemetry.kiloclaw.io"),
      projectId: z.string().default("kiloclaw-dev"),
    })
    .default({ enabled: true, endpoint: "https://telemetry.kiloclaw.io", projectId: "kiloclaw-dev" }),
})

// ONLY accept KILOCLAW_* prefix - block legacy prefixes
const ACCEPTED_PREFIX = "KILOCLAW_"

// Legacy prefixes to block (enforce isolation from KiloCode)
const BLOCKED_PREFIXES = ["KILO_", "OPENCODE_", "ARIA_"] as const

// Filter environment variables by prefix
function filterByPrefix(prefix: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith(prefix) && value !== undefined) {
      result[key] = value
    }
  }
  return result
}

// Check if a key uses a blocked prefix
function isBlocked(key: string): boolean {
  return BLOCKED_PREFIXES.some((prefix) => key.startsWith(prefix))
}

// Convert KILOCLAW_* env vars to config object
function envToConfig(): Partial<ConfigInfo> {
  const log = Log.create({ service: "kiloclaw.config" })
  const envVars = filterByPrefix(ACCEPTED_PREFIX)
  const result: Partial<ConfigInfo> = {}

  for (const [key, value] of Object.entries(envVars)) {
    // Strip prefix
    const stripped = key.substring(ACCEPTED_PREFIX.length)

    switch (stripped) {
      case "LOG_LEVEL":
        result.logLevel = value as ConfigInfo["logLevel"]
        break
      case "DEBUG":
        result.debug = value === "true"
        break
      case "POLICY_ENFORCEMENT_MODE":
        result.policyEnforcementMode = value === "compat" ? "compat" : "strict"
        break
      case "TELEMETRY_ENABLED":
        if (!result.telemetry) result.telemetry = { enabled: true, endpoint: "", projectId: "" }
        result.telemetry!.enabled = value === "true"
        break
      case "TELEMETRY_ENDPOINT":
        if (!result.telemetry) result.telemetry = { enabled: true, endpoint: "", projectId: "" }
        result.telemetry!.endpoint = value
        break
      case "TELEMETRY_PROJECT_ID":
        if (!result.telemetry) result.telemetry = { enabled: true, endpoint: "", projectId: "" }
        result.telemetry!.projectId = value
        break
      default:
        log.debug("unknown env config key", { key })
    }
  }

  return result
}

// Default configuration
const DEFAULT_CONFIG: ConfigInfo = {
  logLevel: "INFO",
  debug: false,
  policyEnforcementMode: "strict",
  agencies: [],
  plugins: [],
  telemetry: {
    enabled: true,
    endpoint: "https://telemetry.kiloclaw.io",
    projectId: "kiloclaw-dev",
  },
}

// Config namespace with factory
export const Config = {
  create: fn(
    z.object({
      global: ConfigInfoSchema.partial().optional(),
      agency: z.record(z.string(), ConfigInfoSchema.partial()).optional(),
    }),
    (input) => {
      const log = Log.create({ service: "kiloclaw.config" })

      // Validate no blocked prefixes are used
      for (const key of Object.keys(process.env)) {
        if (isBlocked(key)) {
          log.warn("blocked legacy env prefix detected and ignored", { key })
        }
      }

      let config: ConfigInfo = { ...DEFAULT_CONFIG }

      // Apply global config (lowest priority)
      if (input.global) {
        const merged = mergeDeep(config, input.global)
        config = ConfigInfoSchema.parse(merged)
      }

      // Apply agency configs (stored for retrieval by agency ID)
      const agencyConfigs = input.agency ?? {}

      // Apply env config (highest priority)
      const envConfig = envToConfig()
      const finalMerged = mergeDeep(config, envConfig)
      config = ConfigInfoSchema.parse(finalMerged)

      return {
        config,
        getAgencyConfig(agencyId: string): Partial<ConfigInfo> {
          return agencyConfigs[agencyId] ?? {}
        },
        reload() {
          log.info("config reload requested")
        },
      } satisfies ConfigLoader
    },
  ),
}

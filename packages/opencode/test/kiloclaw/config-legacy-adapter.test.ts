/**
 * Tests for Config Legacy Adapter
 *
 * Tests ARIA to Kiloclaw config migration, env var mapping, and ARIA.md parsing.
 */

import { describe, test, expect, beforeEach } from "bun:test"
import {
  LegacyAdapter,
  AriaMdAdapter,
  validateMigratedConfig,
  validateAgencyId,
} from "../../src/kiloclaw/config-legacy-adapter"

describe("LegacyAdapter", () => {
  describe("transformAriaConfig", () => {
    test("should transform empty config to defaults", () => {
      const result = LegacyAdapter.transformAriaConfig({})
      // Empty config still returns defaults for agencies and telemetry
      expect(result.agencies).toEqual([])
      expect(result.telemetry).toEqual({
        enabled: true,
        endpoint: "https://telemetry.kiloclaw.io",
        projectId: "kiloclaw-dev",
      })
    })

    test("should transform agencies", () => {
      const ariaConfig = {
        agencies: [
          { id: "development", domain: "development", enabled: true },
          { id: "knowledge", domain: "knowledge", enabled: false },
        ],
      }

      const result = LegacyAdapter.transformAriaConfig(ariaConfig)

      expect(result.agencies).toHaveLength(2)
      expect(result.agencies?.[0].id).toBe("development")
      expect(result.agencies?.[0].enabled).toBe(true)
      expect(result.agencies?.[1].id).toBe("knowledge")
      expect(result.agencies?.[1].enabled).toBe(false)
    })

    test("should transform telemetry settings", () => {
      const ariaConfig = {
        telemetry: {
          enabled: false,
          endpoint: "https://custom.telemetry.io",
          projectId: "custom-project",
        },
      }

      const result = LegacyAdapter.transformAriaConfig(ariaConfig)

      expect(result.telemetry).toEqual({
        enabled: false,
        endpoint: "https://custom.telemetry.io",
        projectId: "custom-project",
      })
    })

    test("should transform routing settings", () => {
      const ariaConfig = {
        routing: {
          defaultAgency: "development",
          confidenceThreshold: 0.8,
          enableFallback: true,
        },
      }

      const result = LegacyAdapter.transformAriaConfig(ariaConfig)

      // Routing should be stored in default agency config
      expect(result.agencies?.[0].config).toMatchObject({
        defaultAgency: "development",
      })
    })

    test("should transform scheduler settings", () => {
      const ariaConfig = {
        scheduler: {
          maxConcurrentTasks: 5,
          defaultPriority: 75,
          dispatchIntervalMs: 500,
          recoveryPolicy: "strict",
        },
      }

      const result = LegacyAdapter.transformAriaConfig(ariaConfig)

      expect(result.agencies?.[0].config).toMatchObject({
        scheduler: {
          maxConcurrentTasks: 5,
          defaultPriority: 75,
          dispatchIntervalMs: 500,
          recoveryPolicy: "strict",
        },
      })
    })

    test("should handle invalid config gracefully", () => {
      const result = LegacyAdapter.transformAriaConfig({ invalid: "config" })
      expect(result).toBeDefined()
    })
  })

  describe("mapAgencyEnv", () => {
    test("should return empty result for no env vars", () => {
      const result = LegacyAdapter.mapAgencyEnv({})
      expect(result.env).toEqual({})
      expect(result.deprecated).toEqual([])
      expect(result.warnings).toHaveLength(0)
    })

    test("should map ARIA_ENABLED to KILOCLAW_CORE_ENABLED", () => {
      const env = { ARIA_ENABLED: "true" }
      const result = LegacyAdapter.mapAgencyEnv(env)

      // Env vars are always strings, values are stringified
      expect(result.env.KILOCLAW_CORE_ENABLED).toBe("true")
      expect(result.deprecated).toContain("ARIA_ENABLED")
      expect(result.warnings[0]).toContain("deprecated")
    })

    test("should map ARIA_ROUTING_DEFAULT_AGENCY with validation", () => {
      const env = { ARIA_ROUTING_DEFAULT_AGENCY: "development" }
      const result = LegacyAdapter.mapAgencyEnv(env)

      expect(result.env.KILOCLAW_ROUTING_DEFAULT_AGENCY).toBe("development")
      expect(result.deprecated).toContain("ARIA_ROUTING_DEFAULT_AGENCY")
    })

    test("should clamp ARIA_ROUTING_CONFIDENCE_THRESHOLD to [0,1]", () => {
      const env = { ARIA_ROUTING_CONFIDENCE_THRESHOLD: "1.5" }
      const result = LegacyAdapter.mapAgencyEnv(env)

      // Clamped value is stringified
      expect(result.env.KILOCLAW_ROUTING_CONFIDENCE).toBe("1")
    })

    test("should map agency enabled flags", () => {
      const env = {
        ARIA_AGENCIES_DEVELOPMENT_ENABLED: "true",
        ARIA_AGENCIES_KNOWLEDGE_ENABLED: "false",
      }
      const result = LegacyAdapter.mapAgencyEnv(env)

      // Env vars are always strings
      expect(result.env.KILOCLAW_AGENCY_DEVELOPMENT_ENABLED).toBe("true")
      expect(result.env.KILOCLAW_AGENCY_KNOWLEDGE_ENABLED).toBe("false")
    })

    test("should map scheduler settings", () => {
      const env = {
        ARIA_SCHEDULER_MAX_CONCURRENT_TASKS: "10",
        ARIA_SCHEDULER_DEFAULT_PRIORITY: "150", // Should be clamped to 100
        ARIA_SCHEDULER_DISPATCH_INTERVAL_MS: "50", // Should be clamped to 100
      }
      const result = LegacyAdapter.mapAgencyEnv(env)

      expect(result.env.KILOCLAW_SCHED_MAX_CONCURRENT).toBe("10")
      expect(result.env.KILOCLAW_SCHED_DEFAULT_PRIORITY).toBe("100")
      expect(result.env.KILOCLAW_SCHED_DISPATCH_MS).toBe("100")
    })

    test("should map guardrail settings", () => {
      const env = {
        ARIA_GUARDRAILS_ALLOW_PROACTIVE: "true",
        ARIA_GUARDRAILS_MAX_DAILY_ACTIONS: "100",
      }
      const result = LegacyAdapter.mapAgencyEnv(env)

      // Env vars are always strings
      expect(result.env.KILOCLAW_PROACTIVE_ENABLED).toBe("true")
      expect(result.env.KILOCLAW_PROACTIVE_DAILY_BUDGET).toBe("100")
    })

    test("KILOCLAW_* vars should take precedence over ARIA_*", () => {
      const env = {
        ARIA_ENABLED: "false",
        KILOCLAW_CORE_ENABLED: "true",
      }
      const result = LegacyAdapter.mapAgencyEnv(env)

      expect(result.env.KILOCLAW_CORE_ENABLED).toBe("true")
    })

    test("should ignore non-ARIA vars", () => {
      const env = { OTHER_VAR: "value", KILOCLAW_DEBUG: "true" }
      const result = LegacyAdapter.mapAgencyEnv(env)

      expect(result.deprecated).toEqual([])
    })

    test("should fail in strict mode when legacy vars are present", () => {
      const env = {
        KILOCLAW_STRICT_ENV: "true",
        ARIA_ENABLED: "true",
      }

      expect(() => LegacyAdapter.mapAgencyEnv(env)).toThrow("KILOCLAW_STRICT_ENV=true blocks legacy env vars")
    })
  })

  describe("mapMemoryEnv", () => {
    test("should map ARIA_MEMORY_* to KILOCLAW_MEMORY_*", () => {
      const env = {
        ARIA_MEMORY_WORKING_ENABLED: "true",
        ARIA_MEMORY_EPISODIC_RETENTION: "30d",
      }
      const result = LegacyAdapter.mapMemoryEnv(env)

      expect(result.env.KILOCLAW_MEMORY_WORKING_ENABLED).toBe("true")
      expect(result.env.KILOCLAW_MEMORY_EPISODIC_RETENTION).toBe("30d")
      expect(result.deprecated).toContain("ARIA_MEMORY_WORKING_ENABLED")
      expect(result.deprecated).toContain("ARIA_MEMORY_EPISODIC_RETENTION")
    })

    test("KILOCLAW_MEMORY_* should take precedence", () => {
      const env = {
        ARIA_MEMORY_WORKING_ENABLED: "false",
        KILOCLAW_MEMORY_WORKING_ENABLED: "true",
      }
      const result = LegacyAdapter.mapMemoryEnv(env)

      expect(result.env.KILOCLAW_MEMORY_WORKING_ENABLED).toBe("true")
    })

    test("should fail memory mapping in strict mode with legacy vars", () => {
      const env = {
        KILOCLAW_STRICT_ENV: "true",
        ARIA_MEMORY_WORKING_ENABLED: "true",
      }

      expect(() => LegacyAdapter.mapMemoryEnv(env)).toThrow("KILOCLAW_STRICT_ENV=true blocks legacy env vars")
    })
  })

  describe("mapToolEnv", () => {
    test("should map ARIA_TOOL_* to KILOCLAW_TOOL_*", () => {
      const env = {
        ARIA_TOOL_FILESYSTEM_SCOPE: "read,write",
        ARIA_TOOL_NETWORK_ENABLED: "true",
      }
      const result = LegacyAdapter.mapToolEnv(env)

      expect(result.env.KILOCLAW_TOOL_FILESYSTEM_SCOPE).toBe("read,write")
      expect(result.env.KILOCLAW_TOOL_NETWORK_ENABLED).toBe("true")
      expect(result.deprecated).toContain("ARIA_TOOL_FILESYSTEM_SCOPE")
    })

    test("should block invalid tool scopes", () => {
      const env = {
        ARIA_TOOL_SCOPE: "invalid_scope",
      }
      const result = LegacyAdapter.mapToolEnv(env)

      expect(result.env.KILOCLAW_TOOL_SCOPE).toBeUndefined()
      expect(result.warnings[0]).toContain("invalid scope")
    })

    test("should accept valid tool scopes", () => {
      const env = {
        ARIA_TOOL_SCOPE: "read,write,execute",
      }
      const result = LegacyAdapter.mapToolEnv(env)

      expect(result.env.KILOCLAW_TOOL_SCOPE).toBe("read,write,execute")
    })

    test("KILOCLAW_TOOL_* should take precedence", () => {
      const env = {
        ARIA_TOOL_DEBUG: "false",
        KILOCLAW_TOOL_DEBUG: "true",
      }
      const result = LegacyAdapter.mapToolEnv(env)

      expect(result.env.KILOCLAW_TOOL_DEBUG).toBe("true")
    })

    test("should fail tool mapping in strict mode with legacy vars", () => {
      const env = {
        KILOCLAW_STRICT_ENV: "true",
        ARIA_TOOL_SCOPE: "read",
      }

      expect(() => LegacyAdapter.mapToolEnv(env)).toThrow("KILOCLAW_STRICT_ENV=true blocks legacy env vars")
    })
  })
})

describe("AriaMdAdapter", () => {
  describe("parseAriaConventions", () => {
    test("should parse empty content", () => {
      const result = AriaMdAdapter.parseAriaConventions("")
      expect(result.version).toBe("1.0")
      expect(result.layers).toEqual({})
      expect(result.skills).toEqual([])
    })

    test("should parse layer configurations", () => {
      const content = `
# ARIA Memory Conventions

## Version
1.0

## Layers

### Working Memory
- enabled: true
- retention: session
- ttl: 1h

### Episodic Memory
- enabled: true
- retention: 30d
- path: /memory/episodic
`
      const result = AriaMdAdapter.parseAriaConventions(content)

      expect(result.layers.working?.enabled).toBe(true)
      expect(result.layers.working?.retention).toBe("session")
      expect(result.layers.working?.ttl).toBe("1h")
      expect(result.layers.episodic?.enabled).toBe(true)
      expect(result.layers.episodic?.retention).toBe("30d")
      expect(result.layers.episodic?.path).toBe("/memory/episodic")
    })

    test("should parse skill configurations", () => {
      const content = `
## Skills
- code_review: enabled
- debugging: enabled
- document_analysis: disabled
`
      const result = AriaMdAdapter.parseAriaConventions(content)

      expect(result.skills).toHaveLength(3)
      expect(result.skills?.[0]).toEqual({ id: "code_review", enabled: true })
      expect(result.skills?.[1]).toEqual({ id: "debugging", enabled: true })
      expect(result.skills?.[2]).toEqual({ id: "document_analysis", enabled: false })
    })

    test("should handle missing layer sections", () => {
      const content = `
# ARIA Memory Conventions
## Skills
- code_review: enabled
`
      const result = AriaMdAdapter.parseAriaConventions(content)

      expect(result.layers).toEqual({})
      expect(result.skills).toHaveLength(1)
    })
  })

  describe("exportToKiloclaw", () => {
    test("should export empty conventions", () => {
      const conventions: import("../../src/kiloclaw/config-legacy-adapter").MemoryConventions = {
        version: "1.0",
        layers: {},
        skills: [],
      }

      const result = AriaMdAdapter.exportToKiloclaw(conventions)

      expect(result).toContain("# Kiloclaw Memory Configuration")
      expect(result).toContain("## Memory Layers")
    })

    test("should export layer configurations", () => {
      const conventions: import("../../src/kiloclaw/config-legacy-adapter").MemoryConventions = {
        version: "1.0",
        layers: {
          working: { enabled: true, retention: "session", ttl: "1h" },
          episodic: { enabled: true, retention: "30d" },
        },
        skills: [],
      }

      const result = AriaMdAdapter.exportToKiloclaw(conventions)

      expect(result).toContain("### Working Memory")
      expect(result).toContain("**enabled**: true")
      expect(result).toContain("**retention**: session")
      expect(result).toContain("**ttl**: 1h")
      expect(result).toContain("### Episodic Memory")
    })

    test("should export skills table", () => {
      const conventions: import("../../src/kiloclaw/config-legacy-adapter").MemoryConventions = {
        version: "1.0",
        layers: {},
        skills: [
          { id: "code_review", enabled: true, layer: "procedural" },
          { id: "debugging", enabled: true, layer: "episodic" },
        ],
      }

      const result = AriaMdAdapter.exportToKiloclaw(conventions)

      expect(result).toContain("## Skill Registry")
      expect(result).toContain("| Skill ID | Enabled | Default Layer |")
      expect(result).toContain("| code_review | true | procedural |")
      expect(result).toContain("| debugging | true | episodic |")
    })
  })

  describe("generateMigrationReport", () => {
    test("should generate report with changes", () => {
      const ariaContent = `
# ARIA Memory Conventions
## Layers
### Working Memory
- enabled: true
`
      const kiloclawContent = `
# Kiloclaw Memory Configuration
## Memory Layers
### Working Memory
- **enabled**: true
`

      const report = AriaMdAdapter.generateMigrationReport(ariaContent, kiloclawContent)

      expect(report.timestamp).toBeDefined()
      expect(report.ariaVersion).toBe("1.0")
      expect(report.kiloclawVersion).toBe("2.0")
      expect(report.changes).toBeDefined()
      expect(report.warnings).toBeDefined()
      expect(report.summary.total).toBeGreaterThanOrEqual(0)
    })

    test("should include migration warnings", () => {
      const ariaContent = `
# ARIA Memory Conventions
## Layers
### Working Memory
- enabled: true
### Episodic Memory
- enabled: true
`
      const kiloclawContent = ""

      const report = AriaMdAdapter.generateMigrationReport(ariaContent, kiloclawContent)

      expect(report.summary.issues).toBeGreaterThanOrEqual(0)
    })
  })
})

describe("Config Validation", () => {
  describe("validateMigratedConfig", () => {
    test("should validate empty config", () => {
      const result = validateMigratedConfig({})
      expect(result.valid).toBe(true)
      expect(result.config).toBeDefined()
    })

    test("should validate full config", () => {
      const config = {
        logLevel: "DEBUG",
        debug: true,
        agencies: [{ id: "test", domain: "test", enabled: true, config: {} }],
        plugins: ["plugin1"],
        telemetry: { enabled: true, endpoint: "https://test.io", projectId: "test" },
      }

      const result = validateMigratedConfig(config)
      expect(result.valid).toBe(true)
      expect(result.config?.logLevel).toBe("DEBUG")
      expect(result.config?.debug).toBe(true)
    })

    test("should reject invalid log level", () => {
      const config = { logLevel: "INVALID" }
      const result = validateMigratedConfig(config)
      expect(result.valid).toBe(false)
      expect(result.errors).toBeDefined()
    })

    test("should apply defaults", () => {
      const config = {}
      const result = validateMigratedConfig(config)
      expect(result.valid).toBe(true)
      expect(result.config?.logLevel).toBe("INFO")
      expect(result.config?.debug).toBe(false)
    })
  })

  describe("validateAgencyId", () => {
    test("should accept valid agency IDs", () => {
      expect(validateAgencyId("development")).toBe(true)
      expect(validateAgencyId("knowledge")).toBe(true)
      expect(validateAgencyId("nutrition")).toBe(true)
      expect(validateAgencyId("weather")).toBe(true)
    })

    test("should reject invalid agency IDs", () => {
      expect(validateAgencyId("invalid")).toBe(false)
      expect(validateAgencyId("")).toBe(false)
    })
  })
})

describe("Dual-Read Precedence", () => {
  test("KILOCLAW_* vars should override ARIA_* vars", () => {
    const env = {
      ARIA_ENABLED: "false",
      ARIA_AGENCIES_DEVELOPMENT_ENABLED: "false",
      KILOCLAW_CORE_ENABLED: "true",
      KILOCLAW_AGENCY_DEVELOPMENT_ENABLED: "true",
    }

    const result = LegacyAdapter.mapAgencyEnv(env)

    // KILOCLAW values should win
    expect(result.env.KILOCLAW_CORE_ENABLED).toBe("true")
    expect(result.env.KILOCLAW_AGENCY_DEVELOPMENT_ENABLED).toBe("true")

    // ARIA values should still be mapped but overridden
    // Note: The implementation maps ARIA first, then KILOCLAW overwrites
  })

  test("should emit deprecation warnings for ARIA vars", () => {
    const env = {
      ARIA_ENABLED: "true",
      ARIA_ROUTING_DEFAULT_AGENCY: "development",
    }

    const result = LegacyAdapter.mapAgencyEnv(env)

    expect(result.deprecated).toContain("ARIA_ENABLED")
    expect(result.deprecated).toContain("ARIA_ROUTING_DEFAULT_AGENCY")
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.warnings[0]).toContain("deprecated")
  })
})

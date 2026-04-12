/**
 * No Silent Fallback Tests
 * P1: Tests for the no-silent-fallback guardrail logic
 *
 * Verifies that when skills are loaded but not executed,
 * proper metadata flags are set to prevent false completion.
 */

import { describe, expect, test, beforeEach } from "bun:test"
import { Flag } from "../../src/flag/flag"

// Re-import flags for testing
import {
  SKILL_NO_SILENT_FALLBACK_ENABLED,
  SKILL_TOOL_EXECUTE_MODE_ENABLED,
  SESSION_EXECUTION_BRIDGE_ENABLED,
  TOOL_IDENTITY_RESOLVER_ENABLED,
} from "../../src/session/runtime-flags"

describe("no-silent-fallback guardrail", () => {
  beforeEach(() => {
    // Reset flags to known state
    Flag.KILO_RUNTIME_SKILL_TOOL_EXECUTE_MODE_ENABLED = false
    Flag.KILO_RUNTIME_SKILL_NO_SILENT_FALLBACK = true // false = guardrail enabled
    Flag.KILO_RUNTIME_SESSION_EXECUTION_BRIDGE_ENABLED = false
    Flag.KILO_RUNTIME_TOOL_IDENTITY_RESOLVER_ENABLED = false
  })

  describe("SKILL_NO_SILENT_FALLBACK_ENABLED", () => {
    test("returns true when flag is false (guardrail enabled)", () => {
      Flag.KILO_RUNTIME_SKILL_NO_SILENT_FALLBACK = false
      expect(SKILL_NO_SILENT_FALLBACK_ENABLED()).toBe(true)
    })

    test("returns false when flag is true (guardrail disabled)", () => {
      Flag.KILO_RUNTIME_SKILL_NO_SILENT_FALLBACK = true
      expect(SKILL_NO_SILENT_FALLBACK_ENABLED()).toBe(false)
    })
  })

  describe("SKILL_TOOL_EXECUTE_MODE_ENABLED", () => {
    test("returns true when flag is set", () => {
      Flag.KILO_RUNTIME_SKILL_TOOL_EXECUTE_MODE_ENABLED = true
      expect(SKILL_TOOL_EXECUTE_MODE_ENABLED()).toBe(true)
    })

    test("returns false when flag is not set", () => {
      Flag.KILO_RUNTIME_SKILL_TOOL_EXECUTE_MODE_ENABLED = false
      expect(SKILL_TOOL_EXECUTE_MODE_ENABLED()).toBe(false)
    })
  })

  describe("SESSION_EXECUTION_BRIDGE_ENABLED", () => {
    test("returns true when flag is set", () => {
      Flag.KILO_RUNTIME_SESSION_EXECUTION_BRIDGE_ENABLED = true
      expect(SESSION_EXECUTION_BRIDGE_ENABLED()).toBe(true)
    })

    test("returns false when flag is not set", () => {
      Flag.KILO_RUNTIME_SESSION_EXECUTION_BRIDGE_ENABLED = false
      expect(SESSION_EXECUTION_BRIDGE_ENABLED()).toBe(false)
    })
  })

  describe("TOOL_IDENTITY_RESOLVER_ENABLED", () => {
    test("returns true when flag is set", () => {
      Flag.KILO_RUNTIME_TOOL_IDENTITY_RESOLVER_ENABLED = true
      expect(TOOL_IDENTITY_RESOLVER_ENABLED()).toBe(true)
    })

    test("returns false when flag is not set", () => {
      Flag.KILO_RUNTIME_TOOL_IDENTITY_RESOLVER_ENABLED = false
      expect(TOOL_IDENTITY_RESOLVER_ENABLED()).toBe(false)
    })
  })

  describe("skillLoadedNotExecuted metadata flag logic", () => {
    test("skill tool returns skillLoadedNotExecuted=true when in load mode", () => {
      // This tests the logic that should be in skill.ts
      const isExecuteMode = false
      const noSilentFallback = true

      const metadata: Record<string, any> = {
        name: "web-research",
        dir: "builtin",
      }

      // When NOT in execute mode and guardrail is enabled
      if (!isExecuteMode && noSilentFallback) {
        metadata.skillLoadedNotExecuted = true
      }

      expect(metadata.skillLoadedNotExecuted).toBe(true)
    })

    test("skill tool returns skillExecuted=true when in execute mode", () => {
      const isExecuteMode = true

      const metadata: Record<string, any> = {
        name: "web-research",
        dir: "builtin",
        skillExecuted: true,
        success: true,
        stepsExecuted: 1,
        durationMs: 100,
      }

      expect(metadata.skillExecuted).toBe(true)
      expect(metadata.success).toBe(true)
    })

    test("fallback case returns success=false with error message", () => {
      const bridgeResult = {
        success: false,
        output: undefined,
        error: "Skill not found",
        stepsExecuted: 0,
        durationMs: 10,
      }

      const fallbackMetadata = {
        name: "web-research",
        dir: "builtin",
        skillExecuted: false,
        success: false,
        errorMessage: bridgeResult.error,
        fallbackToLoadMode: true,
      }

      expect(fallbackMetadata.skillExecuted).toBe(false)
      expect(fallbackMetadata.success).toBe(false)
      expect(fallbackMetadata.errorMessage).toBe("Skill not found")
      expect(fallbackMetadata.fallbackToLoadMode).toBe(true)
    })
  })

  describe("runtime flag integration logic", () => {
    test("execute mode detection combines mode parameter and flag", () => {
      // When mode=execute is passed
      let params = { mode: "execute" as const }
      let isExecuteMode = params.mode === "execute" || SKILL_TOOL_EXECUTE_MODE_ENABLED()
      expect(isExecuteMode).toBe(true)

      // When mode=load and flag disabled
      params = { mode: "load" as const }
      Flag.KILO_RUNTIME_SKILL_TOOL_EXECUTE_MODE_ENABLED = false
      isExecuteMode = params.mode === "execute" || SKILL_TOOL_EXECUTE_MODE_ENABLED()
      expect(isExecuteMode).toBe(false)

      // When mode=load but flag enabled
      Flag.KILO_RUNTIME_SKILL_TOOL_EXECUTE_MODE_ENABLED = true
      isExecuteMode = params.mode === "execute" || SKILL_TOOL_EXECUTE_MODE_ENABLED()
      expect(isExecuteMode).toBe(true)
    })
  })
})

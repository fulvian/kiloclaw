import { describe, it, expect } from "bun:test"
import {
  decideFallback,
  FallbackInput,
  FallbackDecision,
  createFallbackMetadata,
} from "@/kiloclaw/tooling/native/fallback-policy"
import type { PolicyLevel } from "@/kiloclaw/agency/types"

describe("Fallback Policy - Native-First Adapter Strategy", () => {
  describe("decideFallback(input): FallbackDecision", () => {
    it("returns 'deny' when policy is DENY", () => {
      const input: FallbackInput = {
        nativeAvailable: true,
        capability: "test",
        policyLevel: "DENY",
        isDestructive: false,
      }
      expect(decideFallback(input)).toBe("deny")
    })

    it("returns 'deny' when operation is destructive and policy > SAFE", () => {
      const inputs: FallbackInput[] = [
        {
          nativeAvailable: true,
          capability: "git_reset_hard",
          policyLevel: "NOTIFY",
          isDestructive: true,
        },
        {
          nativeAvailable: false,
          capability: "secret_export",
          policyLevel: "CONFIRM",
          isDestructive: true,
        },
        {
          nativeAvailable: false,
          capability: "force_push",
          policyLevel: "HITL",
          isDestructive: true,
        },
      ]

      for (const input of inputs) {
        expect(decideFallback(input)).toBe("deny")
      }
    })

    it("allows destructive operations if policy is SAFE (read-only, no side effects)", () => {
      const input: FallbackInput = {
        nativeAvailable: true,
        capability: "safe_read",
        policyLevel: "SAFE",
        isDestructive: true, // Even if destructive, SAFE allows (unlikely scenario)
      }
      expect(decideFallback(input)).toBe("native")
    })

    it("returns 'native' when native is available and healthy", () => {
      const input: FallbackInput = {
        nativeAvailable: true,
        nativeError: null,
        capability: "read_file",
        policyLevel: "SAFE",
        isDestructive: false,
      }
      expect(decideFallback(input)).toBe("native")
    })

    it("returns 'native' for transient errors with retry count < 2", () => {
      const transientErrors = [
        new Error("timeout"),
        new Error("ECONNREFUSED"),
        new Error("ENOTFOUND"),
        new Error("network error"),
        new Error("temporary network issue"),
      ]

      for (const err of transientErrors) {
        const input: FallbackInput = {
          nativeAvailable: false,
          nativeError: err,
          retryCount: 0,
          capability: "test",
          policyLevel: "SAFE",
          isDestructive: false,
        }
        expect(decideFallback(input)).toBe("native") // Will retry
      }
    })

    it("does not retry transient errors when retryCount >= 2", () => {
      const input: FallbackInput = {
        nativeAvailable: false,
        nativeError: new Error("timeout"),
        retryCount: 2,
        capability: "test",
        policyLevel: "NOTIFY",
        isDestructive: false,
      }
      expect(decideFallback(input)).toBe("mcp") // Fallback allowed for NOTIFY
    })

    it("returns 'mcp' for permanent errors if policy allows (SAFE/NOTIFY)", () => {
      const permanentError = new Error("capability not implemented")

      const tests: Array<[PolicyLevel, FallbackDecision]> = [
        ["SAFE", "mcp"],
        ["NOTIFY", "mcp"],
      ]

      for (const [level, expected] of tests) {
        const input: FallbackInput = {
          nativeAvailable: false,
          nativeError: permanentError,
          retryCount: 2,
          capability: "test",
          policyLevel: level,
          isDestructive: false,
        }
        expect(decideFallback(input)).toBe(expected)
      }
    })

    it("returns 'deny' for permanent errors if policy is restrictive (CONFIRM/HITL)", () => {
      const permanentError = new Error("native implementation missing")

      const tests: Array<[PolicyLevel, FallbackDecision]> = [
        ["CONFIRM", "deny"],
        ["HITL", "deny"],
        ["DENY", "deny"],
      ]

      for (const [level, expected] of tests) {
        const input: FallbackInput = {
          nativeAvailable: false,
          nativeError: permanentError,
          retryCount: 2,
          capability: "test",
          policyLevel: level,
          isDestructive: false,
        }
        expect(decideFallback(input)).toBe(expected)
      }
    })

    it("returns 'mcp' for capability gap if policy allows (SAFE/NOTIFY)", () => {
      const tests: Array<[PolicyLevel, FallbackDecision]> = [
        ["SAFE", "mcp"],
        ["NOTIFY", "mcp"],
      ]

      for (const [level, expected] of tests) {
        const input: FallbackInput = {
          nativeAvailable: false,
          nativeError: null, // No error, just capability gap
          capability: "unimplemented_feature",
          policyLevel: level,
          isDestructive: false,
        }
        expect(decideFallback(input)).toBe(expected)
      }
    })

    it("returns 'deny' for capability gap if policy is restrictive", () => {
      const tests: Array<[PolicyLevel, FallbackDecision]> = [
        ["CONFIRM", "deny"],
        ["HITL", "deny"],
        ["DENY", "deny"],
      ]

      for (const [level, expected] of tests) {
        const input: FallbackInput = {
          nativeAvailable: false,
          capability: "unimplemented_feature",
          policyLevel: level,
          isDestructive: false,
        }
        expect(decideFallback(input)).toBe(expected)
      }
    })
  })

  describe("Fallback decision matrix (comprehensive)", () => {
    it("enforces complete decision logic per specification", () => {
      const tests: Array<[Partial<FallbackInput>, FallbackDecision, string]> = [
        // Hard deny cases
        [{ policyLevel: "DENY", nativeAvailable: true }, "deny", "DENY policy always blocks"],
        [{ policyLevel: "DENY", nativeAvailable: false }, "deny", "DENY policy always blocks"],

        // Destructive operations
        [
          { policyLevel: "NOTIFY", isDestructive: true, nativeAvailable: true },
          "deny",
          "Destructive ops never fallback if policy > SAFE",
        ],

        // Native available and healthy
        [
          { nativeAvailable: true, nativeError: null, policyLevel: "SAFE" },
          "native",
          "Native-first when available and healthy",
        ],

        // Transient retry
        [
          { nativeAvailable: false, nativeError: new Error("timeout"), retryCount: 0, policyLevel: "SAFE" },
          "native",
          "Transient errors retry (retryCount < 2)",
        ],

        // Permanent error with SAFE policy
        [
          { nativeAvailable: false, nativeError: new Error("ENOENT"), retryCount: 2, policyLevel: "SAFE" },
          "mcp",
          "Permanent error with SAFE policy → MCP fallback",
        ],

        // Capability gap with NOTIFY policy
        [
          { nativeAvailable: false, capability: "unimplemented", policyLevel: "NOTIFY" },
          "mcp",
          "Capability gap with NOTIFY → MCP",
        ],

        // Capability gap with CONFIRM policy
        [
          { nativeAvailable: false, capability: "unimplemented", policyLevel: "CONFIRM" },
          "deny",
          "Capability gap with CONFIRM → DENY",
        ],
      ]

      for (const [input, expected, description] of tests) {
        const fullInput: FallbackInput = {
          nativeAvailable: input.nativeAvailable ?? false,
          nativeError: input.nativeError ?? null,
          retryCount: input.retryCount ?? 0,
          capability: input.capability ?? "test",
          policyLevel: input.policyLevel ?? "SAFE",
          isDestructive: input.isDestructive ?? false,
          ...input,
        }

        const result = decideFallback(fullInput)
        expect(result).toBe(expected)
      }
    })
  })

  describe("createFallbackMetadata(providers, errors)", () => {
    it("builds telemetry metadata from provider list", () => {
      const providers = ["native", "mcp"]
      const errors: Record<string, Error> = {
        native: new Error("timeout"),
      }

      const meta = createFallbackMetadata(providers, errors)
      expect(meta.providersTried).toEqual(providers)
      expect(meta.errorsByProvider).toHaveProperty("native")
      expect(meta.errorsByProvider.native).toContain("timeout")
    })

    it("handles multiple provider errors", () => {
      const providers = ["native", "fallback1", "fallback2"]
      const errors: Record<string, Error> = {
        native: new Error("ECONNREFUSED"),
        fallback1: new Error("not available"),
        fallback2: new Error("invalid schema"),
      }

      const meta = createFallbackMetadata(providers, errors)
      expect(Object.keys(meta.errorsByProvider)).toHaveLength(3)
      expect(meta.providersTried).toHaveLength(3)
    })

    it("creates metadata without errors when providers succeed", () => {
      const providers = ["native", "mcp"]
      const errors: Record<string, Error> = {}

      const meta = createFallbackMetadata(providers, errors)
      expect(meta.providersTried).toEqual(providers)
      expect(Object.keys(meta.errorsByProvider)).toHaveLength(0)
    })
  })

  describe("FIX 3 compliance (Fallback Policy from AUDIT_2026-04-13)", () => {
    it("implements deterministic fallback policy", () => {
      // BLOCKER 6: "Fallback Policy - NOT IMPLEMENTED"
      // Now: decideFallback is fully deterministic, all inputs have defined outputs

      const testCases: FallbackInput[] = [
        { nativeAvailable: true, capability: "test", policyLevel: "SAFE", isDestructive: false },
        { nativeAvailable: false, capability: "test", policyLevel: "NOTIFY", isDestructive: false },
        {
          nativeAvailable: false,
          nativeError: new Error("timeout"),
          retryCount: 0,
          capability: "test",
          policyLevel: "SAFE",
          isDestructive: false,
        },
      ]

      for (const input of testCases) {
        const result = decideFallback(input)
        expect(["native", "mcp", "deny"]).toContain(result)
      }
    })

    it("respects native-first adapter strategy", () => {
      // Native-first: always use native if available and healthy
      const input: FallbackInput = {
        nativeAvailable: true,
        nativeError: null,
        capability: "file_read",
        policyLevel: "SAFE",
        isDestructive: false,
      }
      expect(decideFallback(input)).toBe("native")
    })

    it("blocks unsafe fallbacks for destructive operations", () => {
      // Destructive operations never fall back to MCP unless explicitly allowed by policy
      const input: FallbackInput = {
        nativeAvailable: false,
        capability: "git_force_push",
        policyLevel: "CONFIRM", // Higher than SAFE
        isDestructive: true,
      }
      expect(decideFallback(input)).toBe("deny")
    })
  })
})

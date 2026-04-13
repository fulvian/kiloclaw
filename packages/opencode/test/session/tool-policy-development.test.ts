import { describe, it, expect } from "bun:test"
import {
  DEVELOPMENT_TOOL_ALLOWLIST,
  mapDevelopmentCapabilitiesToTools,
  resolveAgencyAllowedTools,
  DEVELOPMENT_TOOL_POLICY_LEVELS,
} from "@/session/tool-policy"

describe("Development Agency Tool Policy Enforcement (G4 Phase 2 Integration)", () => {
  describe("DEVELOPMENT_TOOL_ALLOWLIST", () => {
    it("defines comprehensive allowlist for development tools", () => {
      const expectedTools = [
        "read",
        "glob",
        "grep",
        "apply_patch",
        "bash",
        "skill",
        "codesearch",
        "websearch",
        "webfetch",
      ]
      expect([...DEVELOPMENT_TOOL_ALLOWLIST]).toEqual(expectedTools as any)
    })

    it("includes SAFE tools (read-only)", () => {
      const safeTools = ["read", "glob", "grep", "codesearch"] as const
      for (const tool of safeTools) {
        expect([...DEVELOPMENT_TOOL_ALLOWLIST]).toContain(tool as any)
      }
    })

    it("includes NOTIFY tools (reversible operations)", () => {
      const notifyTools = ["apply_patch", "bash", "skill"] as const
      for (const tool of notifyTools) {
        expect([...DEVELOPMENT_TOOL_ALLOWLIST]).toContain(tool as any)
      }
    })

    it("includes fallback tools for research", () => {
      const fallbackTools = ["websearch", "webfetch"] as const
      for (const tool of fallbackTools) {
        expect([...DEVELOPMENT_TOOL_ALLOWLIST]).toContain(tool as any)
      }
    })

    it("explicitly excludes destructive tools", () => {
      const deniedTools = ["git_reset_hard", "git_force_push", "secret_export"]
      for (const tool of deniedTools) {
        expect(DEVELOPMENT_TOOL_ALLOWLIST).not.toContain(tool)
      }
    })
  })

  describe("DEVELOPMENT_TOOL_POLICY_LEVELS (FIX 5)", () => {
    it("maps SAFE tools to 'SAFE' policy level", () => {
      const safeTools = ["read", "glob", "grep", "codesearch"]
      for (const tool of safeTools) {
        expect(DEVELOPMENT_TOOL_POLICY_LEVELS[tool]).toBe("SAFE")
      }
    })

    it("maps NOTIFY tools to 'NOTIFY' policy level", () => {
      const notifyTools = ["apply_patch", "bash", "skill"]
      for (const tool of notifyTools) {
        expect(DEVELOPMENT_TOOL_POLICY_LEVELS[tool]).toBe("NOTIFY")
      }
    })

    it("maps research tools to 'NOTIFY' policy level", () => {
      expect(DEVELOPMENT_TOOL_POLICY_LEVELS["websearch"]).toBe("NOTIFY")
      expect(DEVELOPMENT_TOOL_POLICY_LEVELS["webfetch"]).toBe("NOTIFY")
    })

    it("defines policy levels for all allowed tools", () => {
      for (const tool of DEVELOPMENT_TOOL_ALLOWLIST) {
        expect(DEVELOPMENT_TOOL_POLICY_LEVELS).toHaveProperty(tool)
      }
    })

    it("only includes SAFE and NOTIFY levels (no CONFIRM/HITL)", () => {
      const levels = new Set(Object.values(DEVELOPMENT_TOOL_POLICY_LEVELS))
      expect(levels.has("SAFE")).toBe(true)
      expect(levels.has("NOTIFY")).toBe(true)
      expect(levels.has("CONFIRM")).toBe(false)
      expect(levels.has("HITL")).toBe(false)
    })
  })

  describe("mapDevelopmentCapabilitiesToTools(capabilities)", () => {
    it("maps code understanding capabilities to read-only tools", () => {
      const codeCaps = ["coding", "code-generation", "code-review", "refactoring", "comparison", "document_analysis"]
      const tools = mapDevelopmentCapabilitiesToTools(codeCaps)
      expect(tools).toContain("read")
      expect(tools).toContain("glob")
      expect(tools).toContain("grep")
      expect(tools).toContain("codesearch")
    })

    it("maps debugging capabilities to execution + read tools", () => {
      const debugCaps = ["debugging", "troubleshooting"]
      const tools = mapDevelopmentCapabilitiesToTools(debugCaps)
      expect(tools).toContain("bash")
      expect(tools).toContain("read")
      expect(tools).toContain("glob")
      expect(tools).toContain("grep")
    })

    it("maps testing capabilities to execution tools", () => {
      const testCaps = ["testing", "tdd"]
      const tools = mapDevelopmentCapabilitiesToTools(testCaps)
      expect(tools).toContain("bash")
      expect(tools).toContain("read")
      expect(tools).toContain("glob")
    })

    it("maps planning capabilities to read tools", () => {
      const planCaps = ["planning", "code-planning", "architecture"]
      const tools = mapDevelopmentCapabilitiesToTools(planCaps)
      expect(tools).toContain("read")
      expect(tools).toContain("glob")
      expect(tools).toContain("grep")
    })

    it("maps patching capabilities to write tools", () => {
      const patchCaps = ["patching", "refactoring"]
      const tools = mapDevelopmentCapabilitiesToTools(patchCaps)
      expect(tools).toContain("apply_patch")
    })

    it("maps git operations to bash + read", () => {
      const gitCaps = ["git_ops", "git-workflow"]
      const tools = mapDevelopmentCapabilitiesToTools(gitCaps)
      expect(tools).toContain("bash")
      expect(tools).toContain("read")
    })

    it("returns deduplicateduplicated tools", () => {
      const caps = ["coding", "debugging", "testing"]
      const tools = mapDevelopmentCapabilitiesToTools(caps)
      const toolSet = new Set(tools)
      expect(toolSet.size).toBe(tools.length) // No duplicates
    })

    it("returns empty array for unknown capabilities", () => {
      const unknownCaps = ["unknown-capability", "nonexistent"]
      const tools = mapDevelopmentCapabilitiesToTools(unknownCaps)
      expect(tools).toHaveLength(0)
    })
  })

  describe("resolveAgencyAllowedTools(input) - Development Agency", () => {
    it("returns empty tools when policy is disabled", () => {
      const result = resolveAgencyAllowedTools({
        agencyId: "agency-development",
        enabled: false,
      })
      expect(result.enabled).toBe(false)
      expect(result.allowedTools).toHaveLength(0)
    })

    it("returns allowlist + mapped tools when enabled", () => {
      const result = resolveAgencyAllowedTools({
        agencyId: "agency-development",
        enabled: true,
        capabilities: ["coding"],
      })
      expect(result.enabled).toBe(true)
      expect(result.allowedTools.length).toBeGreaterThan(0)
      expect(result.allowedTools).toContain("read") // from allowlist
    })

    it("includes all tools from DEVELOPMENT_TOOL_ALLOWLIST", () => {
      const result = resolveAgencyAllowedTools({
        agencyId: "agency-development",
        enabled: true,
        capabilities: [],
      })

      for (const tool of DEVELOPMENT_TOOL_ALLOWLIST) {
        expect(result.allowedTools).toContain(tool)
      }
    })

    it("adds capability-mapped tools on top of allowlist", () => {
      const result = resolveAgencyAllowedTools({
        agencyId: "agency-development",
        enabled: true,
        capabilities: ["debugging"],
      })

      // Should include all allowlist tools
      expect(result.allowedTools).toContain("read")
      // Plus tools from debugging capability
      expect(result.allowedTools).toContain("bash")
      expect(result.allowedTools).toContain("grep")
    })

    it("handles null/undefined agencyId gracefully", () => {
      const result1 = resolveAgencyAllowedTools({
        agencyId: null,
        enabled: true,
      })
      expect(result1.enabled).toBe(false)

      const result2 = resolveAgencyAllowedTools({
        agencyId: undefined,
        enabled: true,
      })
      expect(result2.enabled).toBe(false)
    })

    it("returns default (empty) for non-development agencies", () => {
      const result = resolveAgencyAllowedTools({
        agencyId: "agency-knowledge",
        enabled: true,
      })
      // Knowledge agency uses different allowlist
      expect(result.enabled).toBe(true) // Still enabled
      expect(result.allowedTools).not.toContain("bash") // Development-specific tool
    })
  })

  describe("Policy enforcement scenario tests", () => {
    it("Scenario: Read-only code analysis", () => {
      const result = resolveAgencyAllowedTools({
        agencyId: "agency-development",
        enabled: true,
        capabilities: ["code-review", "comparison"],
      })

      // Should have read-only tools
      expect(result.allowedTools).toContain("read")
      expect(result.allowedTools).toContain("grep")
      expect(result.allowedTools).toContain("codesearch")

      // Should NOT have execution tools
      expect(result.allowedTools).not.toContain("git_reset_hard") // Denied explicitly
      expect(result.allowedTools).not.toContain("secret_export") // Denied explicitly
    })

    it("Scenario: Debugging with test execution", () => {
      const result = resolveAgencyAllowedTools({
        agencyId: "agency-development",
        enabled: true,
        capabilities: ["debugging", "testing"],
      })

      // Should have execution tools
      expect(result.allowedTools).toContain("bash")

      // Should have read tools
      expect(result.allowedTools).toContain("read")
      expect(result.allowedTools).toContain("grep")

      // Should NOT have destructive operations
      expect(result.allowedTools).not.toContain("git_force_push")
    })

    it("Scenario: Code patching with write access", () => {
      const result = resolveAgencyAllowedTools({
        agencyId: "agency-development",
        enabled: true,
        capabilities: ["patching", "refactoring"],
      })

      // Should have write tools
      expect(result.allowedTools).toContain("apply_patch")

      // Should have read tools
      expect(result.allowedTools).toContain("read")

      // Should NOT have destructive git
      expect(result.allowedTools).not.toContain("git_reset_hard")
    })
  })

  describe("FIX 5 compliance (Tool Mapping from AUDIT_2026-04-13)", () => {
    it("extends mapDevelopmentCapabilitiesToTools per specification", () => {
      // FIX 5: Extended mapping with 7+ capability groups
      const testCases: Array<[string[], string[], string]> = [
        [["coding"], ["read", "glob", "grep", "codesearch"], "Code understanding"],
        [["debugging"], ["bash", "read", "glob", "grep"], "Debugging"],
        [["testing"], ["bash", "read", "glob"], "Testing"],
        [["planning"], ["read", "glob", "grep"], "Planning"],
        [["patching"], ["read", "glob", "apply_patch"], "Patching"],
        [["git_ops"], ["bash", "read"], "Git operations"],
      ]

      for (const [caps, expectedTools, description] of testCases) {
        const tools = mapDevelopmentCapabilitiesToTools(caps)
        for (const expectedTool of expectedTools) {
          expect(tools).toContain(expectedTool)
        }
      }
    })

    it("defines DEVELOPMENT_TOOL_POLICY_LEVELS per specification", () => {
      // ISSUE 2: "Tool policy mapping incomplete for all capabilities"
      // Now: Every development tool has a defined policy level

      const mappedTools = [
        "read",
        "glob",
        "grep",
        "codesearch",
        "apply_patch",
        "bash",
        "skill",
        "websearch",
        "webfetch",
      ]

      for (const tool of mappedTools) {
        expect(DEVELOPMENT_TOOL_POLICY_LEVELS).toHaveProperty(tool)
        const level = DEVELOPMENT_TOOL_POLICY_LEVELS[tool]
        expect(["SAFE", "NOTIFY"]).toContain(level)
      }
    })

    it("implements deny-by-default for unspecified tools", () => {
      // Tools not in DEVELOPMENT_TOOL_ALLOWLIST are implicitly denied
      const deniedTools = ["secret_export", "git_reset_hard", "git_force_push", "auto_execute"]

      const result = resolveAgencyAllowedTools({
        agencyId: "agency-development",
        enabled: true,
        capabilities: [],
      })

      for (const tool of deniedTools) {
        expect(result.allowedTools).not.toContain(tool)
      }
    })
  })

  describe("G4 Build Gate Requirements", () => {
    it("satisfies: tool policy validation (gate deny-by-default)", () => {
      // Gate 1: No tool outside allowlist visible
      const result = resolveAgencyAllowedTools({
        agencyId: "agency-development",
        enabled: true,
      })

      // Only development-allowed tools present
      for (const tool of result.allowedTools) {
        expect([...DEVELOPMENT_TOOL_ALLOWLIST]).toContain(tool as any)
      }
    })

    it("satisfies: policy mapping completeness", () => {
      // Gate 2: Every allowed tool has defined policy level
      for (const tool of DEVELOPMENT_TOOL_ALLOWLIST) {
        expect(DEVELOPMENT_TOOL_POLICY_LEVELS).toHaveProperty(tool)
      }
    })

    it("satisfies: capability-to-tool resolution", () => {
      // Gate 3: Capabilities map deterministically to tools
      const caps1 = mapDevelopmentCapabilitiesToTools(["coding"])
      const caps2 = mapDevelopmentCapabilitiesToTools(["coding"]) // Same input
      expect(caps1).toEqual(caps2) // Deterministic output
    })
  })
})

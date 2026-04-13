/**
 * Google Workspace Policy MCP Integration Tests
 * P1: Integration tests for GWS policy resolution with MCP
 *
 * Tests the tool identity resolver's ability to map between
 * policy aliases (e.g., gmail.search) and MCP runtime keys
 * (e.g., google_workspace_search_gmail_messages).
 */

import { describe, expect, test } from "bun:test"
import { ToolIdentityResolver } from "../../src/session/tool-identity-resolver"
import { isCanonicalAlias } from "../../src/session/tool-policy"

// Mock MCP runtime keys (simulating what MCP server exposes)
// These MUST match the actual mappings in tool-identity-map.ts
const mockMcpTools: Record<string, string> = {
  google_workspace_search_gmail_messages: "search",
  google_workspace_list_gmail_messages: "list",
  google_workspace_send_gmail_message: "send",
  google_workspace_list_calendars: "calendar.list",
  google_workspace_create_calendar_event: "calendar.create",
  google_workspace_list_drive_files: "drive.list",
  google_workspace_create_drive_file: "drive.create",
}

// Mock policy allowlist with abstract aliases (from tool-identity-map.ts)
const mockPolicyAllowlist = [
  "gmail.search",
  "gmail.list",
  "gmail.send",
  "calendar.list",
  "calendar.create",
  "drive.list",
  "drive.create",
]

describe("gworkspace-policy-mcp integration", () => {
  describe("canonical alias resolution via ToolIdentityResolver", () => {
    test("resolve returns ResolveResult for gmail.search", () => {
      const result = ToolIdentityResolver.resolve(
        "gmail.search",
        "agency-gworkspace",
        new Set(Object.keys(mockMcpTools)),
      )
      expect(result).toBeDefined()
      expect(result.alias).toBe("gmail.search")
      expect(result.toolType).toBe("mcp")
      expect(result.resolved).toBe(true)
      expect(result.runtimeKey).toBe("google_workspace_search_gmail_messages")
    })

    test("resolve returns ResolveResult for calendar.list", () => {
      const result = ToolIdentityResolver.resolve(
        "calendar.list",
        "agency-gworkspace",
        new Set(Object.keys(mockMcpTools)),
      )
      expect(result).toBeDefined()
      expect(result.alias).toBe("calendar.list")
      expect(result.toolType).toBe("mcp")
      expect(result.resolved).toBe(true)
      expect(result.runtimeKey).toBe("google_workspace_list_calendars")
    })

    test("resolve returns unknown for non-existent alias", () => {
      const result = ToolIdentityResolver.resolve(
        "nonexistent.action",
        "agency-gworkspace",
        new Set(Object.keys(mockMcpTools)),
      )
      expect(result).toBeDefined()
      expect(result.toolType).toBe("unknown")
      expect(result.resolved).toBe(false)
    })
  })

  describe("policy allowlist resolution", () => {
    test("resolveAll handles multiple aliases", () => {
      const aliases = ["gmail.search", "calendar.list", "nonexistent"]
      const results = ToolIdentityResolver.resolveAll(aliases, "agency-gworkspace", new Set(Object.keys(mockMcpTools)))

      expect(results).toHaveLength(3)
      expect(results[0]?.alias).toBe("gmail.search")
      expect(results[1]?.alias).toBe("calendar.list")
      expect(results[2]?.alias).toBe("nonexistent")
    })

    test("all known aliases resolve successfully", () => {
      const results = ToolIdentityResolver.resolveAll(
        mockPolicyAllowlist,
        "agency-gworkspace",
        new Set(Object.keys(mockMcpTools)),
      )

      // All known aliases should resolve
      for (const result of results) {
        expect(result.resolved).toBe(true)
      }
    })
  })

  describe("filterByPolicy", () => {
    test("filters tools against policy allowlist", () => {
      const allMcpKeys = Object.keys(mockMcpTools)
      const filtered = ToolIdentityResolver.filterByPolicy(allMcpKeys, mockPolicyAllowlist, "agency-gworkspace")

      expect(filtered.allowed.length).toBeGreaterThan(0)
      expect(filtered).toHaveProperty("blocked")
      expect(filtered).toHaveProperty("blockedReason")
      expect(Array.isArray(filtered.blocked)).toBe(true)
    })

    test("reports blocked tools with reasons", () => {
      // Request tools not in policy
      const requestedTools = ["google_workspace_search_gmail_messages", "some_unknown_tool"]
      const filtered = ToolIdentityResolver.filterByPolicy(requestedTools, mockPolicyAllowlist, "agency-gworkspace")

      expect(filtered).toHaveProperty("blockedReason")
      expect(typeof filtered.blockedReason).toBe("object")
    })
  })

  describe("tool-policy functions", () => {
    test("isCanonicalAlias correctly identifies abstract aliases", () => {
      // These would be the abstract aliases from policy
      expect(isCanonicalAlias("gmail.search")).toBe(true)
      expect(isCanonicalAlias("calendar.list")).toBe(true)
    })

    test("isCanonicalAlias returns false for runtime keys", () => {
      expect(isCanonicalAlias("google_workspace_search_gmail_messages")).toBe(false)
      expect(isCanonicalAlias("google_workspace_list_calendars")).toBe(false)
    })
  })

  describe("end-to-end resolution", () => {
    test("full flow: policy alias -> runtime key via resolver", () => {
      // Step 1: Get policy allowlist
      const policyAllowlist = mockPolicyAllowlist

      // Step 2: Resolve all aliases
      const results = ToolIdentityResolver.resolveAll(
        policyAllowlist,
        "agency-gworkspace",
        new Set(Object.keys(mockMcpTools)),
      )

      // All our mock tools should be resolved
      expect(results.every((r) => r.resolved)).toBe(true)
    })

    test("handles policy with partial MCP coverage", () => {
      // Only some MCP tools are available
      const partialMcpTools = {
        google_workspace_search_gmail_messages: "search",
        google_workspace_list_calendars: "calendar.list",
      }

      const filtered = ToolIdentityResolver.filterByPolicy(
        Object.keys(partialMcpTools),
        mockPolicyAllowlist,
        "agency-gworkspace",
      )

      // gmail.search should be allowed
      expect(filtered.allowed.some((k) => k.includes("gmail"))).toBe(true)
    })

    test("detects when runtime key not in knownMcpKeys set", () => {
      // Test the critical fix: knownMcpKeys validation
      // When an alias maps to a runtime key not in the knownMcpKeys set,
      // resolution should fail with resolved: false
      const result = ToolIdentityResolver.resolve(
        "gmail.search",
        "agency-gworkspace",
        new Set(), // Empty set - no known MCP keys
      )

      expect(result.resolved).toBe(false)
      expect(result.reason).toContain("not found in MCP tools")
    })

    test("validates runtime keys against knownMcpKeys set in prompt.ts scenario", () => {
      // Simulate the fix in prompt.ts:
      // 1. Get all MCP tools
      // 2. Create Set of known MCP keys
      // 3. Pass to resolver for validation
      const allMcpKeys = Object.keys(mockMcpTools)
      const knownMcpKeysSet = new Set(allMcpKeys)

      // Now resolve should work
      const result = ToolIdentityResolver.resolve("gmail.search", "agency-gworkspace", knownMcpKeysSet)

      expect(result.resolved).toBe(true)
      expect(result.runtimeKey).toBe("google_workspace_search_gmail_messages")

      // And if we have partial MCP tools (some not available)
      const partialMcpKeysSet = new Set(["google_workspace_search_gmail_messages", "google_workspace_list_calendars"])

      const result2 = ToolIdentityResolver.resolve(
        "gmail.send", // This is not in partial set
        "agency-gworkspace",
        partialMcpKeysSet,
      )

      // Should fail validation because the runtime key is not available
      expect(result2.resolved).toBe(false)
    })
  })
})

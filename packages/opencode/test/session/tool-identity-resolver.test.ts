/**
 * Tool Identity Resolver Tests
 * P0: Stabilizza identità tool e policy binding
 *
 * Tests for ToolIdentityResolver - alias → runtime key resolution
 */

import { describe, expect, test } from "bun:test"
import { ToolIdentityResolver } from "../../src/session/tool-identity-resolver"
import { ToolIdentityMap } from "../../src/session/tool-identity-map"

describe("ToolIdentityResolver", () => {
  describe("resolve()", () => {
    test("resolves native tool IDs directly", () => {
      const result = ToolIdentityResolver.resolve("websearch", "agency-knowledge")
      expect(result.resolved).toBe(true)
      expect(result.runtimeKey).toBe("websearch")
      expect(result.toolType).toBe("native")
    })

    test("resolves GWorkspace alias to MCP runtime key", () => {
      const result = ToolIdentityResolver.resolve("gmail.search", "agency-gworkspace")
      expect(result.resolved).toBe(true)
      expect(result.runtimeKey).toBe("google_workspace_search_gmail_messages")
      expect(result.toolType).toBe("mcp")
    })

    test("resolves finance alias to runtime key", () => {
      const result = ToolIdentityResolver.resolve("finance-api", "agency-finance")
      expect(result.resolved).toBe(true)
      expect(result.runtimeKey).toBe("market_data_api")
      expect(result.toolType).toBe("mcp")
    })

    test("returns unresolved for unknown alias", () => {
      const result = ToolIdentityResolver.resolve("unknown.tool", "agency-gworkspace")
      expect(result.resolved).toBe(false)
      expect(result.reason).toContain("not found")
    })

    test("verifies runtime key exists in knownMcpKeys when provided", () => {
      const knownKeys = new Set(["google_workspace_search_gmail_messages", "google_workspace_list_gmail_messages"])
      const result = ToolIdentityResolver.resolve("gmail.search", "agency-gworkspace", knownKeys)
      expect(result.resolved).toBe(true)
      expect(result.runtimeKey).toBe("google_workspace_search_gmail_messages")
    })

    test("returns unresolved when runtime key not in knownMcpKeys", () => {
      const knownKeys = new Set(["some_other_tool"])
      const result = ToolIdentityResolver.resolve("gmail.search", "agency-gworkspace", knownKeys)
      expect(result.resolved).toBe(false)
      expect(result.reason).toContain("not found in MCP tools")
    })
  })

  describe("resolveAll()", () => {
    test("resolves multiple aliases", () => {
      const aliases = ["gmail.search", "gmail.read", "websearch"]
      const results = ToolIdentityResolver.resolveAll(aliases, "agency-gworkspace")

      expect(results).toHaveLength(3)
      expect(results[0]!.resolved).toBe(true)
      expect(results[0]!.runtimeKey).toBe("google_workspace_search_gmail_messages")
      expect(results[1]!.resolved).toBe(true)
      expect(results[1]!.runtimeKey).toBe("google_workspace_read_gmail_message")
      expect(results[2]!.resolved).toBe(true)
      expect(results[2]!.runtimeKey).toBe("websearch")
    })
  })

  describe("filterByPolicy()", () => {
    test("allows tools directly in allowlist", () => {
      const requested = ["websearch", "webfetch"]
      const allowed = ["websearch", "webfetch", "skill"]
      const result = ToolIdentityResolver.filterByPolicy(requested, allowed, "agency-knowledge")

      expect(result.allowed).toContain("websearch")
      expect(result.allowed).toContain("webfetch")
      expect(result.blocked).toHaveLength(0)
    })

    test("allows tools via alias resolution", () => {
      const requested = ["google_workspace_search_gmail_messages"]
      const allowed = ["gmail.search"] // Policy uses alias
      const result = ToolIdentityResolver.filterByPolicy(
        requested,
        allowed,
        "agency-gworkspace",
        new Set(["google_workspace_search_gmail_messages"]),
      )

      expect(result.allowed).toContain("google_workspace_search_gmail_messages")
      expect(result.blocked).toHaveLength(0)
    })

    test("blocks tools not in allowlist after resolution", () => {
      const requested = ["google_workspace_search_gmail_messages"]
      const allowed = ["websearch", "webfetch"] // No gmail alias
      const result = ToolIdentityResolver.filterByPolicy(
        requested,
        allowed,
        "agency-gworkspace",
        new Set(["google_workspace_search_gmail_messages"]),
      )

      expect(result.blocked).toContain("google_workspace_search_gmail_messages")
      expect(result.blockedReason["google_workspace_search_gmail_messages"]).toContain("not in policy allowlist")
    })
  })

  describe("normalizeAllowlist()", () => {
    test("normalizes GWorkspace aliases to runtime keys", () => {
      const allowlist = ["gmail.search", "gmail.read", "websearch"]
      const normalized = ToolIdentityResolver.normalizeAllowlist(allowlist, "agency-gworkspace")

      expect(normalized).toContain("google_workspace_search_gmail_messages")
      expect(normalized).toContain("google_workspace_read_gmail_message")
      expect(normalized).toContain("websearch")
    })

    test("removes duplicates after normalization", () => {
      const allowlist = ["gmail.search", "websearch"]
      const normalized = ToolIdentityResolver.normalizeAllowlist(allowlist, "agency-gworkspace")

      const duplicates = normalized.filter((x, i) => normalized.indexOf(x) !== i)
      expect(duplicates).toHaveLength(0)
    })
  })

  describe("areEquivalent()", () => {
    test("returns true for same IDs", () => {
      expect(ToolIdentityResolver.areEquivalent("websearch", "websearch", "agency-knowledge")).toBe(true)
    })

    test("returns true for alias and runtime key", () => {
      expect(
        ToolIdentityResolver.areEquivalent(
          "gmail.search",
          "google_workspace_search_gmail_messages",
          "agency-gworkspace",
        ),
      ).toBe(true)
    })
  })

  describe("getCanonicalAlias()", () => {
    test("returns canonical alias for runtime key", () => {
      const alias = ToolIdentityResolver.getCanonicalAlias(
        "google_workspace_search_gmail_messages",
        "agency-gworkspace",
      )
      expect(alias).toBe("gmail.search")
    })

    test("returns undefined for unknown runtime key", () => {
      const alias = ToolIdentityResolver.getCanonicalAlias("unknown_tool", "agency-gworkspace")
      expect(alias).toBeUndefined()
    })
  })

  describe("validateAllowlist()", () => {
    test("returns valid for resolvable allowlist", () => {
      const result = ToolIdentityResolver.validateAllowlist(["gmail.search", "websearch"], "agency-gworkspace")
      expect(result.valid).toBe(true)
      expect(result.unresolved).toHaveLength(0)
    })

    test("returns invalid with unresolved aliases", () => {
      const result = ToolIdentityResolver.validateAllowlist(["gmail.search", "unknown.alias"], "agency-gworkspace")
      expect(result.valid).toBe(false)
      expect(result.unresolved).toContain("unknown.alias")
      expect(result.reasons["unknown.alias"]).toContain("not found")
    })
  })
})

describe("ToolIdentityMap", () => {
  describe("getAgencyToolMap()", () => {
    test("returns GWorkspace map for agency-gworkspace", () => {
      const map = ToolIdentityMap.getAgencyToolMap("agency-gworkspace")
      expect(map["gmail.search"]).toBe("google_workspace_search_gmail_messages")
    })

    test("returns empty object for unknown agency", () => {
      const map = ToolIdentityMap.getAgencyToolMap("unknown-agency")
      expect(Object.keys(map)).toHaveLength(0)
    })
  })

  describe("isAlias()", () => {
    test("returns true for dotted aliases", () => {
      expect(ToolIdentityMap.isAlias("gmail.search")).toBe(true)
      expect(ToolIdentityMap.isAlias("drive.read")).toBe(true)
    })

    test("returns false for native tool IDs", () => {
      expect(ToolIdentityMap.isAlias("websearch")).toBe(false)
      expect(ToolIdentityMap.isAlias("read")).toBe(false)
    })
  })

  describe("buildReverseMap()", () => {
    test("creates reverse mapping from runtime to alias", () => {
      const reverse = ToolIdentityMap.buildReverseMap("agency-gworkspace")
      expect(reverse["google_workspace_search_gmail_messages"]).toBe("gmail.search")
    })
  })
})

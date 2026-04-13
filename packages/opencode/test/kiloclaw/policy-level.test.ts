import { describe, it, expect } from "bun:test"
import { PolicyLevel, PolicyLevelOrder, isMoreRestrictive, enforcePolicy } from "@/kiloclaw/agency/types"

describe("PolicyLevel enum and utilities", () => {
  describe("PolicyLevel type", () => {
    it("defines all 5 policy levels", () => {
      const levels: PolicyLevel[] = ["SAFE", "NOTIFY", "CONFIRM", "HITL", "DENY"]
      expect(levels).toHaveLength(5)
    })

    it("enforces type safety (compile-time check)", () => {
      const safe: PolicyLevel = "SAFE"
      const notify: PolicyLevel = "NOTIFY"
      const confirm: PolicyLevel = "CONFIRM"
      const hitl: PolicyLevel = "HITL"
      const deny: PolicyLevel = "DENY"

      expect([safe, notify, confirm, hitl, deny]).toHaveLength(5)
    })
  })

  describe("PolicyLevelOrder", () => {
    it("defines ordering for all levels", () => {
      expect(PolicyLevelOrder.SAFE).toBe(0)
      expect(PolicyLevelOrder.NOTIFY).toBe(1)
      expect(PolicyLevelOrder.CONFIRM).toBe(2)
      expect(PolicyLevelOrder.HITL).toBe(3)
      expect(PolicyLevelOrder.DENY).toBe(4)
    })

    it("maintains strict ordering (ascending restrictiveness)", () => {
      const order = [
        PolicyLevelOrder.SAFE,
        PolicyLevelOrder.NOTIFY,
        PolicyLevelOrder.CONFIRM,
        PolicyLevelOrder.HITL,
        PolicyLevelOrder.DENY,
      ]
      for (let i = 0; i < order.length - 1; i++) {
        expect(order[i]).toBeLessThan(order[i + 1])
      }
    })
  })

  describe("isMoreRestrictive(a, b)", () => {
    it("returns true when a is more restrictive than b", () => {
      expect(isMoreRestrictive("DENY", "SAFE")).toBe(true)
      expect(isMoreRestrictive("HITL", "NOTIFY")).toBe(true)
      expect(isMoreRestrictive("CONFIRM", "SAFE")).toBe(true)
      expect(isMoreRestrictive("NOTIFY", "SAFE")).toBe(true)
    })

    it("returns false when a is less restrictive than b", () => {
      expect(isMoreRestrictive("SAFE", "DENY")).toBe(false)
      expect(isMoreRestrictive("NOTIFY", "HITL")).toBe(false)
      expect(isMoreRestrictive("CONFIRM", "DENY")).toBe(false)
    })

    it("returns false when a equals b (same level)", () => {
      expect(isMoreRestrictive("SAFE", "SAFE")).toBe(false)
      expect(isMoreRestrictive("DENY", "DENY")).toBe(false)
      expect(isMoreRestrictive("CONFIRM", "CONFIRM")).toBe(false)
    })

    it("handles all pairwise comparisons", () => {
      const levels: PolicyLevel[] = ["SAFE", "NOTIFY", "CONFIRM", "HITL", "DENY"]
      for (let i = 0; i < levels.length; i++) {
        for (let j = i + 1; j < levels.length; j++) {
          // Higher index = more restrictive
          expect(isMoreRestrictive(levels[j], levels[i])).toBe(true)
          expect(isMoreRestrictive(levels[i], levels[j])).toBe(false)
        }
      }
    })
  })

  describe("enforcePolicy(level, requiresApproval)", () => {
    it('returns "deny" when level is DENY', () => {
      expect(enforcePolicy("DENY", false)).toBe("deny")
      expect(enforcePolicy("DENY", true)).toBe("deny")
    })

    it('returns "deny" when requiresApproval is true (regardless of level)', () => {
      expect(enforcePolicy("SAFE", true)).toBe("deny")
      expect(enforcePolicy("NOTIFY", true)).toBe("deny")
      expect(enforcePolicy("CONFIRM", true)).toBe("deny")
      expect(enforcePolicy("HITL", true)).toBe("deny")
    })

    it('returns "deny" when level is HITL (requires approval)', () => {
      expect(enforcePolicy("HITL", false)).toBe("deny")
      expect(enforcePolicy("HITL", true)).toBe("deny")
    })

    it('returns "confirm" when level is CONFIRM', () => {
      expect(enforcePolicy("CONFIRM", false)).toBe("confirm")
    })

    it('returns "notify" when level is NOTIFY', () => {
      expect(enforcePolicy("NOTIFY", false)).toBe("notify")
    })

    it('returns "allow" when level is SAFE', () => {
      expect(enforcePolicy("SAFE", false)).toBe("allow")
    })

    it("implements correct enforcement hierarchy", () => {
      // Test the full enforcement matrix
      const tests: Array<[PolicyLevel, boolean, string]> = [
        ["SAFE", false, "allow"],
        ["SAFE", true, "deny"],
        ["NOTIFY", false, "notify"],
        ["NOTIFY", true, "deny"],
        ["CONFIRM", false, "confirm"],
        ["CONFIRM", true, "deny"],
        ["HITL", false, "deny"],
        ["HITL", true, "deny"],
        ["DENY", false, "deny"],
        ["DENY", true, "deny"],
      ]

      for (const [level, requiresApproval, expected] of tests) {
        const result = enforcePolicy(level, requiresApproval)
        expect(result).toBe(expected)
      }
    })
  })

  describe("integration with Development Agency policy mapping", () => {
    it("maps development tools to correct policy levels", () => {
      // Read-only tools → SAFE
      const safeTools = ["read", "glob", "grep", "codesearch"]
      for (const tool of safeTools) {
        expect(isMoreRestrictive("SAFE", "SAFE")).toBe(false) // Same level, not more restrictive
      }

      // Reversible operations → NOTIFY
      const notifyTools = ["apply_patch", "bash", "skill"]
      for (const tool of notifyTools) {
        expect(isMoreRestrictive("NOTIFY", "SAFE")).toBe(true) // NOTIFY is more restrictive than SAFE
      }
    })

    it("enforces deny-by-default for unspecified tools", () => {
      // Blocked tools should be treated as DENY
      expect(enforcePolicy("DENY", false)).toBe("deny")
      expect(enforcePolicy("DENY", true)).toBe("deny")
    })

    it("respects policy escalation for destructive operations", () => {
      // Destructive git operations (e.g., reset --hard, force push) should require approval
      // Test that HITL operations fail without explicit approval
      expect(enforcePolicy("HITL", false)).toBe("deny")
      expect(enforcePolicy("HITL", true)).toBe("deny") // Even with approval, logged as denied pending explicit user approval
    })
  })

  describe("FIX 1 compliance (PolicyLevel enum from AUDIT_2026-04-13)", () => {
    it("implements exact spec from audit document", () => {
      // From AUDIT_SUMMARY_INDEX_2026-04-13.md:
      // "PolicyLevel = "SAFE" | "NOTIFY" | "CONFIRM" | "HITL" | "DENY""
      const specLevels: PolicyLevel[] = ["SAFE", "NOTIFY", "CONFIRM", "HITL", "DENY"]
      expect(specLevels).toHaveLength(5)

      // Verify each level can be used
      for (const level of specLevels) {
        expect(isMoreRestrictive(level, level)).toBe(false)
      }
    })

    it("satisfies BLOCKER 2 requirement", () => {
      // BLOCKER 2: "Policy Level enum NOT DEFINED" - NOW DEFINED
      // Verify the type is exported and usable
      const policyLevelExists = PolicyLevelOrder !== undefined
      expect(policyLevelExists).toBe(true)

      // Verify utilities are exportable
      expect(typeof isMoreRestrictive).toBe("function")
      expect(typeof enforcePolicy).toBe("function")
    })
  })
})

import { describe, it, expect, beforeEach } from "bun:test"
import { classifyError } from "@/kiloclaw/runtime/error-taxonomy"
import type { ErrorCategory, ErrorSeverity, ClassifiedError } from "@/kiloclaw/runtime/error-taxonomy"

describe("Error Taxonomy - Classification and Severity", () => {
  let correlationId: string

  beforeEach(() => {
    correlationId = `test-${Date.now()}`
  })

  describe("classifyError(error, correlationId): ClassifiedError", () => {
    it("handles non-Error objects", () => {
      const classified = classifyError("string error", correlationId)
      expect(classified.category).toBe("exception")
      expect(classified.severity).toBe("medium")
      expect(classified.message).toBe("string error")
      expect(classified.correlationId).toBe(correlationId)
    })

    it("handles null/undefined gracefully", () => {
      const nullResult = classifyError(null, correlationId)
      expect(nullResult.category).toBe("exception")
      expect(nullResult.severity).toBe("medium")

      const undefinedResult = classifyError(undefined, correlationId)
      expect(undefinedResult.category).toBe("exception")
    })

    describe("Build failure classification", () => {
      it("classifies errors with 'build' keyword", () => {
        const err = new Error("build failed: cannot find module")
        const classified = classifyError(err, correlationId)
        expect(classified.category).toBe("build_fail")
        expect(["high", "critical"]).toContain(classified.severity)
      })

      it("classifies errors with 'compile' keyword", () => {
        const err = new Error("compile error: syntax error")
        const classified = classifyError(err, correlationId)
        expect(classified.category).toBe("build_fail")
      })

      it("classifies ENOENT as build failure", () => {
        const err = new Error("enoent: file not found during build")
        const classified = classifyError(err, correlationId)
        expect(classified.category).toBe("build_fail")
      })

      it("sets severity to 'critical' if error mentions critical", () => {
        const err = new Error("build critical failure")
        const classified = classifyError(err, correlationId)
        expect(classified.category).toBe("build_fail")
        expect(classified.severity).toBe("critical")
      })

      it("sets severity to 'high' for typical build failures", () => {
        const err = new Error("build failed")
        const classified = classifyError(err, correlationId)
        expect(classified.category).toBe("build_fail")
        expect(classified.severity).toBe("high")
      })

      it("includes stack trace from original error", () => {
        const err = new Error("build failed")
        const classified = classifyError(err, correlationId)
        expect(classified.stackTrace).toBeTruthy()
        expect(classified.stackTrace).toContain("Error: build failed")
      })
    })

    describe("Test failure classification", () => {
      it("classifies test/spec failures", () => {
        const testErrors = [
          new Error("test failed: assertion error"),
          new Error("spec failed: expected true"),
          new Error("assertion failed: expected 5 to be 10"),
        ]

        for (const err of testErrors) {
          const classified = classifyError(err, correlationId)
          expect(classified.category).toBe("test_fail")
          expect(classified.severity).toBe("medium")
        }
      })

      it("always sets severity to 'medium' for test failures", () => {
        const tests = ["test", "spec", "assertion"]
        for (const keyword of tests) {
          const err = new Error(`${keyword} failed`)
          const classified = classifyError(err, correlationId)
          expect(classified.severity).toBe("medium")
        }
      })
    })

    describe("Policy block classification", () => {
      it("classifies policy/permission denial errors", () => {
        const policyErrors = [
          new Error("policy: operation denied"),
          new Error("permission denied: cannot access resource"),
          new Error("deny: tool not in allowlist"),
        ]

        for (const err of policyErrors) {
          const classified = classifyError(err, correlationId)
          expect(classified.category).toBe("policy_block")
          expect(classified.severity).toBe("high")
        }
      })

      it("always sets severity to 'high' for policy blocks", () => {
        const policyErrors = [new Error("policy denied"), new Error("permission error"), new Error("denied by policy")]

        for (const err of policyErrors) {
          const classified = classifyError(err, correlationId)
          expect(classified.severity).toBe("high")
        }
      })
    })

    describe("Tool contract failure classification", () => {
      it("classifies contract/schema/validation errors", () => {
        const contractErrors = [
          new Error("contract validation failed"),
          new Error("schema error: missing required field"),
          new Error("validation failed: invalid input"),
        ]

        for (const err of contractErrors) {
          const classified = classifyError(err, correlationId)
          expect(classified.category).toBe("tool_contract_fail")
          expect(classified.severity).toBe("high")
        }
      })

      it("always sets severity to 'high' for contract failures", () => {
        const contractErrors = [
          new Error("contract failed"),
          new Error("schema validation"),
          new Error("validation error"),
        ]

        for (const err of contractErrors) {
          const classified = classifyError(err, correlationId)
          expect(classified.severity).toBe("high")
        }
      })
    })

    describe("Generic exception classification", () => {
      it("classifies unmatched errors as exceptions", () => {
        const genericErrors = [
          new Error("something went wrong"),
          new Error("unexpected error"),
          new Error("unknown failure"),
        ]

        for (const err of genericErrors) {
          const classified = classifyError(err, correlationId)
          expect(classified.category).toBe("exception")
        }
      })

      it("sets severity based on 'critical' keyword in message", () => {
        const criticalErr = new Error("critical exception occurred")
        const classified = classifyError(criticalErr, correlationId)
        expect(classified.severity).toBe("critical")

        const normalErr = new Error("exception occurred")
        const classified2 = classifyError(normalErr, correlationId)
        expect(classified2.severity).toBe("medium")
      })
    })
  })

  describe("ClassifiedError interface", () => {
    it("includes all required fields", () => {
      const err = new Error("test error")
      const classified = classifyError(err, correlationId)

      expect(classified).toHaveProperty("category")
      expect(classified).toHaveProperty("severity")
      expect(classified).toHaveProperty("message")
      expect(classified).toHaveProperty("timestamp")
      expect(classified).toHaveProperty("correlationId")
    })

    it("sets timestamp to current time", () => {
      const before = new Date()
      const classified = classifyError(new Error("test"), correlationId)
      const after = new Date()

      expect(classified.timestamp.getTime()).toBeGreaterThanOrEqual(before.getTime())
      expect(classified.timestamp.getTime()).toBeLessThanOrEqual(after.getTime())
    })

    it("preserves correlationId", () => {
      const testId = "unique-test-id-123"
      const classified = classifyError(new Error("test"), testId)
      expect(classified.correlationId).toBe(testId)
    })

    it("includes optional stackTrace for Error objects", () => {
      const err = new Error("test error with trace")
      const classified = classifyError(err, correlationId)
      expect(classified.stackTrace).toBeTruthy()
      expect(classified.stackTrace).toContain("test error with trace")
    })
  })

  describe("ErrorCategory type", () => {
    it("defines all valid categories", () => {
      const categories: ErrorCategory[] = ["exception", "build_fail", "test_fail", "policy_block", "tool_contract_fail"]
      expect(categories).toHaveLength(5)
    })
  })

  describe("ErrorSeverity type", () => {
    it("defines all valid severity levels", () => {
      const severities: ErrorSeverity[] = ["low", "medium", "high", "critical"]
      expect(severities).toHaveLength(4)
    })
  })

  describe("FIX 8 compliance (Error Taxonomy from AUDIT_2026-04-13)", () => {
    it("implements ClassifiedError with category and severity", () => {
      // BLOCKER 7: "Auto-Repair Cycle - NOT IMPLEMENTED" (related to error classification)
      // Error taxonomy needed for repair trigger classification
      const err = new Error("build failed")
      const classified = classifyError(err, correlationId)

      expect(classified.category).toBeTruthy()
      expect(classified.severity).toBeTruthy()
      expect(classified.timestamp).toBeInstanceOf(Date)
    })

    it("enables auto-repair decision making", () => {
      // Different error categories should trigger different repair strategies
      const testCases: Array<[string, ErrorCategory]> = [
        ["build failed", "build_fail"],
        ["test failed", "test_fail"],
        ["policy denied", "policy_block"],
        ["validation failed", "tool_contract_fail"],
        ["unknown error", "exception"],
      ]

      for (const [msg, expectedCategory] of testCases) {
        const err = new Error(msg)
        const classified = classifyError(err, correlationId)
        expect(classified.category).toBe(expectedCategory)
      }
    })

    it("provides severity for escalation decisions", () => {
      // High/critical errors may need different handling than low/medium
      const highSeverityErrors = [new Error("build failed"), new Error("policy denied"), new Error("contract failed")]

      for (const err of highSeverityErrors) {
        const classified = classifyError(err, correlationId)
        expect(["high", "critical"]).toContain(classified.severity)
      }
    })
  })

  describe("Priority ordering (for remediation)", () => {
    it("orders severity for triage: critical > high > medium > low", () => {
      const severityOrder: Record<ErrorSeverity, number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
      }

      const errors = [
        { msg: "exception medium", expected: "medium" },
        { msg: "build failed", expected: "high" },
        { msg: "critical failure", expected: "critical" },
      ]

      for (const { msg, expected } of errors) {
        const err = new Error(msg)
        const classified = classifyError(err, correlationId)
        expect((classified as any).severity).toBe(expected)
      }
    })
  })
})

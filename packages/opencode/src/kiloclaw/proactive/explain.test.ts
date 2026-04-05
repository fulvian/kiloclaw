import { describe, it, expect, beforeEach } from "bun:test"
import { ProactionExplainer } from "./explain"
import type { ProactionExplanation } from "./explain"

describe("ProactionExplainer", () => {
  let explainer: ProactionExplainer

  beforeEach(() => {
    explainer = new ProactionExplainer()
  })

  describe("explain", () => {
    it("should generate explanation for schedule trigger", () => {
      const context = {
        taskId: "task-1",
        taskName: "Daily Digest",
        trigger: {
          signal: "schedule",
          name: "daily_digest",
          description: "Daily summary",
          enabled: true,
          config: { frequency: "0 9 * * *" },
        },
        actionType: "notify",
        riskLevel: "low" as const,
        budgetStats: {
          totalUsed: 5,
          totalLimit: 100,
          byType: { suggest: 3, notify: 2, act_low_risk: 0 },
        },
        policyDecision: {
          allowed: true,
          reasons: ["Budget available: 95/100 for notify"],
          blockers: [],
        },
      }

      const explanation = explainer.explain(context)

      expect(explanation.why).toContain("Scheduled task triggered")
      expect(explanation.what).toContain("Daily Digest")
      expect(explanation.what).toContain("notify")
      expect(explanation.policy).toBe("Authorized: Budget available: 95/100 for notify")
      expect(explanation.budget.totalUsed).toBe(5)
      expect(explanation.budget.totalLimit).toBe(100)
      expect(explanation.howToDisable).toContain("Daily Digest")
      expect(explanation.generatedAt).toBeInstanceOf(Date)
    })

    it("should generate explanation for threshold trigger", () => {
      const context = {
        taskId: "task-2",
        taskName: "High Usage Alert",
        trigger: {
          signal: "threshold",
          name: "high_usage",
          description: "Alert on high usage",
          enabled: true,
          config: { threshold: 0.8 },
        },
        actionType: "act_low_risk",
        riskLevel: "medium" as const,
        budgetStats: undefined,
        policyDecision: {
          allowed: true,
          reasons: ["Policy limits passed"],
          blockers: [],
        },
      }

      const explanation = explainer.explain(context)

      expect(explanation.why).toContain("Threshold exceeded")
      expect(explanation.what).toContain("High Usage Alert")
      expect(explanation.how.some((h) => h.includes("Threshold"))).toBe(true)
    })

    it("should generate explanation for anomaly trigger", () => {
      const context = {
        taskId: "task-3",
        taskName: "Anomaly Detection",
        trigger: {
          signal: "anomaly",
          name: "behavioral_anomaly",
          description: "Detects anomalies",
          enabled: true,
          config: { patterns: ["unusual_time", "unusual_frequency"] },
        },
        actionType: "suggest",
        riskLevel: "high" as const,
        budgetStats: {
          totalUsed: 10,
          totalLimit: 50,
          byType: { suggest: 5, notify: 3, act_low_risk: 2 },
        },
        policyDecision: {
          allowed: false,
          reasons: [],
          blockers: ["Budget exhausted"],
        },
      }

      const explanation = explainer.explain(context)

      expect(explanation.why).toContain("Anomalous behavior detected")
      expect(explanation.policy).toContain("Blocked")
      expect(explanation.how.some((h) => h.includes("Anomaly patterns"))).toBe(true)
    })

    it("should handle missing policy decision", () => {
      const context = {
        taskId: "task-4",
        taskName: "Test Task",
        trigger: {
          signal: "reminder",
          name: "test_reminder",
          description: "Test reminder",
          enabled: true,
          config: {},
        },
        actionType: "notify",
        riskLevel: "low" as const,
        budgetStats: undefined,
        policyDecision: undefined,
      }

      const explanation = explainer.explain(context)

      expect(explanation.policy).toBe("Policy evaluation not available")
      expect(explanation.budget.totalUsed).toBe(0)
    })
  })

  describe("formatForUX", () => {
    it("should format explanation in Italian UX style", () => {
      const explanation: ProactionExplanation = {
        why: "Scheduled task triggered at 9:00 AM",
        what: 'Will notify "Daily Digest" (Low risk)',
        how: ["Trigger signal: schedule", "Schedule: 0 9 * * *"],
        policy: "Authorized: Budget available",
        budget: { totalUsed: 5, totalLimit: 100, byType: {} },
        howToDisable: 'Disable task "Daily Digest" in settings',
        generatedAt: new Date(),
      }

      const ux = ProactionExplainer.formatForUX(explanation)

      expect(ux).toContain("Sto per")
      expect(ux).toContain("perché")
      expect(ux).toContain("Policy:")
      expect(ux).toContain("Budget:")
      expect(ux).toContain("Per disattivare:")
    })
  })

  describe("formatForLog", () => {
    it("should format explanation as structured log data", () => {
      const explanation: ProactionExplanation = {
        why: "Test trigger",
        what: 'Will act "Test" (Low risk)',
        how: ["Signal: test"],
        policy: "Authorized",
        budget: { totalUsed: 1, totalLimit: 50, byType: { suggest: 1 } },
        howToDisable: "Use kill switch",
        generatedAt: new Date("2026-04-05T10:00:00Z"),
      }

      const log = ProactionExplainer.formatForLog(explanation)

      expect(log.why).toBe("Test trigger")
      expect(log.what).toBe('Will act "Test" (Low risk)')
      expect(log.how).toEqual(["Signal: test"])
      expect(log.policy).toBe("Authorized")
      expect(log.budget).toEqual({ totalUsed: 1, totalLimit: 50, byType: { suggest: 1 } })
      expect(log.howToDisable).toBe("Use kill switch")
      expect(log.generatedAt).toBe("2026-04-05T10:00:00.000Z")
    })
  })
})

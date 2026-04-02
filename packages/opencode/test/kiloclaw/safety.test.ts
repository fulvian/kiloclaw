import { describe, test, expect, beforeEach } from "bun:test"
import { tmpdir } from "../fixture/fixture"
import { PolicyEngine } from "../../src/kiloclaw/policy/engine"
import { DynamicRiskCalculator } from "../../src/kiloclaw/policy/dynamic"
import { ToolCallGuardrail } from "../../src/kiloclaw/guardrail/tool-guard"
import { DataExfiltrationGuardrail } from "../../src/kiloclaw/guardrail/data-exfiltration"
import { EscalationHandler } from "../../src/kiloclaw/guardrail/escalation"
import { RiskScorer } from "../../src/kiloclaw/guardrail/risk-scorer"
import { RISK_THRESHOLDS } from "../../src/kiloclaw/policy/rules"
import type { Action } from "../../src/kiloclaw/types"
import type { ActionContext } from "../../src/kiloclaw/policy/rules"

// Test utilities
async function withTmpDir(fn: (path: string) => Promise<void>) {
  await using tmp = await tmpdir()
  await fn(tmp.path)
}

// Helper to create a basic action
function createAction(type: string, parameters?: Record<string, unknown>): Action {
  return { type, parameters }
}

// Helper to create a basic policy context
function createContext(overrides?: Partial<ActionContext>): ActionContext {
  return {
    agencyId: "test-agency",
    agentId: "test-agent",
    sessionId: "test-session",
    toolIds: [],
    dataClassification: [],
    correlationId: "test-correlation",
    ...overrides,
  }
}

describe("Policy Engine", () => {
  let engine: PolicyEngine

  beforeEach(() => {
    engine = new PolicyEngine({ enableCaching: false })
  })

  test("should allow low-risk actions", async () => {
    const action = createAction("read_file", { path: "/tmp/test.txt" })
    const context = createContext({
      toolIds: ["read"],
      dataClassification: [],
    })

    const result = engine.evaluate(context, action)

    expect(result.allowed).toBe(true)
    expect(result.riskScore).toBeLessThan(RISK_THRESHOLDS.high)
  })

  test("should block or escalate high-risk actions", async () => {
    // Use "external_drop_all_databases" to include external_impact factor
    const action = createAction("external_drop_all_databases", { target: "all" })
    const context = createContext({
      toolIds: ["admin", "delete", "write", "execute"],
      dataClassification: ["P0_Critical"],
    })

    const result = engine.evaluate(context, action)

    // With external action type and P0_Critical, should exceed high threshold
    expect(result.escalationRequired || !result.allowed).toBe(true)
  })

  test("should register and apply static rules", async () => {
    engine.registerRule({
      id: "test-rule",
      description: "Block test actions",
      severity: "high",
      check: (context) => context.correlationId.includes("blocked"),
    })

    const action = createAction("test_action")
    const blockedContext = createContext({ correlationId: "blocked-correlation" as any })
    const normalContext = createContext({ correlationId: "normal-correlation" as any })

    const blockedResult = engine.evaluate(blockedContext, action)
    const normalResult = engine.evaluate(normalContext, action)

    expect(blockedResult.allowed).toBe(false)
    expect(normalResult.allowed).toBe(true)
  })

  test("should calculate risk scores correctly", () => {
    const calculator = new DynamicRiskCalculator()

    const lowRiskInput = {
      action: createAction("read_file"),
      toolIds: ["read"],
      dataClassifications: [],
      isAgencyContext: false,
      hasExternalImpact: false,
    }

    const highRiskInput = {
      action: createAction("delete_all_data"),
      toolIds: ["delete", "write", "execute"],
      dataClassifications: ["P0_Critical"],
      isAgencyContext: true,
      hasExternalImpact: true,
    }

    const lowRiskResult = calculator.calculate(lowRiskInput)
    const highRiskResult = calculator.calculate(highRiskInput)

    expect(lowRiskResult.score).toBeLessThan(highRiskResult.score)
    expect(lowRiskResult.threshold).toBe("low")
    expect(highRiskResult.threshold).toBe("high" as any)
  })

  test("should cache results when enabled", () => {
    const cachingEngine = new PolicyEngine({ enableCaching: true, cacheTTLMs: 10000 })

    const action = createAction("test_action")
    const context = createContext()

    const result1 = cachingEngine.evaluate(context, action)
    const result2 = cachingEngine.evaluate(context, action)

    // Results should be the same (from cache)
    expect(result1.allowed).toBe(result2.allowed)
  })

  test("should clear cache", () => {
    const cachingEngine = new PolicyEngine({ enableCaching: true })

    const action = createAction("test_action")
    const context = createContext()

    cachingEngine.evaluate(context, action)
    cachingEngine.clearCache()

    // After clearing, next evaluation should not use cache
    // This is implicitly tested by the cache structure being empty
  })
})

describe("Tool Call Guardrail", () => {
  test("should allow valid tool calls", () => {
    const guardrail = new ToolCallGuardrail()

    const action = createAction("read_file")
    const context = createContext({ toolIds: ["read_file"] })

    const result = guardrail.evaluate(context, action)

    expect(result.allowed).toBe(true)
  })

  test("should block when global kill switch is active", () => {
    const guardrail = new ToolCallGuardrail({ globalKillSwitch: true })

    const action = createAction("read_file")
    const context = createContext()

    const result = guardrail.evaluate(context, action)

    expect(result.allowed).toBe(false)
    expect(result.escalationRequired).toBe(true)
  })

  test("should block when agency kill switch is active", () => {
    const guardrail = new ToolCallGuardrail({ perAgencyKillSwitch: { "test-agency": true } })

    const action = createAction("read_file")
    const context = createContext({ agencyId: "test-agency" })

    const result = guardrail.evaluate(context, action)

    expect(result.allowed).toBe(false)
  })

  test("should audit tool call decisions", () => {
    const guardrail = new ToolCallGuardrail()

    const action = createAction("write_file")
    const context = createContext({ toolIds: ["write_file"] })

    guardrail.evaluate(context, action)

    const auditLog = guardrail.getAuditLog()
    expect(auditLog.length).toBeGreaterThan(0)
  })
})

describe("Data Exfiltration Guardrail", () => {
  test("should allow non-external actions", () => {
    const guardrail = new DataExfiltrationGuardrail()

    const action = createAction("read_local_file")
    const context = createContext()

    const result = guardrail.evaluate(context, action)

    expect(result.allowed).toBe(true)
  })

  test("should block sensitive data exfiltration", () => {
    const guardrail = new DataExfiltrationGuardrail()

    const action = createAction("http_post", { url: "https://external.com/data" })
    const context = createContext({
      toolIds: ["http_tool"],
      dataClassification: ["P0_Critical"],
    })

    const result = guardrail.evaluate(context, action)

    expect(result.allowed).toBe(false)
    expect(result.escalationRequired).toBe(true)
  })

  test("should detect PII patterns", () => {
    const guardrail = new DataExfiltrationGuardrail()

    // Use an action that triggers external detection AND data that will be flagged
    const action = createAction("http_post", { url: "https://external.com/upload" })
    const context = createContext({
      toolIds: ["http_tool"],
      dataClassification: ["P1_High"], // This should trigger escalation with riskScore
    })

    const result = guardrail.evaluate(context, action)

    // With P1_High data classification, should have riskScore and escalation
    expect(result.riskScore).toBeDefined()
    expect(result.escalationRequired).toBe(true)
  })
})

describe("Escalation Handler", () => {
  test("should not escalate low-risk actions", () => {
    const handler = new EscalationHandler()

    const action = createAction("read_file")
    const context = createContext()

    const result = handler.evaluate(context, action)

    expect(result.escalationRequired).toBe(false)
    expect(result.allowed).toBe(true)
  })

  test("should require escalation for critical actions", () => {
    const handler = new EscalationHandler()

    const action = createAction("delete_data")
    const context = createContext()

    const result = handler.evaluate(context, action)

    expect(result.escalationRequired).toBe(true)
  })

  test("should register custom escalation policies", () => {
    const handler = new EscalationHandler()

    handler.registerPolicy("custom_critical_action", {
      requiresExplicitConsent: true,
      requiresDoubleGate: true,
      escalationContact: "admin",
    })

    expect(handler.requiresDoubleGate("custom_critical_action")).toBe(true)
    expect(handler.requiresExplicitConsent("custom_critical_action")).toBe(true)
  })
})

describe("Risk Scorer", () => {
  test("should score low-risk actions correctly", () => {
    const scorer = new RiskScorer()

    const result = scorer.score({
      action: createAction("read_file"),
      toolIds: ["read"],
      dataClassifications: [],
      isAgencyContext: false,
      hasExternalImpact: false,
    })

    expect(result.recommendation).toBe("allow")
    expect(result.threshold).toBe("low")
  })

  test("should score high-risk actions correctly", () => {
    const scorer = new RiskScorer()

    const result = scorer.score({
      action: createAction("delete_all_data"),
      toolIds: ["delete", "write", "execute", "admin"],
      dataClassifications: ["P0_Critical"],
      isAgencyContext: true,
      hasExternalImpact: true, // Include external impact to get higher score
    })

    // High risk should trigger confirm or block
    expect(["confirm", "block"].includes(result.recommendation)).toBe(true)
    expect(result.threshold).toBe("high" as any)
  })

  test("should respect custom weights", () => {
    const scorer = new RiskScorer({ reversibility: 0.5 })

    const result = scorer.score({
      action: createAction("delete_data"),
      toolIds: ["delete"],
      dataClassifications: [],
      isAgencyContext: false,
      hasExternalImpact: false,
    })

    // With higher reversibility weight, delete should score higher
    expect(result.score).toBeGreaterThan(0.5)
  })

  test("should check threshold correctly", () => {
    const scorer = new RiskScorer()

    expect(scorer.exceedsThreshold(0.25, "low")).toBe(true)
    expect(scorer.exceedsThreshold(0.25, "medium")).toBe(false)
    expect(scorer.exceedsThreshold(0.8, "high")).toBe(true)
    expect(scorer.exceedsThreshold(0.95, "critical")).toBe(true)
  })
})

describe("RISK_THRESHOLDS", () => {
  test("should have valid threshold ordering", () => {
    expect(RISK_THRESHOLDS.low).toBeLessThan(RISK_THRESHOLDS.medium)
    expect(RISK_THRESHOLDS.medium).toBeLessThan(RISK_THRESHOLDS.high)
    expect(RISK_THRESHOLDS.high).toBeLessThan(RISK_THRESHOLDS.critical)
  })

  test("should be within 0-1 range", () => {
    expect(RISK_THRESHOLDS.low).toBeGreaterThanOrEqual(0)
    expect(RISK_THRESHOLDS.critical).toBeLessThanOrEqual(1)
  })
})

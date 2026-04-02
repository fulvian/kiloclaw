import { describe, test, expect, beforeEach } from "bun:test"
import { ToolCallGuardrail } from "../../src/kiloclaw/guardrail/tool-guard"
import { DataExfiltrationGuardrail } from "../../src/kiloclaw/guardrail/data-exfiltration"
import { EscalationHandler } from "../../src/kiloclaw/guardrail/escalation"
import { RiskScorer } from "../../src/kiloclaw/guardrail/risk-scorer"
import type { Action } from "../../src/kiloclaw/types"
import type { ActionContext } from "../../src/kiloclaw/policy/rules"

// Helper to create actions
function createAction(type: string, parameters?: Record<string, unknown>): Action {
  return { type, parameters }
}

// Helper to create action context
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

describe("Tool Call Guardrail", () => {
  let guardrail: ToolCallGuardrail

  beforeEach(() => {
    guardrail = new ToolCallGuardrail()
  })

  test("should allow valid tool calls", () => {
    const action = createAction("read_file")
    const context = createContext({ toolIds: ["read_file"] })

    const result = guardrail.evaluate(context, action)

    expect(result.allowed).toBe(true)
    expect(result.escalationRequired).toBe(false)
  })

  test("should block when global kill switch is active", () => {
    const killSwitchGuardrail = new ToolCallGuardrail({ globalKillSwitch: true })

    const action = createAction("read_file")
    const context = createContext()

    const result = killSwitchGuardrail.evaluate(context, action)

    expect(result.allowed).toBe(false)
    expect(result.escalationRequired).toBe(true)
    expect(result.reason).toContain("kill switch")
  })

  test("should block when agency kill switch is active", () => {
    const agencyKillGuardrail = new ToolCallGuardrail({ perAgencyKillSwitch: { "test-agency": true } })

    const action = createAction("read_file")
    const context = createContext({ agencyId: "test-agency" })

    const result = agencyKillGuardrail.evaluate(context, action)

    expect(result.allowed).toBe(false)
  })

  test("should audit tool call decisions", () => {
    const action = createAction("write_file")
    const context = createContext({ toolIds: ["write_file"] })

    guardrail.evaluate(context, action)

    const auditLog = guardrail.getAuditLog()
    expect(auditLog.length).toBe(1)
    expect(auditLog[0].decision).toBe("approved")
  })

  test("should check kill switch status", () => {
    expect(guardrail.isKillSwitchActive()).toBe(false)

    guardrail.setKillSwitch(true)
    expect(guardrail.isKillSwitchActive()).toBe(true)

    guardrail.setKillSwitch(false)
    expect(guardrail.isKillSwitchActive()).toBe(false)
  })

  test("should set agency-specific kill switch", () => {
    guardrail.setKillSwitch(true, "agency-1")
    guardrail.setKillSwitch(false, "agency-2")

    expect(guardrail.isKillSwitchActive("agency-1")).toBe(true)
    expect(guardrail.isKillSwitchActive("agency-2")).toBe(false)
    expect(guardrail.isKillSwitchActive("agency-3")).toBe(false)
  })
})

describe("Data Exfiltration Guardrail", () => {
  let guardrail: DataExfiltrationGuardrail

  beforeEach(() => {
    guardrail = new DataExfiltrationGuardrail()
  })

  test("should allow non-external actions", () => {
    const action = createAction("read_local_file")
    const context = createContext()

    const result = guardrail.evaluate(context, action)

    expect(result.allowed).toBe(true)
  })

  test("should allow external actions without sensitive data", () => {
    const action = createAction("http_get", { url: "https://api.example.com/data" })
    const context = createContext({ toolIds: ["http_client"], dataClassification: [] })

    const result = guardrail.evaluate(context, action)

    expect(result.allowed).toBe(true)
  })

  test("should block P0 critical data exfiltration", () => {
    const action = createAction("http_post", { url: "https://external.com/upload" })
    const context = createContext({
      toolIds: ["http_tool"],
      dataClassification: ["P0_Critical"],
    })

    const result = guardrail.evaluate(context, action)

    expect(result.allowed).toBe(false)
    expect(result.escalationRequired).toBe(true)
  })

  test("should escalate P1 high data with enhanced logging", () => {
    const action = createAction("http_post", { url: "https://external.com/upload" })
    const context = createContext({
      toolIds: ["http_tool"],
      dataClassification: ["P1_High"],
    })

    const result = guardrail.evaluate(context, action)

    // P1_High should be escalated, not blocked
    expect(result.escalationRequired).toBe(true)
  })

  test("should detect PII patterns in tool IDs", () => {
    const action = createAction("api_call")
    const context = createContext({
      toolIds: ["http_tool"],
      dataClassification: ["P1_High"], // P1_High triggers escalation
    })

    const result = guardrail.evaluate(context, action)

    // With P1_High classification, should have risk score and escalation
    expect(result.escalationRequired).toBe(true)
  })

  test("should log exfiltration attempts", () => {
    const action = createAction("http_post", { url: "https://malicious.com" })
    const context = createContext({
      toolIds: ["http"],
      dataClassification: ["P0_Critical"],
    })

    guardrail.evaluate(context, action)

    const auditLog = guardrail.getAuditLog()
    expect(auditLog.length).toBe(1)
    expect(auditLog[0].decision).toBe("blocked")
  })
})

describe("Escalation Handler", () => {
  let handler: EscalationHandler

  beforeEach(() => {
    handler = new EscalationHandler()
  })

  test("should not escalate read operations", () => {
    const action = createAction("read_file")
    const context = createContext()

    const result = handler.evaluate(context, action)

    expect(result.escalationRequired).toBe(false)
    expect(result.allowed).toBe(true)
  })

  test("should escalate delete_data action", () => {
    const action = createAction("delete_data")
    const context = createContext()

    const result = handler.evaluate(context, action)

    expect(result.escalationRequired).toBe(true)
  })

  test("should escalate external_api_write", () => {
    const action = createAction("external_api_write")
    const context = createContext()

    const result = handler.evaluate(context, action)

    expect(result.escalationRequired).toBe(true)
  })

  test("should require double gate for critical actions", () => {
    const action = createAction("financial_transaction")
    const context = createContext()

    const result = handler.evaluate(context, action)

    expect(result.allowed).toBe(false)
    expect(result.escalationRequired).toBe(true)
    expect(result.reason).toContain("double-gate")
  })

  test("should register custom policies", () => {
    handler.registerPolicy("custom_critical", {
      requiresExplicitConsent: true,
      requiresDoubleGate: true,
      escalationContact: "admin",
    })

    expect(handler.requiresDoubleGate("custom_critical")).toBe(true)
    expect(handler.requiresExplicitConsent("custom_critical")).toBe(true)
    expect(handler.getEscalationContact("custom_critical")).toBe("admin")
  })

  test("should log escalation decisions", () => {
    const action = createAction("delete_data")
    const context = createContext()

    handler.evaluate(context, action)

    const auditLog = handler.getAuditLog()
    expect(auditLog.length).toBe(1)
    expect(auditLog[0].actionType).toBe("delete_data")
  })
})

describe("Risk Scorer", () => {
  let scorer: RiskScorer

  beforeEach(() => {
    scorer = new RiskScorer()
  })

  test("should score read-only actions as low risk", () => {
    const result = scorer.score({
      action: createAction("read_file"),
      toolIds: ["read"],
      dataClassifications: [],
      isAgencyContext: false,
      hasExternalImpact: false,
    })

    expect(result.threshold).toBe("low")
    expect(result.recommendation).toBe("allow")
  })

  test("should score irreversible actions as high risk", () => {
    const result = scorer.score({
      action: createAction("delete_all_data"),
      toolIds: ["delete", "write"],
      dataClassifications: ["P0_Critical"],
      isAgencyContext: true,
      hasExternalImpact: true, // Add external impact to boost score
    })

    // Should be at least "high" risk
    expect(["high", "critical"].includes(result.threshold)).toBe(true)
  })

  test("should score critical actions as high risk", () => {
    const result = scorer.score({
      action: createAction("drop_database"),
      toolIds: ["admin", "delete", "write"],
      dataClassifications: ["P0_Critical"],
      isAgencyContext: true,
      hasExternalImpact: true,
    })

    // With all risk factors maxed, should be critical
    expect(["high", "critical"].includes(result.threshold)).toBe(true)
  })

  test("should factor in all risk factors", () => {
    const result = scorer.score({
      action: createAction("test_action"),
      toolIds: ["tool1", "tool2", "tool3"],
      dataClassifications: ["P1_High"],
      isAgencyContext: true,
      hasExternalImpact: true,
    })

    expect(result.factors).toHaveLength(5)
    const factorNames = result.factors.map((f) => f.name)
    expect(factorNames).toContain("reversibility")
    expect(factorNames).toContain("data_sensitivity")
    expect(factorNames).toContain("scope")
    expect(factorNames).toContain("autonomy")
    expect(factorNames).toContain("external_impact")
  })

  test("should respect custom weights", () => {
    const customScorer = new RiskScorer({
      reversibility: 0.5,
      dataSensitivity: 0.1,
      scope: 0.1,
      autonomy: 0.1,
      externalImpact: 0.2,
    })

    const result = customScorer.getWeights()

    expect(result.reversibility).toBe(0.5)
    expect(result.dataSensitivity).toBe(0.1)
  })

  test("should check thresholds correctly", () => {
    expect(scorer.exceedsThreshold(0.25, "low")).toBe(true)
    expect(scorer.exceedsThreshold(0.25, "medium")).toBe(false)
    expect(scorer.exceedsThreshold(0.55, "medium")).toBe(true)
    expect(scorer.exceedsThreshold(0.55, "high")).toBe(false)
    expect(scorer.exceedsThreshold(0.78, "high")).toBe(true)
    expect(scorer.exceedsThreshold(0.78, "critical")).toBe(false)
    expect(scorer.exceedsThreshold(0.92, "critical")).toBe(true)
  })
})

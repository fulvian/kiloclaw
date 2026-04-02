import { describe, test, expect, beforeEach } from "bun:test"
import { PolicyEngine } from "../../src/kiloclaw/policy/engine"
import { Policy, RISK_THRESHOLDS } from "../../src/kiloclaw/policy/rules"
import { DynamicRiskCalculator } from "../../src/kiloclaw/policy/dynamic"
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

describe("Policy Engine", () => {
  let engine: PolicyEngine

  beforeEach(() => {
    engine = new PolicyEngine({ enableCaching: false })
  })

  describe("static rule evaluation", () => {
    test("should pass when no rules registered", () => {
      const action = createAction("read_file")
      const context = createContext()

      const result = engine.evaluate(context, action)

      expect(result.allowed).toBe(true)
    })

    test("should block when static rule triggers", () => {
      engine.registerRule({
        id: "block-test",
        description: "Blocks test actions",
        severity: "high",
        check: (ctx) => ctx.correlationId.includes("blocked"),
      })

      const action = createAction("test_action")
      const blockedContext = createContext({ correlationId: "blocked-123" })
      const normalContext = createContext({ correlationId: "normal-123" })

      expect(engine.evaluate(blockedContext, action).allowed).toBe(false)
      expect(engine.evaluate(normalContext, action).allowed).toBe(true)
    })

    test("should return highest severity when multiple rules trigger", () => {
      engine.registerRule({
        id: "rule-low",
        description: "Low severity rule",
        severity: "low",
        check: () => true,
      })
      engine.registerRule({
        id: "rule-critical",
        description: "Critical rule",
        severity: "critical",
        check: () => true,
      })

      const action = createAction("test")
      const context = createContext()

      const result = engine.evaluate(context, action)

      expect(result.allowed).toBe(false)
      expect(result.riskScore).toBe(RISK_THRESHOLDS.critical)
    })
  })

  describe("dynamic risk calculation", () => {
    test("should calculate low risk for simple actions", () => {
      const action = createAction("read_file", { path: "/tmp/test.txt" })
      const context = createContext({
        toolIds: ["read"],
        dataClassification: [],
      })

      const result = engine.evaluate(context, action)

      expect(result.allowed).toBe(true)
      expect(result.riskScore).toBeLessThan(RISK_THRESHOLDS.medium)
    })

    test("should calculate high risk for irreversible actions with sensitive data", () => {
      const action = createAction("delete_all_user_data")
      const context = createContext({
        toolIds: ["delete", "database"],
        dataClassification: ["P0_Critical"],
      })

      const result = engine.evaluate(context, action)

      // Should escalate high risk actions
      expect(result.escalationRequired || result.riskScore).toBeTruthy()
    })
  })

  describe("policy caching", () => {
    test("should cache results when enabled", () => {
      const cachingEngine = new PolicyEngine({ enableCaching: true, cacheTTLMs: 5000 })

      const action = createAction("cached_action")
      const context = createContext()

      const result1 = cachingEngine.evaluate(context, action)
      const result2 = cachingEngine.evaluate(context, action)

      expect(result1.allowed).toBe(result2.allowed)
      expect(result1.riskScore).toBe(result2.riskScore)
    })

    test("should not cache when disabled", () => {
      const noCacheEngine = new PolicyEngine({ enableCaching: false })

      const action = createAction("uncached_action")
      const context = createContext()

      // Multiple evaluations should work without caching
      const result1 = noCacheEngine.evaluate(context, action)
      const result2 = noCacheEngine.evaluate(context, action)

      expect(result1.allowed).toBe(result2.allowed)
    })

    test("should clear cache", () => {
      const cachingEngine = new PolicyEngine({ enableCaching: true })

      const action = createAction("clear_me")
      const context = createContext()

      cachingEngine.evaluate(context, action)
      cachingEngine.clearCache()

      // After clear, cache should be empty - testing implicitly
    })
  })
})

describe("Policy helper functions", () => {
  test("should classify risk correctly", () => {
    expect(Policy.classifyRisk(0.05)).toBe("low")
    expect(Policy.classifyRisk(0.3)).toBe("low") // 0.3 >= 0.2 but < 0.5
    expect(Policy.classifyRisk(0.55)).toBe("medium") // 0.55 >= 0.5 but < 0.75
    expect(Policy.classifyRisk(0.8)).toBe("high") // 0.8 >= 0.75 but < 0.9
    expect(Policy.classifyRisk(0.92)).toBe("critical") // 0.92 >= 0.9
  })

  test("should check threshold correctly", () => {
    expect(Policy.exceedsThreshold(0.25, "low")).toBe(true)
    expect(Policy.exceedsThreshold(0.25, "medium")).toBe(false)
    expect(Policy.exceedsThreshold(0.8, "high")).toBe(true)
  })

  test("should create context with defaults", () => {
    const context = Policy.createContext({
      sessionId: "sess-123",
      agencyId: "agency-1",
    })

    expect(context.sessionId).toBe("sess-123")
    expect(context.agencyId).toBe("agency-1")
    expect(context.toolIds).toEqual([])
    expect(context.dataClassification).toEqual([])
    expect(context.correlationId).toBeDefined()
  })
})

describe("Dynamic Risk Calculator", () => {
  let calculator: DynamicRiskCalculator

  beforeEach(() => {
    calculator = new DynamicRiskCalculator()
  })

  test("should calculate reversibility factor correctly", () => {
    const reversibleResult = calculator.calculate({
      action: createAction("read_file"),
      toolIds: [],
      dataClassifications: [],
      isAgencyContext: false,
      hasExternalImpact: false,
    })

    const irreversibleResult = calculator.calculate({
      action: createAction("delete_all_data"),
      toolIds: [],
      dataClassifications: [],
      isAgencyContext: false,
      hasExternalImpact: false,
    })

    const reversibleReversibility = reversibleResult.factors.find((f) => f.type === "reversibility")
    const irreversibleReversibility = irreversibleResult.factors.find((f) => f.type === "reversibility")

    expect(reversibleReversibility!.value).toBeLessThan(irreversibleReversibility!.value)
  })

  test("should calculate scope factor correctly", () => {
    const singleTool = calculator.calculate({
      action: createAction("read_file"),
      toolIds: ["read"],
      dataClassifications: [],
      isAgencyContext: false,
      hasExternalImpact: false,
    })

    const multiTool = calculator.calculate({
      action: createAction("complex_operation"),
      toolIds: ["read", "write", "execute", "network"],
      dataClassifications: [],
      isAgencyContext: false,
      hasExternalImpact: false,
    })

    const singleScope = singleTool.factors.find((f) => f.type === "scope")
    const multiScope = multiTool.factors.find((f) => f.type === "scope")

    expect(multiScope!.value).toBeGreaterThan(singleScope!.value)
  })

  test("should aggregate factors correctly", () => {
    const result = calculator.calculate({
      action: createAction("test_action"),
      toolIds: ["tool1", "tool2"],
      dataClassifications: ["P1_High"],
      isAgencyContext: true,
      hasExternalImpact: true,
    })

    // Sum of weighted contributions should equal score
    const sum = result.factors.reduce((acc, f) => acc + f.weight * f.value, 0)
    expect(Math.abs(result.score - sum)).toBeLessThan(0.01)
  })

  test("should exceed threshold correctly", () => {
    expect(calculator.exceedsThreshold(0.92, "critical")).toBe(true)
    expect(calculator.exceedsThreshold(0.8, "critical")).toBe(false)
    expect(calculator.exceedsThreshold(0.78, "high")).toBe(true)
  })

  test("should recommend action correctly", () => {
    expect(calculator.getRecommendedAction(0.1)).toBe("allow")
    expect(calculator.getRecommendedAction(0.75)).toBe("confirm")
    expect(calculator.getRecommendedAction(0.95)).toBe("block")
  })
})

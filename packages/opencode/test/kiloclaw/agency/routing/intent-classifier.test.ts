import { test, expect, describe } from "bun:test"
import { IntentClassifier } from "../../../../src/kiloclaw/agency/routing/intent-classifier"
import { migrateLegacyTaskType } from "../../../../src/kiloclaw/agency/routing/types"

describe("IntentClassifier", () => {
  describe("classify", () => {
    test("given legacy task type string when classify then migrates to TaskIntent", () => {
      const result = IntentClassifier.classify("web-search")

      expect(result.intent).toBe("search")
      expect(result.parameters.capabilities).toEqual(["search", "web"])
    })

    test("given unknown legacy task type when classify then uses raw intent", () => {
      const result = IntentClassifier.classify("custom-unknown-task")

      expect(result.intent).toBe("custom-unknown-task")
    })

    test("given natural language when classify then extracts capabilities", () => {
      const result = IntentClassifier.classify("I need to search the web and analyze the results")

      expect(result.intent).toBe("i")
      expect(result.parameters.capabilities).toContain("search")
      expect(result.parameters.capabilities).toContain("analyze")
    })

    test("given TaskIntent object when classify then returns valid TaskIntent", () => {
      const input = {
        intent: "test",
        parameters: { capabilities: ["test"] },
        context: { urgency: "high" as const },
      }

      const result = IntentClassifier.classify(input)

      expect(result.intent).toBe("test")
      expect(result.parameters.capabilities).toEqual(["test"])
      expect(result.context.urgency).toBe("high")
    })

    test("given simple string when classify then creates TaskIntent with first word as intent", () => {
      const result = IntentClassifier.classify("Hello world")

      expect(result.intent).toBe("hello")
      expect(result.parameters.originalInput).toBe("Hello world")
    })
  })

  describe("extractCapabilities", () => {
    test("given legacy task type string when extractCapabilities then returns mapped capabilities", () => {
      const caps = IntentClassifier.extractCapabilities("web-search")

      expect(caps).toEqual(["search", "web"])
    })

    test("given unknown legacy task type when extractCapabilities then returns empty array", () => {
      const caps = IntentClassifier.extractCapabilities("custom-unknown-task")

      expect(caps).toEqual([])
    })

    test("given natural language when extractCapabilities then extracts capabilities", () => {
      const caps = IntentClassifier.extractCapabilities("I need to search the web and analyze the results")

      expect(caps).toContain("search")
      expect(caps).toContain("web")
      expect(caps).toContain("analyze")
    })

    test("given italian typo search text when extractCapabilities then detects search", () => {
      const caps = IntentClassifier.extractCapabilities("ricrca annunci macbook pro usato")

      expect(caps).toContain("search")
    })

    test("given TaskIntent with capabilities when extractCapabilities then returns capabilities", () => {
      const input = {
        intent: "test",
        parameters: { capabilities: ["coding", "debugging"] },
        context: { urgency: "medium" as const },
      }

      const caps = IntentClassifier.extractCapabilities(input)

      expect(caps).toEqual(["coding", "debugging"])
    })

    test("given natural language with no known keywords when extractCapabilities then returns empty", () => {
      const caps = IntentClassifier.extractCapabilities("do something random")

      expect(caps).toEqual([])
    })
  })

  describe("isLegacyTaskTypeInput", () => {
    test("given legacy task type string when isLegacyTaskTypeInput then returns true", () => {
      expect(IntentClassifier.isLegacyTaskTypeInput("web-search")).toBe(true)
      expect(IntentClassifier.isLegacyTaskTypeInput("code-review")).toBe(true)
      expect(IntentClassifier.isLegacyTaskTypeInput("debugging")).toBe(true)
    })

    test("given natural language when isLegacyTaskTypeInput then returns false", () => {
      expect(IntentClassifier.isLegacyTaskTypeInput("search the web")).toBe(false)
      expect(IntentClassifier.isLegacyTaskTypeInput("I need help with coding")).toBe(false)
    })

    test("given non-string when isLegacyTaskTypeInput then returns false", () => {
      expect(IntentClassifier.isLegacyTaskTypeInput(123)).toBe(false)
      expect(IntentClassifier.isLegacyTaskTypeInput(null)).toBe(false)
      expect(IntentClassifier.isLegacyTaskTypeInput({})).toBe(false)
    })
  })

  describe("migrateLegacy", () => {
    test("given legacy task type when migrateLegacy then returns migrated TaskIntent", () => {
      const result = IntentClassifier.migrateLegacy("academic-research")

      expect(result.intent).toBe("research")
      expect(result.parameters.capabilities).toEqual(["academic", "search"])
    })

    test("given unknown task type when migrateLegacy then returns TaskIntent with raw intent", () => {
      const result = IntentClassifier.migrateLegacy("some-random-task")

      expect(result.intent).toBe("some-random-task")
    })
  })

  describe("getCapabilityKeywords", () => {
    test("getCapabilityKeywords returns keyword mapping", () => {
      const keywords = IntentClassifier.getCapabilityKeywords()

      expect(keywords.search).toBeDefined()
      expect(keywords.search).toContain("search")
      expect(keywords.analyze).toBeDefined()
      expect(keywords.analyze).toContain("analyze")
    })
  })
})

describe("migrateLegacyTaskType (from routing/types)", () => {
  test("maps web-search to search intent with search and web capabilities", () => {
    const result = migrateLegacyTaskType("web-search")

    expect(result.intent).toBe("search")
    expect(result.parameters.capabilities).toEqual(["search", "web"])
  })

  test("maps code-generation to generate intent with code-generation and coding capabilities", () => {
    const result = migrateLegacyTaskType("code-generation")

    expect(result.intent).toBe("generate")
    expect(result.parameters.capabilities).toEqual(["code-generation", "coding"])
  })

  test("maps debugging to debug intent with debugging and diagnosis capabilities", () => {
    const result = migrateLegacyTaskType("debugging")

    expect(result.intent).toBe("debug")
    expect(result.parameters.capabilities).toEqual(["debugging", "diagnosis"])
  })

  test("maps unknown task type to raw intent with no capabilities", () => {
    const result = migrateLegacyTaskType("custom-unknown-task")

    expect(result.intent).toBe("custom-unknown-task")
  })
})

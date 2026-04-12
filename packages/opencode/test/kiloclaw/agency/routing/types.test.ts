// Routing Types Tests - Phase 1: Flexible Agency Architecture

import { describe, it, expect } from "bun:test"
import { TaskIntentSchema, RouteResultSchema, migrateLegacyTaskType } from "@/kiloclaw/agency/routing/types"

describe("TaskIntentSchema", () => {
  describe("validation", () => {
    it("should validate a valid intent with minimal fields", () => {
      const input = { intent: "search", parameters: { query: "test" }, context: {} }
      const result = TaskIntentSchema.parse(input)
      expect(result.intent).toBe("search")
      expect(result.parameters).toEqual({ query: "test" })
    })

    it("should validate intent with all context fields", () => {
      const input = {
        intent: "analyze",
        parameters: { data: "test" },
        context: {
          domain: "knowledge",
          urgency: "high" as const,
          preferences: { lang: "en" },
          correlationId: "corr-123",
        },
      }
      const result = TaskIntentSchema.parse(input)
      expect(result.intent).toBe("analyze")
      expect(result.context.domain).toBe("knowledge")
      expect(result.context.urgency).toBe("high")
      expect(result.context.preferences).toEqual({ lang: "en" })
      expect(result.context.correlationId).toBe("corr-123")
    })

    it("should throw on empty intent string", () => {
      const input = { intent: "", context: {} }
      expect(() => TaskIntentSchema.parse(input)).toThrow()
    })

    it("should apply default values for context", () => {
      const input = { intent: "test", context: {} }
      const result = TaskIntentSchema.parse(input)
      expect(result.context.urgency).toBe("medium")
      expect(result.context.domain).toBeUndefined()
    })

    it("should accept any string as intent (flexible)", () => {
      const flexibleIntents = ["search", "custom-action", "analyze", "123", "hello-world"]
      for (const intent of flexibleIntents) {
        const result = TaskIntentSchema.parse({ intent, context: {} })
        expect(result.intent).toBe(intent)
      }
    })
  })
})

describe("RouteResultSchema", () => {
  describe("validation", () => {
    it("should validate skill type result", () => {
      const input = {
        type: "skill" as const,
        skill: "web-search",
        confidence: 0.95,
        reason: "Exact capability match",
      }
      const result = RouteResultSchema.parse(input)
      expect(result.type).toBe("skill")
      expect(result.skill).toBe("web-search")
      expect(result.confidence).toBe(0.95)
    })

    it("should validate chain type result", () => {
      const input = {
        type: "chain" as const,
        chain: "search-analyze-chain",
        confidence: 0.85,
      }
      const result = RouteResultSchema.parse(input)
      expect(result.type).toBe("chain")
      expect(result.chain).toBe("search-analyze-chain")
    })

    it("should validate agent type result", () => {
      const input = {
        type: "agent" as const,
        agent: "coder-agent",
        confidence: 0.75,
      }
      const result = RouteResultSchema.parse(input)
      expect(result.type).toBe("agent")
      expect(result.agent).toBe("coder-agent")
    })

    it("should throw on invalid type value", () => {
      const input = { type: "unknown", skill: "test", confidence: 1 }
      expect(() => RouteResultSchema.parse(input)).toThrow()
    })

    it("should throw on confidence > 1", () => {
      const input = { type: "skill", skill: "test", confidence: 1.5 }
      expect(() => RouteResultSchema.parse(input)).toThrow()
    })

    it("should throw on confidence < 0", () => {
      const input = { type: "skill", skill: "test", confidence: -0.1 }
      expect(() => RouteResultSchema.parse(input)).toThrow()
    })

    it("should accept confidence of 0", () => {
      const input = { type: "skill", skill: "test", confidence: 0 }
      const result = RouteResultSchema.parse(input)
      expect(result.confidence).toBe(0)
    })

    it("should accept confidence of 1", () => {
      const input = { type: "skill", skill: "test", confidence: 1 }
      const result = RouteResultSchema.parse(input)
      expect(result.confidence).toBe(1)
    })
  })
})

describe("migrateLegacyTaskType", () => {
  it("should migrate web-search", () => {
    const result = migrateLegacyTaskType("web-search")
    expect(result.intent).toBe("search")
    expect(result.parameters.capabilities).toEqual(["search", "web"])
  })

  it("should migrate academic-research", () => {
    const result = migrateLegacyTaskType("academic-research")
    expect(result.intent).toBe("research")
    expect(result.parameters.capabilities).toEqual(["academic", "search"])
  })

  it("should migrate fact-checking", () => {
    const result = migrateLegacyTaskType("fact-checking")
    expect(result.intent).toBe("verify")
    expect(result.parameters.capabilities).toEqual(["fact-checking", "verification"])
  })

  it("should migrate code-generation", () => {
    const result = migrateLegacyTaskType("code-generation")
    expect(result.intent).toBe("generate")
    expect(result.parameters.capabilities).toEqual(["code-generation", "coding"])
  })

  it("should migrate code-review", () => {
    const result = migrateLegacyTaskType("code-review")
    expect(result.intent).toBe("review")
    expect(result.parameters.capabilities).toEqual(["code-review", "analysis"])
  })

  it("should migrate debugging", () => {
    const result = migrateLegacyTaskType("debugging")
    expect(result.intent).toBe("debug")
    expect(result.parameters.capabilities).toEqual(["debugging", "diagnosis"])
  })

  it("should migrate unknown task type to raw intent", () => {
    const result = migrateLegacyTaskType("custom-unknown-task")
    expect(result.intent).toBe("custom-unknown-task")
    expect(result.parameters).toEqual({})
  })

  it("should throw on empty string task type", () => {
    expect(() => migrateLegacyTaskType("")).toThrow()
  })
})

import { describe, it, expect, beforeEach } from "bun:test"
import {
  // Development Skills
  CodeReviewSkill,
  DebuggingSkill,
  TddSkill,
  ComparisonSkill,
  DocumentAnalysisSkill,
  SimplificationSkill,
  // Knowledge Skills
  WebResearchSkill,
  LiteratureReviewSkill,
  FactCheckSkill,
  SynthesisSkill,
  CriticalAnalysisSkill,
  // Aggregates
  developmentSkills,
  knowledgeSkills,
  allWave1Skills,
  DEVELOPMENT_SKILL_COUNT,
  KNOWLEDGE_SKILL_COUNT,
  TOTAL_WAVE1_SKILL_COUNT,
} from "@/kiloclaw/skills"

// Test fixtures
const CORRELATION_ID = "test-correlation-001"
const AGENCY_ID = "agency-test"
const SKILL_CONTEXT = {
  correlationId: CORRELATION_ID as import("@/kiloclaw/types").CorrelationId,
  agencyId: AGENCY_ID,
  skillId: "test-skill",
}

// Development agency tests
describe("WP4.3 Wave 1: Development Agency Skills", () => {
  describe("code-review skill", () => {
    it("should have correct metadata", () => {
      expect(CodeReviewSkill.id).toBe("code-review")
      expect(CodeReviewSkill.version).toEqual("1.0.0")
      expect(CodeReviewSkill.name).toBe("Code Review")
      expect(CodeReviewSkill.capabilities).toContain("code_analysis")
      expect(CodeReviewSkill.capabilities).toContain("style_check")
      expect(CodeReviewSkill.capabilities).toContain("best_practices")
      expect(CodeReviewSkill.tags).toContain("development")
    })

    it("should execute code review with issues", async () => {
      const result = await CodeReviewSkill.execute(
        { code: "function test() { var x = 1; console.log(x); }", language: "javascript" },
        SKILL_CONTEXT,
      )
      expect(result).toHaveProperty("issues")
      expect(result).toHaveProperty("score")
      expect(typeof result.score).toBe("number")
      expect(result.score).toBeLessThanOrEqual(1)
      expect(result.score).toBeGreaterThanOrEqual(0)
    })

    it("should return perfect score for clean code", async () => {
      const result = await CodeReviewSkill.execute(
        { code: "const add = (a, b) => a + b;", language: "javascript" },
        SKILL_CONTEXT,
      )
      expect(result.score).toBeGreaterThan(0.5)
    })

    it("should handle empty code", async () => {
      const result = await CodeReviewSkill.execute({ code: "", language: "javascript" }, SKILL_CONTEXT)
      expect(result.issues).toHaveLength(0)
      expect(result.score).toBe(1.0)
    })

    it("should detect var keyword issues", async () => {
      const result = await CodeReviewSkill.execute({ code: "var x = 1;", language: "javascript" }, SKILL_CONTEXT)
      expect(result.issues.some((i) => i.rule === "no-var")).toBe(true)
    })
  })

  describe("debugging skill", () => {
    it("should have correct metadata", () => {
      expect(DebuggingSkill.id).toBe("debugging")
      expect(DebuggingSkill.version).toEqual("1.0.0")
      expect(DebuggingSkill.name).toBe("Debugging")
      expect(DebuggingSkill.capabilities).toContain("bug_detection")
      expect(DebuggingSkill.capabilities).toContain("root_cause")
    })

    it("should diagnose undefined function error", async () => {
      const result = await DebuggingSkill.execute(
        { code: "foo()", error: "TypeError: undefined is not a function" },
        SKILL_CONTEXT,
      )
      expect(result).toHaveProperty("diagnosis")
      expect(result).toHaveProperty("steps")
      expect(Array.isArray(result.steps)).toBe(true)
      expect(result.steps.length).toBeGreaterThan(0)
    })

    it("should diagnose null reference error", async () => {
      const result = await DebuggingSkill.execute(
        { code: "obj.prop", error: "TypeError: Cannot read property 'prop' of null" },
        SKILL_CONTEXT,
      )
      expect(result.diagnosis).toContain("Null or Undefined Reference")
    })

    it("should provide steps for resolution", async () => {
      const result = await DebuggingSkill.execute(
        { code: "x.y.z", error: "Cannot read property 'z' of undefined" },
        SKILL_CONTEXT,
      )
      expect(result.steps).toBeDefined()
      expect(result.steps.length).toBeGreaterThan(0)
      expect(result.suggestedFix).toBeDefined()
    })

    it("should handle empty code", async () => {
      const result = await DebuggingSkill.execute({ code: "", error: "" }, SKILL_CONTEXT)
      expect(result.diagnosis).toBeDefined()
      expect(result.steps).toBeDefined()
    })
  })

  describe("tdd skill", () => {
    it("should have correct metadata", () => {
      expect(TddSkill.id).toBe("tdd")
      expect(TddSkill.version).toEqual("1.0.0")
      expect(TddSkill.name).toBe("Test-Driven Development")
      expect(TddSkill.capabilities).toContain("test_generation")
      expect(TddSkill.capabilities).toContain("test_execution")
    })

    it("should generate test cases", async () => {
      const result = await TddSkill.execute(
        { code: "function add(a, b) { return a + b; }", framework: "jest" },
        SKILL_CONTEXT,
      )
      expect(result).toHaveProperty("tests")
      expect(Array.isArray(result.tests)).toBe(true)
      expect(result.passed).toBe(true)
    })

    it("should generate multiple test cases", async () => {
      const result = await TddSkill.execute(
        { code: "class Calculator { add(a, b) { return a + b; } }", framework: "jest" },
        SKILL_CONTEXT,
      )
      expect(result.tests.length).toBeGreaterThan(1)
    })

    it("should handle different frameworks", async () => {
      const jestResult = await TddSkill.execute({ code: "const fn = () => {}", framework: "jest" }, SKILL_CONTEXT)
      const mochaResult = await TddSkill.execute({ code: "const fn = () => {}", framework: "mocha" }, SKILL_CONTEXT)
      expect(jestResult.tests.length).toBeGreaterThan(0)
      expect(mochaResult.tests.length).toBeGreaterThan(0)
    })

    it("should handle empty code", async () => {
      const result = await TddSkill.execute({ code: "", framework: "jest" }, SKILL_CONTEXT)
      expect(result.passed).toBe(false)
      expect(result.tests).toHaveLength(0)
    })
  })

  describe("comparison skill", () => {
    it("should have correct metadata", () => {
      expect(ComparisonSkill.id).toBe("comparison")
      expect(ComparisonSkill.version).toEqual("1.0.0")
      expect(ComparisonSkill.name).toBe("Code Comparison")
      expect(ComparisonSkill.capabilities).toContain("diff_analysis")
      expect(ComparisonSkill.capabilities).toContain("conflict_resolution")
    })

    it("should detect additions", async () => {
      const result = await ComparisonSkill.execute(
        { before: "const a = 1;", after: "const a = 1;\nconst b = 2;" },
        SKILL_CONTEXT,
      )
      expect(result.summary.additions).toBeGreaterThan(0)
    })

    it("should detect deletions", async () => {
      const result = await ComparisonSkill.execute(
        { before: "const a = 1;\nconst b = 2;", after: "const a = 1;" },
        SKILL_CONTEXT,
      )
      expect(result.summary.deletions).toBeGreaterThan(0)
    })

    it("should detect modifications", async () => {
      const result = await ComparisonSkill.execute({ before: "const a = 1;", after: "const a = 2;" }, SKILL_CONTEXT)
      expect(result.summary.modifications).toBeGreaterThan(0)
    })

    it("should return empty diff for identical content", async () => {
      const result = await ComparisonSkill.execute({ before: "const x = 1;", after: "const x = 1;" }, SKILL_CONTEXT)
      expect(result.summary.additions).toBe(0)
      expect(result.summary.deletions).toBe(0)
      expect(result.summary.modifications).toBe(0)
    })

    it("should handle empty inputs", async () => {
      const result = await ComparisonSkill.execute({ before: "", after: "" }, SKILL_CONTEXT)
      expect(result.diff).toHaveLength(0)
      expect(result.conflicts).toHaveLength(0)
    })
  })

  describe("document-analysis skill", () => {
    it("should have correct metadata", () => {
      expect(DocumentAnalysisSkill.id).toBe("document-analysis")
      expect(DocumentAnalysisSkill.version).toEqual("1.0.0")
      expect(DocumentAnalysisSkill.name).toBe("Document Analysis")
      expect(DocumentAnalysisSkill.capabilities).toContain("parsing")
      expect(DocumentAnalysisSkill.capabilities).toContain("extraction")
    })

    it("should parse markdown sections", async () => {
      const result = await DocumentAnalysisSkill.execute(
        {
          content: "# Title\n\n## Section 1\n\nContent 1\n\n## Section 2\n\nContent 2",
          format: "markdown",
        },
        SKILL_CONTEXT,
      )
      expect(result.sections.length).toBeGreaterThanOrEqual(2)
      expect(result.summary).toContain("section")
    })

    it("should extract metadata", async () => {
      const result = await DocumentAnalysisSkill.execute(
        {
          content: "# Title\n\nSome content here\n\n```javascript\nconst x = 1;\n```",
          format: "markdown",
        },
        SKILL_CONTEXT,
      )
      expect(result.metadata).toBeDefined()
      expect(result.metadata?.hasCodeBlocks).toBe(true)
      expect(result.metadata?.wordCount).toBeGreaterThan(0)
    })

    it("should handle plain text", async () => {
      const result = await DocumentAnalysisSkill.execute(
        { content: "Plain text without markdown", format: "txt" },
        SKILL_CONTEXT,
      )
      expect(result.sections).toBeDefined()
      expect(result.summary).toBeDefined()
    })

    it("should handle empty content", async () => {
      const result = await DocumentAnalysisSkill.execute({ content: "", format: "markdown" }, SKILL_CONTEXT)
      expect(result.sections).toHaveLength(0)
    })
  })

  describe("simplification skill", () => {
    it("should have correct metadata", () => {
      expect(SimplificationSkill.id).toBe("simplification")
      expect(SimplificationSkill.version).toEqual("1.0.0")
      expect(SimplificationSkill.name).toBe("Code Simplification")
      expect(SimplificationSkill.capabilities).toContain("complexity_analysis")
      expect(SimplificationSkill.capabilities).toContain("refactoring")
    })

    it("should calculate complexity metrics", async () => {
      const result = await SimplificationSkill.execute(
        { code: "function test() { if (x) { while (y) { z++; } } }" },
        SKILL_CONTEXT,
      )
      expect(result.metrics).toHaveProperty("cyclomaticComplexity")
      expect(result.metrics).toHaveProperty("cognitiveComplexity")
      expect(result.metrics).toHaveProperty("linesOfCode")
      expect(result.metrics.cyclomaticComplexity).toBeGreaterThan(1)
    })

    it("should detect high complexity", async () => {
      const result = await SimplificationSkill.execute(
        { code: "function complex() { if (a) { if (b) { if (c) { if (d) { if (e) { x++; } } } } } }" },
        SKILL_CONTEXT,
      )
      expect(result.metrics.cyclomaticComplexity).toBeGreaterThan(5)
      expect(result.suggestions.some((s) => s.includes("complexity"))).toBe(true)
    })

    it("should suggest improvements", async () => {
      const result = await SimplificationSkill.execute({ code: "var x = 1;" }, SKILL_CONTEXT)
      expect(result.suggestions.length).toBeGreaterThan(0)
      expect(result.suggestions.some((s) => s.includes("const"))).toBe(true)
    })

    it("should handle empty code", async () => {
      const result = await SimplificationSkill.execute({ code: "" }, SKILL_CONTEXT)
      expect(result.metrics.linesOfCode).toBe(0)
      expect(result.simplified).toBe("")
    })
  })
})

// Knowledge agency tests
describe("WP4.3 Wave 1: Knowledge Agency Skills", () => {
  describe("web-research skill", () => {
    it("should have correct metadata", () => {
      expect(WebResearchSkill.id).toBe("web-research")
      expect(WebResearchSkill.version).toEqual("1.0.0")
      expect(WebResearchSkill.name).toBe("Web Research")
      expect(WebResearchSkill.capabilities).toContain("search")
      expect(WebResearchSkill.capabilities).toContain("synthesis")
    })

    it("should perform web search", async () => {
      const result = await WebResearchSkill.execute({ query: "typescript best practices", sources: 3 }, SKILL_CONTEXT)
      expect(result).toHaveProperty("results")
      expect(Array.isArray(result.results)).toBe(true)
      expect(result.query).toBe("typescript best practices")
      expect(result.sourcesCount).toBeLessThanOrEqual(3)
    })

    it("should respect source limit", async () => {
      const result = await WebResearchSkill.execute({ query: "javascript", sources: 2 }, SKILL_CONTEXT)
      expect(result.results.length).toBeLessThanOrEqual(2)
    })

    it("should generate summary", async () => {
      const result = await WebResearchSkill.execute({ query: "react hooks", sources: 5 }, SKILL_CONTEXT)
      expect(result.summary).toContain("react hooks")
      expect(result.summary).toContain("source")
    })

    it("should handle empty query", async () => {
      const result = await WebResearchSkill.execute({ query: "", sources: 5 }, SKILL_CONTEXT)
      expect(result.results).toHaveLength(0)
    })
  })

  describe("literature-review skill", () => {
    it("should have correct metadata", () => {
      expect(LiteratureReviewSkill.id).toBe("literature-review")
      expect(LiteratureReviewSkill.version).toEqual("1.0.0")
      expect(LiteratureReviewSkill.name).toBe("Literature Review")
      expect(LiteratureReviewSkill.capabilities).toContain("paper_search")
      expect(LiteratureReviewSkill.capabilities).toContain("summarization")
    })

    it("should search academic papers", async () => {
      const result = await LiteratureReviewSkill.execute({ topic: "machine learning", count: 3 }, SKILL_CONTEXT)
      expect(result).toHaveProperty("papers")
      expect(Array.isArray(result.papers)).toBe(true)
      expect(result.totalFound).toBeGreaterThan(0)
    })

    it("should return paper metadata", async () => {
      const result = await LiteratureReviewSkill.execute({ topic: "neural networks", count: 2 }, SKILL_CONTEXT)
      for (const paper of result.papers) {
        expect(paper).toHaveProperty("title")
        expect(paper).toHaveProperty("authors")
        expect(paper).toHaveProperty("abstract")
        expect(paper).toHaveProperty("year")
      }
    })

    it("should generate summary", async () => {
      const result = await LiteratureReviewSkill.execute({ topic: "deep learning", count: 5 }, SKILL_CONTEXT)
      expect(result.summary).toContain("deep learning")
      expect(result.summary).toContain("paper")
    })

    it("should respect count limit", async () => {
      const result = await LiteratureReviewSkill.execute({ topic: "ai", count: 2 }, SKILL_CONTEXT)
      expect(result.papers.length).toBeLessThanOrEqual(2)
    })
  })

  describe("fact-check skill", () => {
    it("should have correct metadata", () => {
      expect(FactCheckSkill.id).toBe("fact-check")
      expect(FactCheckSkill.version).toEqual("1.0.0")
      expect(FactCheckSkill.name).toBe("Fact Check")
      expect(FactCheckSkill.capabilities).toContain("verification")
      expect(FactCheckSkill.capabilities).toContain("cross_reference")
    })

    it("should verify known true claim", async () => {
      const result = await FactCheckSkill.execute({ claim: "The earth is round" }, SKILL_CONTEXT)
      expect(result.verified).toBe(true)
      expect(result.confidence).toBeGreaterThan(0.9)
      expect(result.verdict).toBeDefined()
    })

    it("should verify known false claim", async () => {
      const result = await FactCheckSkill.execute({ claim: "The earth is flat" }, SKILL_CONTEXT)
      expect(result.verified).toBe(false)
      expect(result.sources.length).toBeGreaterThan(0)
    })

    it("should return sources", async () => {
      const result = await FactCheckSkill.execute({ claim: "The earth is round" }, SKILL_CONTEXT)
      expect(result.sources.length).toBeGreaterThan(0)
      expect(result.sources[0]).toHaveProperty("name")
      expect(result.sources[0]).toHaveProperty("url")
      expect(result.sources[0]).toHaveProperty("credibility")
    })

    it("should provide explanation", async () => {
      const result = await FactCheckSkill.execute({ claim: "The earth is round" }, SKILL_CONTEXT)
      expect(result.explanation).toBeDefined()
    })

    it("should handle empty claim", async () => {
      const result = await FactCheckSkill.execute({ claim: "" }, SKILL_CONTEXT)
      expect(result.confidence).toBe(0)
    })
  })

  describe("synthesis skill", () => {
    it("should have correct metadata", () => {
      expect(SynthesisSkill.id).toBe("synthesis")
      expect(SynthesisSkill.version).toEqual("1.0.0")
      expect(SynthesisSkill.name).toBe("Knowledge Synthesis")
      expect(SynthesisSkill.capabilities).toContain("multi_doc")
      expect(SynthesisSkill.capabilities).toContain("insight_extraction")
    })

    it("should synthesize multiple documents", async () => {
      const result = await SynthesisSkill.execute(
        {
          documents: [
            { id: "1", title: "Doc 1", content: "This document discusses performance and scalability." },
            { id: "2", title: "Doc 2", content: "Another document about performance and security." },
          ],
        },
        SKILL_CONTEXT,
      )
      expect(result.synthesis).toBeDefined()
      expect(result.insights).toBeDefined()
      expect(Array.isArray(result.insights)).toBe(true)
    })

    it("should extract key themes", async () => {
      const result = await SynthesisSkill.execute(
        {
          documents: [
            { id: "1", title: "Doc 1", content: "Security is important. Performance matters." },
            { id: "2", title: "Doc 2", content: "Security and performance are key." },
            { id: "3", title: "Doc 3", content: "Security, performance, usability." },
          ],
        },
        SKILL_CONTEXT,
      )
      expect(result.keyThemes).toContain("security")
      expect(result.keyThemes).toContain("performance")
    })

    it("should provide source references", async () => {
      const result = await SynthesisSkill.execute(
        {
          documents: [
            { id: "doc1", title: "First Document", content: "Content here" },
            { id: "doc2", title: "Second Document", content: "More content" },
          ],
        },
        SKILL_CONTEXT,
      )
      expect(result.sourceReferences.length).toBe(2)
      expect(result.sourceReferences[0].id).toBe("doc1")
    })

    it("should handle single document", async () => {
      const result = await SynthesisSkill.execute(
        {
          documents: [{ id: "1", title: "Single Doc", content: "Only one document provided" }],
        },
        SKILL_CONTEXT,
      )
      expect(result.synthesis).toBeDefined()
      expect(result.confidence).toBeDefined()
    })

    it("should handle empty documents", async () => {
      const result = await SynthesisSkill.execute({ documents: [] }, SKILL_CONTEXT)
      expect(result.confidence).toBe(0)
      expect(result.insights[0]).toContain("No documents")
    })
  })

  describe("critical-analysis skill", () => {
    it("should have correct metadata", () => {
      expect(CriticalAnalysisSkill.id).toBe("critical-analysis")
      expect(CriticalAnalysisSkill.version).toEqual("1.0.0")
      expect(CriticalAnalysisSkill.name).toBe("Critical Analysis")
      expect(CriticalAnalysisSkill.capabilities).toContain("reasoning")
      expect(CriticalAnalysisSkill.capabilities).toContain("counter_arguments")
    })

    it("should analyze claim", async () => {
      const result = await CriticalAnalysisSkill.execute({ claim: "All swans are white" }, SKILL_CONTEXT)
      expect(result.analysis).toBeDefined()
      expect(result.counterArgs).toBeDefined()
      expect(Array.isArray(result.counterArgs)).toBe(true)
    })

    it("should generate counter-arguments", async () => {
      const result = await CriticalAnalysisSkill.execute({ claim: "All programmers should learn Rust" }, SKILL_CONTEXT)
      expect(result.counterArgs.length).toBeGreaterThan(0)
    })

    it("should identify strengths and weaknesses", async () => {
      const result = await CriticalAnalysisSkill.execute(
        { claim: "Climate change is caused by human activities" },
        SKILL_CONTEXT,
      )
      expect(result.strengths).toBeDefined()
      expect(result.weaknesses).toBeDefined()
      expect(Array.isArray(result.strengths)).toBe(true)
      expect(Array.isArray(result.weaknesses)).toBe(true)
    })

    it("should detect logical fallacies", async () => {
      const result = await CriticalAnalysisSkill.execute(
        { claim: "You should believe me because I'm a famous expert" },
        SKILL_CONTEXT,
      )
      expect(result.logicalFallacies.length).toBeGreaterThan(0)
    })

    it("should provide confidence score", async () => {
      const result = await CriticalAnalysisSkill.execute(
        { claim: "The sky is blue because of light refraction" },
        SKILL_CONTEXT,
      )
      expect(result.confidence).toBeGreaterThan(0)
      expect(result.confidence).toBeLessThanOrEqual(1)
    })

    it("should handle empty claim", async () => {
      const result = await CriticalAnalysisSkill.execute({ claim: "" }, SKILL_CONTEXT)
      expect(result.analysis).toContain("No claim")
      expect(result.counterArgs).toHaveLength(0)
    })
  })
})

// Aggregate exports tests
describe("WP4.3 Wave 1: Skill Registry Integration", () => {
  it("should export 6 development skills", () => {
    expect(DEVELOPMENT_SKILL_COUNT).toBe(6)
    expect(developmentSkills).toHaveLength(6)
  })

  it("should export 5 knowledge skills", () => {
    expect(KNOWLEDGE_SKILL_COUNT).toBe(5)
    expect(knowledgeSkills).toHaveLength(5)
  })

  it("should export 11 total wave 1 skills", () => {
    expect(TOTAL_WAVE1_SKILL_COUNT).toBe(11)
    expect(allWave1Skills).toHaveLength(11)
  })

  it("should have unique skill IDs", () => {
    const ids = allWave1Skills.map((s) => s.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
  })

  it("should have valid skill structure", () => {
    for (const skill of allWave1Skills) {
      expect(skill.id).toBeDefined()
      expect(skill.version).toBeDefined()
      expect(skill.name).toBeDefined()
      expect(skill.inputSchema).toBeDefined()
      expect(skill.outputSchema).toBeDefined()
      expect(skill.capabilities).toBeDefined()
      expect(skill.tags).toBeDefined()
      expect(skill.execute).toBeDefined()
    }
  })

  it("should have semantic version format", () => {
    for (const skill of allWave1Skills) {
      expect(typeof skill.version).toBe("string")
      expect(skill.version).toMatch(/^\d+\.\d+\.\d+$/)
    }
  })
})

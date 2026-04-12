import { Log } from "@/util/log"
import { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"

// Spec-driven development input
export interface SpecDrivenInput {
  objective: string
  constraints?: string[]
  acceptanceCriteria?: string[]
}

// Spec-driven development output
export interface SpecDrivenOutput {
  specification: Specification
  testCases: TestCase[]
  implementationGuide: string[]
  summary: string
}

export interface Specification {
  title: string
  description: string
  requirements: string[]
  constraints: string[]
  acceptanceCriteria: AcceptanceCriterion[]
}

export interface AcceptanceCriterion {
  id: string
  description: string
  testable: boolean
  verificationMethod?: string
}

export interface TestCase {
  id: string
  criterionId: string
  description: string
  input: string
  expectedOutput: string
}

// Specification structure rules
const REQUIRED_SECTIONS = ["title", "description", "requirements", "acceptanceCriteria"] as const

function validateSpecification(spec: Partial<Specification>): string[] {
  const issues: string[] = []

  for (const section of REQUIRED_SECTIONS) {
    if (!spec[section]) {
      issues.push(`Missing required section: ${section}`)
    }
  }

  if (spec.acceptanceCriteria && spec.acceptanceCriteria.length === 0) {
    issues.push("Acceptance criteria must have at least one item")
  }

  return issues
}

function generateTestCases(acceptanceCriteria: AcceptanceCriterion[]): TestCase[] {
  const testCases: TestCase[] = []

  for (const criterion of acceptanceCriteria) {
    if (!criterion.testable) {
      testCases.push({
        id: `TC-${criterion.id}`,
        criterionId: criterion.id,
        description: `Verify: ${criterion.description}`,
        input: "N/A - manual verification required",
        expectedOutput: criterion.verificationMethod || criterion.description,
      })
    } else {
      testCases.push({
        id: `TC-${criterion.id}-1`,
        criterionId: criterion.id,
        description: `Test: ${criterion.description}`,
        input: "Test input",
        expectedOutput: "Expected test output",
      })
    }
  }

  return testCases
}

export const SpecDrivenSkill: Skill = {
  id: "spec-driven-development" as SkillId,
  version: "1.0.0",
  name: "Spec-Driven Development",
  inputSchema: {
    type: "object",
    properties: {
      objective: {
        type: "string",
        description: "Main objective or feature to specify",
      },
      constraints: {
        type: "array",
        items: { type: "string" },
        description: "Technical or business constraints",
      },
      acceptanceCriteria: {
        type: "array",
        items: { type: "string" },
        description: "Acceptance criteria for the feature",
      },
    },
    required: ["objective"],
  },
  outputSchema: {
    type: "object",
    properties: {
      specification: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          requirements: { type: "array" },
          constraints: { type: "array" },
          acceptanceCriteria: { type: "array" },
        },
      },
      testCases: { type: "array" },
      implementationGuide: { type: "array", items: { type: "string" } },
      summary: { type: "string" },
    },
  },
  capabilities: ["specification-creation", "requirement-analysis", "test-case-generation", "implementation-planning"],
  tags: ["specification", "tdd", "requirements", "planning"],

  async execute(input: unknown, _context: SkillContext): Promise<SpecDrivenOutput> {
    const log = Log.create({ service: "kiloclaw.skill.spec-driven" })
    log.info("executing spec-driven development")

    const { objective, constraints = [], acceptanceCriteria = [] } = input as SpecDrivenInput

    if (!objective || objective.trim().length === 0) {
      return {
        specification: {
          title: "",
          description: "",
          requirements: [],
          constraints: [],
          acceptanceCriteria: [],
        },
        testCases: [],
        implementationGuide: [],
        summary: "No objective provided for specification",
      }
    }

    // Build specification
    const specification: Specification = {
      title: objective,
      description: `Implementation of: ${objective}`,
      requirements: [objective],
      constraints,
      acceptanceCriteria: acceptanceCriteria.map((c, idx) => ({
        id: `AC${idx + 1}`,
        description: c,
        testable: !c.toLowerCase().includes("user友好") && !c.toLowerCase().includes("intuitive"),
        verificationMethod: c.toLowerCase().includes("verify") ? c : undefined,
      })),
    }

    // Validate specification
    const issues = validateSpecification(specification)

    // Generate test cases
    const testCases = generateTestCases(specification.acceptanceCriteria)

    // Generate implementation guide
    const implementationGuide: string[] = []
    if (issues.length === 0) {
      implementationGuide.push("Specification is complete - ready for implementation")
      implementationGuide.push("Write tests first (TDD): implement each test case before code")
      implementationGuide.push("Implement the simplest solution that passes all tests")
      implementationGuide.push("Refactor after tests pass, ensuring tests still pass")
    } else {
      implementationGuide.push("FIX ISSUES before implementation:")
      implementationGuide.push(...issues)
    }

    const summary =
      issues.length === 0
        ? `Specification complete with ${acceptanceCriteria.length} acceptance criteria and ${testCases.length} test case(s)`
        : `Specification has ${issues.length} issue(s) - fix before implementation`

    log.info("spec-driven development completed", {
      acceptanceCriteria: acceptanceCriteria.length,
      testCases: testCases.length,
      issues: issues.length,
    })

    return { specification, testCases, implementationGuide, summary }
  },
}

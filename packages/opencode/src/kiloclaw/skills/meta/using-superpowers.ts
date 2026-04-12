import { Log } from "@/util/log"
import { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"

// Using superpowers input
export interface UsingSuperpowersInput {
  superpower: "code-generation" | "debugging" | "refactoring" | "documentation" | "testing"
  task: string
  context?: string
}

// Using superpowers output
export interface UsingSuperpowersOutput {
  superpower: string
  approach: string
  techniques: string[]
  warnings: string[]
  summary: string
}

// Superpower methodologies
const SUPERPOWER_METHODS: Record<string, { approach: string; techniques: string[]; warnings: string[] }> = {
  "code-generation": {
    approach: "Generate clean, maintainable code following project conventions and patterns",
    techniques: [
      "Start with clear requirements and specifications",
      "Use established design patterns where appropriate",
      "Follow SOLID principles for object-oriented code",
      "Apply DRY (Don't Repeat Yourself) principle",
      "Include appropriate error handling",
    ],
    warnings: [
      "Verify generated code doesn't introduce security vulnerabilities",
      "Ensure generated code follows project's style guide",
      "Review for edge cases and boundary conditions",
    ],
  },
  debugging: {
    approach: "Systematic debugging using the scientific method: observe, hypothesize, test, conclude",
    techniques: [
      "Reproduce the issue consistently before investigating",
      "Isolate the problem to the smallest possible scope",
      "Use binary search to narrow down the cause",
      "Check recent changes that might have introduced the issue",
      "Verify assumptions about system state",
    ],
    warnings: [
      "Don't assume the obvious cause is correct",
      "Be careful not to introduce new bugs while fixing",
      "Test the fix thoroughly before considering done",
    ],
  },
  refactoring: {
    approach: "Improve code structure without changing external behavior",
    techniques: [
      "Ensure comprehensive test coverage before refactoring",
      "Make small, incremental changes",
      "Run tests after each change",
      "Focus on readability and maintainability",
      "Remove dead code and duplicate logic",
    ],
    warnings: [
      "Don't refactor and add new features simultaneously",
      "Be cautious with public APIs and dependencies",
      "Document any intentional behavior changes",
    ],
  },
  documentation: {
    approach: "Create clear, concise documentation that adds value",
    techniques: [
      "Explain the 'why' not just the 'what'",
      "Use code examples to illustrate usage",
      "Keep documentation close to the code it describes",
      "Update docs when code changes",
      "Use consistent formatting and terminology",
    ],
    warnings: [
      "Don't document obvious things that clutter docs",
      "Avoid outdated or misleading information",
      "Don't let perfect documentation block good enough code",
    ],
  },
  testing: {
    approach: "Write tests that provide confidence without excessive maintenance burden",
    techniques: [
      "Test behavior, not implementation",
      "Aim for meaningful coverage, not 100% line coverage",
      "Use test doubles appropriately (mocks vs stubs vs spies)",
      "Write tests before fixing bugs (regression tests)",
      "Keep tests fast to encourage running them frequently",
    ],
    warnings: [
      "Don't test third-party libraries",
      "Avoid brittle tests that break on refactoring",
      "Don't write tests that duplicate application logic",
    ],
  },
} as const

export const UsingSuperpowersSkill: Skill = {
  id: "using-superpowers" as SkillId,
  version: "1.0.0",
  name: "Using Superpowers",
  inputSchema: {
    type: "object",
    properties: {
      superpower: {
        type: "string",
        enum: ["code-generation", "debugging", "refactoring", "documentation", "testing"],
        description: "The superpower to apply",
      },
      task: { type: "string", description: "Description of the task" },
      context: { type: "string", description: "Additional context" },
    },
    required: ["superpower", "task"],
  },
  outputSchema: {
    type: "object",
    properties: {
      superpower: { type: "string" },
      approach: { type: "string" },
      techniques: { type: "array", items: { type: "string" } },
      warnings: { type: "array", items: { type: "string" } },
      summary: { type: "string" },
    },
  },
  capabilities: ["code-generation", "debugging", "refactoring", "documentation", "testing"],
  tags: ["meta", "superpowers", "methodology", "best-practices"],

  async execute(input: unknown, _context: SkillContext): Promise<UsingSuperpowersOutput> {
    const log = Log.create({ service: "kiloclaw.skill.using-superpowers" })
    log.info("executing superpower guidance", { superpower: (input as UsingSuperpowersInput).superpower })

    const { superpower, task } = input as UsingSuperpowersInput

    const method = SUPERPOWER_METHODS[superpower]
    if (!method) {
      return {
        superpower,
        approach: "",
        techniques: [],
        warnings: [`Unknown superpower: ${superpower}`],
        summary: `Unknown superpower: ${superpower}`,
      }
    }

    log.info("superpower guidance provided", { superpower, task: task.substring(0, 50) })

    return {
      superpower,
      approach: method.approach,
      techniques: method.techniques,
      warnings: method.warnings,
      summary: `Applied ${superpower} methodology to: ${task.substring(0, 50)}...`,
    }
  },
}

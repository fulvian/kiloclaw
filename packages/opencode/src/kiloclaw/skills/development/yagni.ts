import { Log } from "@/util/log"
import { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"

// YAGNI enforcement input
export interface YagniInput {
  proposedCode: string
  context?: string
  knownRequirements?: string[]
}

// YAGNI enforcement output
export interface YagniOutput {
  verdict: "keep" | "remove" | "review"
  analysis: YagniFinding[]
  summary: string
  recommendations: string[]
}

export interface YagniFinding {
  type: "speculative_generality" | "unused_code" | "premature_abstraction" | "over_engineering" | "complexity"
  severity: "info" | "warning" | "error"
  code?: string
  description: string
  suggestion: string
  reason: string
}

// YAGNI anti-patterns to detect
const YAGNI_VIOLATIONS = [
  {
    type: "speculative_generality" as const,
    pattern: /TODO|FIXME|HACK|XXX|RUBY|unused|dead\s*code/gi,
    severity: "warning" as const,
    description: "Code that exists for anticipated future needs",
    suggestion: "Remove speculative code. Implement features when they are actually needed",
    reason: "Don't add functionality until you actually need it",
  },
  {
    type: "unused_code" as const,
    pattern: /\/\/\s*(?:unused|not used|deprecated)\b/gi,
    severity: "warning" as const,
    description: "Code that is commented out or marked as unused",
    suggestion: "Delete unused code. Version control preserves history",
    reason: "Dead code adds maintenance burden and confusion",
  },
  {
    type: "premature_abstraction" as const,
    pattern: /(?:abstract|interface)\s+\w+\s*\{[^}]*\}\s*(?:class|extends|implements)/gi,
    severity: "info" as const,
    description: "Abstract classes or interfaces for classes with single implementation",
    suggestion: "Wait until you have multiple implementations before abstracting",
    reason: "Premature abstraction creates unnecessary indirection",
  },
  {
    type: "over_engineering" as const,
    pattern: /\b(?:factory|builder|strategy|observer|visitor|chain\s*of\s*responsibility)\b/gi,
    severity: "info" as const,
    description: "Design patterns used where simpler solutions exist",
    suggestion: "Use the simplest solution that works. Apply patterns when they solve real problems",
    reason: "Complex patterns add cognitive load - use them only when they provide clear value",
  },
  {
    type: "complexity" as const,
    pattern: /\{[^}]{200,}\}/g,
    severity: "warning" as const,
    description: "Deeply nested or overly complex blocks",
    suggestion: "Simplify the logic. Extract helper functions or break into smaller modules",
    reason: "Complex code is harder to understand, test, and maintain",
  },
  {
    type: "over_engineering" as const,
    pattern: /extends\s+(?:React\.)?(?:Component|PureComponent)/gi,
    severity: "info" as const,
    description: "Class components when functional components would suffice",
    suggestion: "Consider functional components with hooks for simpler React code",
    reason: "Functional components are simpler and prefered in modern React",
  },
] as const

// Check if code is actually used based on context
function isUsedInContext(code: string, context: string): boolean {
  if (!context) return true

  // Extract identifiers from code
  const identifierMatch = code.match(/(\w+)/)
  if (!identifierMatch) return true

  const identifier = identifierMatch[1]
  // Check if identifier appears elsewhere in context
  const regex = new RegExp(`\\b${identifier}\\b`, "g")
  const matches = context.match(regex)

  return matches !== null && matches.length > 1
}

export const YagniSkill: Skill = {
  id: "yagni-enforcement" as SkillId,
  version: "1.0.0",
  name: "YAGNI Enforcement",
  inputSchema: {
    type: "object",
    properties: {
      proposedCode: {
        type: "string",
        description: "Code snippet being considered for addition",
      },
      context: {
        type: "string",
        description: "Existing codebase context (optional)",
      },
      knownRequirements: {
        type: "array",
        items: { type: "string" },
        description: "Known requirements this code should fulfill",
      },
    },
    required: ["proposedCode"],
  },
  outputSchema: {
    type: "object",
    properties: {
      verdict: {
        type: "string",
        enum: ["keep", "remove", "review"],
        description: "Recommendation on whether to add/keep the code",
      },
      analysis: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string" },
            severity: { type: "string" },
            code: { type: "string" },
            description: { type: "string" },
            suggestion: { type: "string" },
            reason: { type: "string" },
          },
        },
      },
      summary: { type: "string" },
      recommendations: { type: "array", items: { type: "string" } },
    },
  },
  capabilities: ["code-review", "yagni-enforcement", "refactoring-suggestions", "simplicity-analysis"],
  tags: ["development", "quality", "refactoring", "yagni", "simplicity"],

  async execute(input: unknown, _context: SkillContext): Promise<YagniOutput> {
    const log = Log.create({ service: "kiloclaw.skill.yagni" })
    log.info("executing YAGNI analysis")

    const { proposedCode, context = "", knownRequirements = [] } = input as YagniInput
    const analysis: YagniFinding[] = []

    if (!proposedCode || proposedCode.trim().length === 0) {
      return {
        verdict: "review",
        analysis: [],
        summary: "No code provided for YAGNI analysis",
        recommendations: ["Provide code to analyze against YAGNI principle"],
      }
    }

    // Check for YAGNI violations
    for (const violation of YAGNI_VIOLATIONS) {
      const matches = proposedCode.matchAll(violation.pattern)
      for (const match of matches) {
        const code = match[0] || ""

        // If we have context, check if code is actually used
        if (context && !isUsedInContext(code, context)) {
          analysis.push({
            type: "unused_code",
            severity: violation.severity,
            code,
            description: "Code appears unused in the broader context",
            suggestion: "Verify this code is actually needed before adding",
            reason: violation.reason,
          })
        } else {
          analysis.push({
            type: violation.type,
            severity: violation.severity,
            code,
            description: violation.description,
            suggestion: violation.suggestion,
            reason: violation.reason,
          })
        }
      }
    }

    // Check against known requirements
    if (knownRequirements.length > 0) {
      const codeLower = proposedCode.toLowerCase()
      for (const req of knownRequirements) {
        const reqWords = req.toLowerCase().split(/\s+/)
        const hasRelevantCode = reqWords.some((word) => word.length > 3 && codeLower.includes(word))
        if (!hasRelevantCode) {
          analysis.push({
            type: "complexity",
            severity: "info",
            code: "",
            description: `Code may not address requirement: "${req}"`,
            suggestion: "Ensure this code directly fulfills the stated requirement",
            reason: "Every piece of code should serve a known requirement",
          })
        }
      }
    }

    // Determine verdict
    const errors = analysis.filter((f) => f.severity === "error")
    const warnings = analysis.filter((f) => f.severity === "warning")
    const infos = analysis.filter((f) => f.severity === "info")

    let verdict: "keep" | "remove" | "review"
    if (errors.length > 0) {
      verdict = "remove"
    } else if (warnings.length >= 2) {
      verdict = "remove"
    } else if (warnings.length > 0 || infos.length > 0) {
      verdict = "review"
    } else {
      verdict = "keep"
    }

    // Generate recommendations
    const recommendations: string[] = []
    if (verdict === "keep") {
      recommendations.push("Code passes YAGNI check - it addresses an actual need")
    } else if (verdict === "remove") {
      recommendations.push("Consider removing this code - it may violate YAGNI principle")
      recommendations.push("Ask: 'Am I only adding this because I anticipate needing it later?'")
    } else {
      recommendations.push("Review this code against current requirements")
      recommendations.push("Ensure each line of code serves a known, immediate need")
    }

    const summary =
      verdict === "keep"
        ? "Code appears necessary and focused"
        : verdict === "remove"
          ? `Found ${errors.length + warnings.length} YAGNI violation(s) - code may be speculative`
          : `Found ${infos.length} consideration(s) - review recommended before adding`

    log.info("YAGNI analysis completed", { verdict, violations: analysis.length })

    return { verdict, analysis, summary, recommendations }
  },
}

import { Log } from "@/util/log"
import { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"

// Anti-patterns input
export interface AntiPatternsInput {
  code: string
  language?: string
  strictness?: "lenient" | "standard" | "strict"
}

// Anti-patterns output
export interface AntiPatternsOutput {
  patternsFound: AntiPatternIssue[]
  severityCounts: Record<string, number>
  overallScore: number
  summary: string
  recommendations: string[]
}

export interface AntiPatternIssue {
  pattern: string
  severity: "info" | "warning" | "error"
  line?: number
  code: string
  description: string
  suggestion: string
}

// Anti-pattern definitions
const ANTI_PATTERNS = [
  // Code organization
  {
    pattern: /god\s*(?:object|class|function)/gi,
    name: "God Object/Function",
    severity: "error" as const,
    description: "A module, class, or function that does too much (God object/class/function)",
    suggestion: "Split into smaller, focused modules or classes with single responsibilities",
  },
  {
    pattern: /long\s*(?:method|function|class)/gi,
    name: "Long Method/Class",
    severity: "warning" as const,
    description: "A method or class that is too long and should be refactored",
    suggestion: "Break down into smaller, focused methods. Aim for max 20-30 lines per method",
  },
  {
    pattern: /duplicate\s*(?:code|pattern)/gi,
    name: "Duplicated Code",
    severity: "error" as const,
    description: "Same code appears in multiple places",
    suggestion: "Extract into a shared function, class, or utility module",
  },

  // Naming
  {
    pattern: /(?:m_|m[A-Z])/g,
    name: "Hungarian Notation",
    severity: "info" as const,
    description: "Hungarian notation (m_ prefix, etc.) is outdated",
    suggestion: "Use descriptive names without type prefixes",
  },
  {
    pattern: /\b(?:data|info|temp|tmp|foo|bar)\b/gi,
    name: "Vague Naming",
    severity: "warning" as const,
    description: "Variable or function name is too vague",
    suggestion: "Use descriptive names that convey purpose",
  },

  // Async/Concurrency
  {
    pattern: /callback\s*\(\s*(?:err,\s*)?(?:result)?\s*\)/gi,
    name: "Callback Hell",
    severity: "error" as const,
    description: "Nested callbacks creating unreadable code",
    suggestion: "Use Promises or async/await instead of callbacks",
  },
  {
    pattern: /async\s+function.+\{.+\.then\s*\(/gs,
    name: "Mixed Async Patterns",
    severity: "warning" as const,
    description: "Mixing async/await with .then()/.catch()",
    suggestion: "Choose one async pattern consistently (prefer async/await)",
  },
  {
    pattern: /new\s+Promise\s*\(\s*\(\s*resolve,\s*reject\s*\)\s*=>/gi,
    name: "Explicit Promise Constructor",
    severity: "info" as const,
    description: "Using Promise constructor when simpler alternatives exist",
    suggestion: "Use async/await or Promise.resolve/reject instead",
  },

  // Error handling
  {
    pattern: /\}\s*catch\s*\(\s*(?:err|error)?\s*\)\s*\{\s*\}/g,
    name: "Empty Catch Block",
    severity: "error" as const,
    description: "Empty catch block silently swallows errors",
    suggestion: "Log the error or handle it explicitly. Never silently ignore errors",
  },
  {
    pattern: /catch\s*\(\s*e\s*\)\s*\{\s*throw\s+e\s*;/gi,
    name: "Rethrowing Without Context",
    severity: "warning" as const,
    description: "Re-throwing exception without adding context",
    suggestion: "Add context before re-throwing: throw new Error('msg', { cause: e })",
  },

  // Type safety
  {
    pattern: /:[\s\n]*any[\s\n;)]/g,
    name: "Type: Any",
    severity: "warning" as const,
    description: "Using 'any' type defeats TypeScript's type checking",
    suggestion: "Use specific types or 'unknown' with proper type guards",
  },
  {
    pattern: /@ts-ignore/g,
    name: "TS Ignore Comment",
    severity: "warning" as const,
    description: "@ts-ignore suppresses TypeScript errors",
    suggestion: "Fix the TypeScript error properly or use @ts-expect-error with justification",
  },
  {
    pattern: /!(\w+)\.includes\(/g,
    name: "Non-null assertion abuse",
    severity: "warning" as const,
    description: "Overuse of non-null assertions",
    suggestion: "Use proper null checks or optional chaining (?.)",
  },

  // Performance
  {
    pattern: /\.forEach\s*\(\s*(?:async\s*)?\(/g,
    name: "forEach with async",
    severity: "error" as const,
    description: "forEach does not wait for async callbacks",
    suggestion: "Use for...of loop or Promise.all() instead",
  },
  {
    pattern: /string\s*\+\s*string\s*\+\s*string/gi,
    name: "String Concatenation in Loop",
    severity: "warning" as const,
    description: "Repeated string concatenation is inefficient",
    suggestion: "Use array join or template literals with a single expression",
  },
  {
    pattern: /\.map\s*\(\s*\w+\s*=>\s*\w+\s*\)/g,
    name: "Unnecessary Map",
    severity: "info" as const,
    description: "map() used without using the result",
    suggestion: "Use forEach() if not transforming, or remove the map()",
  },

  // React/Vue specific
  {
    pattern: /useEffect\s*\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*,\s*\[\s*\]\s*\)/g,
    name: "Empty useEffect",
    severity: "info" as const,
    description: "Empty useEffect with empty dependency array",
    suggestion: "Either add dependencies or remove the effect if truly not needed",
  },
  {
    pattern: /useState\s*\(\s*(?:null|undefined)\s*\)/g,
    name: "useState with null/undefined",
    severity: "warning" as const,
    description: "Initializing state with null or undefined",
    suggestion: "Consider using a more specific initial value or separate loading state",
  },
] as const

function calculateSeverityScore(
  severity: "info" | "warning" | "error",
  strictness: "lenient" | "standard" | "strict",
): number {
  const base = severity === "error" ? 3 : severity === "warning" ? 2 : 1
  const multiplier = strictness === "strict" ? 1.5 : strictness === "standard" ? 1.0 : 0.5
  return base * multiplier
}

export const AntiPatternsSkill: Skill = {
  id: "anti-patterns" as SkillId,
  version: "1.0.0",
  name: "Anti-Patterns Detection",
  inputSchema: {
    type: "object",
    properties: {
      code: { type: "string", description: "Source code to analyze" },
      language: { type: "string", description: "Programming language (default: inferred)" },
      strictness: {
        type: "string",
        enum: ["lenient", "standard", "strict"],
        description: "Analysis strictness level (default: standard)",
      },
    },
    required: ["code"],
  },
  outputSchema: {
    type: "object",
    properties: {
      patternsFound: {
        type: "array",
        items: {
          type: "object",
          properties: {
            pattern: { type: "string" },
            severity: { type: "string" },
            line: { type: "number" },
            code: { type: "string" },
            description: { type: "string" },
            suggestion: { type: "string" },
          },
        },
      },
      severityCounts: { type: "object" },
      overallScore: { type: "number" },
      summary: { type: "string" },
      recommendations: { type: "array", items: { type: "string" } },
    },
  },
  capabilities: ["code-quality-analysis", "anti-pattern-detection", "refactoring-suggestions", "static-analysis"],
  tags: ["development", "quality", "refactoring", "code-review"],

  async execute(input: unknown, _context: SkillContext): Promise<AntiPatternsOutput> {
    const log = Log.create({ service: "kiloclaw.skill.anti-patterns" })
    log.info("executing anti-patterns analysis")

    const { code, strictness = "standard" } = input as AntiPatternsInput
    const patternsFound: AntiPatternIssue[] = []

    if (!code || code.trim().length === 0) {
      return {
        patternsFound: [],
        severityCounts: { info: 0, warning: 0, error: 0 },
        overallScore: 100,
        summary: "No code provided for analysis",
        recommendations: ["Provide code to analyze for anti-patterns"],
      }
    }

    const codeLines = code.split("\n")

    for (const antiPattern of ANTI_PATTERNS) {
      // Apply strictness filter
      if (strictness === "lenient" && antiPattern.severity === "info") {
        continue
      }
      if (strictness === "standard" && antiPattern.severity === "info") {
        continue
      }

      const matches = code.matchAll(antiPattern.pattern)
      for (const match of matches) {
        const lineNumber = match.index !== undefined ? code.substring(0, match.index).split("\n").length : undefined
        patternsFound.push({
          pattern: antiPattern.name,
          severity: antiPattern.severity,
          line: lineNumber,
          code: match[0] || "",
          description: antiPattern.description,
          suggestion: antiPattern.suggestion,
        })
      }
    }

    // Count by severity
    const severityCounts = { info: 0, warning: 0, error: 0 }
    for (const issue of patternsFound) {
      severityCounts[issue.severity]++
    }

    // Calculate overall score (100 = perfect, 0 = many issues)
    let totalPenalty = 0
    for (const issue of patternsFound) {
      totalPenalty += calculateSeverityScore(issue.severity, strictness as "lenient" | "standard" | "strict")
    }
    const overallScore = Math.max(0, 100 - totalPenalty)

    // Generate recommendations
    const recommendations: string[] = []
    const errors = patternsFound.filter((p) => p.severity === "error")
    if (errors.length > 0) {
      recommendations.push(`Fix ${errors.length} error-level anti-pattern(s) first`)
    }
    const warnings = patternsFound.filter((p) => p.severity === "warning")
    if (warnings.length > 0) {
      recommendations.push(`Address ${warnings.length} warning-level anti-pattern(s) for better code quality`)
    }

    const summary =
      patternsFound.length === 0
        ? "Code is clean - no anti-patterns detected"
        : `Found ${patternsFound.length} anti-pattern(s): ${severityCounts.error} errors, ${severityCounts.warning} warnings, ${severityCounts.info} info`

    log.info("anti-patterns analysis completed", {
      patternsFound: patternsFound.length,
      overallScore,
    })

    return {
      patternsFound,
      severityCounts,
      overallScore,
      summary,
      recommendations,
    }
  },
}

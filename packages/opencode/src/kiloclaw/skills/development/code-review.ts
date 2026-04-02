import { Log } from "@/util/log"
import { Skill, SkillContext } from "../skill"
import { SkillId } from "../types"

// Issue severity levels
export type IssueSeverity = "critical" | "major" | "minor" | "info"

// Issue type for code review results
export interface Issue {
  readonly line?: number
  readonly column?: number
  readonly severity: IssueSeverity
  readonly rule: string
  readonly message: string
  readonly suggestion?: string
}

// Code review input schema
interface CodeReviewInput {
  code: string
  language: string
}

// Code review output schema
interface CodeReviewOutput {
  issues: Issue[]
  score: number
}

// Common code issues by language
const COMMON_ISSUES = {
  typescript: [
    { rule: "no-any", pattern: /:\s*any\b/, severity: "major" as IssueSeverity, message: "Avoid using 'any' type - use specific types instead" },
    { rule: "no-var", pattern: /\bvar\s+\w+/, severity: "minor" as IssueSeverity, message: "Use 'const' or 'let' instead of 'var'" },
    { rule: "prefer-const", pattern: /let\s+\w+\s*=/, severity: "info" as IssueSeverity, message: "Use 'const' if variable is never reassigned" },
    { rule: "no-console", pattern: /console\.(log|debug|info)/, severity: "info" as IssueSeverity, message: "Remove console statements in production code" },
  ],
  javascript: [
    { rule: "no-var", pattern: /\bvar\s+\w+/, severity: "minor" as IssueSeverity, message: "Use 'const' or 'let' instead of 'var'" },
    { rule: "prefer-const", pattern: /let\s+\w+\s*=/, severity: "info" as IssueSeverity, message: "Use 'const' if variable is never reassigned" },
    { rule: "no-console", pattern: /console\.(log|debug|info)/, severity: "info" as IssueSeverity, message: "Remove console statements in production code" },
  ],
  python: [
    { rule: "no-tab-indent", pattern: /\t/, severity: "minor" as IssueSeverity, message: "Use spaces instead of tabs for indentation" },
    { rule: "print-statement", pattern: /^print\s+(?![(])/, severity: "info" as IssueSeverity, message: "Use print() function for Python 3 compatibility" },
    { rule: "noBareExcept", pattern: /except\s*:/, severity: "major" as IssueSeverity, message: "Specify exception type in except clause" },
  ],
  default: [
    { rule: "no-trailing-whitespace", pattern: /\s+$/, severity: "info" as IssueSeverity, message: "Remove trailing whitespace" },
    { rule: "no-multiple-empty-lines", pattern: /\n{3,}/, severity: "minor" as IssueSeverity, message: "Limit consecutive empty lines to 2" },
  ],
}

// Calculate quality score based on issues
function calculateScore(issues: Issue[]): number {
  if (issues.length === 0) return 1.0
  
  const weights = { critical: 0.3, major: 0.15, minor: 0.05, info: 0.01 }
  const totalPenalty = issues.reduce((sum, issue) => sum + (weights[issue.severity] || 0.05), 0)
  
  return Math.max(0, 1 - totalPenalty)
}

// Detect issues in code
function detectIssues(code: string, language: string): Issue[] {
  const issues: Issue[] = []
  const lines = code.split("\n")
  const langKey = language.toLowerCase() as keyof typeof COMMON_ISSUES
  const patterns = COMMON_ISSUES[langKey] || COMMON_ISSUES.default
  
  for (const pattern of patterns) {
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum]
      const match = line.match(pattern.pattern)
      if (match) {
        const column = line.indexOf(match[0])
        issues.push({
          line: lineNum + 1,
          column: column >= 0 ? column + 1 : undefined,
          severity: pattern.severity,
          rule: pattern.rule,
          message: pattern.message,
          suggestion: `Replace with type-safe alternative`,
        })
      }
    }
  }
  
  // Check for common bugs
  const bugPatterns = [
    { pattern: /==\s*(?!['"])/, severity: "major" as IssueSeverity, message: "Use === instead of ==" },
    { pattern: /!=\s*(?!['"])/, severity: "major" as IssueSeverity, message: "Use !== instead of !=" },
    { pattern: /return\s+\w+\s*;\s*\}/, severity: "info" as IssueSeverity, message: "Missing semicolon or inconsistent formatting" },
  ]
  
  for (const pattern of bugPatterns) {
    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum]
      if (pattern.pattern.test(line)) {
        issues.push({
          line: lineNum + 1,
          severity: pattern.severity,
          rule: "potential-bug",
          message: pattern.message,
        })
      }
    }
  }
  
  return issues
}

export const CodeReviewSkill: Skill = {
  id: "code-review" as SkillId,
  version: { major: 1, minor: 0, patch: 0 },
  name: "Code Review",
  inputSchema: {
    type: "object",
    properties: {
      code: { type: "string", description: "Source code to review" },
      language: { type: "string", description: "Programming language (e.g., typescript, python)" },
    },
    required: ["code"],
  },
  outputSchema: {
    type: "object",
    properties: {
      issues: {
        type: "array",
        items: {
          type: "object",
          properties: {
            line: { type: "number" },
            column: { type: "number" },
            severity: { type: "string" },
            rule: { type: "string" },
            message: { type: "string" },
            suggestion: { type: "string" },
          },
        },
      },
      score: { type: "number", description: "Code quality score between 0 and 1" },
    },
  },
  capabilities: ["code_analysis", "style_check", "best_practices"],
  tags: ["development", "review", "quality", "static-analysis"],
  
  async execute(input: unknown, context: SkillContext): Promise<CodeReviewOutput> {
    const log = Log.create({ service: "kiloclaw.skill.code-review" })
    log.info("executing code review", { correlationId: context.correlationId })
    
    const { code, language } = input as CodeReviewInput
    
    if (!code) {
      log.warn("empty code provided for review")
      return { issues: [], score: 1.0 }
    }
    
    const issues = detectIssues(code, language || "unknown")
    const score = calculateScore(issues)
    
    log.info("code review completed", {
      correlationId: context.correlationId,
      issueCount: issues.length,
      score,
    })
    
    return { issues, score }
  },
}

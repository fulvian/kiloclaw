import { Log } from "@/util/log"
import { Skill, SkillContext } from "../skill"
import { SkillId } from "../types"

// Complexity metrics
export interface Metrics {
  readonly cyclomaticComplexity: number
  readonly cognitiveComplexity: number
  readonly linesOfCode: number
  readonly maintainabilityIndex: number
  readonly halsteadVolume?: number
}

// Simplification input schema
interface SimplificationInput {
  code: string
}

// Simplification output schema
interface SimplificationOutput {
  simplified: string
  metrics: Metrics
  suggestions: string[]
}

// Detect complexity issues
function detectComplexityIssues(code: string): { issues: string[]; metrics: Metrics } {
  const issues: string[] = []
  const lines = code.split("\n")
  const nonEmptyLines = lines.filter((l) => l.trim().length > 0)

  // Cyclomatic complexity estimation (based on control flow statements)
  const controlFlowPatterns = [
    /\bif\b/g,
    /\belse\s+if\b/g,
    /\bwhile\b/g,
    /\bfor\b/g,
    /\bcase\b/g,
    /\bcatch\b/g,
    /\b\?\s*[^:]+:/g, // ternary
    /&&/g,
    /\|\|/g,
  ]

  let cyclomaticComplexity = 1 // base complexity
  for (const pattern of controlFlowPatterns) {
    const matches = code.match(pattern)
    if (matches) {
      cyclomaticComplexity += matches.length
    }
  }

  // Cognitive complexity (simplified estimation) - count by brace nesting
  let cognitiveComplexity = 0
  let nestingLevel = 0
  let braceDepth = 0

  for (const char of code) {
    if (char === "{") {
      braceDepth++
    } else if (char === "}") {
      braceDepth = Math.max(0, braceDepth - 1)
    }
  }

  // Alternative: count nesting level by looking for control flow keywords
  // and increase complexity based on depth
  const controlFlowMatches = code.match(/(?:if|while|for|catch)\s*\(/g)
  if (controlFlowMatches) {
    // Each nested control flow adds to cognitive complexity
    const nestMatches = code.match(/\{[^}]*\{[^}]*\{[^}]*\{/g)
    const extraNesting = nestMatches ? nestMatches.length * 2 : 0
    cognitiveComplexity = controlFlowMatches.length + extraNesting
  }

  // Halstead volume (simplified)
  const words = code.split(/\W+/).filter((w) => w.length > 0)
  const uniqueWords = new Set(words)
  const halsteadVolume = words.length * Math.log2(Math.max(uniqueWords.size, 1))

  // Maintainability index (0-100 scale, higher is better)
  // Formula: 171 - 5.2 * ln(Halstead Volume) - 0.23 * Cyclomatic Complexity - 16.2 * ln(Lines)
  const loc = nonEmptyLines.length
  const maintainabilityIndex = Math.max(
    0,
    Math.min(
      100,
      171 -
        5.2 * Math.log(Math.max(halsteadVolume, 1)) -
        0.23 * cyclomaticComplexity -
        16.2 * Math.log(Math.max(loc, 1)),
    ),
  )

  // Generate issues based on metrics
  if (cyclomaticComplexity > 5) {
    issues.push(`High cyclomatic complexity (${cyclomaticComplexity}). Consider extracting functions.`)
  }

  if (cyclomaticComplexity >= 5) {
    issues.push(`High complexity detected (${cyclomaticComplexity} control flow paths). Simplify nested logic.`)
  }

  if (loc > 200) {
    issues.push(`Function is ${loc} lines. Consider breaking into smaller functions.`)
  }

  if (maintainabilityIndex < 65) {
    issues.push(`Low maintainability index (${maintainabilityIndex.toFixed(1)}). Code needs refactoring.`)
  }

  // Check for common complexity patterns
  if (/\bfunction\b.*\(.*,.*,.*,.*\)/.test(code)) {
    issues.push("Function has too many parameters. Consider using an options object.")
  }

  if (/else\s*\{\s*else\s*\{/.test(code)) {
    issues.push("Deeply nested else-if chain detected. Consider using switch or polymorphism.")
  }

  const metrics: Metrics = {
    cyclomaticComplexity,
    cognitiveComplexity,
    linesOfCode: loc,
    maintainabilityIndex: Math.round(maintainabilityIndex * 10) / 10,
    halsteadVolume: Math.round(halsteadVolume),
  }

  return { issues, metrics }
}

// Simplify code (basic refactoring suggestions)
function simplifyCode(code: string): { simplified: string; suggestions: string[] } {
  const suggestions: string[] = []
  let simplified = code

  // Replace var with const
  if (/\bvar\b/.test(code)) {
    simplified = simplified.replace(/\bvar\b/g, "const")
    suggestions.push("Replace 'var' with 'const' or 'let' for better scoping")
  }

  // Suggest optional chaining for nested property access
  if (/\w+\.\w+\.\w+/.test(code) && !/\?\./.test(code)) {
    suggestions.push("Consider using optional chaining (?.) for safe nested property access")
  }

  // Suggest nullish coalescing for default values
  if (/!==\s*undefined\s*\|\|/.test(code) || /\|\|\s*\w+\s*===\s*undefined/.test(code)) {
    suggestions.push("Consider using nullish coalescing (??) instead of || for default values")
  }

  // Extract long functions
  const funcMatches = code.match(/(?:function|const\s+\w+\s*=\s*(?:async\s*)?\()/)
  if (funcMatches && funcMatches.length > 1) {
    suggestions.push("Multiple functions detected. Consider separating into modules.")
  }

  // Suggest arrow functions for callbacks
  if (/function\s*\(\s*\)\s*\{/.test(code) && code.includes("=>")) {
    suggestions.push("Mix of function and arrow function syntax. Standardize for consistency.")
  }

  // Check for magic numbers
  const magicNumbers = code.match(/\b\d{2,}\b(?!\s*[+-]\d)/g)
  if (magicNumbers && magicNumbers.length > 2) {
    suggestions.push("Magic numbers detected. Consider extracting as named constants.")
  }

  // Suggest template literals
  if (/\+\s*['"]/.test(code) || /['"]\s*\+/.test(code)) {
    suggestions.push("String concatenation detected. Consider using template literals.")
  }

  return { simplified: code, suggestions }
}

export const SimplificationSkill: Skill = {
  id: "simplification" as SkillId,
  version: { major: 1, minor: 0, patch: 0 },
  name: "Code Simplification",
  inputSchema: {
    type: "object",
    properties: {
      code: { type: "string", description: "Source code to simplify" },
    },
    required: ["code"],
  },
  outputSchema: {
    type: "object",
    properties: {
      simplified: { type: "string", description: "Simplified code version" },
      metrics: {
        type: "object",
        properties: {
          cyclomaticComplexity: { type: "number" },
          cognitiveComplexity: { type: "number" },
          linesOfCode: { type: "number" },
          maintainabilityIndex: { type: "number" },
          halsteadVolume: { type: "number" },
        },
      },
      suggestions: {
        type: "array",
        items: { type: "string" },
      },
    },
  },
  capabilities: ["complexity_analysis", "refactoring", "code_quality"],
  tags: ["development", "refactoring", "complexity", "quality"],

  async execute(input: unknown, context: SkillContext): Promise<SimplificationOutput> {
    const log = Log.create({ service: "kiloclaw.skill.simplification" })
    log.info("executing code simplification", { correlationId: context.correlationId })

    const { code } = input as SimplificationInput

    if (!code) {
      log.warn("empty code provided for simplification")
      return {
        simplified: "",
        metrics: {
          cyclomaticComplexity: 0,
          cognitiveComplexity: 0,
          linesOfCode: 0,
          maintainabilityIndex: 100,
        },
        suggestions: ["No code provided"],
      }
    }

    const { issues, metrics } = detectComplexityIssues(code)
    const { simplified, suggestions } = simplifyCode(code)

    const allSuggestions = [...issues, ...suggestions]

    log.info("code simplification completed", {
      correlationId: context.correlationId,
      complexity: metrics.cyclomaticComplexity,
      maintainability: metrics.maintainabilityIndex,
      suggestionCount: allSuggestions.length,
    })

    return {
      simplified,
      metrics,
      suggestions: allSuggestions,
    }
  },
}

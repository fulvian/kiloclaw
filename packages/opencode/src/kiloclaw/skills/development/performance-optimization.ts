import { Log } from "@/util/log"
import { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"

// Performance optimization input
export interface PerformanceInput {
  code: string
  language?: string
  targetMetric?: "latency" | "memory" | "throughput" | "all"
}

// Performance optimization output
export interface PerformanceOutput {
  bottlenecks: Bottleneck[]
  suggestions: OptimizationSuggestion[]
  estimatedImpact: Record<string, string>
  summary: string
}

export interface Bottleneck {
  type: "loop" | "memory" | "network" | "algorithm" | "io" | "concurrency"
  severity: "high" | "medium" | "low"
  location?: string
  description: string
  code?: string
}

export interface OptimizationSuggestion {
  type: string
  description: string
  before?: string
  after?: string
  impact: "high" | "medium" | "low"
}

// Performance anti-patterns
const PERFORMANCE_PATTERNS = [
  {
    type: "loop" as const,
    pattern: /\.forEach\s*\(\s*(?:async\s*)?/g,
    description: "forEach with async callback - not awaited",
  },
  {
    type: "loop" as const,
    pattern: /for\s*\(\s*(?:var|let)\s+\w+\s*=\s*0.*\.push\s*\(/gs,
    description: "Array modification during iteration",
  },
  {
    type: "memory" as const,
    pattern: /\b(?:JSON\.parse|JSON\.stringify)\s*\([^)]+\)(?!\s*\.)/g,
    description: "Repeated JSON serialization - consider caching",
  },
  {
    type: "memory" as const,
    pattern: /\.map\s*\(\s*\w+\s*=>\s*\{[^}]*\}\s*\)/g,
    description: "map() creating new objects - may be unnecessary",
  },
  {
    type: "algorithm" as const,
    pattern: /\bO\(n\^|O\(n!|O\(2\^/g,
    description: "Exponential or factorial complexity detected",
  },
  {
    type: "io" as const,
    pattern: /await\s+fetch\s*\(/g,
    description: "Unbatched sequential fetches - consider parallelization",
  },
  {
    type: "concurrency" as const,
    pattern: /async\s+function.+\{\s*await.+\n\s*await.+\n\s*await/gs,
    description: "Sequential awaits that could be parallelized",
  },
] as const

function detectBottlenecks(code: string): Bottleneck[] {
  const bottlenecks: Bottleneck[] = []

  for (const item of PERFORMANCE_PATTERNS) {
    const matches = code.matchAll(item.pattern)
    for (const match of matches) {
      bottlenecks.push({
        type: item.type,
        severity: item.type === "algorithm" ? "high" : "medium",
        description: item.description,
        code: match[0] || undefined,
      })
    }
  }

  return bottlenecks
}

function generateSuggestions(bottlenecks: Bottleneck[]): OptimizationSuggestion[] {
  const suggestions: OptimizationSuggestion[] = []

  for (const b of bottlenecks) {
    switch (b.type) {
      case "loop":
        suggestions.push({
          type: "parallel-iteration",
          description: "Consider using Promise.all() or for...of with await for parallel processing",
          impact: "high",
        })
        break
      case "memory":
        suggestions.push({
          type: "memoization",
          description: "Cache repeated computations or serializations",
          impact: "medium",
        })
        break
      case "algorithm":
        suggestions.push({
          type: "algorithm-selection",
          description: "Review algorithm complexity - consider more efficient data structures",
          impact: "high",
        })
        break
      case "io":
        suggestions.push({
          type: "parallel-requests",
          description: "Use Promise.all() to batch independent network requests",
          impact: "high",
        })
        break
      case "concurrency":
        suggestions.push({
          type: "concurrent-execution",
          description: "Await independent operations concurrently instead of sequentially",
          impact: "medium",
        })
        break
    }
  }

  return suggestions
}

export const PerformanceOptimizationSkill: Skill = {
  id: "performance-optimization" as SkillId,
  version: "1.0.0",
  name: "Performance Optimization",
  inputSchema: {
    type: "object",
    properties: {
      code: { type: "string", description: "Source code to analyze" },
      language: { type: "string", description: "Programming language" },
      targetMetric: {
        type: "string",
        enum: ["latency", "memory", "throughput", "all"],
        description: "Target performance metric to optimize",
      },
    },
    required: ["code"],
  },
  outputSchema: {
    type: "object",
    properties: {
      bottlenecks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string" },
            severity: { type: "string" },
            location: { type: "string" },
            description: { type: "string" },
            code: { type: "string" },
          },
        },
      },
      suggestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string" },
            description: { type: "string" },
            before: { type: "string" },
            after: { type: "string" },
            impact: { type: "string" },
          },
        },
      },
      estimatedImpact: { type: "object" },
      summary: { type: "string" },
    },
  },
  capabilities: ["performance-analysis", "bottleneck-detection", "optimization-suggestions", "code-profiling"],
  tags: ["performance", "optimization", "development", "profiling"],

  async execute(input: unknown, _context: SkillContext): Promise<PerformanceOutput> {
    const log = Log.create({ service: "kiloclaw.skill.performance-optimization" })
    log.info("executing performance analysis")

    const { code } = input as PerformanceInput

    if (!code || code.trim().length === 0) {
      return {
        bottlenecks: [],
        suggestions: [],
        estimatedImpact: {},
        summary: "No code provided for performance analysis",
      }
    }

    const bottlenecks = detectBottlenecks(code)
    const suggestions = generateSuggestions(bottlenecks)

    // Estimate impact
    const estimatedImpact: Record<string, string> = {}
    if (bottlenecks.some((b) => b.type === "algorithm")) {
      estimatedImpact["algorithm"] = "High - exponential complexity can cause severe slowdown"
    }
    if (bottlenecks.some((b) => b.type === "io")) {
      estimatedImpact["latency"] = "High - sequential I/O can be parallelized for significant gains"
    }
    if (bottlenecks.some((b) => b.type === "memory")) {
      estimatedImpact["memory"] = "Medium - caching can reduce redundant allocations"
    }

    const summary =
      bottlenecks.length === 0
        ? "No obvious performance bottlenecks detected"
        : `Found ${bottlenecks.length} potential bottleneck(s): ${bottlenecks.map((b) => b.type).join(", ")}`

    log.info("performance analysis completed", { bottlenecks: bottlenecks.length })

    return { bottlenecks, suggestions, estimatedImpact, summary }
  },
}

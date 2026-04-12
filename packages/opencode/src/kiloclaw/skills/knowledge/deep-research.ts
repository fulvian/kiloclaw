import { Log } from "@/util/log"
import { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"

// Deep research input
export interface DeepResearchInput {
  query: string
  depth?: "quick" | "standard" | "comprehensive"
  sources?: string[]
}

// Deep research output
export interface DeepResearchOutput {
  findings: ResearchFinding[]
  sources: ResearchSource[]
  gaps: ResearchGap[]
  summary: string
}

export interface ResearchFinding {
  claim: string
  confidence: "high" | "medium" | "low"
  sources: string[]
  caveats?: string[]
}

export interface ResearchSource {
  url: string
  title: string
  reliability: "high" | "medium" | "low"
  lastAccessed?: string
}

export interface ResearchGap {
  area: string
  description: string
  recommendation?: string
}

// Research quality tiers
const QUALITY_INDICATORS = {
  high: ["peer-reviewed", "official", "authoritative", "government", "academic"],
  medium: ["blog", "news", "report", "analysis"],
  low: ["forum", "social", "unverified", "anonymous"],
} as const

function assessSourceReliability(url: string): "high" | "medium" | "low" {
  const lower = url.toLowerCase()
  for (const indicator of QUALITY_INDICATORS.high) {
    if (lower.includes(indicator)) return "high"
  }
  for (const indicator of QUALITY_INDICATORS.medium) {
    if (lower.includes(indicator)) return "medium"
  }
  for (const indicator of QUALITY_INDICATORS.low) {
    if (lower.includes(indicator)) return "low"
  }
  return "medium"
}

export const DeepResearchSkill: Skill = {
  id: "deep-research" as SkillId,
  version: "1.0.0",
  name: "Deep Research",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Research question or topic" },
      depth: {
        type: "string",
        enum: ["quick", "standard", "comprehensive"],
        description: "Research depth (default: standard)",
      },
      sources: {
        type: "array",
        items: { type: "string" },
        description: "Preferred source types or specific sources",
      },
    },
    required: ["query"],
  },
  outputSchema: {
    type: "object",
    properties: {
      findings: { type: "array" },
      sources: { type: "array" },
      gaps: { type: "array" },
      summary: { type: "string" },
    },
  },
  capabilities: ["research-synthesis", "source-evaluation", "gap-analysis", "information-gathering"],
  tags: ["research", "knowledge", "analysis", "synthesis"],

  async execute(input: unknown, _context: SkillContext): Promise<DeepResearchOutput> {
    const log = Log.create({ service: "kiloclaw.skill.deep-research" })
    log.info("executing deep research", { query: (input as DeepResearchInput).query })

    const { query, depth = "standard" } = input as DeepResearchInput

    if (!query || query.trim().length === 0) {
      return {
        findings: [],
        sources: [],
        gaps: [],
        summary: "No query provided for research",
      }
    }

    // Simulate research findings based on query
    const findings: ResearchFinding[] = [
      {
        claim: `Analysis of "${query}" reveals multiple perspectives and considerations`,
        confidence: "medium",
        sources: ["web_search"],
        caveats: ["Requires verification from authoritative sources"],
      },
    ]

    const sources: ResearchSource[] = [
      {
        url: "https://example.com/authoritative-source",
        title: "Authoritative Source on Research Topic",
        reliability: assessSourceReliability("https://example.com/authoritative-source"),
        lastAccessed: new Date().toISOString(),
      },
    ]

    const gaps: ResearchGap[] = []
    if (depth === "comprehensive") {
      gaps.push({
        area: "Primary research",
        description: "No direct primary research sources were found",
        recommendation: "Consider accessing academic databases or conducting interviews",
      })
    }

    const summary =
      depth === "comprehensive"
        ? `Comprehensive research on "${query}" - ${findings.length} finding(s), ${sources.length} source(s), ${gaps.length} gap(s) identified`
        : `Research on "${query}" - ${findings.length} finding(s) from ${sources.length} source(s)`

    log.info("deep research completed", { query, depth, findings: findings.length })

    return { findings, sources, gaps, summary }
  },
}

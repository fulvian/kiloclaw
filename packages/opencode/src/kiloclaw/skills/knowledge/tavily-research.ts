import { Log } from "@/util/log"
import { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"

// Tavily research input
export interface TavilyResearchInput {
  query: string
  maxResults?: number
  topic?: "general" | "news" | "science" | "finance"
  includeAnswer?: boolean
}

// Tavily research output
export interface TavilyResearchOutput {
  results: TavilyResult[]
  answer?: string
  followUpQuestions: string[]
  summary: string
}

export interface TavilyResult {
  url: string
  title: string
  content: string
  publishedDate?: string
  score: number
}

function validateQuery(query: string): { valid: boolean; message: string } {
  if (!query || query.trim().length < 3) {
    return { valid: false, message: "Query must be at least 3 characters" }
  }
  if (query.length > 500) {
    return { valid: false, message: "Query must be less than 500 characters" }
  }
  return { valid: true, message: "Query is valid" }
}

export const TavilyResearchSkill: Skill = {
  id: "tavily-research" as SkillId,
  version: "1.0.0",
  name: "Tavily Research",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query for Tavily" },
      maxResults: {
        type: "number",
        description: "Maximum number of results (default: 5, max: 20)",
      },
      topic: {
        type: "string",
        enum: ["general", "news", "science", "finance"],
        description: "Topic category for search",
      },
      includeAnswer: {
        type: "boolean",
        description: "Include AI-generated answer (default: false)",
      },
    },
    required: ["query"],
  },
  outputSchema: {
    type: "object",
    properties: {
      results: { type: "array" },
      answer: { type: "string" },
      followUpQuestions: { type: "array", items: { type: "string" } },
      summary: { type: "string" },
    },
  },
  capabilities: ["web-search", "content-extraction", "ai-search", "topic-filtering"],
  tags: ["research", "search", "tavily", "ai-search"],

  async execute(input: unknown, _context: SkillContext): Promise<TavilyResearchOutput> {
    const log = Log.create({ service: "kiloclaw.skill.tavily-research" })
    log.info("executing Tavily research", { query: (input as TavilyResearchInput).query })

    const { query, maxResults = 5, topic = "general", includeAnswer = false } = input as TavilyResearchInput

    const validation = validateQuery(query)
    if (!validation.valid) {
      return {
        results: [],
        followUpQuestions: [],
        summary: validation.message,
      }
    }

    // Simulate Tavily results
    const results: TavilyResult[] = Array.from({ length: Math.min(maxResults, 5) }, (_, i) => ({
      url: `https://example.com/result-${i + 1}`,
      title: `Search Result ${i + 1} for "${query}"`,
      content: `Relevant content extracted from result ${i + 1} about "${query}"...`,
      publishedDate: new Date().toISOString(),
      score: 0.8 - i * 0.1,
    }))

    const answer = includeAnswer
      ? `AI-generated answer based on search results for "${query}". This provides a synthesized view of the top results.`
      : undefined

    const followUpQuestions = [
      `What are the latest developments in ${query}?`,
      `How does ${query} compare to related topics?`,
      `What are the pros and cons of ${query}?`,
    ]

    const summary = `Tavily search for "${query}" returned ${results.length} result(s) in ${topic} topic`

    log.info("Tavily research completed", { query, results: results.length })

    return { results, answer, followUpQuestions, summary }
  },
}

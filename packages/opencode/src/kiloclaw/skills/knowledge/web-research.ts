import { Log } from "@/util/log"
import { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"
import { WebSearchProvider } from "./providers"
import { Evidence, type Citation } from "./evidence"

// Search result item
export interface Result {
  readonly title: string
  readonly url: string
  readonly snippet: string
  readonly domain: string
  readonly publishedDate?: string
}

// Web research input schema
export interface WebResearchInput {
  query: string
  sources: number
}

// Web research output schema
export interface WebResearchOutput {
  results: Result[]
  summary: string
  query: string
  sourcesCount: number
  citations: Citation[]
  evidence: string[]
}

// Generate summary from results
function generateSummary(results: Result[], query: string): string {
  if (results.length === 0) {
    return `No search results found for "${query}".`
  }

  const domains = [...new Set(results.map((r) => r.domain))]
  const domainsStr = domains.slice(0, 3).join(", ")
  const first = results.at(0)?.domain ?? "unknown"

  return (
    `Found ${results.length} sources for "${query}" from ${domains.length} unique domains (${domainsStr}${domains.length > 3 ? ", and more" : ""}). ` +
    `Results include ${first} and additional external references.`
  )
}

export const WebResearchSkill: Skill = {
  id: "web-research" as SkillId,
  version: "1.0.0",
  name: "Web Research",
  inputSchema: {
    type: "object",
    properties: {
      query: { type: "string", description: "Search query string" },
      sources: { type: "number", description: "Maximum number of sources to return" },
    },
    required: ["query"],
  },
  outputSchema: {
    type: "object",
    properties: {
      results: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            url: { type: "string" },
            snippet: { type: "string" },
            domain: { type: "string" },
            publishedDate: { type: "string" },
          },
        },
      },
      summary: { type: "string", description: "Synthesis summary of results" },
      query: { type: "string", description: "Original query" },
      sourcesCount: { type: "number", description: "Number of sources returned" },
      citations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            url: { type: "string" },
            source: { type: "string" },
            snippet: { type: "string" },
          },
        },
      },
      evidence: { type: "array", items: { type: "string" } },
    },
  },
  capabilities: ["search", "synthesis", "web_scraping", "information_gathering"],
  tags: ["knowledge", "research", "search", "web"],

  async execute(input: unknown, context: SkillContext): Promise<WebResearchOutput> {
    const log = Log.create({ service: "kiloclaw.skill.web-research" })
    log.info("executing web research", { correlationId: context.correlationId })

    const { query, sources } = input as WebResearchInput

    if (!query) {
      log.warn("empty query provided for web research")
      return {
        results: [],
        summary: "No query provided",
        query: "",
        sourcesCount: 0,
        citations: [],
        evidence: [],
      }
    }

    const maxSources = Math.min(Math.max(sources || 5, 1), 20)
    const hits = await WebSearchProvider.search(query, maxSources)
    const results = hits.map((hit) => ({
      title: hit.title,
      url: hit.url,
      snippet: hit.snippet,
      domain: hit.source,
    }))
    const summary = generateSummary(results, query)
    const citations = Evidence.pack(
      results.map((r) => ({
        title: r.title,
        url: r.url,
        source: r.domain,
        snippet: r.snippet,
      })),
    )

    log.info("web research completed", {
      correlationId: context.correlationId,
      query,
      resultCount: results.length,
    })

    return {
      results,
      summary: `${summary} ${Evidence.summarize(query, citations.citations)}`,
      query,
      sourcesCount: results.length,
      citations: citations.citations,
      evidence: citations.references,
    }
  },
}

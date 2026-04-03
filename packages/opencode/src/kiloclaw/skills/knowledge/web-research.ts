import { Log } from "@/util/log"
import { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"
import { getCatalog, type SearchQuery, type SearchResult } from "../../agency/catalog"

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
  providersUsed: string[]
}

// Extract domain from URL
function extractDomain(url: string): string {
  try {
    const u = new URL(url)
    return u.hostname.replace(/^www\./, "")
  } catch {
    return "unknown"
  }
}

// Convert catalog SearchResult to Result
function convertResult(sr: SearchResult, domainOverride?: string): Result {
  return {
    title: sr.title,
    url: sr.url,
    snippet: sr.description,
    domain: domainOverride ?? extractDomain(sr.url),
    publishedDate: sr.publishedAt,
  }
}

// Perform web search using catalog providers
async function performWebSearch(
  query: string,
  maxResults: number,
): Promise<{ results: Result[]; providersUsed: string[] }> {
  const catalog = getCatalog()
  const providers = catalog.listProviders("knowledge")

  if (providers.length === 0) {
    // Fallback to mock if no providers configured
    return {
      results: generateMockResults(query, maxResults),
      providersUsed: [],
    }
  }

  const searchQuery: SearchQuery = {
    query,
    limit: maxResults,
  }

  const allResults: Result[] = []
  const providersUsed: string[] = []
  const errors: string[] = []

  // Try providers in order of preference: tavily > brave > ddg > wikipedia
  const providerOrder = ["tavily", "brave", "ddg", "wikipedia", "newsdata", "gnews"]
  const sortedProviders = providers.sort((a, b) => {
    const aIdx = providerOrder.indexOf(a.name)
    const bIdx = providerOrder.indexOf(b.name)
    return (aIdx === -1 ? 999 : aIdx) - (bIdx === -1 ? 999 : bIdx)
  })

  for (const provider of sortedProviders) {
    if (allResults.length >= maxResults) break

    try {
      const results = await provider.search(searchQuery)
      if (results.length > 0) {
        providersUsed.push(provider.name)
        for (const r of results) {
          if (allResults.length < maxResults) {
            allResults.push(convertResult(r))
          }
        }
      }
    } catch (err) {
      errors.push(`${provider.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Fallback to mock data if no providers returned results
  if (allResults.length === 0) {
    return {
      results: generateMockResults(query, maxResults),
      providersUsed: [],
    }
  }

  return { results: allResults, providersUsed }
}

// Generate mock results for fallback
function generateMockResults(query: string, maxResults: number): Result[] {
  const mockResults: Result[] = [
    {
      title: `Results for: ${query}`,
      url: "https://example.com/result-1",
      snippet: `This is a placeholder result for "${query}". Configure Tavily or Brave API keys for real search results.`,
      domain: "example.com",
      publishedDate: new Date().toISOString().split("T")[0],
    },
    {
      title: `Information about ${query}`,
      url: "https://example.org/result-2",
      snippet: `Another placeholder result for "${query}". Configure Tavily or Brave API keys for real search results.`,
      domain: "example.org",
      publishedDate: new Date().toISOString().split("T")[0],
    },
    {
      title: `${query} - Wikipedia`,
      url: "https://en.wikipedia.org/wiki/Topic",
      snippet: `Wikipedia article about ${query}. Configure Tavily or Brave API keys for real search results.`,
      domain: "wikipedia.org",
    },
  ]

  return mockResults.slice(0, maxResults)
}

// Generate summary from results
function generateSummary(results: Result[], query: string, providersUsed: string[]): string {
  if (results.length === 0) {
    return `No search results found for "${query}".`
  }

  const domains = [...new Set(results.map((r) => r.domain))]
  const domainsStr = domains.slice(0, 3).join(", ")
  const providerStr = providersUsed.length > 0 ? ` via ${providersUsed.join(", ")}` : ""
  const firstDomain = results[0]?.domain ?? "unknown"

  return (
    `Found ${results.length} sources for "${query}" from ${domains.length} unique domains (${domainsStr}${domains.length > 3 ? ", and more" : ""})${providerStr}. ` +
    `Results cover ${firstDomain} and other authoritative sources.`
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
      providersUsed: { type: "array", items: { type: "string" }, description: "Providers that returned results" },
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
        providersUsed: [],
      }
    }

    const maxSources = Math.min(Math.max(sources || 5, 1), 20)
    const { results, providersUsed } = await performWebSearch(query, maxSources)
    const summary = generateSummary(results, query, providersUsed)

    log.info("web research completed", {
      correlationId: context.correlationId,
      query,
      resultCount: results.length,
      providersUsed,
    })

    return {
      results,
      summary,
      query,
      sourcesCount: results.length,
      providersUsed,
    }
  },
}

// AgencyCatalog - Central registry for agencies, agents, skills, tools, and providers
// Mirrors ARIA's agency/catalog.go

import { Log } from "@/util/log"
import { type AgencyId, type Domain } from "../types"
import { Agency, type AgencyInfo } from "../agency"
import type { Agent } from "../agent"
import type { Skill } from "../skill"
import type { Tool } from "../tool"
import { KeyManager, type RateLimitConfig } from "./key-pool"
import { registerFlexibleAgents } from "./agency-definitions"

// Default rate limits per provider
// Firecrawl: 500 credits/month on free tier, ~16 req/day average, burst allowed
// Tavily: 500 searches/day on free tier, 15 RPM
const DEFAULT_RATE_LIMITS: Record<string, RateLimitConfig> = {
  tavily: { requestsPerMinute: 15, requestsPerDay: 500, retryAfterMs: 60000 },
  firecrawl: { requestsPerMinute: 20, requestsPerDay: 500, retryAfterMs: 60000 },
  brave: { requestsPerMinute: 60, requestsPerDay: 2000, retryAfterMs: 60000 },
  pubmed: { requestsPerMinute: 10, requestsPerDay: 500, retryAfterMs: 60000 },
  semanticscholar: { requestsPerMinute: 10, requestsPerDay: 500, retryAfterMs: 60000 },
  crossref: { requestsPerMinute: 50, requestsPerDay: 5000, retryAfterMs: 60000 },
  usda: { requestsPerMinute: 60, requestsPerDay: 10000, retryAfterMs: 60000 },
  openfoodfacts: { requestsPerMinute: 30, requestsPerDay: 5000, retryAfterMs: 60000 },
  openweathermap: { requestsPerMinute: 60, requestsPerDay: 50000, retryAfterMs: 60000 },
  weatherapi: { requestsPerMinute: 60, requestsPerDay: 1000000, retryAfterMs: 60000 },
}

export type { AgencyInfo } from "../agency"

export const CatalogEntryType = {
  agency: "agency",
  agent: "agent",
  skill: "skill",
  tool: "tool",
  provider: "provider",
} as const
export type CatalogEntryType = (typeof CatalogEntryType)[keyof typeof CatalogEntryType]

export interface CatalogEntry<T = unknown> {
  type: CatalogEntryType
  name: string
  version: string
  description: string
  data: T
  enabled: boolean
  tags: string[]
}

export interface Provider {
  name: string
  agency: Domain
  search(query: SearchQuery): Promise<SearchResult[]>
  extract?(urls: string[], query: string): Promise<ExtractedContent[]>
  health(): Promise<boolean>
}

export interface SearchQuery {
  query: string
  limit?: number
  domains?: string[]
  since?: string
  language?: string
}

export interface SearchResult {
  title: string
  url: string
  description: string
  publishedAt?: string
  provider: string
  score?: number
}

export interface ExtractedContent {
  url: string
  title: string
  content: string
  publishedAt?: string
}

// Keyed provider options for creating providers with automatic key rotation
interface KeyedProviderOptions {
  name: string
  agency: Domain
  rateLimit: RateLimitConfig
  search: (query: SearchQuery, apiKey: string) => Promise<Response>
  extract?: (urls: string[], query: string, apiKey: string) => Promise<Response>
  parseResults: (data: any) => SearchResult[]
}

// Create a provider with automatic key rotation via KeyPool
function createKeyedProvider(options: KeyedProviderOptions): Provider {
  const { name, agency, rateLimit, search, extract, parseResults } = options
  const log = Log.create({ service: `kiloclaw.provider.${name}` })
  const keyManager = KeyManager.getInstance()
  const pool = keyManager.getPool(name.toUpperCase(), rateLimit)

  return {
    name,
    agency,
    async search(query: SearchQuery): Promise<SearchResult[]> {
      const keyState = pool.getKey()
      if (!keyState) {
        throw new Error(`No available API keys for provider: ${name}`)
      }

      try {
        const response = await search(query, keyState.key)

        if (response.status === 429) {
          // Rate limited
          const retryAfter = response.headers.get("retry-after")
          pool.markRateLimited(keyState.key, retryAfter ? parseInt(retryAfter, 10) : undefined)
          // Try next key
          return this.search(query)
        }

        if (!response.ok) {
          const status = response.status
          // Mark key as errored (after 3 consecutive errors it goes to cooldown)
          pool.markError(keyState.key, `HTTP ${status}`)
          // Retry with next key for rate limits (429) or quota errors (4xx)
          // Non-retryable: 401 (auth), 403 (forbidden), 500+ (server error)
          if (status === 429 || (status >= 400 && status < 500)) {
            return this.search(query) // Try next key
          }
          throw new Error(`${name} API error: ${status}`)
        }

        pool.markSuccess(keyState.key)
        const data = await response.json()
        return parseResults(data)
      } catch (error: any) {
        const status = error?.status
        if (status === 429) {
          const retryAfter = error?.headers?.get?.("retry-after")
          pool.markRateLimited(keyState.key, retryAfter ? parseInt(retryAfter, 10) : undefined)
          return this.search(query) // Try next key
        }
        // For network errors or non-429 HTTP errors, mark error and retry
        if (status && status >= 400 && status < 500) {
          pool.markError(keyState.key, error?.message || String(error))
          return this.search(query) // Try next key
        }
        pool.markError(keyState.key, error?.message || String(error))
        throw error
      }
    },
    async extract(urls: string[], query: string): Promise<ExtractedContent[]> {
      if (!extract) return []

      const keyState = pool.getKey()
      if (!keyState) {
        throw new Error(`No available API keys for provider: ${name}`)
      }

      try {
        const response = await extract(urls, query, keyState.key)

        if (response.status === 429) {
          const retryAfter = response.headers.get("retry-after")
          pool.markRateLimited(keyState.key, retryAfter ? parseInt(retryAfter, 10) : undefined)
          return this.extract ? this.extract(urls, query) : []
        }

        if (!response.ok) {
          const status = response.status
          pool.markError(keyState.key, `HTTP ${status}`)
          if (status === 429 || (status >= 400 && status < 500)) {
            return this.extract ? this.extract(urls, query) : []
          }
          throw new Error(`${name} extract error: ${status}`)
        }

        pool.markSuccess(keyState.key)
        const data = await response.json()
        return (data.results ?? []).map((r: any) => ({
          url: r.url,
          title: r.title,
          content: r.raw_content ?? r.content ?? r.markdown ?? r.text ?? "",
          publishedAt: r.published_date,
        }))
      } catch (error: any) {
        const status = error?.status
        if (status === 429) {
          pool.markRateLimited(keyState.key)
          return this.extract ? this.extract(urls, query) : []
        }
        if (status && status >= 400 && status < 500) {
          pool.markError(keyState.key, error?.message || String(error))
          return this.extract ? this.extract(urls, query) : []
        }
        pool.markError(keyState.key, error?.message || String(error))
        throw error
      }
    },
    async health(): Promise<boolean> {
      try {
        const keyState = pool.getKey()
        if (!keyState) return false

        // Do a minimal health check
        const testResponse = await search({ query: "health", limit: 1 }, keyState.key)
        pool.markSuccess(keyState.key)
        return testResponse.ok
      } catch {
        return false
      }
    },
  }
}

// AgencyCatalog class
export class AgencyCatalog {
  private agencies = new Map<AgencyId, Agency>()
  private agents = new Map<string, Agent>() // key: "agencyId:agentName"
  private skills = new Map<string, Skill>() // key: skill name
  private tools = new Map<string, Tool>() // key: tool name
  private providers = new Map<string, Provider>() // key: provider name

  // Skill lookup indexes
  private skillsByTool = new Map<string, string>() // toolName -> skillName
  private skillsByMCP = new Map<string, string[]>() // mcpName -> skillNames[]

  private log = Log.create({ service: "kiloclaw.catalog" })

  // Agency management
  registerAgency(agency: Agency): void {
    this.agencies.set(agency.id, agency)
    this.log.info("agency registered", { agencyId: agency.id, domain: agency.domain })
  }

  getAgency(id: AgencyId): Agency | undefined {
    return this.agencies.get(id)
  }

  getAgencyByDomain(domain: Domain): Agency | undefined {
    for (const agency of this.agencies.values()) {
      if (agency.domain === domain) return agency
    }
    return undefined
  }

  listAgencies(): AgencyInfo[] {
    return [...this.agencies.values()].map((a) => ({
      id: a.id,
      domain: a.domain,
      status: a.status,
    }))
  }

  // Agent management
  registerAgent(agency: AgencyId, agent: Agent): void {
    const key = `${agency}:${agent.id}`
    this.agents.set(key, agent)
    this.log.debug("agent registered", { agencyId: agency, agentId: agent.id })
  }

  getAgent(agency: AgencyId, agentId: string): Agent | undefined {
    return this.agents.get(`${agency}:${agentId}`)
  }

  listAgents(agencyId?: AgencyId): string[] {
    if (agencyId) {
      return [...this.agents.keys()]
        .filter((k) => k.startsWith(`${agencyId}:`))
        .map((k) => k.split(":")[1])
        .filter((s): s is string => s !== undefined)
    }
    return [...this.agents.values()].map((a) => a.id)
  }

  // Skill management
  registerSkill(skill: Skill): void {
    this.skills.set(skill.id, skill)

    // Index by capabilities
    for (const cap of skill.capabilities) {
      this.skillsByTool.set(cap, skill.id)
    }

    this.log.debug("skill registered", { skillId: skill.id, name: skill.name })
  }

  getSkill(name: string): Skill | undefined {
    return this.skills.get(name)
  }

  listSkills(agency?: Domain): Skill[] {
    const all = [...this.skills.values()]
    if (!agency) return all
    // Filter by agency - skills don't have agency field in current impl,
    // so we filter by tags containing the agency name
    return all.filter((s) => s.tags.includes(agency))
  }

  findByTool(toolName: string): Skill | undefined {
    const skillName = this.skillsByTool.get(toolName)
    return skillName ? this.skills.get(skillName) : undefined
  }

  findByMCP(mcpName: string): Skill[] {
    const skillNames = this.skillsByMCP.get(mcpName) ?? []
    return skillNames.map((n) => this.skills.get(n)).filter(Boolean) as Skill[]
  }

  // Tool management
  registerTool(tool: Tool): void {
    this.tools.set(tool.id, tool)
    this.log.debug("tool registered", { toolId: tool.id })
  }

  getTool(name: string): Tool | undefined {
    return this.tools.get(name)
  }

  listTools(): Tool[] {
    return [...this.tools.values()]
  }

  // Provider management
  registerProvider(provider: Provider): void {
    this.providers.set(provider.name, provider)
    this.log.debug("provider registered", { name: provider.name, agency: provider.agency })
  }

  getProvider(name: string): Provider | undefined {
    return this.providers.get(name)
  }

  listProviders(agency?: Domain): Provider[] {
    const all = [...this.providers.values()]
    if (!agency) return all
    return all.filter((p) => p.agency === agency)
  }

  // Bootstrap with default catalog (Wave 1 + Wave 2 agencies)
  bootstrapDefaultCatalog(): void {
    this.log.info("bootstrapping default catalog")

    // Initialize API key pools from environment variables
    // This loads keys from formats like:
    // - TAVILY_API_KEY_1, TAVILY_API_KEY_2, ... (indexed)
    // - TAVILY_API_KEYS=key1,key2,key3 (comma-separated)
    // - TAVILY_API_KEY (single key, legacy)
    KeyManager.getInstance().loadAllFromEnv()

    if (this.agencies.size === 0) {
      this.registerAgency(
        Agency.create({
          id: "agency-development" as AgencyId,
          domain: "development",
        }),
      )
      this.registerAgency(
        Agency.create({
          id: "agency-knowledge" as AgencyId,
          domain: "knowledge",
        }),
      )
      this.registerAgency(
        Agency.create({
          id: "agency-nutrition" as AgencyId,
          domain: "nutrition",
        }),
      )
      this.registerAgency(
        Agency.create({
          id: "agency-weather" as AgencyId,
          domain: "weather",
        }),
      )
    }

    this.log.info("API key pools initialized", {
      providers: KeyManager.getInstance().listProviders(),
    })

    // Knowledge Agency providers (19 search/academic providers)
    this.bootstrapKnowledgeProviders()

    // Development Agency - no external providers, uses local tools

    // Nutrition Agency providers
    this.bootstrapNutritionProviders()

    // Weather Agency providers
    this.bootstrapWeatherProviders()

    this.log.info("default catalog bootstrapped", {
      agencies: this.agencies.size,
      skills: this.skills.size,
      providers: this.providers.size,
    })

    // Register flexible agents with prompt and permissions (Phase 2: Eliminazione Nativi)
    registerFlexibleAgents()
  }

  private bootstrapKnowledgeProviders(): void {
    // Tavily - primary web search
    this.registerProvider(
      createKeyedProvider({
        name: "tavily",
        agency: "knowledge",
        rateLimit: DEFAULT_RATE_LIMITS.tavily ?? { requestsPerMinute: 15, requestsPerDay: 500, retryAfterMs: 60000 },
        search: (query, apiKey) =>
          fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              query: query.query,
              search_depth: "basic",
              max_results: query.limit ?? 10,
            }),
          }),
        extract: (urls, query, apiKey) =>
          fetch("https://api.tavily.com/extract", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ urls, query }),
          }),
        parseResults: (data) =>
          (data.results ?? []).map((r: any) => ({
            title: r.title,
            url: r.url,
            description: r.content,
            publishedAt: r.published_date,
            provider: "tavily",
            score: r.score,
          })),
      }),
    )

    // Brave Search
    this.registerProvider({
      name: "brave",
      agency: "knowledge",
      async search(query: SearchQuery): Promise<SearchResult[]> {
        const apiKey = process.env.BRAVE_API_KEY
        if (!apiKey) throw new Error("BRAVE_API_KEY not configured")

        const params = new URLSearchParams({
          q: query.query,
          count: String(query.limit ?? 10),
        })

        const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
          headers: {
            Accept: "application/json",
            "X-Subscription-Token": apiKey,
          },
        })

        if (!response.ok) throw new Error(`Brave API error: ${response.status}`)

        const data = await response.json()
        return (data.web?.results ?? []).map((r: any) => ({
          title: r.title,
          url: r.url,
          description: r.description,
          publishedAt: r.age,
          provider: "brave",
        }))
      },
      async health(): Promise<boolean> {
        try {
          await this.search({ query: "health", limit: 1 })
          return true
        } catch {
          return false
        }
      },
    })

    // DuckDuckGo (free, no API key)
    this.registerProvider({
      name: "ddg",
      agency: "knowledge",
      async search(query: SearchQuery): Promise<SearchResult[]> {
        // Use HTML version for simple searches
        const params = new URLSearchParams({
          q: query.query,
          format: "json",
          no_redirect: "1",
        })

        const response = await fetch(`https://api.duckduckgo.com/?${params}`)
        const data = await response.json()

        const results: SearchResult[] = []

        // Related topics
        if (data.RelatedTopics) {
          for (const topic of data.RelatedTopics.slice(0, query.limit ?? 10)) {
            if (topic.Text && topic.FirstURL) {
              results.push({
                title: topic.Text.split(" - ")[0] || query.query,
                url: topic.FirstURL,
                description: topic.Text,
                provider: "ddg",
              })
            }
          }
        }

        // Abstract
        if (data.AbstractText) {
          results.unshift({
            title: data.Heading || query.query,
            url: data.AbstractURL,
            description: data.AbstractText,
            publishedAt: data.AbstractSource,
            provider: "ddg",
          })
        }

        return results
      },
      async health(): Promise<boolean> {
        return true // DuckDuckGo HTML API is generally available
      },
    })

    // Wikipedia
    this.registerProvider({
      name: "wikipedia",
      agency: "knowledge",
      async search(query: SearchQuery): Promise<SearchResult[]> {
        const params = new URLSearchParams({
          action: "query",
          list: "search",
          srsearch: query.query,
          format: "json",
          origin: "*",
        })

        const response = await fetch(`https://en.wikipedia.org/w/api.php?${params}`)
        const data = await response.json()

        return (data.query?.search ?? []).slice(0, query.limit ?? 10).map((r: any) => ({
          title: r.title,
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, "_"))}`,
          description: r.snippet.replace(/<[^>]*>/g, ""),
          publishedAt: new Date(r.timestamp).toISOString(),
          provider: "wikipedia",
        }))
      },
      async health(): Promise<boolean> {
        return true
      },
    })

    // PubMed
    this.registerProvider({
      name: "pubmed",
      agency: "knowledge",
      async search(query: SearchQuery): Promise<SearchResult[]> {
        const apiKey = process.env.PUBMED_API_KEY
        const baseUrl = apiKey
          ? "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
          : "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"

        // Search for IDs
        const searchParams = new URLSearchParams({
          db: "pubmed",
          term: query.query,
          retmax: String(query.limit ?? 10),
          retmode: "json",
          ...(apiKey && { api_key: apiKey }),
        })

        const searchRes = await fetch(`${baseUrl}/esearch.fcgi?${searchParams}`)
        const searchData = await searchRes.json()
        const ids = searchData.esearchresult?.idlist ?? []

        if (ids.length === 0) return []

        // Fetch details
        const fetchParams = new URLSearchParams({
          db: "pubmed",
          id: ids.join(","),
          retmode: "json",
          rettype: "abstract",
          ...(apiKey && { api_key: apiKey }),
        })

        const fetchRes = await fetch(`${baseUrl}/efetch.fcgi?${fetchParams}`)
        const fetchData = await fetchRes.json()

        const articles = fetchData.pubmedarticles?.pubmedarticle ?? []
        return articles.map((a: any) => {
          const art = a.medlinecitation?.article
          const abs = art?.abstract
          return {
            title: art?.articletitle?.["#text"] || "Unknown",
            url: `https://pubmed.ncbi.nlm.nih.gov/${a.pmid}`,
            description: abs?.abstracttext
              ? Array.isArray(abs.abstracttext)
                ? abs.abstracttext.map((t: any) => (typeof t === "string" ? t : t["#text"])).join(" ")
                : abs.abstracttext
              : "No abstract available",
            publishedAt: art?.articledate?.["#text"],
            provider: "pubmed",
          }
        })
      },
      async health(): Promise<boolean> {
        return true
      },
    })

    // arXiv
    this.registerProvider({
      name: "arxiv",
      agency: "knowledge",
      async search(query: SearchQuery): Promise<SearchResult[]> {
        const params = new URLSearchParams({
          search_query: `all:${query.query}`,
          start: "0",
          max_results: String(query.limit ?? 10),
          sortBy: "relevance",
        })

        const response = await fetch(`https://export.arxiv.org/api/query?${params}`)
        const text = await response.text()

        // Simple XML parsing
        const entries: SearchResult[] = []
        const entryRegex = /<entry>([\s\S]*?)<\/entry>/g
        let match

        while ((match = entryRegex.exec(text)) !== null && entries.length < (query.limit ?? 10)) {
          const entry = match[1]
          if (!entry) continue

          const titleMatch = /<title>([\s\S]*?)<\/title>/.exec(entry)
          const summaryMatch = /<summary>([\s\S]*?)<\/summary>/.exec(entry)
          const linkMatch = /<id>([\s\S]*?)<\/id>/.exec(entry)
          const publishedMatch = /<published>([\s\S]*?)<\/published>/.exec(entry)

          if (titleMatch && linkMatch && titleMatch[1] && linkMatch[1]) {
            entries.push({
              title: titleMatch[1].replace(/\s+/g, " ").trim(),
              url: linkMatch[1],
              description:
                summaryMatch && summaryMatch[1]
                  ? summaryMatch[1].replace(/\s+/g, " ").trim().slice(0, 300) + "..."
                  : "",
              publishedAt: publishedMatch?.[1],
              provider: "arxiv",
            })
          }
        }

        return entries
      },
      async health(): Promise<boolean> {
        return true
      },
    })

    // Semantic Scholar
    this.registerProvider({
      name: "semanticscholar",
      agency: "knowledge",
      async search(query: SearchQuery): Promise<SearchResult[]> {
        const apiKey = process.env.SEMANTICSCHOLAR_API_KEY
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        }
        if (apiKey) headers["x-api-key"] = apiKey

        const response = await fetch("https://api.semanticscholar.org/graph/v1/paper/search", {
          method: "POST",
          headers,
          body: JSON.stringify({
            query,
            limit: query.limit ?? 10,
            fields: "title,url,abstract,year,authors",
          }),
        })

        if (!response.ok) throw new Error(`Semantic Scholar API error: ${response.status}`)

        const data = await response.json()
        return (data.data ?? []).map((p: any) => ({
          title: p.title,
          url: p.url || `https://semanticscholar.org/paper/${p.paperId}`,
          description: p.abstract || "",
          publishedAt: p.year ? String(p.year) : undefined,
          provider: "semanticscholar",
        }))
      },
      async health(): Promise<boolean> {
        return true
      },
    })

    // CrossRef
    this.registerProvider({
      name: "crossref",
      agency: "knowledge",
      async search(query: SearchQuery): Promise<SearchResult[]> {
        const params = new URLSearchParams({
          query: query.query,
          rows: String(query.limit ?? 10),
        })

        const response = await fetch(`https://api.crossref.org/works?${params}`)
        const data = await response.json()

        return (data.message?.items ?? []).map((w: any) => ({
          title: w.title?.[0] || "Unknown",
          url: w.URL || w.DOI ? `https://doi.org/${w.DOI}` : "",
          description: w.abstract || w["container-title"]?.join(", ") || "",
          publishedAt: w.published?.["date-parts"]?.[0]?.[0] ? String(w.published["date-parts"][0][0]) : undefined,
          provider: "crossref",
        }))
      },
      async health(): Promise<boolean> {
        return true
      },
    })

    // NewsData.io (news provider)
    this.registerProvider({
      name: "newsdata",
      agency: "knowledge",
      async search(query: SearchQuery): Promise<SearchResult[]> {
        const apiKey = process.env.NEWSDATA_API_KEY
        if (!apiKey) throw new Error("NEWSDATA_API_KEY not configured")

        const params = new URLSearchParams({
          q: query.query,
          language: "en",
          size: String(query.limit ?? 10),
        })

        const response = await fetch(`https://newsdata.io/api/1/news?apikey=${apiKey}&${params}`)
        const data = await response.json()

        return (data.results ?? []).map((r: any) => ({
          title: r.title || "No title",
          url: r.link,
          description: r.description || r.content || "",
          publishedAt: r.pubDate,
          provider: "newsdata",
        }))
      },
      async health(): Promise<boolean> {
        return true
      },
    })

    // GNews (news provider)
    this.registerProvider({
      name: "gnews",
      agency: "knowledge",
      async search(query: SearchQuery): Promise<SearchResult[]> {
        const apiKey = process.env.GNEWS_API_KEY
        const baseUrl = apiKey ? `https://gnews.io/api/v4/search` : "https://gnews.io/api/v4/search"

        const params = new URLSearchParams({
          q: query.query,
          lang: "en",
          max: String(query.limit ?? 10),
          ...(apiKey && { apikey: apiKey }),
        })

        const response = await fetch(`${baseUrl}?${params}`)
        if (!response.ok) throw new Error(`GNews API error: ${response.status}`)

        const data = await response.json()
        return (data.articles ?? []).map((r: any) => ({
          title: r.title,
          url: r.url,
          description: r.description,
          publishedAt: r.publishedAt,
          provider: "gnews",
        }))
      },
      async health(): Promise<boolean> {
        return true
      },
    })

    // Firecrawl - web scraping and crawling (managed by KeyPool, same rotation path as Tavily)
    this.registerProvider(
      createKeyedProvider({
        name: "firecrawl",
        agency: "knowledge",
        rateLimit: DEFAULT_RATE_LIMITS.firecrawl ?? { requestsPerMinute: 20, requestsPerDay: 500, retryAfterMs: 60000 },
        search: (query, apiKey) =>
          fetch("https://api.firecrawl.dev/v0/search", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              query: query.query,
              limit: query.limit ?? 10,
            }),
          }),
        extract: (urls, query, apiKey) =>
          fetch("https://api.firecrawl.dev/v0/scrape", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              urls,
              query,
            }),
          }),
        parseResults: (data) =>
          (data.data ?? []).map((r: any) => ({
            title: r.title || "No title",
            url: r.url,
            description: r.description || r.excerpt || "",
            publishedAt: r.metadata?.publishedAt,
            provider: "firecrawl",
          })),
      }),
    )

    this.log.debug("knowledge providers bootstrapped", { count: this.listProviders("knowledge").length })
  }

  private bootstrapNutritionProviders(): void {
    // USDA FoodData Central (free API)
    this.registerProvider({
      name: "usda",
      agency: "nutrition",
      async search(query: SearchQuery): Promise<SearchResult[]> {
        const apiKey = process.env.USDA_API_KEY

        const params = new URLSearchParams({
          query: query.query,
          pageSize: String(query.limit ?? 10),
          ...(apiKey && { api_key: apiKey }),
        })

        const response = await fetch(`https://api.nal.usda.gov/fdc/v1/search?${params}`)
        const data = await response.json()

        return (data.foods ?? []).map((f: any) => ({
          title: f.description,
          url: `https://foodb.ca/compounds/${f.fdcId}`,
          description: `FDC ID: ${f.fdcId}${f.brandOwner ? ` | Brand: ${f.brandOwner}` : ""}`,
          provider: "usda",
        }))
      },
      async health(): Promise<boolean> {
        return true
      },
    })

    // OpenFoodFacts (free, no API key)
    this.registerProvider({
      name: "openfoodfacts",
      agency: "nutrition",
      async search(query: SearchQuery): Promise<SearchResult[]> {
        const params = new URLSearchParams({
          search_terms: query.query,
          search_simple: "1",
          action: "process",
          json: "1",
          page_size: String(query.limit ?? 10),
        })

        const response = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?${params}`)
        const data = await response.json()

        return (data.products ?? []).map((p: any) => ({
          title: p.product_name || p.code || "Unknown Product",
          url: p.url || `https://world.openfoodfacts.org/product/${p.code}`,
          description: [
            p.brands,
            p.categories,
            p.nutriscore_grade ? `Nutri-Score: ${p.nutriscore_grade.toUpperCase()}` : null,
          ]
            .filter(Boolean)
            .join(" | "),
          provider: "openfoodfacts",
        }))
      },
      async health(): Promise<boolean> {
        return true
      },
    })

    this.log.debug("nutrition providers bootstrapped", { count: this.listProviders("nutrition").length })
  }

  private bootstrapWeatherProviders(): void {
    // OpenWeatherMap
    this.registerProvider({
      name: "openweathermap",
      agency: "weather",
      async search(query: SearchQuery): Promise<SearchResult[]> {
        const apiKey = process.env.OPENWEATHERMAP_API_KEY
        if (!apiKey) throw new Error("OPENWEATHERMAP_API_KEY not configured")

        // First geocode the query
        const geoResponse = await fetch(
          `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(query.query)}&limit=1&appid=${apiKey}`,
        )
        const geoData = await geoResponse.json()

        if (!geoData.length) {
          return [
            {
              title: `Weather for ${query.query}`,
              url: "",
              description: "Location not found",
              provider: "openweathermap",
            },
          ]
        }

        const { lat, lon, name, country } = geoData[0]

        // Get current weather
        const weatherResponse = await fetch(
          `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric`,
        )
        const weatherData = await weatherResponse.json()

        return [
          {
            title: `Current Weather in ${name}, ${country}`,
            url: `https://openweathermap.org/city/${Math.round(lat * 100)}`,
            description: `${weatherData.weather?.[0]?.description || ""}, ${Math.round(weatherData.main?.temp || 0)}°C, Feels like ${Math.round(weatherData.main?.feels_like || 0)}°C`,
            publishedAt: new Date((weatherData.dt || 0) * 1000).toISOString(),
            provider: "openweathermap",
          },
        ]
      },
      async health(): Promise<boolean> {
        return true
      },
    })

    this.log.debug("weather providers bootstrapped", { count: this.listProviders("weather").length })
  }
}

// Singleton instance
let catalogInstance: AgencyCatalog | null = null
let defaultCatalogBootstrapped = false

export function getCatalog(): AgencyCatalog {
  if (!catalogInstance) {
    catalogInstance = new AgencyCatalog()
  }
  if (!defaultCatalogBootstrapped) {
    catalogInstance.bootstrapDefaultCatalog()
    defaultCatalogBootstrapped = true
  }
  return catalogInstance
}

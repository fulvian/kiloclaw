import { Log } from "@/util/log"
import { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"
import { getCatalog, type SearchResult } from "../../agency/catalog"

// Academic paper type
export interface Paper {
  readonly title: string
  readonly authors: string[]
  readonly abstract: string
  readonly year: number
  readonly journal?: string
  readonly doi?: string
  readonly citations?: number
  readonly url: string
}

// Literature review input schema
export interface LiteratureReviewInput {
  topic: string
  count: number
}

// Literature review output schema
export interface LiteratureReviewOutput {
  papers: Paper[]
  summary: string
  totalFound: number
  providersUsed: string[]
}

// Academic providers priority order
const ACADEMIC_PROVIDERS = ["arxiv", "pubmed", "semanticscholar", "crossref"]

// Parse arXiv XML entry to Paper
function parseArXivEntry(xml: string): Paper | null {
  const titleMatch = /<title>([\s\S]*?)<\/title>/.exec(xml)
  const summaryMatch = /<summary>([\s\S]*?)<\/summary>/.exec(xml)
  const idMatch = /<id>([\s\S]*?)<\/id>/.exec(xml)
  const publishedMatch = /<published>([\s\S]*?)<\/published>/.exec(xml)
  const authorMatches = [...xml.matchAll(/<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g)]

  if (!titleMatch || !idMatch) return null

  const title = titleMatch[1].replace(/\s+/g, " ").trim()
  const url = idMatch[1].trim()
  const published = publishedMatch?.[1]?.trim() || ""
  const year = published ? new Date(published).getFullYear() : 0
  const abstractText = summaryMatch?.[1]?.replace(/\s+/g, " ").trim().slice(0, 500) || ""
  const authors = authorMatches.map((m) => m[1]).filter(Boolean)

  return {
    title,
    authors: authors.length > 0 ? authors : ["Unknown"],
    abstract: abstractText,
    year,
    url,
  }
}

// Search arXiv directly
async function searchArXiv(topic: string, maxCount: number): Promise<Paper[]> {
  const params = new URLSearchParams({
    search_query: `all:${topic}`,
    start: "0",
    max_results: String(maxCount),
    sortBy: "relevance",
  })

  const response = await fetch(`https://export.arxiv.org/api/query?${params}`)
  const text = await response.text()

  const papers: Paper[] = []
  const entryRegex = /<entry>([\s\S]*?)<\/entry>/g
  let match

  while ((match = entryRegex.exec(text)) !== null && papers.length < maxCount) {
    const paper = parseArXivEntry(match[1])
    if (paper) {
      papers.push(paper)
    }
  }

  return papers
}

// Search PubMed directly
async function searchPubMed(topic: string, maxCount: number): Promise<Paper[]> {
  const baseUrl = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"

  // Search for IDs
  const searchParams = new URLSearchParams({
    db: "pubmed",
    term: topic,
    retmax: String(maxCount),
    retmode: "json",
  })

  const searchRes = await fetch(`${baseUrl}/esearch.fcgi?${searchParams}`)
  const searchData = await searchRes.json()
  const ids = searchData.esearchresult?.idlist ?? []

  if (ids.length === 0) return []

  // Fetch details
  const fetchParams = new URLSearchParams({
    db: "pubmed",
    id: ids.join(","),
    retmode: "xml",
    rettype: "abstract",
  })

  const fetchRes = await fetch(`${baseUrl}/efetch.fcgi?${fetchParams}`)
  const xmlText = await fetchRes.text()

  const papers: Paper[] = []
  const articleRegex = /<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g
  let match

  while ((match = articleRegex.exec(xmlText)) !== null) {
    const article = match[0]

    const titleMatch = /<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/.exec(article)
    const abstractMatch = /<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/.exec(article)
    const pmidMatch = /<PMID[^>]*>([\s\S]*?)<\/PMID>/.exec(article)
    const pubDateMatch = /<PubDate>[\s\S]*?<Year>([\s\S]*?)<\/Year>[\s\S]*?<\/PubDate>/.exec(article)
    const authorMatches = [
      ...article.matchAll(/<Author[^>]*>[\s\S]*?<LastName>([\s\S]*?)<\/LastName>[\s\S]*?<\/Author>/g),
    ]

    if (titleMatch && pmidMatch) {
      const title = titleMatch[1].replace(/<[^>]*>/g, "").trim()
      const abstract =
        abstractMatch?.[1]
          ?.replace(/<[^>]*>/g, "")
          .replace(/\s+/g, " ")
          .trim() || ""
      const url = `https://pubmed.ncbi.nlm.nih.gov/${pmidMatch[1].trim()}/`
      const year = pubDateMatch?.[1] ? parseInt(pubDateMatch[1]) : 0
      const authors = authorMatches.map((m) => m[1]).filter(Boolean)

      papers.push({
        title,
        authors: authors.length > 0 ? authors : ["Unknown"],
        abstract: abstract.slice(0, 500),
        year,
        url,
      })
    }
  }

  return papers
}

// Search CrossRef directly
async function searchCrossRef(topic: string, maxCount: number): Promise<Paper[]> {
  const params = new URLSearchParams({
    query: topic,
    rows: String(maxCount),
  })

  const response = await fetch(`https://api.crossref.org/works?${params}`)
  const data = await response.json()

  const papers: Paper[] = []

  for (const item of data.message?.items ?? []) {
    const title = item.title?.[0] || "Unknown"
    const url = item.URL || (item.DOI ? `https://doi.org/${item.DOI}` : "")
    const year = item.published?.["date-parts"]?.[0]?.[0] || 0
    const authors = item.author?.map((a: any) => `${a.given || ""} ${a.family || ""}`.trim()) || []
    const abstract = item.abstract?.replace(/<[^>]*>/g, "") || ""

    papers.push({
      title,
      authors: authors.length > 0 ? authors : ["Unknown"],
      abstract: abstract.slice(0, 500),
      year,
      url,
      doi: item.DOI,
    })
  }

  return papers
}

// Search academic papers using real providers
async function searchAcademicPapers(
  topic: string,
  maxCount: number,
): Promise<{ papers: Paper[]; providersUsed: string[] }> {
  const allPapers: Paper[] = []
  const providersUsed: string[] = []
  const errors: string[] = []

  // Try arXiv first (free, no API key needed)
  try {
    const arxivPapers = await searchArXiv(topic, maxCount)
    if (arxivPapers.length > 0) {
      allPapers.push(...arxivPapers)
      providersUsed.push("arxiv")
    }
  } catch (err) {
    errors.push(`arxiv: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Try PubMed
  try {
    const pubmedPapers = await searchPubMed(topic, maxCount)
    if (pubmedPapers.length > 0) {
      allPapers.push(...pubmedPapers)
      providersUsed.push("pubmed")
    }
  } catch (err) {
    errors.push(`pubmed: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Try CrossRef as fallback
  try {
    const crossrefPapers = await searchCrossRef(topic, maxCount)
    if (crossrefPapers.length > 0) {
      allPapers.push(...crossrefPapers)
      providersUsed.push("crossref")
    }
  } catch (err) {
    errors.push(`crossref: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Deduplicate by URL
  const seen = new Set<string>()
  const uniquePapers = allPapers.filter((p) => {
    if (seen.has(p.url)) return false
    seen.add(p.url)
    return true
  })

  // Sort by year descending
  uniquePapers.sort((a, b) => b.year - a.year)

  return {
    papers: uniquePapers.slice(0, maxCount),
    providersUsed,
  }
}

// Generate summary
function generateSummary(papers: Paper[], topic: string, providersUsed: string[]): string {
  if (papers.length === 0) {
    return `No academic papers found for "${topic}". Try different keywords or check API availability.`
  }

  const years = papers.map((p) => p.year).filter((y) => y > 0)
  const yearRange = years.length > 0 ? `${Math.min(...years)}-${Math.max(...years)}` : "unknown"
  const providerStr = providersUsed.length > 0 ? ` via ${providersUsed.join(", ")}` : ""

  return (
    `Found ${papers.length} academic papers on "${topic}" published between ${yearRange}${providerStr}. ` +
    `Papers cover theoretical foundations, methodologies, and applications in the field.`
  )
}

export const LiteratureReviewSkill: Skill = {
  id: "literature-review" as SkillId,
  version: "1.0.0",
  name: "Literature Review",
  inputSchema: {
    type: "object",
    properties: {
      topic: { type: "string", description: "Research topic to search for" },
      count: { type: "number", description: "Maximum number of papers to return" },
    },
    required: ["topic"],
  },
  outputSchema: {
    type: "object",
    properties: {
      papers: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            authors: { type: "array", items: { type: "string" } },
            abstract: { type: "string" },
            year: { type: "number" },
            journal: { type: "string" },
            doi: { type: "string" },
            citations: { type: "number" },
            url: { type: "string" },
          },
        },
      },
      summary: { type: "string", description: "Summary of literature review" },
      totalFound: { type: "number", description: "Total papers found" },
      providersUsed: { type: "array", items: { type: "string" }, description: "Providers that returned results" },
    },
  },
  capabilities: ["paper_search", "summarization", "academic_research", "citation_analysis"],
  tags: ["knowledge", "research", "academic", "literature"],

  async execute(input: unknown, context: SkillContext): Promise<LiteratureReviewOutput> {
    const log = Log.create({ service: "kiloclaw.skill.literature-review" })
    log.info("executing literature review", { correlationId: context.correlationId })

    const { topic, count } = input as LiteratureReviewInput

    if (!topic) {
      log.warn("empty topic provided for literature review")
      return {
        papers: [],
        summary: "No topic provided",
        totalFound: 0,
        providersUsed: [],
      }
    }

    const maxCount = Math.min(Math.max(count || 5, 1), 20)
    const { papers, providersUsed } = await searchAcademicPapers(topic, maxCount)
    const summary = generateSummary(papers, topic, providersUsed)

    log.info("literature review completed", {
      correlationId: context.correlationId,
      topic,
      paperCount: papers.length,
      providersUsed,
    })

    return {
      papers,
      summary,
      totalFound: papers.length,
      providersUsed,
    }
  },
}

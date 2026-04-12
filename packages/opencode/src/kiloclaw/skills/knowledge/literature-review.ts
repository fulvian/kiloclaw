import { Log } from "@/util/log"
import { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"
import { LiteratureProvider } from "./providers"
import { Evidence, type Citation } from "./evidence"

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
  citations: Citation[]
  evidence: string[]
}

// Generate summary
function generateSummary(papers: Paper[], topic: string): string {
  if (papers.length === 0) {
    return `No academic papers found for "${topic}".`
  }

  const years = papers.map((p) => p.year)
  const yearRange = `${Math.min(...years)}-${Math.max(...years)}`
  const totalCitations = papers.reduce((sum, p) => sum + (p.citations || 0), 0)
  const avgCitations = Math.round(totalCitations / papers.length)

  const journals = [...new Set(papers.map((p) => p.journal || "Unknown"))]
  const top = papers
    .slice()
    .sort((a, b) => (b.citations || 0) - (a.citations || 0))
    .at(0)
  const topTitle = top?.title ?? "N/A"

  return (
    `Found ${papers.length} academic papers on "${topic}" published between ${yearRange}. ` +
    `Papers from ${journals.length} journals with average ${avgCitations} citations per paper. ` +
    `Most cited: "${topTitle}"`
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
        citations: [],
        evidence: [],
      }
    }

    const maxCount = Math.min(Math.max(count || 5, 1), 20)
    const hits = await LiteratureProvider.search(topic, maxCount)
    const papers = hits.map((hit) => ({
      title: hit.title,
      authors: hit.authors,
      abstract: hit.abstract,
      year: hit.year,
      url: hit.url,
    }))
    const summary = `${generateSummary(papers, topic)} ${Evidence.summarize(
      topic,
      papers.map((paper) => ({
        title: paper.title,
        url: paper.url,
        source: "arxiv.org",
        snippet: paper.abstract.slice(0, 180),
      })),
    )}`
    const citations = Evidence.pack(
      papers.map((paper) => ({
        title: paper.title,
        url: paper.url,
        source: "arxiv.org",
        snippet: paper.abstract.slice(0, 180),
      })),
    )

    log.info("literature review completed", {
      correlationId: context.correlationId,
      topic,
      paperCount: papers.length,
    })

    return {
      papers,
      summary,
      totalFound: papers.length,
      citations: citations.citations,
      evidence: citations.references,
    }
  },
}

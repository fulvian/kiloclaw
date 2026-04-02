import { Log } from "@/util/log"
import { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"

// Document type for synthesis
export interface Document {
  readonly id: string
  readonly title: string
  readonly content: string
  readonly source?: string
  readonly type?: string
}

// Synthesis input schema
export interface SynthesisInput {
  documents: Document[]
  focus?: string
}

// Synthesis output schema
export interface SynthesisOutput {
  synthesis: string
  insights: string[]
  sourceReferences: { id: string; title: string }[]
  keyThemes: string[]
  confidence: number
}

// Extract key themes from documents
function extractKeyThemes(documents: Document[]): string[] {
  const themeCounts = new Map<string, number>()

  const commonThemes = [
    "performance",
    "security",
    "scalability",
    "usability",
    "reliability",
    "maintainability",
    "cost",
    "efficiency",
    "accuracy",
    "compatibility",
    "integration",
    "automation",
    "monitoring",
    "testing",
    "deployment",
  ]

  for (const doc of documents) {
    const content = doc.content.toLowerCase()
    for (const theme of commonThemes) {
      if (content.includes(theme)) {
        themeCounts.set(theme, (themeCounts.get(theme) || 0) + 1)
      }
    }
  }

  // Return themes that appear in at least half the documents
  const threshold = Math.ceil(documents.length / 2)
  return [...themeCounts.entries()]
    .filter(([_, count]) => count >= threshold)
    .sort((a, b) => b[1] - a[1])
    .map(([theme]) => theme)
}

// Extract insights from documents
function extractInsights(documents: Document[]): string[] {
  const insights: string[] = []

  // Generate summary insights based on document count and types
  if (documents.length === 0) {
    return ["No documents provided for synthesis"]
  }

  insights.push(`Synthesis of ${documents.length} document(s) provides comprehensive view`)

  // Check for consensus across documents
  const titles = documents.map((d) => d.title.toLowerCase())
  const hasConsensus = titles.some((t) => titles.filter((t2) => t2.includes(t) || t.includes(t2)).length > 1)

  if (hasConsensus) {
    insights.push("Documents show consensus on core topics")
  } else {
    insights.push("Documents cover varied perspectives on the topic")
  }

  // Extract named entities as potential insights
  const entityPatterns = [
    /(?:proposed|introduced|developed|created)\s+(\w+(?:\s+\w+){0,2})/gi,
    /(?:significant|important|key)\s+(\w+(?:\s+\w+){0,2})/gi,
  ]

  const entities = new Set<string>()
  for (const doc of documents) {
    for (const pattern of entityPatterns) {
      const matches = doc.content.matchAll(pattern)
      for (const match of matches) {
        if (match[1]) entities.add(match[1])
      }
    }
  }

  if (entities.size > 0) {
    insights.push(`Key concepts identified: ${[...entities].slice(0, 3).join(", ")}`)
  }

  // Add source attribution insights
  const sources = documents.filter((d) => d.source).map((d) => d.source)
  if (sources.length > 0) {
    insights.push(`Information sourced from ${[...new Set(sources)].length} unique source(s)`)
  }

  return insights
}

// Generate synthesis text
function generateSynthesis(documents: Document[], focus?: string): string {
  if (documents.length === 0) {
    return "No documents provided for synthesis."
  }

  const themes = extractKeyThemes(documents)
  const focusText = focus ? ` focused on ${focus}` : ""

  let synthesis = `Based on analysis of ${documents.length} document(s)${focusText}, `

  if (themes.length > 0) {
    synthesis += `key themes include: ${themes.join(", ")}. `
  }

  // Generate summary of first document
  if (documents[0]) {
    const firstSummary = documents[0].content.substring(0, 200).trim()
    synthesis += `Primary document "${documents[0].title}" covers ${firstSummary}...`
  }

  // Add comparative insight if multiple documents
  if (documents.length > 1) {
    synthesis += ` Additional documents provide supplementary perspectives and evidence.`
  }

  return synthesis
}

// Calculate confidence based on document quality indicators
function calculateConfidence(documents: Document[]): number {
  if (documents.length === 0) return 0

  let confidence = 0.5 // Base confidence

  // More documents increase confidence
  confidence += Math.min(0.2, documents.length * 0.05)

  // Check for source attribution
  const hasSources = documents.filter((d) => d.source).length
  if (hasSources > 0) {
    confidence += Math.min(0.15, hasSources * 0.05)
  }

  // Check for detailed content
  const avgLength = documents.reduce((sum, d) => sum + d.content.length, 0) / documents.length
  if (avgLength > 500) {
    confidence += 0.1
  }

  return Math.min(0.95, confidence)
}

export const SynthesisSkill: Skill = {
  id: "synthesis" as SkillId,
  version: "1.0.0",
  name: "Knowledge Synthesis",
  inputSchema: {
    type: "object",
    properties: {
      documents: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            content: { type: "string" },
            source: { type: "string" },
            type: { type: "string" },
          },
        },
        description: "Documents to synthesize",
      },
      focus: { type: "string", description: "Optional focus area for synthesis" },
    },
    required: ["documents"],
  },
  outputSchema: {
    type: "object",
    properties: {
      synthesis: { type: "string", description: "Synthesized summary" },
      insights: {
        type: "array",
        items: { type: "string" },
        description: "Key insights extracted",
      },
      sourceReferences: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
          },
        },
      },
      keyThemes: {
        type: "array",
        items: { type: "string" },
        description: "Common themes across documents",
      },
      confidence: { type: "number", description: "Synthesis confidence 0-1" },
    },
  },
  capabilities: ["multi_doc", "insight_extraction", "summarization", "theme_detection"],
  tags: ["knowledge", "synthesis", "research", "insights"],

  async execute(input: unknown, context: SkillContext): Promise<SynthesisOutput> {
    const log = Log.create({ service: "kiloclaw.skill.synthesis" })
    log.info("executing knowledge synthesis", { correlationId: context.correlationId })

    const { documents, focus } = input as SynthesisInput

    if (!documents || documents.length === 0) {
      log.warn("empty documents provided for synthesis")
      return {
        synthesis: "No documents provided for synthesis.",
        insights: ["No documents provided for synthesis"],
        sourceReferences: [],
        keyThemes: [],
        confidence: 0,
      }
    }

    const synthesis = generateSynthesis(documents, focus)
    const insights = extractInsights(documents)
    const keyThemes = extractKeyThemes(documents)
    const confidence = calculateConfidence(documents)

    const sourceReferences = documents.map((d) => ({
      id: d.id,
      title: d.title,
    }))

    log.info("knowledge synthesis completed", {
      correlationId: context.correlationId,
      docCount: documents.length,
      insightCount: insights.length,
      confidence,
    })

    return {
      synthesis,
      insights,
      sourceReferences,
      keyThemes,
      confidence,
    }
  },
}

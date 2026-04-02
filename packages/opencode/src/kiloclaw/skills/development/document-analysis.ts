import { Log } from "@/util/log"
import { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"

// Section type for parsed documents
export interface Section {
  title: string
  content: string
  level: number
  lineStart: number
  lineEnd: number
}

// Document analysis input schema
export interface DocumentAnalysisInput {
  content: string
  format: string
}

// Document analysis output schema
export interface DocumentAnalysisOutput {
  sections: Section[]
  summary: string
  metadata?: {
    wordCount: number
    lineCount: number
    hasCodeBlocks: boolean
    language?: string
  }
}

// Supported formats
const SUPPORTED_FORMATS = ["markdown", "md", "ascii", "txt", "rst", "adoc"]

// Common markdown patterns
const MARKDOWN_PATTERNS = {
  heading: /^(#{1,6})\s+(.+)$/gm,
  codeBlock: /```[\w]*\n([\s\S]*?)```/g,
  inlineCode: /`([^`]+)`/g,
  link: /\[([^\]]+)\]\(([^)]+)\)/g,
  list: /^[\s]*[-*+]\s+(.+)$/gm,
  numberedList: /^[\s]*\d+\.\s+(.+)$/gm,
  blockquote: /^>\s+(.+)$/gm,
  horizontalRule: /^[-*_]{3,}$/gm,
}

// Extract sections from markdown
function extractMarkdownSections(content: string): Section[] {
  const sections: Section[] = []
  const lines = content.split("\n")

  let currentSection: Section | null = null
  let currentContent: string[] = []
  let lineStart = 1

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)

    if (headingMatch) {
      // Save previous section
      if (currentSection) {
        currentSection.content = currentContent.join("\n").trim()
        currentSection.lineEnd = i
      }

      // New section
      const level = headingMatch[1].length
      const title = headingMatch[2].trim()
      currentSection = {
        title,
        content: "",
        level,
        lineStart: i + 1,
        lineEnd: lines.length,
      }
      currentContent = []
      sections.push(currentSection)
    } else if (currentSection) {
      currentContent.push(line)
    } else {
      // Content before first heading - create intro section
      const introSection: Section = {
        title: "Introduction",
        content: line.trim(),
        level: 0,
        lineStart: 1,
        lineEnd: i + 1,
      }
      if (introSection.content) {
        sections.unshift(introSection)
        currentSection = introSection
        currentContent = [line]
      }
    }
  }

  // Close last section
  if (currentSection && currentContent.length > 0) {
    currentSection.content = currentContent.join("\n").trim()
    currentSection.lineEnd = lines.length
  }

  return sections
}

// Extract sections from plain text (simple paragraph detection)
function extractPlainTextSections(content: string): Section[] {
  const sections: Section[] = []
  const lines = content.split("\n")

  let currentSection: Section | null = null
  let currentContent: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    // Detect section breaks (all caps line, or line with just dashes)
    const isSectionBreak = /^[A-Z][A-Z\s]+$/.test(trimmed) || /^-+$/.test(trimmed)

    if (isSectionBreak && trimmed.length > 0) {
      // Save previous section
      if (currentSection && currentContent.length > 0) {
        currentSection.content = currentContent.join("\n").trim()
        currentSection.lineEnd = i
        sections.push(currentSection)
      }

      // New section
      currentSection = {
        title: trimmed.replace(/-+/g, "").trim() || `Section ${sections.length + 1}`,
        content: "",
        level: 1,
        lineStart: i + 1,
        lineEnd: lines.length,
      }
      currentContent = []
    } else if (currentSection) {
      currentContent.push(line)
    } else {
      currentContent.push(line)
      // Create initial section if we have content
      if (currentContent.some((l) => l.trim().length > 0)) {
        currentSection = {
          title: "Document",
          content: "",
          level: 0,
          lineStart: 1,
          lineEnd: 1,
        }
      }
    }
  }

  // Close last section
  if (currentSection && currentContent.length > 0) {
    currentSection.content = currentContent.join("\n").trim()
    currentSection.lineEnd = lines.length
    sections.push(currentSection)
  }

  return sections
}

// Generate summary from content
function generateSummary(content: string, sections: Section[]): string {
  const wordCount = content.split(/\s+/).filter((w) => w.length > 0).length
  const lineCount = content.split("\n").length

  let summary = `Document with ${sections.length} section(s), ${wordCount} words, ${lineCount} lines.`

  if (sections.length > 0) {
    const sectionTitles = sections
      .slice(0, 5)
      .map((s) => s.title)
      .join(", ")
    summary += ` Main sections: ${sectionTitles}${sections.length > 5 ? "..." : ""}`
  }

  return summary
}

// Extract metadata from content
function extractMetadata(content: string): DocumentAnalysisOutput["metadata"] {
  const wordCount = content.split(/\s+/).filter((w) => w.length > 0).length
  const lineCount = content.split("\n").length
  const hasCodeBlocks = /```/.test(content)

  let language: string | undefined
  const langMatch = content.match(/```(\w+)/)
  if (langMatch) {
    language = langMatch[1]
  }

  return {
    wordCount,
    lineCount,
    hasCodeBlocks,
    language,
  }
}

export const DocumentAnalysisSkill: Skill = {
  id: "document-analysis" as SkillId,
  version: "1.0.0",
  name: "Document Analysis",
  inputSchema: {
    type: "object",
    properties: {
      content: { type: "string", description: "Document content to analyze" },
      format: { type: "string", description: "Document format (markdown, plain, etc.)" },
    },
    required: ["content"],
  },
  outputSchema: {
    type: "object",
    properties: {
      sections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            content: { type: "string" },
            level: { type: "number" },
            lineStart: { type: "number" },
            lineEnd: { type: "number" },
          },
        },
      },
      summary: { type: "string", description: "Document summary" },
      metadata: {
        type: "object",
        properties: {
          wordCount: { type: "number" },
          lineCount: { type: "number" },
          hasCodeBlocks: { type: "boolean" },
          language: { type: "string" },
        },
      },
    },
  },
  capabilities: ["parsing", "extraction", "summarization", "structure_analysis"],
  tags: ["development", "documentation", "analysis", "markdown"],

  async execute(input: unknown, context: SkillContext): Promise<DocumentAnalysisOutput> {
    const log = Log.create({ service: "kiloclaw.skill.document-analysis" })
    log.info("executing document analysis", { correlationId: context.correlationId })

    const { content, format } = input as DocumentAnalysisInput

    if (!content) {
      log.warn("empty content provided for document analysis")
      return {
        sections: [],
        summary: "No content provided",
      }
    }

    const formatLower = (format || "markdown").toLowerCase()
    let sections: Section[]

    if (MARKDOWN_PATTERNS.heading.test(content) || formatLower === "markdown" || formatLower === "md") {
      sections = extractMarkdownSections(content)
    } else {
      sections = extractPlainTextSections(content)
    }

    const summary = generateSummary(content, sections)
    const metadata = extractMetadata(content)

    log.info("document analysis completed", {
      correlationId: context.correlationId,
      sectionCount: sections.length,
      wordCount: metadata?.wordCount,
    })

    return {
      sections,
      summary,
      metadata,
    }
  },
}

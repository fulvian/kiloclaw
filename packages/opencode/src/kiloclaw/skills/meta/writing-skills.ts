import { Log } from "@/util/log"
import { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"

// Writing skills input
export interface WritingSkillsInput {
  type: "technical" | "documentation" | "creative" | "business" | "academic"
  topic: string
  audience?: string
  tone?: "formal" | "informal" | "technical"
  length?: "short" | "medium" | "long"
}

// Writing skills output
export interface WritingSkillsOutput {
  outline: string[]
  styleGuidelines: string[]
  structureRecommendation: string
  summary: string
}

// Writing type characteristics
const WRITING_TYPES = {
  technical: {
    characteristics: ["Code snippets", "Precise terminology", "Step-by-step instructions", "Error handling details"],
    style: ["Clear and concise", "Active voice preferred", "Imperative mood for instructions", "Consistent formatting"],
    structure: ["Overview", "Prerequisites", "Step-by-step", "Troubleshooting", "References"],
  },
  documentation: {
    characteristics: ["Explanatory", "Comprehensive", "Cross-referenced", "Version-aware"],
    style: ["Neutral tone", "Third-person perspective", "Complete sentences", "Technical accuracy"],
    structure: ["Introduction", "Main sections", "Examples", "FAQ", "Changelog"],
  },
  creative: {
    characteristics: ["Engaging narrative", "Vivid descriptions", "Emotional resonance", "Original voice"],
    style: ["Varied sentence length", "Active voice", "Show don't tell", "Evocative language"],
    structure: ["Hook", "Rising action", "Climax", "Resolution", "Theme revelation"],
  },
  business: {
    characteristics: ["Action-oriented", "Results-focused", "Professional tone", "Concise"],
    style: ["Professional", "Direct", "Outcome-focused", "Bullet points acceptable"],
    structure: ["Executive summary", "Key points", "Supporting details", "Call to action"],
  },
  academic: {
    characteristics: ["Evidence-based", "Proper citations", "Objective tone", "Logical flow"],
    style: ["Formal", "Passive voice common", "Complex sentences acceptable", "Precise language"],
    structure: ["Abstract", "Introduction", "Literature review", "Methodology", "Results", "Discussion", "References"],
  },
} as const

export const WritingSkillsSkill: Skill = {
  id: "writing-skills" as SkillId,
  version: "1.0.0",
  name: "Writing Skills",
  inputSchema: {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: ["technical", "documentation", "creative", "business", "academic"],
        description: "Type of writing",
      },
      topic: { type: "string", description: "Topic to write about" },
      audience: { type: "string", description: "Target audience" },
      tone: {
        type: "string",
        enum: ["formal", "informal", "technical"],
        description: "Writing tone (default: formal)",
      },
      length: {
        type: "string",
        enum: ["short", "medium", "long"],
        description: "Expected length (default: medium)",
      },
    },
    required: ["type", "topic"],
  },
  outputSchema: {
    type: "object",
    properties: {
      outline: { type: "array", items: { type: "string" } },
      styleGuidelines: { type: "array", items: { type: "string" } },
      structureRecommendation: { type: "string" },
      summary: { type: "string" },
    },
  },
  capabilities: ["writing-structure", "style-guidance", "audience-analysis", "tone-selection"],
  tags: ["writing", "documentation", "skills", "meta"],

  async execute(input: unknown, _context: SkillContext): Promise<WritingSkillsOutput> {
    const log = Log.create({ service: "kiloclaw.skill.writing-skills" })
    log.info("executing writing skills guidance", { type: (input as WritingSkillsInput).type })

    const { type, topic, audience = "general", tone = "formal", length = "medium" } = input as WritingSkillsInput

    const writingType = WRITING_TYPES[type]
    if (!writingType) {
      return {
        outline: [],
        styleGuidelines: [],
        structureRecommendation: "Unknown writing type",
        summary: `Unknown writing type: ${type}`,
      }
    }

    const outline = writingType.structure.map((section) => `${section}`)
    const styleGuidelines = [
      ...writingType.style,
      `Tone: ${tone}`,
      `Length: ${length}`,
      audience !== "general" ? `Audience: ${audience}` : "",
    ].filter(Boolean)

    const summary = `Writing ${type} content about "${topic}" for ${audience} audience`

    log.info("writing skills guidance provided", { type, topic })

    return {
      outline,
      styleGuidelines,
      structureRecommendation: `Recommended structure: ${writingType.structure.join(" → ")}`,
      summary,
    }
  },
}

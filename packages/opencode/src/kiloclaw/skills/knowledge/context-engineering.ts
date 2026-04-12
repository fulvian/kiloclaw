import { Log } from "@/util/log"
import { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"

// Context engineering input
export interface ContextEngineeringInput {
  action: "compress" | "expand" | "structure" | "rank"
  content: string
  targetLength?: number
  preserve?: string[]
}

// Context engineering output
export interface ContextEngineeringOutput {
  result: string
  metadata: ContextMetadata
  summary: string
}

export interface ContextMetadata {
  originalLength: number
  resultLength: number
  compressionRatio?: number
  preservedElements: string[]
  discardedElements: string[]
}

// Priority heuristics for context preservation
const HIGH_PRIORITY_PATTERNS = [
  /\b(?:important|critical|essential|must|required|key)\b/gi,
  /\b(?:because|therefore|thus|hence|so|however|but)\b/gi,
  /\d+%/g,
  /\$[0-9,]+/g,
] as const

const LOW_PRIORITY_PATTERNS = [
  /\b(?:the|a|an|is|are|was|were|be|been|being)\b/gi,
  /\b(?:very|really|quite|somewhat|a bit)\b/gi,
] as const

function compressContent(
  content: string,
  targetLength: number,
  preserve: string[],
): { compressed: string; preserved: string[]; discarded: string[] } {
  const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 0)
  const scored = sentences.map((s) => {
    let score = 0
    for (const pattern of HIGH_PRIORITY_PATTERNS) {
      if (pattern.test(s)) score += 1
    }
    for (const pattern of LOW_PRIORITY_PATTERNS) {
      if (pattern.test(s)) score -= 0.5
    }
    return { sentence: s.trim(), score }
  })

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score)

  // Build compressed result up to target length
  let result = ""
  const preserved: string[] = []
  for (const item of scored) {
    if (result.length + item.sentence.length > targetLength) break
    result += item.sentence + ". "
    preserved.push(item.sentence.substring(0, 50))
  }

  const allSentences = new Set(sentences)
  const keptSentences = new Set(preserved.map((p) => p.replace(/\.\.\.$/, "")))
  const discarded = [...allSentences].filter((s) => !keptSentences.has(s))

  return { compressed: result.trim(), preserved, discarded }
}

export const ContextEngineeringSkill: Skill = {
  id: "context-engineering" as SkillId,
  version: "1.0.0",
  name: "Context Engineering",
  inputSchema: {
    type: "object",
    properties: {
      action: {
        type: "string",
        enum: ["compress", "expand", "structure", "rank"],
        description: "Context operation to perform",
      },
      content: { type: "string", description: "Content to process" },
      targetLength: {
        type: "number",
        description: "Target length for compression (characters)",
      },
      preserve: {
        type: "array",
        items: { type: "string" },
        description: "Elements to preserve during compression",
      },
    },
    required: ["action", "content"],
  },
  outputSchema: {
    type: "object",
    properties: {
      result: { type: "string" },
      metadata: { type: "object" },
      summary: { type: "string" },
    },
  },
  capabilities: ["context-compression", "context-expansion", "content-structuring", "relevance-ranking"],
  tags: ["context", "engineering", "compression", "llm-optimization"],

  async execute(input: unknown, _context: SkillContext): Promise<ContextEngineeringOutput> {
    const log = Log.create({ service: "kiloclaw.skill.context-engineering" })
    log.info("executing context engineering", { action: (input as ContextEngineeringInput).action })

    const { action, content, targetLength = 1000, preserve = [] } = input as ContextEngineeringInput

    if (!content || content.trim().length === 0) {
      return {
        result: "",
        metadata: {
          originalLength: 0,
          resultLength: 0,
          preservedElements: [],
          discardedElements: [],
        },
        summary: "No content provided for context engineering",
      }
    }

    const originalLength = content.length

    switch (action) {
      case "compress": {
        const { compressed, preserved: preservedElems, discarded } = compressContent(content, targetLength, preserve)
        return {
          result: compressed,
          metadata: {
            originalLength,
            resultLength: compressed.length,
            compressionRatio: compressed.length / originalLength,
            preservedElements: preservedElems,
            discardedElements: discarded,
          },
          summary: `Compressed from ${originalLength} to ${compressed.length} chars (${((compressed.length / originalLength) * 100).toFixed(1)}%)`,
        }
      }

      case "expand": {
        // Simulate expansion with additional context
        const expanded = content + "\n\nAdditional context and elaboration on the above content."
        return {
          result: expanded,
          metadata: {
            originalLength,
            resultLength: expanded.length,
            preservedElements: preserve,
            discardedElements: [],
          },
          summary: `Expanded from ${originalLength} to ${expanded.length} chars`,
        }
      }

      case "structure": {
        // Add structure markers
        const structured = `## Summary\n${content.substring(0, 200)}...\n\n## Details\n${content}`
        return {
          result: structured,
          metadata: {
            originalLength,
            resultLength: structured.length,
            preservedElements: preserve,
            discardedElements: [],
          },
          summary: "Content structured with headers",
        }
      }

      case "rank": {
        // Rank by relevance (simulated)
        const sentences = content.split(/[.!?]+/).filter((s) => s.trim().length > 0)
        const ranked = sentences
          .map((s) => {
            let score = 0
            for (const pattern of HIGH_PRIORITY_PATTERNS) {
              if (pattern.test(s)) score += 1
            }
            return { sentence: s.trim(), score }
          })
          .sort((a, b) => b.score - a.score)
          .map((item) => `[score:${item.score}] ${item.sentence}`)

        const result = ranked.join("\n")
        return {
          result,
          metadata: {
            originalLength,
            resultLength: result.length,
            preservedElements: preserve,
            discardedElements: [],
          },
          summary: `Ranked ${sentences.length} sentences by relevance`,
        }
      }

      default:
        return {
          result: content,
          metadata: {
            originalLength,
            resultLength: originalLength,
            preservedElements: preserve,
            discardedElements: [],
          },
          summary: `Unknown action: ${action}`,
        }
    }
  },
}

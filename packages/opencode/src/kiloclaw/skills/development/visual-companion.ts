import { Log } from "@/util/log"
import { Skill } from "../../skill"
import type { SkillContext } from "../../skill"
import { SkillId } from "../../types"

// Visual companion input
export interface VisualCompanionInput {
  task: "layout" | "color" | "typography" | "component" | "design-review"
  context?: string
  code?: string
}

// Visual companion output
export interface VisualCompanionOutput {
  task: string
  observations: DesignObservation[]
  suggestions: DesignSuggestion[]
  summary: string
}

export interface DesignObservation {
  type: "layout" | "color" | "typography" | "spacing" | "consistency"
  severity: "info" | "warning" | "error"
  description: string
  location?: string
}

export interface DesignSuggestion {
  type: "layout" | "color" | "typography" | "spacing" | "component"
  description: string
  rationale: string
  example?: string
}

// Design system principles
const SPACING_SCALE = [4, 8, 12, 16, 24, 32, 48, 64, 96]
const TYPOGRAPHY_SCALE = [12, 14, 16, 18, 20, 24, 32, 40, 48, 64]

function checkSpacing(code: string): DesignObservation[] {
  const observations: DesignObservation[] = []

  // Check for magic numbers in spacing
  const magicSpacing = code.match(/\b(\d+)(?:px|rem|em)\b(?!\s*(?:\/\s*\d+))/g)
  if (magicSpacing) {
    const uniqueValues = [...new Set(magicSpacing)]
    const nonStandard = uniqueValues.filter((v) => {
      const num = parseInt(v)
      return !SPACING_SCALE.includes(num)
    })
    if (nonStandard.length > 0) {
      observations.push({
        type: "spacing",
        severity: "warning",
        description: `Found non-standard spacing values: ${nonStandard.join(", ")}. Use spacing scale: ${SPACING_SCALE.join(", ")}`,
      })
    }
  }

  return observations
}

function checkTypography(code: string): DesignObservation[] {
  const observations: DesignObservation[] = []

  // Check for font sizes
  const fontSizes = code.match(/font-size:\s*(\d+)(?:px|rem|em)/gi)
  if (fontSizes) {
    const uniqueSizes = [...new Set(fontSizes)]
    if (uniqueSizes.length > 8) {
      observations.push({
        type: "typography",
        severity: "info",
        description: "Consider consolidating font sizes to a defined scale",
      })
    }
  }

  return observations
}

export const VisualCompanionSkill: Skill = {
  id: "visual-companion" as SkillId,
  version: "1.0.0",
  name: "Visual Companion",
  inputSchema: {
    type: "object",
    properties: {
      task: {
        type: "string",
        enum: ["layout", "color", "typography", "component", "design-review"],
        description: "Visual design task to perform",
      },
      context: {
        type: "string",
        description: "Context or description of the design task",
      },
      code: {
        type: "string",
        description: "Code or markup to analyze (CSS, HTML, JSX, etc.)",
      },
    },
    required: ["task"],
  },
  outputSchema: {
    type: "object",
    properties: {
      task: { type: "string" },
      observations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string" },
            severity: { type: "string" },
            description: { type: "string" },
            location: { type: "string" },
          },
        },
      },
      suggestions: {
        type: "array",
        items: {
          type: "object",
          properties: {
            type: { type: "string" },
            description: { type: "string" },
            rationale: { type: "string" },
            example: { type: "string" },
          },
        },
      },
      summary: { type: "string" },
    },
  },
  capabilities: ["visual-design", "layout-analysis", "design-review", "ui-consistency"],
  tags: ["design", "ui", "visual", "css", "frontend"],

  async execute(input: unknown, _context: SkillContext): Promise<VisualCompanionOutput> {
    const log = Log.create({ service: "kiloclaw.skill.visual-companion" })
    log.info("executing visual companion analysis", { task: (input as VisualCompanionInput).task })

    const { task, context, code = "" } = input as VisualCompanionInput
    const observations: DesignObservation[] = []
    const suggestions: DesignSuggestion[] = []

    if (code) {
      observations.push(...checkSpacing(code))
      observations.push(...checkTypography(code))
    }

    switch (task) {
      case "layout":
        suggestions.push({
          type: "layout",
          description: "Use CSS Grid or Flexbox for layout",
          rationale: "Modern layout techniques provide better responsiveness and maintainability",
          example: "display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));",
        })
        suggestions.push({
          type: "spacing",
          description: "Establish consistent spacing using a scale",
          rationale: "A spacing scale creates visual rhythm and consistency",
          example: `spacing: [${SPACING_SCALE.join(", ")}]`,
        })
        break

      case "color":
        suggestions.push({
          type: "color",
          description: "Define a limited color palette (5-7 colors max)",
          rationale: "Consistent colors create cohesive design and easier maintenance",
        })
        suggestions.push({
          type: "color",
          description: "Ensure color contrast meets WCAG AA (4.5:1 for text)",
          rationale: "Accessibility requires readable text contrast",
        })
        break

      case "typography":
        suggestions.push({
          type: "typography",
          description: `Use a type scale (e.g., ${TYPOGRAPHY_SCALE.join("/")})`,
          rationale: "A type scale creates visual hierarchy and rhythm",
        })
        suggestions.push({
          type: "typography",
          description: "Limit font weights to regular (400) and bold (600 or 700)",
          rationale: "Too many weights complicate the design",
        })
        break

      case "component":
        suggestions.push({
          type: "component",
          description: "Design reusable components with consistent APIs",
          rationale: "Consistent components reduce cognitive load and speed up development",
        })
        suggestions.push({
          type: "component",
          description: "Document component variants and states",
          rationale: "Clear documentation helps team members use components correctly",
        })
        break

      case "design-review":
        observations.push({
          type: "consistency",
          severity: "info",
          description: "Review spacing, typography, and color usage for consistency",
        })
        suggestions.push({
          type: "layout",
          description: "Check visual hierarchy - most important elements should be most prominent",
          rationale: "Clear hierarchy guides users through content naturally",
        })
        break
    }

    const summary =
      observations.length === 0 && suggestions.length === 0
        ? `No specific observations for ${task} task`
        : `Found ${observations.length} observation(s) and ${suggestions.length} suggestion(s) for ${task}`

    log.info("visual companion completed", { task, observations: observations.length })

    return { task, observations, suggestions, summary }
  },
}

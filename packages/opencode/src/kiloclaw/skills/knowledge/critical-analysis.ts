import { Log } from "@/util/log"
import { Skill, SkillContext } from "../skill"
import { SkillId } from "../types"

// Critical analysis input schema
interface CriticalAnalysisInput {
  claim: string
  context?: string
}

// Critical analysis output schema
interface CriticalAnalysisOutput {
  analysis: string
  counterArgs: string[]
  strengths: string[]
  weaknesses: string[]
  confidence: number
  logicalFallacies: string[]
}

// Common logical fallacies
const FALLACIES = {
  strawman: {
    pattern: /misrepresents?\s+(?:someone[''']s|the)\s+(?:position|argument|view)/i,
    description: "Straw man argument - misrepresents opponent's position",
  },
  adHominem: {
    pattern: /(?:you[''']re|they[''']re|he[''']s|she[''']s)\s+(?:wrong|stupid|idiot|moron|liar)/i,
    description: "Ad hominem - attacks the person rather than the argument",
  },
  appealToAuthority: {
    pattern: /(?:because|since|I'm|i'm|I am)\s+(?:a\s+)?(?:famous|expert|权威|scientist|doctor|professor)/i,
    description: "Appeal to authority - uses authority rather than evidence",
  },
  falseDichotomy: {
    pattern: /\b(?:either|only)\s+(?:you[''']re|it[''']s)\s+(?:with\s+us|right|wrong|this|that)/i,
    description: "False dichotomy - presents only two options when more exist",
  },
  slipperySlope: {
    pattern: /if\s+\w+,\s+then\s+eventually\s+\w+,\s+then\s+\w+/i,
    description: "Slippery slope - assumes chain of events without evidence",
  },
  circular: {
    pattern: /(?:because|since)\s+(?:I[''']m|i[''']m)\s+(?:right|correct)\b/gi,
    description: "Circular reasoning - uses conclusion as premise",
  },
  hastyGeneralization: {
    pattern: /\ball\s+\w+\s+(?:are|is)\s+\w+\b/i,
    description: "Hasty generalization - sweeping statement without evidence",
  },
}

// Extract potential logical fallacies
function detectFallacies(text: string): string[] {
  const detectedFallacies: string[] = []

  for (const [name, fallacy] of Object.entries(FALLACIES)) {
    if (fallacy.pattern.test(text)) {
      detectedFallacies.push(fallacy.description)
    }
  }

  return detectedFallacies
}

// Analyze claim strengths
function analyzeStrengths(claim: string): string[] {
  const strengths: string[] = []

  // Check for evidence indicators
  if (/\b(?:studies|research|data|evidence|statistics|figures)\b/i.test(claim)) {
    strengths.push("References to empirical evidence or data")
  }

  // Check for specific details
  if (/\d+%|\d+\s+(?:percent|people|years|times)/.test(claim)) {
    strengths.push("Contains quantitative information")
  }

  // Check for balanced language
  if (/\b(?:however|although|while|whereas|nevertheless)\b/i.test(claim)) {
    strengths.push("Acknowledges complexity or nuance")
  }

  // Check for source attribution
  if (/\b(?:according to|via|stated by|from)\b/i.test(claim)) {
    strengths.push("Attributes information to sources")
  }

  // Check for logical connectors
  if (/\b(?:therefore|thus|hence|consequently|as a result)\b/i.test(claim)) {
    strengths.push("Uses logical reasoning structure")
  }

  return strengths.length > 0 ? strengths : ["Claim structure is simple"]
}

// Analyze claim weaknesses
function analyzeWeaknesses(claim: string): string[] {
  const weaknesses: string[] = []

  // Check for vague language
  if (/\b(?:some|many|few|often|sometimes|might|could)\b/i.test(claim)) {
    weaknesses.push("Contains vague quantifiers without specifics")
  }

  // Check for absolute language
  if (/\b(?:always|never|everyone|no one|all|none|every)\b/i.test(claim)) {
    weaknesses.push("Contains absolute claims that may be overly broad")
  }

  // Check for emotional appeals
  if (/\b(?:love|hate|fear|hope|dream|amazing|terrible|awful)\b/i.test(claim)) {
    weaknesses.push("Contains emotional language rather than objective facts")
  }

  // Check for lack of evidence
  if (!/\b(?:because|since|therefore|thus|evidence|studies|research)\b/i.test(claim)) {
    weaknesses.push("Lacks explicit supporting reasoning or evidence")
  }

  return weaknesses.length > 0 ? weaknesses : ["Claim appears reasonably structured"]
}

// Generate counter-arguments
function generateCounterArgs(claim: string): string[] {
  const counterArgs: string[] = []

  // Check for generalizations
  if (/\ball\b/.test(claim)) {
    counterArgs.push("Counter: Not all cases follow this pattern - there are exceptions")
  }

  if (/\bnever\b/.test(claim)) {
    counterArgs.push("Counter: There may be documented cases where this doesn't apply")
  }

  if (/\balways\b/.test(claim)) {
    counterArgs.push("Counter: Context and circumstances may vary the outcome")
  }

  // Check for causal claims
  if (/\bcauses?\b/i.test(claim) || /\bleads?\s+to\b/i.test(claim)) {
    counterArgs.push("Counter: Correlation does not imply causation - other factors may be involved")
  }

  // Check for absolute claims
  if (/\b(?:must|should always|has to)\b/i.test(claim)) {
    counterArgs.push("Counter: Alternative approaches or perspectives may be equally valid")
  }

  // Generate a general counter-argument
  if (counterArgs.length === 0) {
    counterArgs.push("Counter: Consider alternative interpretations or perspectives on this claim")
    counterArgs.push("Counter: What evidence would be needed to refute this claim?")
  }

  return counterArgs
}

// Generate main analysis
function generateAnalysis(claim: string, strengths: string[], weaknesses: string[], fallacies: string[]): string {
  let analysis = `Critical analysis of: "${claim.substring(0, 100)}${claim.length > 100 ? "..." : ""}"\n\n`

  if (strengths.length > 0) {
    analysis += `**Strengths:**\n`
    for (const strength of strengths.slice(0, 3)) {
      analysis += `- ${strength}\n`
    }
    analysis += `\n`
  }

  if (weaknesses.length > 0) {
    analysis += `**Weaknesses:**\n`
    for (const weakness of weaknesses.slice(0, 3)) {
      analysis += `- ${weakness}\n`
    }
    analysis += `\n`
  }

  if (fallacies.length > 0) {
    analysis += `**Potential Logical Issues:**\n`
    for (const fallacy of fallacies.slice(0, 2)) {
      analysis += `- ${fallacy}\n`
    }
  } else {
    analysis += `**Logical Soundness:** The argument appears to be logically structured without obvious fallacies.`
  }

  return analysis
}

// Calculate confidence in analysis
function calculateConfidence(claim: string, fallacies: string[]): number {
  let confidence = 0.6 // Base confidence

  // More specific claims can be analyzed more confidently
  if (/\d+/.test(claim)) confidence += 0.1
  if (/\b(?:because|since|therefore)\b/i.test(claim)) confidence += 0.1

  // Reduce confidence if fallacies detected
  confidence -= fallacies.length * 0.1

  return Math.max(0.2, Math.min(0.9, confidence))
}

export const CriticalAnalysisSkill: Skill = {
  id: "critical-analysis" as SkillId,
  version: { major: 1, minor: 0, patch: 0 },
  name: "Critical Analysis",
  inputSchema: {
    type: "object",
    properties: {
      claim: { type: "string", description: "Claim or statement to analyze" },
      context: { type: "string", description: "Optional context for the claim" },
    },
    required: ["claim"],
  },
  outputSchema: {
    type: "object",
    properties: {
      analysis: { type: "string", description: "Detailed critical analysis" },
      counterArgs: {
        type: "array",
        items: { type: "string" },
        description: "Potential counter-arguments",
      },
      strengths: {
        type: "array",
        items: { type: "string" },
        description: "Identified strengths of the argument",
      },
      weaknesses: {
        type: "array",
        items: { type: "string" },
        description: "Identified weaknesses of the argument",
      },
      confidence: { type: "number", description: "Confidence in analysis 0-1" },
      logicalFallacies: {
        type: "array",
        items: { type: "string" },
        description: "Detected logical fallacies",
      },
    },
  },
  capabilities: ["reasoning", "counter_arguments", "logical_analysis", "critical_thinking"],
  tags: ["knowledge", "analysis", "reasoning", "critical-thinking"],

  async execute(input: unknown, context: SkillContext): Promise<CriticalAnalysisOutput> {
    const log = Log.create({ service: "kiloclaw.skill.critical-analysis" })
    log.info("executing critical analysis", { correlationId: context.correlationId })

    const { claim, context: ctx } = input as CriticalAnalysisInput

    if (!claim) {
      log.warn("empty claim provided for critical analysis")
      return {
        analysis: "No claim provided for analysis.",
        counterArgs: [],
        strengths: [],
        weaknesses: [],
        confidence: 0,
        logicalFallacies: [],
      }
    }

    const fallacies = detectFallacies(claim)
    const strengths = analyzeStrengths(claim)
    const weaknesses = analyzeWeaknesses(claim)
    const counterArgs = generateCounterArgs(claim)
    const analysis = generateAnalysis(claim, strengths, weaknesses, fallacies)
    const confidence = calculateConfidence(claim, fallacies)

    log.info("critical analysis completed", {
      correlationId: context.correlationId,
      fallacyCount: fallacies.length,
      counterArgCount: counterArgs.length,
      confidence,
    })

    return {
      analysis,
      counterArgs,
      strengths,
      weaknesses,
      confidence,
      logicalFallacies: fallacies,
    }
  },
}

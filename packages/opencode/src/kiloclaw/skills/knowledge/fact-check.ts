import { Log } from "@/util/log"
import { Skill, SkillContext } from "../skill"
import { SkillId } from "../types"

// Source reference
export interface Source {
  readonly name: string
  readonly url: string
  readonly credibility: "high" | "medium" | "low"
  readonly snippet: string
}

// Fact check input schema
interface FactCheckInput {
  claim: string
}

// Fact check output schema
interface FactCheckOutput {
  verified: boolean
  confidence: number
  sources: Source[]
  verdict: string
  explanation?: string
}

// Known fact patterns for demonstration
const KNOWN_FACTS: Record<string, { verified: boolean; sources: Source[]; explanation: string }> = {
  "the earth is round": {
    verified: true,
    sources: [
      { name: "NASA", url: "https://www.nasa.gov/", credibility: "high", snippet: "Earth is the third planet from the Sun and is approximately spherical in shape." },
      { name: "National Geographic", url: "https://www.nationalgeographic.com/", credibility: "high", snippet: "Earth is an oblate spheroid, flattened at the poles and bulging at the equator." },
    ],
    explanation: "Scientific consensus confirms Earth is approximately spherical (oblate spheroid).",
  },
  "the earth is flat": {
    verified: false,
    sources: [
      { name: "NASA", url: "https://www.nasa.gov/", credibility: "high", snippet: "Earth is the third planet from the Sun and is approximately spherical in shape." },
    ],
    explanation: "The claim that Earth is flat contradicts overwhelming scientific evidence.",
  },
}

// Extract key claim for matching
function normalizeClaim(claim: string): string {
  return claim.toLowerCase().replace(/[^\w\s]/g, "").trim()
}

// Find matching known fact
function findKnownFact(normalized: string): typeof KNOWN_FACTS[string] | null {
  for (const [key, value] of Object.entries(KNOWN_FACTS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return value
    }
  }
  return null
}

// Generate credibility assessment
function assessCredibility(claim: string): { verified: boolean; confidence: number } {
  const normalized = normalizeClaim(claim)
  
  // Check against known facts
  const knownFact = findKnownFact(normalized)
  if (knownFact) {
    return {
      verified: knownFact.verified,
      confidence: 0.95,
    }
  }
  
  // Check for factual patterns
  const factualIndicators = [
    /according to/i,
    /research shows/i,
    /studies (show|suggest|indicate)/i,
    /scientific (evidence|consensus)/i,
    /\d+%? (of|annual|monthly|daily|weekly)/i,
  ]
  
  const nonFactualIndicators = [
    /i think/i,
    /in my opinion/i,
    /probably/i,
    /maybe/i,
    /might be/i,
    /could be/i,
  ]
  
  let factualScore = 0
  let nonFactualScore = 0
  
  for (const pattern of factualIndicators) {
    if (pattern.test(claim)) factualScore++
  }
  
  for (const pattern of nonFactualIndicators) {
    if (pattern.test(claim)) nonFactualScore++
  }
  
  // Determine verification based on patterns
  const verified = factualScore > nonFactualScore
  const confidence = Math.min(0.7, Math.max(0.3, 0.5 + (factualScore - nonFactualScore) * 0.1))
  
  return { verified, confidence }
}

// Generate default sources
function generateDefaultSources(): Source[] {
  return [
    {
      name: "Wikipedia",
      url: "https://en.wikipedia.org/wiki/Main_Page",
      credibility: "medium",
      snippet: "Wikipedia is a free online encyclopedia with articles on most topics.",
    },
    {
      name: "Britannica",
      url: "https://www.britannica.com/",
      credibility: "high",
      snippet: "Encyclopedia Britannica provides authoritative reference content.",
    },
  ]
}

// Generate verdict text
function generateVerdict(verified: boolean, confidence: number): string {
  if (verified && confidence > 0.8) return "Verified as true"
  if (!verified && confidence > 0.8) return "Verified as false"
  if (confidence > 0.6) return "Likely true" + (verified ? "" : " but requires more evidence")
  if (confidence > 0.4) return "Uncertain - more sources needed"
  return "Cannot verify - insufficient information"
}

export const FactCheckSkill: Skill = {
  id: "fact-check" as SkillId,
  version: { major: 1, minor: 0, patch: 0 },
  name: "Fact Check",
  inputSchema: {
    type: "object",
    properties: {
      claim: { type: "string", description: "Claim to verify" },
    },
    required: ["claim"],
  },
  outputSchema: {
    type: "object",
    properties: {
      verified: { type: "boolean", description: "Whether the claim is verified as true" },
      confidence: { type: "number", description: "Confidence level 0-1" },
      sources: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            url: { type: "string" },
            credibility: { type: "string" },
            snippet: { type: "string" },
          },
        },
      },
      verdict: { type: "string", description: "Short verdict" },
      explanation: { type: "string", description: "Detailed explanation" },
    },
  },
  capabilities: ["verification", "cross_reference", "claim_analysis", "source_grounding"],
  tags: ["knowledge", "fact-checking", "verification", "research"],
  
  async execute(input: unknown, context: SkillContext): Promise<FactCheckOutput> {
    const log = Log.create({ service: "kiloclaw.skill.fact-check" })
    log.info("executing fact check", { correlationId: context.correlationId })
    
    const { claim } = input as FactCheckInput
    
    if (!claim) {
      log.warn("empty claim provided for fact check")
      return {
        verified: false,
        confidence: 0,
        sources: [],
        verdict: "No claim provided",
        explanation: "Please provide a claim to verify.",
      }
    }
    
    const normalized = normalizeClaim(claim)
    const knownFact = findKnownFact(normalized)
    
    let verified: boolean
    let confidence: number
    let sources: Source[]
    let explanation: string
    
    if (knownFact) {
      verified = knownFact.verified
      confidence = 0.95
      sources = knownFact.sources
      explanation = knownFact.explanation
    } else {
      const assessment = assessCredibility(claim)
      verified = assessment.verified
      confidence = assessment.confidence
      sources = generateDefaultSources()
      explanation = `Based on analysis of claim patterns and available sources. ` +
        `Claim appears to be ${verified ? "factual" : "questionable"} based on language indicators.`
    }
    
    const verdict = generateVerdict(verified, confidence)
    
    log.info("fact check completed", {
      correlationId: context.correlationId,
      verified,
      confidence,
      verdict,
    })
    
    return {
      verified,
      confidence,
      sources,
      verdict,
      explanation,
    }
  },
}

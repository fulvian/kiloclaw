// Semantic Router Types - Capability-based routing types
// Based on SEMANTIC_ROUTER_V2_CAPABILITY_BASED.md

import z from "zod"
import { type Domain, type Intent } from "../../../types"

// Domain type
export type { Domain } from "../../../types"

// Re-export Intent from main types
export type { Intent } from "../../../types"

// Capability constraints
export const CapabilityConstraintsSchema = z.object({
  max_results: z.number().int().positive().optional(),
  requires_auth: z.boolean().optional(),
  latency_budget_ms: z.number().int().positive().optional(),
})

export type CapabilityConstraints = z.infer<typeof CapabilityConstraintsSchema>

// CapabilityDescriptor - declarative capability definition with optional embedding
export const CapabilityDescriptorSchema = z.object({
  id: z.string().min(1),
  domain: z.string(),
  description: z.string(),
  keywords: z.array(z.string()).default([]),
  embedding: z.array(z.number()).optional(),
  constraints: CapabilityConstraintsSchema.optional(),
  metadata: z.record(z.string(), z.unknown()).optional().default({}),
})

export type CapabilityDescriptor = z.infer<typeof CapabilityDescriptorSchema>

// CapabilityMatch - result of capability matching
export interface CapabilityMatch {
  capability: CapabilityDescriptor
  confidence: number
  matchType: "embedding" | "keyword" | "hybrid"
}

// SemanticIntent - extended intent for semantic routing
export interface SemanticIntent extends Intent {
  context?: {
    history?: string[]
    preferences?: Record<string, unknown>
  }
}

// IntentClassification - result of intent classification
export interface IntentClassification {
  domains: Array<{ domain: Domain; confidence: number }>
  capabilities: Array<{ capability: string; confidence: number }>
  reasoning: string
}

// Routing confidence thresholds
export const ROUTING_THRESHOLDS = {
  HIGH_CONFIDENCE: 0.8,
  MEDIUM_CONFIDENCE: 0.5,
  LOW_CONFIDENCE: 0.3,
  EMBEDDING_SIMILARITY: 0.6,
  KEYWORD_BOOST: 0.2,
} as const

// L0: Domain detection result
export interface DomainDetectionResult {
  domain: Domain
  confidence: number
  matchedKeywords: string[]
  reasoning: string
}

// L1: Capability matching result
export interface CapabilityMatchingResult {
  agencyId: string
  confidence: number
  matchedCapabilities: CapabilityMatch[]
  reasoning: string
}

// L2: Skill selection result
export interface SkillSelectionResult {
  skillId: string
  confidence: number
  matchReason: string
}

// L3: Tool resolution result
export interface ToolResolutionResult {
  toolId: string
  provider: string
  confidence: number
}

// Final routing result combining all layers
export interface RoutingResult {
  intent: Intent
  domain: DomainDetectionResult
  capability: CapabilityMatchingResult
  skill: SkillSelectionResult
  tool: ToolResolutionResult | null
  finalConfidence: number
  reasoning: string
}

// SemanticRouter configuration
export interface SemanticRouterConfig {
  embeddingThreshold: number
  keywordBoost: number
  enableMultilingual: boolean
  fallbackToLLM: boolean
}

export const DEFAULT_SEMANTIC_ROUTER_CONFIG: SemanticRouterConfig = {
  embeddingThreshold: ROUTING_THRESHOLDS.EMBEDDING_SIMILARITY,
  keywordBoost: ROUTING_THRESHOLDS.KEYWORD_BOOST,
  enableMultilingual: true,
  fallbackToLLM: false,
}

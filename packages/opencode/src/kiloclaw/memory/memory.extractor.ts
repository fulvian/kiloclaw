/**
 * Memory Extractor - Selective Extraction for Semantic Memory
 * Based on BP-01 of KILOCLAW_MEMORY_ENHANCEMENT_PLAN
 * Extracts discrete facts from conversations instead of raw dumps
 */

import { Log } from "@/util/log"

const log = Log.create({ service: "kiloclaw.memory.extractor" })

export interface ExtractedFact {
  subject: string
  predicate: string
  object: unknown
  confidence: number
  provenance: string
}

export interface ExtractionContext {
  sessionId: string
  userId?: string
  agentId?: string
  correlationId?: string
}

export namespace MemoryExtractor {
  /**
   * Extract discrete facts from conversation content.
   * Returns structured facts ready for semantic layer.
   * Uses rule-based extraction for MVP (can be enhanced with LLM later).
   */
  export async function extractFacts(content: string, context: ExtractionContext): Promise<ExtractedFact[]> {
    const facts: ExtractedFact[] = []

    // Rule-based extraction patterns

    // Pattern: "user prefers X" → preference fact
    const preferenceMatches = content.matchAll(/prefer[ei]\s+(.+?)(?:\.|$)/gi)
    for (const match of preferenceMatches) {
      facts.push({
        subject: "user",
        predicate: "prefers",
        object: match[1].trim(),
        confidence: 0.75,
        provenance: `extracted:${context.sessionId}`,
      })
    }

    // Pattern: "project uses X" or "uses X" → technology fact
    const techMatches = content.matchAll(/(?:uses|employs|depends on)\s+([A-Za-z0-9_.-]+)/gi)
    for (const match of techMatches) {
      facts.push({
        subject: "project",
        predicate: "uses_technology",
        object: match[1].trim(),
        confidence: 0.8,
        provenance: `extracted:${context.sessionId}`,
      })
    }

    // Pattern: "task completed X" or "task X completed" → outcome fact
    const outcomeMatches = content.matchAll(/task[:\s]+(.+?)(?:completed|finished|done)/gi)
    for (const match of outcomeMatches) {
      facts.push({
        subject: "task",
        predicate: "outcome",
        object: match[1].trim(),
        confidence: 0.85,
        provenance: `extracted:${context.sessionId}`,
      })
    }

    // Pattern: "X is Y" or "X are Y" → attribute fact
    const attributeMatches = content.matchAll(/^(\w+(?:\s+\w+)?)\s+(?:is|are|was|were)\s+([^.!?]+)/gm)
    for (const match of attributeMatches) {
      const obj = match[2].trim()
      if (obj.length > 3 && obj.length < 100) {
        facts.push({
          subject: match[1].trim(),
          predicate: "has_attribute",
          object: obj,
          confidence: 0.7,
          provenance: `extracted:${context.sessionId}`,
        })
      }
    }

    // Pattern: "user asked about X" → query intent fact
    const askMatches = content.matchAll(/ask(?:ed)?\s+(?:me|user)?\s*(?:about|for)\s+([^.!?,]+)/gi)
    for (const match of askMatches) {
      facts.push({
        subject: "user",
        predicate: "inquired_about",
        object: match[1].trim(),
        confidence: 0.75,
        provenance: `extracted:${context.sessionId}`,
      })
    }

    // Pattern: "created X" or "implemented X" → creation fact
    const createMatches = content.matchAll(/(?:created|implemented|built|developed)\s+([^.!?]+)/gi)
    for (const match of createMatches) {
      facts.push({
        subject: "user",
        predicate: "created",
        object: match[1].trim(),
        confidence: 0.8,
        provenance: `extracted:${context.sessionId}`,
      })
    }

    // Pattern: "fixed X" or "debugged X" → fix fact
    const fixMatches = content.matchAll(/(?:fixed|debugged|resolved)\s+([^.!?]+)/gi)
    for (const match of fixMatches) {
      facts.push({
        subject: "user",
        predicate: "fixed",
        object: match[1].trim(),
        confidence: 0.85,
        provenance: `extracted:${context.sessionId}`,
      })
    }

    log.debug("extracted facts", { count: facts.length, sessionId: context.sessionId })
    return facts
  }

  /**
   * Check if content is worth extracting (too short or noisy).
   */
  export function isWorthExtracting(content: string): boolean {
    if (content.length < 50) return false
    if (content.length > 10000) return false // too long, needs summarization first
    // Skip very noisy content
    const noiseRatio = (content.match(/[!?]{2,}/g) ?? []).length / content.length
    if (noiseRatio > 0.05) return false
    return true
  }

  /**
   * Extract subject entities from content for graph memory.
   */
  export function extractEntities(content: string): Array<{ name: string; type: string }> {
    const entities: Array<{ name: string; type: string }> = []

    // Technology entities
    const techMatches = content.matchAll(
      /(?:React|Node|Python|TypeScript|JavaScript|PostgreSQL|MongoDB|Docker|Kubernetes)/gi,
    )
    for (const match of techMatches) {
      entities.push({ name: match[0], type: "technology" })
    }

    // File/path entities
    const pathMatches = content.matchAll(/(?:src\/|packages\/|lib\/|app\/)([\w./-]+)/g)
    for (const match of pathMatches) {
      if (match[1]) {
        entities.push({ name: match[1], type: "file" })
      }
    }

    // API endpoint entities
    const apiMatches = content.matchAll(/\/(api|v\d+)\/([\w/-]+)/g)
    for (const match of apiMatches) {
      entities.push({ name: `/${match[1]}/${match[2]}`, type: "api_endpoint" })
    }

    return entities
  }
}

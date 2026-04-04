/**
 * Memory Controller - ADD/UPDATE/DELETE/NOOP Decision Engine
 * Based on BP-11 of KILOCLAW_MEMORY_ENHANCEMENT_PLAN
 * Decides what operation to perform for incoming memory events
 */

import { Log } from "@/util/log"
import { SemanticMemoryRepo, EpisodicMemoryRepo } from "./memory.repository"

const log = Log.create({ service: "kiloclaw.memory.controller" })

const TENANT = "default"

export type MemoryOperation = "ADD" | "UPDATE" | "DELETE" | "NOOP"

export interface ControllerDecision {
  operation: MemoryOperation
  targetLayer: "working" | "episodic" | "semantic" | "procedural"
  targetId?: string
  reasoning: string
  confidence: number
}

export interface FactEntry {
  id: string
  subject: string
  predicate: string
  object: unknown
}

export namespace MemoryController {
  /**
   * Decide what operation to perform for an incoming memory event.
   * Returns ADD/UPDATE/DELETE/NOOP decision.
   */
  export async function decide(
    entry: {
      layer?: "working" | "episodic" | "semantic" | "procedural"
      key: string
      value: unknown
      subject?: string
      predicate?: string
    },
    existingFacts?: FactEntry[],
  ): Promise<ControllerDecision> {
    // If no existing facts and we're writing semantic → ADD
    if (entry.layer === "semantic" && entry.subject && entry.predicate) {
      if (!existingFacts || existingFacts.length === 0) {
        return {
          operation: "ADD",
          targetLayer: "semantic",
          reasoning: "No existing fact, create new",
          confidence: 0.9,
        }
      }

      // Check for contradictions
      for (const fact of existingFacts) {
        if (fact.subject === entry.subject && fact.predicate === entry.predicate) {
          // Same subject+predicate found
          const existingObj = typeof fact.object === "string" ? fact.object : JSON.stringify(fact.object)
          const newObj = typeof entry.value === "string" ? entry.value : JSON.stringify(entry.value)

          if (existingObj === newObj) {
            return {
              operation: "NOOP",
              targetLayer: "semantic",
              targetId: fact.id,
              reasoning: "Identical fact already exists",
              confidence: 0.95,
            }
          }

          // Contradiction detected - UPDATE
          return {
            operation: "UPDATE",
            targetLayer: "semantic",
            targetId: fact.id,
            reasoning: `Contradiction detected: "${existingObj.slice(0, 50)}" → "${newObj.slice(0, 50)}"`,
            confidence: 0.8,
          }
        }
      }

      // No match found → ADD
      return {
        operation: "ADD",
        targetLayer: "semantic",
        reasoning: "New subject+predicate combination",
        confidence: 0.85,
      }
    }

    // For episodic/working, always ADD (append-only)
    if (entry.layer === "episodic" || entry.layer === "working") {
      return {
        operation: "ADD",
        targetLayer: entry.layer ?? "episodic",
        reasoning: "Episodic/working layer is append-only",
        confidence: 0.95,
      }
    }

    // Default fallback
    return {
      operation: "ADD",
      targetLayer: entry.layer ?? "episodic",
      reasoning: "Default to ADD",
      confidence: 0.5,
    }
  }

  /**
   * Execute the controller decision.
   */
  export async function execute(
    decision: ControllerDecision,
    entry: {
      key: string
      value: unknown
      subject?: string
      predicate?: string
    },
  ): Promise<string | null> {
    switch (decision.operation) {
      case "ADD":
        if (decision.targetLayer === "semantic" && entry.subject && entry.predicate) {
          const id = `fact_${crypto.randomUUID()}`
          const objText = typeof entry.value === "string" ? entry.value : JSON.stringify(entry.value)
          await SemanticMemoryRepo.assertFact({
            id,
            tenant_id: TENANT,
            subject: entry.subject,
            predicate: entry.predicate,
            object: objText,
            confidence: Math.round(decision.confidence * 100),
            provenance: "memory_controller",
            source_event_ids: [],
            valid_from: Date.now(),
            created_at: Date.now(),
            updated_at: Date.now(),
          })
          return id
        }
        // For other layers, use broker.write
        return null

      case "UPDATE":
        if (decision.targetId && decision.targetLayer === "semantic") {
          await SemanticMemoryRepo.updateFact(decision.targetId, entry.value)
          return decision.targetId
        }
        return null

      case "DELETE":
        if (decision.targetId && decision.targetLayer === "semantic") {
          await SemanticMemoryRepo.deleteFact(decision.targetId)
          return decision.targetId
        }
        return null

      case "NOOP":
        log.debug("noop decision", { reasoning: decision.reasoning })
        return null
    }
  }

  /**
   * Check for contradictions before writing new fact.
   */
  export async function checkContradiction(
    subject: string,
    predicate: string,
    newObject: unknown,
  ): Promise<{ hasContradiction: boolean; existingFact?: { object: unknown; id: string } }> {
    const existing = await SemanticMemoryRepo.queryFacts(TENANT, {
      subject,
      minConfidence: 50,
    })

    for (const fact of existing) {
      if (fact.predicate === predicate) {
        const existingObj = typeof fact.object === "string" ? fact.object : JSON.stringify(fact.object)
        const newObj = typeof newObject === "string" ? newObject : JSON.stringify(newObject)

        if (existingObj !== newObj) {
          return {
            hasContradiction: true,
            existingFact: { object: fact.object, id: fact.id },
          }
        }
      }
    }

    return { hasContradiction: false }
  }

  /**
   * Infer actor type from event data.
   */
  export function inferActorType(event: {
    userId?: string | null
    agentId?: string | null
    type?: string
  }): "user" | "agent" | "system" | "tool" {
    if (event.userId) return "user"
    if (event.agentId) return "agent"
    if (event.type === "tool_call" || event.type === "tool_result") return "tool"
    return "system"
  }
}

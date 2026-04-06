/**
 * Routing Telemetry - Metrics for Dynamic Multi-Level Routing
 * Phase 8: Dynamic Multi-Level Retrieval SOTA 2026
 * KILOCLAW_DYNAMIC_MULTI_LEVEL_RETRIEVAL_SOTA_2026-04-06.md
 *
 * Provides structured events for routing decisions across layers L0-L3:
 * - L0 (Agency Routing): Intent classification, agency resolution, policy application
 * - L1 (Skill Discovery): Skill candidate finding from manifest/capability graph
 * - L2 (Agent Selection): Agent selection by capability, limits, health
 * - L3 (Tool Resolution): Tool resolution with policy, budget, fallback
 */

import { z } from "zod"
import { Log } from "@/util/log"
import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"

const log = Log.create({ service: "kilocclaw.telemetry.routing" })

// =============================================================================
// Routing Layer Types
// =============================================================================

export const RoutingLayer = z.enum(["L0", "L1", "L2", "L3"])
export type RoutingLayer = z.infer<typeof RoutingLayer>

export const RoutingDecision = z.enum(["allowed", "denied", "fallback", "shadow"])
export type RoutingDecision = z.infer<typeof RoutingDecision>

// =============================================================================
// Routing Event Schemas
// =============================================================================

/**
 * L0 - Agency Routing Event
 * Emitted when intent is classified and agency is resolved
 */
export const Layer0DecisionSchema = z.object({
  correlationId: z.string(),
  intent: z.string(),
  intentType: z.string(),
  domain: z.string(),
  agencyId: z.string(),
  agencyDomain: z.string(),
  confidence: z.number().min(0).max(1),
  decision: RoutingDecision,
  reason: z.string(),
  latencyMs: z.number().nonnegative(),
  timestamp: z.number(),
})
export type Layer0Decision = z.infer<typeof Layer0DecisionSchema>

/**
 * L1 - Skill Discovery Event
 * Emitted when skill candidates are found from manifest
 */
export const Layer1DecisionSchema = z.object({
  correlationId: z.string(),
  agencyId: z.string(),
  capabilities: z.array(z.string()),
  skillsFound: z.number().int().nonnegative(),
  bestSkill: z.string().optional(),
  bestSkillScore: z.number().min(0).max(1).optional(),
  decision: RoutingDecision,
  reason: z.string(),
  latencyMs: z.number().nonnegative(),
  timestamp: z.number(),
})
export type Layer1Decision = z.infer<typeof Layer1DecisionSchema>

/**
 * L2 - Agent Selection Event
 * Emitted when agent is selected by capability, limits, health
 */
export const Layer2DecisionSchema = z.object({
  correlationId: z.string(),
  agencyId: z.string(),
  capabilities: z.array(z.string()),
  agentsFound: z.number().int().nonnegative(),
  bestAgent: z.string().optional(),
  bestAgentScore: z.number().min(0).max(1).optional(),
  agentHealth: z.enum(["healthy", "degraded", "unknown"]).optional(),
  decision: RoutingDecision,
  reason: z.string(),
  latencyMs: z.number().nonnegative(),
  timestamp: z.number(),
})
export type Layer2Decision = z.infer<typeof Layer2DecisionSchema>

/**
 * L3 - Tool Resolution Event
 * Emitted when tool is resolved with policy, budget, fallback
 */
export const Layer3DecisionSchema = z.object({
  correlationId: z.string(),
  agencyId: z.string(),
  skillId: z.string().optional(),
  agentId: z.string().optional(),
  toolsRequested: z.number().int().nonnegative(),
  toolsResolved: z.number().int().nonnegative(),
  toolsDenied: z.number().int().nonnegative(),
  deniedTools: z.array(z.string()).optional(),
  fallbackUsed: z.boolean(),
  fallbackReason: z.string().optional(),
  decision: RoutingDecision,
  reason: z.string(),
  latencyMs: z.number().nonnegative(),
  timestamp: z.number(),
})
export type Layer3Decision = z.infer<typeof Layer3DecisionSchema>

/**
 * Policy Denied Event
 * Emitted when a capability or tool is denied by agency policy
 */
export const PolicyDeniedSchema = z.object({
  correlationId: z.string(),
  agencyId: z.string(),
  capability: z.string().optional(),
  tool: z.string().optional(),
  policy: z.string(),
  decision: z.literal("denied"),
  reason: z.string(),
  timestamp: z.number(),
})
export type PolicyDenied = z.infer<typeof PolicyDeniedSchema>

/**
 * Fallback Used Event
 * Emitted when routing falls back to legacy or default path
 */
export const FallbackUsedSchema = z.object({
  correlationId: z.string(),
  layer: RoutingLayer,
  originalRoute: z.string().optional(),
  fallbackRoute: z.string(),
  reason: z.string(),
  latencyMs: z.number().nonnegative(),
  timestamp: z.number(),
})
export type FallbackUsed = z.infer<typeof FallbackUsedSchema>

// =============================================================================
// Bus Event Definitions for Routing
// =============================================================================

export const Layer0DecisionEvent = BusEvent.define("routing.layer0.decision", Layer0DecisionSchema)
export const Layer1DecisionEvent = BusEvent.define("routing.layer1.decision", Layer1DecisionSchema)
export const Layer2DecisionEvent = BusEvent.define("routing.layer2.decision", Layer2DecisionSchema)
export const Layer3DecisionEvent = BusEvent.define("routing.layer3.decision", Layer3DecisionSchema)
export const PolicyDeniedEvent = BusEvent.define("routing.policy.denied", PolicyDeniedSchema)
export const FallbackUsedEvent = BusEvent.define("routing.fallback.used", FallbackUsedSchema)

// =============================================================================
// RoutingMetrics Namespace
// =============================================================================

export namespace RoutingMetrics {
  /**
   * Record an L0 (Agency Routing) decision event
   */
  export async function recordLayer0(params: {
    correlationId: string
    intent: string
    intentType: string
    domain: string
    agencyId: string
    agencyDomain: string
    confidence: number
    decision: RoutingDecision
    reason: string
    latencyMs: number
  }): Promise<void> {
    const event = {
      ...params,
      timestamp: Date.now(),
    }
    log.debug("routing.layer0.decision", event)
    await Bus.publish(Layer0DecisionEvent, event)
  }

  /**
   * Record an L1 (Skill Discovery) decision event
   */
  export async function recordLayer1(params: {
    correlationId: string
    agencyId: string
    capabilities: string[]
    skillsFound: number
    bestSkill?: string
    bestSkillScore?: number
    decision: RoutingDecision
    reason: string
    latencyMs: number
  }): Promise<void> {
    const event = {
      ...params,
      timestamp: Date.now(),
    }
    log.debug("routing.layer1.decision", event)
    await Bus.publish(Layer1DecisionEvent, event)
  }

  /**
   * Record an L2 (Agent Selection) decision event
   */
  export async function recordLayer2(params: {
    correlationId: string
    agencyId: string
    capabilities: string[]
    agentsFound: number
    bestAgent?: string
    bestAgentScore?: number
    agentHealth?: "healthy" | "degraded" | "unknown"
    decision: RoutingDecision
    reason: string
    latencyMs: number
  }): Promise<void> {
    const event = {
      ...params,
      timestamp: Date.now(),
    }
    log.debug("routing.layer2.decision", event)
    await Bus.publish(Layer2DecisionEvent, event)
  }

  /**
   * Record an L3 (Tool Resolution) decision event
   */
  export async function recordLayer3(params: {
    correlationId: string
    agencyId: string
    skillId?: string
    agentId?: string
    toolsRequested: number
    toolsResolved: number
    toolsDenied: number
    deniedTools?: string[]
    fallbackUsed: boolean
    fallbackReason?: string
    decision: RoutingDecision
    reason: string
    latencyMs: number
  }): Promise<void> {
    const event = {
      ...params,
      timestamp: Date.now(),
    }
    log.debug("routing.layer3.decision", event)
    await Bus.publish(Layer3DecisionEvent, event)
  }

  /**
   * Record a policy denied event
   */
  export async function recordPolicyDenied(params: {
    correlationId: string
    agencyId: string
    capability?: string
    tool?: string
    policy: string
    reason: string
  }): Promise<void> {
    const event = {
      ...params,
      decision: "denied" as const,
      timestamp: Date.now(),
    }
    log.info("routing.policy.denied", event)
    await Bus.publish(PolicyDeniedEvent, event)
  }

  /**
   * Record a fallback event
   */
  export async function recordFallback(params: {
    correlationId: string
    layer: RoutingLayer
    originalRoute?: string
    fallbackRoute: string
    reason: string
    latencyMs: number
  }): Promise<void> {
    const event = {
      ...params,
      timestamp: Date.now(),
    }
    log.debug("routing.fallback.used", event)
    await Bus.publish(FallbackUsedEvent, event)
  }
}

// =============================================================================
// Performance Metrics (in-memory, for observability)
// =============================================================================

const performanceStats = {
  // Latency tracking (all in ms)
  latencies: {
    L0: [] as number[],
    L1: [] as number[],
    L2: [] as number[],
    L3: [] as number[],
    total: [] as number[],
  },
  // Cache hit tracking
  cacheHits: {
    capability: 0,
    capabilityMisses: 0,
    router: 0,
    routerMisses: 0,
  },
  // Counters
  totalRoutingRequests: 0,
  totalFallbacks: 0,
}

/**
 * Maximum latency samples to keep per bucket (for memory efficiency)
 */
const MAX_LATENCY_SAMPLES = 1000

/**
 * Record routing latency for a layer
 */
export function recordLatency(layer: "L0" | "L1" | "L2" | "L3" | "total", latencyMs: number): void {
  const bucket = performanceStats.latencies[layer]
  bucket.push(latencyMs)
  // Keep only last MAX_LATENCY_SAMPLES
  if (bucket.length > MAX_LATENCY_SAMPLES) {
    bucket.shift()
  }
}

/**
 * Record cache hit
 */
export function recordCacheHit(cache: "capability" | "router"): void {
  performanceStats.cacheHits[cache]++
}

/**
 * Record cache miss
 */
export function recordCacheMiss(cache: "capability" | "router"): void {
  performanceStats.cacheHits[`${cache}Misses`]++
}

/**
 * Record routing request
 */
export function recordRoutingRequest(): void {
  performanceStats.totalRoutingRequests++
}

/**
 * Record fallback
 */
export function recordFallbackEvent(): void {
  performanceStats.totalFallbacks++
}

/**
 * Get performance statistics
 */
export function getPerformanceStats(): {
  latency: {
    layer: "L0" | "L1" | "L2" | "L3" | "total"
    p50: number
    p95: number
    p99: number
    count: number
  }[]
  cacheHitRate: {
    capability: number
    router: number
  }
  totals: {
    routingRequests: number
    fallbacks: number
  }
} {
  // Calculate latency percentiles
  const latencyStats = (["L0", "L1", "L2", "L3", "total"] as const).map((layer) => {
    const samples = performanceStats.latencies[layer]
    if (samples.length === 0) {
      return { layer, p50: 0, p95: 0, p99: 0, count: 0 }
    }
    const sorted = [...samples].sort((a, b) => a - b)
    return {
      layer,
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
      p99: percentile(sorted, 0.99),
      count: samples.length,
    }
  })

  // Calculate cache hit rates
  const capabilityHits = performanceStats.cacheHits.capability
  const capabilityMisses = performanceStats.cacheHits.capabilityMisses
  const routerHits = performanceStats.cacheHits.router
  const routerMisses = performanceStats.cacheHits.routerMisses

  return {
    latency: latencyStats,
    cacheHitRate: {
      capability: capabilityHits + capabilityMisses > 0 ? capabilityHits / (capabilityHits + capabilityMisses) : 0,
      router: routerHits + routerMisses > 0 ? routerHits / (routerHits + routerMisses) : 0,
    },
    totals: {
      routingRequests: performanceStats.totalRoutingRequests,
      fallbacks: performanceStats.totalFallbacks,
    },
  }
}

/**
 * Calculate percentile from sorted array
 */
function percentile(sorted: number[], p: number): number {
  const index = Math.ceil(sorted.length * p) - 1
  return sorted[Math.max(0, index)]
}

/**
 * Reset performance stats (for testing)
 */
export function resetPerformanceStats(): void {
  performanceStats.latencies.L0 = []
  performanceStats.latencies.L1 = []
  performanceStats.latencies.L2 = []
  performanceStats.latencies.L3 = []
  performanceStats.latencies.total = []
  performanceStats.cacheHits.capability = 0
  performanceStats.cacheHits.capabilityMisses = 0
  performanceStats.cacheHits.router = 0
  performanceStats.cacheHits.routerMisses = 0
  performanceStats.totalRoutingRequests = 0
  performanceStats.totalFallbacks = 0
}

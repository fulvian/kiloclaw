/**
 * Runtime Remediation Metrics - Skills/Tools Runtime Telemetry
 * P0/P1: Tool Identity Resolver + Execution Bridge + Skill Tool
 *
 * Provides structured events for:
 * - Tool policy allowed/blocked decisions
 * - Tool identity resolution hit/miss
 * - Agency chain execution events
 * - Generic fallback decisions
 * - Skill loaded but not executed detection
 */

import { z } from "zod"
import { Log } from "@/util/log"
import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"

const log = Log.create({ service: "kilocclaw.telemetry.runtime-remediation" })

// =============================================================================
// Metric Types
// =============================================================================

export const ToolType = z.enum(["native", "mcp", "unknown"])
export type ToolType = z.infer<typeof ToolType>

// =============================================================================
// Event Schemas
// =============================================================================

/**
 * Tool Policy Decision Event
 * Emitted when a tool is allowed or blocked by policy
 */
export const ToolPolicyDecisionSchema = z.object({
  correlationId: z.string(),
  agencyId: z.string(),
  tool: z.string(),
  alias: z.string().optional(),
  runtimeKey: z.string().optional(),
  toolType: ToolType,
  decision: z.enum(["allowed", "blocked"]),
  reason: z.string().optional(),
  timestamp: z.number(),
})
export type ToolPolicyDecision = z.infer<typeof ToolPolicyDecisionSchema>

/**
 * Tool Identity Resolved Event
 * Emitted when a tool alias is resolved to a runtime key
 */
export const ToolIdentityResolvedSchema = z.object({
  correlationId: z.string(),
  agencyId: z.string(),
  alias: z.string(),
  canonical: z.string().optional(),
  runtime: z.string(),
  toolType: ToolType,
  hit: z.boolean(),
  timestamp: z.number(),
})
export type ToolIdentityResolved = z.infer<typeof ToolIdentityResolvedSchema>

/**
 * Tool Identity Miss Event
 * Emitted when a tool alias cannot be resolved
 */
export const ToolIdentityMissSchema = z.object({
  correlationId: z.string(),
  agencyId: z.string(),
  alias: z.string(),
  reason: z.string(),
  timestamp: z.number(),
})
export type ToolIdentityMiss = z.infer<typeof ToolIdentityMissSchema>

/**
 * Agency Chain Started Event
 * Emitted when an agency chain execution begins
 */
export const AgencyChainStartedSchema = z.object({
  correlationId: z.string(),
  agencyId: z.string(),
  skill: z.string(),
  chainId: z.string().optional(),
  timestamp: z.number(),
})
export type AgencyChainStarted = z.infer<typeof AgencyChainStartedSchema>

/**
 * Agency Chain Step Event
 * Emitted for each step in chain execution
 */
export const AgencyChainStepSchema = z.object({
  correlationId: z.string(),
  agencyId: z.string(),
  skill: z.string(),
  chainId: z.string().optional(),
  stepIndex: z.number().int(),
  stepSkillId: z.string(),
  success: z.boolean(),
  durationMs: z.number(),
  error: z.string().optional(),
  timestamp: z.number(),
})
export type AgencyChainStep = z.infer<typeof AgencyChainStepSchema>

/**
 * Agency Chain Completed Event
 * Emitted when chain execution completes (success or failure)
 */
export const AgencyChainCompletedSchema = z.object({
  correlationId: z.string(),
  agencyId: z.string(),
  skill: z.string(),
  chainId: z.string().optional(),
  status: z.enum(["success", "failed", "timeout"]),
  stepsCompleted: z.number().int(),
  totalSteps: z.number().int(),
  durationMs: z.number(),
  error: z.string().optional(),
  timestamp: z.number(),
})
export type AgencyChainCompleted = z.infer<typeof AgencyChainCompletedSchema>

/**
 * Generic Fallback Event
 * Emitted when system falls back to generic tool (websearch) instead of specialized
 */
export const GenericFallbackSchema = z.object({
  correlationId: z.string(),
  agencyId: z.string(),
  intent: z.string(),
  reason: z.string(),
  timestamp: z.number(),
})
export type GenericFallback = z.infer<typeof GenericFallbackSchema>

/**
 * Skill Loaded Not Executed Event
 * Emitted when a skill is loaded but not actually executed
 */
export const SkillLoadedNotExecutedSchema = z.object({
  correlationId: z.string(),
  agencyId: z.string(),
  skill: z.string(),
  reason: z.string(),
  timestamp: z.number(),
})
export type SkillLoadedNotExecuted = z.infer<typeof SkillLoadedNotExecutedSchema>

// =============================================================================
// Bus Event Definitions
// =============================================================================

export const ToolPolicyDecisionEvent = BusEvent.define("runtime.tool_policy_decision", ToolPolicyDecisionSchema)
export const ToolIdentityResolvedEvent = BusEvent.define("runtime.tool_identity_resolved", ToolIdentityResolvedSchema)
export const ToolIdentityMissEvent = BusEvent.define("runtime.tool_identity_miss", ToolIdentityMissSchema)
export const AgencyChainStartedEvent = BusEvent.define("runtime.agency_chain_started", AgencyChainStartedSchema)
export const AgencyChainStepEvent = BusEvent.define("runtime.agency_chain_step", AgencyChainStepSchema)
export const AgencyChainCompletedEvent = BusEvent.define("runtime.agency_chain_completed", AgencyChainCompletedSchema)
export const GenericFallbackEvent = BusEvent.define("runtime.generic_fallback", GenericFallbackSchema)
export const SkillLoadedNotExecutedEvent = BusEvent.define(
  "runtime.skill_loaded_not_executed",
  SkillLoadedNotExecutedSchema,
)

// =============================================================================
// RuntimeRemediationMetrics Namespace
// =============================================================================

export namespace RuntimeRemediationMetrics {
  /**
   * Record a tool policy decision
   */
  export async function recordToolPolicyDecision(params: {
    correlationId: string
    agencyId: string
    tool: string
    alias?: string
    runtimeKey?: string
    toolType: ToolType
    decision: "allowed" | "blocked"
    reason?: string
  }): Promise<void> {
    const event = {
      ...params,
      timestamp: Date.now(),
    }
    log.info("tool_policy_decision", event)
    await Bus.publish(ToolPolicyDecisionEvent, event)
  }

  /**
   * Record a tool identity resolution
   */
  export async function recordToolIdentityResolved(params: {
    correlationId: string
    agencyId: string
    alias: string
    canonical?: string
    runtime: string
    toolType: ToolType
    hit: boolean
  }): Promise<void> {
    const event = {
      ...params,
      timestamp: Date.now(),
    }
    log.debug("tool_identity_resolved", event)
    await Bus.publish(ToolIdentityResolvedEvent, event)
  }

  /**
   * Record a tool identity miss
   */
  export async function recordToolIdentityMiss(params: {
    correlationId: string
    agencyId: string
    alias: string
    reason: string
  }): Promise<void> {
    const event = {
      ...params,
      timestamp: Date.now(),
    }
    log.warn("tool_identity_miss", event)
    await Bus.publish(ToolIdentityMissEvent, event)
  }

  /**
   * Record agency chain started
   */
  export async function recordAgencyChainStarted(params: {
    correlationId: string
    agencyId: string
    skill: string
    chainId?: string
  }): Promise<void> {
    const event = {
      ...params,
      timestamp: Date.now(),
    }
    log.info("agency_chain_started", event)
    await Bus.publish(AgencyChainStartedEvent, event)
  }

  /**
   * Record agency chain step
   */
  export async function recordAgencyChainStep(params: {
    correlationId: string
    agencyId: string
    skill: string
    chainId?: string
    stepIndex: number
    stepSkillId: string
    success: boolean
    durationMs: number
    error?: string
  }): Promise<void> {
    const event = {
      ...params,
      timestamp: Date.now(),
    }
    log.debug("agency_chain_step", event)
    await Bus.publish(AgencyChainStepEvent, event)
  }

  /**
   * Record agency chain completed
   */
  export async function recordAgencyChainCompleted(params: {
    correlationId: string
    agencyId: string
    skill: string
    chainId?: string
    status: "success" | "failed" | "timeout"
    stepsCompleted: number
    totalSteps: number
    durationMs: number
    error?: string
  }): Promise<void> {
    const event = {
      ...params,
      timestamp: Date.now(),
    }
    log.info("agency_chain_completed", event)
    await Bus.publish(AgencyChainCompletedEvent, event)
  }

  /**
   * Record generic fallback
   */
  export async function recordGenericFallback(params: {
    correlationId: string
    agencyId: string
    intent: string
    reason: string
  }): Promise<void> {
    const event = {
      ...params,
      timestamp: Date.now(),
    }
    log.warn("generic_fallback", event)
    await Bus.publish(GenericFallbackEvent, event)
  }

  /**
   * Record skill loaded but not executed
   */
  export async function recordSkillLoadedNotExecuted(params: {
    correlationId: string
    agencyId: string
    skill: string
    reason: string
  }): Promise<void> {
    const event = {
      ...params,
      timestamp: Date.now(),
    }
    log.error("skill_loaded_not_executed", event)
    await Bus.publish(SkillLoadedNotExecutedEvent, event)
  }

  // =============================================================================
  // Counter metrics (for in-memory aggregation)
  // =============================================================================

  const counters = {
    toolPolicyAllowed: 0,
    toolPolicyBlocked: 0,
    toolIdentityResolved: 0,
    toolIdentityMiss: 0,
    agencyChainStarted: 0,
    agencyChainCompleted: 0,
    agencyChainFailed: 0,
    genericFallback: 0,
    skillLoadedNotExecuted: 0,
  }

  export function incrementToolPolicyAllowed(): void {
    counters.toolPolicyAllowed++
  }

  export function incrementToolPolicyBlocked(): void {
    counters.toolPolicyBlocked++
  }

  export function incrementToolIdentityResolved(): void {
    counters.toolIdentityResolved++
  }

  export function incrementToolIdentityMiss(): void {
    counters.toolIdentityMiss++
  }

  export function incrementAgencyChainStarted(): void {
    counters.agencyChainStarted++
  }

  export function incrementAgencyChainCompleted(): void {
    counters.agencyChainCompleted++
  }

  export function incrementAgencyChainFailed(): void {
    counters.agencyChainFailed++
  }

  export function incrementGenericFallback(): void {
    counters.genericFallback++
  }

  export function incrementSkillLoadedNotExecuted(): void {
    counters.skillLoadedNotExecuted++
  }

  export function getCounters(): typeof counters {
    return { ...counters }
  }

  export function resetCounters(): void {
    counters.toolPolicyAllowed = 0
    counters.toolPolicyBlocked = 0
    counters.toolIdentityResolved = 0
    counters.toolIdentityMiss = 0
    counters.agencyChainStarted = 0
    counters.agencyChainCompleted = 0
    counters.agencyChainFailed = 0
    counters.genericFallback = 0
    counters.skillLoadedNotExecuted = 0
  }

  // =============================================================================
  // Rate calculations
  // =============================================================================

  export function getPolicyMissRate(): number {
    const total = counters.toolIdentityResolved + counters.toolIdentityMiss
    return total > 0 ? (counters.toolIdentityMiss / total) * 100 : 0
  }

  export function getGenericFallbackRate(): number {
    const total = counters.agencyChainStarted + counters.genericFallback
    return total > 0 ? (counters.genericFallback / total) * 100 : 0
  }

  export function getChainSuccessRate(): number {
    const total = counters.agencyChainCompleted + counters.agencyChainFailed
    return total > 0 ? (counters.agencyChainCompleted / total) * 100 : 0
  }
}

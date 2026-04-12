import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import { NbaAgency } from "../manifests/nba-manifest"
import {
  RecommendationSchema,
  RecommendationPolicySchema,
  SignalSchema,
  StaleRecommendationInputSchema,
  capConfidence,
  shouldBlockStaleRecommendation,
  type Injury,
} from "./schema"
import { NbaOrchestrator } from "./orchestrator"
import z from "zod"

export const NbaDecisionOutcomeSchema = z.enum(["allow", "deny", "require_hitl"])

export const NbaPolicyDecisionSchema = z.object({
  capability: z.string().min(1),
  policy: RecommendationPolicySchema,
  outcome: NbaDecisionOutcomeSchema,
  reason: z.string().min(1),
  hitlRequired: z.boolean(),
})

export const NbaRequestStartedSchema = z.object({
  requestId: z.string().uuid(),
  capability: z.string().min(1),
  policy: RecommendationPolicySchema,
  startedAtUtc: z.string().datetime(),
})

export const NbaRequestCompletedSchema = z.object({
  requestId: z.string().uuid(),
  capability: z.string().min(1),
  policy: RecommendationPolicySchema,
  outcome: NbaDecisionOutcomeSchema,
  reason: z.string().min(1),
  hitlRequired: z.boolean(),
  completedAtUtc: z.string().datetime(),
})

export const NbaSignalEventSchema = z.object({
  kind: z.enum(["signal", "recommendation"]),
  id: z.string().min(1),
  capability: z.string().min(1),
  confidence: z.number().finite().min(0).max(1),
  staleBlocked: z.boolean(),
  emittedAtUtc: z.string().datetime(),
})

export type NbaPolicyDecision = z.infer<typeof NbaPolicyDecisionSchema>
export type NbaRequestStarted = z.infer<typeof NbaRequestStartedSchema>
export type NbaRequestCompleted = z.infer<typeof NbaRequestCompletedSchema>
export type NbaSignalEvent = z.infer<typeof NbaSignalEventSchema>

export const Agency2RequestStarted = BusEvent.define("agency2.request_started", NbaRequestStartedSchema)
export const Agency2RequestCompleted = BusEvent.define("agency2.request_completed", NbaRequestCompletedSchema)
export const Agency2PolicyDecision = BusEvent.define(
  "agency2.policy_decision",
  NbaPolicyDecisionSchema.extend({ requestId: z.string().uuid() }),
)
export const Agency2SignalEmitted = BusEvent.define("agency2.signal_emitted", NbaSignalEventSchema)

export const NbaDecisionInputSchema = z.object({
  capability: z.string().min(1),
  requestId: z.string().uuid().optional(),
  freshness: StaleRecommendationInputSchema.optional(),
})

// Input for computing injury-adjusted confidence
export const InjuryConfidenceInputSchema = z.object({
  injuries: z.array(z.any()).optional(),
  injuriesFreshnessSeconds: z.number().int().nonnegative().optional(),
})

export type InjuryConfidenceInput = z.infer<typeof InjuryConfidenceInputSchema>

function decideByPolicy(
  capability: string,
  freshness?: z.infer<typeof StaleRecommendationInputSchema>,
): NbaPolicyDecision {
  const policy = NbaAgency.getPolicy(capability)
  const staleBlocked = freshness ? shouldBlockStaleRecommendation(freshness) : false

  if (staleBlocked) {
    return {
      capability,
      policy,
      outcome: "deny",
      reason: "Recommendation denied due to stale required datasets",
      hitlRequired: false,
    }
  }

  if (policy === "DENY") {
    return {
      capability,
      policy,
      outcome: "deny",
      reason: "Capability denied by policy (deny-by-default)",
      hitlRequired: false,
    }
  }

  if (policy === "CONFIRM") {
    return {
      capability,
      policy,
      outcome: "require_hitl",
      reason: "Capability requires human-in-the-loop approval",
      hitlRequired: true,
    }
  }

  return {
    capability,
    policy,
    outcome: "allow",
    reason: "Capability allowed by policy",
    hitlRequired: false,
  }
}

export namespace NbaRuntime {
  export function decide(input: z.input<typeof NbaDecisionInputSchema>): NbaPolicyDecision {
    const parsed = NbaDecisionInputSchema.parse(input)
    const decision = decideByPolicy(parsed.capability, parsed.freshness)
    const requestId = parsed.requestId ?? crypto.randomUUID()
    const startedAtUtc = new Date().toISOString()

    Bus.publish(Agency2RequestStarted, {
      requestId,
      capability: parsed.capability,
      policy: decision.policy,
      startedAtUtc,
    })

    Bus.publish(Agency2PolicyDecision, {
      requestId,
      ...decision,
    })

    Bus.publish(Agency2RequestCompleted, {
      requestId,
      capability: decision.capability,
      policy: decision.policy,
      outcome: decision.outcome,
      reason: decision.reason,
      hitlRequired: decision.hitlRequired,
      completedAtUtc: new Date().toISOString(),
    })

    return decision
  }

  export function emitSignal(input: z.input<typeof SignalSchema>): z.infer<typeof SignalSchema> {
    const signal = SignalSchema.parse({
      ...input,
      confidence: capConfidence(input.confidence),
    })

    Bus.publish(Agency2SignalEmitted, {
      kind: "signal",
      id: signal.signal_id,
      capability: "edge_detection",
      confidence: signal.confidence,
      staleBlocked: signal.stale_blocked,
      emittedAtUtc: new Date().toISOString(),
    })

    return signal
  }

  export function emitRecommendation(
    input: z.input<typeof RecommendationSchema>,
  ): z.infer<typeof RecommendationSchema> {
    const recommendation = RecommendationSchema.parse({
      ...input,
      confidence: capConfidence(input.confidence),
    })

    Bus.publish(Agency2SignalEmitted, {
      kind: "recommendation",
      id: recommendation.recommendation_id,
      capability: "recommendation_report",
      confidence: recommendation.confidence,
      staleBlocked: false,
      emittedAtUtc: recommendation.emitted_at_utc,
    })

    return recommendation
  }

  // Compute confidence adjusted for injury report freshness
  // Critical for betting - stale injury data should reduce confidence
  export function computeAdjustedConfidence(baseConfidence: number, injuryInput?: InjuryConfidenceInput): number {
    if (!injuryInput?.injuries?.length) {
      return baseConfidence
    }

    // Parse injuries through the schema if they're plain objects
    let injuries: Injury[] = injuryInput.injuries as Injury[]

    // Apply injury freshness penalty
    const penalty = NbaOrchestrator.computeInjuryConfidencePenalty(injuries)
    const adjustedConfidence = baseConfidence * (1 - penalty)

    return capConfidence(adjustedConfidence)
  }
}

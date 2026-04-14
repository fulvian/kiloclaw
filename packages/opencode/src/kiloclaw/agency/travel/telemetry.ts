// Travel Agency Telemetry - Events for policy enforcement and fallback tracking
import { z } from "zod"
import { Log } from "@/util/log"
import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"

const log = Log.create({ service: "travel.telemetry" })

// =============================================================================
// Travel Event Schemas
// =============================================================================

/**
 * Emergency Escalation Event
 * Emitted when emergency assistance is triggered requiring human intervention
 */
export const EmergencyEscalationSchema = z.object({
  correlationId: z.string(),
  agencyId: z.string(),
  emergencyType: z.enum(["medical", "theft", "lost_document", "accident", "natural_disaster", "other"]),
  location: z.object({
    city: z.string(),
    country: z.string(),
    lat: z.number().optional(),
    lng: z.number().optional(),
  }),
  urgency: z.enum(["low", "medium", "high", "critical"]),
  triggeredBy: z.string(),
  automatedActionsTaken: z.array(z.string()).default([]),
  escalationReason: z.string(),
  timestamp: z.number(),
})

export type EmergencyEscalation = z.infer<typeof EmergencyEscalationSchema>

/**
 * Travel Booking Link Generated Event
 * Emitted when deep-link booking links are created
 */
export const BookingLinkGeneratedSchema = z.object({
  correlationId: z.string(),
  agencyId: z.string(),
  linkType: z.enum(["flight", "hotel", "activity", "event", "restaurant"]),
  provider: z.string(),
  offerId: z.string(),
  price: z.number(),
  currency: z.string(),
  url: z.string(),
  timestamp: z.number(),
})

export type BookingLinkGenerated = z.infer<typeof BookingLinkGeneratedSchema>

/**
 * Travel HITL Triggered Event
 * Emitted when human-in-the-loop approval is required
 */
export const TravelHITLTriggeredSchema = z.object({
  correlationId: z.string(),
  agencyId: z.string(),
  trigger: z.enum([
    "high_cost",
    "non_refundable",
    "minors",
    "accessibility",
    "medical",
    "embassy",
    "emergency",
    "sensitive_data",
  ]),
  reason: z.string(),
  severity: z.enum(["low", "medium", "high", "critical"]),
  recommendedAction: z.enum(["auto_approve", "confirm_user", "block", "escalate"]),
  metadata: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.number(),
})

export type TravelHITLTriggered = z.infer<typeof TravelHITLTriggeredSchema>

/**
 * Travel Provider Fallback Event
 * Emitted when a travel provider fallback chain is activated
 */
export const TravelProviderFallbackSchema = z.object({
  correlationId: z.string(),
  agencyId: z.string(),
  capability: z.string(),
  primaryProvider: z.string(),
  fallbackProviders: z.array(z.string()),
  finalProvider: z.string(),
  fallbackReason: z.enum(["timeout", "rate_limit", "invalid_data", "auth_error", "quota_exhausted", "not_found"]),
  latencyMs: z.number().nonnegative(),
  timestamp: z.number(),
})

export type TravelProviderFallback = z.infer<typeof TravelProviderFallbackSchema>

// =============================================================================
// Bus Event Definitions
// =============================================================================

export const EmergencyEscalationEvent = BusEvent.define("travel.emergency.escalation", EmergencyEscalationSchema)

export const BookingLinkGeneratedEvent = BusEvent.define("travel.booking.link.generated", BookingLinkGeneratedSchema)

export const TravelHITLTriggeredEvent = BusEvent.define("travel.hitl.triggered", TravelHITLTriggeredSchema)

export const TravelProviderFallbackEvent = BusEvent.define("travel.provider.fallback", TravelProviderFallbackSchema)

// =============================================================================
// Travel Telemetry Namespace
// =============================================================================

export namespace TravelTelemetry {
  /**
   * Record an emergency escalation event
   */
  export async function recordEmergencyEscalation(params: {
    correlationId: string
    emergencyType: EmergencyEscalation["emergencyType"]
    location: { city: string; country: string; lat?: number; lng?: number }
    urgency: EmergencyEscalation["urgency"]
    triggeredBy: string
    automatedActionsTaken?: string[]
    escalationReason: string
  }): Promise<void> {
    const event = {
      correlationId: params.correlationId,
      agencyId: "agency-travel",
      emergencyType: params.emergencyType,
      location: params.location,
      urgency: params.urgency,
      triggeredBy: params.triggeredBy,
      automatedActionsTaken: params.automatedActionsTaken ?? [],
      escalationReason: params.escalationReason,
      timestamp: Date.now(),
    }
    log.warn("travel.emergency.escalation", event)
    await Bus.publish(EmergencyEscalationEvent, event)
  }

  /**
   * Record a booking link generation event
   */
  export async function recordBookingLink(params: {
    correlationId: string
    linkType: BookingLinkGenerated["linkType"]
    provider: string
    offerId: string
    price: number
    currency: string
    url: string
  }): Promise<void> {
    const event = {
      correlationId: params.correlationId,
      agencyId: "agency-travel",
      linkType: params.linkType,
      provider: params.provider,
      offerId: params.offerId,
      price: params.price,
      currency: params.currency,
      url: params.url,
      timestamp: Date.now(),
    }
    log.debug("travel.booking.link.generated", event)
    await Bus.publish(BookingLinkGeneratedEvent, event)
  }

  /**
   * Record a HITL trigger event
   */
  export async function recordHITLTrigger(params: {
    correlationId: string
    trigger: TravelHITLTriggered["trigger"]
    reason: string
    severity: TravelHITLTriggered["severity"]
    recommendedAction: TravelHITLTriggered["recommendedAction"]
    metadata?: Record<string, unknown>
  }): Promise<void> {
    const event = {
      correlationId: params.correlationId,
      agencyId: "agency-travel",
      trigger: params.trigger,
      reason: params.reason,
      severity: params.severity,
      recommendedAction: params.recommendedAction,
      metadata: params.metadata,
      timestamp: Date.now(),
    }
    log.info("travel.hitl.triggered", event)
    await Bus.publish(TravelHITLTriggeredEvent, event)
  }

  /**
   * Record a provider fallback event
   */
  export async function recordProviderFallback(params: {
    correlationId: string
    capability: string
    primaryProvider: string
    fallbackProviders: string[]
    finalProvider: string
    fallbackReason: TravelProviderFallback["fallbackReason"]
    latencyMs: number
  }): Promise<void> {
    const event = {
      correlationId: params.correlationId,
      agencyId: "agency-travel",
      capability: params.capability,
      primaryProvider: params.primaryProvider,
      fallbackProviders: params.fallbackProviders,
      finalProvider: params.finalProvider,
      fallbackReason: params.fallbackReason,
      latencyMs: params.latencyMs,
      timestamp: Date.now(),
    }
    log.warn("travel.provider.fallback", event)
    await Bus.publish(TravelProviderFallbackEvent, event)
  }
}

export const travelTelemetry = TravelTelemetry

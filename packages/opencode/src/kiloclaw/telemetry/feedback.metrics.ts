/**
 * Feedback Telemetry - Metrics for Feedback Loop Quality
 * Phase 5: Eval/Observability/Operations
 * KILOCLAW_PROACTIVE_CONTINUATIVE_AUTOLEARNING_PLAN_2026-04-05.md
 *
 * Provides metrics computed from feedback_events table:
 * - ingestLatency: p95 latency for feedback ingestion
 * - coverageRate: percent of sessions with feedback
 * - upvoteRate: thumb up rate
 * - reasonDistribution: distribution of reason codes
 * - channelDistribution: distribution by channel
 */

import { z } from "zod"
import { Log } from "@/util/log"
import type { FeedbackEvent } from "../memory/memory.schema.sql"

const log = Log.create({ service: "kilocclaw.telemetry.feedback" })

// =============================================================================
// Reason Codes (aligned with feedback/contract.ts)
// =============================================================================

export const ReasonCode = z.enum([
  "wrong_fact",
  "irrelevant",
  "too_verbose",
  "style_mismatch",
  "unsafe",
  "task_failed",
  "task_partial",
  "expectation_mismatch",
  "other",
])
export type ReasonCode = z.infer<typeof ReasonCode>

// =============================================================================
// Channel Types
// =============================================================================

export const ChannelType = z.enum(["cli", "vscode", "api", "implicit", "other"])
export type ChannelType = z.infer<typeof ChannelType>

// =============================================================================
// Metric Schemas
// =============================================================================

export const IngestLatencySchema = z.object({
  p50: z.number().nonnegative(),
  p95: z.number().nonnegative(),
  p99: z.number().nonnegative(),
  sampleCount: z.number().int().nonnegative(),
})
export type IngestLatency = z.infer<typeof IngestLatencySchema>

export const CoverageRateSchema = z.object({
  totalSessions: z.number().int().nonnegative(),
  sessionsWithFeedback: z.number().int().nonnegative(),
  rate: z.number().min(0).max(1),
})
export type CoverageRate = z.infer<typeof CoverageRateSchema>

export const UpvoteRateSchema = z.object({
  total: z.number().int().nonnegative(),
  upvotes: z.number().int().nonnegative(),
  downvotes: z.number().int().nonnegative(),
  rate: z.number().min(0).max(1),
})
export type UpvoteRate = z.infer<typeof UpvoteRateSchema>

export const ReasonDistributionSchema = z.object({
  reasons: z.record(ReasonCode, z.number().int().nonnegative()),
  total: z.number().int().nonnegative(),
})
export type ReasonDistribution = z.infer<typeof ReasonDistributionSchema>

export const ChannelDistributionSchema = z.object({
  channels: z.record(ChannelType, z.number().int().nonnegative()),
  total: z.number().int().nonnegative(),
})
export type ChannelDistribution = z.infer<typeof ChannelDistributionSchema>

// =============================================================================
// FeedbackMetrics Namespace
// =============================================================================

export namespace FeedbackMetrics {
  // Internal state for metrics
  const ingestTimestamps: number[] = []
  const maxLatencySamples = 1000

  /**
   * Record feedback ingestion latency
   */
  export function recordIngestLatency(latencyMs: number): void {
    ingestTimestamps.push(latencyMs)
    if (ingestTimestamps.length > maxLatencySamples) {
      ingestTimestamps.shift()
    }
  }

  /**
   * Calculate p95, p99, p50 latency from recorded samples
   */
  export function calculateIngestLatency(): IngestLatency {
    if (ingestTimestamps.length === 0) {
      return { p50: 0, p95: 0, p99: 0, sampleCount: 0 }
    }

    const sorted = [...ingestTimestamps].sort((a, b) => a - b)
    const count = sorted.length

    const p50Idx = Math.floor(count * 0.5)
    const p95Idx = Math.floor(count * 0.95)
    const p99Idx = Math.floor(count * 0.99)

    return {
      p50: sorted[p50Idx] ?? 0,
      p95: sorted[p95Idx] ?? 0,
      p99: sorted[p99Idx] ?? 0,
      sampleCount: count,
    }
  }

  /**
   * Calculate coverage rate from feedback events
   * Coverage = sessions with feedback / total sessions
   */
  export function calculateCoverageRate(events: FeedbackEvent[]): CoverageRate {
    const uniqueSessions = new Set<string>()
    const sessionsWithFeedback = new Set<string>()

    for (const event of events) {
      if (event.session_id) {
        uniqueSessions.add(event.session_id)
        sessionsWithFeedback.add(event.session_id)
      }
    }

    const totalSessions = uniqueSessions.size
    const withFeedback = sessionsWithFeedback.size
    const rate = totalSessions > 0 ? withFeedback / totalSessions : 0

    return {
      totalSessions,
      sessionsWithFeedback: withFeedback,
      rate,
    }
  }

  /**
   * Calculate upvote rate from feedback events
   */
  export function calculateUpvoteRate(events: FeedbackEvent[]): UpvoteRate {
    const upvotes = events.filter((e) => e.vote === "up").length
    const downvotes = events.filter((e) => e.vote === "down").length
    const total = upvotes + downvotes
    const rate = total > 0 ? upvotes / total : 0

    return {
      total,
      upvotes,
      downvotes,
      rate,
    }
  }

  /**
   * Calculate reason distribution from feedback events
   */
  export function calculateReasonDistribution(events: FeedbackEvent[]): ReasonDistribution {
    const reasons: Record<string, number> = {}

    for (const event of events) {
      const reason = event.reason ?? "other"
      reasons[reason] = (reasons[reason] ?? 0) + 1
    }

    return {
      reasons: reasons as Record<ReasonCode, number>,
      total: events.length,
    }
  }

  /**
   * Calculate channel distribution from feedback events
   */
  export function calculateChannelDistribution(events: FeedbackEvent[]): ChannelDistribution {
    const channels: Record<string, number> = {}

    for (const event of events) {
      const channel = event.channel ?? "other"
      channels[channel] = (channels[channel] ?? 0) + 1
    }

    return {
      channels: channels as Record<ChannelType, number>,
      total: events.length,
    }
  }

  /**
   * Get all feedback metrics from events
   */
  export function getMetrics(events: FeedbackEvent[]): {
    ingestLatency: IngestLatency
    coverageRate: CoverageRate
    upvoteRate: UpvoteRate
    reasonDistribution: ReasonDistribution
    channelDistribution: ChannelDistribution
  } {
    return {
      ingestLatency: calculateIngestLatency(),
      coverageRate: calculateCoverageRate(events),
      upvoteRate: calculateUpvoteRate(events),
      reasonDistribution: calculateReasonDistribution(events),
      channelDistribution: calculateChannelDistribution(events),
    }
  }

  /**
   * Reset all metrics (for testing)
   */
  export function reset(): void {
    ingestTimestamps.length = 0
    log.debug("feedback metrics reset")
  }
}

// =============================================================================
// Exports
// =============================================================================

export const calculateIngestLatency = FeedbackMetrics.calculateIngestLatency
export const calculateCoverageRate = FeedbackMetrics.calculateCoverageRate
export const calculateUpvoteRate = FeedbackMetrics.calculateUpvoteRate
export const calculateReasonDistribution = FeedbackMetrics.calculateReasonDistribution
export const calculateChannelDistribution = FeedbackMetrics.calculateChannelDistribution
export const getFeedbackMetrics = FeedbackMetrics.getMetrics
export const recordIngestLatency = FeedbackMetrics.recordIngestLatency

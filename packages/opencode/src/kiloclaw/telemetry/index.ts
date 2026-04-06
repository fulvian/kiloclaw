/**
 * Telemetry Module - Metrics for Eval/Observability/Operations
 * Phase 5: Eval/Observability/Operations
 * KILOCLAW_PROACTIVE_CONTINUATIVE_AUTOLEARNING_PLAN_2026-04-05.md
 *
 * This module provides telemetry metrics for:
 * - Feedback quality metrics (ingest latency, coverage, upvote rate, reason/channel distribution)
 * - Proactive scheduler metrics (execution success, retry, DLQ, budget, suggestion acceptance)
 * - Learning system metrics (satisfaction delta, irrelevance delta, unsafe incidents, drift, rollbacks)
 */

// =============================================================================
// Feedback Metrics
// =============================================================================

export {
  FeedbackMetrics,
  calculateIngestLatency,
  calculateCoverageRate,
  calculateUpvoteRate,
  calculateReasonDistribution,
  calculateChannelDistribution,
  getFeedbackMetrics,
  recordIngestLatency,
} from "./feedback.metrics"

export type {
  ReasonCode,
  ChannelType,
  IngestLatency,
  CoverageRate,
  UpvoteRate,
  ReasonDistribution,
  ChannelDistribution,
} from "./feedback.metrics"

export {
  IngestLatencySchema,
  CoverageRateSchema,
  UpvoteRateSchema,
  ReasonDistributionSchema,
  ChannelDistributionSchema,
} from "./feedback.metrics"

// =============================================================================
// Proactive Metrics
// =============================================================================

export {
  ProactiveMetrics,
  calculateExecutionSuccessRate,
  calculateRetryRate,
  calculateDlqRate,
  calculateBudgetUtilization,
  calculateSuggestionAcceptanceRate,
  getProactiveMetrics,
  extractRetryCounts,
} from "./proactive.metrics"

export type {
  RunOutcome,
  ExecutionSuccessRate,
  RetryRate,
  DlqRate,
  BudgetUtilization,
  SuggestionAcceptanceRate,
} from "./proactive.metrics"

export {
  ExecutionSuccessRateSchema,
  RetryRateSchema,
  DlqRateSchema,
  BudgetUtilizationSchema,
  SuggestionAcceptanceRateSchema,
} from "./proactive.metrics"

// =============================================================================
// Learning Metrics
// =============================================================================

export {
  LearningMetrics,
  calculateSatisfactionDelta,
  calculateIrrelevanceDelta,
  calculateUnsafeIncidentRate,
  calculateDriftDetectedRate,
  recordRollback,
  getRollbackCount,
  getLearningMetrics,
} from "./learning.metrics"

export type {
  DriftType,
  DriftSeverity,
  SatisfactionDelta,
  IrrelevanceDelta,
  UnsafeIncidentRate,
  DriftDetectedRate,
  RollbackCount,
} from "./learning.metrics"

export {
  SatisfactionDeltaSchema,
  IrrelevanceDeltaSchema,
  UnsafeIncidentRateSchema,
  DriftDetectedRateSchema,
  RollbackCountSchema,
} from "./learning.metrics"

// =============================================================================
// Routing Metrics (L0-L3)
// =============================================================================

export {
  RoutingMetrics,
  RoutingLayer,
  RoutingDecision,
  Layer0DecisionSchema,
  Layer1DecisionSchema,
  Layer2DecisionSchema,
  Layer3DecisionSchema,
  PolicyDeniedSchema,
  FallbackUsedSchema,
  Layer0DecisionEvent,
  Layer1DecisionEvent,
  Layer2DecisionEvent,
  Layer3DecisionEvent,
  PolicyDeniedEvent,
  FallbackUsedEvent,
} from "./routing.metrics"

export type {
  Layer0Decision,
  Layer1Decision,
  Layer2Decision,
  Layer3Decision,
  PolicyDenied,
  FallbackUsed,
} from "./routing.metrics"

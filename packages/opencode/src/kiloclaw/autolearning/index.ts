/**
 * Auto-Learning Module - Governed Learning with Safety Gates
 * Phase 3: Auto-Learning Governed
 * KILOCLAW_PROACTIVE_CONTINUATIVE_AUTOLEARNING_PLAN_2026-04-05.md
 *
 * This module provides:
 * - Feature Store: Extract features from usage/feedback/task outcomes
 * - Trainer: Rule-based lightweight learning algorithms
 * - Validator: Go/No-Go validation before auto-updates
 * - Canary: Controlled rollout for policy/profile updates
 * - Drift Detector: Detection of accuracy/relevance/safety drift
 * - Rollback: Fallback to previous policy/profile versions
 */

// =============================================================================
// Feature Store
// =============================================================================

export {
  FeatureStore,
  extractFromFeedback,
  extractFromTaskOutcome,
  extractFromProactiveAcceptance,
  getFeatures,
  getAggregatedFeature,
  createSnapshot,
  getLatestSnapshot,
  getFeaturesByWindow,
  pruneFeatures,
  getAvailableFeatureNames,
} from "./feature-store"

export type { FeatureName, WindowType, LearningFeature, LearningSnapshot } from "./feature-store"

export { LearningFeatureSchema, LearningSnapshotSchema } from "./feature-store"

// =============================================================================
// Learning Trainer
// =============================================================================

export {
  LearningTrainer,
  updatePreferenceScore,
  updateRetrievalRelevance,
  updateProcedureSuccessRate,
  adjustProactivePriority,
  updateFeedbackUpvoteRate,
  updateWrongFactRate,
  updateIrrelevantRate,
  getCurrentValue,
  getConfidence,
  batchUpdate,
  resetFeature,
} from "./trainer"

export type { LearningSignal, UpdateResult } from "./trainer"

export { LearningSignalSchema, UpdateResultSchema } from "./trainer"

// =============================================================================
// Learning Validator
// =============================================================================

export {
  LearningValidator,
  validateUpdate,
  validateBatch,
  validateCanaryPromotion,
  validateRollback,
  setThresholds,
  getDefaultThresholds,
} from "./validator"

export type { ValidationThresholds, ValidationResult } from "./validator"

export { ValidationThresholdsSchema, ValidationResultSchema } from "./validator"

// =============================================================================
// Canary Release
// =============================================================================

export {
  CanaryRelease,
  startCanary,
  assignToCohort,
  isInCohort,
  recordCanaryHit,
  evaluateCanary,
  promoteCanary,
  rollbackCanary,
  getCanary,
  getActiveCanary,
  getCanaryHistory,
  pruneOldCanaries,
} from "./canary"

export type { CanaryStatus, CanaryUpdateType, CanaryRun, CanaryMetrics } from "./canary"

export { CanaryRunSchema, CanaryMetricsSchema } from "./canary"

// =============================================================================
// Drift Detector
// =============================================================================

export {
  DriftDetector,
  detectDrift,
  recordMetrics,
  createDriftEvent,
  resolveDriftEvent,
  getDriftEvents,
  setBaseline,
  getThresholds,
  updateThresholds,
  resetBaseline,
} from "./drift"

export type { DriftType, DriftSeverity, DriftEvent, DriftReport, DriftThresholds } from "./drift"

export { DriftEventSchema, DriftReportSchema, DriftThresholdsSchema } from "./drift"

// =============================================================================
// Learning Rollback
// =============================================================================

export {
  LearningRollback,
  registerSnapshot,
  rollback,
  getPreviousVersion,
  getAvailableVersions,
  getAuditTrail,
  getCurrentVersion,
  setCurrentVersion,
  pruneSnapshots,
  getRollbackStats,
} from "./rollback"

export type { RollbackTarget, RollbackResult, RollbackAudit } from "./rollback"

export { RollbackTargetSchema, RollbackResultSchema, RollbackAuditSchema } from "./rollback"

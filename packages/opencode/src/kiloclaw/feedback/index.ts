// Feedback Module - Barrel exports
// Phase 1: Feedback Loop End-to-End

// Contract (Phase 0)
export {
  FeedbackContract,
  FeedbackEventSchema,
  FeedbackSummarySchema,
  FeedbackProcessingResultSchema,
  FeedbackReasonCode,
  FeedbackVote,
  FeedbackTargetType,
  FeedbackChannel,
  FeedbackSLO,
  LearningUpdateSchema,
  calculateQualityScore,
  validateFeedbackEvent,
  normalizeFeedback,
  mapExternalReason,
  FEEDBACK_REASON_DESCRIPTIONS,
} from "./contract"
export type {
  FeedbackEvent,
  FeedbackSummary,
  LearningUpdate,
  LearningUpdateType,
  FeedbackProcessingResult,
} from "./contract"

// Processor (Phase 1)
export { FeedbackProcessor, process, getSummary } from "./processor"
export { FeedbackProcessor as processor } from "./processor"

// Learner (Phase 1)
export {
  FeedbackLearner,
  updateUserProfile,
  updateRetrievalSignals,
  updateProcedureStats,
  adjustProactivePolicy,
  extractPatterns,
} from "./learner"
export { FeedbackLearner as learner } from "./learner"

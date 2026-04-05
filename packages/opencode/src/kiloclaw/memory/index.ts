// Kiloclaw Memory 4-Layer - Barrel exports

// Re-export everything from types
export * from "./types.js"

// Memory layers - export both instance and namespace for compatibility
export { workingMemory, WorkingMemory } from "./working.js"
export { episodicMemory, EpisodicMemory } from "./episodic.js"
export { semanticMemory, SemanticMemory } from "./semantic.js"
export { proceduralMemory, ProceduralMemory } from "./procedural.js"

// Broker and lifecycle
export { memoryBroker, MemoryBroker } from "./broker.js"
export { memoryLifecycle, MemoryLifecycle } from "./lifecycle.js"

// Persistence layer (ADR-005) - exports as namespace
export {
  initMemoryRepository,
  WorkingMemoryRepo,
  EpisodicMemoryRepo,
  SemanticMemoryRepo,
  GraphMemoryRepo,
  ProceduralMemoryRepo,
  UserProfileRepo,
  FeedbackRepo,
  AuditRepo,
} from "./memory.repository.js"
export {
  rank,
  rankAndDeduplicate,
  applyBudget,
  DEFAULT_WEIGHTS,
  DEFAULT_THRESHOLDS,
  DEFAULT_BUDGET,
  type RankingWeights,
  type RankingThresholds,
  type RankedItem,
  type TokenBudget,
} from "./memory.ranking.js"
export {
  MemoryRetention,
  DEFAULT_RETENTION,
  type PurgeResult,
  type PurgeReasonCode,
  isExpired,
  shouldRetain,
  computeExpiresAt,
} from "./memory.retention.js"
export {
  MemoryFeedback,
  MemoryLearning,
  type FeedbackPayload,
  type FeedbackReason,
  type FeedbackSummary,
} from "./memory.feedback.js"

// Database initialization and state (ADR-005)
export { MemoryDb } from "./memory.db.js"
export { MemoryState, ensureMemoryInit, memoryShutdown } from "./memory.state.js"
export { MemoryBrokerV2 } from "./memory.broker.v2.js"
export { MemoryBackfill } from "./memory.backfill.js"
export { MemoryEmbedding } from "./memory.embedding.js"
export { MemoryGraph } from "./memory.graph.js"
export { MemoryConsolidation } from "./memory.consolidation.js"
export { MemoryShadow } from "./memory.shadow.js"
export { MemoryMetrics } from "./memory.metrics.js"
export { MemoryIntent } from "./memory.intent.js"
export { MemoryRecallPolicy } from "./memory.recall-policy.js"
export { MemoryInjectionPolicy } from "./memory.injection-policy.js"

// BP-12: Memory Maintenance
export { MemoryMaintenance } from "./memory.maintenance.js"
export type { MaintenanceStats, MaintenanceOptions } from "./memory.maintenance.js"

// BP-14: Memory Packaging
export { MemoryPackager } from "./memory.packager.js"

// BP-15: Tiered Architecture
export { MemoryTierManager, MemoryTier, TIER_CONFIGS } from "./memory.tier.js"
export type { TierConfig, TierStats, TierHealth } from "./memory.tier.js"

// Schema types - only re-export types that don't conflict with types.js
import type {
  WorkingState,
  NewWorkingState,
  MemoryEvent,
  NewMemoryEvent,
  Episode,
  NewEpisode,
  Fact,
  NewFact,
  FactVector,
  NewFactVector,
  Entity,
  NewEntity,
  MemoryEdge,
  NewMemoryEdge,
  Procedure,
  NewProcedure,
  ProcedureVersion,
  NewProcedureVersion,
  UserProfile,
  NewUserProfile,
  FeedbackEvent,
  NewFeedbackEvent,
  MemoryAuditLog,
  NewMemoryAuditLog,
} from "./memory.schema.sql.js"

export type {
  WorkingState,
  NewWorkingState,
  MemoryEvent,
  NewMemoryEvent,
  Episode,
  NewEpisode,
  Fact,
  NewFact,
  FactVector,
  NewFactVector,
  Entity,
  NewEntity,
  MemoryEdge,
  NewMemoryEdge,
  Procedure,
  NewProcedure,
  ProcedureVersion,
  NewProcedureVersion,
  UserProfile,
  NewUserProfile,
  FeedbackEvent,
  NewFeedbackEvent,
  MemoryAuditLog,
  NewMemoryAuditLog,
}

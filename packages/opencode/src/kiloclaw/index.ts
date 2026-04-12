// Kiloclaw Core Runtime - Barrel exports

export * from "./types"
export * from "./agency"
export * from "./agency/index"
export * from "./agent"
export * from "./skill"
export * from "./tool"
export * from "./orchestrator"

// Explicitly export from dispatcher to avoid CorrelationId conflict
export { Dispatcher } from "./dispatcher"
export { CorrelationId } from "./dispatcher"

export * from "./router"
export * from "./registry"
export * from "./config"

// Memory 4-layer - selectively export to avoid MemoryBroker conflict
export {
  MemoryId,
  EpisodeId,
  EventId,
  FactId,
  EmbeddingId,
  EntityId,
  ProcedureId,
  PatternId,
  VersionId,
} from "./memory/types.js"
export type {
  MemoryEntry,
  MemoryQuery,
  SemanticQuery,
  Classification,
  RetentionPolicy,
  RankedResult,
  Layer,
  MemoryBroker,
  WorkingMemory,
  EpisodicMemory,
  SemanticMemory,
  ProceduralMemory,
} from "./memory/types.js"
export { MemoryLifecycle, memoryLifecycle } from "./memory/lifecycle.js"
export { workingMemory, episodicMemory, semanticMemory, proceduralMemory } from "./memory/index.js"

// Memory persistence (ADR-005) - exports for V2 feature
export { MemoryDb } from "./memory/memory.db.js"
export { MemoryState, ensureMemoryInit } from "./memory/memory.state.js"
export { MemoryBrokerV2 } from "./memory/memory.broker.v2.js"
export { getOrchestratorMemory, writeEntry, readEntries, purgeEntry } from "./memory.adapter.js"

// Service health check (ADR-005)
export { ServiceHealth } from "./service-health.js"
export { AuditRepo } from "./memory/memory.repository.js"

// Skills (Wave 1 - Development and Knowledge agencies)
export * from "./skills"

// Proactivity runtime
export {
  TriggerEvaluator,
  Trigger,
  DEFAULT_TRIGGERS,
  TriggerSignal,
  ProactionType,
  BudgetManager,
  BudgetManager$,
  Budget,
  ProactiveScheduler,
  ProactiveScheduler$,
  ProactivityLimitsManager,
  ProactivityLimitsManager$,
  ProactivityLimits,
  ProactivityLimitsSchema,
  ConfirmationMode,
  DEFAULT_PROACTIVITY_LIMITS,
  TaskLedger,
  SchedulerService,
  ProactiveWorker,
  SqliteProactiveStore,
} from "./proactive"
export type {
  TriggerCondition,
  TriggerEvent,
  MatchingResult,
  ProactiveBudget,
  BudgetStats,
  ScheduledTask,
  SchedulerEvent,
  EvaluationResult,
  ProactivityPolicy,
  LedgerTask,
  TaskMeta,
  TaskState,
  ReconcileResult,
  SchedulerTaskInput,
  SchedulerReconcile,
  WorkerResult,
  ProactiveStore,
  StoreRecord,
} from "./proactive"

// Audit modules
export * from "./audit"

// Isolation helpers
export * from "./isolation"

// Native Factory - capability-based routing
export { NativeFactory } from "./tooling/native/factory"
export type { FactoryInput, FactoryOutput } from "./tooling/native/factory"
export type { NativeRuntime } from "./orchestrator"
export { FallbackMetrics } from "./telemetry/fallback.metrics"
export type { FallbackEvent } from "./telemetry/fallback.metrics"

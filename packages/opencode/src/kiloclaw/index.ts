// Kiloclaw Core Runtime - Barrel exports

export * from "./types"
export * from "./agency"
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

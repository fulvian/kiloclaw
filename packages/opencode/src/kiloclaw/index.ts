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

// Skills (Wave 1 - Development and Knowledge agencies)
export * from "./skills"
